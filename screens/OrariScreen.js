import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Animated,
  Alert,
  LayoutAnimation,
  InteractionManager,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTheme } from '../context/ThemeContext';
import { useNavigation, useRoute } from '@react-navigation/native';
import AnimatedScreen from '../components/AnimatedScreen';
import SectionPlaceholderCard from '../components/SectionPlaceholderCard';
import SectionSkeleton from '../components/SectionSkeleton';
import SwipeableRow from '../components/SwipeableRow';
import AccentSwitch from '../components/AccentSwitch';
import { BORDER, HIT_SLOP, INSETS, RADIUS, SPACING, SPACE, TYPE } from '../utils/uiTokens';
import { cardShadow, floatingShadow, iconButtonShadow } from '../utils/uiStyles';
import { getTravelSolutions } from '../services/apiService';
import { getStationByName } from '../services/stationsService';
import { hapticImpact, hapticSelection, hapticModalClose, hapticModalOpen, ImpactFeedbackStyle } from '../utils/haptics';
import { formatItDateTime, parseDateTime, toYmd } from '../utils/formatters';
import useTravelSolutions from '../hooks/useTravelSolutions';
import { enrichStation } from '../utils/stationsFormat';
import StationSearchModal from '../components/StationSearchModal';
import SolutionsModal from '../components/SolutionsModal';
import {
  clearRecentSolutions,
  getRecentSolutions,
  overwriteRecentSolutions,
  removeRecentSolution,
  saveRecentSolution,
} from '../services/recentSolutionsService';

const EXPAND_ANIMATION = {
  duration: 200,
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.scaleY },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.scaleY },
};
const ALLOW_MODAL_TO_MODAL_NAV = false;
const MODAL_HEADER_BUTTON_SIZE = 36;
const MODAL_TOP_SPACER_HEIGHT = MODAL_HEADER_BUTTON_SIZE + SPACE.xl;
const MODAL_HEADER_TOP_OFFSET = SPACING.screenX;
const SOLUTION_STOP = {
  indicatorWidth: 20,
  dotSize: 12,
  lineWidth: 2,
  rowHeight: 32,
  lineGap: 4,
  timeWidth: 56,
  dotOffsetY: -1,
};

const getDefaultWhen = () => {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
};

function normalizeAutocompleteItem(item) {
  if (!item) return null;
  if (typeof item === 'string') {
    const name = item.trim();
    if (!name) return null;
    return { name, id: null };
  }
  if (typeof item === 'object') {
    // Backend può restituire shape diverse a seconda della fonte:
    // - LeFrecce: { stazione, multistation }
    // - altri: { name, id } oppure stringhe
    const name = String(item.name ?? item.nome ?? item.label ?? item.stazione ?? item.station ?? '').trim();
    if (!name) return null;
    const idRaw = item.id ?? item.stationId ?? item.code ?? item.codice ?? null;
    const id = idRaw === null || idRaw === undefined || String(idRaw).trim() === '' ? null : idRaw;
    const multistation = Boolean(item.multistation ?? item.multiStation ?? item.isMultiStation);
    return { name, id, multistation };
  }
  return null;
}

function DateTimeModal({ visible, value, onClose, onConfirm, modalHeaderTop, modalTopSpacerHeight }) {
  const { theme } = useTheme();
  const resolveDraft = (nextValue) => {
    if (nextValue instanceof Date && !Number.isNaN(nextValue.getTime())) {
      return new Date(nextValue);
    }
    return getDefaultWhen();
  };
  const [draft, setDraft] = useState(() => resolveDraft(value));

  useEffect(() => {
    if (!visible) return;
    setDraft(resolveDraft(value));
  }, [visible, value]);

  if (Platform.OS !== 'ios' || !visible) return null;

  return (
    <Modal visible={true} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['bottom']} style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.modalHeader, { top: modalHeaderTop }]}>
          <TouchableOpacity
            style={[
              styles.closeButton,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: BORDER.card },
              iconButtonShadow(theme),
            ]}
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={HIT_SLOP.md}
          >
            <Ionicons name="close" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.modalTopSpacer, { height: modalTopSpacerHeight }]} />

        <View style={styles.modalContentWrap}>
          <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Data e ora</Text>
          <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>
            Selezione rapida con controllo nativo.
          </Text>

          <View style={[styles.pickerCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
            <DateTimePicker
              value={draft}
              mode="datetime"
              display="inline"
              locale="it-IT"
              accentColor={theme.colors.accent}
              onChange={(_, d) => {
                if (d instanceof Date) setDraft(d);
              }}
              textColor={theme.colors.text}
              style={{ alignSelf: 'stretch' }}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.colors.accent }]}
            activeOpacity={0.8}
            onPress={() => {
              hapticImpact();
              onConfirm?.(draft);
              onClose?.();
            }}
          >
            <Text style={[styles.primaryButtonText, { color: theme.colors.onAccent }]}>Conferma</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function OrariScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = Platform.OS === 'ios' ? 76 : 64;
  const bottomPadding = SPACE.xxl + tabBarHeight + insets.bottom;
  const navigation = useNavigation();
  const route = useRoute();
  const pendingTrainOpenRef = useRef(null);
  const solutionsDismissTimerRef = useRef(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [fromStation, setFromStation] = useState(null);
  const [toStation, setToStation] = useState(null);
  const swapAnim = useRef(new Animated.Value(1)).current;
  const [when, setWhen] = useState(() => getDefaultWhen());

  const [fromModalVisible, setFromModalVisible] = useState(false);
  const [toModalVisible, setToModalVisible] = useState(false);
  const [dateModalVisible, setDateModalVisible] = useState(false);

  const [solutionsVisible, setSolutionsVisible] = useState(false);
  const {
    solutions,
    setSolutions,
    solutionsLoading,
    solutionsError,
    setSolutionsError,
    solutionsOffset,
    setSolutionsOffset,
    solutionsLimit,
    setSolutionsLimit,
    solutionsHasNext,
    solutionsQueryWhen,
    runSearch: runSolutionsSearch,
  } = useTravelSolutions({
    fetchSolutions: getTravelSolutions,
    onSaveRecent: saveRecentSolution,
    onLoadRecents: loadRecentSolutions,
  });
  const [solutionsFilters, setSolutionsFilters] = useState({
    category: 'all',
    directOnly: false,
  });
  const [recentSolutions, setRecentSolutions] = useState([]);
  const [recentSolutionsLoaded, setRecentSolutionsLoaded] = useState(false);
  const [undoPayload, setUndoPayload] = useState(null);
  const [undoMessage, setUndoMessage] = useState('');
  const [undoVisible, setUndoVisible] = useState(false);
  const undoAnim = useRef(new Animated.Value(0)).current;
  const undoTimeoutRef = useRef(null);
  const [swipeResetVersion, setSwipeResetVersion] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    loadRecentSolutions();
  }, []);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = null;
      }
    };
  }, []);

  async function loadRecentSolutions() {
    const list = await getRecentSolutions(5);
    setRecentSolutions(Array.isArray(list) ? list : []);
    setRecentSolutionsLoaded(true);
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

    if (undoPayload.kind === 'single' && undoPayload.entry) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await saveRecentSolution(undoPayload.entry);
      await loadRecentSolutions();
    }

    if (undoPayload.kind === 'all' && Array.isArray(undoPayload.entries)) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await overwriteRecentSolutions(undoPayload.entries);
      await loadRecentSolutions();
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

  const handleDeleteRecentSolution = async (entry) => {
    const id = entry?.id ? String(entry.id) : null;
    if (!id) return;
    hapticImpact(ImpactFeedbackStyle.Medium);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await removeRecentSolution(id);
    await loadRecentSolutions();
    const from = String(entry?.fromName || '').trim();
    const to = String(entry?.toName || '').trim();
    showUndoToast({
      payload: { kind: 'single', entry },
      message: from && to ? `Rimossa “${from} → ${to}”` : 'Ricerca rimossa',
    });
  };

  const handleClearRecentSolutions = () => {
    hapticSelection();
    Alert.alert('Cancella ricerche recenti', 'Vuoi rimuovere tutte le ricerche recenti?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Cancella',
        style: 'destructive',
        onPress: async () => {
          hapticImpact(ImpactFeedbackStyle.Heavy);
          const previous = await getRecentSolutions(10);
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          await clearRecentSolutions();
          await loadRecentSolutions();

          if (Array.isArray(previous) && previous.length > 0) {
            const count = previous.length;
            showUndoToast({
              payload: { kind: 'all', entries: previous },
              message: count === 1 ? '1 ricerca recente cancellata' : `${count} ricerche recenti cancellate`,
            });
          }
        },
      },
    ]);
  };

  const whenLabel = useMemo(() => formatItDateTime(when), [when]);

  const headerTitle = useMemo(() => {
    const from = fromStation?.name ? fromStation.name : 'Da…';
    const to = toStation?.name ? toStation.name : 'A…';
    return `${from} → ${to}`;
  }, [fromStation?.name, toStation?.name]);
  const headerRoute = useMemo(() => {
    const from = fromStation?.name ? fromStation.name : 'Da…';
    const to = toStation?.name ? toStation.name : 'A…';
    return { from, to };
  }, [fromStation?.name, toStation?.name]);

  const openTrainFromSolution = useCallback(
    ({ trainNumber, originName, departureTime }) => {
      const num = String(trainNumber || '').trim();
      if (!num) return;
      const date = departureTime ? toYmd(parseDateTime(departureTime)) : null;
      hapticImpact(ImpactFeedbackStyle.Medium);
      pendingTrainOpenRef.current = {
        openTrainNumber: num,
        openTrainOriginName: originName || null,
        openTrainDate: date || null,
        openTrainHaptics: false,
      };
      setSolutionsVisible(false);
    },
    [navigation]
  );
  const handleOpenTrainFromSolution = ALLOW_MODAL_TO_MODAL_NAV ? openTrainFromSolution : null;
  const handleSolutionsDismiss = useCallback(() => {
    const payload = pendingTrainOpenRef.current;
    if (!payload) return;
    pendingTrainOpenRef.current = null;
    if (solutionsDismissTimerRef.current) {
      clearTimeout(solutionsDismissTimerRef.current);
      solutionsDismissTimerRef.current = null;
    }
    InteractionManager.runAfterInteractions(() => {
      const token = Date.now();
      navigation.navigate('CercaTreno', { openTrainToken: token, ...payload });
    });
  }, [navigation]);
  useEffect(() => {
    if (Platform.OS === 'ios') return;
    if (solutionsVisible) return;
    if (!pendingTrainOpenRef.current) return;
    solutionsDismissTimerRef.current = setTimeout(() => {
      handleSolutionsDismiss();
    }, 180);
    return () => {
      if (solutionsDismissTimerRef.current) {
        clearTimeout(solutionsDismissTimerRef.current);
        solutionsDismissTimerRef.current = null;
      }
    };
  }, [handleSolutionsDismiss, solutionsVisible]);
  useEffect(() => {
    return () => {
      if (solutionsDismissTimerRef.current) {
        clearTimeout(solutionsDismissTimerRef.current);
        solutionsDismissTimerRef.current = null;
      }
    };
  }, []);

  const canSearch = Boolean(fromStation?.name && toStation?.name && when instanceof Date);
  const handleSwapStations = () => {
    if (!fromStation && !toStation) return;
    hapticSelection();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFromStation(toStation);
    setToStation(fromStation);
  };

  const handleSwapPressIn = () => {
    Animated.spring(swapAnim, {
      toValue: 0.92,
      speed: 20,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  };

  const handleSwapPressOut = () => {
    Animated.spring(swapAnim, {
      toValue: 1,
      speed: 18,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  };

  const runSearch = async (overrides = null) => {
    const from = overrides?.fromStation ?? fromStation;
    const to = overrides?.toStation ?? toStation;
    const whenValue = overrides?.when ?? when;
    const offset = Number.isFinite(Number(overrides?.offset ?? solutionsOffset)) ? Number(overrides?.offset ?? solutionsOffset) : 0;
    const limit = Number.isFinite(Number(overrides?.limit ?? solutionsLimit)) ? Number(overrides?.limit ?? solutionsLimit) : 10;
    const filters = overrides?.filters ?? solutionsFilters;
    const append = Boolean(overrides?.append);

    const canRun = Boolean(from?.name && to?.name && whenValue instanceof Date);
    if (!canRun) {
      hapticImpact(ImpactFeedbackStyle.Light);
      setSolutionsError('Seleziona stazione di partenza, arrivo e data/ora.');
      setSolutions([]);
      setSolutionsVisible(true);
      return;
    }
    setSolutionsVisible(true);
    await runSolutionsSearch({
      from,
      to,
      when: whenValue,
      filters,
      offset,
      limit,
      append,
    });
  };

  useEffect(() => {
    const token = route?.params?.openSolutionToken;
    if (token === null || token === undefined) return;
    const fromRaw = route?.params?.openSolutionFrom;
    const toRaw = route?.params?.openSolutionTo;
    if (typeof fromRaw !== 'string' || typeof toRaw !== 'string') return;
    const fromName = fromRaw.trim();
    const toName = toRaw.trim();
    if (!fromName || !toName) return;

    const resolveStation = (name, fallbackId) => {
      const found = getStationByName(name);
      if (found) return found;
      return { name, id: fallbackId ?? null, lefrecceId: fallbackId ?? null };
    };

    const fromId = route?.params?.openSolutionFromId ?? null;
    const toId = route?.params?.openSolutionToId ?? null;
    const whenIso = route?.params?.openSolutionWhenISO ?? null;
    const parsedWhen = whenIso ? parseDateTime(whenIso) : null;
    const nextWhen =
      parsedWhen instanceof Date && !Number.isNaN(parsedWhen.getTime()) ? parsedWhen : new Date();

    const nextFrom = resolveStation(fromName, fromId);
    const nextTo = resolveStation(toName, toId);

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFromStation(nextFrom);
    setToStation(nextTo);
    setWhen(nextWhen);
  }, [route?.params?.openSolutionToken]);

  const applySolutionFilters = (patch) => {
    const incoming = patch || {};
    const next = { ...solutionsFilters, ...incoming };
    // toggle category: se premi la stessa, torna a "all"
    if (Object.prototype.hasOwnProperty.call(incoming, 'category')) {
      next.category = incoming.category === solutionsFilters.category ? 'all' : incoming.category;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSolutionsFilters(next);
    setSolutionsOffset(0);
  };

  const loadMoreSolutions = () => {
    if (solutionsLoading) return;
    if (!solutionsHasNext) return;
    hapticSelection();
    const nextOffset = Number(solutionsOffset) + Number(solutionsLimit);
    runSearch({ offset: nextOffset, append: true });
  };

  const openWhenPicker = () => {
    hapticSelection();
    const base = when instanceof Date && !Number.isNaN(when.getTime()) ? when : getDefaultWhen();
    if (Platform.OS === 'ios') {
      setDateModalVisible(true);
      return;
    }

    DateTimePickerAndroid.open({
      value: base,
      mode: 'date',
      is24Hour: true,
      onChange: (event, pickedDate) => {
        if (event.type !== 'set' || !(pickedDate instanceof Date)) return;
        const merged = new Date(base);
        merged.setFullYear(pickedDate.getFullYear(), pickedDate.getMonth(), pickedDate.getDate());
        DateTimePickerAndroid.open({
          value: merged,
          mode: 'time',
          is24Hour: true,
          onChange: (event2, pickedTime) => {
            if (event2.type !== 'set' || !(pickedTime instanceof Date)) return;
            const next = new Date(merged);
            next.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
            setWhen(next);
          },
        });
      },
    });
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AnimatedScreen>
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical
          contentContainerStyle={[styles.contentContainer, { paddingBottom: bottomPadding }]}
          scrollEnabled={scrollEnabled}
        >
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>CERCA ORARI</Text>
            <View style={[styles.formCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
              <View style={styles.swapContainer}>
                <View style={styles.swapLeft}>
                  <TouchableOpacity
                    style={styles.formRow}
                    activeOpacity={0.6}
                    onPress={() => {
                      hapticModalOpen();
                      setFromModalVisible(true);
                    }}
                  >
                    <Text style={[styles.formLabel, { color: theme.colors.textSecondary }]}>Da</Text>
                    <View style={styles.formRight}>
                      <Text style={[styles.formValue, { color: fromStation?.name ? theme.colors.text : theme.colors.textSecondary }]} numberOfLines={1}>
                        {fromStation?.name || 'Scegli stazione'}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                    </View>
                  </TouchableOpacity>

                  <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />

                  <TouchableOpacity
                    style={styles.formRow}
                    activeOpacity={0.6}
                    onPress={() => {
                      hapticModalOpen();
                      setToModalVisible(true);
                    }}
                  >
                    <Text style={[styles.formLabel, { color: theme.colors.textSecondary }]}>A</Text>
                    <View style={styles.formRight}>
                      <Text style={[styles.formValue, { color: toStation?.name ? theme.colors.text : theme.colors.textSecondary }]} numberOfLines={1}>
                        {toStation?.name || 'Scegli stazione'}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                    </View>
                  </TouchableOpacity>
                </View>

                <View style={[styles.swapRight, { borderLeftColor: theme.colors.border }]}>
                  <Animated.View style={{ transform: [{ scale: swapAnim }] }}>
                    <TouchableOpacity
                      style={[
                        styles.swapButton,
                        {
                          backgroundColor: theme.colors.card,
                          borderColor: theme.colors.border,
                        },
                        iconButtonShadow(theme),
                      ]}
                      activeOpacity={0.75}
                      onPress={handleSwapStations}
                      onPressIn={handleSwapPressIn}
                      onPressOut={handleSwapPressOut}
                      hitSlop={HIT_SLOP.sm}
                      accessibilityLabel="Scambia stazioni"
                    >
                      <Ionicons name="swap-vertical" size={18} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </View>

              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />

              <TouchableOpacity style={styles.formRow} activeOpacity={0.6} onPress={openWhenPicker}>
                <Text style={[styles.formLabel, { color: theme.colors.textSecondary }]}>Quando</Text>
                <View style={styles.formRight}>
                  <Text style={[styles.formValue, { color: theme.colors.text }]} numberOfLines={1}>
                    {whenLabel}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.filtersSection}>
              <View
                style={[
                  styles.directToggleCard,
                  { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
                  cardShadow(theme),
                ]}
              >
                <Text style={[styles.directToggleLabel, { color: theme.colors.textSecondary }]}>Diretti</Text>
                <AccentSwitch
                  value={Boolean(solutionsFilters?.directOnly)}
                  onValueChange={(nextValue) => applySolutionFilters({ directOnly: nextValue })}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: canSearch ? theme.colors.primary : theme.colors.border }]}
              activeOpacity={0.85}
              disabled={!canSearch}
              onPress={() => {
                if (!canSearch) return;
                hapticModalOpen();
                runSearch();
              }}
            >
              <Text style={[styles.primaryButtonText, { color: canSearch ? theme.colors.onAccent : theme.colors.textSecondary }]}>
                Cerca
              </Text>
            </TouchableOpacity>

            {recentSolutions.length > 0 ? (
              <View style={styles.recentSection}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary, marginBottom: 0, marginLeft: 0 }]}>
                    RICERCHE RECENTI
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={handleClearRecentSolutions}
                  >
                    <Text style={[styles.sectionActionText, { color: theme.colors.accent }]}>Cancella</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.listGroup, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
                  {recentSolutions.map((r, index) => {
                    const from = String(r?.fromName || '').trim() || '—';
                    const to = String(r?.toName || '').trim() || '—';
                    return (
                      <View key={String(r?.id ?? index)}>
                        <SwipeableRow
                          theme={theme}
                          onDelete={() => handleDeleteRecentSolution(r)}
                          onSwipeStart={() => setScrollEnabled(false)}
                          onSwipeEnd={() => setScrollEnabled(true)}
                          resetKey={swipeResetVersion}
                        >
                          <TouchableOpacity
                            style={styles.listItem}
                            activeOpacity={0.6}
                            onPress={() => {
                              hapticSelection();
                              const resolvedFrom = enrichStation({ name: from, id: r?.fromId ?? null });
                              const resolvedTo = enrichStation({ name: to, id: r?.toId ?? null });
                              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                              setFromStation(resolvedFrom);
                              setToStation(resolvedTo);
                              requestAnimationFrame(() => {
                                runSearch({ fromStation: resolvedFrom, toStation: resolvedTo });
                              });
                            }}
                          >
                            <View style={styles.listItemContent}>
                              <View style={styles.routeIndicator}>
                                <View style={[styles.routeDot, styles.routeDotHollow, { borderColor: theme.colors.textSecondary }]} />
                                <View style={[styles.routeLine, { backgroundColor: theme.colors.border }]} />
                                <View style={[styles.routeDot, { backgroundColor: theme.colors.accent }]} />
                              </View>
                              <View style={styles.routeText}>
                                <Text style={[styles.routeFrom, { color: theme.colors.text }]} numberOfLines={1}>
                                  {from}
                                </Text>
                                <Text style={[styles.routeTo, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                  {to}
                                </Text>
                              </View>
                              <Ionicons
                                name="chevron-forward"
                                size={20}
                                color={theme.colors.textSecondary}
                                style={{ opacity: 0.3 }}
                              />
                            </View>
                          </TouchableOpacity>
                        </SwipeableRow>
                        {index < recentSolutions.length - 1 ? (
                          <View style={[styles.listDivider, { backgroundColor: theme.colors.border }]} />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : recentSolutionsLoaded ? (
              <SectionPlaceholderCard
                title="RICERCHE RECENTI"
                description="Le tratte che cerchi più spesso appariranno qui, così puoi ripeterle al volo."
                containerStyle={styles.recentSection}
              />
            ) : (
              <SectionSkeleton title="RICERCHE RECENTI" rows={3} containerStyle={styles.recentSection} />
            )}
          </View>
        </ScrollView>

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
                  onPress={handleUndo}
                  activeOpacity={0.75}
                  hitSlop={HIT_SLOP.sm}
                >
                  <Text style={[styles.undoToastAction, { color: theme.colors.accent }]}>ANNULLA</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </Animated.View>
        )}

        <StationSearchModal
          visible={fromModalVisible}
          title="Da"
          onClose={() => {
            hapticModalClose();
            setFromModalVisible(false);
          }}
          onSelect={(s) => setFromStation(s)}
          styles={styles}
          modalHeaderTop={MODAL_HEADER_TOP_OFFSET}
          modalTopSpacerHeight={MODAL_TOP_SPACER_HEIGHT}
        />

        <StationSearchModal
          visible={toModalVisible}
          title="A"
          onClose={() => {
            hapticModalClose();
            setToModalVisible(false);
          }}
          onSelect={(s) => setToStation(s)}
          styles={styles}
          modalHeaderTop={MODAL_HEADER_TOP_OFFSET}
          modalTopSpacerHeight={MODAL_TOP_SPACER_HEIGHT}
        />

        <DateTimeModal
          visible={dateModalVisible}
          value={when}
          onClose={() => {
            hapticModalClose();
            setDateModalVisible(false);
          }}
          onConfirm={(d) => setWhen(d)}
          modalHeaderTop={MODAL_HEADER_TOP_OFFSET}
          modalTopSpacerHeight={MODAL_TOP_SPACER_HEIGHT}
        />

        <SolutionsModal
          visible={solutionsVisible}
          onClose={() => {
            hapticModalClose();
            setSolutionsVisible(false);
          }}
          onDismiss={handleSolutionsDismiss}
          headerTitle={headerTitle}
          headerRoute={headerRoute}
          onOpenTrain={handleOpenTrainFromSolution}
          loading={solutionsLoading}
          error={solutionsError}
          solutions={solutions}
          onRetry={() => runSearch()}
          queryWhen={solutionsQueryWhen || when}
          canLoadMore={solutionsHasNext}
          onLoadMore={loadMoreSolutions}
          styles={styles}
          modalHeaderTop={MODAL_HEADER_TOP_OFFSET}
          modalTopSpacerHeight={MODAL_TOP_SPACER_HEIGHT}
        />
      </AnimatedScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: SPACING.screenTop,
    paddingHorizontal: SPACING.screenX,
    paddingBottom: SPACE.xxl,
    flexGrow: 1,
  },
  section: {
    marginBottom: SPACE.md,
  },
  sectionTitle: {
    ...TYPE.sectionLabel,
    marginBottom: SPACE.sm,
    marginLeft: SPACING.sectionX,
  },
  formCard: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
  },
  swapContainer: {
    flexDirection: 'row',
  },
  swapLeft: {
    flex: 1,
  },
  swapRight: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: BORDER.hairline,
  },
  swapButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: BORDER.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formRow: {
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  formLabel: {
    ...TYPE.sectionLabel,
    letterSpacing: 0.4,
  },
  formRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACE.md,
  },
  formValue: {
    flexShrink: 1,
    ...TYPE.body,
    textAlign: 'right',
  },
  separator: {
    height: BORDER.hairline,
    marginLeft: SPACE.lg,
  },
  primaryButton: {
    marginTop: SPACE.md,
    borderRadius: RADIUS.card,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    ...TYPE.button,
  },
  filtersSection: {
    marginTop: SPACE.lg,
  },
  directToggleCard: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.sm,
  },
  directToggleLabel: {
    ...TYPE.sectionLabel,
    letterSpacing: 0.4,
  },
  recentSection: {
    marginTop: SPACE.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.sm,
    marginLeft: SPACING.sectionX,
    marginRight: SPACING.sectionX,
  },
  sectionActionText: {
    ...TYPE.captionSemibold,
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
    height: 16,
    borderRadius: 1,
    marginVertical: 4,
  },
  routeText: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  routeFrom: {
    ...TYPE.bodyMedium,
  },
  routeTo: {
    ...TYPE.body,
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
  filtersInlineRow: {
    marginTop: 0,
    paddingHorizontal: 0,
    paddingBottom: SPACE.xxs,
    gap: SPACE.sm,
    marginBottom: SPACE.sm,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: 999,
    borderWidth: BORDER.card,
  },
  filterPillText: {
    ...TYPE.captionSemibold,
    letterSpacing: 0.2,
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

  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    position: 'absolute',
    top: MODAL_HEADER_TOP_OFFSET,
    left: SPACING.screenX,
    right: SPACING.screenX,
    zIndex: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.sm,
  },
  modalBody: {
    flex: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: 999,
    borderWidth: BORDER.card,
    backgroundColor: 'transparent',
  },
  retryText: {
    ...TYPE.calloutSemibold,
  },
  modalTopSpacer: {
    height: MODAL_TOP_SPACER_HEIGHT,
  },
  modalContentWrap: {
    paddingHorizontal: SPACING.screenX,
    paddingBottom: SPACE.xl,
    flex: 1,
  },
  solutionsModalContent: {
    paddingHorizontal: SPACING.screenX,
  },
  stationModalContentWrap: {
    paddingHorizontal: SPACING.screenX,
    flex: 1,
  },
  modalScrollArea: {
    flex: 1,
    position: 'relative',
  },
  modalTitle: {
    ...TYPE.screenTitle,
    marginLeft: SPACING.sectionX,
  },
  solutionsModalTitle: {
    marginTop: 2,
    marginBottom: 6,
    marginLeft: 0,
  },
  solutionsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginBottom: SPACE.md,
  },
  solutionsTitleIndicator: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  solutionsTitleDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  solutionsTitleDotHollow: {
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  solutionsTitleLine: {
    width: 2,
    height: 18,
    borderRadius: 1,
    marginVertical: 4,
  },
  solutionsTitleText: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  solutionsTitleFrom: {
    ...TYPE.screenTitle,
  },
  solutionsTitleTo: {
    ...TYPE.screenTitle,
  },
  modalSectionTitle: {
    ...TYPE.sectionLabel,
    marginTop: SPACE.sm,
    marginBottom: SPACE.sm,
    marginLeft: SPACING.sectionX,
  },
  modalSubtitle: {
    ...TYPE.caption,
    marginTop: SPACE.sm,
    marginBottom: SPACE.md,
    marginHorizontal: SPACING.sectionX,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    gap: SPACE.md,
    marginBottom: SPACE.md,
  },
  stationSearchBar: {
    marginTop: SPACE.lg,
  },
  searchInput: {
    flex: 1,
    ...TYPE.body,
  },
  searchHint: {
    marginTop: SPACE.xxs,
    marginBottom: SPACE.sm,
    marginHorizontal: SPACING.sectionX,
    ...TYPE.caption,
  },
  stationResultsContainer: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
  },
  tileGroup: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
    marginBottom: SPACE.sm,
  },
  stationTile: {
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  stationTileContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  stationTileIcon: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationTileText: {
    flex: 1,
  },
  stationTileTitle: {
    ...TYPE.bodyMedium,
  },
  stationTileSubtitle: {
    ...TYPE.caption,
    marginTop: SPACE.xxs,
  },
  stationTileDivider: {
    height: BORDER.hairline,
    marginLeft: 0,
  },
  tileEmpty: {
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  tileEmptyText: {
    ...TYPE.caption,
  },
  resultsContainer: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
    minHeight: 260,
    flex: 1,
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
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    gap: SPACE.md,
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
  pickerCard: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
    padding: SPACE.sm,
    marginBottom: SPACE.md,
  },

  solutionsCard: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
  },
  solutionGroup: {
    marginBottom: SPACE.lg,
  },
  solutionRow: {
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.md,
    borderBottomWidth: BORDER.hairline,
  },
  solutionRowLast: {
    borderBottomWidth: 0,
  },
  solutionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACE.sm,
    rowGap: SPACE.sm,
    marginTop: SPACE.sm,
  },
  solutionMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
    borderRadius: 999,
    borderWidth: BORDER.card,
  },
  solutionMetaPillAccent: {
    borderWidth: 0,
  },
  solutionMetaText: {
    ...TYPE.captionSemibold,
  },
  solutionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginBottom: SPACE.xs,
  },
  solutionBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xxs,
  },
  solutionBadgeInlineText: {
    ...TYPE.pill,
    letterSpacing: 0.2,
  },
  solutionSortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    flexWrap: 'wrap',
    alignSelf: 'flex-start',
    marginLeft: 8,
    marginBottom: SPACE.sm,
  },
  solutionSortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xxs,
    borderRadius: 999,
    borderWidth: BORDER.card,
  },
  solutionSortText: {
    ...TYPE.captionSemibold,
    letterSpacing: 0.2,
  },
  solutionBadge: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xxs,
    borderRadius: 999,
    borderWidth: BORDER.card,
  },
  solutionBadgeText: {
    ...TYPE.pill,
    letterSpacing: 0.2,
  },
  solutionSegments: {
    gap: SPACE.md,
  },
  segmentBlock: {
    paddingVertical: SPACE.xxs,
  },
  segmentBlockFirst: {
    paddingTop: SPACE.xxs,
  },
  segmentBlockLast: {
    borderBottomWidth: 0,
  },
  segmentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    marginBottom: SPACE.xs,
  },
  segmentTrainRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACE.xs,
    minWidth: 0,
  },
  segmentTrainType: {
    ...TYPE.title,
    lineHeight: 22,
    flexShrink: 0,
  },
  segmentTrainNumber: {
    ...TYPE.titleSemibold,
    lineHeight: 22,
    flexShrink: 1,
  },
  segmentStops: {
    marginTop: 0,
    gap: 0,
    position: 'relative',
    height: SOLUTION_STOP.rowHeight * 2,
  },
  segmentStopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    height: SOLUTION_STOP.rowHeight,
  },
  segmentStopTime: {
    ...TYPE.titleSemibold,
    lineHeight: 20,
    includeFontPadding: false,
    textAlign: 'right',
  },
  segmentStopTimeWrap: {
    width: SOLUTION_STOP.timeWidth,
    height: SOLUTION_STOP.rowHeight,
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginLeft: SPACE.xxs,
    marginRight: SPACE.sm,
  },
  segmentStopIndicator: {
    width: SOLUTION_STOP.indicatorWidth,
    height: SOLUTION_STOP.rowHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentStopDot: {
    width: SOLUTION_STOP.dotSize,
    height: SOLUTION_STOP.dotSize,
    borderRadius: SOLUTION_STOP.dotSize / 2,
    transform: [{ translateY: SOLUTION_STOP.dotOffsetY }],
  },
  segmentStopDotHollow: {
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  segmentStopLine: {
    position: 'absolute',
    left: (SOLUTION_STOP.indicatorWidth - SOLUTION_STOP.lineWidth) / 2,
    top: SOLUTION_STOP.rowHeight / 2 + SOLUTION_STOP.dotSize / 2 + SOLUTION_STOP.lineGap + SOLUTION_STOP.dotOffsetY,
    bottom: SOLUTION_STOP.rowHeight / 2 + SOLUTION_STOP.dotSize / 2 + SOLUTION_STOP.lineGap - SOLUTION_STOP.dotOffsetY,
    width: SOLUTION_STOP.lineWidth,
    borderRadius: SOLUTION_STOP.lineWidth / 2,
  },
  segmentStopStation: {
    ...TYPE.title,
    lineHeight: 20,
    includeFontPadding: false,
  },
  segmentStopStationWrap: {
    flex: 1,
    height: SOLUTION_STOP.rowHeight,
    justifyContent: 'center',
  },
  changeRow: {
    marginTop: SPACE.xs,
  },
  changeDivider: {
    height: BORDER.hairline,
    marginBottom: SPACE.xs,
  },
  changeContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeIndicator: {
    width: SOLUTION_STOP.indicatorWidth,
    marginRight: SPACE.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeTimeCol: {
    width: SOLUTION_STOP.timeWidth,
    marginLeft: 2,
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: SOLUTION_STOP.rowHeight,
  },
  changeTimeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
  },
  changeTextCol: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
  },
  changeText: {
    ...TYPE.caption,
    flexShrink: 1,
  },
  changeStation: {
    ...TYPE.captionSemibold,
  },
  changeTime: {
    ...TYPE.captionSemibold,
  },
  loadMoreRow: {
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    borderTopWidth: BORDER.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
  },
  loadMoreText: {
    ...TYPE.subheadline,
    fontFamily: TYPE.bodySemibold.fontFamily,
    letterSpacing: 0.2,
  },
});
