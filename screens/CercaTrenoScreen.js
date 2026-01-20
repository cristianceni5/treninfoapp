import React, { useEffect, useRef, useState } from 'react';
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
  LayoutAnimation,
  Alert,
  Platform,
  UIManager,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { SafeAreaView, SafeAreaView as SafeAreaViewCompat } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import AnimatedScreen from '../components/AnimatedScreen';
import AccentSwitch from '../components/AccentSwitch';
import SwipeableRow from '../components/SwipeableRow';
import ModernSpinner from '../components/ModernSpinner';
import SectionPlaceholderCard from '../components/SectionPlaceholderCard';
import EdgeFade from '../components/EdgeFade';
import { BORDER, FONTS, HIT_SLOP, INSETS, RADIUS, SPACE, SPACING, TYPE } from '../utils/uiTokens';
import { cardShadow, floatingShadow, iconButtonShadow } from '../utils/uiStyles';
import { getStationById, getStationByName } from '../services/stationsService';
import {
  decodeHtmlEntities,
  formatDelay,
  formatTimestamp,
  getJourneyStateColor,
  getTrainStatus,
  TRAIN_AUTO_REFRESH_INTERVAL_MS,
} from '../services/apiService';
import { getNotificationsEnabled } from '../services/settingsService';
import { requestNotificationPermissionIfNeeded } from '../services/notificationsService';
import {
  disableTrackingForTrain,
  enableTrackingForNormalizedTrain,
  getTrackedTrainById,
  getTrackingKeyFromTrain,
  upsertTrackedTrain,
} from '../services/trainTrackingService';
import { ensureTrainTrackingTaskRegistered, runTrainTrackingNow } from '../services/trainTrackingTask';
import {
  clearRecentTrains,
  getRecentTrains,
  overwriteRecentTrains,
  removeRecentTrain,
  saveRecentTrain,
} from '../services/recentTrainsService';
import { isExpoGo } from '../services/runtimeEnv';

export default function CercaTrenoScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();

  const isValidCoord = (coord) =>
    Number.isFinite(coord?.latitude) &&
    Number.isFinite(coord?.longitude) &&
    Math.abs(coord.latitude) > 1 &&
    Math.abs(coord.longitude) > 1;

  const hapticSelection = () => {
    try {
      Haptics.selectionAsync();
    } catch {
      // ignore
    }
  };

  const hapticImpact = (style = Haptics.ImpactFeedbackStyle.Light) => {
    try {
      Haptics.impactAsync(style);
    } catch {
      // ignore
    }
  };

  const openStationSearchPanel = (stationName) => {
    const q = typeof stationName === 'string' ? stationName.trim() : '';
    if (!q || q === '—') return;
    const returnTrain = selectedTrain ? { ...selectedTrain } : null;
    const token = Date.now();
    returnToStationRef.current = null;
    if (showTrainModal) closeTrainModal();
    requestAnimationFrame(() => {
      navigation.navigate('CercaStazione', {
        openStationName: q,
        openStationToken: token,
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

    const openTrainChoice = route?.params?.openTrainChoice ?? null;
    const openTrainOriginName = route?.params?.openTrainOriginName ?? null;
    const openTrainTechnical = route?.params?.openTrainTechnical ?? null;
    const openTrainOriginCode = route?.params?.openTrainOriginCode ?? null;
    const openTrainTimestampRiferimento = route?.params?.openTrainTimestampRiferimento ?? null;
    const openTrainDate = route?.params?.openTrainDate ?? null;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSearchQuery(trainNumber);
    requestAnimationFrame(async () => {
      const normalized = await runTrainSearch(trainNumber, {
        epochMs: Date.now(),
        choice: openTrainChoice,
        originName: openTrainOriginName,
        technical: openTrainTechnical,
        originCode: openTrainOriginCode,
        timestampRiferimento: openTrainTimestampRiferimento,
        date: openTrainDate,
      });
      if (normalized?.kind === 'train') {
        await openTrain(normalized.train, { refresh: false });
      }
    });
  }, [route?.params?.openTrainToken]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchRefreshing, setSearchRefreshing] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchHint, setSearchHint] = useState('');
  const [recentTrains, setRecentTrains] = useState([]);
  const [recentRefreshing, setRecentRefreshing] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const [selectedTrain, setSelectedTrain] = useState(null);
  const [showTrainModal, setShowTrainModal] = useState(false);
  const [trainModalRefreshing, setTrainModalRefreshing] = useState(false);
  const [trainAutoRefreshing, setTrainAutoRefreshing] = useState(false);
  const [lastTrainRefreshEpochMs, setLastTrainRefreshEpochMs] = useState(null);
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const trainModalRefreshingRef = useRef(false);

  const [trackedItem, setTrackedItem] = useState(null);
  const [trackingToggling, setTrackingToggling] = useState(false);
  const [trackingStopName, setTrackingStopName] = useState(null);
  const [trackingMinutesBefore, setTrackingMinutesBefore] = useState(10);
  const [trackingStopsOpen, setTrackingStopsOpen] = useState(false);

  const [undoPayload, setUndoPayload] = useState(null);
  const [undoMessage, setUndoMessage] = useState('');
  const [undoVisible, setUndoVisible] = useState(false);
  const undoAnim = useRef(new Animated.Value(0)).current;
  const undoTimeoutRef = useRef(null);
  const [swipeResetVersion, setSwipeResetVersion] = useState(0);
  const searchDebounceRef = useRef(null);
  const lastSearchTokenRef = useRef(0);
  const trainRefreshTokenRef = useRef(0);
  const trackedAnimPrimedRef = useRef(false);
  const trackedPrevRef = useRef(null);
  const mapRef = useRef(null);
  const mapExpandedRef = useRef(null);
  const returnToStationRef = useRef(null);

  useEffect(() => {
    trainModalRefreshingRef.current = trainModalRefreshing || trainAutoRefreshing;
  }, [trainModalRefreshing, trainAutoRefreshing]);

  useEffect(() => {
    if (!showTrainModal || !selectedTrain) {
      setTrackedItem(null);
      return;
    }
    const key = getTrackingKeyFromTrain(selectedTrain);
    if (!key) {
      setTrackedItem(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const item = await getTrackedTrainById(key);
      if (cancelled) return;
      setTrackedItem(item);
    })();
    return () => {
      cancelled = true;
    };
  }, [showTrainModal, selectedTrain?.id]);

  useEffect(() => {
    if (!showTrainModal) {
      trackedAnimPrimedRef.current = false;
      trackedPrevRef.current = null;
      return;
    }
    const next = Boolean(trackedItem);
    if (!trackedAnimPrimedRef.current) {
      trackedAnimPrimedRef.current = true;
      trackedPrevRef.current = next;
      return;
    }
    if (trackedPrevRef.current !== next) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      trackedPrevRef.current = next;
    }
  }, [showTrainModal, trackedItem?.id]);

  useEffect(() => {
    if (!showTrainModal || !selectedTrain) return;
    setTrackingStopsOpen(false);
    setTrackingMinutesBefore(10);
    setTrackingStopName(selectedTrain?.to || selectedTrain?.nextStopName || null);
  }, [showTrainModal, selectedTrain?.id]);

  useEffect(() => {
    if (!showTrainModal || !selectedTrain) return;
    if (!trackedItem) return;
    const stop = trackedItem?.targetStopName || trackedItem?.scheduled?.stopName || null;
    if (stop) setTrackingStopName(stop);
    const first = Array.isArray(trackedItem?.etaThresholds) && trackedItem.etaThresholds.length > 0 ? Number(trackedItem.etaThresholds[0]) : null;
    if (Number.isFinite(first) && first > 0) setTrackingMinutesBefore(first);
  }, [trackedItem?.id]);

  useEffect(() => {
    if (!showTrainModal || !selectedTrain?.number) return;

    let isCancelled = false;
    const interval = setInterval(() => {
      if (isCancelled) return;
      if (trainModalRefreshingRef.current) return;
      refreshSelectedTrain(null, { silent: true });
    }, TRAIN_AUTO_REFRESH_INTERVAL_MS);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [
    showTrainModal,
    selectedTrain?.number,
    selectedTrain?.choice,
    selectedTrain?.originName,
    selectedTrain?.technical,
    selectedTrain?.originCode,
    selectedTrain?.timestampRiferimento,
    selectedTrain?.date,
  ]);

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

    animateTo(mapRef.current, 'inline');
    if (mapModalVisible) animateTo(mapExpandedRef.current, 'expanded');
  }, [showTrainModal, mapModalVisible, lastTrainRefreshEpochMs]);

  const hexToRgba = (hex, alpha) => {
    if (typeof hex !== 'string') return `rgba(0,0,0,${alpha})`;
    const normalized = hex.replace('#', '').trim();
    const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized;
    if (full.length !== 6) return `rgba(0,0,0,${alpha})`;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  const getTrainKindLabel = (trainKind) => {
    const code = String(
      trainKind?.sigla ||
        trainKind?.code ||
        trainKind?.label ||
        trainKind?.codice ||
        trainKind?.nome ||
        trainKind?.categoria ||
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

  const getDelayColors = (delayMinutes) => {
    // Colori preset (coerenti e non dipendenti dal tema)
    const PRESET = {
      late: { fg: '#E17055', bg: 'rgba(225, 112, 85, 0.14)' },
      onTime: { fg: '#00B894', bg: 'rgba(0, 184, 148, 0.14)' },
      early: { fg: '#0984E3', bg: 'rgba(9, 132, 227, 0.14)' },
      unknown: { fg: '#B2BEC3', bg: 'rgba(178, 190, 195, 0.14)' },
    };

    if (typeof delayMinutes !== 'number') return PRESET.unknown;
    if (delayMinutes > 0) return PRESET.late;
    if (delayMinutes < 0) return PRESET.early;
    return PRESET.onTime;
  };

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    loadRecentTrains();
  }, []);

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

  const addMinutesToHHmm = (hhmm, deltaMinutes) => {
    const delay = Number.isFinite(Number(deltaMinutes)) ? Number(deltaMinutes) : null;
    const s = typeof hhmm === 'string' ? hhmm.trim() : '';
    if (!s || s === '—' || delay === null) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    const total = hh * 60 + mm + delay;
    const wrapped = ((total % 1440) + 1440) % 1440;
    const outH = String(Math.floor(wrapped / 60)).padStart(2, '0');
    const outM = String(wrapped % 60).padStart(2, '0');
    return `${outH}:${outM}`;
  };

  const minutesUntilEpoch = (epochMs) => {
    const ts = Number(epochMs);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return Math.round((ts - Date.now()) / 60000);
  };

  const minutesUntilHHmm = (hhmm) => {
    const s = typeof hhmm === 'string' ? hhmm.trim() : '';
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

    const now = new Date();
    const target = new Date(now);
    target.setSeconds(0, 0);
    target.setHours(hh, mm, 0, 0);
    // Se l'orario è già passato (oltre 30 min), assumiamo il giorno successivo.
    if (target.getTime() < now.getTime() - 30 * 60000) {
      target.setDate(target.getDate() + 1);
    }
    return Math.round((target.getTime() - now.getTime()) / 60000);
  };

  const formatMinutesLong = (minutes) => {
    if (!Number.isFinite(Number(minutes))) return null;
    const m = Number(minutes);
    if (m <= 0) return null;
    if (m === 1) return 'tra 1 minuto';
    if (m >= 60) {
      const hours = Math.floor(m / 60);
      const mins = m % 60;
      const hLabel = hours === 1 ? 'ora' : 'ore';
      if (mins === 0) return `tra ${hours} ${hLabel}`;
      return `tra ${hours} ${hLabel} e ${mins} min`;
    }
    return `tra ${m} minuti`;
  };

  const formatDateDDMMYY = (input) => {
    if (input === null || input === undefined) return null;
    let date = null;

    if (typeof input === 'number') {
      const ts = Number(input);
      if (Number.isFinite(ts) && ts > 0) date = new Date(ts);
    } else if (typeof input === 'string') {
      const s = input.trim();
      if (!s) return null;
      const ymdDash = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      const ymdSlash = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s);
      const dmySlash = /^(\d{2})\/(\d{2})\/(\d{2,4})$/.exec(s);
      const dmyDash = /^(\d{2})-(\d{2})-(\d{2,4})$/.exec(s);

      const makeUTCNoon = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

      if (ymdDash || ymdSlash) {
        const m = ymdDash || ymdSlash;
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(d)) date = makeUTCNoon(y, mo, d);
      } else if (dmySlash || dmyDash) {
        const m = dmySlash || dmyDash;
        const d = Number(m[1]);
        const mo = Number(m[2]);
        const yRaw = String(m[3]);
        const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
        if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(d)) date = makeUTCNoon(y, mo, d);
      }
    }

    if (!date || !Number.isFinite(date.getTime())) return null;
    try {
      return new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      }).format(date);
    } catch {
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yy = String(date.getFullYear()).slice(-2);
      return `${dd}/${mm}/${yy}`;
    }
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
    if (s === 'parziale' || s === 'limitato' || s === 'partial') return { state: 'PARTIAL', label: 'Parziale' };
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
    const selectionType = raw.selectionType || raw.tipoSelezione || null;
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
            if (selectionType === 'date' && ts != null) {
              return formatDateDDMMYY(ts);
            }

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
        .filter((o) => o.choice !== null || o.technical || o.timestampRiferimento != null || o.date != null);
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
      const hasExecutive = fermate.some((f) => f?.carrozzaExecutive != null);
      const stops = fermate.map((f, idx) => {
        const stationName = typeof f?.stazione === 'string' ? f.stazione.trim() : '';
        const station = stationName ? getStationByName(stationName) : null;
        const stationCode = station?.id || null;
        const coord = station?.lat != null && station?.lon != null ? { latitude: station.lat, longitude: station.lon } : null;

        const arrival = buildTiming(f?.orari?.arrivo);
        const departure = buildTiming(f?.orari?.partenza);

        const platformPlanned =
          f?.binari?.partenza?.programmato ?? f?.binari?.arrivo?.programmato ?? null;
        const platformActual =
          f?.binari?.partenza?.reale ?? f?.binari?.arrivo?.reale ?? null;

        const tipoFermata = typeof f?.tipoFermata === 'string' ? f.tipoFermata.trim().toUpperCase() : '';
        const isSuppressedStop =
          f?.fermataSoppressa === true ||
          f?.soppressa === true ||
          f?.isSoppressa === true ||
          f?.cancellata === true ||
          f?.isCancelled === true ||
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
            (platformPlanned && platformActual && String(platformPlanned) !== String(platformActual)) || false,
          isSuppressedStop,
          executivePosition: f?.carrozzaExecutive ?? null,
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
	        if (journeyStateCode === 'PARTIAL') return isVariatoByFlag ? 'Variazione di percorso' : 'Parziale (alcune fermate soppresse)';

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
          kindCode: trainKind?.sigla || trainKind?.codice || trainKind?.code || null,
          kindCategory: trainKind?.categoria || trainKind?.category || null,
          number: trainNumber,
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
      const delayMinutes = typeof treno.ritardoMinuti === 'number' ? treno.ritardoMinuti : null;

      const from = treno.tratta?.origine || null;
      const to = treno.tratta?.destinazione || null;

      const fermate = Array.isArray(treno.fermate) ? [...treno.fermate].sort((a, b) => (a.progressivo ?? 0) - (b.progressivo ?? 0)) : [];
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

        const platformPlanned = f.binari?.programmato ?? null;
        const platformActual = f.binari?.reale ?? null;
        const platformChanged = f.binari?.variato === true;

        const isCurrent = currentStopIndex != null ? idx === currentStopIndex : currentStopCode ? stationCode === currentStopCode : false;
        const tipoFermata = typeof f?.tipoFermata === 'string' ? f.tipoFermata.trim().toUpperCase() : '';
        const isSuppressedStop =
          f?.fermataSoppressa === true ||
          f?.soppressa === true ||
          f?.isSoppressa === true ||
          f?.cancellata === true ||
          f?.isCancelled === true ||
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
	        if (journeyStateCode === 'PARTIAL') return 'Parziale (alcune fermate soppresse)';
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

	        if (journeyStateCode === 'RUNNING' && treno.posizione?.stazione) {
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
          kindCode: trainKind?.sigla || trainKind?.codice || null,
          kindCategory: trainKind?.categoria || null,
          number: trainNumber,
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

      const fermate = [...computed.fermate].sort((a, b) => (a.progressivo ?? 0) - (b.progressivo ?? 0));
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

        const platformPlanned = f.binarioProgrammato ?? null;
        const platformActual = f.binarioReale ?? null;
        const platformChanged =
          f.binarioVariato === true ||
          (platformPlanned && platformActual && String(platformPlanned) !== String(platformActual));

        const isCurrent =
          f.attuale === true ||
          (currentStopIndex != null ? idx === currentStopIndex : currentStopCode ? stationCode === currentStopCode : false);

        const tipoFermata = typeof f?.tipoFermata === 'string' ? f.tipoFermata.trim().toUpperCase() : '';
        const isSuppressedStop =
          f?.fermataSoppressa === true ||
          f?.soppressa === true ||
          f?.isSoppressa === true ||
          f?.cancellata === true ||
          f?.isCancelled === true ||
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
	        if (journeyStateCode === 'PARTIAL') return 'Parziale (alcune fermate soppresse)';
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
          kindCode: trainKind?.code || null,
          kindCategory: trainKind?.category || null,
          number: trainNumber,
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
      const journeyStateCode = journeyFromString.state || null;
      const journeyStateLabel = journeyFromString.label || null;
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

      const stops = fermateList.map((f, idx) => {
        const stationName = typeof f?.stazione === 'string' ? f.stazione.trim() : '';
        const station = stationName ? getStationByName(stationName) : null;
        const stationCode = station?.id || null;
        const coord = station?.lat != null && station?.lon != null ? { latitude: station.lat, longitude: station.lon } : null;

        const arrival = buildTimingFromStop(f?.orari?.arrivo, delayMinutes);
        const departure = buildTimingFromStop(f?.orari?.partenza, delayMinutes);

        const platformPlanned =
          f?.binari?.partenza?.programmato ?? f?.binari?.arrivo?.programmato ?? null;
        const platformActual =
          f?.binari?.partenza?.reale ?? f?.binari?.arrivo?.reale ?? null;

        const tipoFermata = typeof f?.tipoFermata === 'string' ? f.tipoFermata.trim().toUpperCase() : '';
        const isSuppressedStop =
          f?.fermataSoppressa === true ||
          f?.soppressa === true ||
          f?.isSoppressa === true ||
          f?.cancellata === true ||
          f?.isCancelled === true ||
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
            (platformPlanned && platformActual && String(platformPlanned) !== String(platformActual)) || false,
          isSuppressedStop,
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
        if (journeyStateCode === 'PARTIAL') return 'Parziale (alcune fermate soppresse)';

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
          kindCode: trainKind?.sigla || trainKind?.categoria || trainKind?.code || null,
          kindCategory: trainKind?.categoria || trainKind?.category || null,
          number: trainNumber,
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
          hasExecutive: false,
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

    const fermate = Array.isArray(data.fermate) ? [...data.fermate].sort((a, b) => (a.progressivo ?? 0) - (b.progressivo ?? 0)) : [];
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

      const platformPlanned =
        f.binarioProgrammato ??
        f.binarioProgrammatoPartenzaDescrizione ??
        f.binarioProgrammatoArrivoDescrizione ??
        null;
      const platformActual =
        f.binarioReale ??
        f.binarioEffettivoPartenzaDescrizione ??
        f.binarioEffettivoArrivoDescrizione ??
        null;
      const platformChanged =
        f.binarioVariato === true ||
        (platformPlanned && platformActual && String(platformPlanned) !== String(platformActual));
      const isCurrent = currentStopIndex != null ? idx === currentStopIndex : currentStopCode ? stationCode === currentStopCode : false;
      const stopName = String(f.stazione || station?.name || stationCode || '').trim();
      const isSuppressedStop =
        f?.fermataSoppressa === true ||
        f?.soppressa === true ||
        f?.isSoppressa === true ||
        f?.cancellata === true ||
        f?.isCancelled === true ||
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
	        if (journeyStateCode === 'PARTIAL' || (Array.isArray(data.fermateSoppresse) && data.fermateSoppresse.length > 0)) {
	          return 'Parziale (alcune fermate soppresse)';
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
        kindCode: trainKind?.sigla || trainKind?.code || null,
        kindCategory: trainKind?.category || null,
        number: trainNumber,
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
        departure: departureTiming,
        arrival: arrivalTiming,
        stops,
      },
    };
  };

  const getBestTimeLabel = (timing) => {
    if (!timing) return '—';
    if (timing.actual && timing.actual !== '—') return timing.actual;
    if (timing.predicted && timing.predicted !== '—') return timing.predicted;
    if (timing.scheduled && timing.scheduled !== '—') return timing.scheduled;
    return '—';
  };

  const loadRecentTrains = async () => {
    const recent = await getRecentTrains(5);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRecentTrains(recent);
  };

  const refreshRecentTrains = async () => {
    setRecentRefreshing(true);
    try {
      const recent = await getRecentTrains(5);
      const updated = await Promise.all(
        (Array.isArray(recent) ? recent : []).map(async (t) => {
          const trainNumber = t?.number;
          if (!trainNumber) return t;
          try {
            const normalized = await fetchTrainStatusNormalized(trainNumber, {
              choice: t?.choice ?? null,
              originName: t?.originName ?? null,
              technical: t?.technical ?? null,
              originCode: t?.originCode ?? null,
              timestampRiferimento: t?.timestampRiferimento ?? null,
              date: t?.date ?? null,
              epochMs: Date.now(),
            });
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

  async function refreshSelectedTrain(trainOverride = null, { silent = false } = {}) {
    const base = trainOverride || selectedTrain;
    const trainNumber = base?.number;
    if (!trainNumber) return;

    const token = ++trainRefreshTokenRef.current;
    if (silent) setTrainAutoRefreshing(true);
    else setTrainModalRefreshing(true);
    try {
      const normalized = await fetchTrainStatusNormalized(trainNumber, {
        choice: base?.choice ?? null,
        originName: base?.originName ?? null,
        technical: base?.technical ?? null,
        originCode: base?.originCode ?? null,
        timestampRiferimento: base?.timestampRiferimento ?? null,
        date: base?.date ?? null,
        epochMs: Date.now(),
      });
      if (token !== trainRefreshTokenRef.current) return;
      if (normalized.kind === 'train') {
        setSelectedTrain(normalized.train);
        setLastTrainRefreshEpochMs(Date.now());
        if (!silent) {
          await saveRecentTrain(normalized.train);
          await loadRecentTrains();
        }
      } else if (normalized.kind === 'selection') {
        if (!silent) {
          Alert.alert('Selezione richiesta', normalized.message || 'Trovati più treni: ripeti la ricerca e scegli una corsa');
        }
      }
    } catch (error) {
      if (token !== trainRefreshTokenRef.current) return;
      if (!silent) {
        Alert.alert('Errore', error?.message || 'Errore di rete');
      }
    } finally {
      if (token === trainRefreshTokenRef.current) {
        if (silent) setTrainAutoRefreshing(false);
        else setTrainModalRefreshing(false);
      }
    }
  }

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
    hapticImpact(Haptics.ImpactFeedbackStyle.Medium);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await removeRecentTrain(train.id);
    await loadRecentTrains();
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
            hapticImpact(Haptics.ImpactFeedbackStyle.Heavy);
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

  const fetchTrainStatusNormalized = async (
    trainNumberRaw,
    { choice = null, originName = null, technical = null, originCode = null, epochMs = null, timestampRiferimento = null, date = null } = {}
  ) => {
    const num = String(trainNumberRaw || '').trim();
    if (num.length < 3) {
      return { kind: 'empty', message: '' };
    }
    const res = await getTrainStatus(num, { choice, originName, technical, originCode, epochMs, timestampRiferimento, date });
    return normalizeTrainStatusResponse(res, num, { choice, originName, technical, originCode, epochMs, timestampRiferimento, date });
  };

  const runTrainSearch = async (
    trainNumberRaw,
    { choice = null, originName = null, technical = null, originCode = null, epochMs = null, timestampRiferimento = null, date = null } = {}
  ) => {
    const token = ++lastSearchTokenRef.current;
    const num = String(trainNumberRaw || '').trim();

    if (num.length < 3) {
      setSearchLoading(false);
      setSearchError('');
      setSearchHint('');
      setSearchResults([]);
      return { kind: 'empty', message: '' };
    }

    setSearchLoading(true);
    setSearchError('');
    setSearchHint('');

    try {
      const normalized = await fetchTrainStatusNormalized(num, { choice, originName, technical, originCode, epochMs, timestampRiferimento, date });
      if (token !== lastSearchTokenRef.current) return { kind: 'empty', message: '' };

      if (normalized.kind === 'selection') {
        setSearchHint(normalized.message || 'Trovati più treni: scegli una corsa');
        setSearchResults(
          (normalized.options || []).map((o) => ({
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
          }))
        );
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
        setSearchLoading(false);
      }
    }
  };

  const refreshTrainSearch = async () => {
    const num = String(searchQuery || '').trim();
    if (num.length < 3) return;
    const token = ++lastSearchTokenRef.current;

    setSearchRefreshing(true);
    setSearchError('');
    setSearchHint('');

    try {
      const normalized = await fetchTrainStatusNormalized(num, { epochMs: Date.now() });
      if (token !== lastSearchTokenRef.current) return;

      if (normalized.kind === 'selection') {
        setSearchHint(normalized.message || 'Trovati più treni: scegli una corsa');
        setSearchResults(
          (normalized.options || []).map((o) => ({
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
          }))
        );
        return;
      }

      if (normalized.kind === 'train') {
        setSearchResults([{ kind: 'train', ...normalized.train }]);
        return;
      }

      if (normalized.kind === 'empty') {
        setSearchHint(normalized.message || 'Nessun treno trovato');
        setSearchResults([]);
        return;
      }

      setSearchError(normalized.message || 'Errore');
      setSearchResults([]);
    } catch (error) {
      if (token !== lastSearchTokenRef.current) return;
      setSearchError(error?.message || 'Errore di rete');
      setSearchResults([]);
    } finally {
      if (token === lastSearchTokenRef.current) setSearchRefreshing(false);
    }
  };

  const handleSearch = (text) => {
    const digits = String(text || '').replace(/\D+/g, '');
    setSearchQuery(digits);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    if (digits.length < 3) {
      setSearchLoading(false);
      setSearchError('');
      setSearchHint('');
      setSearchResults([]);
      return;
    }

    searchDebounceRef.current = setTimeout(() => {
      runTrainSearch(digits);
      searchDebounceRef.current = null;
    }, 550);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
    setSearchHint('');
    setSearchLoading(false);
    lastSearchTokenRef.current += 1;
  };

	  const openTrain = async (train, { refresh = false } = {}) => {
	    hapticSelection();
	    await saveRecentTrain(train);
	    await loadRecentTrains();
	    setShowTrainModal(true);
	    setSelectedTrain(train);
	    setLastTrainRefreshEpochMs(refresh ? null : Date.now());
    clearSearch();
    if (refresh) {
      await refreshSelectedTrain(train);
    }
  };

	  const openTrainFromOption = async (opt) => {
	    if (!opt?.trainNumber) return;
	    const normalized = await runTrainSearch(opt.trainNumber, {
	      choice: opt.choice ?? null,
	      originName: opt.originName ?? null,
	      technical: opt.technical,
      originCode: opt.originCode,
      epochMs: opt.epochMs,
      timestampRiferimento: opt.timestampRiferimento ?? null,
      date: opt.date ?? null,
    });

    if (normalized.kind === 'train') {
      await openTrain(normalized.train);
    }
  };

	  const closeTrainModal = () => {
	    hapticSelection();
	    trainRefreshTokenRef.current += 1;
	    setTrainModalRefreshing(false);
	    setTrainAutoRefreshing(false);
	    setShowTrainModal(false);
    setSelectedTrain(null);
    setMapModalVisible(false);
    setTrackingToggling(false);

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

  const toggleTrackingForSelectedTrain = async () => {
    if (!selectedTrain || trackingToggling) return;
    hapticSelection();

    if (isExpoGo()) {
      Alert.alert(
        'Non disponibile in Expo Go',
        'Le notifiche e il tracciamento in background richiedono una development build (Xcode).'
      );
      return;
    }

    setTrackingToggling(true);
    try {
      const key = getTrackingKeyFromTrain(selectedTrain);
      const existing = key ? await getTrackedTrainById(key) : null;

      if (existing) {
        hapticImpact(Haptics.ImpactFeedbackStyle.Heavy);
        await disableTrackingForTrain(selectedTrain);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setTrackingStopsOpen(false);
        setTrackedItem(null);
        return;
      }

      hapticImpact(Haptics.ImpactFeedbackStyle.Medium);
      const stop = trackingStopName || selectedTrain?.to || selectedTrain?.nextStopName || null;
      const minutes = (() => {
        const n = Number(trackingMinutesBefore);
        if (!Number.isFinite(n) || n <= 0) return 10;
        return Math.min(60, Math.max(1, Math.round(n)));
      })();
      const saved = await enableTrackingForNormalizedTrain(selectedTrain, {
        targetStopName: stop,
        notifyDelay: true,
        notifyEta: true,
        etaThresholds: [minutes],
      });
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTrackedItem(saved);

      const notificationsEnabled = await getNotificationsEnabled();
      if (!notificationsEnabled) {
        Alert.alert('Tracciamento attivato', 'Per ricevere gli avvisi attiva le notifiche in Impostazioni.', [
          { text: 'OK' },
          { text: 'Apri impostazioni', onPress: () => navigation.navigate('Preferiti') },
        ]);
        return;
      }

      const perm = await requestNotificationPermissionIfNeeded();
      if (!perm.granted) {
        Alert.alert('Permesso notifiche negato', 'Abilita le notifiche dalle impostazioni di sistema per ricevere gli avvisi.', [
          { text: 'OK' },
        ]);
        return;
      }

      await ensureTrainTrackingTaskRegistered();
      await runTrainTrackingNow();
    } finally {
      setTrackingToggling(false);
    }
  };

  const updateTrackingSettings = async ({ nextStopName, nextMinutesBefore, nextNotifyDelay, nextNotifyEta }) => {
    if (!selectedTrain || trackingToggling) return;
    const key = getTrackingKeyFromTrain(selectedTrain);
    if (!key) return;

    const existing = await getTrackedTrainById(key);
    if (!existing) return;

    const stopName = typeof nextStopName === 'string' ? nextStopName.trim() : nextStopName ?? null;
    const minutes = (() => {
      if (nextMinutesBefore === null || nextMinutesBefore === undefined) return null;
      const n = Number(nextMinutesBefore);
      if (!Number.isFinite(n) || n <= 0) return null;
      return Math.min(60, Math.max(1, Math.round(n)));
    })();

    const patch = {
      targetStopName: stopName ?? existing?.targetStopName ?? null,
      etaThresholds: minutes != null ? [minutes] : existing?.etaThresholds ?? [10],
      notifyDelay: nextNotifyDelay !== undefined ? Boolean(nextNotifyDelay) : existing?.notifyDelay !== false,
      notifyEta: nextNotifyEta !== undefined ? Boolean(nextNotifyEta) : existing?.notifyEta !== false,
    };

    const next = {
      ...existing,
      ...patch,
      scheduled: {
        ...(existing?.scheduled || {}),
        stopName: patch.targetStopName,
      },
    };

    setTrackedItem(next);
    await upsertTrackedTrain(next);
    await ensureTrainTrackingTaskRegistered();
    await runTrainTrackingNow();
  };

  const renderTrainResultRow = ({ item }) => {
    const borderStyle = item?._noDivider === true ? { borderBottomWidth: 0 } : null;
		    if (item.kind === 'option') {
		      return (
	        <TouchableOpacity
	          style={[styles.resultItem, { borderBottomColor: theme.colors.border }, borderStyle]}
	          onPress={() => {
	            hapticSelection();
	            openTrainFromOption(item);
	          }}
	          activeOpacity={0.6}
	        >
          <View style={styles.resultLeft}>
            <Text style={[styles.resultTrain, { color: theme.colors.text }]} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={[styles.resultRoute, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              Seleziona la corsa
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
    const statusText =
      isSuppressed
        ? null
        : typeof item?.journeyStateLabel === 'string' && item.journeyStateLabel.trim()
          ? item.journeyStateLabel.trim()
          : null;
    const statusColor = (() => {
      if (isSuppressed) return cancelColor;
      if (item.delayMinutes != null) return delayColors.fg;
      if (item?.journeyStateCode) return getJourneyStateColor(item.journeyStateCode);
      return theme.colors.textSecondary;
    })();
//Sistemare orari probabili, cambia nome da stazione a posizione per rilev., sistema 
	    return (
	      <TouchableOpacity
	        style={[styles.resultItem, { borderBottomColor: theme.colors.border }, borderStyle]}
	        onPress={() => openTrain(item)}
	        activeOpacity={0.6}
	      >
        <View style={styles.resultLeft}>
          <View style={styles.resultTitleRow}>
            <Text style={[styles.resultTrainKind, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {item.type}
            </Text>
            <Text style={[styles.resultTrainNumber, { color: theme.colors.text }]} numberOfLines={1}>
              {item.number}
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

  const renderRecentTrainItem = (train, index) => (
    <View key={`${String(train.id ?? train.number ?? 'train')}-${index}`}>
      <SwipeableRow
        theme={theme}
        onDelete={() => handleDeleteRecentTrain(train)}
        onSwipeStart={() => setScrollEnabled(false)}
        onSwipeEnd={() => setScrollEnabled(true)}
        resetKey={swipeResetVersion}
      >
        <TouchableOpacity style={styles.listItem} onPress={() => openTrain(train, { refresh: true })} activeOpacity={0.6}>
          <View style={styles.listItemContent}>
            <View style={styles.listItemIcon}>
              <Ionicons name="train-outline" size={20} color={theme.colors.text} />
            </View>
            <View style={styles.listItemText}>
              <View style={styles.listTitleRow}>
                <Text style={[styles.listItemKind, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                  {train.type}
                </Text>
                <Text style={[styles.listItemTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {train.number}
                </Text>
                {(() => {
                  const trainDateLabel = getTrainDateLabel(train);
                  if (!trainDateLabel) return null;
                  return (
                    <Text style={[styles.trainDateText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                      {`del ${trainDateLabel}`}
                    </Text>
                  );
                })()}
              </View>
              <Text style={[styles.listItemSubtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                {train.from} → {train.to}
              </Text>
              {train.delayMinutes != null || train.journeyStateLabel ? (
                <Text
                  style={[
                    styles.listItemMeta,
                    {
                      color: (() => {
                        const isSuppressed = train.isSuppressed === true || train.journeyStateCode === 'CANCELLED';
                        if (isSuppressed) return getJourneyStateColor('CANCELLED');
                        if (train.delayMinutes != null) return getDelayColors(train.delayMinutes).fg;
                        if (train?.journeyStateCode) return getJourneyStateColor(train.journeyStateCode);
                        return theme.colors.textSecondary;
                      })(),
                    },
                  ]}
                  numberOfLines={1}
                >
                  {[
                    train.isSuppressed === true || train.journeyStateCode === 'CANCELLED'
                      ? 'Soppresso'
                      : train.delayMinutes != null
                        ? formatDelay(train.delayMinutes)
                        : null,
                    typeof train?.journeyStateLabel === 'string' && train.journeyStateLabel.trim()
                      ? train.journeyStateLabel.trim()
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' • ')}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} style={{ opacity: 0.3 }} />
          </View>
        </TouchableOpacity>
      </SwipeableRow>
      {index < recentTrains.length - 1 ? <View style={[styles.listDivider, { backgroundColor: theme.colors.border }]} /> : null}
    </View>
  );

	  const modalStops = selectedTrain?.stops ?? [];
	  const modalCurrentStopIndex = modalStops.findIndex((s) => s?.isCurrent);
	  const modalDelayMinutes = selectedTrain?.delayMinutes ?? null;
	  const modalJourneyStateCode = selectedTrain?.journeyStateCode || null;

  const minutesUntil = (epochMs) => {
    const ts = Number(epochMs);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return Math.round((ts - Date.now()) / 60000);
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

  const trackingStopOptions = (() => {
    const stops = Array.isArray(modalStops) ? modalStops : [];
    if (stops.length === 0) return [];
    const nextIdx = parseOptionalIndex(selectedTrain?.nextStopIndex);
    const start =
      modalCurrentStopIndex >= 0
        ? modalCurrentStopIndex
        : nextIdx != null && nextIdx >= 0
          ? nextIdx
          : 0;
    return stops
      .slice(Math.max(0, start))
      .map((s) => (typeof s?.name === 'string' ? s.name.trim() : ''))
      .filter((name) => name && name !== '—');
  })();

  const modalNextStop = (() => {
    if (!Array.isArray(modalStops) || modalStops.length === 0) return null;
    if (modalJourneyStateCode === 'COMPLETED') return null;
    const idx = parseOptionalIndex(selectedTrain?.nextStopIndex);
    if (idx != null && idx >= 0 && idx < modalStops.length) return modalStops[idx];
    const name = typeof selectedTrain?.nextStopName === 'string' ? selectedTrain.nextStopName.trim() : '';
    if (!name) return null;
    const found = modalStops.find((s) => String(s?.name || '').trim().toLowerCase() === name.toLowerCase()) || null;
    return found;
  })();

  const modalExecutiveStop = (() => {
    if (!Array.isArray(modalStops) || modalStops.length === 0) return null;
    const nextIdx = parseOptionalIndex(selectedTrain?.nextStopIndex);
    const start = nextIdx != null && nextIdx >= 0 ? nextIdx : 0;
    const future = modalStops.slice(start).find((s) => s?.executivePosition) || null;
    const any = modalStops.find((s) => s?.executivePosition) || null;
    return future || any;
  })();

		  const positionHeadlineText = (() => {
		    const stops = Array.isArray(modalStops) ? modalStops : [];
		    if (selectedTrain?.isSuppressed === true || selectedTrain?.journeyStateCode === 'CANCELLED') {
		      return selectedTrain?.positionText || null;
		    }
		    if (modalJourneyStateCode === 'COMPLETED') return selectedTrain?.positionText || null;
		    if (selectedTrain?.isInStation === true) return selectedTrain?.positionText || null;
		    const curIdx = modalCurrentStopIndex;
        if (modalJourneyStateCode !== 'RUNNING') {
          return selectedTrain?.positionText || selectedTrain?.journeyStateLabel || null;
        }

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
    return selectedTrain?.positionText || null;
  })();

  const modalLastDetectionText = (() => {
    if (!selectedTrain) return null;
    if (selectedTrain?.isSuppressed === true || selectedTrain?.journeyStateCode === 'CANCELLED') return null;
    if (modalJourneyStateCode === 'COMPLETED') return null;
    if (selectedTrain?.isInStation === true) return null;

    if (selectedTrain?.journeyStateCode !== 'RUNNING') return null;
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

	  const nextStopPlatformText = modalNextStop?.platformActual || modalNextStop?.platformPlanned || null;

	  const nextStopEtaEpoch =
	    modalNextStop?.arrival?.actualEpoch ?? modalNextStop?.arrival?.predictedEpoch ?? modalNextStop?.arrival?.scheduledEpoch ?? null;
	  const nextStopEtaText = (() => {
	    if (!modalNextStop) return null;
	    const t = modalNextStop.arrival;
	    if (t?.actual && t.actual !== '—') return t.actual;
	    if (t?.predicted && t.predicted !== '—') return `~ ${t.predicted}`;
	    if (t?.scheduled && t.scheduled !== '—') return t.scheduled;
	    if (selectedTrain?.nextStopArrivalEstimated) return `~ ${selectedTrain.nextStopArrivalEstimated}`;
	    return selectedTrain?.nextStopArrivalPlanned || null;
	  })();
	  const nextStopInMinutesText = formatInMinutes(minutesUntil(nextStopEtaEpoch));

	  const nextStopArrivesText = (() => {
		    if (!modalNextStop) return null;
		    return nextStopInMinutesText || null;
		  })();

		  const trainResults = Array.isArray(searchResults) ? searchResults : [];
	    const resultsForRender = trainResults.map((r, idx) => ({ ...r, _noDivider: idx === trainResults.length - 1 }));
		  const showResultsPanel =
		    searchQuery.length >= 3 || searchLoading || searchError || searchHint || trainResults.length > 0;
		  const scrollRefreshing = showResultsPanel ? searchRefreshing : recentRefreshing;
		  const handleScrollRefresh = () => {
	    if (showResultsPanel) {
	      refreshTrainSearch();
    } else {
      refreshRecentTrains();
    }
  };

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
                    onSubmitEditing={() => runTrainSearch(searchQuery)}
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
                contentContainerStyle={styles.scrollContent}
                scrollEnabled={scrollEnabled}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                  <RefreshControl refreshing={scrollRefreshing} onRefresh={handleScrollRefresh} tintColor={theme.colors.accent} />
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
                        <View style={styles.resultsEmptyState}>
                          <ModernSpinner
                            size={26}
                            thickness={3}
                            color={theme.colors.accent}
                            innerStyle={{ backgroundColor: theme.colors.card }}
                            style={{ marginBottom: 12 }}
                          />
                          <Text style={[styles.resultsEmptyTitle, { color: theme.colors.text }]}>Cerco…</Text>
                          <Text style={[styles.resultsEmptySubtitle, { color: theme.colors.textSecondary }]}>
                            Sto interrogando Treninfo
                          </Text>
                        </View>
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

              <EdgeFade height={SPACE.xl} style={styles.topEdgeFade} />
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
	              <TouchableOpacity onPress={handleUndo} activeOpacity={0.75} hitSlop={HIT_SLOP.sm}>
	                <Text style={[styles.undoToastAction, { color: theme.colors.accent }]}>ANNULLA</Text>
	              </TouchableOpacity>
	            </View>
          </Animated.View>
        )}

        {/* Modal treno */}
        <Modal
          visible={showTrainModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={closeTrainModal}
        >
	          <View style={[styles.modalContainer, { backgroundColor: theme.colors.background, flex: 1 }]}>
			            <View style={[styles.modalHeader, { backgroundColor: 'transparent' }]}>
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
				                      <Text style={[styles.lastRefreshText, { color: theme.colors.textSecondary }]}>
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
	                          opacity: trainModalRefreshing ? 0.6 : 1,
	                        },
	                        iconButtonShadow(theme),
	                      ]}
	                      activeOpacity={0.7}
	                      disabled={trainModalRefreshing}
	                      hitSlop={HIT_SLOP.md}
	                      accessibilityLabel="Ricarica"
	                    >
                      <Ionicons name="refresh" size={20} color={theme.colors.text} />
                    </TouchableOpacity>
                    </View>
	              </View>
	            </View>

		            <ScrollView
		              style={{ flex: 1 }}
		              showsVerticalScrollIndicator={false}
		              contentContainerStyle={{ paddingBottom: 32 }}
		            >
              <View style={styles.modalTopSpacer} />
              
              {/* Header con info principale */}
              <View style={styles.modalContentWrap}>
                <View style={styles.modalHeaderContent}>
                  {(() => {
                    const trainDateLabel = getTrainDateLabel(selectedTrain);
                    return (
                  <View style={styles.modalTitleRow}>
                    <Text style={[styles.modalTrainKind, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                      {selectedTrain?.type}
                    </Text>
                    <Text style={[styles.modalTrainNumber, { color: theme.colors.text }]} numberOfLines={1}>
                      {selectedTrain?.number}
                    </Text>
                    {trainDateLabel ? (
                      <Text style={[styles.trainDateText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                        {`del ${trainDateLabel}`}
                      </Text>
                    ) : null}
                    {selectedTrain?.number ? (
                      <TouchableOpacity
                        onPress={toggleTrackingForSelectedTrain}
                        activeOpacity={0.7}
                        hitSlop={HIT_SLOP.sm}
                        disabled={trackingToggling}
                        style={[
                          styles.trackingBellButton,
                          {
                            backgroundColor: theme.colors.card,
                            borderColor: theme.colors.border,
                            opacity: trackingToggling ? 0.6 : 1,
                          },
                          iconButtonShadow(theme),
                        ]}
                        accessibilityLabel={trackedItem ? 'Disattiva tracciamento' : 'Attiva tracciamento'}
                      >
                        <Ionicons
                          name={trackedItem ? 'notifications' : 'notifications-outline'}
                          size={18}
                          color={trackedItem ? theme.colors.accent : theme.colors.textSecondary}
                        />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                    );
                  })()}

	                  <Text style={[styles.modalRoute, { color: theme.colors.text }]} numberOfLines={1}>
			                    {selectedTrain?.from} → {selectedTrain?.to}
			                  </Text>

                    <View style={styles.modalPillsRow}>
                      {selectedTrain?.delayMinutes != null && !selectedTrain?.isSuppressed ? (
                        (() => {
                          const colors = getDelayColors(selectedTrain.delayMinutes);
                          return (
                            <View style={[styles.delayPill, { backgroundColor: colors.bg, borderColor: colors.fg }]}>
                              <Text style={[styles.delayPillText, { color: colors.fg }]}>
                                {formatDelay(selectedTrain.delayMinutes)}
                              </Text>
                            </View>
                          );
                        })()
                      ) : null}
                      {selectedTrain?.journeyStateLabel ? (
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
                              <Text style={[styles.statePillText, { color: stateColor }]} numberOfLines={1}>
                                {selectedTrain.journeyStateLabel}
                              </Text>
                            </View>
                          );
                        })()
                      ) : null}
                    </View>
			                </View>

                  {trackedItem ? (
                    <View style={styles.sectionBlock}>
                      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>AVVISI</Text>
                      <View
                        style={[
                          styles.trackingSettingsCard,
                          { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
                          cardShadow(theme),
                        ]}
                      >
                        {(() => {
                          const notifyDelayEnabled = trackedItem?.notifyDelay !== false;
                          const notifyEtaEnabled = trackedItem?.notifyEta !== false;
                          return (
                            <>
                              <View style={styles.trackingRow}>
                                <View style={styles.trackingRowLeft}>
                                  <Text style={[styles.trackingLabel, { color: theme.colors.text }]}>Aggiornamenti ritardo</Text>
                                  <Text style={[styles.trackingHint, { color: theme.colors.textSecondary }]}>
                                    Notifica quando il ritardo cambia
                                  </Text>
                                </View>
                                <AccentSwitch
                                  value={notifyDelayEnabled}
                                  onValueChange={(v) => updateTrackingSettings({ nextNotifyDelay: v })}
                                  trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
                                />
                              </View>

                              <View style={[styles.trackingDivider, { backgroundColor: theme.colors.border }]} />

                              <View style={styles.trackingRow}>
                                <View style={styles.trackingRowLeft}>
                                  <Text style={[styles.trackingLabel, { color: theme.colors.text }]}>Avvisi di arrivo</Text>
                                  <Text style={[styles.trackingHint, { color: theme.colors.textSecondary }]}>
                                    Notifica prima dell’arrivo a una fermata
                                  </Text>
                                </View>
                                <AccentSwitch
                                  value={notifyEtaEnabled}
                                  onValueChange={(v) => {
                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                    setTrackingStopsOpen(false);
                                    updateTrackingSettings({ nextNotifyEta: v });
                                  }}
                                  trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
                                />
                              </View>

                              {notifyEtaEnabled ? (
                                <>
                                  <View style={[styles.trackingDivider, { backgroundColor: theme.colors.border }]} />

                                  <View style={styles.trackingRow}>
                                    <View style={styles.trackingRowLeft}>
                                      <Text style={[styles.trackingLabel, { color: theme.colors.text }]}>Minuti prima dell’arrivo</Text>
                                      <Text style={[styles.trackingHint, { color: theme.colors.textSecondary }]}>
                                        Valido per gli avvisi di arrivo
                                      </Text>
                                    </View>
                                    <View
                                      style={[
                                        styles.trackingStepper,
                                        { borderColor: theme.colors.border, backgroundColor: theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' },
                                      ]}
                                    >
                                      <TouchableOpacity
                                        onPress={() => {
                                          hapticSelection();
                                          const next = Math.max(1, Math.min(60, trackingMinutesBefore - 1));
                                          setTrackingMinutesBefore(next);
                                          updateTrackingSettings({ nextMinutesBefore: next });
                                        }}
                                        disabled={trackingMinutesBefore <= 1}
                                        style={[
                                          styles.trackingStepButton,
                                          {
                                            borderLeftWidth: 0,
                                            borderRightColor: theme.colors.border,
                                            opacity: trackingMinutesBefore <= 1 ? 0.4 : 1,
                                          },
                                        ]}
                                        hitSlop={HIT_SLOP.sm}
                                        activeOpacity={0.7}
                                        accessibilityLabel="Diminuisci minuti"
                                      >
                                        <Ionicons name="remove" size={18} color={theme.colors.text} />
                                      </TouchableOpacity>
                                      <View style={styles.trackingStepValueWrap}>
                                        <Text style={[styles.trackingStepValue, { color: theme.colors.text }]}>{trackingMinutesBefore}</Text>
                                        <Text style={[styles.trackingStepUnit, { color: theme.colors.textSecondary }]}>min</Text>
                                      </View>
                                      <TouchableOpacity
                                        onPress={() => {
                                          hapticSelection();
                                          const next = Math.max(1, Math.min(60, trackingMinutesBefore + 1));
                                          setTrackingMinutesBefore(next);
                                          updateTrackingSettings({ nextMinutesBefore: next });
                                        }}
                                        disabled={trackingMinutesBefore >= 60}
                                        style={[
                                          styles.trackingStepButton,
                                          {
                                            borderRightWidth: 0,
                                            borderLeftColor: theme.colors.border,
                                            opacity: trackingMinutesBefore >= 60 ? 0.4 : 1,
                                          },
                                        ]}
                                        hitSlop={HIT_SLOP.sm}
                                        activeOpacity={0.7}
                                        accessibilityLabel="Aumenta minuti"
                                      >
                                        <Ionicons name="add" size={18} color={theme.colors.text} />
                                      </TouchableOpacity>
                                    </View>
                                  </View>

                                  <View style={[styles.trackingDivider, { backgroundColor: theme.colors.border }]} />

                                  <TouchableOpacity
                                    onPress={() => {
                                      if (!trackingStopOptions || trackingStopOptions.length === 0) return;
                                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                      setTrackingStopsOpen((v) => !v);
                                    }}
                                    activeOpacity={0.7}
                                    disabled={!trackingStopOptions || trackingStopOptions.length === 0}
                                    style={styles.trackingRow}
                                    accessibilityLabel="Seleziona fermata per gli avvisi"
                                  >
                                    <View style={styles.trackingRowLeft}>
                                      <Text style={[styles.trackingLabel, { color: theme.colors.text }]}>Avvisami quando arriva a</Text>
                                      <Text style={[styles.trackingValue, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                        {trackingStopName || 'Seleziona una fermata'}
                                      </Text>
                                    </View>
                                    <Ionicons
                                      name={trackingStopsOpen ? 'chevron-up' : 'chevron-down'}
                                      size={18}
                                      color={theme.colors.textSecondary}
                                      style={{ opacity: trackingStopOptions.length === 0 ? 0.3 : 0.7 }}
                                    />
                                  </TouchableOpacity>

                                  {trackingStopsOpen ? (
                                    <View style={[styles.trackingStopsList, { borderTopColor: theme.colors.border }]}>
                                      <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                        {trackingStopOptions.map((name, idx) => {
                                          const selected = trackingStopName && name.toLowerCase() === trackingStopName.toLowerCase();
                                          return (
                                            <TouchableOpacity
                                              key={`${name}-${idx}`}
                                              onPress={() => {
                                                hapticSelection();
                                                setTrackingStopName(name);
                                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                setTrackingStopsOpen(false);
                                                updateTrackingSettings({ nextStopName: name });
                                              }}
                                              activeOpacity={0.7}
                                              style={[
                                                styles.trackingStopOptionRow,
                                                { borderBottomColor: theme.colors.border },
                                              ]}
                                            >
                                              <Text
                                                style={[
                                                  styles.trackingStopOptionText,
                                                  {
                                                    color: selected ? theme.colors.accent : theme.colors.text,
                                                    fontFamily: selected ? FONTS.semibold : FONTS.regular,
                                                  },
                                                ]}
                                                numberOfLines={1}
                                              >
                                                {name}
                                              </Text>
                                              {selected ? <Ionicons name="checkmark" size={18} color={theme.colors.accent} /> : null}
                                            </TouchableOpacity>
                                          );
                                        })}
                                      </ScrollView>
                                    </View>
                                  ) : null}
                                </>
                              ) : null}
                            </>
                          );
                        })()}
                      </View>
                    </View>
                  ) : null}

			                  {/* Tracciamento: toggle rapido con campanella nel titolo */}
			                  <View style={styles.sectionBlock}>
			                    <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>INFO IN TEMPO REALE</Text>
				                    <View style={[styles.summaryCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
		                      {positionHeadlineText ? (
		                        <Text style={[styles.summaryTitle, { color: theme.colors.text }]} numberOfLines={3}>
		                          {positionHeadlineText}
		                        </Text>
		                      ) : null}

                          {modalLastDetectionText ? (
                            <Text style={[styles.positionMeta, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                              {modalLastDetectionText}
                            </Text>
                          ) : null}

		                      {selectedTrain?.rfiMessage ? (
		                        <View style={styles.rfiInline}>
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
		                      <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>PROSSIMA FERMATA</Text>
		                      <TouchableOpacity
	                            style={[styles.summaryCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}
                            onPress={() => {
                              hapticSelection();
                              openStationSearchPanel(modalNextStop?.name);
                            }}
                            activeOpacity={0.7}
                            disabled={!modalNextStop?.name || modalNextStop.name === '—'}
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

                            {nextStopPlatformText || (selectedTrain?.hasExecutive && modalNextStop?.executivePosition) ? (
                              <View style={styles.nextStopPillsRow}>
                                {nextStopPlatformText ? (
                                  <View
                                    style={[
                                      styles.platformPill,
                                      {
                                        backgroundColor: modalNextStop.platformActual ? theme.colors.accent + '20' : theme.colors.border + '40',
                                        borderColor: modalNextStop.platformActual ? theme.colors.accent : theme.colors.border,
                                        borderWidth: BORDER.card,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.platformText,
                                        { color: modalNextStop.platformActual ? theme.colors.accent : theme.colors.textSecondary },
                                      ]}
                                    >
                                      {nextStopPlatformText}
                                    </Text>
                                  </View>
                                ) : null}

                                {selectedTrain?.hasExecutive && modalNextStop?.executivePosition ? (
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
                                      {`Executive ${String(modalNextStop.executivePosition).toUpperCase()}`}
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

		                    const recenter = () => {
		                      if (!mapRef.current) return;
		                      if (focus.kind === 'station') {
		                        const region = computeFocusRegion();
		                        if (!region) return;
		                        try {
		                          mapRef.current.animateToRegion(region, 350);
		                        } catch {
		                          // ignore
		                        }
		                        return;
		                      }
		                      try {
		                        mapRef.current.fitToCoordinates(baseCoordinates, {
		                          edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
		                          animated: true,
		                        });
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

		                    const inlineRouteCoordinates = (() => {
		                      return baseCoordinates;
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

		                    return (
		                      <View style={styles.sectionBlock}>
		                        <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>PERCORSO</Text>
                        <View style={[styles.mapContainer, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
                          <MapView
                            style={styles.map}
                            provider={PROVIDER_DEFAULT}
                            ref={mapRef}
                            initialRegion={focusRegion}
                            onMapReady={recenter}
                            scrollEnabled={false}
                            zoomEnabled={false}
                            pitchEnabled={false}
                            rotateEnabled={false}
                          >
                            {isTrainSuppressed ? (
                              <Polyline
                                coordinates={inlineRouteCoordinates}
                                strokeColor={suppressedColor}
                                strokeWidth={5}
                              />
                            ) : (
                              <>
                                <Polyline
                                  coordinates={inlineRouteCoordinates}
                                  strokeColor={theme.colors.accent}
                                  strokeWidth={4}
                                />
                                {suppressedSegments.map((seg, idx) => (
                                  <Polyline
                                    key={`suppressed-${idx}`}
                                    coordinates={seg}
                                    strokeColor={suppressedColor}
                                    strokeWidth={5}
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
                              
	                              return (
	                                <Marker
	                                  key={`${String(stop.id ?? 'stop')}-${idx}`}
	                                  coordinate={{ latitude: stop.coord.latitude, longitude: stop.coord.longitude }}
	                                  pinColor={isCurrent ? '#E17055' : isFirst || isLast ? theme.colors.accent : theme.colors.textSecondary}
	                                  title={stop.name}
	                                />
                              );
                            })}
                          </MapView>

		                          <TouchableOpacity
		                            onPress={() => {
		                              hapticSelection();
		                              setMapModalVisible(true);
		                            }}
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
	                            accessibilityLabel="Espandi mappa"
	                          >
                            <Ionicons name="expand-outline" size={18} color={theme.colors.text} />
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
                            <Ionicons name="locate" size={18} color={theme.colors.text} />
                          </TouchableOpacity>
                        </View>

	                        <Modal
	                          visible={mapModalVisible}
	                          animationType="slide"
	                          presentationStyle="fullScreen"
	                          onRequestClose={() => setMapModalVisible(false)}
	                        >
	                          <SafeAreaViewCompat style={[styles.mapModalContainer, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
                              <View style={[styles.modalHeader, { backgroundColor: 'transparent' }]}>
                                <TouchableOpacity
                                  onPress={() => setMapModalVisible(false)}
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
                                  accessibilityLabel="Chiudi mappa"
                                >
                                  <Ionicons name="close" size={20} color={theme.colors.text} />
                                </TouchableOpacity>
                              </View>

	                            <View pointerEvents="none" style={styles.mapModalTopLabel}>
	                              <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary, marginLeft: 0, marginBottom: 0 }]}>
	                                PERCORSO
	                              </Text>
	                            </View>
	
	                            <View style={[styles.mapModalBody, { borderColor: theme.colors.border }]}>
	                              <MapView
	                                style={styles.map}
	                                provider={PROVIDER_DEFAULT}
	                                ref={mapExpandedRef}
                                initialRegion={{
                                  latitude: midLat,
                                  longitude: midLon,
                                  latitudeDelta: Math.max(deltaLat, 0.5),
                                  longitudeDelta: Math.max(deltaLon, 0.5),
                                }}
                                onMapReady={() => {
                                  if (!mapExpandedRef.current || routeCoordinates.length < 2) return;
                                  try {
                                    mapExpandedRef.current.fitToCoordinates(routeCoordinates, {
                                      edgePadding: { top: 90, right: 60, bottom: 90, left: 60 },
                                      animated: false,
                                    });
                                  } catch {
                                    // ignore
                                  }
                                }}
                                scrollEnabled={true}
                                zoomEnabled={true}
                                pitchEnabled={false}
	                                rotateEnabled={false}
	                              >
                                {isTrainSuppressed ? (
                                  <Polyline
                                    coordinates={routeCoordinates}
                                    strokeColor={suppressedColor}
                                    strokeWidth={6}
                                  />
                                ) : (
                                  <>
                                    <Polyline
                                      coordinates={traveled}
                                      strokeColor={theme.colors.accent}
                                      strokeWidth={5}
                                    />
                                    {remaining.length >= 2 ? (
                                      <Polyline
                                        coordinates={remaining}
                                        strokeColor={theme.colors.textSecondary}
                                        strokeWidth={4}
                                        lineDashPattern={[7, 7]}
                                      />
                                    ) : null}
                                    {suppressedSegments.map((seg, idx) => (
                                      <Polyline
                                        key={`suppressed-expanded-${idx}`}
                                        coordinates={seg}
                                        strokeColor={suppressedColor}
                                        strokeWidth={6}
                                      />
                                    ))}
                                  </>
                                )}

                                {position?.coord && !position.isExactStop ? (
                                  <Marker
                                    key="train-position-expanded"
                                    coordinate={position.coord}
                                    pinColor="#E17055"
                                    title="Treno"
                                  />
                                ) : null}

		                                {stopsWithCoords.map((stop, idx) => {
		                                  const isFirst = idx === 0;
		                                  const isLast = idx === stopsWithCoords.length - 1;
		                                  const isCurrent = stop.isCurrent;
		                                  return (
		                                    <Marker
		                                      key={`expanded-${String(stop.id ?? 'stop')}-${idx}`}
		                                      coordinate={{ latitude: stop.coord.latitude, longitude: stop.coord.longitude }}
		                                      pinColor={isCurrent ? '#E17055' : isFirst || isLast ? theme.colors.accent : theme.colors.textSecondary}
		                                      title={stop.name}
		                                    />
                                  );
	                                })}
	                              </MapView>
	                            </View>
	
		                            <View
		                              style={[
		                                styles.mapModalControls,
		                                {
		                                  backgroundColor: theme.colors.card,
		                                  borderColor: theme.colors.border,
		                                },
		                                floatingShadow(theme, 'lg'),
		                              ]}
		                            >
	                              <TouchableOpacity
	                                onPress={() => {
	                                  hapticSelection();
	                                  if (!mapExpandedRef.current || routeCoordinates.length < 2) return;
	                                  try {
	                                    mapExpandedRef.current.fitToCoordinates(routeCoordinates, {
	                                      edgePadding: { top: 90, right: 60, bottom: 140, left: 60 },
	                                      animated: true,
	                                    });
	                                  } catch {
	                                    // ignore
	                                  }
	                                }}
	                                style={[styles.mapModalControlButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
	                                activeOpacity={0.75}
	                                accessibilityLabel="Ricentra mappa"
	                              >
	                                <Ionicons name="locate" size={20} color={theme.colors.text} />
	                                <Text style={[styles.mapModalControlText, { color: theme.colors.text }]}>Ricentra</Text>
	                              </TouchableOpacity>
	
	                              <TouchableOpacity
	                                onPress={() => {
	                                  hapticImpact();
	                                  setMapModalVisible(false);
	                                }}
	                                style={[styles.mapModalControlButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
	                                activeOpacity={0.75}
	                                accessibilityLabel="Riduci mappa"
	                              >
	                                <Ionicons name="contract-outline" size={20} color={theme.colors.text} />
	                                <Text style={[styles.mapModalControlText, { color: theme.colors.text }]}>Riduci</Text>
	                              </TouchableOpacity>
	                            </View>
	                          </SafeAreaViewCompat>
	                        </Modal>
	                      </View>
	                    );
                  }
                  return null;
                })()}

                {/* Info aggiuntive (non essenziali) */}
                {selectedTrain?.extraInfo ? (
                  <View style={styles.sectionBlock}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>INFORMAZIONI</Text>
                    <View style={[styles.infoCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
                      {selectedTrain?.extraInfo ? (
                        <View style={styles.infoBlock}>
                          <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>Info aggiuntive</Text>
                          <Text style={[styles.infoMultiline, { color: theme.colors.text }]}>
                            {selectedTrain.extraInfo}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ) : null}

	                {/* Fermate dettagliate */}
	                <View style={styles.sectionBlock}>
	                  <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>FERMATE</Text>
	                  <View style={[styles.stopsCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
		                    {modalStops.map((s, idx) => (
		                      <TouchableOpacity
	                          key={`${String(s.id ?? 'stop')}-${idx}`}
		                        style={[
		                          styles.stopRow,
		                          s.isCurrent
		                            ? {
                                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                              }
                            : null,
                          { marginBottom: 0 },
                        ]}
                          onPress={() => {
                            hapticSelection();
                            openStationSearchPanel(s?.name);
                          }}
                          activeOpacity={0.7}
                          disabled={!s?.name || s.name === '—'}
                      >
	                        <View style={styles.stopLeftSection}>
                            <Text
                              style={[
	                                styles.stopName,
	                                {
	                                  color: theme.colors.text,
	                                  fontFamily: s.isCurrent ? FONTS.semibold : FONTS.regular,
	                                },
	                              ]}
                            numberOfLines={2}
                          >
                            {s.name}
                          </Text>
		                          <View style={styles.stopTimesBlock}>
			                            {(() => {
			                              const nextStopIndex =
			                                parseOptionalIndex(selectedTrain?.nextStopIndex);
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
				                              const delay = Number.isFinite(Number(modalDelayMinutes)) ? Number(modalDelayMinutes) : null;
				                              const hasDelay = delay != null && delay !== 0;
				                              const estColor = getDelayColors(delay).fg;

				                              const estimateTimingLabel = (timing) => {
				                                if (!timing || !hasDelay) return null;
				                                const predicted = timing.predicted && timing.predicted !== '—' ? timing.predicted : null;
				                                if (predicted) return predicted;
				                                if (timing.scheduledEpoch) return formatTime(timing.scheduledEpoch + delay * 60000);
				                                if (timing.scheduled && timing.scheduled !== '—') return addMinutesToHHmm(timing.scheduled, delay);
				                                return null;
				                              };
		
			                              return (
			                                <>
			                            {idx !== 0 ? (
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
			                            {idx !== modalStops.length - 1 ? (
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
                          {s.platformPlanned || s.platformActual ? (
                            <View
                              style={[
                                styles.platformPill,
                                {
                                  backgroundColor: s.platformActual ? theme.colors.accent + '20' : theme.colors.border + '40',
                                  borderColor: s.platformActual ? theme.colors.accent : theme.colors.border,
                                  borderWidth: BORDER.card,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.platformText,
                                  { color: s.platformActual ? theme.colors.accent : theme.colors.textSecondary },
                                ]}
                              >
                                {s.platformActual || s.platformPlanned}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </Modal>
      </AnimatedScreen>
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
  topEdgeFade: {
    position: 'absolute',
    top: -SPACE.sm,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  scrollContent: {
    paddingHorizontal: SPACING.screenX,
    paddingBottom: 32,
    paddingTop: SPACE.md,
  },
  resultsContentContainer: {
    paddingTop: 0,
  },
  searchSection: {
    marginBottom: 12,
  },
  sectionTitle: {
    ...TYPE.sectionLabel,
    marginBottom: 8,
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
    gap: 5,
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
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  listItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listItemIcon: {
    width: 28,
    alignItems: 'center',
  },
  listItemText: {
    flex: 1,
  },
  listTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
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
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
  listItemMeta: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    marginTop: 2,
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
  modalHeader: {
    position: 'absolute',
    top: 12,
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
    height: 64,
  },
  modalContentWrap: {
    paddingHorizontal: SPACING.screenX,
  },
  modalHeaderContent: {
    paddingHorizontal: 0,
    paddingTop: 12,
    paddingBottom: 16,
    paddingLeft: SPACING.sectionX,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
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
  trackingBellButton: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    borderRadius: RADIUS.iconButton,
    borderWidth: BORDER.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTrainKind: {
    fontSize: 26,
    fontFamily: FONTS.medium,
    letterSpacing: 0.2,
  },
  modalTrainNumber: {
    flexShrink: 1,
    fontSize: 26,
    fontFamily: FONTS.bold,
  },
  modalRoute: {
    fontSize: 16,
    fontFamily: FONTS.medium,
    marginTop: 4,
  },
  mapContainer: {
    position: 'relative',
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
    height: 240,
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
  mapModalContainer: {
    flex: 1,
  },
  mapModalTopLabel: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 4,
  },
  mapModalHeader: {
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mapModalBody: {
    flex: 1,
  },
  mapModalControls: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    zIndex: 5,
    borderRadius: 18,
    borderWidth: BORDER.card,
    padding: 10,
    flexDirection: 'row',
    gap: 10,
  },
  mapModalControlButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: BORDER.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapModalControlText: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.2,
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
  modalPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
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
  positionMeta: {
    marginTop: 6,
    fontSize: 13,
    fontFamily: FONTS.regular,
    lineHeight: 18,
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
  stopsCard: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  timelineContainer: {
    width: 16,
    alignItems: 'center',
    position: 'relative',
  },
  timelineDot: {
    borderRadius: 999,
    zIndex: 2,
  },
  timelineLine: {
    width: 2,
    position: 'absolute',
  },
  timelineLineTop: {
    top: 0,
    height: '50%',
  },
  timelineLineBottom: {
    bottom: 0,
    height: '50%',
  },
  stopLeftSection: {
    flex: 1,
  },
  stopRightSection: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
  },
  stopName: {
    fontSize: 17,
    fontFamily: FONTS.regular,
    marginBottom: 6,
  },
  stopTimesBlock: {
    gap: 4,
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
  trackingSettingsCard: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
  },
  trackingRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  trackingRowLeft: {
    flex: 1,
  },
  trackingLabel: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
  },
  trackingHint: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: FONTS.regular,
    lineHeight: 16,
  },
  trackingValue: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: FONTS.regular,
  },
  trackingDivider: {
    height: BORDER.hairline,
  },
  trackingStepper: {
    width: 140,
    height: 38,
    borderRadius: 12,
    borderWidth: BORDER.card,
    flexDirection: 'row',
    overflow: 'hidden',
    alignItems: 'center',
  },
  trackingStepButton: {
    width: 44,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: BORDER.hairline,
    borderRightWidth: BORDER.hairline,
  },
  trackingStepValueWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  trackingStepValue: {
    fontSize: 16,
    fontFamily: FONTS.semibold,
  },
  trackingStepUnit: {
    fontSize: 13,
    fontFamily: FONTS.regular,
  },
  trackingStopsList: {
    borderTopWidth: BORDER.hairline,
  },
  trackingStopOptionRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: BORDER.hairline,
  },
  trackingStopOptionText: {
    flex: 1,
    paddingRight: 12,
    fontSize: 14,
    fontFamily: FONTS.regular,
  },
  lastRefreshDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
