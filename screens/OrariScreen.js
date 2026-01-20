import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Animated,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useTheme } from '../context/ThemeContext';
import AnimatedScreen from '../components/AnimatedScreen';
import SwipeableRow from '../components/SwipeableRow';
import ModernSpinner from '../components/ModernSpinner';
import EdgeFade from '../components/EdgeFade';
import { BORDER, HIT_SLOP, INSETS, RADIUS, SPACING, SPACE, TYPE } from '../utils/uiTokens';
import { cardShadow, floatingShadow, iconButtonShadow } from '../utils/uiStyles';
import { getTravelSolutions } from '../services/apiService';
import { getAllStations, getStationByName, searchStations } from '../services/stationsService';
import { getRegionName } from '../utils/regionLabels';
import { formatDistance, getNearbyStations } from '../utils/locationUtils';
import { getRecentStations, saveRecentStation } from '../services/recentStationsService';
import {
  clearRecentSolutions,
  getRecentSolutions,
  overwriteRecentSolutions,
  removeRecentSolution,
  saveRecentSolution,
} from '../services/recentSolutionsService';

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

const pad2 = (n) => String(Number(n) || 0).padStart(2, '0');

const parseDateTime = (input) => {
  if (input instanceof Date) return input;
  const str = String(input || '').trim();
  if (!str) return new Date('');

  // Se presente timezone esplicito (Z / +01:00 / +0100), affidiamoci al parser nativo
  // così l'ora e il giorno vengono convertiti correttamente in locale (es. attraversamento mezzanotte).
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(str)) return new Date(str);

  // ISO senza timezone: trattalo come locale (consistente con la UX in Italia).
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (m) {
    const [, yy, mm, dd, hh, mi] = m;
    return new Date(Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), 0, 0);
  }

  return new Date(str);
};

const toYmd = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const toHm = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const formatItDateTime = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  try {
    const d = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
    const t = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    return `${d} - ${t}`;
  } catch {
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${String(date.getFullYear()).slice(-2)} - ${toHm(date)}`;
  }
};

const formatItTime = (value) => {
  if (!value) return '—';
  const date = parseDateTime(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  } catch {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }
};

const formatItLongDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  try {
    const raw = new Intl.DateTimeFormat('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '—';
  } catch {
    return '—';
  }
};

const formatDurationMinutes = (mins) => {
  const m = Number(mins);
  if (!Number.isFinite(m) || m <= 0) return null;
  const hours = Math.floor(m / 60);
  const minutes = Math.round(m % 60);
  if (hours <= 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${pad2(minutes)} min`;
};

const formatEuro = (amount, currency = '€') => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const fixed = n.toFixed(2);
  return `${currency} ${fixed.replace('.', ',')}`;
};

const minutesBetween = (fromIso, toIso) => {
  if (!fromIso || !toIso) return null;
  const a = parseDateTime(fromIso);
  const b = parseDateTime(toIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const diff = Math.round((b.getTime() - a.getTime()) / 60000);
  if (!Number.isFinite(diff)) return null;
  return Math.max(0, diff);
};

const getCalendarDayIndex = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

const getDayDelta = (from, to) => {
  if (!(from instanceof Date) || Number.isNaN(from.getTime())) return 0;
  if (!(to instanceof Date) || Number.isNaN(to.getTime())) return 0;
  const a = getCalendarDayIndex(from);
  const b = getCalendarDayIndex(to);
  const diff = Math.round((b - a) / 86400000);
  return Number.isFinite(diff) ? diff : 0;
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

function enrichStation(station) {
  if (!station?.name) return station;
  const local = getStationByName(station.name);
  const regionCode = local?.region ?? local?.regione ?? null;
  const region = regionCode ? getRegionName(regionCode) : null;
  const lefrecceId =
    (local?.lefrecceId !== null && local?.lefrecceId !== undefined ? local.lefrecceId : null) ??
    (station?.lefrecceId !== null && station?.lefrecceId !== undefined ? station.lefrecceId : null);
  return { ...station, region, lefrecceId };
}

function toPickerStation(station) {
  if (!station?.name) return null;
  const name = String(station.name).trim();
  if (!name) return null;
  const local = getStationByName(name);
  const regionCode = local?.region ?? station?.region ?? station?.regione ?? null;
  const region = regionCode ? getRegionName(regionCode) : null;
  const lefrecceId = local?.lefrecceId ?? null;
  return { name, id: null, region, lefrecceId };
}

function StationSearchModal({ visible, title, onClose, onSelect }) {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [recentStations, setRecentStations] = useState([]);
  const [nearbyStations, setNearbyStations] = useState([]);
  const [locationPermission, setLocationPermission] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const debounceRef = useRef(null);

  const loadRecents = async () => {
    const list = await getRecentStations(5);
    setRecentStations(Array.isArray(list) ? list : []);
  };

  const openAppSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (e) {
      console.warn('Errore nell’aprire le Impostazioni:', e?.message || e);
    }
  };

  const getUserLocationAndNearby = async () => {
    try {
      setLoadingLocation(true);
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const allStations = getAllStations();
      const nearby = getNearbyStations(
        location.coords.latitude,
        location.coords.longitude,
        allStations,
        50,
        5
      );
      setNearbyStations(Array.isArray(nearby) ? nearby : []);
    } catch (e) {
      setNearbyStations([]);
    } finally {
      setLoadingLocation(false);
    }
  };

  const initLocation = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      const granted = status === 'granted';
      setLocationPermission(granted);
      if (granted) {
        await getUserLocationAndNearby();
      } else {
        setNearbyStations([]);
      }
    } catch {
      setLocationPermission(false);
      setNearbyStations([]);
    }
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setLocationPermission(granted);
      if (granted) {
        await getUserLocationAndNearby();
      } else {
        setNearbyStations([]);
      }
    } catch {
      setLocationPermission(false);
      setNearbyStations([]);
    }
  };

  const handlePickStation = async (stationLike) => {
    const picked = toPickerStation(stationLike) || toPickerStation(enrichStation(stationLike));
    if (!picked) return;
    hapticSelection();
    onSelect?.(picked);

    // Salviamo la stazione (se la troviamo nel dataset locale) come "recente"
    const local = getStationByName(picked.name);
    if (local) {
      await saveRecentStation(local);
      await loadRecents();
    }

    onClose?.();
  };

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setResults([]);
    setError('');
    setLocationPermission(null);
    setLoadingLocation(false);
    setNearbyStations([]);
    loadRecents();
    initLocation();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = query.trim();
    if (q.length < 2) {
      setError('');
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setError('');
      const localResults = searchStations(q, 20);
      const normalized = Array.isArray(localResults) ? localResults.map((s) => toPickerStation(s)).filter(Boolean) : [];
      setResults(normalized);
      if (normalized.length === 0) setError('Nessun risultato');
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, visible]);

  const renderStationTile = (item, { subtitle, icon = 'location-outline', rightText = null } = {}) => (
    <TouchableOpacity
      key={`${item?.name}-${String(item?.id ?? '')}`}
      style={styles.stationTile}
      activeOpacity={0.6}
      onPress={() => handlePickStation(item)}
    >
      <View style={styles.stationTileContent}>
        <View style={styles.stationTileIcon}>
          <Ionicons name={icon} size={20} color={theme.colors.text} />
        </View>
        <View style={styles.stationTileText}>
          <Text style={[styles.stationTileTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {item?.name || '—'}
          </Text>
          {subtitle ? (
            <Text style={[styles.stationTileSubtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {subtitle}
              {rightText ? <Text style={{ color: theme.colors.accent }}>{`  ${rightText}`}</Text> : null}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} style={{ opacity: 0.5 }} />
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity
            style={[styles.closeButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: BORDER.card }]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.modalTopSpacer} />

        <View style={[styles.stationModalContentWrap, styles.modalScrollArea]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>{title}</Text>

            <View style={[styles.searchBar, styles.stationSearchBar, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
              <Ionicons name="search-outline" size={20} color={theme.colors.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: theme.colors.text }]}
                placeholder="Scrivi almeno 2 lettere"
                placeholderTextColor={theme.colors.textSecondary}
                value={query}
                onChangeText={setQuery}
                autoFocus={false}
                autoCorrect={false}
                autoCapitalize="words"
                clearButtonMode="while-editing"
                returnKeyType="search"
              />
            </View>

            {(query.trim().length >= 2 || error) && (
              <>
                <Text style={[styles.modalSectionTitle, { color: theme.colors.textSecondary }]}>RISULTATI</Text>
                <View style={[styles.stationResultsContainer, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
                  {results.length > 0 ? (
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                      {results.slice(0, 15).map((item, index) => (
                        <View key={`${item.name}-${String(item.id ?? index)}`}>
                          {renderStationTile(item, {
                            subtitle: item.region || null,
                            icon: 'location-outline',
                          })}
                          {index < Math.min(results.length, 15) - 1 && (
                            <View style={[styles.stationTileDivider, { backgroundColor: theme.colors.border }]} />
                          )}
                        </View>
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={styles.resultsEmptyState}>
                      <Text style={[styles.resultsEmptyTitle, { color: theme.colors.text }]}>
                        {error ? 'Errore' : 'Nessun risultato'}
                      </Text>
                      <Text style={[styles.resultsEmptySubtitle, { color: theme.colors.textSecondary }]}>
                        {error ? error : 'Prova con un nome più lungo (es. “Milano”, “Roma”)'}
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}

            {query.trim().length > 0 && query.trim().length < 2 ? (
              <Text style={[styles.searchHint, { color: theme.colors.textSecondary }]}>
                Scrivi almeno 2 lettere per vedere i risultati.
              </Text>
            ) : null}

            {query.trim().length === 0 ? (
              <>
                <Text style={[styles.modalSectionTitle, { color: theme.colors.textSecondary }]}>RECENTI</Text>
                <View style={[styles.tileGroup, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
                  {recentStations.length > 0 ? (
                    recentStations.map((s, index) => (
                      <View key={`${s.id}-${index}`}>
                        {renderStationTile(
                          { name: s.name, region: s.region },
                          {
                            subtitle: s.region ? getRegionName(s.region) : null,
                            icon: 'location-outline',
                          }
                        )}
                        {index < recentStations.length - 1 && (
                          <View style={[styles.stationTileDivider, { backgroundColor: theme.colors.border }]} />
                        )}
                      </View>
                    ))
                  ) : (
                    <View style={styles.tileEmpty}>
                      <Text style={[styles.tileEmptyText, { color: theme.colors.textSecondary }]}>Nessuna stazione recente</Text>
                    </View>
                  )}
                </View>

                <Text style={[styles.modalSectionTitle, { color: theme.colors.textSecondary }]}>STAZIONI VICINE</Text>
                <View style={[styles.tileGroup, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
                  {locationPermission === true ? (
                    loadingLocation ? (
                      <View style={styles.resultsLoading}>
                        <ModernSpinner size={18} thickness={2} color={theme.colors.accent} innerStyle={{ backgroundColor: theme.colors.card }} />
                        <Text style={[styles.resultsLoadingText, { color: theme.colors.textSecondary }]}>Ricerca in corso…</Text>
                      </View>
                    ) : nearbyStations.length > 0 ? (
                      nearbyStations.map((s, index) => (
                        <View key={`${s.id}-${index}`}>
                          {renderStationTile(
                            { name: s.name, region: s.region },
                            {
                              subtitle: s.region ? getRegionName(s.region) : null,
                              icon: 'location-outline',
                              rightText: s.distance != null ? `~${formatDistance(s.distance)}` : null,
                            }
                          )}
                          {index < nearbyStations.length - 1 && (
                            <View style={[styles.stationTileDivider, { backgroundColor: theme.colors.border }]} />
                          )}
                        </View>
                      ))
                    ) : (
                      <View style={styles.tileEmpty}>
                        <Text style={[styles.tileEmptyText, { color: theme.colors.textSecondary }]}>Nessuna stazione nelle vicinanze</Text>
                      </View>
                    )
                  ) : locationPermission === false ? (
                    <>
                      <TouchableOpacity style={styles.stationTile} activeOpacity={0.6} onPress={requestLocationPermission}>
                        <View style={styles.stationTileContent}>
                          <View style={styles.stationTileIcon}>
                            <Ionicons name="location" size={20} color={theme.colors.accent} />
                          </View>
                          <View style={styles.stationTileText}>
                            <Text style={[styles.stationTileTitle, { color: theme.colors.accent }]} numberOfLines={1}>
                              Attiva Servizi di Localizzazione
                            </Text>
                            <Text style={[styles.stationTileSubtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                              Per vedere le stazioni nelle vicinanze
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} style={{ opacity: 0.5 }} />
                        </View>
                      </TouchableOpacity>
                      <View style={[styles.stationTileDivider, { backgroundColor: theme.colors.border }]} />
                      <TouchableOpacity style={styles.stationTile} activeOpacity={0.6} onPress={openAppSettings}>
                        <View style={styles.stationTileContent}>
                          <View style={styles.stationTileIcon}>
                            <Ionicons name="settings-outline" size={20} color={theme.colors.text} />
                          </View>
                          <View style={styles.stationTileText}>
                            <Text style={[styles.stationTileTitle, { color: theme.colors.text }]} numberOfLines={1}>
                              Apri Impostazioni
                            </Text>
                            <Text style={[styles.stationTileSubtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                              Gestisci i permessi di posizione
                            </Text>
                          </View>
                          <Ionicons name="open-outline" size={18} color={theme.colors.textSecondary} style={{ opacity: 0.5 }} />
                        </View>
                      </TouchableOpacity>
                      <View style={[styles.stationTileDivider, { backgroundColor: theme.colors.border }]} />
                      <TouchableOpacity style={styles.stationTile} activeOpacity={0.6} onPress={requestLocationPermission}>
                        <View style={styles.stationTileContent}>
                          <View style={styles.stationTileIcon}>
                            <Ionicons name="refresh" size={20} color={theme.colors.accent} />
                          </View>
                          <View style={styles.stationTileText}>
                            <Text style={[styles.stationTileTitle, { color: theme.colors.accent }]} numberOfLines={1}>
                              Riprova permesso
                            </Text>
                            <Text style={[styles.stationTileSubtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                              Richiedi di nuovo l’accesso
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} style={{ opacity: 0.5 }} />
                        </View>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={styles.tileEmpty}>
                      <Text style={[styles.tileEmptyText, { color: theme.colors.textSecondary }]}>Controllo permessi…</Text>
                    </View>
                  )}
                </View>
              </>
            ) : null}
          </ScrollView>

          <EdgeFade height={SPACE.lg} style={styles.modalTopEdgeFade} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function DateTimeModal({ visible, value, onClose, onConfirm }) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState(value instanceof Date ? value : new Date());

  useEffect(() => {
    if (!visible) return;
    setDraft(value instanceof Date ? value : new Date());
  }, [visible, value]);

  if (Platform.OS !== 'ios') return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity
            style={[styles.closeButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: BORDER.card }]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.modalTopSpacer} />

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
              onChange={(_, d) => {
                if (d instanceof Date) setDraft(d);
              }}
              textColor={theme.colors.text}
              style={{ alignSelf: 'stretch' }}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
            activeOpacity={0.8}
            onPress={() => {
              hapticImpact();
              onConfirm?.(draft);
              onClose?.();
            }}
          >
            <Text style={styles.primaryButtonText}>Conferma</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function SolutionRow({ item, theme }) {
  const [expanded, setExpanded] = useState(false);

  const depDate = item?.departureTime ? new Date(item.departureTime) : null;
  const arrDate = item?.arrivalTime ? new Date(item.arrivalTime) : null;
  const depText = formatItTime(depDate);
  const arrTextBase = formatItTime(arrDate);
  const dayDelta = depDate && arrDate ? getDayDelta(depDate, arrDate) : 0;
  const arrText = dayDelta > 0 ? `${arrTextBase} (+${dayDelta}g)` : arrTextBase;
  const arrivalDayLabel = dayDelta > 0 ? (dayDelta === 1 ? 'Arrivo domani' : `Arrivo +${dayDelta}g`) : null;

  const nodes = Array.isArray(item?.nodes) ? item.nodes : [];
  const changes = Math.max(0, nodes.length - 1);
  const originStation = String(nodes?.[0]?.origin || '').trim() || '—';
  const destinationStation = String(nodes?.[nodes.length - 1]?.destination || '').trim() || '—';
  const duration =
    typeof item?.duration === 'string' && item.duration.trim()
      ? item.duration.trim()
      : formatDurationMinutes(item?.duration);
  const priceAmount = item?.price?.amount ?? null;
  const priceCurrency = item?.price?.currency ?? '€';

  const trainSummaryParts = nodes
    .map((n) => {
      const acronym = String(n?.train?.acronym || '').trim();
      const number = n?.train?.trainIdentifier ? String(n.train.trainIdentifier).trim() : '';
      if (!acronym && !number) return null;
      return { acronym, number };
    })
    .filter(Boolean);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => {
        if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
          UIManager.setLayoutAnimationEnabledExperimental(true);
        }
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded((v) => !v);
        hapticSelection();
      }}
      style={[styles.solutionRow, { borderBottomColor: theme.colors.border }]}
    >
      <View style={styles.solutionTopRow}>
        <View style={styles.solutionTimes}>
          <Text style={[styles.solutionTimeText, { color: theme.colors.text }]}>{depText} → {arrText}</Text>
          <Text style={[styles.solutionRouteText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {originStation} → {destinationStation}
          </Text>
        </View>
        <View style={styles.solutionRight}>
          {priceAmount !== null && priceAmount !== undefined ? (
            <Text style={[styles.solutionPrice, { color: theme.colors.text }]} numberOfLines={1}>
              {formatEuro(priceAmount, priceCurrency)}
            </Text>
          ) : (
            <Text style={[styles.solutionPrice, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              —
            </Text>
          )}
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSecondary} />
        </View>
      </View>

      <View style={styles.solutionPillsRow}>
        {changes === 0 ? (
          <View style={[styles.pill, styles.pillAccent, { backgroundColor: theme.colors.accent }]}>
            <Ionicons name="flash" size={14} color={theme.colors.onAccent} />
            <Text style={[styles.pillText, { color: theme.colors.onAccent }]}>Diretto</Text>
          </View>
        ) : (
          <View style={[styles.pill, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
            <Ionicons name="swap-horizontal" size={14} color={theme.colors.textSecondary} />
            <Text style={[styles.pillText, { color: theme.colors.textSecondary }]}>{changes} cambi</Text>
          </View>
        )}
        {duration ? (
          <View style={[styles.pill, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
            <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={[styles.pillText, { color: theme.colors.textSecondary }]}>{duration}</Text>
          </View>
        ) : null}
        {arrivalDayLabel ? (
          <View style={[styles.pill, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
            <Ionicons name="calendar-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={[styles.pillText, { color: theme.colors.textSecondary }]}>{arrivalDayLabel}</Text>
          </View>
        ) : null}
      </View>

      {trainSummaryParts.length > 0 ? (
        <Text style={[styles.solutionTrainSummary, { color: theme.colors.textSecondary }]} numberOfLines={expanded ? 10 : 2}>
          {trainSummaryParts.map((p, idx) => (
            <React.Fragment key={`${idx}-${p.acronym}-${p.number}`}>
              {idx > 0 ? ' · ' : null}
              {p.acronym ? (
                <Text style={[styles.inlineTrainType, { color: theme.colors.textSecondary }]}>{p.acronym}</Text>
              ) : null}
              {p.acronym && p.number ? ' ' : null}
              {p.number ? <Text style={[styles.inlineTrainNumber, { color: theme.colors.text }]}>{p.number}</Text> : null}
            </React.Fragment>
          ))}
        </Text>
      ) : null}

      {expanded && nodes.length > 0 ? (
        <View style={styles.solutionSegments}>
          {nodes.map((n, idx) => {
            const acronym = String(n?.train?.acronym || '').trim();
            const number = String(n?.train?.trainIdentifier || '').trim();
            const t = `${acronym} ${number}`.trim();
            const showType = Boolean(acronym && number);
            const origin = String(n?.origin || '').trim() || '—';
            const destination = String(n?.destination || '').trim() || '—';
            const segDepDate = n?.departureTime ? new Date(n.departureTime) : null;
            const segArrDate = n?.arrivalTime ? new Date(n.arrivalTime) : null;
            const dep = formatItTime(segDepDate);
            const arrBase = formatItTime(segArrDate);
            const segDayDelta = segDepDate && segArrDate ? getDayDelta(segDepDate, segArrDate) : 0;
            const arr = segDayDelta > 0 ? `${arrBase} (+${segDayDelta}g)` : arrBase;
            const changeMinutes =
              idx < nodes.length - 1 ? minutesBetween(n?.arrivalTime, nodes[idx + 1]?.departureTime) : null;
            const changeAt = destination !== '—' ? destination : null;

            return (
              <View key={`${idx}-${t}-${origin}-${destination}`}>
                <View style={[styles.segmentBlock, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
                  <View style={styles.segmentHeaderRow}>
                    <View style={styles.segmentTrainRow}>
                      {showType ? (
                        <Text style={[styles.segmentTrainType, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                          {acronym}
                        </Text>
                      ) : null}
                      <Text style={[styles.segmentTrainNumber, { color: theme.colors.text }]} numberOfLines={1}>
                        {number || acronym || t || 'Treno'}
                      </Text>
                    </View>
                    <Text style={[styles.segmentTimes, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                      {dep} → {arr}
                    </Text>
                  </View>
                  <Text style={[styles.segmentRoute, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                    {origin} → {destination}
                  </Text>
                </View>

                {idx < nodes.length - 1 ? (
                  <View style={[styles.changePill, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
                    <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
                    <Text style={[styles.changePillText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                      Cambio{changeMinutes !== null ? ` · ${changeMinutes} min` : ''}{changeAt ? ` · ${changeAt}` : ''}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function SolutionsModal({
  visible,
  onClose,
  headerTitle,
  loading,
  error,
  solutions,
  onRetry,
  filters,
  onChangeFilters,
  queryWhen,
  canLoadMore,
  onLoadMore,
}) {
  const { theme } = useTheme();
  const list = Array.isArray(solutions) ? solutions : [];
  const queryDate = queryWhen instanceof Date ? queryWhen : new Date(queryWhen);
  const queryKey =
    queryDate instanceof Date && !Number.isNaN(queryDate.getTime())
      ? `${queryDate.getFullYear()}-${pad2(queryDate.getMonth() + 1)}-${pad2(queryDate.getDate())}`
      : null;

  const groups = useMemo(() => {
    const buckets = new Map();
    for (const s of list) {
      const d = parseDateTime(s?.departureTime);
      const key =
        d instanceof Date && !Number.isNaN(d.getTime())
          ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
          : 'unknown';
      const entry = buckets.get(key) || { key, date: d, items: [] };
      entry.items.push(s);
      buckets.set(key, entry);
    }

    return Array.from(buckets.values()).sort((a, b) => {
      const at = a.date instanceof Date && !Number.isNaN(a.date.getTime()) ? a.date.getTime() : Number.POSITIVE_INFINITY;
      const bt = b.date instanceof Date && !Number.isNaN(b.date.getTime()) ? b.date.getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    });
  }, [list]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
        <View style={styles.modalHeader}>
          <View style={styles.modalHeaderRow}>
            <TouchableOpacity
              style={[
                styles.closeButton,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  borderWidth: BORDER.card,
                },
                iconButtonShadow(theme),
              ]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onRetry}
              activeOpacity={0.7}
              disabled={loading}
              style={[
                styles.closeButton,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  borderWidth: BORDER.card,
                  opacity: loading ? 0.6 : 1,
                },
                iconButtonShadow(theme),
              ]}
              hitSlop={HIT_SLOP.md}
            >
              <Ionicons name="refresh" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.modalTopSpacer} />

        <View style={styles.modalScrollArea}>
          <ScrollView
            style={styles.modalBody}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.modalScrollContent, { paddingBottom: 28 }]}
          >
            <Text style={[styles.modalTitle, styles.solutionsModalTitle, { color: theme.colors.text }]}>
              {headerTitle}
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersInlineRow}>
              {[
                { id: 'all', label: 'Tutti' },
                { id: 'frecce', label: 'Frecce' },
                { id: 'intercity', label: 'Intercity' },
                { id: 'regional', label: 'Regionali' },
              ].map((c) => {
                const selected = (filters?.category || 'all') === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    activeOpacity={0.8}
                    onPress={() => onChangeFilters?.({ category: c.id })}
                    style={[
                      styles.filterPill,
                      selected
                        ? { backgroundColor: theme.colors.card, borderColor: theme.colors.border }
                        : { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
                    ]}
                  >
                    <Text style={[styles.filterPillText, { color: selected ? theme.colors.text : theme.colors.textSecondary }]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => onChangeFilters?.({ directOnly: !filters?.directOnly })}
                style={[
                  styles.filterPill,
                  filters?.directOnly
                    ? { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }
                    : { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
                ]}
              >
                <Ionicons name="flash" size={14} color={filters?.directOnly ? theme.colors.onAccent : theme.colors.textSecondary} />
                <Text style={[styles.filterPillText, { color: filters?.directOnly ? theme.colors.onAccent : theme.colors.textSecondary }]}>
                  Diretti
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {loading || error || list.length === 0 ? (
              <>
                <Text style={[styles.modalSectionTitle, styles.solutionsModalSectionTitle, { color: theme.colors.textSecondary }]}>
                  {`${formatItLongDate(queryWhen)} - ${formatItTime(queryWhen)}`.toUpperCase()}
                </Text>
                <View style={[styles.solutionsCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
                  {loading ? (
                    <View style={styles.resultsLoading}>
                      <ModernSpinner size={22} thickness={3} color={theme.colors.accent} innerStyle={{ backgroundColor: theme.colors.card }} />
                      <Text style={[styles.resultsLoadingText, { color: theme.colors.textSecondary }]}>Carico soluzioni…</Text>
                    </View>
                  ) : error ? (
                    <View style={styles.resultsEmptyState}>
                      <Text style={[styles.resultsEmptyTitle, { color: theme.colors.text }]}>Nessuna risposta</Text>
                      <Text style={[styles.resultsEmptySubtitle, { color: theme.colors.textSecondary }]}>{error}</Text>
                    </View>
                  ) : (
                    <View style={styles.resultsEmptyState}>
                      <Text style={[styles.resultsEmptyTitle, { color: theme.colors.text }]}>Nessuna soluzione</Text>
                      <Text style={[styles.resultsEmptySubtitle, { color: theme.colors.textSecondary }]}>
                        Prova a cambiare orario o stazioni.
                      </Text>
                    </View>
                  )}
                </View>
              </>
            ) : (
              <>
                {groups.map((g, idx) => {
                  const rawTitle =
                    g.key !== 'unknown'
                      ? g.key === queryKey
                        ? `${formatItLongDate(g.date)} - ${formatItTime(queryWhen)}`
                        : formatItLongDate(g.date)
                      : '—';
                  const title = String(rawTitle || '—').toUpperCase();

                  const isLast = idx === groups.length - 1;

                  return (
                    <View key={g.key}>
                      <Text style={[styles.modalSectionTitle, styles.solutionsModalSectionTitle, { color: theme.colors.textSecondary }]}>{title}</Text>
                      <View style={[styles.solutionsCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
                        <View>
                          {g.items.map((s, i) => (
                            <SolutionRow key={String(s?.id ?? `${g.key}-${i}`)} item={s} theme={theme} />
                          ))}
                          {isLast && canLoadMore ? (
                            <TouchableOpacity
                              style={[styles.loadMoreRow, { borderTopColor: theme.colors.border }]}
                              activeOpacity={0.75}
                              onPress={onLoadMore}
                              disabled={loading}
                            >
                              <Text style={[styles.loadMoreText, { color: theme.colors.accent }]}>Carica più soluzioni</Text>
                              <Ionicons name="chevron-down" size={18} color={theme.colors.accent} />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>

          <EdgeFade height={SPACE.lg} style={styles.modalTopEdgeFade} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function OrariScreen() {
  const { theme } = useTheme();
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [fromStation, setFromStation] = useState(null);
  const [toStation, setToStation] = useState(null);
  const [when, setWhen] = useState(() => {
    const d = new Date();
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
    d.setSeconds(0);
    d.setMilliseconds(0);
    return d;
  });

  const [fromModalVisible, setFromModalVisible] = useState(false);
  const [toModalVisible, setToModalVisible] = useState(false);
  const [dateModalVisible, setDateModalVisible] = useState(false);

  const [solutionsVisible, setSolutionsVisible] = useState(false);
  const [solutionsLoading, setSolutionsLoading] = useState(false);
  const [solutionsError, setSolutionsError] = useState('');
  const [solutions, setSolutions] = useState([]);
  const [solutionsOffset, setSolutionsOffset] = useState(0);
  const [solutionsLimit, setSolutionsLimit] = useState(10);
  const [solutionsHasNext, setSolutionsHasNext] = useState(false);
  const [solutionsFilters, setSolutionsFilters] = useState({
    category: 'all',
    directOnly: false,
  });
  const [solutionsQueryWhen, setSolutionsQueryWhen] = useState(null);
  const [recentSolutions, setRecentSolutions] = useState([]);
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

  const loadRecentSolutions = async () => {
    const list = await getRecentSolutions(5);
    setRecentSolutions(Array.isArray(list) ? list : []);
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
    hapticImpact(Haptics.ImpactFeedbackStyle.Medium);
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
          hapticImpact(Haptics.ImpactFeedbackStyle.Heavy);
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

  const headerSubtitle = useMemo(() => whenLabel, [whenLabel]);

  const canSearch = Boolean(fromStation?.name && toStation?.name && when instanceof Date);

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
      hapticImpact(Haptics.ImpactFeedbackStyle.Light);
      setSolutionsError('Seleziona stazione di partenza, arrivo e data/ora.');
      setSolutions([]);
      setSolutionsVisible(true);
      return;
    }

    const date = toYmd(whenValue);
    const time = toHm(whenValue);
    setSolutionsVisible(true);
    setSolutionsLoading(true);
    setSolutionsError('');
    setSolutionsQueryWhen(whenValue);
    if (!append) setSolutions([]);

    try {
      setSolutionsOffset(offset);
      setSolutionsLimit(limit);
      const resp = await getTravelSolutions({
        fromName: from.name,
        fromId: from.lefrecceId ?? null,
        toName: to.name,
        toId: to.lefrecceId ?? null,
        date,
        time,
        offset,
        limit,
        frecceOnly: filters?.category === 'frecce',
        intercityOnly: filters?.category === 'intercity',
        regionalOnly: filters?.category === 'regional',
        noChanges: Boolean(filters?.directOnly),
      });

      if (!resp?.ok) {
        setSolutionsError(String(resp?.error || 'Errore nel recupero soluzioni'));
        setSolutions([]);
        setSolutionsHasNext(false);
        return;
      }
      const list = Array.isArray(resp?.solutions) ? resp.solutions : [];
      setSolutions((prev) => (append ? [...(Array.isArray(prev) ? prev : []), ...list] : list));
      setSolutionsHasNext(list.length === limit);

      if (!append && offset === 0) {
        await saveRecentSolution({
          fromName: from.name,
          fromId: from.id ?? null,
          toName: to.name,
          toId: to.id ?? null,
          whenISO: whenValue.toISOString(),
        });
        await loadRecentSolutions();
      }
    } catch (e) {
      setSolutionsError(String(e?.message || 'Errore nel recupero soluzioni'));
      setSolutions([]);
    } finally {
      setSolutionsLoading(false);
    }
  };

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
    requestAnimationFrame(() => {
      runSearch({ offset: 0, filters: next });
    });
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
    if (Platform.OS === 'ios') {
      setDateModalVisible(true);
      return;
    }

    const base = when instanceof Date && !Number.isNaN(when.getTime()) ? when : new Date();
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
          scrollEnabled={scrollEnabled}
          contentContainerStyle={styles.contentContainer}
        >
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>CERCA ORARI</Text>
            <View style={[styles.formCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
              <TouchableOpacity
                style={styles.formRow}
                activeOpacity={0.6}
                onPress={() => {
                  hapticSelection();
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
                  hapticSelection();
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

            <Text style={[styles.sectionDescription, { color: theme.colors.textSecondary }]}>
              Seleziona partenza, arrivo e data/ora: le soluzioni si aprono in un modal.
            </Text>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: canSearch ? theme.colors.primary : theme.colors.border }]}
              activeOpacity={0.85}
              onPress={() => {
                hapticImpact();
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
                    const whenIso = r?.whenISO || null;
                    const label = whenIso ? formatItDateTime(new Date(whenIso)) : '—';
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
                              const nextWhen = whenIso ? new Date(whenIso) : new Date();
                              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                              setFromStation(resolvedFrom);
                              setToStation(resolvedTo);
                              setWhen(nextWhen);
                              requestAnimationFrame(() => {
                                runSearch({ fromStation: resolvedFrom, toStation: resolvedTo, when: nextWhen });
                              });
                            }}
                          >
                            <View style={styles.listItemContent}>
                              <View style={styles.listItemIcon}>
                                <Ionicons name="time-outline" size={20} color={theme.colors.text} />
                              </View>
                              <View style={styles.listItemText}>
                                <Text style={[styles.listItemTitle, { color: theme.colors.text }]} numberOfLines={1}>
                                  {from} → {to}
                                </Text>
                                <Text style={[styles.listItemSubtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                  {label}
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
            ) : null}
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
              <TouchableOpacity
                onPress={handleUndo}
                activeOpacity={0.75}
                hitSlop={HIT_SLOP.sm}
              >
                <Text style={[styles.undoToastAction, { color: theme.colors.accent }]}>ANNULLA</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        <StationSearchModal
          visible={fromModalVisible}
          title="Da"
          onClose={() => setFromModalVisible(false)}
          onSelect={(s) => setFromStation(s)}
        />

        <StationSearchModal
          visible={toModalVisible}
          title="A"
          onClose={() => setToModalVisible(false)}
          onSelect={(s) => setToStation(s)}
        />

        <DateTimeModal
          visible={dateModalVisible}
          value={when}
          onClose={() => setDateModalVisible(false)}
          onConfirm={(d) => setWhen(d)}
        />

        <SolutionsModal
          visible={solutionsVisible}
          onClose={() => setSolutionsVisible(false)}
          headerTitle={headerTitle}
          headerSubtitle={formatItTime(solutionsQueryWhen || when)}
          loading={solutionsLoading}
          error={solutionsError}
          solutions={solutions}
          onRetry={() => runSearch()}
          filters={solutionsFilters}
          onChangeFilters={applySolutionFilters}
          queryWhen={solutionsQueryWhen || when}
          canLoadMore={solutionsHasNext}
          onLoadMore={loadMoreSolutions}
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
  },
  section: {
    marginBottom: SPACE.md,
  },
  sectionTitle: {
    ...TYPE.sectionLabel,
    marginBottom: SPACE.sm,
    marginLeft: SPACING.sectionX,
  },
  sectionDescription: {
    ...TYPE.caption,
    marginTop: SPACE.md,
    marginBottom: SPACE.xs,
    marginHorizontal: SPACING.sectionX,
  },
  formCard: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
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
  filtersInlineRow: {
    marginTop: SPACE.lg,
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
    top: SPACE.md,
    left: SPACING.screenX,
    right: SPACING.screenX,
    zIndex: 10,
  },
  modalBody: {
    flex: 1,
  },
  modalScrollContent: {
    paddingHorizontal: SPACING.screenX,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    height: 64,
  },
  modalContentWrap: {
    paddingHorizontal: SPACING.screenX,
    paddingBottom: SPACE.xl,
    flex: 1,
  },
  stationModalContentWrap: {
    paddingHorizontal: SPACING.screenX,
    flex: 1,
  },
  modalScrollArea: {
    flex: 1,
    position: 'relative',
  },
  modalTopEdgeFade: {
    position: 'absolute',
    top: -SPACE.sm,
    left: 0,
    right: 0,
    zIndex: 10,
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
  modalSectionTitle: {
    ...TYPE.sectionLabel,
    marginTop: SPACE.sm,
    marginBottom: SPACE.sm,
    marginLeft: SPACING.sectionX,
  },
  solutionsModalSectionTitle: {
    marginTop: 18,
    marginBottom: 10,
    marginLeft: 0,
  },
  inlineTrainType: {
    ...TYPE.caption,
  },
  inlineTrainNumber: {
    ...TYPE.caption,
    fontFamily: TYPE.titleBold.fontFamily,
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
    width: 28,
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
    marginLeft: SPACE.lg,
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
  resultsLoading: {
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  resultsLoadingText: {
    ...TYPE.callout,
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
  solutionsSectionTitle: {
    marginTop: SPACE.md,
    ...TYPE.bodySemibold,
    marginLeft: SPACING.sectionX,
  },
  solutionRow: {
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderBottomWidth: BORDER.hairline,
  },
  solutionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  solutionTimes: {
    flex: 1,
  },
  solutionTimeText: {
    ...TYPE.bodySemibold,
    letterSpacing: 0.2,
  },
  solutionRouteText: {
    ...TYPE.caption,
    marginTop: SPACE.xs,
  },
  solutionRight: {
    alignItems: 'flex-end',
    gap: SPACE.sm,
  },
  solutionPrice: {
    ...TYPE.subheadline,
    fontFamily: TYPE.bodySemibold.fontFamily,
  },
  solutionPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginTop: SPACE.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: 999,
    borderWidth: BORDER.card,
  },
  pillAccent: {
    borderWidth: 0,
  },
  pillText: {
    ...TYPE.captionSemibold,
    letterSpacing: 0.2,
  },
  solutionTrainSummary: {
    marginTop: SPACE.md,
    ...TYPE.caption,
  },
  solutionSegments: {
    marginTop: SPACE.md,
    gap: SPACE.md,
  },
  segmentBlock: {
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.button,
    borderWidth: BORDER.card,
  },
  segmentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  segmentTrainRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACE.xs,
    minWidth: 0,
  },
  segmentTrainType: {
    ...TYPE.caption,
    flexShrink: 0,
  },
  segmentTrainNumber: {
    ...TYPE.callout,
    fontFamily: TYPE.titleBold.fontFamily,
    flexShrink: 1,
  },
  segmentTimes: {
    ...TYPE.caption,
  },
  segmentRoute: {
    marginTop: SPACE.sm,
    ...TYPE.caption,
  },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginTop: SPACE.md,
    alignSelf: 'flex-start',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: 999,
    borderWidth: BORDER.card,
  },
  changePillText: {
    flex: 1,
    ...TYPE.caption,
  },
  loadMoreRow: {
    paddingVertical: SPACE.md,
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
