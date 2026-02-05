import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import useStationsSearch from '../hooks/useStationsSearch';
import useLocationPermission from '../hooks/useLocationPermission';
import { isPermissionGranted, openAppSettings } from '../utils/permissions';
import { getAllStations, getStationByName, searchStations } from '../services/stationsService';
import { getRecentStations, saveRecentStation } from '../services/recentStationsService';
import { getNearbyStations, formatDistance } from '../utils/locationUtils';
import { getRegionName } from '../utils/regionLabels';
import { toPickerStation, enrichStation } from '../utils/stationsFormat';
import { cardShadow, iconButtonShadow } from '../utils/uiStyles';
import { BORDER, HIT_SLOP } from '../utils/uiTokens';
import { hapticModalOpen, hapticSelection } from '../utils/haptics';
import CardLoading from './CardLoading';
import * as Location from 'expo-location';

function StationSearchModal({ visible, title, onClose, onSelect, styles, modalHeaderTop, modalTopSpacerHeight }) {
  const { theme } = useTheme();
  const { query, setQuery, results, error, runSearch: runStationsSearch, reset: resetStationsSearch } =
    useStationsSearch({
      searchFn: searchStations,
      minLength: 2,
      normalizer: toPickerStation,
      emptyMessage: 'Nessun risultato',
    });
  const [recentStations, setRecentStations] = useState([]);
  const [nearbyStations, setNearbyStations] = useState([]);
  const { status: locationStatus, granted: locationGranted, syncStatus, requestPermission } = useLocationPermission({ autoCheck: false });
  const locationPermission = locationStatus == null ? null : locationGranted;
  const [loadingLocation, setLoadingLocation] = useState(false);
  const debounceRef = useRef(null);

  const loadRecents = async () => {
    const list = await getRecentStations(5);
    setRecentStations(Array.isArray(list) ? list : []);
  };

  const handleOpenAppSettings = async () => {
    hapticModalOpen();
    await openAppSettings();
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
      const status = await syncStatus();
      const granted = isPermissionGranted(status);
      if (granted) {
        await getUserLocationAndNearby();
      } else {
        setNearbyStations([]);
      }
    } catch {
      setNearbyStations([]);
    }
  };

  const requestLocationPermission = async () => {
    hapticSelection();
    try {
      const status = await requestPermission();
      const granted = isPermissionGranted(status);
      if (granted) {
        await getUserLocationAndNearby();
      } else {
        setNearbyStations([]);
      }
    } catch {
      setNearbyStations([]);
    }
  };

  const handlePickStation = async (stationLike) => {
    const picked = toPickerStation(stationLike) || toPickerStation(enrichStation(stationLike));
    if (!picked) return;
    hapticSelection();
    onSelect?.(picked);

    const local = getStationByName(picked.name);
    if (local) {
      await saveRecentStation(local);
      await loadRecents();
    }

    onClose?.();
  };

  useEffect(() => {
    if (!visible) return;
    resetStationsSearch();
    setLoadingLocation(false);
    setNearbyStations([]);
    loadRecents();
    initLocation();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      runStationsSearch(query, { limit: 20 });
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, visible, runStationsSearch]);

  if (!visible) return null;

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
    <Modal visible={true} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
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

        <View style={[styles.stationModalContentWrap, styles.modalScrollArea]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            <View style={[styles.modalTopSpacer, { height: modalTopSpacerHeight }]} />
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
                      <CardLoading label="Caricamento..." color={theme.colors.accent} textStyle={{ color: theme.colors.textSecondary }} />
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
                      <TouchableOpacity style={styles.stationTile} activeOpacity={0.6} onPress={handleOpenAppSettings}>
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
        </View>
      </View>
    </Modal>
  );
}

export default StationSearchModal;
