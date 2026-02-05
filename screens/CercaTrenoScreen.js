import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ScrollView,
  Animated,
  Easing,
  LayoutAnimation,
  Alert,
  InteractionManager,
  Platform,
  UIManager,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import AnimatedScreen from '../components/AnimatedScreen';
import SwipeableRow from '../components/SwipeableRow';
import CardLoading from '../components/CardLoading';
import ModernSpinner from '../components/ModernSpinner';
import SectionPlaceholderCard from '../components/SectionPlaceholderCard';
import SectionSkeleton from '../components/SectionSkeleton';
import useInterval from '../hooks/useInterval';
import useTrainStatus from '../hooks/useTrainStatus';
import { BORDER, FONTS, HIT_SLOP, INSETS, RADIUS, SPACE, SPACING, TYPE } from '../utils/uiTokens';
import { cardShadow, floatingShadow, iconButtonShadow, getTrainSiglaColor, getTrainTitleParts } from '../utils/uiStyles';
import { hexToRgba, pickReadableTextColor } from '../utils/color';
import { addMinutesToHHmm, formatDateDDMMYY, formatMinutesLong, minutesUntilEpoch, minutesUntilHHmm } from '../utils/formatters';
import { getStationById, getStationByName } from '../services/stationsService';
import {
  decodeHtmlEntities,
  formatDelay,
  formatTimestamp,
  getJourneyStateColor,
  getTrainStatus,
  TRAIN_AUTO_REFRESH_INTERVAL_MS,
} from '../services/apiService';
import {
  clearRecentTrains,
  getRecentTrains,
  overwriteRecentTrains,
  removeRecentTrain,
  saveRecentTrain,
} from '../services/recentTrainsService';
import { hapticImpact, hapticSelection, hapticModalClose, hapticModalOpen, ImpactFeedbackStyle } from '../utils/haptics';

const ALLOW_MODAL_TO_MODAL_NAV = true;
const MODAL_HEADER_BUTTON_SIZE = 36;
const MODAL_TOP_SPACER_HEIGHT = MODAL_HEADER_BUTTON_SIZE + SPACE.lg;
const MODAL_HEADER_TOP_OFFSET = SPACING.screenX;
const TRAIN_OPERATOR_EXCLUDE_CODES = new Set([
  'FR',
  'FA',
  'IC',
  'ICN',
  'EC',
  'EN',
  'FB',
  'REG',
  'REGIONALE',
  'RV',
  'R',
  'ITA',
  'ITALO',
  'AV',
]);

const normalizeCode = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toUpperCase();
  return s ? s : null;
};

const isLikelyOperatorCode = (value) => {
  const code = normalizeCode(value);
  if (!code) return false;
  if (code === 'RFI') return false;
  if (!/^[A-Z]{2,3}$/.test(code)) return false;
  if (TRAIN_OPERATOR_EXCLUDE_CODES.has(code)) return false;
  return true;
};

export default function CercaTrenoScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const [isMapCentered, setIsMapCentered] = useState(true);
  const [mapExpanded, setMapExpanded] = useState(false);
  const mapHeightAnim = useRef(new Animated.Value(240)).current;
  const { height: screenHeight } = useWindowDimensions();

  const isValidCoord = (coord) =>
    Number.isFinite(coord?.latitude) &&
    Number.isFinite(coord?.longitude) &&
    Math.abs(coord.latitude) > 1 &&
    Math.abs(coord.longitude) > 1;

  const openStationSearchPanel = (stationName) => {
    if (!ALLOW_MODAL_TO_MODAL_NAV) return;
    const q = typeof stationName === 'string' ? stationName.trim() : '';
    if (!q || q === '—') return;
    const token = Date.now();
    hapticSelection();
    returnToStationRef.current = null;
    const returnTrain = selectedTrain ? { ...selectedTrain } : null;
    closeTrainModal({ silent: true });
    requestAnimationFrame(() => {
      navigation.navigate('CercaStazione', {
        openStationToken: token,
        openStationName: q,
        returnTrain,
        returnTrainToken: token,
      });
    });
  };

  useEffect(() => {
    const token = route?.params?.reopenTrainToken;
    const train = route?.params?.reopenTrain;
    if (token === null || token === undefined) return;
    if (!train || typeof train !== 'object') return;
    returnToStationRef.current = null;
    requestAnimationFrame(() => {
      openTrain(train, { refresh: false });
    });
  }, [route?.params?.reopenTrainToken]);

  useEffect(() => {
    const token = route?.params?.openTrainToken;
    if (token === null || token === undefined) return;
    const trainNumberRaw = route?.params?.openTrainNumber;
    const trainNumber = typeof trainNumberRaw === 'string' ? trainNumberRaw.trim() : '';
    if (!trainNumber) return;

    const returnStation = route?.params?.returnStation;
    if (returnStation && typeof returnStation === 'object') {
      returnToStationRef.current = {
        station: returnStation,
        page: Number.isFinite(Number(route?.params?.returnStationPage)) ? Number(route.params.returnStationPage) : 0,
      };
    } else {
      returnToStationRef.current = null;
    }

    pendingOpenTrainRef.current = {
      trainNumber,
      options: {
        epochMs: route?.params?.openTrainEpochMs ?? route?.params?.openTrainTimestampRiferimento ?? null,
        choice: route?.params?.openTrainChoice ?? null,
        originName: route?.params?.openTrainOriginName ?? null,
        technical: route?.params?.openTrainTechnical ?? null,
        originCode: route?.params?.openTrainOriginCode ?? null,
        timestampRiferimento: route?.params?.openTrainTimestampRiferimento ?? null,
        date: route?.params?.openTrainDate ?? null,
        haptics: route?.params?.openTrainHaptics,
        stacked: route?.params?.openTrainStacked === true,
      },
    };

    if (!isFocused) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    InteractionManager.runAfterInteractions(async () => {
      const payload = pendingOpenTrainRef.current;
      if (!payload) return;
      pendingOpenTrainRef.current = null;
      await openTrainWithLoading(payload.trainNumber, payload.options);
    });
  }, [isFocused, route?.params?.openTrainToken]);

  useEffect(() => {
    if (!isFocused) return;
    if (!pendingOpenTrainRef.current) return;
    InteractionManager.runAfterInteractions(async () => {
      const payload = pendingOpenTrainRef.current;
      if (!payload) return;
      pendingOpenTrainRef.current = null;
      await openTrainWithLoading(payload.trainNumber, payload.options);
    });
  }, [isFocused]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchRefreshing, setSearchRefreshing] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchHint, setSearchHint] = useState('');
  const [recentTrains, setRecentTrains] = useState([]);
  const [recentRefreshing, setRecentRefreshing] = useState(false);
  const [recentTrainsLoaded, setRecentTrainsLoaded] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [autoRefreshSetting, setAutoRefreshSetting] = useState(true);

  const [showTrainModal, setShowTrainModal] = useState(false);
  const [trainModalStacked, setTrainModalStacked] = useState(false);
  const [trainModalLoading, setTrainModalLoading] = useState(false);
  const trainModalRefreshingRef = useRef(false);

  const [undoPayload, setUndoPayload] = useState(null);
  const [undoMessage, setUndoMessage] = useState('');
  const [undoVisible, setUndoVisible] = useState(false);
  const undoAnim = useRef(new Animated.Value(0)).current;
  const undoTimeoutRef = useRef(null);
  const [swipeResetVersion, setSwipeResetVersion] = useState(0);
  const searchDebounceRef = useRef(null);
  const lastSearchTokenRef = useRef(0);
  const trainModalLoadTokenRef = useRef(0);
  const skeletonPulseRef = useRef(new Animated.Value(0.35));
  const skeletonLoopRef = useRef(null);
  const infoRevealRef = useRef(new Animated.Value(0));
  const mapRef = useRef(null);
  const mapGestureRef = useRef(false);
  const returnToStationRef = useRef(null);
  const pendingOpenTrainRef = useRef(null);

  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('trainAutoRefresh60s');
        if (!cancelled) {
          setAutoRefreshSetting(stored == null ? true : stored === '1');
        }
      } catch {
        if (!cancelled) {
          setAutoRefreshSetting(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isFocused]);

  const {
    selectedTrain,
    setSelectedTrain,
    trainModalRefreshing,
    trainAutoRefreshing,
    lastTrainRefreshEpochMs,
    setLastTrainRefreshEpochMs,
    refreshSelectedTrain,
    invalidateRefresh,
    resetRefreshing,
  } = useTrainStatus({
    fetchTrainStatus: fetchTrainStatusNormalized,
    onSaveRecent: saveRecentTrain,
    onLoadRecents: loadRecentTrains,
    onSelectionRequired: (normalized) => {
      Alert.alert('Selezione richiesta', normalized?.message || 'Trovati più treni: ripeti la ricerca e scegli una corsa');
    },
    onError: (error) => {
      Alert.alert('Errore', error?.message || 'Errore di rete');
    },
  });

  useEffect(() => {
    trainModalRefreshingRef.current = trainModalRefreshing || trainAutoRefreshing;
  }, [trainModalRefreshing, trainAutoRefreshing]);

  useEffect(() => {
    if (!trainModalLoading) {
      if (skeletonLoopRef.current) {
        skeletonLoopRef.current.stop();
        skeletonLoopRef.current = null;
      }
      return;
    }
    const pulse = skeletonPulseRef.current;
    pulse.setValue(0.35);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.85,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );
    skeletonLoopRef.current = loop;
    loop.start();
    return () => {
      loop.stop();
    };
  }, [trainModalLoading]);

  useEffect(() => {
    const reveal = infoRevealRef.current;
    if (!showTrainModal || trainModalLoading) {
      reveal.setValue(0);
      return;
    }
    Animated.timing(reveal, {
      toValue: 1,
      duration: 380,
      delay: 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [showTrainModal, trainModalLoading, selectedTrain?.id]);

  const autoRefreshEnabled = Boolean(showTrainModal && selectedTrain?.number && !trainModalLoading && autoRefreshSetting);

  useInterval(
    () => {
      if (trainModalRefreshingRef.current) return;
      refreshSelectedTrain(null, { silent: true });
    },
    TRAIN_AUTO_REFRESH_INTERVAL_MS,
    autoRefreshEnabled
  );

  useEffect(() => {
    if (!showTrainModal) return;
    if (!lastTrainRefreshEpochMs) return;

    const animateTo = (map, variant = 'inline') => {
      if (!map) return;
      const stops = Array.isArray(selectedTrain?.stops) ? selectedTrain.stops : [];
      const valid = (c) => isValidCoord(c);
      const currentStop =
        stops.find((s) => s?.isCurrent && valid(s?.coord)) || null;

      const routeCoords = stops.map((s) => s?.coord).filter((c) => valid(c));

      const focus = (() => {
        if (currentStop?.coord) return { kind: 'station', coord: currentStop.coord };
        const first = routeCoords[0] || null;
        if (first) return { kind: 'route', coord: first };
        return null;
      })();

      if (!focus?.coord || !valid(focus.coord)) return;

      const edgePadding =
        variant === 'expanded'
          ? { top: 90, right: 60, bottom: 170, left: 60 }
          : { top: 40, right: 40, bottom: 40, left: 40 };

      if (focus.kind === 'route') {
        if (!routeCoords || routeCoords.length < 2) return;
        try {
          map.fitToCoordinates(routeCoords, { edgePadding, animated: true });
        } catch {
          // ignore
        }
        return;
      }

      const base = { latitude: focus.coord.latitude, longitude: focus.coord.longitude };
      const region = (() => {
        if (focus.kind === 'station') return { ...base, latitudeDelta: 0.08, longitudeDelta: 0.08 };
        return { ...base, latitudeDelta: 0.22, longitudeDelta: 0.22 };
      })();
      try {
        map.animateToRegion(region, 450);
      } catch {
        // ignore
      }
    };

    animateTo(mapRef.current, mapExpanded ? 'expanded' : 'inline');
  }, [showTrainModal, mapExpanded, lastTrainRefreshEpochMs]);


  const getTrainKindLabel = (trainKind) => {
    const categoria = isLikelyOperatorCode(trainKind?.categoria) ? null : trainKind?.categoria;
    const code = String(
      trainKind?.sigla ||
        trainKind?.code ||
        trainKind?.label ||
        trainKind?.codice ||
        trainKind?.nome ||
        categoria ||
        trainKind?.nomeCat ||
        ''
    )
      .trim()
      .toUpperCase();
    if (!code) return null;
    // Richiesto: FR AV / FA AV
    if (code === 'FR' || code === 'FA') return `${code} AV`;
    return code;
  };

  const getTrainOperatorLabel = (trainKind, fallback) => {
    const fromKind = normalizeCode(
      trainKind?.compagnia ||
        trainKind?.company ||
        trainKind?.operator ||
        trainKind?.operatore
    );
    if (fromKind && fromKind !== 'RFI') return fromKind;

    const fromFallback = normalizeCode(
      fallback?.compagnia ||
        fallback?.company ||
        fallback?.operator ||
        fallback?.operatore
    );
    if (fromFallback && fromFallback !== 'RFI') return fromFallback;

    const fromCategoria = normalizeCode(trainKind?.categoria || trainKind?.category);
    if (isLikelyOperatorCode(fromCategoria)) return fromCategoria;

    return null;
  };

  const normalizeKindName = (value) => String(value || '').replace(/\s+/g, '').trim().toUpperCase();

  const getTrainKindFullName = (trainKind, trainTypeLabel) => {
    if (!trainKind) return null;
    const candidates = [];
    if (typeof trainKind === 'string') {
      candidates.push(trainKind);
    } else if (typeof trainKind === 'object') {
      candidates.push(
        trainKind.nomeCat,
        trainKind.nome,
        trainKind.name,
        trainKind.label,
        trainKind.categoriaDescrizione,
        trainKind.descrizione
      );
    }
    const normalizedType = normalizeKindName(trainTypeLabel);
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      const trimmed = candidate.trim();
      if (!trimmed) continue;
      if (normalizeKindName(trimmed) === normalizedType) continue;
      return trimmed;
    }
    return null;
  };

  const normalizePlatformActualValue = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value === 0 ? null : String(value);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed === '—' || trimmed === '0') return null;
    return trimmed;
  };

  const getDelayColors = (delayMinutes) => {
    // Colori preset (coerenti e non dipendenti dal tema)
    const PRESET = {
      late: { fg: '#E17055', bg: 'rgba(225, 112, 85, 0.14)' },
      onTime: { fg: '#00B894', bg: 'rgba(0, 184, 148, 0.14)' },
      early: { fg: '#4DA3FF', bg: 'rgba(77, 163, 255, 0.16)' },
      unknown: { fg: '#B2BEC3', bg: 'rgba(178, 190, 195, 0.14)' },
    };

    if (typeof delayMinutes !== 'number') return PRESET.unknown;
    if (delayMinutes > 0) return PRESET.late;
    if (delayMinutes < 0) return PRESET.early;
    return PRESET.onTime;
  };

  const normalizeServiceStatusLabel = (value) => {
    const text = typeof value === 'string' ? value.trim() : value != null ? String(value).trim() : '';
    if (!text) return null;
    const lower = text.toLowerCase();
    const map = {
      regolare: 'Regolare',
      'in orario': 'Regolare',
      puntuale: 'Regolare',
      irregolare: 'Irregolare',
      sospeso: 'Sospeso',
      cancellato: 'Soppresso',
      soppresso: 'Soppresso',
    };
    if (map[lower]) return map[lower];
    if (text === lower) return text.charAt(0).toUpperCase() + text.slice(1);
    return text;
  };

  const extractServiceStatusLabel = (...sources) => {
    for (const src of sources) {
      if (!src || typeof src !== 'object') continue;
      const raw =
        src.statoServizio ??
        src.serviceStatus ??
        src.serviceState ??
        src.statoServizioRaw ??
        src.serviceStatusRaw ??
        null;
      const normalized = normalizeServiceStatusLabel(raw);
      if (normalized) return normalized;
    }
    return null;
  };

  const getServiceStatusColors = (label) => {
    const text = typeof label === 'string' ? label.trim().toLowerCase() : '';
    if (!text) return getDelayColors(null);
    if (text.includes('regolare') || text.includes('orario') || text.includes('puntuale')) return getDelayColors(0);
    if (text.includes('anticipo')) return getDelayColors(-1);
    if (text.includes('ritard') || text.includes('rallent') || text.includes('irregolar')) return getDelayColors(5);
    if (text.includes('sopp') || text.includes('cancell') || text.includes('sospes')) {
      const c = getJourneyStateColor('CANCELLED');
      return { fg: c, bg: hexToRgba(c, 0.14) };
    }
    if (text.includes('limit') || text.includes('varia') || text.includes('devia')) {
      const c = getJourneyStateColor('PARTIAL');
      return { fg: c, bg: hexToRgba(c, 0.14) };
    }
    return getDelayColors(null);
  };

  const pickPrimaryStatusLabel = (journeyStateCode, journeyStateLabel, serviceStatusLabel) => {
    const code = String(journeyStateCode || '').trim().toUpperCase();
    if (code === 'COMPLETED' || code === 'CANCELLED' || code === 'PLANNED' || code === 'PARTIAL') {
      return journeyStateLabel || null;
    }
    return serviceStatusLabel || journeyStateLabel || null;
  };

  const toTitleCase = (value) => {
    const text = String(value || '').trim();
    if (!text) return null;
    return text
      .split(/\s+/)
      .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
      .join(' ');
  };

  const getOperatorDisplayName = (train) => {
    if (!train || typeof train !== 'object') return null;
    const raw =
      (typeof train.operator === 'string' && train.operator.trim() ? train.operator.trim() : null) ||
      normalizeCode(train.kindCategory) ||
      null;
    if (!raw) return null;
    const upper = raw.toUpperCase();
    const map = {
      TI: 'Trenitalia',
      TN: 'Trenord',
      TTX: 'Trenitalia Tper',
      OBB: 'OBB',
      NTV: 'Nuovo Trasporto Viaggiatori',
    };
    if (map[upper]) return map[upper];
    if (/^[A-Z]{2,5}$/.test(upper)) return upper;
    return toTitleCase(raw) || raw;
  };

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    loadRecentTrains();
  }, []);

  useEffect(() => {
    if (!showTrainModal) return;
    setIsMapCentered(true);
    setMapExpanded(false);
  }, [showTrainModal, selectedTrain?.id]);

  useEffect(() => {
    const collapsedHeight = 240;
    const expandedHeight = Math.min(520, Math.max(320, screenHeight * 0.6));
    const target = mapExpanded ? expandedHeight : collapsedHeight;
    Animated.timing(mapHeightAnim, {
      toValue: target,
      duration: 420,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [mapExpanded, screenHeight, mapHeightAnim]);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = null;
      }
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, []);

  const formatTime = (epochMs, { includeDate = false } = {}) => {
    if (!epochMs) return '—';
    return formatTimestamp(epochMs, includeDate);
  };


  const getTrainDateLabel = (train) => {
    if (!train) return null;
    const fromDate = formatDateDDMMYY(train?.date);
    if (fromDate) return fromDate;
    const fromTs = formatDateDDMMYY(train?.timestampRiferimento ?? train?.referenceEpochMs ?? null);
    return fromTs;
  };

  const buildLastSeenText = ({ stationName, epochMs, fallbackText = null, includeDate = false }) => {
    const station = typeof stationName === 'string' ? stationName.trim() : '';
    const time = epochMs ? formatTime(epochMs, { includeDate }) : '';
    if (time && station) return `${time} - ${station}`;
    if (station) return station;
    if (time) return time;
    return fallbackText;
  };

  const sanitizeRfiPlace = (value) => {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    // RFI spesso usa "PDE XXX" per punti di rilevamento: lo rendiamo più leggibile.
    const cleaned = raw.replace(/^\s*PDE\s+/i, '').trim();
    return cleaned || null;
  };

  const normalizeNextStop = (value) => {
    if (value === null || value === undefined) {
      return { index: null, stationName: null, arrivalHHmm: null, departureHHmm: null, arrivalEstimatedHHmm: null, departureEstimatedHHmm: null };
    }

    if (typeof value === 'string') {
      const stationName = value.trim();
      return {
        index: null,
        stationName: stationName ? stationName : null,
        arrivalHHmm: null,
        departureHHmm: null,
        arrivalEstimatedHHmm: null,
        departureEstimatedHHmm: null,
      };
    }

    if (typeof value === 'object') {
      const normHHmm = (raw) => {
        const s = typeof raw === 'string' ? raw.trim() : '';
        return s && s !== '—' ? s : null;
      };

      const indexRaw = value.indice ?? value.index ?? null;
      const index = Number.isFinite(Number(indexRaw)) ? Number(indexRaw) : null;

      const stationRaw = value.stazione ?? value.station ?? value.stationName ?? value.nome ?? value.name ?? null;
      const stationName = stationRaw != null ? String(stationRaw).trim() : '';

      const arrivalPlannedRaw =
        value.arrivoProgrammato ??
        value.arrivalScheduled ??
        value.orarioArrivoProgrammato ??
        value.orarioArrivoTeorico ??
        value.orari?.arrivo?.hhmm?.programmato ??
        value.orari?.arrivo?.programmato ??
        value.arrivo ??
        value.arrival ??
        value.orarioArrivo ??
        null;
      const arrivalEstimatedRaw =
        value.arrivoPrevisto ??
        value.arrivoProbabile ??
        value.arrivalEstimated ??
        value.arrivalPredicted ??
        value.orarioArrivoPrevisto ??
        value.orarioArrivoProbabile ??
        value.orari?.arrivo?.hhmm?.probabile ??
        value.orari?.arrivo?.probabile ??
        null;

      const departurePlannedRaw =
        value.partenzaProgrammato ??
        value.departureScheduled ??
        value.orarioPartenzaProgrammato ??
        value.orarioPartenzaTeorico ??
        value.orari?.partenza?.hhmm?.programmato ??
        value.orari?.partenza?.programmato ??
        value.partenza ??
        value.departure ??
        value.orarioPartenza ??
        null;
      const departureEstimatedRaw =
        value.partenzaPrevista ??
        value.partenzaPrevisto ??
        value.partenzaProbabile ??
        value.departureEstimated ??
        value.departurePredicted ??
        value.orarioPartenzaPrevista ??
        value.orarioPartenzaPrevisto ??
        value.orarioPartenzaProbabile ??
        value.orari?.partenza?.hhmm?.probabile ??
        value.orari?.partenza?.probabile ??
        null;

      const arrivalHHmm = normHHmm(arrivalPlannedRaw);
      const departureHHmm = normHHmm(departurePlannedRaw);
      const arrivalEstimatedHHmm = normHHmm(arrivalEstimatedRaw);
      const departureEstimatedHHmm = normHHmm(departureEstimatedRaw);

      return {
        index,
        stationName: stationName ? stationName : null,
        arrivalHHmm,
        departureHHmm,
        arrivalEstimatedHHmm,
        departureEstimatedHHmm,
      };
    }

    const stationName = String(value).trim();
    return {
      index: null,
      stationName: stationName ? stationName : null,
      arrivalHHmm: null,
      departureHHmm: null,
      arrivalEstimatedHHmm: null,
      departureEstimatedHHmm: null,
    };
  };

  const normalizeStopReference = (value) => {
    if (!value || typeof value !== 'object') {
      return { index: null, stationName: null, arrivalRealHHmm: null, departureRealHHmm: null };
    }

    const indexRaw = value.indice ?? value.index ?? value.progressivo ?? value.progressive ?? null;
    const index = Number.isFinite(Number(indexRaw)) ? Number(indexRaw) : null;

    const stationRaw = value.stazione ?? value.station ?? value.stationName ?? value.nome ?? value.name ?? null;
    const stationName = stationRaw != null ? String(stationRaw).trim() : '';

    const arrivoRealeRaw =
      value.arrivoReale ?? value.arrivalReal ?? value.orarioArrivoReale ?? value.orari?.arrivo?.hhmm?.reale ?? value.orari?.arrivo?.reale ?? null;
    const partenzaRealeRaw =
      value.partenzaReale ??
      value.departureReal ??
      value.orarioPartenzaReale ??
      value.orari?.partenza?.hhmm?.reale ??
      value.orari?.partenza?.reale ??
      null;

    const arrivalRealHHmm = typeof arrivoRealeRaw === 'string' ? arrivoRealeRaw.trim() : null;
    const departureRealHHmm = typeof partenzaRealeRaw === 'string' ? partenzaRealeRaw.trim() : null;

    return {
      index,
      stationName: stationName ? stationName : null,
      arrivalRealHHmm: arrivalRealHHmm && arrivalRealHHmm !== '—' ? arrivalRealHHmm : null,
      departureRealHHmm: departureRealHHmm && departureRealHHmm !== '—' ? departureRealHHmm : null,
    };
  };

  const buildStopTiming = ({ scheduledEpoch, actualEpoch, delayMinutes }) => {
    const sched = scheduledEpoch ?? null;
    const actual = actualEpoch ?? null;
    const delay = Number.isFinite(Number(delayMinutes)) ? Number(delayMinutes) : null;
    const predictedEpoch = sched && delay != null ? sched + delay * 60000 : null;

    return {
      scheduledEpoch: sched,
      predictedEpoch,
      actualEpoch: actual,
      scheduled: sched ? formatTime(sched) : '—',
      predicted: predictedEpoch ? formatTime(predictedEpoch) : '—',
      actual: actual ? formatTime(actual) : '—',
      delayMinutes: delay,
    };
  };

  const buildStopTimingFromStrings = ({ scheduled, predicted, actual, delayMinutes }) => {
    const norm = (v) => {
      const s = typeof v === 'string' ? v.trim() : '';
      return s ? s : '—';
    };

    return {
      scheduledEpoch: null,
      predictedEpoch: null,
      actualEpoch: null,
      scheduled: norm(scheduled),
      predicted: norm(predicted),
      actual: norm(actual),
      delayMinutes: Number.isFinite(Number(delayMinutes)) ? Number(delayMinutes) : null,
    };
  };

  const parseDelayMinutes = (computed, data) => {
    if (typeof computed?.globalDelay === 'number') return computed.globalDelay;
    if (typeof data?.ritardo === 'number') return data.ritardo;
    const delta = computed?.deltaTempo;
    if (typeof delta === 'string') {
      const trimmed = delta.trim();
      if (/^[+-]?\d+$/.test(trimmed)) return Number(trimmed);
    }
    return null;
  };

	  const mapStatoTrenoToJourneyState = (statoTreno) => {
	    const s = String(statoTreno || '').trim().toLowerCase();
	    if (!s) return { state: null, label: null };

    if (
      s === 'programmato' ||
      s === 'pianificato' ||
      s === 'pianificata' ||
      s === 'non partito' ||
      s === 'non_partito'
    ) {
      return { state: 'PLANNED', label: 'Programmato' };
    }
	    if (s === 'in stazione' || s === 'fermo in stazione') return { state: 'RUNNING', label: 'In stazione' };
	    if (
	      s === 'partito' ||
	      s === 'in viaggio' ||
	      s === 'in_viaggio' ||
      s === 'inviaggio' ||
      s === 'in corsa' ||
      s === 'in_corsa' ||
      s === 'running'
    ) {
      return { state: 'RUNNING', label: 'In viaggio' };
    }
    if (s === 'concluso' || s === 'arrivato' || s === 'completato' || s === 'completed' || s === 'terminato') {
      return { state: 'COMPLETED', label: 'Completato' };
    }
    if (s === 'soppresso' || s === 'cancellato' || s === 'cancelled') return { state: 'CANCELLED', label: 'Soppresso' };
    if (s === 'parziale' || s === 'limitato' || s === 'partial' || s === 'variato') {
      return { state: 'PARTIAL', label: 'Variazione di percorso' };
    }
    return { state: 'UNKNOWN', label: 'Sconosciuto' };
  };

  const normalizeTrainStatusResponse = (raw, fallbackTrainNumber, context = {}) => {
    if (!raw) {
      return { kind: 'empty', message: 'Nessun risultato' };
    }
    if (raw.ok === false) {
      return { kind: 'error', message: raw.errore || raw.error || 'Errore dal backend' };
    }

    const needsSelection = Boolean(
      raw.richiestaSelezione ||
        raw.needsSelection ||
        raw.requireSelection ||
        raw.selectionRequired ||
        raw.selezioneRichiesta
    );
    const options =
      raw.opzioni ||
      raw.options ||
      raw.choices ||
      raw.sclete ||
      raw.data?.opzioni ||
      raw.data?.options ||
      raw.data?.choices;
    const dateOptions =
      raw.dateDisponibili ||
      raw.dateSuggerite ||
      raw.availableDates ||
      raw.suggestedDates ||
      raw.data?.dateDisponibili ||
      raw.data?.dateSuggerite ||
      raw.data?.availableDates ||
      raw.data?.suggestedDates;

    const isSmartValue = (value) => {
      if (value === true) return true;
      if (typeof value === 'number') return value > 0;
      if (typeof value !== 'string') return false;
      const normalized = value.trim().toLowerCase();
      if (!normalized || normalized === '0' || normalized === 'false' || normalized === 'no') return false;
      return normalized === '1' || normalized === 'true' || normalized.includes('smart');
    };

    const hasExecutiveFeature = (stop) => stop?.carrozzaExecutive != null || stop?.executivePosition != null;

    const getExecutivePosition = (stop) => {
      const raw = stop?.carrozzaExecutive ?? stop?.executivePosition ?? null;
      if (raw === null || raw === undefined) return null;
      const text = String(raw).trim();
      return text || null;
    };

    const hasSmartFeature = (stop) => {
      if (!stop || typeof stop !== 'object') return false;
      if (isSmartValue(stop.ambienteSmart)) return true;
      if (isSmartValue(stop.carrozzaSmart)) return true;
      if (isSmartValue(stop.smart)) return true;
      if (typeof stop.ambiente === 'string' && stop.ambiente.trim().toLowerCase() === 'smart') return true;
      if (typeof stop.ambienteCommerciale === 'string' && stop.ambienteCommerciale.trim().toLowerCase() === 'smart') return true;
      return false;
    };

    const getStopStatusInfo = (stop) => {
      if (!stop || typeof stop !== 'object') {
        return { isExtraStop: false, isSuppressedByStatus: false, status: null };
      }
      const rawStatus =
        stop.statoFermata ??
        stop.statoFermataRfi ??
        stop.stato ??
        stop.status ??
        stop.statusFermata ??
        null;
      const status = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';
      const isSuppressedByStatus =
        stop.fermataSoppressa === true ||
        stop.soppressa === true ||
        stop.isSoppressa === true ||
        stop.cancellata === true ||
        stop.isCancelled === true ||
        status === 'soppressa' ||
        status === 'soppresso' ||
        status === 'cancellata' ||
        status === 'cancellato';
      const isExtraStop =
        !isSuppressedByStatus &&
        (stop.fermataStraordinaria === true ||
          stop.straordinaria === true ||
          stop.isStraordinaria === true ||
          status === 'straordinaria' ||
          status === 'straordinario' ||
          status === 'extra');

      return { isExtraStop, isSuppressedByStatus, status: status || null };
    };

    if (
      needsSelection &&
      (!Array.isArray(options) || options.length === 0) &&
      (!Array.isArray(dateOptions) || dateOptions.length === 0)
    ) {
      return {
        kind: 'error',
        message: raw.messaggio || raw.message || 'Selezione richiesta dal backend ma opzioni mancanti',
      };
    }

    if (needsSelection && Array.isArray(options) && options.length > 0) {
      const mapped = options
        .map((o) => ({
          label: (() => {
            const direct = o.etichetta || o.label || o.title || o.origine || o.originName || o.data || o.date || null;
            if (direct) return formatDateDDMMYY(direct) || String(direct);

            const ts = o.timestampRiferimento || o.timestampReference || o.epochMs || o.referenceTimestamp || o.timestamp || null;
            const formattedTs = ts != null ? formatDateDDMMYY(ts) : null;
            if (formattedTs) return formattedTs;

            if (o.choice !== undefined && o.choice !== null) return `Choice ${o.choice}`;
            const tech = o.idTecnico || o.technical || '';
            return tech ? String(tech) : null;
          })(),
          choice: o.choice ?? null,
          originName: o.origine || o.originName || null,
          technical: o.idTecnico || o.technical || o.technicalId || null,
          originCode: o.codiceOrigine || o.originCode || o.codLocOrig || null,
          date: o.data || o.date || null,
          timestampRiferimento: o.timestampRiferimento ?? o.timestampReference ?? null,
          epochMs: o.timestampRiferimento || o.epochMs || o.referenceTimestamp || o.timestamp || null,
        }))
        .filter((o) => o.choice !== null || o.technical || o.timestampRiferimento != null || o.date != null || o.originName || o.originCode);
      return {
        kind: 'selection',
        message: raw.messaggio || raw.message || 'Trovati più treni con questo numero',
        options: mapped,
      };
    }

    if (needsSelection && Array.isArray(dateOptions) && dateOptions.length > 0) {
      const mapped = dateOptions
        .map((o) => {
          const date = o.data || o.date || null;
          const ts = o.timestamp ?? o.timestampRiferimento ?? o.timestampReference ?? null;
          const label = (() => {
            const direct = o.label || date;
            if (direct) return formatDateDDMMYY(direct) || String(direct);
            if (ts == null) return null;
            return formatDateDDMMYY(ts);
          })();

          return {
            label,
            choice: null,
            originName: null,
            technical: null,
            originCode: null,
            date,
            timestampRiferimento: ts,
            epochMs: ts,
          };
        })
        .filter((o) => o.date || o.timestampRiferimento != null);

      return {
        kind: 'selection',
        message: raw.messaggio || raw.message || 'Seleziona una data',
        options: mapped,
      };
    }

    // === NUOVO FORMATO backend: raw.principali ===
    const principali = raw.principali || raw?.data?.principali || null;
    if (principali && (principali.numeroTreno || principali.numeroTreno === 0)) {
      const trainNumber = String(principali.numeroTreno || fallbackTrainNumber || '').trim();
      if (!trainNumber) {
        return { kind: 'empty', message: 'Nessun treno trovato' };
      }

      const trainKind = principali.tipoTreno || null;
      const trainTypeLabel = getTrainKindLabel(trainKind) || String(principali.codiceTreno || '').trim() || 'TRENO';
      const trainKindFullName = getTrainKindFullName(trainKind, trainTypeLabel);
      const trainOperator = getTrainOperatorLabel(trainKind, principali);
      const serviceStatusLabel = extractServiceStatusLabel(principali, principali?.statoTreno, raw);
      const delayMinutes = typeof principali.ritardoMinuti === 'number' ? principali.ritardoMinuti : null;

      const from = principali.tratta?.origine || null;
      const to = principali.tratta?.destinazione || null;

      const ultimoRil = principali.ultimoRil || principali.ultimoRilevamento || null;
      const lastSeenEpochMs =
        ultimoRil?.timestamp ??
        ultimoRil?.timestampMs ??
        ultimoRil?.epochMs ??
        null;
      const lastSeenStationName =
        sanitizeRfiPlace(decodeHtmlEntities(ultimoRil?.luogo ?? null)) || null;
      const lastDetectionText =
        buildLastSeenText({
          stationName: lastSeenStationName,
          epochMs: lastSeenEpochMs,
          fallbackText: sanitizeRfiPlace(decodeHtmlEntities(ultimoRil?.testo) || null) || null,
        }) || null;

      const journeyFromObject = principali.statoViaggio || principali.journeyState || null;
      const journeyFromString = mapStatoTrenoToJourneyState(principali.statoTreno || principali.stato || null);
      let journeyStateCode = journeyFromObject?.stato || journeyFromObject?.state || journeyFromString.state || null;
      let journeyStateLabel = journeyFromObject?.etichetta || journeyFromObject?.label || journeyFromString.label || null;

      const isSoppressoByFlag =
        principali.isSoppresso === true ||
        principali.trenoSoppresso === true ||
        principali.soppresso === true ||
        principali.cancellato === true ||
        principali.cancelled === true;
      const isVariatoByFlag = principali.isVariato === true || principali.variato === true || principali.parziale === true;

      if (isSoppressoByFlag) {
        journeyStateCode = 'CANCELLED';
        journeyStateLabel = 'Soppresso';
      } else if (isVariatoByFlag && journeyStateCode !== 'COMPLETED') {
        journeyStateCode = 'PARTIAL';
        journeyStateLabel = journeyStateLabel || 'Variazione';
      }

      const nextStopRaw =
        principali.prossimaFermata ||
        principali.fermataSuccessiva ||
        principali.successivaFermata ||
        principali.nextStop ||
        principali.tratta?.prossimaFermata ||
        principali.tratta?.nextStop ||
        null;
      const concludedByBackend =
        journeyStateCode === 'COMPLETED' ||
        journeyFromString.state === 'COMPLETED' ||
        journeyFromObject?.stato === 'COMPLETED' ||
        journeyFromObject?.state === 'COMPLETED';
      if ((nextStopRaw === null || nextStopRaw === undefined) && concludedByBackend) {
        journeyStateCode = 'COMPLETED';
        journeyStateLabel = journeyStateLabel || 'Completato';
      }
      const nextStop = normalizeNextStop(nextStopRaw);
      const nextStopName = decodeHtmlEntities(nextStop.stationName) || null;
      const nextStopIndex = nextStop.index;
      const nextStopArrivalPlanned = nextStop.arrivalHHmm;
      const nextStopDeparturePlanned = nextStop.departureHHmm;
      const nextStopArrivalEstimated =
        nextStop.arrivalEstimatedHHmm ||
        (nextStopArrivalPlanned && delayMinutes != null ? addMinutesToHHmm(nextStopArrivalPlanned, delayMinutes) : null);
      const nextStopDepartureEstimated =
        nextStop.departureEstimatedHHmm ||
        (nextStopDeparturePlanned && delayMinutes != null ? addMinutesToHHmm(nextStopDeparturePlanned, delayMinutes) : null);

      const previousStopRaw =
        nextStopRaw?.precedente ||
        nextStopRaw?.precedenteFermata ||
        nextStopRaw?.previous ||
        principali.fermataPrecedente ||
        principali.precedenteFermata ||
        principali.previousStop ||
        null;
      const previousStop = normalizeStopReference(previousStopRaw);
      const previousStopName = decodeHtmlEntities(previousStop.stationName) || null;

      const departureTiming = buildStopTimingFromStrings({
        scheduled: principali.orari?.partenza?.programmato,
        predicted: principali.orari?.partenza?.probabile,
        actual: principali.orari?.partenza?.reale,
        delayMinutes,
      });

      const arrivalTiming = buildStopTimingFromStrings({
        scheduled: principali.orari?.arrivo?.programmato,
        predicted: principali.orari?.arrivo?.probabile,
        actual: principali.orari?.arrivo?.reale,
        delayMinutes,
      });

      const rfiMessage =
        decodeHtmlEntities(principali.aggiornamentoRfi ?? principali.messaggioRfi ?? principali.messaggio ?? null) || null;

      const buildTiming = (block) => {
        const schedEpoch = typeof block?.programmato === 'number' ? block.programmato : null;
        const predEpoch = typeof block?.probabile === 'number' ? block.probabile : null;
        const actualEpoch = typeof block?.reale === 'number' ? block.reale : null;
        const delay =
          Number.isFinite(Number(block?.delayMinuti)) ? Number(block.delayMinuti) : (delayMinutes != null ? delayMinutes : null);

        if (schedEpoch || predEpoch || actualEpoch) {
          return {
            scheduledEpoch: schedEpoch,
            predictedEpoch: predEpoch,
            actualEpoch,
            scheduled: schedEpoch ? formatTime(schedEpoch) : '—',
            predicted: predEpoch ? formatTime(predEpoch) : '—',
            actual: actualEpoch ? formatTime(actualEpoch) : '—',
            delayMinutes: delay,
          };
        }

        return buildStopTimingFromStrings({
          scheduled: block?.hhmm?.programmato,
          predicted: block?.hhmm?.probabile,
          actual: block?.hhmm?.reale,
          delayMinutes: delay,
        });
      };

      const isInStationByFlag = principali.inStazione === true || principali.isInStazione === true || principali.isInStation === true;
      const currentStationByFlag = decodeHtmlEntities(principali.stazioneCorrente ?? principali.currentStation ?? null) || null;
      const looksLikeNonStation = (name) => {
        const s = typeof name === 'string' ? name.trim() : '';
        if (!s) return false;
        return /\bpde\b/i.test(s);
      };
      const shouldMarkCurrentStop = journeyStateCode === 'RUNNING' || isInStationByFlag;
      const currentStopIndexByFlag = isInStationByFlag && previousStop.index != null ? previousStop.index : null;
      const currentStopNameForMatch = (() => {
        if (!shouldMarkCurrentStop) return null;
        if (currentStationByFlag) return currentStationByFlag;
        if (previousStopName) return previousStopName;
        // Se siamo in stazione e non abbiamo precedente (prima fermata), usiamo l'origine come stazione corrente.
        if (isInStationByFlag && from) return String(from).trim();
        return null;
      })();

      const fermate = Array.isArray(principali.fermate) ? principali.fermate : [];
      const hasExecutive = hasExecutiveFeature(principali) || fermate.some(hasExecutiveFeature);
      const hasSmart = hasSmartFeature(principali) || fermate.some(hasSmartFeature);
      const stops = fermate.map((f, idx) => {
        const stationName = typeof f?.stazione === 'string' ? f.stazione.trim() : '';
        const station = stationName ? getStationByName(stationName) : null;
        const stationCode = station?.id || null;
        const coord = station?.lat != null && station?.lon != null ? { latitude: station.lat, longitude: station.lon } : null;

        const arrival = buildTiming(f?.orari?.arrivo);
        const departure = buildTiming(f?.orari?.partenza);

        const platformPlanned = f?.binari?.partenza?.programmato ?? null;
        const platformActual = normalizePlatformActualValue(f?.binari?.partenza?.reale ?? null);

        const statusInfo = getStopStatusInfo(f);
        const tipoFermata = typeof f?.tipoFermata === 'string' ? f.tipoFermata.trim().toUpperCase() : '';
        const isSuppressedStop =
          statusInfo.isSuppressedByStatus ||
          tipoFermata === 'S' ||
          tipoFermata === 'SOPPRESSA' ||
          tipoFermata === 'SOPPRESSO';

        const isCurrent =
          currentStopIndexByFlag != null
            ? idx === currentStopIndexByFlag
            : currentStopNameForMatch && stationName
              ? stationName.toLowerCase() === String(currentStopNameForMatch).trim().toLowerCase()
              : false;

        return {
          id: stationCode || stationName || `${trainNumber}-${idx}`,
          stationCode,
          name: stationName || station?.name || stationCode || '—',
          coord,
          isCurrent,
          arrival,
          departure,
          platformPlanned,
          platformActual,
          platformChanged:
            (platformPlanned != null &&
              platformActual != null &&
              String(platformPlanned) !== String(platformActual)) ||
            false,
          isSuppressedStop,
          isExtraStop: statusInfo.isExtraStop,
          executivePosition: getExecutivePosition(f),
          smartAvailable: hasSmartFeature(f),
        };
      });

      const stoppedByPrevStop =
        previousStopName && previousStop.arrivalRealHHmm && !previousStop.departureRealHHmm ? previousStopName : null;

      const currentStopIdx = stops.findIndex((s) => s.isCurrent);

      const findStopWithArrivalNoDeparture = () => {
        for (let i = stops.length - 1; i >= 0; i -= 1) {
          const s = stops[i];
          const hasArrivalActual = Boolean(s?.arrival?.actualEpoch) || (typeof s?.arrival?.actual === 'string' && s.arrival.actual !== '—');
          const hasDepartureActual = Boolean(s?.departure?.actualEpoch) || (typeof s?.departure?.actual === 'string' && s.departure.actual !== '—');
          if (hasArrivalActual && !hasDepartureActual) return s;
        }
        return null;
      };

	      const buildPositionText = () => {
	        if (journeyStateCode === 'COMPLETED') {
	          const place = to || 'destinazione';
	          const time =
	            (arrivalTiming?.actual && arrivalTiming.actual !== '—' ? arrivalTiming.actual : null) ||
	            (typeof ultimoRil?.orario === 'string' && ultimoRil.orario.trim() ? ultimoRil.orario.trim() : null) ||
	            (lastSeenEpochMs ? formatTime(lastSeenEpochMs) : null);
	          if (time && time !== '—') return `Arrivato a ${place} alle ${time}`;
	          return `Arrivato a ${place}`;
	        }
	        if (journeyStateCode === 'CANCELLED') {
	          if (lastDetectionText) return `Ultimo rilevamento: ${lastDetectionText}`;
	          return 'Soppresso';
	        }
        const originStop = stops[0] || null;
        const originName = originStop?.name || from || null;
        const originDeparture = originStop?.departure || null;
        const originDepartureText =
          originDeparture?.actual && originDeparture.actual !== '—'
            ? originDeparture.actual
            : originDeparture?.predicted && originDeparture.predicted !== '—'
              ? originDeparture.predicted
              : originDeparture?.scheduled && originDeparture.scheduled !== '—'
                ? originDeparture.scheduled
                : null;
        const originDepartureEpoch =
          originDeparture?.actualEpoch ?? originDeparture?.predictedEpoch ?? originDeparture?.scheduledEpoch ?? null;
        const originDepartureInMinutes = formatMinutesLong(minutesUntilEpoch(originDepartureEpoch));
        const hasOriginDepartureActual =
          Boolean(originDeparture?.actualEpoch) ||
          (typeof originDeparture?.actual === 'string' && originDeparture.actual !== '—');

	        if (journeyStateCode === 'PLANNED') {
          if (originName && originDepartureText && !hasOriginDepartureActual) {
            const prefix = isInStationByFlag ? 'In partenza' : 'Partirà';
            return `${prefix} da ${originName} alle ${originDepartureText}${originDepartureInMinutes ? `, ${originDepartureInMinutes}` : ''}`;
          }
          return journeyStateLabel || 'Programmato';
        }

        const stoppedByStops = findStopWithArrivalNoDeparture()?.name || null;
        const stoppedStation = stoppedByPrevStop || stoppedByStops || null;
        if (isInStationByFlag) {
          const isAtOrigin =
            originName &&
            (currentStopIdx === 0 ||
              (!currentStationByFlag && !previousStopName && !stoppedStation));
          if (isAtOrigin && !hasOriginDepartureActual && originDepartureText) {
            return `In partenza da ${originName} alle ${originDepartureText}${originDepartureInMinutes ? `, ${originDepartureInMinutes}` : ''}`;
          }

          const station = currentStationByFlag || stoppedStation || previousStopName || nextStopName || null;
          if (station) return `Fermo a ${station}`;
          if (originName) return `Fermo a ${originName}`;
        }
        if (stoppedStation) return `Fermo a ${stoppedStation}`;

	        if (previousStopName && nextStopName) return `In viaggio tra ${previousStopName} e ${nextStopName}`;
	        return journeyStateLabel || 'Stato non disponibile';
	      };

      const positionText = buildPositionText();

      const choice = context?.choice ?? null;
      const originName = context?.originName ?? null;

      if (isInStationByFlag && !isSoppressoByFlag) {
        journeyStateCode = journeyStateCode || 'RUNNING';
        journeyStateLabel = journeyStateLabel || 'In stazione';
      }

      const idParts = [trainTypeLabel, trainNumber, choice != null ? `choice${choice}` : null].filter(Boolean);

      return {
        kind: 'train',
        train: {
          id: idParts.join('-'),
          type: trainTypeLabel,
          kindFullName: trainKindFullName,
          kindCode: trainKind?.sigla || trainKind?.codice || trainKind?.code || null,
          kindCategory: trainKind?.categoria || trainKind?.category || null,
          operator: trainOperator,
          number: trainNumber,
          serviceStatusLabel,
          from,
          to,
          delayMinutes,
          isSuppressed: isSoppressoByFlag || journeyStateCode === 'CANCELLED',
          isInStation: isInStationByFlag,
          journeyStateCode,
          journeyStateLabel,
          positionText,
          lastSeenEpochMs,
          lastSeenStationName,
          nextStopName,
          nextStopIndex,
          nextStopArrivalPlanned,
          nextStopDeparturePlanned,
          nextStopArrivalEstimated,
          nextStopDepartureEstimated,
          lastDetectionText,
          rfiMessage,
          extraInfo: null,
          originCode: null,
          originName,
          choice,
          timestampRiferimento: context?.timestampRiferimento ?? null,
          date: context?.date ?? null,
          hasExecutive,
          hasSmart,
          technical: null,
          referenceEpochMs: raw.referenceTimestamp || null,
          departure: departureTiming,
          arrival: arrivalTiming,
          stops,
        },
      };
    }

    // === NUOVISSIMO FORMATO: raw.treno (risposta diretta) ===
    if (raw.treno && raw.treno.numeroTreno) {
      const treno = raw.treno;
      const trainNumber = String(treno.numeroTreno || fallbackTrainNumber || '').trim();
      if (!trainNumber) {
        return { kind: 'empty', message: 'Nessun treno trovato' };
      }

      const trainKind = treno.tipoTreno || null;
      const trainTypeLabel = getTrainKindLabel(trainKind) || String(treno.codiceTreno || '').trim() || 'TRENO';
      const trainKindFullName = getTrainKindFullName(trainKind, trainTypeLabel);
      const trainOperator = getTrainOperatorLabel(trainKind, treno);
      const serviceStatusLabel = extractServiceStatusLabel(treno, treno?.statoTreno, raw);
      const delayMinutes = typeof treno.ritardoMinuti === 'number' ? treno.ritardoMinuti : null;

      const from = treno.tratta?.origine || null;
      const to = treno.tratta?.destinazione || null;

      const fermate = Array.isArray(treno.fermate) ? [...treno.fermate].sort((a, b) => (a.progressivo ?? 0) - (b.progressivo ?? 0)) : [];
      const hasExecutive = hasExecutiveFeature(treno) || fermate.some(hasExecutiveFeature);
      const hasSmart = hasSmartFeature(treno) || fermate.some(hasSmartFeature);
      const first = fermate[0];
      const last = fermate[fermate.length - 1];

      const departureTiming = first ? buildStopTimingFromStrings({
        scheduled: first.orari?.partenza?.programmato,
        predicted: first.orari?.partenza?.probabile,
        actual: first.orari?.partenza?.reale,
        delayMinutes,
      }) : null;

      const arrivalTiming = last ? buildStopTimingFromStrings({
        scheduled: last.orari?.arrivo?.programmato,
        predicted: last.orari?.arrivo?.probabile,
        actual: last.orari?.arrivo?.reale,
        delayMinutes,
      }) : null;

      const currentStopIndex = treno.posizione?.indice ?? null;
      const currentStopCode = treno.posizione?.idStazione ?? null;

      const stops = fermate.map((f, idx) => {
        const stationCode = f.id || null;
        const station = stationCode ? getStationById(stationCode) : null;
        const coord = station?.lat != null && station?.lon != null ? { latitude: station.lat, longitude: station.lon } : null;

        const arrival = buildStopTimingFromStrings({
          scheduled: f.orari?.arrivo?.programmato,
          predicted: f.orari?.arrivo?.probabile,
          actual: f.orari?.arrivo?.reale,
          delayMinutes,
        });
        const departure = buildStopTimingFromStrings({
          scheduled: f.orari?.partenza?.programmato,
          predicted: f.orari?.partenza?.probabile,
          actual: f.orari?.partenza?.reale,
          delayMinutes,
        });

        const platformPlanned = f.binari?.partenza?.programmato ?? null;
        const platformActual = normalizePlatformActualValue(f.binari?.partenza?.reale ?? null);
        const platformChanged =
          f.binari?.partenza?.variato === true ||
          (platformPlanned != null &&
            platformActual != null &&
            String(platformPlanned) !== String(platformActual));

        const isCurrent = currentStopIndex != null ? idx === currentStopIndex : currentStopCode ? stationCode === currentStopCode : false;
        const statusInfo = getStopStatusInfo(f);
        const tipoFermata = typeof f?.tipoFermata === 'string' ? f.tipoFermata.trim().toUpperCase() : '';
        const isSuppressedStop =
          statusInfo.isSuppressedByStatus ||
          tipoFermata === 'S' ||
          tipoFermata === 'SOPPRESSA' ||
          tipoFermata === 'SOPPRESSO';

        return {
          id: stationCode || `${trainNumber}-${idx}`,
          stationCode,
          name: station?.name || stationCode || '—',
          coord,
          isCurrent,
          arrival,
          departure,
          platformPlanned,
          platformActual,
          platformChanged,
          isSuppressedStop,
          isExtraStop: statusInfo.isExtraStop,
          executivePosition: getExecutivePosition(f),
          smartAvailable: hasSmartFeature(f),
        };
      });

      const journeyFromObject = treno.statoViaggio || treno.journeyState || null;
      const journeyFromString = mapStatoTrenoToJourneyState(treno.statoTreno || treno.stato || treno.state || null);
      const journeyStateCode = journeyFromObject?.stato || journeyFromObject?.state || journeyFromString.state || null;
      const journeyStateLabel = journeyFromObject?.etichetta || journeyFromObject?.label || journeyFromString.label || null;
      const isSuppressed =
        journeyStateCode === 'CANCELLED' ||
        treno.isSoppresso === true ||
        treno.trenoSoppresso === true ||
        treno.soppresso === true ||
        treno.cancellato === true ||
        treno.cancelled === true ||
        treno.circolante === false;
      const isInStation = treno.inStazione === true;

      const nextStop = normalizeNextStop(treno.prossimaFermata || null);
      const nextStopName = decodeHtmlEntities(nextStop.stationName) || null;
      const nextStopIndex = nextStop.index;
      const nextStopArrivalPlanned = nextStop.arrivalHHmm;
      const nextStopDeparturePlanned = nextStop.departureHHmm;
      const nextStopArrivalEstimated =
        nextStop.arrivalEstimatedHHmm ||
        (nextStopArrivalPlanned && delayMinutes != null ? addMinutesToHHmm(nextStopArrivalPlanned, delayMinutes) : null);
      const nextStopDepartureEstimated =
        nextStop.departureEstimatedHHmm ||
        (nextStopDeparturePlanned && delayMinutes != null ? addMinutesToHHmm(nextStopDeparturePlanned, delayMinutes) : null);
      const lastSeenEpochMs = treno.posizione?.timestamp ?? null;
      const lastSeenStationName = treno.posizione?.stazione || null;
      const lastDetectionText =
        buildLastSeenText({
          stationName: lastSeenStationName,
          epochMs: lastSeenEpochMs,
          fallbackText: decodeHtmlEntities(treno.rilevamento?.testo) || null,
        }) || null;
      const rfiMessage = decodeHtmlEntities(treno.messaggioRfi) || null;

	      const buildPositionText = () => {
	        if (journeyStateCode === 'COMPLETED') {
	          return `Arrivato a ${to || 'destinazione'}`;
	        }
	        if (isSuppressed || journeyStateCode === 'CANCELLED') {
	          if (lastDetectionText) return `Ultimo rilevamento: ${lastDetectionText}`;
	          return 'Soppresso';
	        }
	        const originName = from || stops[0]?.name || null;
	        const originDepartureText =
	          departureTiming?.actual && departureTiming.actual !== '—'
	            ? departureTiming.actual
	            : departureTiming?.predicted && departureTiming.predicted !== '—'
	              ? departureTiming.predicted
	              : departureTiming?.scheduled && departureTiming.scheduled !== '—'
	                ? departureTiming.scheduled
	                : null;
	        const originDepartureInMinutes = (() => {
            const trainDate = context?.date ?? null;
            const hhmm = originDepartureText;
            if (!trainDate || !hhmm) return null;
            const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
            if (!m) return null;
            const dateObj = new Date(`${String(trainDate).trim()}T${String(m[1]).padStart(2, '0')}:${m[2]}:00`);
            if (!Number.isFinite(dateObj.getTime())) return null;
            const minutes = minutesUntilEpoch(dateObj.getTime());
            if (!Number.isFinite(Number(minutes)) || minutes <= 0 || minutes > 180) return null;
            return formatMinutesLong(minutes);
          })();
	        const hasOriginDepartureActual =
	          (typeof departureTiming?.actual === 'string' && departureTiming.actual !== '—') || Boolean(departureTiming?.actualEpoch);

	        if (treno.inStazione === true && !treno.posizione?.stazione && originName) {
	          if (!hasOriginDepartureActual && originDepartureText) {
	            return `In partenza da ${originName} alle ${originDepartureText}${originDepartureInMinutes ? `, ${originDepartureInMinutes}` : ''}`;
	          }
	          return `Fermo a ${originName}`;
	        }

	        if (journeyStateCode === 'PLANNED') {
	          if (originName && originDepartureText && !hasOriginDepartureActual) {
            return `Partirà da ${originName} alle ${originDepartureText}${originDepartureInMinutes ? `, ${originDepartureInMinutes}` : ''}`;
	          }
	          return journeyStateLabel || 'Programmato';
	        }

        if (treno.inStazione === true && treno.posizione?.stazione) {
          return `Fermo a ${treno.posizione.stazione}`;
        }

	        if ((journeyStateCode === 'RUNNING' || journeyStateCode === 'PARTIAL') && treno.posizione?.stazione) {
	          const cur = treno.posizione.stazione;
	          const next = nextStopName || (currentStopIndex != null ? stops[currentStopIndex + 1]?.name : null);
	          if (next) return `In viaggio tra ${cur} e ${next}`;
	          return 'In viaggio';
	        }

        return journeyStateLabel || 'Stato non disponibile';
      };

      const positionText = buildPositionText();

      const idParts = [trainTypeLabel, trainNumber].filter(Boolean);

      return {
        kind: 'train',
        train: {
          id: idParts.join('-'),
          type: trainTypeLabel,
          kindFullName: trainKindFullName,
          kindCode: trainKind?.sigla || trainKind?.codice || null,
          kindCategory: trainKind?.categoria || null,
          operator: trainOperator,
          number: trainNumber,
          serviceStatusLabel,
          from,
          to,
          delayMinutes,
          isSuppressed,
          isInStation,
          journeyStateCode,
          journeyStateLabel,
          positionText,
          lastSeenEpochMs,
          lastSeenStationName,
          nextStopName,
          nextStopIndex,
          nextStopArrivalPlanned,
          nextStopDeparturePlanned,
          nextStopArrivalEstimated,
          nextStopDepartureEstimated,
          lastDetectionText,
          rfiMessage,
          extraInfo: null,
          originCode: null,
          technical: null,
          timestampRiferimento: context?.timestampRiferimento ?? null,
          date: context?.date ?? null,
          hasExecutive,
          hasSmart,
          referenceEpochMs: null,
          departure: departureTiming,
          arrival: arrivalTiming,
          stops,
        },
      };
    }

    const data = raw.data || raw;

    const computed = raw.computed || data?.computed || null;

    // === NUOVO FORMATO: usa computed.fermate (orari già in HH:mm) ===
    if (computed && Array.isArray(computed.fermate) && computed.fermate.length > 0) {
      const delayMinutes = parseDelayMinutes(computed, data);

      const trainNumber = String(computed.numeroTreno || data.numeroTreno || fallbackTrainNumber || '').trim();
      if (!trainNumber) {
        return { kind: 'empty', message: raw.messaggio || raw.message || 'Nessun treno trovato' };
      }

      const trainKind =
        computed.trainKind ||
        (computed.tipologiaTreno
          ? { code: computed.tipologiaTreno, label: computed.tipologiaTreno, category: null }
          : null);
      const trainTypeLabel =
        getTrainKindLabel(trainKind) ||
        String(computed.tipologiaTreno || '').trim().toUpperCase() ||
        String(data?.categoria || '').trim() ||
        'TRENO';
      const trainKindFullName = getTrainKindFullName(trainKind, trainTypeLabel);
      const trainOperator = getTrainOperatorLabel(trainKind, computed || data);
      const serviceStatusLabel = extractServiceStatusLabel(computed, data, computed?.statoTreno);

      const fermate = [...computed.fermate].sort((a, b) => (a.progressivo ?? 0) - (b.progressivo ?? 0));
      const hasExecutive = hasExecutiveFeature(computed) || fermate.some(hasExecutiveFeature);
      const hasSmart = hasSmartFeature(computed) || fermate.some(hasSmartFeature);
      const first = fermate[0];
      const last = fermate[fermate.length - 1];

      const departureTiming = buildStopTimingFromStrings({
        scheduled: first?.orarioPartenzaProgrammato,
        predicted: first?.orarioPartenzaProbabile,
        actual: first?.orarioPartenzaReale,
        delayMinutes,
      });

      const arrivalTiming = buildStopTimingFromStrings({
        scheduled: last?.orarioArrivoProgrammato,
        predicted: last?.orarioArrivoProbabile,
        actual: last?.orarioArrivoReale,
        delayMinutes,
      });

      const currentStopIndex = Number.isFinite(Number(computed?.currentStop?.index)) ? Number(computed.currentStop.index) : null;
      const currentStopCode = computed?.currentStop?.stationCode ? String(computed.currentStop.stationCode) : null;

      const stops = fermate.map((f, idx) => {
        const stationCode = f.id || f.stationCode || null;
        const station = stationCode ? getStationById(stationCode) : null;
        const coord = station?.lat != null && station?.lon != null ? { latitude: station.lat, longitude: station.lon } : null;

        const arrival = buildStopTimingFromStrings({
          scheduled: f.orarioArrivoProgrammato,
          predicted: f.orarioArrivoProbabile,
          actual: f.orarioArrivoReale,
          delayMinutes,
        });
        const departure = buildStopTimingFromStrings({
          scheduled: f.orarioPartenzaProgrammato,
          predicted: f.orarioPartenzaProbabile,
          actual: f.orarioPartenzaReale,
          delayMinutes,
        });

        const platformPlanned = f.binarioProgrammatoPartenzaDescrizione ?? f.binarioProgrammato ?? null;
        const platformActual = normalizePlatformActualValue(
          f.binarioEffettivoPartenzaDescrizione ?? f.binarioReale ?? null
        );
        const platformChanged =
          f.binarioVariato === true ||
          (platformPlanned != null &&
            platformActual != null &&
            String(platformPlanned) !== String(platformActual));

        const isCurrent =
          f.attuale === true ||
          (currentStopIndex != null ? idx === currentStopIndex : currentStopCode ? stationCode === currentStopCode : false);

        const statusInfo = getStopStatusInfo(f);
        const tipoFermata = typeof f?.tipoFermata === 'string' ? f.tipoFermata.trim().toUpperCase() : '';
        const isSuppressedStop =
          statusInfo.isSuppressedByStatus ||
          tipoFermata === 'S' ||
          tipoFermata === 'SOPPRESSA' ||
          tipoFermata === 'SOPPRESSO';

        return {
          id: stationCode || `${trainNumber}-${idx}`,
          stationCode,
          name: f.stazione || station?.name || stationCode || '—',
          coord,
          isCurrent,
          arrival,
          departure,
          platformPlanned,
          platformActual,
          platformChanged,
          isSuppressedStop,
          isExtraStop: statusInfo.isExtraStop,
          executivePosition: getExecutivePosition(f),
          smartAvailable: hasSmartFeature(f),
        };
      });

      const technical = raw.technical || raw.idTecnico || null;
      const originCode = raw.originCode || raw.codiceOrigine || null;
      const referenceEpochMs = raw.referenceTimestamp || raw.epochMs || null;

      const journeyFromLegacy = computed?.journeyState?.state ? computed.journeyState : null;
      const journeyFromStatoTreno = mapStatoTrenoToJourneyState(computed?.statoTreno);
      const journeyStateCode = journeyFromLegacy?.state || journeyFromStatoTreno.state || null;
      const journeyStateLabel = journeyFromLegacy?.label || journeyFromStatoTreno.label || null;

      const from = computed.origine || data?.origine || null;
      const to = computed.destinazione || data?.destinazione || null;

      const nextStop = normalizeNextStop(computed?.prossimaFermata || null);
      const nextStopName = decodeHtmlEntities(nextStop.stationName) || null;
      const nextStopIndex = nextStop.index;
      const nextStopArrivalPlanned = nextStop.arrivalHHmm;
      const nextStopDeparturePlanned = nextStop.departureHHmm;
      const nextStopArrivalEstimated =
        nextStop.arrivalEstimatedHHmm ||
        (nextStopArrivalPlanned && delayMinutes != null ? addMinutesToHHmm(nextStopArrivalPlanned, delayMinutes) : null);
      const nextStopDepartureEstimated =
        nextStop.departureEstimatedHHmm ||
        (nextStopDeparturePlanned && delayMinutes != null ? addMinutesToHHmm(nextStopDeparturePlanned, delayMinutes) : null);
      const rfiMessage = decodeHtmlEntities(computed?.messaggioRfi) || null;
      const extraInfo = decodeHtmlEntities(computed?.infoAgg) || null;

	      const buildPositionText = () => {
	        if (journeyStateCode === 'COMPLETED') {
	          return `Arrivato a ${to || 'destinazione'}`;
	        }
	        if (journeyStateCode === 'CANCELLED') {
	          const lastSeen = buildLastSeenText({
	            stationName: computed?.currentStop?.stationName || null,
	            epochMs: computed?.currentStop?.timestamp ?? null,
	            fallbackText: decodeHtmlEntities(computed?.oraLuogoRilevamento) || null,
	          });
	          if (lastSeen) return `Ultimo rilevamento: ${lastSeen}`;
	          return 'Soppresso';
	        }
	        if (journeyStateCode === 'PLANNED') return from ? `Non ancora partito da ${from}` : 'Non ancora partito';

	        const pieces = [];
	        if (nextStopName) pieces.push(`Prossima fermata: ${nextStopName}`);
	        if (pieces.length > 0) return pieces.join(' • ');

        const cur = computed?.currentStop;
	        if (cur?.stationName) {
	          const next = currentStopIndex != null ? stops[currentStopIndex + 1]?.name : null;
	          if (next) return `In viaggio tra ${cur.stationName} e ${next}`;
	          return 'In viaggio';
	        }

        return journeyStateLabel || 'Stato non disponibile';
      };

      const positionText = buildPositionText();
      const lastSeenEpochMs = computed?.currentStop?.timestamp ?? null;
      const lastSeenStationName =
        computed?.currentStop?.stationName || (stops.find((s) => s.isCurrent)?.name ?? null) || (journeyStateCode === 'COMPLETED' ? to : null) || null;
      const lastDetectionText =
        buildLastSeenText({
          stationName: lastSeenStationName,
          epochMs: lastSeenEpochMs,
          fallbackText: decodeHtmlEntities(computed?.oraLuogoRilevamento) || null,
        }) || null;

      const isSuppressed =
        journeyStateCode === 'CANCELLED' ||
        computed?.isSoppresso === true ||
        computed?.trenoSoppresso === true ||
        data?.trenoSoppresso === true ||
        data?.circolante === false;
      const isInStation = computed?.inStazione === true || data?.inStazione === true || data?.isInStazione === true || data?.isInStation === true;

      const idParts = [trainTypeLabel, trainNumber, technical || ''].filter(Boolean);

      return {
        kind: 'train',
        train: {
          id: idParts.join('-'),
          type: trainTypeLabel,
          kindFullName: trainKindFullName,
          kindCode: trainKind?.code || null,
          kindCategory: trainKind?.category || null,
          operator: trainOperator,
          number: trainNumber,
          serviceStatusLabel,
          from,
          to,
          delayMinutes,
          isSuppressed,
          isInStation,
          journeyStateCode,
          journeyStateLabel,
          positionText,
          lastSeenEpochMs,
          lastSeenStationName,
          nextStopName,
          nextStopIndex,
          nextStopArrivalPlanned,
          nextStopDeparturePlanned,
          nextStopArrivalEstimated,
          nextStopDepartureEstimated,
          lastDetectionText,
          rfiMessage,
          extraInfo,
          originCode,
          technical,
          referenceEpochMs,
          hasExecutive,
          hasSmart,
          departure: departureTiming,
          arrival: arrivalTiming,
          stops,
        },
      };
    }

    // === NUOVO FORMATO: statoTreno + fermate.fermate ===
    const fermateList = Array.isArray(data?.fermate?.fermate) ? data.fermate.fermate : null;
    if (data?.numeroTreno && fermateList) {
      const trainNumber = String(data.numeroTreno || fallbackTrainNumber || '').trim();
      if (!trainNumber) {
        return { kind: 'empty', message: raw.messaggio || raw.message || 'Nessun treno trovato' };
      }

      const trainKind = data.tipoTreno || null;
      const trainTypeLabel =
        getTrainKindLabel(trainKind) ||
        String(trainKind?.categoria || trainKind?.nomeCat || '').trim().toUpperCase() ||
        'TRENO';
      const trainKindFullName = getTrainKindFullName(trainKind, trainTypeLabel);
      const trainOperator = getTrainOperatorLabel(trainKind, data);
      const serviceStatusLabel = extractServiceStatusLabel(data?.statoTreno, data);

      const delayMinutes = Number.isFinite(Number(data?.statoTreno?.deltaTempo)) ? Number(data.statoTreno.deltaTempo) : null;

      const from = data?.tratta?.stazionePartenzaZero || fermateList[0]?.stazione || null;
      const to = data?.tratta?.stazioneArrivoZero || fermateList[fermateList.length - 1]?.stazione || null;

      const buildTimingFromStop = (block, fallbackDelay) => {
        const delay = Number.isFinite(Number(block?.deltaMinuti)) ? Number(block.deltaMinuti) : fallbackDelay;
        return buildStopTimingFromStrings({
          scheduled: block?.hhmm?.programmato,
          predicted: block?.hhmm?.probabile,
          actual: block?.hhmm?.reale,
          delayMinutes: delay,
        });
      };

      const firstStop = fermateList[0] || null;
      const lastStop = fermateList[fermateList.length - 1] || null;

      const departureTiming = firstStop?.orari?.partenza
        ? buildTimingFromStop(firstStop.orari.partenza, delayMinutes)
        : buildStopTimingFromStrings({
            scheduled: data?.tratta?.orarioPartenzaZero,
            predicted: null,
            actual: null,
            delayMinutes,
          });

      const arrivalTiming = lastStop?.orari?.arrivo
        ? buildTimingFromStop(lastStop.orari.arrivo, delayMinutes)
        : buildStopTimingFromStrings({
            scheduled: data?.tratta?.orarioArrivoZero,
            predicted: null,
            actual: null,
            delayMinutes,
          });

      const rawState = String(data?.statoTreno?.stato || '').trim();
      const rawStateLower = rawState.toLowerCase();
      const journeyFromString = mapStatoTrenoToJourneyState(rawState);
      let journeyStateCode = journeyFromString.state || null;
      let journeyStateLabel = journeyFromString.label || null;
      const isInStation = rawStateLower.includes('stazione');

      const cleanInfoValue = (value) => {
        const text = decodeHtmlEntities(value ?? null);
        if (!text) return null;
        const trimmed = String(text).trim();
        if (!trimmed || trimmed === '--') return null;
        return trimmed;
      };

      const parseDateTimeToEpoch = (dateStr, timeStr) => {
        const dateMatch = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(String(dateStr || '').trim());
        const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || '').trim());
        if (!dateMatch || !timeMatch) return null;
        const day = Number(dateMatch[1]);
        const month = Number(dateMatch[2]);
        const yearRaw = String(dateMatch[3]);
        const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
        const hour = Number(timeMatch[1]);
        const minute = Number(timeMatch[2]);
        if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
        if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
        const dateObj = new Date(year, month - 1, day, hour, minute, 0);
        const ts = dateObj.getTime();
        if (!Number.isFinite(ts)) return null;
        return ts;
      };

      const lastSeenEpochMs = parseDateTimeToEpoch(
        data?.dataRiferimento || context?.date || null,
        data?.statoTreno?.infoIR?.ultimoRilevOra || null
      );
      const lastSeenStationName = (() => {
        const rawPlace = cleanInfoValue(data?.statoTreno?.infoIR?.ultimoRilevLuogo);
        const sanitized = sanitizeRfiPlace(rawPlace);
        return sanitized || null;
      })();
      const lastDetectionText =
        cleanInfoValue(data?.statoTreno?.infoIR?.messaggioUltimoRilev) ||
        cleanInfoValue(data?.statoTreno?.infoIR?.messaggioUltimoRilevamento) ||
        null;

      const rawRfiMessage = data?.statoTreno?.messaggiRfi ?? null;
      const rfiMessage = Array.isArray(rawRfiMessage)
        ? rawRfiMessage.map((m) => decodeHtmlEntities(m)).filter(Boolean).join(' • ')
        : decodeHtmlEntities(rawRfiMessage) || null;

      const extraInfo = cleanInfoValue(data?.statoTreno?.infoIR?.messaggioUltimoRilev) || null;

      const currentStationName = cleanInfoValue(data?.statoTreno?.stazioneCorrente);
      const previousStopName = cleanInfoValue(data?.statoTreno?.stazionePrecedente);
      const nextStopName = cleanInfoValue(data?.statoTreno?.stazioneSuccessiva);
      const hasExecutive = hasExecutiveFeature(data?.statoTreno) || fermateList.some(hasExecutiveFeature);
      const hasSmart = hasSmartFeature(data?.statoTreno) || fermateList.some(hasSmartFeature);

      const hasSuppressedStops = fermateList.some((f) => {
        const statusInfo = getStopStatusInfo(f);
        if (statusInfo.isSuppressedByStatus) return true;
        const tipo = typeof f?.tipoFermata === 'string' ? f.tipoFermata.trim().toUpperCase() : '';
        return tipo === 'S' || tipo === 'SOPPRESSA' || tipo === 'SOPPRESSO';
      });

      const rfiMessageLower = typeof rfiMessage === 'string' ? rfiMessage.toLowerCase() : '';
      const isVariatoByMessage =
        rfiMessageLower.includes('cancellato da') ||
        rfiMessageLower.includes('soppresso da') ||
        rfiMessageLower.includes('limitato') ||
        rfiMessageLower.includes('variazione');
      const isVariatoByStops = hasSuppressedStops;

      if (
        journeyStateCode !== 'CANCELLED' &&
        journeyStateCode !== 'COMPLETED' &&
        (isVariatoByStops || isVariatoByMessage)
      ) {
        journeyStateCode = 'PARTIAL';
        journeyStateLabel = journeyStateLabel || 'Variazione di percorso';
      }

      const stops = fermateList.map((f, idx) => {
        const stationName = typeof f?.stazione === 'string' ? f.stazione.trim() : '';
        const station = stationName ? getStationByName(stationName) : null;
        const stationCode = station?.id || null;
        const coord = station?.lat != null && station?.lon != null ? { latitude: station.lat, longitude: station.lon } : null;

        const arrival = buildTimingFromStop(f?.orari?.arrivo, delayMinutes);
        const departure = buildTimingFromStop(f?.orari?.partenza, delayMinutes);

        const platformPlanned = f?.binari?.partenza?.programmato ?? null;
        const platformActual = normalizePlatformActualValue(f?.binari?.partenza?.reale ?? null);

        const statusInfo = getStopStatusInfo(f);
        const tipoFermata = typeof f?.tipoFermata === 'string' ? f.tipoFermata.trim().toUpperCase() : '';
        const isSuppressedStop =
          statusInfo.isSuppressedByStatus ||
          tipoFermata === 'S' ||
          tipoFermata === 'SOPPRESSA' ||
          tipoFermata === 'SOPPRESSO';

        const isCurrent = currentStationName
          ? stationName.toLowerCase() === String(currentStationName).trim().toLowerCase()
          : false;

        return {
          id: stationCode || stationName || `${trainNumber}-${idx}`,
          stationCode,
          name: stationName || station?.name || stationCode || '—',
          coord,
          isCurrent,
          arrival,
          departure,
          platformPlanned,
          platformActual,
          platformChanged:
            (platformPlanned != null &&
              platformActual != null &&
              String(platformPlanned) !== String(platformActual)) ||
            false,
          isSuppressedStop,
          isExtraStop: statusInfo.isExtraStop,
          executivePosition: getExecutivePosition(f),
          smartAvailable: hasSmartFeature(f),
        };
      });

      const normalizeTime = (value) => (typeof value === 'string' && value !== '—' ? value : null);
      const findStopIndex = (name) => {
        if (!name) return null;
        const target = String(name).trim().toLowerCase();
        const idx = stops.findIndex((s) => String(s?.name || '').trim().toLowerCase() === target);
        return idx >= 0 ? idx : null;
      };
      const nextStopIndex = findStopIndex(nextStopName);
      const nextStop = nextStopIndex != null ? stops[nextStopIndex] : null;
      const nextStopArrivalPlanned = normalizeTime(nextStop?.arrival?.scheduled);
      const nextStopDeparturePlanned = normalizeTime(nextStop?.departure?.scheduled);
      const nextStopArrivalEstimated =
        normalizeTime(nextStop?.arrival?.predicted) ||
        normalizeTime(nextStop?.arrival?.actual) ||
        (nextStopArrivalPlanned && delayMinutes != null ? addMinutesToHHmm(nextStopArrivalPlanned, delayMinutes) : null);
      const nextStopDepartureEstimated =
        normalizeTime(nextStop?.departure?.predicted) ||
        normalizeTime(nextStop?.departure?.actual) ||
        (nextStopDeparturePlanned && delayMinutes != null ? addMinutesToHHmm(nextStopDeparturePlanned, delayMinutes) : null);

      const isSuppressed = journeyStateCode === 'CANCELLED';

      const buildPositionText = () => {
        if (journeyStateCode === 'COMPLETED') {
          return `Arrivato a ${to || 'destinazione'}`;
        }
        if (isSuppressed) {
          if (lastDetectionText) return `Ultimo rilevamento: ${lastDetectionText}`;
          return 'Soppresso';
        }
        const originName = from || stops[0]?.name || null;
        const originDepartureText =
          normalizeTime(departureTiming?.actual) ||
          normalizeTime(departureTiming?.predicted) ||
          normalizeTime(departureTiming?.scheduled) ||
          null;

        if (journeyStateCode === 'PLANNED') {
          if (originName && originDepartureText) return `Partirà da ${originName} alle ${originDepartureText}`;
          return journeyStateLabel || 'Programmato';
        }

        if (isInStation && currentStationName) return `Fermo a ${currentStationName}`;
        if (previousStopName && nextStopName) return `In viaggio tra ${previousStopName} e ${nextStopName}`;
        if (nextStopName) return `Prossima fermata: ${nextStopName}`;
        return journeyStateLabel || 'Stato non disponibile';
      };

      const positionText = buildPositionText();

      const idParts = [trainTypeLabel, trainNumber].filter(Boolean);

      return {
        kind: 'train',
        train: {
          id: idParts.join('-'),
          type: trainTypeLabel,
          kindFullName: trainKindFullName,
          kindCode: trainKind?.sigla || trainKind?.categoria || trainKind?.code || null,
          kindCategory: trainKind?.categoria || trainKind?.category || null,
          operator: trainOperator,
          number: trainNumber,
          serviceStatusLabel,
          from,
          to,
          delayMinutes,
          isSuppressed,
          isInStation,
          journeyStateCode,
          journeyStateLabel,
          positionText,
          lastSeenEpochMs,
          lastSeenStationName,
          nextStopName,
          nextStopIndex,
          nextStopArrivalPlanned,
          nextStopDeparturePlanned,
          nextStopArrivalEstimated,
          nextStopDepartureEstimated,
          lastDetectionText,
          rfiMessage,
          extraInfo,
          originCode: null,
          originName: from,
          choice: context?.choice ?? null,
          timestampRiferimento: context?.timestampRiferimento ?? null,
          date: data?.dataRiferimento || context?.date || null,
          hasExecutive,
          hasSmart,
          technical: null,
          referenceEpochMs: null,
          departure: departureTiming,
          arrival: arrivalTiming,
          stops,
        },
      };
    }

    // === FALLBACK LEGACY ===
    if (!data || !data.numeroTreno) {
      return { kind: 'empty', message: raw.messaggio || raw.message || 'Nessun treno trovato' };
    }

    const trainNumber = String(data.numeroTreno || fallbackTrainNumber || '').trim();
    const trainKind = computed?.trainKind || null;
    const trainTypeLabel = getTrainKindLabel(trainKind) || String(data.categoria || '').trim() || 'TRENO';
    const trainKindFullName = getTrainKindFullName(trainKind, trainTypeLabel);
    const trainOperator = getTrainOperatorLabel(trainKind, data);
    const serviceStatusLabel = extractServiceStatusLabel(data, computed, data?.statoTreno);

    const fermate = Array.isArray(data.fermate) ? [...data.fermate].sort((a, b) => (a.progressivo ?? 0) - (b.progressivo ?? 0)) : [];
    const hasExecutive = hasExecutiveFeature(data) || fermate.some(hasExecutiveFeature);
    const hasSmart = hasSmartFeature(data) || fermate.some(hasSmartFeature);
    const first = fermate[0];
    const last = fermate[fermate.length - 1];

    const departureTiming = buildStopTiming({
      scheduledEpoch: first?.partenza_teorica ?? first?.programmata ?? null,
      actualEpoch: first?.partenzaReale ?? first?.effettiva ?? null,
      delayMinutes: first?.ritardoPartenza ?? first?.ritardo ?? data.ritardo ?? computed?.globalDelay ?? null,
    });
    const arrivalTiming = buildStopTiming({
      scheduledEpoch: last?.arrivo_teorico ?? last?.programmata ?? null,
      actualEpoch: last?.arrivoReale ?? last?.effettiva ?? null,
      delayMinutes: last?.ritardoArrivo ?? last?.ritardo ?? data.ritardo ?? computed?.globalDelay ?? null,
    });

    const currentStopIndex = Number.isFinite(Number(computed?.currentStop?.index)) ? Number(computed.currentStop.index) : null;
    const currentStopCode = computed?.currentStop?.stationCode ? String(computed.currentStop.stationCode) : null;

    const suppressedStopsSet = (() => {
      const rawList = Array.isArray(data.fermateSoppresse) ? data.fermateSoppresse : [];
      const norm = (v) => String(v || '').trim().toLowerCase();
      const out = new Set();
      for (const item of rawList) {
        if (typeof item === 'string') {
          const k = norm(item);
          if (k) out.add(k);
          continue;
        }
        if (item && typeof item === 'object') {
          const name = item.stazione ?? item.stationName ?? item.nome ?? item.name ?? null;
          const k = norm(name);
          if (k) out.add(k);
        }
      }
      return out;
    })();

    const stops = fermate.map((f, idx) => {
      const stationCode = f.codiceStazione || f.id || f.codLocOrig || null;
      const station = stationCode ? getStationById(stationCode) : null;
      const coord = station?.lat != null && station?.lon != null ? { latitude: station.lat, longitude: station.lon } : null;

      const arrival = buildStopTiming({
        scheduledEpoch: f.arrivo_teorico ?? f.arrivoProgrammato ?? null,
        actualEpoch: f.arrivoReale ?? f.arrivo_effettivo ?? null,
        delayMinutes: f.ritardoArrivo ?? null,
      });
      const departure = buildStopTiming({
        scheduledEpoch: f.partenza_teorica ?? f.partenzaProgrammata ?? null,
        actualEpoch: f.partenzaReale ?? f.partenza_effettiva ?? null,
        delayMinutes: f.ritardoPartenza ?? null,
      });

      const platformPlanned = f.binarioProgrammatoPartenzaDescrizione ?? f.binarioProgrammato ?? null;
      const platformActual = normalizePlatformActualValue(f.binarioEffettivoPartenzaDescrizione ?? f.binarioReale ?? null);
      const platformChanged =
        f.binarioVariato === true ||
        (platformPlanned != null &&
          platformActual != null &&
          String(platformPlanned) !== String(platformActual));
      const isCurrent = currentStopIndex != null ? idx === currentStopIndex : currentStopCode ? stationCode === currentStopCode : false;
      const stopName = String(f.stazione || station?.name || stationCode || '').trim();
      const statusInfo = getStopStatusInfo(f);
      const isSuppressedStop =
        statusInfo.isSuppressedByStatus ||
        (stopName && suppressedStopsSet.has(stopName.toLowerCase()));
      return {
        id: stationCode || `${trainNumber}-${idx}`,
        stationCode,
        name: f.stazione || station?.name || stationCode || '—',
        coord,
        isCurrent,
        arrival,
        departure,
        platformPlanned,
        platformActual,
        platformChanged,
        isSuppressedStop,
        isExtraStop: statusInfo.isExtraStop,
        executivePosition: getExecutivePosition(f),
        smartAvailable: hasSmartFeature(f),
      };
    });

    const technical = raw.technical || raw.idTecnico || null;
    const originCode = raw.originCode || raw.codiceOrigine || null;
    const referenceEpochMs = raw.referenceTimestamp || raw.epochMs || null;

    const globalDelay =
      typeof computed?.globalDelay === 'number' ? computed.globalDelay : typeof data.ritardo === 'number' ? data.ritardo : null;

    const journeyStateCode = computed?.journeyState?.state || null;
    const journeyStateLabel = computed?.journeyState?.label || null;

	      const buildPositionText = () => {
	        // Arrivato
	        if (journeyStateCode === 'COMPLETED' || data.arrivato === true) {
	          return `Arrivato a ${data.destinazione || 'destinazione'}`;
	        }

	        // Soppresso/parziale
	        if (
	          journeyStateCode === 'CANCELLED' ||
	          data.circolante === false ||
	          data.trenoSoppresso === true ||
	          data.isSoppresso === true ||
	          data.isCancelled === true
	        ) {
	          const lastSeen = buildLastSeenText({
	            stationName: computed?.currentStop?.stationName || null,
	            epochMs: computed?.currentStop?.timestamp ?? data.ultimoRilev ?? null,
	          });
	          if (lastSeen) return `Ultimo rilevamento: ${lastSeen}`;
	          return 'Soppresso';
	        }
      const inStationFlag = data.inStazione === true || data.isInStazione === true || data.isInStation === true;
      const cur = computed?.currentStop;
      const originName = data.origine || stops[0]?.name || null;
      const originDepartureText =
        departureTiming?.actual && departureTiming.actual !== '—'
          ? departureTiming.actual
          : departureTiming?.predicted && departureTiming.predicted !== '—'
            ? departureTiming.predicted
            : departureTiming?.scheduled && departureTiming.scheduled !== '—'
              ? departureTiming.scheduled
              : null;
      const originDepartureEpoch =
        departureTiming?.actualEpoch ?? departureTiming?.predictedEpoch ?? departureTiming?.scheduledEpoch ?? null;
      const originDepartureInMinutes = formatMinutesLong(
        minutesUntilEpoch(originDepartureEpoch)
      );
      const hasOriginDepartureActual =
        Boolean(departureTiming?.actualEpoch) || (typeof departureTiming?.actual === 'string' && departureTiming.actual !== '—');

      if (inStationFlag && !cur?.stationName && originName) {
        if (!hasOriginDepartureActual && originDepartureText) {
          return `In partenza da ${originName} alle ${originDepartureText}${originDepartureInMinutes ? `, ${originDepartureInMinutes}` : ''}`;
        }
        return `Fermo a ${originName}`;
      }

      // Non partito
      if (data.nonPartito === true || journeyStateCode === 'PLANNED') {
        if (originName && originDepartureText && !hasOriginDepartureActual) {
          return `Partirà da ${originName} alle ${originDepartureText}${originDepartureInMinutes ? `, ${originDepartureInMinutes}` : ''}`;
        }
        return journeyStateLabel || 'Programmato';
      }

      // Posizione attuale
	        if (cur?.stationName) {
	          if (inStationFlag) {
	            return `Fermo a ${cur.stationName}`;
	          }

	          const next = currentStopIndex != null ? stops[currentStopIndex + 1]?.name : null;
	          if (next) {
	            return `In viaggio tra ${cur.stationName} e ${next}`;
	          }
	          return 'In viaggio';
	        }

      return journeyStateLabel || 'Stato non disponibile';
    };

    const positionText = buildPositionText();
    const lastSeenEpochMs = computed?.currentStop?.timestamp ?? data.ultimoRilev ?? null;
    const lastSeenStationName =
      computed?.currentStop?.stationName ||
      (stops.find((s) => s.isCurrent)?.name ?? null) ||
      (journeyStateCode === 'COMPLETED' ? data.destinazione || null : null) ||
      null;
    const lastDetectionText = buildLastSeenText({ stationName: lastSeenStationName, epochMs: lastSeenEpochMs });
    const idParts = [trainTypeLabel, trainNumber, technical || ''].filter(Boolean);

    return {
      kind: 'train',
      train: {
        id: idParts.join('-'),
        type: trainTypeLabel,
        kindFullName: trainKindFullName,
        kindCode: trainKind?.sigla || trainKind?.code || null,
        kindCategory: trainKind?.category || null,
        operator: trainOperator,
        number: trainNumber,
        serviceStatusLabel,
        from: data.origine,
        to: data.destinazione,
        delayMinutes: globalDelay,
        isSuppressed:
          journeyStateCode === 'CANCELLED' ||
          data.circolante === false ||
          data.trenoSoppresso === true ||
          data.isSoppresso === true ||
          data.isCancelled === true,
        isInStation: data.inStazione === true || data.isInStazione === true || data.isInStation === true,
        journeyStateCode,
        journeyStateLabel,
        positionText,
        lastSeenEpochMs,
        lastSeenStationName,
        lastDetectionText,
        originCode,
        technical,
        referenceEpochMs,
        hasExecutive,
        hasSmart,
        departure: departureTiming,
        arrival: arrivalTiming,
        stops,
      },
    };
  };

  async function loadRecentTrains() {
    const recent = await getRecentTrains(5);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRecentTrains(recent);
    setRecentTrainsLoaded(true);
  }

  const refreshRecentTrains = async () => {
    setRecentRefreshing(true);
    try {
      const recent = await getRecentTrains(5);
      const updated = await Promise.all(
        (Array.isArray(recent) ? recent : []).map(async (t) => {
          const trainNumber = t?.number;
          if (!trainNumber) return t;
          try {
            const normalized = await fetchTrainStatusNormalized(trainNumber);
            if (normalized?.kind !== 'train' || !normalized.train) return t;

            return {
              ...t,
              delayMinutes: normalized.train.delayMinutes ?? null,
              journeyStateCode: normalized.train.journeyStateCode ?? null,
              journeyStateLabel: normalized.train.journeyStateLabel ?? null,
              isSuppressed: normalized.train.isSuppressed === true,
              isInStation: normalized.train.isInStation === true,
            };
          } catch {
            return t;
          }
        })
      );
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setRecentTrains(updated);
      await overwriteRecentTrains(updated);
    } finally {
      setRecentRefreshing(false);
    }
  };

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

  const handleUndo = async () => {
    if (!undoPayload) return;
    hapticSelection();

    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    if (undoPayload.kind === 'single' && undoPayload.train) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await saveRecentTrain(undoPayload.train);
      await loadRecentTrains();
    }

    if (undoPayload.kind === 'all' && Array.isArray(undoPayload.trains)) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await overwriteRecentTrains(undoPayload.trains);
      await loadRecentTrains();
    }

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

  const handleDeleteRecentTrain = async (train) => {
    if (!train?.id) return;
    hapticImpact(ImpactFeedbackStyle.Medium);
    setRecentTrains((prev) => prev.filter((item) => item?.id !== train.id));
    await removeRecentTrain(train.id);
    showUndoToast({
      payload: { kind: 'single', train },
      message: train?.number ? `Rimosso “${train.type} ${train.number}”` : 'Treno rimosso',
    });
  };

	  const handleClearRecentTrains = () => {
	    hapticSelection();
	    Alert.alert(
	      'Cancella treni recenti',
	      'Vuoi rimuovere tutti i treni recenti?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Cancella',
          style: 'destructive',
          onPress: async () => {
            hapticImpact(ImpactFeedbackStyle.Heavy);
            const previous = Array.isArray(recentTrains) ? [...recentTrains] : [];
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            await clearRecentTrains();
            await loadRecentTrains();

            if (previous.length > 0) {
              const count = previous.length;
              showUndoToast({
                payload: { kind: 'all', trains: previous },
                message: count === 1 ? '1 treno recente cancellato' : `${count} treni recenti cancellati`,
              });
            }
          },
        },
      ]
    );
  };

  async function fetchTrainStatusNormalized(
    trainNumberRaw,
    { choice = null, originName = null, technical = null, originCode = null, epochMs = null, timestampRiferimento = null, date = null } = {}
  ) {
    const num = String(trainNumberRaw || '').trim();
    if (num.length < 3) {
      return { kind: 'empty', message: '' };
    }
    const res = await getTrainStatus(num, { choice, originName, technical, originCode, epochMs, timestampRiferimento, date });
    return normalizeTrainStatusResponse(res, num, { choice, originName, technical, originCode, epochMs, timestampRiferimento, date });
  }

  const buildTrainSelectionResults = (trainNumber, options) => {
    const num = String(trainNumber || '').trim();
    return (options || []).map((o) => ({
      kind: 'option',
      id: String(o.choice ?? o.technical ?? o.timestampRiferimento ?? o.date ?? `${num}-${o.originName ?? ''}`),
      trainNumber: num,
      label: o.label,
      choice: o.choice ?? null,
      originName: o.originName ?? null,
      technical: o.technical,
      originCode: o.originCode,
      epochMs: o.epochMs,
      timestampRiferimento: o.timestampRiferimento,
      date: o.date,
    }));
  };

  const runTrainSearch = async (
    trainNumberRaw,
    {
      choice = null,
      originName = null,
      technical = null,
      originCode = null,
      epochMs = null,
      timestampRiferimento = null,
      date = null,
      mode = 'default',
    } = {}
  ) => {
    const token = ++lastSearchTokenRef.current;
    const num = String(trainNumberRaw || '').trim();
    const isRefresh = mode === 'refresh';

    if (num.length < 3) {
      setSearchLoading(false);
      setSearchRefreshing(false);
      setSearchError('');
      setSearchHint('');
      setSearchResults([]);
      return { kind: 'empty', message: '' };
    }

    if (isRefresh) {
      setSearchRefreshing(true);
    } else {
      setSearchLoading(true);
    }
    setSearchError('');
    setSearchHint('');

    try {
      const normalized = await fetchTrainStatusNormalized(num, { choice, originName, technical, originCode, epochMs, timestampRiferimento, date });
      if (token !== lastSearchTokenRef.current) return { kind: 'empty', message: '' };

      if (normalized.kind === 'selection') {
        setSearchHint(normalized.message || 'Trovati più treni: scegli una corsa');
        setSearchResults(buildTrainSelectionResults(num, normalized.options || []));
        return normalized;
      }

      if (normalized.kind === 'train') {
        setSearchResults([{ kind: 'train', ...normalized.train }]);
        return normalized;
      }

      if (normalized.kind === 'empty') {
        setSearchHint(normalized.message || 'Nessun treno trovato');
        setSearchResults([]);
        return normalized;
      }

      setSearchError(normalized.message || 'Errore');
      setSearchResults([]);
      return normalized;
    } catch (error) {
      if (token !== lastSearchTokenRef.current) return { kind: 'empty', message: '' };
      setSearchError(error?.message || 'Errore di rete');
      setSearchResults([]);
      return { kind: 'error', message: error?.message || 'Errore di rete' };
    } finally {
      if (token === lastSearchTokenRef.current) {
        if (isRefresh) {
          setSearchRefreshing(false);
        } else {
          setSearchLoading(false);
        }
      }
    }
  };

  const openTrainWithLoading = async (
    trainNumberRaw,
    {
      choice = null,
      originName = null,
      technical = null,
      originCode = null,
      epochMs = null,
      timestampRiferimento = null,
      date = null,
      haptics = true,
      stacked = false,
    } = {}
  ) => {
    const num = String(trainNumberRaw || '').trim();
    if (num.length < 3) {
      return { kind: 'empty', message: '' };
    }

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    if (haptics !== false) {
      hapticModalOpen();
    }
    clearSearch();

    const token = ++trainModalLoadTokenRef.current;
    setTrainModalStacked(Boolean(stacked));
    setTrainModalLoading(true);
    setLastTrainRefreshEpochMs(null);
    setShowTrainModal(true);
    setSelectedTrain({
      number: num,
      type: '',
      choice,
      originName,
      technical,
      originCode,
      timestampRiferimento,
      date,
    });

    try {
      const normalized = await fetchTrainStatusNormalized(num, {
        choice,
        originName,
        technical,
        originCode,
        epochMs: epochMs ?? null,
        timestampRiferimento,
        date,
      });
      if (token !== trainModalLoadTokenRef.current) return normalized;

      if (normalized.kind === 'train') {
        setTrainModalLoading(false);
        setSelectedTrain(normalized.train);
        setLastTrainRefreshEpochMs(Date.now());
        await saveRecentTrain(normalized.train);
        await loadRecentTrains();
        return normalized;
      }

      setTrainModalLoading(false);
      setShowTrainModal(false);
      setSelectedTrain(null);
      if (normalized.kind !== 'selection') {
        returnToStationRef.current = null;
      }

      if (normalized.kind === 'selection') {
        setSearchQuery(num);
        setSearchHint(normalized.message || 'Trovati più treni: scegli una corsa');
        setSearchResults(buildTrainSelectionResults(num, normalized.options || []));
        return normalized;
      }

      if (normalized.kind === 'empty') {
        setSearchQuery(num);
        setSearchHint(normalized.message || 'Nessun treno trovato');
        setSearchResults([]);
        return normalized;
      }

      setSearchQuery(num);
      setSearchError(normalized.message || 'Errore');
      setSearchResults([]);
      return normalized;
    } catch (error) {
      if (token !== trainModalLoadTokenRef.current) return { kind: 'empty', message: '' };
      setTrainModalLoading(false);
      setShowTrainModal(false);
      setSelectedTrain(null);
      returnToStationRef.current = null;
      setSearchQuery(num);
      setSearchError(error?.message || 'Errore di rete');
      setSearchResults([]);
      return { kind: 'error', message: error?.message || 'Errore di rete' };
    }
  };

  const handleSearch = (text) => {
    const digits = String(text || '').replace(/\D+/g, '');
    setSearchQuery(digits);
    setSearchLoading(false);
    setSearchRefreshing(false);
    setSearchError('');
    setSearchHint('');
    setSearchResults([]);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
    setSearchHint('');
    setSearchLoading(false);
    setSearchRefreshing(false);
    lastSearchTokenRef.current += 1;
  };

	  const openTrain = async (train, { refresh = false } = {}) => {
	    hapticModalOpen();
	    await saveRecentTrain(train);
	    await loadRecentTrains();
	    setShowTrainModal(true);
	    setTrainModalStacked(false);
	    setTrainModalLoading(false);
	    setSelectedTrain(train);
	    setLastTrainRefreshEpochMs(refresh ? null : Date.now());
    clearSearch();
    if (refresh) {
      await refreshSelectedTrain(train);
    }
  };

	  const openTrainFromOption = async (opt) => {
	    if (!opt?.trainNumber) return;
      await openTrainWithLoading(opt.trainNumber, {
        choice: opt.choice ?? null,
        originName: opt.originName ?? null,
        technical: opt.technical,
        originCode: opt.originCode,
        epochMs: opt.epochMs,
        timestampRiferimento: opt.timestampRiferimento ?? null,
        date: opt.date ?? null,
      });
    };

	  const closeTrainModal = ({ silent = false } = {}) => {
	    if (!silent) {
	      hapticModalClose();
	    }
		    invalidateRefresh();
	      trainModalLoadTokenRef.current += 1;
	    resetRefreshing();
	    setTrainModalLoading(false);
	    setShowTrainModal(false);
      setTrainModalStacked(false);
	    setSelectedTrain(null);

    const payload = returnToStationRef.current;
    if (payload?.station) {
      returnToStationRef.current = null;
      const reopenToken = Date.now();
      requestAnimationFrame(() => {
        navigation.navigate('CercaStazione', {
          reopenStation: payload.station,
          reopenStationToken: reopenToken,
          reopenStationPage: payload.page ?? 0,
        });
      });
      return;
    }

  };

  const renderTrainResultRow = ({ item }) => {
    const borderStyle = item?._noDivider === true ? { borderBottomWidth: 0 } : null;
		    if (item.kind === 'option') {
        const dateLabel = formatDateDDMMYY(item.date ?? item.timestampRiferimento ?? null);
        const optionLabel = item.label || dateLabel || 'Seleziona la corsa';
        const isDateOption = Boolean(item.date || item.timestampRiferimento || dateLabel);
        const optionSubtitle = isDateOption ? 'Seleziona la data di partenza' : 'Seleziona la corsa';
		      return (
	        <TouchableOpacity
	          style={[styles.resultItem, { borderBottomColor: theme.colors.border }, borderStyle]}
	          onPress={() => {
	            openTrainFromOption(item);
	          }}
	          activeOpacity={0.6}
	        >
          <View style={styles.resultLeft}>
            <Text style={[styles.resultTrain, { color: theme.colors.text }]} numberOfLines={1}>
              {optionLabel}
            </Text>
            <Text style={[styles.resultRoute, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {optionSubtitle}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} style={{ opacity: 0.35 }} />
        </TouchableOpacity>
      );
    }

    const isSuppressed = item?.isSuppressed === true || item?.journeyStateCode === 'CANCELLED';
    const trainDateLabel = getTrainDateLabel(item);
    const cancelColor = getJourneyStateColor('CANCELLED');
    const delayColors = isSuppressed
      ? { fg: cancelColor, bg: hexToRgba(cancelColor, 0.14) }
      : getDelayColors(item.delayMinutes);
    const delayText = isSuppressed ? 'Soppresso' : item.delayMinutes != null ? formatDelay(item.delayMinutes) : null;
    const journeyStateLabel =
      typeof item?.journeyStateLabel === 'string' && item.journeyStateLabel.trim()
        ? item.journeyStateLabel.trim()
        : null;
    const serviceStatusLabel =
      typeof item?.serviceStatusLabel === 'string' && item.serviceStatusLabel.trim()
        ? item.serviceStatusLabel.trim()
        : null;
    const primaryStatusLabel = isSuppressed
      ? null
      : pickPrimaryStatusLabel(item?.journeyStateCode, journeyStateLabel, serviceStatusLabel);
    const statusText = primaryStatusLabel || null;
    const serviceColors = serviceStatusLabel ? getServiceStatusColors(serviceStatusLabel) : null;
    const statusColor = (() => {
      if (isSuppressed) return cancelColor;
      if (item.delayMinutes != null) return delayColors.fg;
      if (serviceStatusLabel && primaryStatusLabel === serviceStatusLabel) return serviceColors?.fg || theme.colors.textSecondary;
      if (item?.journeyStateCode) return getJourneyStateColor(item.journeyStateCode);
      return theme.colors.textSecondary;
    })();
    const titleParts = getTrainTitleParts(item.type, item.number, item.operator);

	    return (
	      <TouchableOpacity
	        style={[styles.resultItem, { borderBottomColor: theme.colors.border }, borderStyle]}
	        onPress={() => openTrain(item)}
	        activeOpacity={0.6}
	      >
        <View style={styles.resultLeft}>
          <View style={styles.resultTitleRow}>
            <Text style={[styles.resultTrainKind, { color: getTrainSiglaColor(titleParts.sigla, theme) }]} numberOfLines={1}>
              {titleParts.sigla}
            </Text>
            {titleParts.showAv ? (
              <Text style={[styles.resultTrainKind, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                AV
              </Text>
            ) : null}
            <Text style={[styles.resultTrainNumber, { color: theme.colors.text }]} numberOfLines={1}>
              {titleParts.number}
            </Text>
            {trainDateLabel ? (
              <Text style={[styles.trainDateText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                {`del ${trainDateLabel}`}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.resultRoute, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {item.from} → {item.to}
          </Text>
          {delayText || statusText ? (
            <View style={styles.resultMetaRow}>
              {delayText ? (
                <View style={[styles.delayPill, { backgroundColor: delayColors.bg, borderColor: delayColors.fg }]}>
                  <Text style={[styles.delayPillText, { color: delayColors.fg }]}>{delayText}</Text>
                </View>
              ) : null}
              {statusText ? (
                <Text style={[styles.resultStatusText, { color: statusColor }]} numberOfLines={1}>
                  {statusText}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} style={{ opacity: 0.35 }} />
      </TouchableOpacity>
    );
  };

  const renderRecentTrainItem = (train, index) => {
    const titleParts = getTrainTitleParts(train.type, train.number, train.operator);
    const isSuppressed = train.isSuppressed === true || train.journeyStateCode === 'CANCELLED';
    const cancelColor = getJourneyStateColor('CANCELLED');
    const delayColors = isSuppressed
      ? { fg: cancelColor, bg: hexToRgba(cancelColor, 0.14) }
      : getDelayColors(train.delayMinutes);
    const delayText = isSuppressed ? 'Soppresso' : train.delayMinutes != null ? formatDelay(train.delayMinutes) : null;
    const statusBadgeLabel =
      train.journeyStateCode === 'COMPLETED'
        ? 'Concluso'
        : train.journeyStateCode === 'PLANNED'
          ? 'Programmato'
          : null;
    return (
      <View key={`${String(train.id ?? train.number ?? 'train')}-${index}`}>
        <SwipeableRow
          theme={theme}
          onDelete={() => handleDeleteRecentTrain(train)}
          onSwipeStart={() => setScrollEnabled(false)}
          onSwipeEnd={() => setScrollEnabled(true)}
          resetKey={swipeResetVersion}
        >
          <TouchableOpacity
            style={styles.listItem}
            onPress={() => openTrainWithLoading(train?.number || train?.trainNumber)}
            activeOpacity={0.6}
          >
            <View style={styles.listItemContent}>
              <View style={styles.listItemText}>
                <View style={styles.listTitleRow}>
                  <Text style={[styles.listItemKind, { color: getTrainSiglaColor(titleParts.sigla, theme) }]} numberOfLines={1}>
                    {titleParts.sigla}
                  </Text>
                  {titleParts.showAv ? (
                    <Text style={[styles.listItemKind, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                      AV
                    </Text>
                  ) : null}
                  <Text style={[styles.listItemTitle, { color: theme.colors.text }]} numberOfLines={1}>
                    {titleParts.number}
                  </Text>
                </View>
                <View style={styles.listItemRouteRow}>
                  <View style={styles.routeIndicator}>
                    <View style={[styles.routeDot, styles.routeDotHollow, { borderColor: theme.colors.textSecondary }]} />
                    <View style={[styles.routeLine, { backgroundColor: theme.colors.border }]} />
                    <View style={[styles.routeDot, { backgroundColor: theme.colors.textSecondary }]} />
                  </View>
                  <View style={styles.routeText}>
                    <Text style={[styles.listItemRouteFrom, { color: theme.colors.text }]} numberOfLines={1}>
                      {train.from}
                    </Text>
                    <Text style={[styles.listItemRouteTo, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                      {train.to}
                    </Text>
                  </View>
                </View>
              </View>
              {(delayText || statusBadgeLabel) ? (
                <View style={styles.listItemRight}>
                  {delayText ? (
                    <View style={[styles.delayPill, { backgroundColor: delayColors.bg, borderColor: delayColors.fg }]}>
                      <Text style={[styles.delayPillText, { color: delayColors.fg }]}>{delayText}</Text>
                    </View>
                  ) : null}
                  {statusBadgeLabel ? (
                    <Text style={[styles.listItemStatus, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                      {statusBadgeLabel}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.textSecondary}
                style={styles.listItemChevron}
              />
            </View>
          </TouchableOpacity>
        </SwipeableRow>
        {index < recentTrains.length - 1 ? <View style={[styles.listDivider, { backgroundColor: theme.colors.border }]} /> : null}
      </View>
    );
  };

	  const modalStops = Array.isArray(selectedTrain?.stops) ? selectedTrain.stops : [];
	  const modalCurrentStopIndex = modalStops.findIndex((s) => s?.isCurrent);
	  const modalDelayMinutes = selectedTrain?.delayMinutes ?? null;
	  const modalJourneyStateCode = selectedTrain?.journeyStateCode || null;
  const modalJourneyStateLabel =
    typeof selectedTrain?.journeyStateLabel === 'string' && selectedTrain.journeyStateLabel.trim()
      ? selectedTrain.journeyStateLabel.trim()
      : null;
  const modalServiceStatusLabel =
    typeof selectedTrain?.serviceStatusLabel === 'string' && selectedTrain.serviceStatusLabel.trim()
      ? selectedTrain.serviceStatusLabel.trim()
      : null;
  const modalPrimaryStatusLabel = pickPrimaryStatusLabel(
    modalJourneyStateCode,
    modalJourneyStateLabel,
    modalServiceStatusLabel
  );
  const showServiceStatusPill = Boolean(modalServiceStatusLabel && modalPrimaryStatusLabel === modalServiceStatusLabel);
  const showJourneyStatePill = Boolean(!showServiceStatusPill && modalJourneyStateLabel);
  const modalServiceColors = modalServiceStatusLabel ? getServiceStatusColors(modalServiceStatusLabel) : null;

  const minutesUntil = (epochMs) => {
    const ts = normalizeEpochMs(epochMs);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return Math.round((ts - Date.now()) / 60000);
  };

  const normalizeEpochMs = (value) => {
    const ts = Number(value);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return ts < 1e12 ? ts * 1000 : ts;
  };

  const normalizeHHmm = (value) => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return null;
    const match = raw.match(/(\d{1,2}:\d{2})/);
    return match ? match[1] : null;
  };

	  const formatInMinutes = (minutes) => {
	    if (!Number.isFinite(Number(minutes))) return null;
	    const m = Number(minutes);
	    if (m <= 0) return 'in arrivo';
	    if (m === 1) return 'tra ~1 min';
      if (m >= 60) {
        const hours = Math.floor(m / 60);
        const mins = m % 60;
        const hLabel = hours === 1 ? 'ora' : 'ore';
        if (mins === 0) return `tra ~${hours} ${hLabel}`;
        return `tra ~${hours} ${hLabel} e ${mins} min`;
      }
	    return `tra ~${m} min`;
	  };

  const parseOptionalIndex = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n;
  };

  const modalNextStopIndex = parseOptionalIndex(selectedTrain?.nextStopIndex);

  const modalNextStop = (() => {
    if (modalStops.length === 0) return null;
    if (modalJourneyStateCode === 'COMPLETED') return null;
    const idx = modalNextStopIndex;
    if (idx != null && idx >= 0 && idx < modalStops.length) return modalStops[idx];
    const name = typeof selectedTrain?.nextStopName === 'string' ? selectedTrain.nextStopName.trim() : '';
    if (!name) return null;
    const found = modalStops.find((s) => String(s?.name || '').trim().toLowerCase() === name.toLowerCase()) || null;
    return found;
  })();

		  const positionHeadlineText = (() => {
		    const stops = modalStops;
		    if (selectedTrain?.isSuppressed === true || selectedTrain?.journeyStateCode === 'CANCELLED') {
		      return selectedTrain?.positionText || null;
		    }
		    if (modalJourneyStateCode === 'COMPLETED') return selectedTrain?.positionText || null;
		    if (selectedTrain?.isInStation === true) return selectedTrain?.positionText || null;
		    const curIdx = modalCurrentStopIndex;
		    const pickBetween = (fromIdx, toIdx) => {
		      const a = stops[fromIdx]?.name || null;
		      const b = stops[toIdx]?.name || null;
		      if (!a || !b) return null;
		      return `In viaggio fra ${a} e ${b}`;
		    };

		    if (Number.isFinite(Number(curIdx)) && curIdx >= 0) {
		      const txt = pickBetween(curIdx, curIdx + 1);
		      if (txt) return txt;
		    }
		    return selectedTrain?.positionText || selectedTrain?.journeyStateLabel || null;
		  })();

  const isInTransit = /^In viaggio/i.test(String(positionHeadlineText || '').trim());

  const modalLastDetectionText = (() => {
    if (!selectedTrain) return null;
    if (selectedTrain?.isSuppressed === true || selectedTrain?.journeyStateCode === 'CANCELLED') return null;
    if (modalJourneyStateCode === 'COMPLETED') return null;
    if (selectedTrain?.isInStation === true) return null;
    if (selectedTrain?.journeyStateCode === 'PLANNED') return null;
    if (!isInTransit) return null;
    if (selectedTrain?.lastDetectionText) return `Ultimo rilevamento: ${selectedTrain.lastDetectionText}`;
    const stationName = selectedTrain?.lastSeenStationName || null;
    const epochMs = selectedTrain?.lastSeenEpochMs ?? null;
    if (!stationName || !epochMs) return null;

    const lastSeen = buildLastSeenText({
      stationName,
      epochMs,
      includeDate: true,
    });
    if (!lastSeen) return null;
    return `Ultimo rilevamento: ${lastSeen}`;
  })();

  const modalLastDetectionAgeMinutes = (() => {
    const epochMs = selectedTrain?.lastSeenEpochMs;
    if (!Number.isFinite(epochMs)) return null;
    const ageMs = Date.now() - epochMs;
    if (!Number.isFinite(ageMs) || ageMs < 0) return null;
    return Math.floor(ageMs / 60000);
  })();

  const isDetectionStale = modalLastDetectionAgeMinutes != null && modalLastDetectionAgeMinutes > 10;

  const showStaleDetectionWarning =
    Boolean(modalLastDetectionText) && isDetectionStale;

  const buildTimingDisplay = (timing) => {
    if (!timing) return { scheduled: '—', updated: null, hasUpdate: false, meta: null, main: '—' };
    const actual = typeof timing.actual === 'string' && timing.actual !== '—' ? timing.actual : null;
    const predicted = typeof timing.predicted === 'string' && timing.predicted !== '—' ? timing.predicted : null;
    const scheduled = typeof timing.scheduled === 'string' && timing.scheduled !== '—' ? timing.scheduled : null;
    const updatedRaw = actual || predicted || null;
    const updated = updatedRaw ? (predicted && !actual ? `~ ${updatedRaw}` : updatedRaw) : null;
    const hasUpdate = Boolean(updatedRaw && scheduled && updatedRaw !== scheduled);
    const meta = actual ? 'Reale' : predicted ? 'Stimato' : null;
    const main = hasUpdate ? null : updated || scheduled || '—';
    return { scheduled: scheduled || '—', updated, hasUpdate, meta, main };
  };

  const trainTitleParts = getTrainTitleParts(selectedTrain?.type, selectedTrain?.number, selectedTrain?.operator);
  const departureDisplay = buildTimingDisplay(selectedTrain?.departure);
  const arrivalDisplay = buildTimingDisplay(selectedTrain?.arrival);
  const skeletonPulse = skeletonPulseRef.current;
  const infoReveal = infoRevealRef.current;
  const lastRefreshTextColor = pickReadableTextColor(
    theme.colors.textSecondary,
    theme.colors.background,
    theme.colors.text
  );
  const skeletonBaseStyle = {
    backgroundColor: theme.colors.border,
  };
  const skeletonPulseStyle = {
    opacity: skeletonPulse,
  };
  const infoRevealStyle = {
    opacity: infoReveal,
    transform: [
      {
        translateY: infoReveal.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
      },
      {
        scale: infoReveal.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }),
      },
    ],
  };

  const normalizePlatformValue = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : null;
    }
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!raw || raw === '—') return null;
    return raw;
  };

  const premiumKind = String(selectedTrain?.kindCode || selectedTrain?.type || '').trim().toUpperCase();
  const isPremiumTrain =
    premiumKind.startsWith('FR') ||
    premiumKind.startsWith('ITA') ||
    premiumKind.startsWith('FRECCIAROSSA') ||
    premiumKind === 'ITALO';

	  const nextStopPlatformActual = normalizePlatformValue(modalNextStop?.platformActual);
	  const nextStopPlatformPlanned = normalizePlatformValue(modalNextStop?.platformPlanned);
	  const nextStopPlatformText = nextStopPlatformActual ?? nextStopPlatformPlanned ?? null;
  const nextStopExecutiveText = (() => {
    if (!isPremiumTrain || !modalNextStop?.executivePosition) return null;
    const raw = String(modalNextStop.executivePosition).trim();
    return raw || null;
  })();
  const nextStopSmart = isPremiumTrain && modalNextStop?.smartAvailable === true;

	  const nextStopEtaEpoch = (() => {
	    if (!modalNextStop) return null;
	    const t = modalNextStop.arrival;
	    if (t?.actualEpoch && modalCurrentStopIndex >= 0 && modalNextStopIndex != null && modalNextStopIndex <= modalCurrentStopIndex) {
	      return normalizeEpochMs(t.actualEpoch);
	    }
	    if (t?.predictedEpoch) return normalizeEpochMs(t.predictedEpoch);
	    if (t?.scheduledEpoch) {
	      const base = normalizeEpochMs(t.scheduledEpoch);
	      if (base && Number.isFinite(Number(modalDelayMinutes))) {
	        return base + Number(modalDelayMinutes) * 60000;
	      }
	      return base;
	    }
	    return null;
	  })();

	  const nextStopEtaMinutes = (() => {
	    if (!modalNextStop) return null;
	    const t = modalNextStop.arrival;
	    const canUseActual =
	      modalCurrentStopIndex >= 0 && modalNextStopIndex != null && modalNextStopIndex <= modalCurrentStopIndex;
	    const actual = canUseActual && t?.actual && t.actual !== '—' ? t.actual : null;
	    const predicted = t?.predicted && t.predicted !== '—' ? t.predicted : null;
	    const scheduled = t?.scheduled && t.scheduled !== '—' ? t.scheduled : null;
	    const scheduledWithDelay =
	      scheduled && Number.isFinite(Number(modalDelayMinutes)) ? addMinutesToHHmm(scheduled, modalDelayMinutes) : null;
	    const fallback = selectedTrain?.nextStopArrivalEstimated || selectedTrain?.nextStopArrivalPlanned || null;
	    const hhmm = normalizeHHmm(actual || predicted || scheduledWithDelay || scheduled || fallback);
	    if (hhmm) return minutesUntilHHmm(hhmm);
	    return minutesUntil(nextStopEtaEpoch);
	  })();
	  const nextStopInMinutesText = formatInMinutes(nextStopEtaMinutes);
	  const nextStopHasActualArrival =
	    modalCurrentStopIndex >= 0 &&
	    modalNextStopIndex != null &&
	    modalNextStopIndex <= modalCurrentStopIndex &&
	    (Boolean(modalNextStop?.arrival?.actualEpoch) ||
	      (typeof modalNextStop?.arrival?.actual === 'string' && modalNextStop.arrival.actual !== '—'));

  const nextStopArrivesText = (() => {
		    if (!modalNextStop) return null;
        if (isDetectionStale) return null;
        if (!Number.isFinite(Number(nextStopEtaMinutes))) return null;
        if (nextStopHasActualArrival && nextStopEtaMinutes < 0) return null;
        if (Math.abs(nextStopEtaMinutes) < 2) return 'Arrivo imminente';
        if (nextStopEtaMinutes < 0) return null;
		    return nextStopInMinutesText || null;
		  })();
  const canOpenNextStop = ALLOW_MODAL_TO_MODAL_NAV && Boolean(modalNextStop?.name && modalNextStop.name !== '—');

		  const trainResults = useMemo(() => (Array.isArray(searchResults) ? searchResults : []), [searchResults]);
	    const resultsForRender = useMemo(
        () => trainResults.map((r, idx) => ({ ...r, _noDivider: idx === trainResults.length - 1 })),
        [trainResults]
      );
		  const showResultsPanel = searchLoading || searchError || searchHint || trainResults.length > 0;
		  const scrollRefreshing = showResultsPanel ? searchRefreshing : recentRefreshing;
      const handleScrollRefresh = () => {
	    if (showResultsPanel) {
	      runTrainSearch(searchQuery, { mode: 'refresh', epochMs: Date.now() });
    } else {
      refreshRecentTrains();
    }
  };

      const modalHeaderTop = MODAL_HEADER_TOP_OFFSET;
      const modalTopSpacerHeight = MODAL_TOP_SPACER_HEIGHT;

          const insets = useSafeAreaInsets();
          const tabBarHeight = Platform.OS === 'ios' ? 76 : 64;
          const bottomPadding = SPACE.xxl + tabBarHeight + insets.bottom;
		  return (
		    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <AnimatedScreen>
            <View style={styles.headerContainer}>
              <View style={styles.searchSection}>
                <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>CERCA TRENO</Text>
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
                    placeholder="Numero treno (es. 9544)"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={searchQuery}
                    onChangeText={handleSearch}
                    onSubmitEditing={() => openTrainWithLoading(searchQuery)}
                    returnKeyType="search"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  />
                  {searchQuery.length > 0 ? (
                    <TouchableOpacity
                      onPress={() => {
                        hapticSelection();
                        clearSearch();
                      }}
                      activeOpacity={0.6}
                    >
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
                alwaysBounceVertical
                keyboardShouldPersistTaps="handled"
                refreshControl={
                  !showResultsPanel ? (
                    <RefreshControl refreshing={scrollRefreshing} onRefresh={handleScrollRefresh} tintColor={theme.colors.accent} />
                  ) : null
                }
              >
                {showResultsPanel ? (
                  <View style={styles.resultsContentContainer}>
                    <View
                      style={[
                        styles.resultsContainer,
                        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
                        cardShadow(theme),
                      ]}
                    >
                      {searchLoading ? (
                        <CardLoading label="Caricamento..." color={theme.colors.accent} textStyle={{ color: theme.colors.textSecondary }} />
                      ) : null}

                      {!searchLoading && (searchError || searchHint) && resultsForRender.length === 0 ? (
                        <View style={styles.resultsEmptyState}>
                          <Text style={[styles.resultsEmptyTitle, { color: theme.colors.text }]}>
                            {searchError ? 'Errore' : 'Nessun risultato'}
                          </Text>
                          <Text style={[styles.resultsEmptySubtitle, { color: theme.colors.textSecondary }]}>
                            {searchError || searchHint}
                          </Text>
                        </View>
                      ) : null}

                      {resultsForRender.length > 0
                        ? resultsForRender.map((item, idx) => (
                            <React.Fragment key={`${String(item.id ?? 'train')}-${idx}`}>{renderTrainResultRow({ item })}</React.Fragment>
                          ))
                        : null}
                    </View>
                  </View>
                ) : !recentTrainsLoaded ? (
                  <SectionSkeleton title="TRENI RECENTI" rows={3} />
                ) : recentTrains.length > 0 ? (
                  <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary, marginBottom: 0, marginLeft: 0 }]}>
                        TRENI RECENTI
                      </Text>
                      <TouchableOpacity onPress={handleClearRecentTrains} activeOpacity={0.7} hitSlop={HIT_SLOP.sm}>
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
                      {recentTrains.map((t, i) => renderRecentTrainItem(t, i))}
                    </View>
                  </View>
                ) : (
                  <SectionPlaceholderCard
                    title="TRENI RECENTI"
                    description="Qui trovi i treni che hai consultato di recente, così puoi riaprirli velocemente e attivare il tracciamento."
                  />
                )}
              </ScrollView>

            </View>

        {undoVisible && (
          <Animated.View
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
                floatingShadow(theme),
              ]}
            >
              <Text style={[styles.undoToastText, { color: theme.colors.text }]} numberOfLines={1}>
                {undoMessage}
              </Text>
              {undoPayload ? (
                <TouchableOpacity onPress={handleUndo} activeOpacity={0.75} hitSlop={HIT_SLOP.sm}>
                  <Text style={[styles.undoToastAction, { color: theme.colors.accent }]}>ANNULLA</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </Animated.View>
        )}
            </AnimatedScreen>

        {/* Modal treno */}
        {showTrainModal ? (
          <Modal
            visible={true}
            animationType="slide"
            presentationStyle={trainModalStacked ? 'overFullScreen' : 'pageSheet'}
            onRequestClose={closeTrainModal}
            onDismiss={() => {
              if (showTrainModal) {
                closeTrainModal({ silent: true });
              }
            }}
          >
            <View style={[styles.modalContainer, { backgroundColor: theme.colors.background, flex: 1 }]}>
              <View style={[styles.modalHeader, { backgroundColor: 'transparent', top: modalHeaderTop }]}>
                <View style={styles.modalHeaderRow}>
                        <TouchableOpacity
                          onPress={closeTrainModal}
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
                          accessibilityLabel="Chiudi"
                        >
                          <Ionicons name="close" size={20} color={theme.colors.text} />
                        </TouchableOpacity>

				                <View style={styles.modalHeaderRight}>
				                {lastTrainRefreshEpochMs ? (() => {
				                  const ageMs = Date.now() - lastTrainRefreshEpochMs;
				                  const dotColor = ageMs > 60000 ? theme.colors.destructive : theme.colors.success;
				                  return (
				                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
				                      <View style={[styles.lastRefreshDot, { backgroundColor: dotColor }]} />
				                      <Text
                            style={[styles.lastRefreshText, { color: lastRefreshTextColor }]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
				                        {`Ultimo refresh: ${formatTime(lastTrainRefreshEpochMs)}`}
				                      </Text>
				                    </View>
				                  );
				                })() : null}
				                {trainModalRefreshing ? (
				                  <ModernSpinner size={18} thickness={2} color={theme.colors.accent} />
				                ) : null}
			                    <TouchableOpacity
			                      onPress={async () => {
			                        hapticSelection();
			                        await refreshSelectedTrain();
			                      }}
			                      style={[
			                        styles.closeButton,
		                        {
		                          backgroundColor: theme.colors.card,
                              borderColor: theme.colors.border,
                              borderWidth: BORDER.card,
	                          opacity: trainModalRefreshing || trainModalLoading ? 0.6 : 1,
	                        },
	                        iconButtonShadow(theme),
	                      ]}
	                      activeOpacity={0.7}
	                      disabled={trainModalRefreshing || trainModalLoading}
	                      hitSlop={HIT_SLOP.md}
	                      accessibilityLabel="Ricarica"
	                    >
                      <Ionicons name="refresh" size={20} color={theme.colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={styles.modalScrollArea}>
                <ScrollView
                  style={{ flex: 1 }}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 32 }}
                >
              {trainModalLoading ? (
                <>
                  <View style={[styles.modalTopSpacer, { height: modalTopSpacerHeight }]} />

                  <View style={styles.modalContentWrap}>
                    <View style={styles.modalHeaderContent}>
                      <View style={styles.modalTitleRow}>
                        <Animated.View style={[styles.skeletonTitle, skeletonBaseStyle, skeletonPulseStyle]} />
                        <Animated.View style={[styles.skeletonTitleSm, skeletonBaseStyle, skeletonPulseStyle]} />
                      </View>
                      <Animated.View style={[styles.skeletonRouteLine, skeletonBaseStyle, skeletonPulseStyle]} />
                      <View style={styles.skeletonTimesRow}>
                        <View style={styles.skeletonTimeCol}>
                          <Animated.View style={[styles.skeletonTimeLabel, skeletonBaseStyle, skeletonPulseStyle]} />
                          <Animated.View style={[styles.skeletonTimeValue, skeletonBaseStyle, skeletonPulseStyle]} />
                        </View>
                        <View style={[styles.skeletonTimeDivider, { backgroundColor: theme.colors.border }]} />
                        <View style={styles.skeletonTimeCol}>
                          <Animated.View style={[styles.skeletonTimeLabel, skeletonBaseStyle, skeletonPulseStyle]} />
                          <Animated.View style={[styles.skeletonTimeValue, skeletonBaseStyle, skeletonPulseStyle]} />
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={styles.modalContentWrap}>
                    <View
                      style={[
                        styles.skeletonCard,
                        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
                        cardShadow(theme),
                      ]}
                    >
                      <View style={styles.skeletonPillsRow}>
                        <Animated.View style={[styles.skeletonPill, skeletonBaseStyle, skeletonPulseStyle]} />
                        <Animated.View style={[styles.skeletonPillSm, skeletonBaseStyle, skeletonPulseStyle]} />
                      </View>
                      <Animated.View style={[styles.skeletonBlockWide, skeletonBaseStyle, skeletonPulseStyle]} />
                      <Animated.View style={[styles.skeletonBlock, skeletonBaseStyle, skeletonPulseStyle]} />
                    </View>
                    <View
                      style={[
                        styles.skeletonCard,
                        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
                        cardShadow(theme),
                      ]}
                    >
                      <Animated.View style={[styles.skeletonMap, skeletonBaseStyle, skeletonPulseStyle]} />
                    </View>
                    <View
                      style={[
                        styles.skeletonCard,
                        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
                        cardShadow(theme),
                      ]}
                    >
                      {[0, 1, 2, 3].map((idx) => (
                        <View key={`sk-stop-${idx}`} style={styles.skeletonRowGroup}>
                          <Animated.View style={[styles.skeletonRowWide, skeletonBaseStyle, skeletonPulseStyle]} />
                          <Animated.View style={[styles.skeletonRowSm, skeletonBaseStyle, skeletonPulseStyle]} />
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <View style={[styles.modalTopSpacer, { height: modalTopSpacerHeight }]} />

                  {/* Header con info principale */}
                  <View style={styles.modalContentWrap}>
                    <View style={styles.modalHeaderContent}>
                      {(() => {
                        const trainDateLabel = getTrainDateLabel(selectedTrain);
                        return (
                          <View style={styles.modalTitleRow}>
                            <Text
                              style={[
                                styles.modalTrainSigla,
                                {
                                  color: getTrainSiglaColor(trainTitleParts.sigla, theme),
                                  fontFamily: trainTitleParts.sigla === 'FA' ? FONTS.bold : styles.modalTrainSigla.fontFamily,
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {trainTitleParts.sigla}
                            </Text>
                            {trainTitleParts.showAv ? (
                              <Text
                                style={[
                                  styles.modalTrainAv,
                                  {
                                    color: theme.colors.textSecondary,
                                    fontFamily: trainTitleParts.sigla === 'FA' ? FONTS.bold : styles.modalTrainAv.fontFamily,
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                AV
                              </Text>
                            ) : null}
                            <Text style={[styles.modalTrainNumber, { color: theme.colors.text }]} numberOfLines={1}>
                              {trainTitleParts.number}
                            </Text>
                            {trainDateLabel ? (
                              <Text style={[styles.trainDateText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                {`del ${trainDateLabel}`}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })()}

                      {selectedTrain ? (() => {
                        const operatorDisplayName = getOperatorDisplayName(selectedTrain);
                        if (!operatorDisplayName) return null;
                        return (
                          <Text style={[styles.modalOperatorLine, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                            {`di ${operatorDisplayName}`}
                          </Text>
                        );
                      })() : null}

                      <Text style={[styles.modalRoute, { color: theme.colors.text }]} numberOfLines={1}>
                        {selectedTrain?.from} → {selectedTrain?.to}
                      </Text>

                      <View style={styles.modalTimesRow}>
                        <View style={[styles.modalTimeBlock, styles.modalTimeBlockLeft]}>
                          <Text style={[styles.modalTimeLabel, { color: theme.colors.textSecondary }]}>Partenza</Text>
                          {departureDisplay.hasUpdate ? (
                            <View style={styles.modalTimeValueRow}>
                              <Text
                                style={[
                                  styles.modalTimeValue,
                                  styles.modalTimeValueStrike,
                                  { color: theme.colors.textSecondary },
                                ]}
                              >
                                {departureDisplay.scheduled}
                              </Text>
                              <Text style={[styles.modalTimeValue, { color: theme.colors.text }]}>{departureDisplay.updated}</Text>
                            </View>
                          ) : (
                            <Text style={[styles.modalTimeValue, { color: theme.colors.text }]}>{departureDisplay.main}</Text>
                          )}
                          {departureDisplay.meta ? (
                            <Text style={[styles.modalTimeMeta, { color: theme.colors.textSecondary }]}>{departureDisplay.meta}</Text>
                          ) : null}
                        </View>
                        <View style={[styles.modalTimeBlock, styles.modalTimeBlockDivider, { borderLeftColor: theme.colors.border }]}>
                          <Text style={[styles.modalTimeLabel, { color: theme.colors.textSecondary }]}>Arrivo</Text>
                          {arrivalDisplay.hasUpdate ? (
                            <View style={styles.modalTimeValueRow}>
                              <Text
                                style={[
                                  styles.modalTimeValue,
                                  styles.modalTimeValueStrike,
                                  { color: theme.colors.textSecondary },
                                ]}
                              >
                                {arrivalDisplay.scheduled}
                              </Text>
                              <Text style={[styles.modalTimeValue, { color: theme.colors.text }]}>{arrivalDisplay.updated}</Text>
                            </View>
                          ) : (
                            <Text style={[styles.modalTimeValue, { color: theme.colors.text }]}>{arrivalDisplay.main}</Text>
                          )}
                          {arrivalDisplay.meta ? (
                            <Text style={[styles.modalTimeMeta, { color: theme.colors.textSecondary }]}>{arrivalDisplay.meta}</Text>
                          ) : null}
                        </View>
                      </View>

                    </View>
                    <View style={[styles.modalHeroDivider, { backgroundColor: theme.colors.border }]} />
                  </View>

                  <Animated.View style={[styles.modalBodyWrap, infoRevealStyle]}>
			                  <View style={styles.sectionBlock}>
			                    <Text style={[styles.sectionTitle, styles.modalSectionTitle, { color: theme.colors.textSecondary }]}>INFO IN TEMPO REALE</Text>
				                    <View style={[styles.summaryCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
                              {(selectedTrain?.delayMinutes != null && !selectedTrain?.isSuppressed) || modalServiceStatusLabel || modalJourneyStateLabel ? (
                                <View style={styles.summaryBadgesRow}>
                                  {selectedTrain?.delayMinutes != null && !selectedTrain?.isSuppressed ? (
                                    (() => {
                                      const colors = getDelayColors(selectedTrain.delayMinutes);
                                      return (
                                        <View style={[styles.delayPill, { backgroundColor: colors.bg, borderColor: colors.fg }]}>
                                          <Ionicons name="time-outline" size={12} color={colors.fg} />
                                          <Text style={[styles.delayPillText, { color: colors.fg }]}>
                                            {formatDelay(selectedTrain.delayMinutes)}
                                          </Text>
                                        </View>
                                      );
                                    })()
                                  ) : null}
                                  {showServiceStatusPill && modalServiceStatusLabel ? (
                                    <View
                                      style={[
                                        styles.statePill,
                                        {
                                          borderColor: modalServiceColors?.fg || theme.colors.textSecondary,
                                          backgroundColor: modalServiceColors?.bg || theme.colors.border + '40',
                                        },
                                      ]}
                                    >
                                      <Ionicons name="information-circle-outline" size={12} color={modalServiceColors?.fg || theme.colors.textSecondary} />
                                      <Text style={[styles.statePillText, { color: modalServiceColors?.fg || theme.colors.textSecondary }]} numberOfLines={1}>
                                        {modalServiceStatusLabel}
                                      </Text>
                                    </View>
                                  ) : showJourneyStatePill && modalJourneyStateLabel ? (
                                    (() => {
                                      const stateColor = getJourneyStateColor(selectedTrain?.journeyStateCode || 'UNKNOWN');
                                      return (
                                        <View
                                          style={[
                                            styles.statePill,
                                            {
                                              borderColor: stateColor,
                                              backgroundColor: hexToRgba(stateColor, 0.12),
                                            },
                                          ]}
                                        >
                                          <Ionicons name="train-outline" size={12} color={stateColor} />
                                          <Text style={[styles.statePillText, { color: stateColor }]} numberOfLines={1}>
                                            {modalJourneyStateLabel}
                                          </Text>
                                        </View>
                                      );
                                    })()
                                  ) : null}
                                </View>
                              ) : null}
		                      {positionHeadlineText ? (
		                        <Text style={[styles.summaryTitle, { color: theme.colors.text }]} numberOfLines={3}>
		                          {positionHeadlineText}
		                        </Text>
		                      ) : null}

                          {modalLastDetectionText ? (
                            <>
                              {showStaleDetectionWarning ? (
                                <View style={styles.lastDetectionWarning}>
                                  <Ionicons name="warning-outline" size={14} color={theme.colors.destructive} />
                                  <Text style={[styles.lastDetectionWarningText, { color: theme.colors.destructive }]} numberOfLines={2}>
                                    Dati non aggiornati da oltre 10 minuti
                                  </Text>
                                </View>
                              ) : null}
                              <Text style={[styles.positionMeta, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                                {modalLastDetectionText}
                              </Text>
                            </>
                          ) : null}

		                      {selectedTrain?.rfiMessage ? (
		                        <View style={[styles.rfiInline, { borderTopColor: theme.colors.border }]}>
		                          <Text style={[styles.rfiLabel, { color: theme.colors.textSecondary }]}>AGGIORNAMENTO RFI</Text>
		                          <Text style={[styles.rfiText, { color: theme.colors.text }]} numberOfLines={4}>
		                            {selectedTrain.rfiMessage}
		                          </Text>
		                        </View>
		                      ) : null}
	                    </View>
	                  </View>

		                  {modalNextStop ? (
		                    <View style={styles.sectionBlock}>
		                      <Text style={[styles.sectionTitle, styles.modalSectionTitle, { color: theme.colors.textSecondary }]}>PROSSIMA FERMATA</Text>
		                      <TouchableOpacity
	                            style={[styles.summaryCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}
                            onPress={
                              canOpenNextStop
                                ? () => {
                                    hapticSelection();
                                    openStationSearchPanel(modalNextStop?.name);
                                  }
                                : undefined
                            }
                            activeOpacity={canOpenNextStop ? 0.7 : 1}
                            disabled={!canOpenNextStop}
                          >
			                        <Text style={[styles.nextStopStation, { color: theme.colors.accent }]} numberOfLines={2}>
			                          {modalNextStop.name}
			                        </Text>

			                        <View style={styles.summaryRows}>
			                          {nextStopArrivesText ? (
			                            <Text style={[styles.nextStopEtaOnly, { color: theme.colors.textSecondary }]} numberOfLines={1}>
			                              {nextStopArrivesText}
		                            </Text>
		                          ) : null}

                            {nextStopPlatformText != null || nextStopExecutiveText || nextStopSmart ? (
                              <View style={styles.nextStopPillsRow}>
                                {nextStopPlatformText != null ? (
                                  <View
                                    style={[
                                      styles.platformPill,
                                      {
                                        backgroundColor: nextStopPlatformActual ? theme.colors.accent + '20' : theme.colors.border + '40',
                                        borderColor: nextStopPlatformActual ? theme.colors.accent : theme.colors.border,
                                        borderWidth: BORDER.card,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.platformText,
                                        { color: nextStopPlatformActual ? theme.colors.accent : theme.colors.textSecondary },
                                      ]}
                                    >
                                      {nextStopPlatformText}
                                    </Text>
                                  </View>
                                ) : null}

                                {nextStopExecutiveText ? (
                                  <View
                                    style={[
                                      styles.platformPill,
                                      {
                                        backgroundColor: theme.colors.accent + '20',
                                        borderColor: theme.colors.accent,
                                        borderWidth: BORDER.card,
                                      },
                                    ]}
                                  >
                                    <Text style={[styles.platformText, { color: theme.colors.accent }]} numberOfLines={1}>
                                      {`Executive ${nextStopExecutiveText.toUpperCase()}`}
                                    </Text>
                                  </View>
                                ) : null}
                                {nextStopSmart ? (
                                  <View
                                    style={[
                                      styles.platformPill,
                                      {
                                        backgroundColor: theme.colors.accent + '20',
                                        borderColor: theme.colors.accent,
                                        borderWidth: BORDER.card,
                                      },
                                    ]}
                                  >
                                    <Text style={[styles.platformText, { color: theme.colors.accent }]} numberOfLines={1}>
                                      SMART
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
	                            ) : null}
	                        </View>
	                      </TouchableOpacity>
	                    </View>
	                  ) : null}

                  {/* Mappa */}
                  {(() => {
                      const stops = Array.isArray(selectedTrain?.stops) ? selectedTrain.stops : [];
                      const stopsWithCoords = stops
                        .map((s, originalIndex) => ({
                          id: s?.id ?? `${originalIndex}`,
                          name: s?.name ?? '—',
                          coord: s?.coord ?? null,
                          isCurrent: Boolean(s?.isCurrent),
                          isSuppressedStop: Boolean(s?.isSuppressedStop),
                          isExtraStop: Boolean(s?.isExtraStop),
                          originalIndex,
                        }))
                        .filter((s) => isValidCoord(s?.coord));

                    if (stopsWithCoords.length >= 2) {
                      const baseCoordinates = stopsWithCoords.map((s) => ({
                        latitude: s.coord.latitude,
                        longitude: s.coord.longitude,
                      }));

                      const nextStopIndex = parseOptionalIndex(selectedTrain?.nextStopIndex);

                      const currentWithCoordsIndex = stopsWithCoords.findIndex((s) => s.isCurrent);

                      const position = (() => {
                        if (currentWithCoordsIndex >= 0) {
                          return {
                            coord: baseCoordinates[currentWithCoordsIndex],
                            isExactStop: true,
                            beforeIdx: currentWithCoordsIndex,
                            afterIdx: currentWithCoordsIndex,
                          };
                        }
                        if (nextStopIndex == null) return null;

                        const afterIdx = stopsWithCoords.findIndex((s) => s.originalIndex >= nextStopIndex);
                        if (afterIdx < 0) return null;

                        let beforeIdx = -1;
                        for (let i = afterIdx - 1; i >= 0; i -= 1) {
                          if (stopsWithCoords[i].originalIndex < nextStopIndex) {
                            beforeIdx = i;
                            break;
                          }
                        }
                        if (beforeIdx < 0) return null;

                        const a = baseCoordinates[beforeIdx];
                        const b = baseCoordinates[afterIdx];
                        return {
                          coord: { latitude: (a.latitude + b.latitude) / 2, longitude: (a.longitude + b.longitude) / 2 },
                          isExactStop: false,
                          beforeIdx,
                          afterIdx,
                        };
                      })();

                      const routeCoordinates = (() => {
                        if (baseCoordinates.length < 2) return [];
                        if (!position?.coord || position.isExactStop) return baseCoordinates;
                        const out = [];
                        for (let i = 0; i < baseCoordinates.length; i += 1) {
                          out.push(baseCoordinates[i]);
                          if (i === position.beforeIdx) out.push(position.coord);
                        }
                        return out;
                      })();

                      const { traveled, remaining } = (() => {
                        if (routeCoordinates.length < 2) return { traveled: [], remaining: [] };
                        if (!position?.coord) return { traveled: routeCoordinates, remaining: [] };

                        if (position.isExactStop && currentWithCoordsIndex >= 0) {
                          return {
                            traveled: baseCoordinates.slice(0, currentWithCoordsIndex + 1),
                            remaining: baseCoordinates.slice(currentWithCoordsIndex),
                          };
                        }
                        if (!position.isExactStop) {
                          return {
                            traveled: [...baseCoordinates.slice(0, position.beforeIdx + 1), position.coord],
                            remaining: [position.coord, ...baseCoordinates.slice(position.afterIdx)],
                          };
                        }
                        return { traveled: routeCoordinates, remaining: [] };
                      })();

                      const focus = (() => {
                        const currentStop = stopsWithCoords.find((s) => s.isCurrent) || null;
                        if (currentStop?.coord) {
                          return { coord: currentStop.coord, kind: 'station' };
                        }
                        return { coord: baseCoordinates[0], kind: 'route' };
                      })();

                      const computeFocusRegion = () => {
                        if (!focus?.coord) return null;
                        const base = { latitude: focus.coord.latitude, longitude: focus.coord.longitude };
                        if (focus.kind === 'station') {
                          return { ...base, latitudeDelta: 0.08, longitudeDelta: 0.08 };
                        }
                        return { ...base, latitudeDelta: 0.22, longitudeDelta: 0.22 };
                      };

                      const recenter = (expandedOverride = null) => {
                        if (!mapRef.current) return;
                        mapGestureRef.current = false;
                        const isExpanded = expandedOverride !== null ? expandedOverride : mapExpanded;
                        const edgePadding = isExpanded
                          ? { top: 70, right: 70, bottom: 70, left: 70 }
                          : { top: 40, right: 40, bottom: 40, left: 40 };
                        if (focus.kind === 'station') {
                          const region = computeFocusRegion();
                          if (!region) return;
                          try {
                            mapRef.current.animateToRegion(region, 350);
                            setIsMapCentered(true);
                          } catch {
                            // ignore
                          }
                          return;
                        }
                        try {
                          const coordsForFit = routeCoordinates.length >= 2 ? routeCoordinates : baseCoordinates;
                          if (coordsForFit.length < 2) return;
                          mapRef.current.fitToCoordinates(coordsForFit, {
                            edgePadding,
                            animated: true,
                          });
                          setIsMapCentered(true);
                        } catch {
                          // ignore
                        }
                      };

                      const isTrainSuppressed = selectedTrain?.isSuppressed === true || selectedTrain?.journeyStateCode === 'CANCELLED';
                      const suppressedColor = getJourneyStateColor('CANCELLED');
                      const suppressedSegments = (() => {
                        if (isTrainSuppressed || stopsWithCoords.length < 2) return [];
                        const segs = [];
                        for (let i = 0; i < stopsWithCoords.length - 1; i += 1) {
                          const a = stopsWithCoords[i];
                          const b = stopsWithCoords[i + 1];
                          if (!a?.isSuppressedStop && !b?.isSuppressedStop) continue;
                          segs.push([
                            { latitude: a.coord.latitude, longitude: a.coord.longitude },
                            { latitude: b.coord.latitude, longitude: b.coord.longitude },
                          ]);
                        }
                        return segs;
                      })();

                      const extraSegments = (() => {
                        if (isTrainSuppressed || stopsWithCoords.length < 2) return [];
                        const segs = [];
                        for (let i = 0; i < stopsWithCoords.length - 1; i += 1) {
                          const a = stopsWithCoords[i];
                          const b = stopsWithCoords[i + 1];
                          if (!a?.isExtraStop && !b?.isExtraStop) continue;
                          segs.push([
                            { latitude: a.coord.latitude, longitude: a.coord.longitude },
                            { latitude: b.coord.latitude, longitude: b.coord.longitude },
                          ]);
                        }
                        return segs;
                      })();

                      const inlineRouteCoordinates = (() => {
                        return routeCoordinates.length >= 2 ? routeCoordinates : baseCoordinates;
                      })();

                      const lats = baseCoordinates.map((c) => c.latitude);
                      const lons = baseCoordinates.map((c) => c.longitude);
                      const minLat = Math.min(...lats);
                      const maxLat = Math.max(...lats);
                      const minLon = Math.min(...lons);
                      const maxLon = Math.max(...lons);
                      const midLat = (minLat + maxLat) / 2;
                      const midLon = (minLon + maxLon) / 2;
                      const deltaLat = (maxLat - minLat) * 1.4;
                      const deltaLon = (maxLon - minLon) * 1.4;
                      const focusRegion =
                        focus.kind === 'station'
                          ? computeFocusRegion()
                          : {
                              latitude: midLat,
                              longitude: midLon,
                              latitudeDelta: Math.max(deltaLat, 0.25),
                              longitudeDelta: Math.max(deltaLon, 0.25),
                            };

                      const toggleMapExpanded = () => {
                        hapticSelection();
                        setMapExpanded((prev) => {
                          const next = !prev;
                          requestAnimationFrame(() => {
                            recenter(next);
                          });
                          return next;
                        });
                      };

                      return (
                        <View style={styles.sectionBlock}>
                          <Text style={[styles.sectionTitle, styles.modalSectionTitle, { color: theme.colors.textSecondary }]}>PERCORSO</Text>
                          <Animated.View
                            style={[
                              styles.mapContainer,
                              { backgroundColor: theme.colors.card, borderColor: theme.colors.border, height: mapHeightAnim },
                              cardShadow(theme),
                            ]}
                          >
                            <MapView
                              style={styles.map}
                              provider={PROVIDER_DEFAULT}
                              ref={mapRef}
                              initialRegion={focusRegion}
                              onMapReady={recenter}
                              onTouchStart={() => {
                                mapGestureRef.current = true;
                              }}
                              onPanDrag={() => {
                                mapGestureRef.current = true;
                              }}
                              onRegionChangeComplete={(_, details) => {
                                if (details?.isGesture || mapGestureRef.current) {
                                  mapGestureRef.current = false;
                                  setIsMapCentered(false);
                                }
                              }}
                              scrollEnabled
                              zoomEnabled
                              pitchEnabled={false}
                              rotateEnabled={false}
                            >
                              {isTrainSuppressed ? (
                                <Polyline
                                  coordinates={inlineRouteCoordinates}
                                  strokeColor={suppressedColor}
                                  strokeWidth={5}
                                  tappable
                                  onPress={toggleMapExpanded}
                                />
                              ) : (
                                <>
                                  {traveled.length >= 2 ? (
                                    <Polyline
                                      coordinates={traveled}
                                      strokeColor={theme.colors.accent}
                                      strokeWidth={4}
                                      tappable
                                      onPress={toggleMapExpanded}
                                    />
                                  ) : (
                                    <Polyline
                                      coordinates={inlineRouteCoordinates}
                                      strokeColor={theme.colors.accent}
                                      strokeWidth={4}
                                      tappable
                                      onPress={toggleMapExpanded}
                                    />
                                  )}
                                  {remaining.length >= 2 ? (
                                    <Polyline
                                      coordinates={remaining}
                                      strokeColor={theme.colors.textSecondary}
                                      strokeWidth={3}
                                      lineDashPattern={[7, 7]}
                                      tappable
                                      onPress={toggleMapExpanded}
                                    />
                                  ) : null}
                                  {suppressedSegments.map((seg, idx) => (
                                    <Polyline
                                      key={`suppressed-${idx}`}
                                      coordinates={seg}
                                      strokeColor={suppressedColor}
                                      strokeWidth={5}
                                      tappable
                                      onPress={toggleMapExpanded}
                                    />
                                  ))}
                                  {extraSegments.map((seg, idx) => (
                                    <Polyline
                                      key={`extra-${idx}`}
                                      coordinates={seg}
                                      strokeColor="#F5C84C"
                                      strokeWidth={4}
                                      lineDashPattern={[5, 6]}
                                      tappable
                                      onPress={toggleMapExpanded}
                                    />
                                  ))}
                                </>
                              )}

                              {position?.coord && !position.isExactStop ? (
                                <Marker
                                  key="train-position"
                                  coordinate={position.coord}
                                  pinColor="#E17055"
                                  title="Treno"
                                />
                              ) : null}

                              {stopsWithCoords.map((stop, idx) => {
                                const isFirst = idx === 0;
                                const isLast = idx === stopsWithCoords.length - 1;
                                const isCurrent = stop.isCurrent;
                                const isExtra = stop.isExtraStop === true;
                                const isSuppressedStop = stop.isSuppressedStop === true;
                                const extraColor = '#F5C84C';
                                const pinColor = isCurrent
                                  ? '#E17055'
                                  : isSuppressedStop
                                    ? suppressedColor
                                    : isExtra
                                      ? extraColor
                                      : isFirst || isLast
                                        ? theme.colors.accent
                                        : theme.colors.textSecondary;
                                return (
                                  <Marker
                                    key={`${String(stop.id ?? 'stop')}-${idx}`}
                                    coordinate={{ latitude: stop.coord.latitude, longitude: stop.coord.longitude }}
                                    pinColor={pinColor}
                                    title={stop.name}
                                  />
                                );
                              })}
                            </MapView>

                            <TouchableOpacity
                              onPress={toggleMapExpanded}
                              activeOpacity={0.75}
                              hitSlop={HIT_SLOP.sm}
                              style={[
                                styles.mapExpandButton,
                                {
                                  backgroundColor: theme.colors.card,
                                  borderColor: theme.colors.border,
                                },
                                floatingShadow(theme),
                              ]}
                              accessibilityLabel={mapExpanded ? 'Riduci mappa' : 'Espandi mappa'}
                            >
                              <Ionicons
                                name={mapExpanded ? 'contract-outline' : 'expand-outline'}
                                size={18}
                                color={theme.colors.text}
                              />
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => {
                                hapticSelection();
                                recenter();
                              }}
                              activeOpacity={0.75}
                              hitSlop={HIT_SLOP.sm}
                              style={[
                                styles.mapRecenterButton,
                                {
                                  backgroundColor: theme.colors.card,
                                  borderColor: theme.colors.border,
                                },
                                floatingShadow(theme),
                              ]}
                              accessibilityLabel="Ricentra mappa"
                            >
                              <Ionicons name={isMapCentered ? 'navigate-circle' : 'navigate-circle-outline'} size={18} color={theme.colors.text} />
                            </TouchableOpacity>
                          </Animated.View>
                        </View>
                      );
                    }

                    return (
                      <View style={styles.sectionBlock}>
                        <Text style={[styles.sectionTitle, styles.modalSectionTitle, { color: theme.colors.textSecondary }]}>PERCORSO</Text>
                        <View style={[styles.summaryCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
                          <Text style={[styles.positionMeta, { color: theme.colors.textSecondary }]}>
                            Mappa non disponibile per questo treno.
                          </Text>
                        </View>
                      </View>
                    );
                  })()}

                  {/* Fermate dettagliate */}
                  <View style={styles.sectionBlock}>
                    <Text style={[styles.sectionTitle, styles.modalSectionTitle, { color: theme.colors.textSecondary }]}>FERMATE</Text>
                    <View
                      style={[
                        styles.stopsCardSimple,
                        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
                        cardShadow(theme),
                      ]}
                    >
		                    {modalStops.map((s, idx) => {
                          const canOpenStop = ALLOW_MODAL_TO_MODAL_NAV && Boolean(s?.name && s.name !== '—');
                          const platformActual = normalizePlatformValue(s.platformActual);
                          const platformPlanned = normalizePlatformValue(s.platformPlanned);
                          const platformText = platformActual ?? platformPlanned ?? null;
                          const nextStopIndex = modalNextStopIndex;
                          const isFutureStop =
                            modalJourneyStateCode === 'PLANNED'
                              ? true
                              : modalJourneyStateCode === 'COMPLETED'
                                ? false
                                : nextStopIndex != null
                                  ? idx >= nextStopIndex
                                  : modalCurrentStopIndex >= 0
                                    ? idx > modalCurrentStopIndex
                                    : false;
                          const showArrivalRow = idx !== 0;
                          const showDepartureRow = idx !== modalStops.length - 1;
                          const isFirstStop = idx === 0;
                          const isLastStop = idx === modalStops.length - 1;
                          const stopRoleLabel =
                            isFirstStop && isLastStop
                              ? 'Prima fermata · Capolinea'
                              : isFirstStop
                                ? 'Prima fermata'
                                : isLastStop
                                  ? 'Capolinea'
                                  : null;
                          const showSuppressedLabel = s?.isSuppressedStop === true;
                          const showExtraBadge = s?.isExtraStop === true && !showSuppressedLabel;
                          const showStopStatusRow = showExtraBadge || showSuppressedLabel;
                          const statusBadgeLabel = showSuppressedLabel ? 'SOPPRESSA' : showExtraBadge ? 'STRAORDINARIA' : null;
                          const statusBadgeColor = showSuppressedLabel ? theme.colors.destructive : '#F5C84C';
                          return (
                            <React.Fragment key={`${String(s.id ?? 'stop')}-${idx}`}>
		                          <TouchableOpacity
		                            style={[
		                              styles.stopRow,
                                  idx < modalStops.length - 1
                                    ? { borderBottomWidth: BORDER.hairline, borderBottomColor: theme.colors.border }
                                    : null,
		                              s.isCurrent
		                                ? {
		                                    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
		                                  }
		                                : null,
		                              { marginBottom: 0 },
		                            ]}
		                            onPress={
                                  canOpenStop
                                    ? () => {
		                                    hapticSelection();
		                                    openStationSearchPanel(s?.name);
		                                  }
                                    : undefined
                                }
		                            activeOpacity={canOpenStop ? 0.7 : 1}
		                            disabled={!canOpenStop}
		                          >
                                <View style={styles.stopContentWrap}>
		                              <View style={styles.stopLeftSection}>
                                <View style={styles.stopNameRow}>
                                  <Text
                                    style={[
                                      styles.stopName,
                                      {
                                        color: showSuppressedLabel
                                          ? theme.colors.destructive
                                          : isFutureStop
                                            ? theme.colors.textSecondary
                                            : theme.colors.text,
                                        fontFamily: s.isCurrent ? FONTS.semibold : FONTS.regular,
                                      },
                                    ]}
                                    numberOfLines={2}
                                  >
                                    {s.name}
                                  </Text>
                                  {showStopStatusRow && statusBadgeLabel ? (
                                    <View
                                      style={[
                                        styles.stopStatusBadge,
                                        {
                                          backgroundColor: statusBadgeColor + '33',
                                          borderColor: statusBadgeColor,
                                        },
                                      ]}
                                    >
                                      <Ionicons
                                        name={showSuppressedLabel ? 'close-circle-outline' : 'alert-circle-outline'}
                                        size={12}
                                        color={statusBadgeColor}
                                      />
                                      <Text style={[styles.stopStatusBadgeText, { color: statusBadgeColor }]}>
                                        {statusBadgeLabel}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                                {stopRoleLabel ? (
                                  <Text style={[styles.stopRoleLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                    {stopRoleLabel}
                                  </Text>
                                ) : null}
		                                <View style={[styles.stopTimesBlock, isFutureStop ? styles.stopTimesBlockFuture : null]}>
		                                  {(() => {
		                                    const delay = Number.isFinite(Number(modalDelayMinutes)) ? Number(modalDelayMinutes) : null;
		                                    const hasDelay = delay != null && delay !== 0 && !showSuppressedLabel;
		                                    const estColor = getDelayColors(delay).fg;

		                                  const estimateTimingLabel = (timing) => {
		                                    if (!timing || !hasDelay || showSuppressedLabel) return null;
		                                    const predicted = timing.predicted && timing.predicted !== '—' ? timing.predicted : null;
		                                    if (predicted) return predicted;
		                                    if (timing.scheduledEpoch) return formatTime(timing.scheduledEpoch + delay * 60000);
		                                    if (timing.scheduled && timing.scheduled !== '—') return addMinutesToHHmm(timing.scheduled, delay);
		                                    return null;
		                                  };
		
		                                  return (
		                                    <>
		                                  {showArrivalRow ? (
		                                    <View style={styles.stopTimeRow}>
		                                      <Text style={[styles.stopTimeLabel, { color: theme.colors.textSecondary, fontSize: 11, marginRight: 4 }]}>Arrivo</Text>
		                                      {/* Programmato: colore fisso grigio */}
		                                      <Text style={[styles.stopTimeValue, { color: getDelayColors(null).fg, opacity: 0.8, marginRight: 8 }]}>{s.arrival?.scheduled ?? '—'}</Text>

		                                      {/* Probabile/stimato: solo su fermate non ancora effettuate quando c'è ritardo */}
		                                      {isFutureStop && hasDelay
		                                        ? (() => {
		                                            const scheduled = s.arrival?.scheduled && s.arrival.scheduled !== '—' ? s.arrival.scheduled : null;
		                                            const estimated = estimateTimingLabel(s.arrival);
		                                            if (!estimated || estimated === scheduled) return null;
		                                            return (
		                                              <Text style={[styles.stopTimeValue, { color: estColor, opacity: 0.7, marginRight: 6 }]}>
		                                                {'~ ' + estimated}
		                                              </Text>
		                                            );
		                                          })()
		                                        : null}
		
		                                      {/* Reale: NON mostrare sulle fermate future */}
		                                      {isFutureStop
		                                        ? null
		                                      : (() => {
		                                          const actualExists = s.arrival?.actual && s.arrival.actual !== '—';
		                                          if (!actualExists) return null;

		                                          const schedEpoch = s.arrival?.scheduledEpoch ?? null;
		                                          const actualEpoch = s.arrival?.actualEpoch ?? null;
		                                          const actualDelay =
		                                            schedEpoch && actualEpoch
		                                              ? Math.round((actualEpoch - schedEpoch) / 60000)
		                                              : Number.isFinite(Number(s.arrival?.delayMinutes))
		                                                ? Number(s.arrival.delayMinutes)
		                                                : null;
		                                          const color = getDelayColors(actualDelay).fg;
		                                          return <Text style={[styles.stopTimeValue, { color, opacity: 1 }]}>{s.arrival.actual}</Text>;
		                                        })()}
		                                    </View>
		                                  ) : null}
		                                  {showDepartureRow ? (
		                                    <View style={styles.stopTimeRow}>
		                                      <Text style={[styles.stopTimeLabel, { color: theme.colors.textSecondary, fontSize: 11, marginRight: 4 }]}>Partenza</Text>
		                                      <Text style={[styles.stopTimeValue, { color: getDelayColors(null).fg, opacity: 0.8, marginRight: 8 }]}>{s.departure?.scheduled ?? '—'}</Text>

		                                      {/* Probabile/stimato: su fermate future, oppure quando è arrivato ma non è ancora ripartito */}
		                                      {hasDelay
		                                        ? (() => {
		                                            const depActualExists = s.departure?.actual && s.departure.actual !== '—';
		                                            const arrivedButNotDeparted =
		                                              !isFutureStop && !depActualExists && s.arrival?.actual && s.arrival.actual !== '—';
		                                            if (!isFutureStop && !arrivedButNotDeparted) return null;

		                                            const scheduled = s.departure?.scheduled && s.departure.scheduled !== '—' ? s.departure.scheduled : null;
		                                            const estimated = estimateTimingLabel(s.departure);
		                                            if (!estimated || estimated === scheduled) return null;
		                                            return (
		                                              <Text style={[styles.stopTimeValue, { color: estColor, opacity: 0.7, marginRight: 6 }]}>
		                                                {'~ ' + estimated}
		                                              </Text>
		                                            );
		                                          })()
		                                        : null}
		
		                                      {/* Reale: NON mostrare sulle fermate future */}
		                                      {isFutureStop
		                                        ? null
		                                      : (() => {
		                                          const actualExists = s.departure?.actual && s.departure.actual !== '—';
		                                          if (!actualExists) return null;

		                                          const schedEpoch = s.departure?.scheduledEpoch ?? null;
		                                          const actualEpoch = s.departure?.actualEpoch ?? null;
		                                          const actualDelay =
		                                            schedEpoch && actualEpoch
		                                              ? Math.round((actualEpoch - schedEpoch) / 60000)
		                                              : Number.isFinite(Number(s.departure?.delayMinutes))
		                                                ? Number(s.departure.delayMinutes)
		                                                : null;
		                                          const color = getDelayColors(actualDelay).fg;
		                                          return <Text style={[styles.stopTimeValue, { color, opacity: 1 }]}>{s.departure.actual}</Text>;
		                                        })()}
		                                    </View>
		                                  ) : null}
		                                      </>
		                                    );
		                                  })()}
		                                </View>
		                              </View>
		                              <View style={styles.stopRightSection}>
		                                {platformText != null ? (
		                                  <View
		                                    style={[
		                                      styles.platformPill,
		                                      {
		                                        backgroundColor: platformActual ? theme.colors.accent + '20' : theme.colors.border + '40',
		                                        borderColor: platformActual ? theme.colors.accent : theme.colors.border,
		                                        borderWidth: BORDER.card,
		                                      },
		                                    ]}
		                                  >
		                                    <Text
		                                      style={[
		                                        styles.platformText,
		                                        { color: platformActual ? theme.colors.accent : theme.colors.textSecondary },
		                                      ]}
		                                    >
		                                      {platformText}
		                                    </Text>
		                                  </View>
		                                ) : null}
		                              </View>
                                </View>
		                          </TouchableOpacity>
                            </React.Fragment>
                          );
                  })}
                      </View>
                    </View>

                </Animated.View>
                </>
              )}
                </ScrollView>
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
    flexGrow: 1,
  },
  resultsContentContainer: {
    paddingTop: 0,
  },
  searchSection: {
    marginBottom: SPACE.md,
  },
  sectionTitle: {
    ...TYPE.sectionLabel,
    marginBottom: SPACE.sm,
    marginLeft: SPACING.sectionX,
  },
  modalSectionTitle: {
    marginLeft: SPACING.sectionX,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginLeft: SPACING.sectionX,
    marginRight: SPACING.sectionX,
  },
  sectionActionText: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: FONTS.regular,
  },
  resultsContainer: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
  },
  resultsEmptyState: {
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  resultsEmptyTitle: {
    fontSize: 16,
    fontFamily: FONTS.medium,
    marginBottom: 4,
  },
  resultsEmptySubtitle: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    lineHeight: 18,
  },
  resultsFooterNote: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: BORDER.hairline,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: BORDER.hairline,
    gap: 12,
  },
  resultLeft: {
    flex: 1,
  },
  resultTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  resultTrainKind: {
    fontSize: 16,
    fontFamily: FONTS.regular,
    letterSpacing: 0.2,
  },
  resultTrainNumber: {
    fontSize: 16,
    fontFamily: FONTS.semibold,
  },
  trainDateText: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    letterSpacing: 0.2,
  },
  resultRoute: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  resultMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  resultStatusText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONTS.regular,
  },
  delayPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: BORDER.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 26,
  },
  delayPillText: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
  },
  section: {
    marginBottom: 32,
  },
  listGroup: {
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    borderWidth: BORDER.card,
  },
  listItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    position: 'relative',
  },
  listItemContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  listItemRight: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  listTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 0,
  },
  listItemText: {
    flex: 1,
    gap: 6,
  },
  listItemKind: {
    fontSize: 17,
    fontFamily: FONTS.medium,
    letterSpacing: 0.2,
  },
  listItemTitle: {
    fontSize: 17,
    fontFamily: FONTS.semibold,
  },
  listItemSubtitle: {
    fontSize: 16,
    fontFamily: FONTS.regular,
  },
  listItemRouteFrom: {
    fontSize: 16,
    fontFamily: FONTS.medium,
  },
  listItemRouteTo: {
    fontSize: 16,
    fontFamily: FONTS.regular,
  },
  listItemRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeIndicator: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeDotHollow: {
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  routeLine: {
    width: 2,
    height: 12,
    borderRadius: 1,
    marginVertical: 2,
  },
  routeText: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  listItemStatus: {
    fontSize: 11,
    fontFamily: FONTS.regular,
  },
  listItemChevron: {
    marginLeft: 8,
    opacity: 0.35,
    alignSelf: 'center',
  },
  listDivider: {
    height: BORDER.hairline,
    marginLeft: INSETS.listDividerLeft,
  },

  undoToastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 100,
  },
  undoToast: {
    borderRadius: 14,
    borderWidth: BORDER.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  undoToastText: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
  undoToastAction: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.5,
  },

  modalContainer: {
    flex: 1,
  },
  modalBody: {
    flex: 1,
  },
  modalScrollArea: {
    flex: 1,
    position: 'relative',
  },
  modalHeader: {
    position: 'absolute',
    top: MODAL_HEADER_TOP_OFFSET,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  lastRefreshText: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    textAlign: 'right',
    maxWidth: 190,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTopSpacer: {
    height: MODAL_TOP_SPACER_HEIGHT,
  },
  modalContentWrap: {
    paddingHorizontal: SPACING.screenX,
  },
  modalBodyWrap: {
    paddingHorizontal: SPACING.screenX,
  },
  modalHeaderContent: {
    paddingHorizontal: 0,
    paddingTop: 12,
    paddingBottom: 16,
    paddingLeft: 8,
  },
  modalHeroDivider: {
    height: BORDER.hairline,
    marginTop: SPACE.md,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalHeaderRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalTrainSigla: {
    fontSize: 26,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.2,
  },
  modalTrainAv: {
    fontSize: 26,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.2,
  },
  modalTrainNumber: {
    flexShrink: 1,
    fontSize: 26,
    fontFamily: FONTS.bold,
  },
  modalOperatorLine: {
    fontSize: 14,
    fontFamily: FONTS.medium,
    marginTop: 0,
  },
  modalRoute: {
    fontSize: 16,
    fontFamily: FONTS.medium,
    marginTop: 8,
  },
  modalTimesRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 15,
  },
  modalTimeBlock: {
    alignItems: 'flex-start',
  },
  modalTimeBlockLeft: {
    flexGrow: 0,
    flexShrink: 0,
    paddingRight: 15,
  },
  modalTimeBlockDivider: {
    flex: 1,
    borderLeftWidth: 1,
    paddingLeft: 10,
    marginLeft: 0,
    minWidth: 0,
  },
  modalTimeLabel: {
    fontSize: 11,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  modalTimeValue: {
    fontSize: 22,
    fontFamily: FONTS.bold,
    marginTop: 2,
  },
  modalTimeValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  modalTimeValueStrike: {
    textDecorationLine: 'line-through',
  },
  modalTimeMeta: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: FONTS.regular,
  },
  skeletonTitle: {
    height: 20,
    borderRadius: 10,
    width: 120,
  },
  skeletonTitleSm: {
    height: 20,
    borderRadius: 10,
    width: 46,
  },
  skeletonRouteLine: {
    height: 12,
    borderRadius: 6,
    marginTop: 10,
    width: '68%',
  },
  skeletonTimesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  skeletonTimeCol: {
    flex: 1,
  },
  skeletonTimeLabel: {
    height: 9,
    borderRadius: 4,
    width: 52,
  },
  skeletonTimeValue: {
    height: 18,
    borderRadius: 8,
    width: 78,
    marginTop: 6,
  },
  skeletonTimeDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 12,
  },
  skeletonPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  skeletonPill: {
    height: 22,
    borderRadius: 12,
    width: 88,
  },
  skeletonPillSm: {
    height: 22,
    borderRadius: 12,
    width: 54,
  },
  skeletonCard: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    padding: 16,
    marginBottom: 14,
  },
  skeletonMap: {
    height: 180,
    borderRadius: 16,
  },
  skeletonBlock: {
    height: 12,
    borderRadius: 6,
    marginTop: 10,
    width: '70%',
  },
  skeletonBlockWide: {
    height: 12,
    borderRadius: 6,
    marginTop: 10,
    width: '92%',
  },
  skeletonRowGroup: {
    marginBottom: 14,
  },
  skeletonRowWide: {
    height: 12,
    borderRadius: 6,
    width: '78%',
  },
  skeletonRowSm: {
    height: 10,
    borderRadius: 5,
    marginTop: 8,
    width: '46%',
  },
  mapContainer: {
    position: 'relative',
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapExpandButton: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: BORDER.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapRecenterButton: {
    position: 'absolute',
    right: 12,
    top: 62,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: BORDER.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformPill: {
    height: 24,
    minWidth: 32,
    paddingHorizontal: 8,
    paddingVertical: 0,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformText: {
    fontSize: 13,
    fontFamily: FONTS.bold,
  },
  inlineMetaText: {
    fontSize: 13,
    fontFamily: FONTS.regular,
  },
  statePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: BORDER.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statePillText: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
  },
  summaryCard: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  summaryTitle: {
    fontSize: 18,
    fontFamily: FONTS.semibold,
    lineHeight: 22,
  },
  summaryBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  positionMeta: {
    marginTop: 6,
    fontSize: 13,
    fontFamily: FONTS.regular,
    lineHeight: 18,
  },
  lastDetectionWarning: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lastDetectionWarningText: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    lineHeight: 16,
  },
  rfiInline: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: BORDER.hairline,
  },
  rfiLabel: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rfiText: {
    marginTop: 6,
    fontSize: 14,
    fontFamily: FONTS.regular,
    lineHeight: 18,
  },
  cardTitle: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  nextStopStation: {
    marginTop: 2,
    fontSize: 18,
    fontFamily: FONTS.semibold,
    lineHeight: 22,
  },
  nextStopEtaOnly: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    lineHeight: 18,
  },
  nextStopPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
  },
  summaryRows: {
    marginTop: 8,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    fontFamily: FONTS.semibold,
  },
  itineraryCard: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
  },
  itineraryRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  itineraryStation: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
  itineraryTime: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
  },
  itineraryFooter: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  itineraryFooterText: {
    fontSize: 13,
    fontFamily: FONTS.regular,
  },
  hairline: {
    height: BORDER.hairline,
  },
  sectionBlock: {
    marginTop: 16,
  },
  infoCard: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    flexShrink: 0,
  },
  infoValue: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    flex: 1,
    textAlign: 'right',
  },
  infoBlock: {
    paddingTop: 10,
  },
  infoMultiline: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    marginTop: 6,
    lineHeight: 18,
  },
  stopsCardSimple: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
    paddingVertical: SPACE.xs,
  },
  stopsHeader: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stopsHeaderLeft: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.4,
  },
  stopsHeaderRight: {
    flexDirection: 'row',
    gap: 12,
  },
  stopsHeaderCol: {
    width: 52,
    textAlign: 'right',
    fontSize: 12,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.4,
  },
  stopRow: {
    paddingVertical: 12,
    paddingHorizontal: SPACING.sectionX,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  stopContentWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stopLeftSection: {
    flex: 1,
    gap: 6,
  },
  stopNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  stopRightSection: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
  },
  stopName: {
    fontSize: 17,
    fontFamily: FONTS.regular,
    marginBottom: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  stopRoleLabel: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    marginTop: -2,
    marginBottom: 6,
  },
  stopStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: BORDER.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stopStatusBadgeText: {
    fontSize: 11,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.4,
  },
  stopSuppressedInline: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
  },
  stopTimesBlock: {
    gap: 4,
  },
  stopTimesBlockFuture: {
    opacity: 0.6,
  },
  stopTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stopTimeLabel: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    width: 60,
  },
  stopTimeValue: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
  },
  lastRefreshDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
