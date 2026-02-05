import React, { useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, Keyboard, Dimensions, Linking, Modal, ScrollView, Animated, Alert, LayoutAnimation, Platform, UIManager, RefreshControl, ActivityIndicator } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import AnimatedScreen from '../components/AnimatedScreen';
import CardLoading from '../components/CardLoading';
import SectionPlaceholderCard from '../components/SectionPlaceholderCard';
import SectionSkeleton from '../components/SectionSkeleton';
import SwipeableRow from '../components/SwipeableRow';
import { safeOpenURL } from '../utils/safeOpenURL';
import { getAllStations, getStationByName, searchStations } from '../services/stationsService';
import { getRegionName } from '../utils/regionLabels';
import { getNearbyStations, formatDistance } from '../utils/locationUtils';
import { getRecentStations, saveRecentStation, removeRecentStation, clearRecentStations, overwriteRecentStations } from '../services/recentStationsService';
import { BORDER, GUTTER, HIT_SLOP, INSETS, RADIUS, SPACING, SPACE, TYPE } from '../utils/uiTokens';
import { getStationArrivals, getStationDepartures } from '../services/apiService';
import { cardShadow, floatingShadow, iconButtonShadow, getTrainSiglaColor, getTrainTitleParts } from '../utils/uiStyles';
import { hapticImpact, hapticSelection, hapticModalClose, hapticModalOpen, ImpactFeedbackStyle } from '../utils/haptics';
import useLocationPermission from '../hooks/useLocationPermission';
import { isPermissionGranted } from '../utils/permissions';
import * as Location from 'expo-location';

const { width } = Dimensions.get('window');
const EARLY_COLOR = '#4DA3FF';
const ALLOW_MODAL_TO_MODAL_NAV = true;
const MODAL_HEADER_TOP_OFFSET = SPACING.screenX;
const MAP_HEIGHT = 150;

export default function CercaStazioneScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = Platform.OS === 'ios' ? 76 : 64;
  const bottomPadding = SPACE.xxl + tabBarHeight + insets.bottom;
  const navigation = useNavigation();
  const route = useRoute();
  const stackedFromTrain = route?.params?.stackedFromTrain === true;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedStation, setSelectedStation] = useState(null);
  const [showStationModal, setShowStationModal] = useState(false);
  const [stationModalStacked, setStationModalStacked] = useState(false);
  const [activePage, setActivePage] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const pagerRef = useRef(null);
  const pagerScrollX = useRef(new Animated.Value(0)).current;
  const searchDebounceRef = useRef(null);
  const lastPageRef = useRef(0);
  const departuresListRef = useRef(null);
  const arrivalsListRef = useRef(null);
  const departuresOffsetRef = useRef(0);
  const arrivalsOffsetRef = useRef(0);

  // Stati per location e stazioni
  const { status: locationStatus, granted: locationGranted, syncStatus, requestPermission } = useLocationPermission({ autoCheck: false });
  const locationPermission = locationStatus == null ? null : locationGranted;
  const [userLocation, setUserLocation] = useState(null);
  const [recentStations, setRecentStations] = useState([]);
  const [recentStationsLoaded, setRecentStationsLoaded] = useState(false);
  const [nearbyStations, setNearbyStations] = useState([]);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const [departures, setDepartures] = useState([]);
  const [arrivals, setArrivals] = useState([]);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [boardsError, setBoardsError] = useState('');
  const [mainRefreshing, setMainRefreshing] = useState(false);
  const [stationModalRefreshKey, setStationModalRefreshKey] = useState(0);
  const boardsRequestIdRef = useRef(0);
  const [tabsWidth, setTabsWidth] = useState(0);

  const [undoPayload, setUndoPayload] = useState(null);
  const [undoMessage, setUndoMessage] = useState('');
  const [undoVisible, setUndoVisible] = useState(false);
  const undoAnim = useRef(new Animated.Value(0)).current;
  const undoTimeoutRef = useRef(null);
  const [swipeResetVersion, setSwipeResetVersion] = useState(0);
  const returnToTrainRef = useRef(null);
  const initialStationModalPageRef = useRef(0);

  useEffect(() => {
    const token = route?.params?.prefillToken;
    if (token === null || token === undefined) return;
    const qRaw = route?.params?.prefillQuery;
    if (typeof qRaw !== 'string') return;
    const q = qRaw.trim();
    if (!q) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowStationModal(false);
    setSelectedStation(null);
    setBoardsError('');
    setBoardsLoading(false);
    setDepartures([]);
    setArrivals([]);

    setSearchQuery(q);
    if (q.length >= 2) {
      setSearchResults(searchStations(q, 15));
    } else {
      setSearchResults([]);
    }
  }, [route?.params?.prefillToken]);

  useEffect(() => {
    const token = route?.params?.openStationToken;
    if (token === null || token === undefined) return;
    const nameRaw = route?.params?.openStationName;
    if (typeof nameRaw !== 'string') return;
    const stationName = nameRaw.trim();
    if (!stationName) return;

    const openStationStacked = route?.params?.openStationStacked === true;
    setStationModalStacked(openStationStacked);
    returnToTrainRef.current = route?.params?.returnTrain ? { train: route.params.returnTrain, token: route?.params?.returnTrainToken ?? token } : null;

    const station = getStationByName(stationName);
    if (station) {
      requestAnimationFrame(() => {
        initialStationModalPageRef.current = 0;
        handleSelectStation(station);
      });
      return;
    }

    // fallback: se non troviamo la stazione esatta, almeno precompiliamo la ricerca.
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowStationModal(false);
    setSelectedStation(null);
    setSearchQuery(stationName);
    setSearchResults(searchStations(stationName, 15));
  }, [route?.params?.openStationToken]);

  useEffect(() => {
    const token = route?.params?.reopenStationToken;
    if (token === null || token === undefined) return;
    const station = route?.params?.reopenStation;
    if (!station || typeof station !== 'object') return;
    const page = Number.isFinite(Number(route?.params?.reopenStationPage)) ? Number(route.params.reopenStationPage) : 0;
    initialStationModalPageRef.current = page;
    requestAnimationFrame(() => {
      handleSelectStation(station);
    });
  }, [route?.params?.reopenStationToken]);

  // Richiedi i permessi per la posizione e carica i dati all'avvio
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    initLocationPermission();
    loadRecentStations();
  }, []);

  const initLocationPermission = async () => {
    try {
      const status = await syncStatus();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const granted = isPermissionGranted(status);
      if (granted) {
        getUserLocation();
      } else {
        setNearbyStations([]);
      }
    } catch (error) {
      console.error('Errore nel controllare i permessi per la posizione:', error);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setNearbyStations([]);
    }
  };

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!showStationModal) return;
    const page = Number.isFinite(Number(initialStationModalPageRef.current)) ? Number(initialStationModalPageRef.current) : 0;
    setActivePage(page);
    lastPageRef.current = page;
    departuresOffsetRef.current = 0;
    arrivalsOffsetRef.current = 0;
    requestAnimationFrame(() => {
      pagerRef.current?.scrollToOffset?.({ offset: page * width, animated: false });
      departuresListRef.current?.scrollTo?.({ y: 0, animated: false });
      arrivalsListRef.current?.scrollTo?.({ y: 0, animated: false });
    });
  }, [showStationModal]);

  // Richiedi i permessi per la posizione
  const requestLocationPermission = async () => {
    hapticSelection();
    try {
      const status = await requestPermission();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

      if (isPermissionGranted(status)) {
        getUserLocation();
      } else {
        setNearbyStations([]);
      }
    } catch (error) {
      console.error('Errore nel richiedere i permessi per la posizione:', error);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setNearbyStations([]);
    }
  };

  // Ottieni la posizione dell'utente
  const getUserLocation = async () => {
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setLoadingLocation(true);
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      // Calcola le stazioni vicine
      const allStations = getAllStations();
      const nearby = getNearbyStations(
        location.coords.latitude,
        location.coords.longitude,
        allStations,
        50, // max 50 km
        5   // max 5 stazioni
      );

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setNearbyStations(nearby);
    } catch (error) {
      console.error('Errore nel recuperare la posizione:', error);
    } finally {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setLoadingLocation(false);
    }
  };

  // Carica le stazioni recenti
  const loadRecentStations = async () => {
    const recent = await getRecentStations(5);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRecentStations(recent);
    setRecentStationsLoaded(true);
  };

  const refreshMain = async () => {
    setMainRefreshing(true);
    try {
      await loadRecentStations();
      if (locationPermission === true) {
        await getUserLocation();
      }
    } finally {
      setMainRefreshing(false);
    }
  };

  // Rimuovi una stazione recente
  const showUndoToast = ({ payload, message }) => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    setUndoPayload(payload);
    setUndoMessage(message);
    setUndoVisible(true);
    undoAnim.setValue(0);
    Animated.timing(undoAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();

    undoTimeoutRef.current = setTimeout(() => {
      Animated.timing(undoAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setUndoVisible(false);
        setUndoPayload(null);
        setUndoMessage('');
      });
      undoTimeoutRef.current = null;
    }, 4500);
  };

  const handleUndoDeleteRecentStation = async () => {
    if (!undoPayload) return;
    hapticSelection();

    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    if (undoPayload.kind === 'single' && undoPayload.station) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await saveRecentStation(undoPayload.station);
      await loadRecentStations();
    }

    if (undoPayload.kind === 'all' && Array.isArray(undoPayload.stations)) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await overwriteRecentStations(undoPayload.stations);
      await loadRecentStations();
    }

    // Chiudi eventuali righe rimaste "swipate" dopo il restore
    setSwipeResetVersion((v) => v + 1);

    Animated.timing(undoAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setUndoVisible(false);
      setUndoPayload(null);
      setUndoMessage('');
    });
  };

  const handleDeleteRecentStation = async (station) => {
    if (!station?.id) return;
    hapticImpact(ImpactFeedbackStyle.Medium);
    setRecentStations((prev) => prev.filter((item) => item?.id !== station.id));
    await removeRecentStation(station.id);
    showUndoToast({
      payload: { kind: 'single', station },
      message: station?.name ? `Rimossa “${station.name}”` : 'Stazione rimossa',
    });
  };

  const handleClearRecentStations = () => {
    hapticSelection();
    Alert.alert(
      'Cancella stazioni recenti',
      'Vuoi rimuovere tutte le stazioni recenti?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Cancella',
          style: 'destructive',
          onPress: async () => {
            const previous = Array.isArray(recentStations) ? [...recentStations] : [];
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            await clearRecentStations();
            await loadRecentStations();

            if (Array.isArray(previous) && previous.length > 0) {
              const count = previous.length;
              showUndoToast({
                payload: { kind: 'all', stations: previous },
                message: count === 1 ? '1 stazione recente cancellata' : `${count} stazioni recenti cancellate`,
              });
            }
          },
        },
      ]
    );
  };

  const openAppSettings = async () => {
    hapticSelection();
    try {
      await Linking.openSettings();
    } catch (error) {
      console.error('Errore nell’aprire le Impostazioni:', error);
    }
  };

  const handleSearch = (text) => {
    setSearchQuery(text);
  };

  const handleSelectStation = async (station) => {
    hapticModalOpen();
    // Salva la stazione nelle recenti
    await saveRecentStation(station);
    await loadRecentStations();

    setSelectedStation(station);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
    setShowStationModal(true);
    setStationModalRefreshKey((k) => k + 1);
    Keyboard.dismiss();
  };

  const closeStationModal = () => {
    hapticModalClose();
    setShowStationModal(false);
    setStationModalStacked(false);
    setSelectedStation(null);
    setBoardsError('');
    setBoardsLoading(false);
    setDepartures([]);
    setArrivals([]);

    if (stationModalStacked) {
      return;
    }

    if (stackedFromTrain) {
      requestAnimationFrame(() => {
        navigation.navigate('CercaTreno');
      });
      return;
    }

    const payload = returnToTrainRef.current;
    if (payload?.train) {
      returnToTrainRef.current = null;
      const reopenToken = Date.now();
      requestAnimationFrame(() => {
        navigation.navigate('CercaTreno', { reopenTrain: payload.train, reopenTrainToken: reopenToken });
      });
    }
  };

  const openInMaps = () => {
    if (!selectedStation?.name) return;
    hapticSelection();
    const hasCoords = Number.isFinite(Number(selectedStation?.lat)) && Number.isFinite(Number(selectedStation?.lon));
    const url = hasCoords
      ? `http://maps.apple.com/?q=${encodeURIComponent(selectedStation.name)}&ll=${selectedStation.lat},${selectedStation.lon}`
      : `http://maps.apple.com/?q=${encodeURIComponent(selectedStation.name)}`;
    safeOpenURL(url, { message: 'Impossibile aprire Mappe.' });
  };


  const getTrainTypeLabel = (tipoTreno, categoriaFallback) => {
    const code = String(tipoTreno?.sigla || tipoTreno?.codice || tipoTreno?.nome || categoriaFallback || '').trim().toUpperCase();
    if (!code) return 'TRENO';
    if (code === 'FR' || code === 'FA') return `${code} AV`;
    return code;
  };

  const isSupportedStationCode = (code) => /^S\d{5}$/.test(String(code || '').trim());

  const formatEpochTime = (epochMs) => {
    const n = Number(epochMs);
    if (!Number.isFinite(n) || n <= 0) return '—';
    const d = new Date(n);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const getBoardList = (res) => {
    if (!res) return [];
    if (Array.isArray(res.treni)) return res.treni;
    if (Array.isArray(res.trains)) return res.trains;
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res?.data?.treni)) return res.data.treni;
    if (Array.isArray(res?.data?.trains)) return res.data.trains;
    return [];
  };

  const reloadBoards = async () => {
    if (!showStationModal || !selectedStation?.id) return;
    const stationCode = String(selectedStation.id);
    const requestId = ++boardsRequestIdRef.current;

    if (!isSupportedStationCode(stationCode)) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setBoardsLoading(false);
      setBoardsError('Stazione non supportata per partenze/arrivi (codice non RFI)');
      setDepartures([]);
      setArrivals([]);
      return;
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBoardsLoading(true);
    setBoardsError('');

    try {
      const [depRes, arrRes] = await Promise.all([
        getStationDepartures(stationCode, 'now'),
        getStationArrivals(stationCode, 'now'),
      ]);
      if (requestId !== boardsRequestIdRef.current) return;

      if (depRes?.ok === false) {
        throw new Error(depRes.errore || depRes.error || 'Errore nel recupero partenze');
      }
      if (arrRes?.ok === false) {
        throw new Error(arrRes.errore || arrRes.error || 'Errore nel recupero arrivi');
      }

      const depList = getBoardList(depRes);
      const arrList = getBoardList(arrRes);

      const depRows = depList.map((t, index) => {
        const trainNumber = String(t?.numeroTreno ?? '').trim();
        const destination = t?.destinazione || t?.destinazioneEstera || '—';

        const time =
          t?.orarioPartenzaLeggibile ||
          t?.compOrarioPartenza ||
          formatEpochTime(t?.orarioPartenza ?? t?.partenzaTreno);

        const platformEff = t?.binarioEffettivo ?? t?.binarioEffettivoPartenzaDescrizione;
        const platformProg = t?.binarioProgrammato ?? t?.binarioProgrammatoPartenzaDescrizione;
        const platform = platformEff ?? platformProg ?? null;

        return {
          id: `dep-${trainNumber || index}-${index}`,
          trainType: getTrainTypeLabel(t?.tipoTreno, t?.categoriaDescrizione || t?.categoria),
          trainNumber,
          destination,
          time: time || '—',
          delay: typeof t?.ritardo === 'number' ? t.ritardo : null,
          platform,
          platformConfirmed: Boolean(platformEff),
        };
      });

      const arrRows = arrList.map((t, index) => {
        const trainNumber = String(t?.numeroTreno ?? '').trim();
        const origin = t?.origine || t?.origineEstera || '—';

        const time =
          t?.orarioArrivoLeggibile ||
          t?.compOrarioArrivo ||
          formatEpochTime(t?.orarioArrivo ?? t?.arrivoTreno);

        const platformEff = t?.binarioEffettivo ?? t?.binarioEffettivoArrivoDescrizione;
        const platformProg = t?.binarioProgrammato ?? t?.binarioProgrammatoArrivoDescrizione;
        const platform = platformEff ?? platformProg ?? null;

        return {
          id: `arr-${trainNumber || index}-${index}`,
          trainType: getTrainTypeLabel(t?.tipoTreno, t?.categoriaDescrizione || t?.categoria),
          trainNumber,
          origin,
          time: time || '—',
          delay: typeof t?.ritardo === 'number' ? t.ritardo : null,
          platform,
          platformConfirmed: Boolean(platformEff),
        };
      });

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setDepartures(depRows);
      setArrivals(arrRows);
    } catch (error) {
      if (requestId !== boardsRequestIdRef.current) return;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setBoardsError(error?.message || 'Errore di rete');
      setDepartures([]);
      setArrivals([]);
    } finally {
      if (requestId !== boardsRequestIdRef.current) return;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setBoardsLoading(false);
    }
  };

  useEffect(() => {
    if (!showStationModal || !selectedStation?.id) return;
    reloadBoards();
  }, [showStationModal, selectedStation?.id, stationModalRefreshKey]);

  const clearSearch = () => {
    hapticSelection();
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
    setSelectedStation(null);
  };

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const results = searchStations(q, 15);
      setSearchResults(results);
      setIsSearching(false);
    }, 250);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  const renderStationItem = ({ item }) => {
    const noDivider = item?._noDivider === true;
    return (
      <TouchableOpacity
        style={[
          styles.resultItem,
          {
            backgroundColor: theme.colors.card,
            borderBottomColor: theme.colors.border,
          },
          noDivider ? { borderBottomWidth: 0 } : null,
        ]}
        onPress={() => {
          hapticSelection();
          initialStationModalPageRef.current = 0;
          handleSelectStation(item);
        }}
        activeOpacity={0.6}
      >
        <Ionicons name="location-outline" size={20} color={theme.colors.textSecondary} />
        <View style={styles.resultTextContainer}>
          <Text style={[styles.resultName, { color: theme.colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          {(item.city || item.region) && (
            <Text style={[styles.resultRegion, { color: theme.colors.textSecondary }]}>
              {item.city ? `${item.city}, ${getRegionName(item.region)}` : getRegionName(item.region)}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
      </TouchableOpacity>
    );
  };

  const screenWidth = Dimensions.get('window').width;

  const hasStationCoords =
    Number.isFinite(Number(selectedStation?.lat)) && Number.isFinite(Number(selectedStation?.lon));
  const italyRegion = {
    latitude: 41.8719,
    longitude: 12.5674,
    latitudeDelta: 12,
    longitudeDelta: 12,
  };
  const stationRegion = hasStationCoords
    ? {
      latitude: Number(selectedStation.lat),
      longitude: Number(selectedStation.lon),
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }
    : italyRegion;

  const openTrainFromBoard = (row) => {
    const trainNumber = typeof row?.trainNumber === 'string' ? row.trainNumber.trim() : '';
    if (!trainNumber) return;
    if (!ALLOW_MODAL_TO_MODAL_NAV) return;

    const returnStation = selectedStation ? { ...selectedStation } : null;
    if (!returnStation) return;

    // Se questo modal era stato aperto da un treno, non tornare a quel treno: stiamo aprendo un altro treno.
    returnToTrainRef.current = null;

    initialStationModalPageRef.current = activePage;
    closeStationModal();
    const token = Date.now();
    requestAnimationFrame(() => {
      navigation.navigate('CercaTreno', {
        openTrainNumber: trainNumber,
        openTrainToken: token,
        returnStation,
        returnStationPage: activePage,
      });
    });
  };

  const renderTrainRow = ({ item }, mode) => {
    const trainNumber = typeof item?.trainNumber === 'string' ? item.trainNumber.trim() : '';
    const canOpenTrain = ALLOW_MODAL_TO_MODAL_NAV && Boolean(trainNumber);
    const showDestination = mode === 'departures';
    const primaryLine = showDestination ? item.destination : item.origin;

    const delayNode =
      typeof item.delay === 'number'
        ? item.delay > 0
          ? (
            <View
              style={[
                styles.delayPill,
                { backgroundColor: theme.colors.destructive + '20', borderColor: theme.colors.destructive },
              ]}
            >
              <Text style={[styles.delayPillText, { color: theme.colors.destructive }]}>+{item.delay} min</Text>
            </View>
          )
          : item.delay < 0
            ? (
              <View
                style={[
                  styles.delayPill,
                  { backgroundColor: EARLY_COLOR + '20', borderColor: EARLY_COLOR },
                ]}
              >
                <Text style={[styles.delayPillText, { color: EARLY_COLOR }]}>{item.delay} min</Text>
              </View>
            )
            : (
              <View
                style={[
                  styles.delayPill,
                  { backgroundColor: theme.colors.success + '20', borderColor: theme.colors.success },
                ]}
              >
                <Text style={[styles.delayPillText, { color: theme.colors.success }]}>in orario</Text>
              </View>
            )
        : null;

    return (
      <TouchableOpacity
        style={styles.trainItem}
        activeOpacity={canOpenTrain ? 0.6 : 1}
        onPress={canOpenTrain ? () => openTrainFromBoard(item) : undefined}
        disabled={!canOpenTrain}
      >
        <View style={styles.trainHeader}>
          <View style={styles.trainLeftSection}>
            <View style={styles.trainTypeAndNumber}>
              {(() => {
                const parts = getTrainTitleParts(item.trainType, item.trainNumber);
                if (!parts.sigla && !parts.number) return null;
                return (
                  <>
                    {parts.sigla ? (
                      <Text style={[styles.trainType, { color: getTrainSiglaColor(parts.sigla, theme) }]}>
                        {parts.sigla}
                      </Text>
                    ) : null}
                    {parts.showAv ? (
                      <Text style={[styles.trainAv, { color: theme.colors.textSecondary }]}>AV</Text>
                    ) : null}
                    {parts.number ? (
                      <Text style={[styles.trainNumber, { color: theme.colors.text }]}>
                        {parts.number}
                      </Text>
                    ) : null}
                  </>
                );
              })()}
            </View>
            <View style={styles.trainTimeRow}>
              <Text style={[styles.trainTime, { color: theme.colors.text }]}>{item.time}</Text>
              {delayNode}
            </View>
          </View>

          <View style={styles.trainRightSection}>
            {item.platform ? (
              <View
                style={[
                  styles.platformPill,
                  {
                    backgroundColor: item.platformConfirmed ? theme.colors.accent + '20' : theme.colors.border + '40',
                    borderColor: item.platformConfirmed ? theme.colors.accent : theme.colors.border,
                    borderWidth: BORDER.card,
                  },
                ]}
              >
                <Text style={[styles.platformText, { color: item.platformConfirmed ? theme.colors.accent : theme.colors.textSecondary }]}>
                  {item.platform}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text style={[styles.trainDestination, { color: theme.colors.text }]} numberOfLines={1}>
          {showDestination ? `per ${primaryLine}` : `da ${primaryLine}`}
        </Text>
      </TouchableOpacity>
    );
  };

  const showSearchResults = searchQuery.trim().length >= 2;
  const stationResults = useMemo(() => (Array.isArray(searchResults) ? searchResults : []), [searchResults]);
  const resultsForRender = useMemo(
    () => stationResults.map((s, idx) => ({ ...s, _noDivider: idx === stationResults.length - 1 })),
    [stationResults]
  );
  const canRefreshBoards = Boolean(showStationModal && selectedStation?.id);

  const switchToPage = (page) => {
    if (page === activePage) return;
    hapticSelection();
    setActivePage(page);
    lastPageRef.current = page;
    pagerRef.current?.scrollToOffset?.({ offset: page * screenWidth, animated: true });
  };

  const handleRefreshBoards = () => {
    if (!canRefreshBoards) return;
    hapticSelection();
    setStationModalRefreshKey((k) => k + 1);
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <AnimatedScreen>
        <View style={styles.headerContainer}>
          {/* Search Section */}
          <View style={styles.searchSection}>
            <Text style={[styles.searchSectionTitle, { color: theme.colors.textSecondary }]}>CERCA STAZIONE</Text>

            <View
              style={[
                styles.searchBar,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                },
                cardShadow(theme),
              ]}
            >
              <Ionicons name="search-outline" size={20} color={theme.colors.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: theme.colors.text }]}
                placeholder="Cerca stazione..."
                placeholderTextColor={theme.colors.textSecondary}
                value={searchQuery}
                onChangeText={handleSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {isSearching ? (
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
              ) : searchQuery.length > 0 ? (
                <TouchableOpacity onPress={clearSearch} activeOpacity={0.6}>
                  <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

          </View>
        </View>

        <View style={styles.scrollArea}>
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
            scrollEnabled={scrollEnabled}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              !showSearchResults ? (
                <RefreshControl refreshing={mainRefreshing} onRefresh={refreshMain} tintColor={theme.colors.accent} />
              ) : null
            }
          >
            {showSearchResults ? (
              <View style={styles.resultsContentContainer}>
                <View
                  style={[
                    styles.resultsContainer,
                    { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
                    cardShadow(theme),
                  ]}
                >
                  {resultsForRender.length > 0 ? (
                    resultsForRender.map((item, idx) => (
                      <React.Fragment key={`${String(item.id ?? 'station')}-${idx}`}>{renderStationItem({ item })}</React.Fragment>
                    ))
                  ) : isSearching ? (
                    <View style={styles.resultsEmptyState}>
                      <CardLoading label="Ricerca..." color={theme.colors.accent} textStyle={{ color: theme.colors.textSecondary }} />
                    </View>
                  ) : (
                    <View style={styles.resultsEmptyState}>
                      <Text style={[styles.resultsEmptyTitle, { color: theme.colors.text }]}>Nessun risultato</Text>
                      <Text style={[styles.resultsEmptySubtitle, { color: theme.colors.textSecondary }]}>
                        Prova a scrivere un nome più specifico.
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <>
                {/* Stazioni Recenti */}
                {recentStations.length > 0 ? (
                  <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary, marginBottom: 0, marginLeft: 0 }]}>
                        STAZIONI RECENTI
                      </Text>
                      <TouchableOpacity onPress={handleClearRecentStations} activeOpacity={0.7} hitSlop={HIT_SLOP.sm}>
                        <Text style={[styles.sectionActionText, { color: theme.colors.accent }]}>Cancella</Text>
                      </TouchableOpacity>
                    </View>
                    <View
                      style={[
                        styles.listGroup,
                        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
                        cardShadow(theme),
                      ]}
                    >
                      {recentStations.map((station, index) => (
                        <View key={`${String(station.id ?? 'recent')}-${index}`}>
                          <SwipeableRow
                            theme={theme}
                            onDelete={() => handleDeleteRecentStation(station)}
                            onSwipeStart={() => setScrollEnabled(false)}
                            onSwipeEnd={() => setScrollEnabled(true)}
                            resetKey={swipeResetVersion}
                          >
                            <TouchableOpacity
                              style={styles.listItem}
                              onPress={() => {
                                hapticSelection();
                                initialStationModalPageRef.current = 0;
                                handleSelectStation(station);
                              }}
                              activeOpacity={0.6}
                            >
                              <View style={styles.listItemContent}>
                                <View style={styles.listItemIcon}>
                                  <Ionicons name="location-outline" size={20} color={theme.colors.text} />
                                </View>
                                <View style={styles.listItemText}>
                                  <Text style={[styles.listItemTitle, { color: theme.colors.text }]} numberOfLines={1}>
                                    {station.name}
                                  </Text>
                                  {(station.city || station.region) && (
                                    <Text style={[styles.listItemSubtitle, { color: theme.colors.textSecondary }]}>
                                      {station.city ? `${station.city}, ${getRegionName(station.region)}` : getRegionName(station.region)}
                                    </Text>
                                  )}
                                </View>
                              </View>
                            </TouchableOpacity>
                          </SwipeableRow>
                          {index < recentStations.length - 1 && (
                            <View style={[styles.listDivider, { backgroundColor: theme.colors.border }]} />
                          )}
                        </View>
                      ))}
                    </View>
                  </View>
                ) : recentStationsLoaded ? (
                  <SectionPlaceholderCard
                    title="STAZIONI RECENTI"
                    description="Qui trovi le stazioni consultate di recente, pronte da riaprire con un tap."
                  />
                ) : (
                  <SectionSkeleton title="STAZIONI RECENTI" rows={3} />
                )}

                {/* Stazioni Vicine */}
                {locationPermission === true && (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>STAZIONI VICINE</Text>
                    {loadingLocation ? (
                      <View
                        style={[
                          styles.listGroup,
                          {
                            backgroundColor: theme.colors.card,
                            borderColor: theme.colors.border,
                          },
                          cardShadow(theme),
                        ]}
                      >
                        <CardLoading label="Caricamento..." color={theme.colors.accent} textStyle={{ color: theme.colors.textSecondary }} />
                      </View>
                    ) : nearbyStations.length > 0 ? (
                      <View
                        style={[
                          styles.listGroup,
                          {
                            backgroundColor: theme.colors.card,
                            borderColor: theme.colors.border,
                          },
                          cardShadow(theme),
                        ]}
                      >
                        {nearbyStations.map((station, index) => (
                          <View key={`${String(station.id ?? 'nearby')}-${index}`}>
                            <TouchableOpacity
                              style={styles.listItem}
                              onPress={() => {
                                hapticSelection();
                                initialStationModalPageRef.current = 0;
                                handleSelectStation(station);
                              }}
                              activeOpacity={0.6}
                            >
                              <View style={styles.listItemContent}>
                                <View style={styles.listItemIcon}>
                                  <Ionicons name="location-outline" size={20} color={theme.colors.text} />
                                </View>
                                <View style={styles.listItemText}>
                                  <Text style={[styles.listItemTitle, { color: theme.colors.text }]} numberOfLines={1}>
                                    {station.name}
                                  </Text>
                                  <Text style={[styles.listItemSubtitle, { color: theme.colors.textSecondary }]}>
                                    {station.city ? `${station.city}, ${getRegionName(station.region)}` : getRegionName(station.region)}{' '}
                                    <Text style={{ color: theme.colors.accent }}> ~{formatDistance(station.distance)}</Text>
                                  </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} style={{ opacity: 0.3 }} />
                              </View>
                            </TouchableOpacity>
                            {index < nearbyStations.length - 1 && (
                              <View style={[styles.listDivider, { backgroundColor: theme.colors.border }]} />
                            )}
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.listGroup,
                          {
                            backgroundColor: theme.colors.card,
                            borderColor: theme.colors.border,
                          },
                          cardShadow(theme),
                        ]}
                      >
                        <View style={styles.listItemEmpty}>
                          <Text style={[styles.listItemEmptyText, { color: theme.colors.textSecondary }]}>
                            Nessuna stazione nelle vicinanze
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {locationPermission === false && (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>STAZIONI VICINE</Text>
                    <View
                      style={[
                        styles.listGroup,
                        {
                          backgroundColor: theme.colors.card,
                          borderColor: theme.colors.border,
                        },
                        cardShadow(theme),
                      ]}
                    >
                      <TouchableOpacity style={styles.listItem} onPress={requestLocationPermission} activeOpacity={0.6}>
                        <View style={styles.listItemContent}>
                          <View style={styles.listItemIcon}>
                            <Ionicons name="location" size={22} color={theme.colors.accent} />
                          </View>
                          <View style={styles.listItemText}>
                            <Text style={[styles.listItemTitle, { color: theme.colors.accent }]}>Attiva Servizi di Localizzazione</Text>
                            <Text style={[styles.listItemSubtitle, { color: theme.colors.textSecondary }]}>
                              Per vedere le stazioni nelle vicinanze
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} style={{ opacity: 0.3 }} />
                        </View>
                      </TouchableOpacity>

                      <View style={[styles.listDivider, { backgroundColor: theme.colors.border, marginLeft: 16 }]} />

                      <TouchableOpacity style={styles.listItem} onPress={openAppSettings} activeOpacity={0.6}>
                        <View style={styles.listItemContent}>
                          <View style={styles.listItemIcon}>
                            <Ionicons name="settings-outline" size={22} color={theme.colors.text} />
                          </View>
                          <View style={styles.listItemText}>
                            <Text style={[styles.listItemTitle, { color: theme.colors.text }]}>Apri Impostazioni</Text>
                            <Text style={[styles.listItemSubtitle, { color: theme.colors.textSecondary }]}>
                              Gestisci i permessi di posizione
                            </Text>
                          </View>
                          <Ionicons name="open-outline" size={20} color={theme.colors.textSecondary} style={{ opacity: 0.3 }} />
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            )}
          </ScrollView>

        </View>

        {undoVisible && (
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.undoToastContainer,
              {
                transform: [
                  {
                    translateY: undoAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                    }),
                  },
                ],
                opacity: undoAnim,
              },
            ]}
          >
            <View
              style={[
                styles.undoToast,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                },
                floatingShadow(theme, 'md'),
              ]}
            >
              <Text style={[styles.undoToastText, { color: theme.colors.text }]} numberOfLines={1}>
                {undoMessage}
              </Text>
              {undoPayload ? (
                <TouchableOpacity
                  onPress={handleUndoDeleteRecentStation}
                  activeOpacity={0.75}
                  hitSlop={HIT_SLOP.sm}
                >
                  <Text style={[styles.undoToastAction, { color: theme.colors.accent }]}>
                    ANNULLA
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </Animated.View>
        )}
        </AnimatedScreen>

      {/* Modal stazione */}
      {showStationModal ? (
        <Modal
          visible={true}
          animationType="slide"
          presentationStyle={stationModalStacked || stackedFromTrain ? 'overFullScreen' : 'pageSheet'}
          onRequestClose={closeStationModal}
        >
          <View style={[styles.modalContainer, { backgroundColor: theme.colors.background, flex: 1 }]}>
          {/* Header con X sempre disponibile */}
          <View style={[styles.modalHeader, { backgroundColor: 'transparent', top: MODAL_HEADER_TOP_OFFSET }]}>
            <TouchableOpacity
              onPress={closeStationModal}
              style={[
                styles.closeButton,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  borderWidth: BORDER.card,
                },
                iconButtonShadow(theme),
              ]}
              activeOpacity={0.7}
              hitSlop={HIT_SLOP.md}
            >
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.mapSection, { backgroundColor: theme.colors.card }, cardShadow(theme)]}>
            <MapView
              key={selectedStation?.id || 'italy'}
              style={styles.mapFull}
              provider={PROVIDER_DEFAULT}
              initialRegion={stationRegion}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              {hasStationCoords ? (
                <Marker coordinate={{ latitude: Number(selectedStation.lat), longitude: Number(selectedStation.lon) }} />
              ) : null}
            </MapView>
            {!hasStationCoords ? (
              <View style={[styles.mapFallback, { backgroundColor: theme.colors.card + 'E6' }]}>
                <Text style={[styles.mapFallbackText, { color: theme.colors.textSecondary }]}>
                  Coordinate non disponibili per questa stazione
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={handleRefreshBoards}
              activeOpacity={0.75}
              hitSlop={HIT_SLOP.sm}
              style={[
                styles.closeButton,
                styles.mapRefreshButton,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  borderWidth: BORDER.card,
                  opacity: boardsLoading ? 0.6 : 1,
                },
                iconButtonShadow(theme),
              ]}
              disabled={!canRefreshBoards || boardsLoading}
              accessibilityLabel="Ricarica"
            >
              {boardsLoading ? (
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
              ) : (
                <Ionicons name="refresh" size={18} color={theme.colors.text} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <View style={styles.stationInfoSection}>
              <View style={styles.stationNameRow}>
                <View style={styles.stationTextContainer}>
                  <Text style={[styles.stationName, { color: theme.colors.text }]}>
                    {selectedStation?.name}
                  </Text>
                  {(selectedStation?.city || selectedStation?.region) && (
                    <Text style={[styles.regionLabel, { color: theme.colors.textSecondary }]}>
                      {selectedStation?.city
                        ? `${selectedStation.city}, ${getRegionName(selectedStation.region)}`
                        : getRegionName(selectedStation.region)}
                    </Text>
                  )}
                </View>
                <View style={styles.stationHeaderActions}>
                  <TouchableOpacity
                    style={[styles.navigateButtonInline, { backgroundColor: theme.colors.accent }]}
                    onPress={openInMaps}
                    activeOpacity={0.7}
                    disabled={!selectedStation?.name}
                  >
                    <Ionicons name="navigate" size={18} color={theme.colors.onAccent} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View
              style={[
                styles.tabsContainer,
                { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
                cardShadow(theme),
              ]}
              onLayout={(e) => setTabsWidth(e.nativeEvent.layout.width)}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.tabsIndicator,
                  {
                    width: tabsWidth ? (tabsWidth - 8) / 2 : 0,
                    backgroundColor: theme.colors.accent,
                    transform: [
                      {
                        translateX: tabsWidth
                          ? pagerScrollX.interpolate({
                              inputRange: [0, screenWidth],
                              outputRange: [0, (tabsWidth - 8) / 2],
                              extrapolate: 'clamp',
                            })
                          : 0,
                      },
                    ],
                  },
                ]}
              />
              <TouchableOpacity style={styles.tabButton} activeOpacity={0.7} onPress={() => switchToPage(0)}>
                <Ionicons
                  name="arrow-up-outline"
                  size={16}
                  color={activePage === 0 ? theme.colors.onAccent : theme.colors.textSecondary}
                />
                <Text style={[styles.tabText, { color: activePage === 0 ? theme.colors.onAccent : theme.colors.textSecondary }]}>
                  Partenze
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tabButton} activeOpacity={0.7} onPress={() => switchToPage(1)}>
                <Ionicons
                  name="arrow-down-outline"
                  size={16}
                  color={activePage === 1 ? theme.colors.onAccent : theme.colors.textSecondary}
                />
                <Text style={[styles.tabText, { color: activePage === 1 ? theme.colors.onAccent : theme.colors.textSecondary }]}>
                  Arrivi
                </Text>
              </TouchableOpacity>
            </View>

            <Animated.FlatList
              ref={pagerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              scrollEventThrottle={16}
              data={[{ key: 'partenze' }, { key: 'arrivi' }]}
              keyExtractor={(item) => item.key}
              onMomentumScrollEnd={(event) => {
                const offsetX = event.nativeEvent.contentOffset.x;
                const pageIndex = Math.round(offsetX / screenWidth);
                if (pageIndex !== activePage) {
                  setActivePage(pageIndex);
                  lastPageRef.current = pageIndex;
                }
              }}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: pagerScrollX } } }],
                {
                  useNativeDriver: true,
                  listener: (event) => {
                    const offsetX = event.nativeEvent.contentOffset.x;
                    const pageIndex = offsetX >= screenWidth / 2 ? 1 : 0;
                    if (pageIndex !== lastPageRef.current) {
                      lastPageRef.current = pageIndex;
                      setActivePage(pageIndex);
                    }
                  },
                }
              )}
              renderItem={({ item }) => (
                <View style={{ width: screenWidth, flex: 1 }}>
                  {item.key === 'partenze' ? (
                    <Animated.ScrollView
                      ref={departuresListRef}
                      style={styles.pageScroll}
                      contentContainerStyle={styles.pageScrollContent}
                      showsVerticalScrollIndicator={false}
                      scrollEventThrottle={16}
                      nestedScrollEnabled
                      onScroll={(e) => {
                        departuresOffsetRef.current = e?.nativeEvent?.contentOffset?.y ?? 0;
                      }}
                    >
                      <View
                        style={[
                          styles.trainsCard,
                          { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
                        ]}
                      >
                        <View style={styles.cardListContent}>
                          {boardsLoading ? (
                            <CardLoading label="Caricamento..." color={theme.colors.accent} textStyle={{ color: theme.colors.textSecondary }} />
                          ) : boardsError ? (
                            <View style={styles.boardsEmptyRow}>
                              <Text style={[styles.emptyLabel, { color: theme.colors.destructive }]}>{boardsError}</Text>
                            </View>
                          ) : departures.length === 0 ? (
                            <View style={styles.boardsEmptyRow}>
                              <Text style={[styles.emptyLabel, { color: theme.colors.textSecondary }]}>Nessuna partenza trovata</Text>
                            </View>
                          ) : (
                            departures.map((row, index) => (
                              <View key={String(row.id ?? `dep-${index}`)}>
                                {renderTrainRow({ item: row }, 'departures')}
                                {index < departures.length - 1 ? (
                                  <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
                                ) : null}
                              </View>
                            ))
                          )}
                        </View>
                      </View>
                    </Animated.ScrollView>
                  ) : (
                    <Animated.ScrollView
                      ref={arrivalsListRef}
                      style={styles.pageScroll}
                      contentContainerStyle={styles.pageScrollContent}
                      showsVerticalScrollIndicator={false}
                      scrollEventThrottle={16}
                      nestedScrollEnabled
                      onScroll={(e) => {
                        arrivalsOffsetRef.current = e?.nativeEvent?.contentOffset?.y ?? 0;
                      }}
                    >
                      <View
                        style={[
                          styles.trainsCard,
                          { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
                        ]}
                      >
                        <View style={styles.cardListContent}>
                          {boardsLoading ? (
                            <CardLoading label="Caricamento..." color={theme.colors.accent} textStyle={{ color: theme.colors.textSecondary }} />
                          ) : boardsError ? (
                            <View style={styles.boardsEmptyRow}>
                              <Text style={[styles.emptyLabel, { color: theme.colors.destructive }]}>{boardsError}</Text>
                            </View>
                          ) : arrivals.length === 0 ? (
                            <View style={styles.boardsEmptyRow}>
                              <Text style={[styles.emptyLabel, { color: theme.colors.textSecondary }]}>Nessun arrivo trovato</Text>
                            </View>
                          ) : (
                            arrivals.map((row, index) => (
                              <View key={String(row.id ?? `arr-${index}`)}>
                                {renderTrainRow({ item: row }, 'arrivals')}
                                {index < arrivals.length - 1 ? (
                                  <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
                                ) : null}
                              </View>
                            ))
                          )}
                        </View>
                      </View>
                    </Animated.ScrollView>
                  )}
                </View>
              )}
              style={styles.pager}
            />
          </View>

        </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingTop: SPACING.screenTop,
    paddingHorizontal: SPACING.screenX,
  },
  scrollView: {
    flex: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.screenX,
    paddingBottom: SPACE.xxl,
    paddingTop: SPACE.md,
  },
  resultsContentContainer: {
    paddingTop: 0,
  },
  searchSection: {
    marginBottom: SPACE.md,
  },
  searchSectionTitle: {
    ...TYPE.sectionLabel,
    marginBottom: SPACE.sm,
    marginLeft: SPACING.sectionX,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    gap: SPACE.md,
  },
  searchInput: {
    flex: 1,
    ...TYPE.body,
  },
  resultsContainer: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
  },
  resultsEmptyState: {
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE.lg,
  },
  resultsEmptyTitle: {
    ...TYPE.bodyMedium,
    marginBottom: SPACE.xs,
  },
  resultsEmptySubtitle: {
    ...TYPE.caption,
  },
  resultsFooterNote: {
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderTopWidth: BORDER.hairline,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderBottomWidth: BORDER.hairline,
    gap: SPACE.md,
    position: 'relative',
  },
  resultTextContainer: {
    flex: 1,
  },
  resultName: {
    ...TYPE.bodyMedium,
  },
  resultRegion: {
    ...TYPE.caption,
    marginTop: SPACE.xxs,
  },
  selectedStationCard: {
    marginHorizontal: SPACING.screenX,
    marginTop: SPACE.lg,
    padding: SPACE.xl,
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
  },
  selectedStationHeader: {
    marginBottom: 4,
  },
  selectedStationName: {
    ...TYPE.screenTitle,
  },
  detailLabel: {
    ...TYPE.subheadline,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    ...TYPE.headline,
    marginTop: SPACE.lg,
    marginBottom: SPACE.sm,
  },
  emptyStateSubtitle: {
    ...TYPE.subheadline,
    textAlign: 'center',
    lineHeight: 22,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  mapSection: {
    height: MAP_HEIGHT,
    overflow: 'hidden',
    marginBottom: SPACE.md,
  },
  mapFull: {
    width: '100%',
    height: '100%',
  },
  mapFallback: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
  },
  mapFallbackText: {
    ...TYPE.captionSemibold,
    textAlign: 'center',
  },
  mapRefreshButton: {
    position: 'absolute',
    right: 12,
    top: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeader: {
    position: 'absolute',
    top: SPACE.md,
    left: SPACING.screenX,
    right: SPACING.screenX,
    zIndex: 10,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    flex: 1,
  },
  stationInfoSection: {
    paddingHorizontal: SPACING.screenX,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.sm,
  },
  stationNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  stationHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  stationTextContainer: {
    flex: 1,
  },
  stationName: {
    ...TYPE.screenTitle,
    marginBottom: SPACE.xs,
  },
  regionLabel: {
    ...TYPE.subheadline,
  },
  navigateButtonInline: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsContainer: {
    marginTop: SPACE.xs,
    marginHorizontal: SPACING.screenX,
    borderRadius: RADIUS.pill,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: BORDER.card,
    padding: 4,
  },
  tabsIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: RADIUS.pill,
  },
  tabButton: {
    flex: 1,
    paddingVertical: SPACE.xs,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: SPACE.xs,
    zIndex: 1,
  },
  tabText: {
    ...TYPE.captionSemibold,
    letterSpacing: 0.4,
  },
  pager: {
    flex: 1,
    marginTop: SPACE.md,
  },
  pageScroll: {
    flex: 1,
  },
  pageScrollContent: {
    paddingTop: 0,
    paddingBottom: SPACE.md,
    flexGrow: 1,
  },
  trainsCard: {
    marginHorizontal: SPACING.screenX,
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
  },
  cardListContent: {
    paddingVertical: SPACE.xs,
  },
  boardsEmptyRow: {
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACING.screenX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyLabel: {
    ...TYPE.callout,
    textAlign: 'center',
  },
  trainsContainer: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
  },
  trainItem: {
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACING.screenX,
  },
  trainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.sm,
  },
  trainLeftSection: {
    flex: 1,
  },
  trainRightSection: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  trainTypeAndNumber: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACE.xxs,
    marginBottom: SPACE.xxs,
  },
  trainTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  trainType: {
    fontSize: TYPE.callout.fontSize,
    fontFamily: TYPE.bodySemibold.fontFamily,
    lineHeight: TYPE.callout.lineHeight,
  },
  trainAv: {
    fontSize: TYPE.callout.fontSize,
    fontFamily: TYPE.bodySemibold.fontFamily,
    lineHeight: TYPE.callout.lineHeight,
  },
  delayPill: {
    height: 24,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.pill,
    borderWidth: BORDER.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  delayPillText: {
    ...TYPE.pill,
  },
  platformPill: {
    height: 24,
    minWidth: 32,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 0,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformText: {
    ...TYPE.pill,
    fontFamily: TYPE.titleBold.fontFamily,
  },
  trainNumber: {
    ...TYPE.callout,
    fontFamily: TYPE.titleBold.fontFamily,
  },
  trainTime: {
    fontSize: 18,
    fontFamily: TYPE.bodySemibold.fontFamily,
    flexShrink: 0,
  },
  trainDestination: {
    ...TYPE.subheadline,
  },
  trainFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  platformInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trainPlatform: {
    ...TYPE.caption,
  },
  separator: {
    height: BORDER.hairline,
    marginLeft: SPACE.lg,
  },
  section: {
    marginBottom: SPACE.xxl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.sm,
    marginLeft: SPACING.sectionX,
    marginRight: SPACING.sectionX,
  },
  sectionTitle: {
    ...TYPE.sectionLabel,
    marginBottom: SPACE.sm,
    marginLeft: SPACING.sectionX,
  },
  sectionActionText: {
    ...TYPE.captionSemibold,
  },
  undoToastContainer: {
    position: 'absolute',
    left: SPACING.screenX,
    right: SPACING.screenX,
    bottom: SPACING.screenX,
    zIndex: 100,
  },
  undoToast: {
    borderRadius: RADIUS.button,
    borderWidth: BORDER.card,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  undoToastText: {
    flex: 1,
    ...TYPE.subheadline,
  },
  undoToastAction: {
    ...TYPE.subheadlineMedium,
    letterSpacing: 0.5,
  },
  listGroup: {
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    borderWidth: BORDER.card,
  },
  listItem: {
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    position: 'relative',
  },
  listItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  listItemIcon: {
    width: 28,
    alignItems: 'center',
  },
  listItemText: {
    flex: 1,
  },
  listItemTitle: {
    ...TYPE.title,
    marginBottom: SPACE.xxs,
  },
  listItemSubtitle: {
    ...TYPE.subheadline,
  },
  listDivider: {
    height: BORDER.hairline,
    marginLeft: INSETS.listDividerLeft,
  },
  listItemEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACE.xl,
  },
  listItemEmptyText: {
    ...TYPE.subheadline,
  },
});
