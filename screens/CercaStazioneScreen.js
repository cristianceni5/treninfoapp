import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, FlatList, TouchableOpacity, Keyboard, Dimensions, Linking, Modal, ScrollView, Animated, ActivityIndicator } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTheme } from '../context/ThemeContext';
import AnimatedScreen from '../components/AnimatedScreen';
import SwipeableRow from '../components/SwipeableRow';
import { searchStations, getAllStations } from '../services/stationsService';
import { getRegionName } from '../utils/regionLabels';
import { getNearbyStations, formatDistance } from '../utils/locationUtils';
import { getRecentStations, saveRecentStation, removeRecentStation } from '../services/recentStationsService';

const { width } = Dimensions.get('window');

export default function CercaStazioneScreen() {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [showStationModal, setShowStationModal] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [selectedTab, setSelectedTab] = useState('partenze');
  const scrollY = useRef(new Animated.Value(0)).current;
  const horizontalScrollRef = useRef(null);
  const pagesScrollY = useRef(new Animated.Value(0)).current;
  
  // Stati per location e stazioni
  const [locationPermission, setLocationPermission] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [recentStations, setRecentStations] = useState([]);
  const [nearbyStations, setNearbyStations] = useState([]);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Richiedi i permessi per la posizione e carica i dati all'avvio
  useEffect(() => {
    requestLocationPermission();
    loadRecentStations();
  }, []);

  // Richiedi i permessi per la posizione
  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');
      
      if (status === 'granted') {
        getUserLocation();
      }
    } catch (error) {
      console.error('Errore nel richiedere i permessi per la posizione:', error);
      setLocationPermission(false);
    }
  };

  // Ottieni la posizione dell'utente
  const getUserLocation = async () => {
    try {
      setLoadingLocation(true);
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
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
      setNearbyStations(nearby);
    } catch (error) {
      console.error('Errore nel recuperare la posizione:', error);
    } finally {
      setLoadingLocation(false);
    }
  };

  // Carica le stazioni recenti
  const loadRecentStations = async () => {
    const recent = await getRecentStations(5);
    setRecentStations(recent);
  };

  // Rimuovi una stazione recente
  const handleDeleteRecentStation = async (stationId) => {
    await removeRecentStation(stationId);
    await loadRecentStations();
  };

  const handleSearch = (text) => {
    setSearchQuery(text);
    if (text.trim().length >= 2) {
      const results = searchStations(text, 15);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const handleSelectStation = async (station) => {
    // Salva la stazione nelle recenti
    await saveRecentStation(station);
    await loadRecentStations();
    
    setSelectedStation(station);
    setSearchQuery('');
    setSearchResults([]);
    setShowStationModal(true);
    Keyboard.dismiss();
  };

  const closeStationModal = () => {
    setShowStationModal(false);
    setSelectedStation(null);
  };

  const openInMaps = () => {
    if (!selectedStation || !selectedStation.lat || !selectedStation.lon) return;
    
    const url = `http://maps.apple.com/?q=${encodeURIComponent(selectedStation.name)}&ll=${selectedStation.lat},${selectedStation.lon}`;
    Linking.openURL(url);
  };

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    const pageIndex = tab === 'partenze' ? 0 : 1;
    horizontalScrollRef.current?.scrollTo({ x: pageIndex * screenWidth, animated: true });
  };

  const handleScroll = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / screenWidth);
    const newTab = pageIndex === 0 ? 'partenze' : 'arrivi';
    if (newTab !== selectedTab) {
      setSelectedTab(newTab);
    }
  };

  const handlePageScroll = (event) => {
    pagesScrollY.setValue(event.nativeEvent.contentOffset.y);
  };

  // Mock data per partenze e arrivi
  const mockDepartures = [
    { id: '1', trainType: 'FR AV', trainNumber: '9524', destination: 'MILANO CENTRALE', time: '10:05', delay: 0, platform: '8', platformConfirmed: true },
    { id: '2', trainType: 'REG', trainNumber: '18634', destination: 'ROMA TERMINI', time: '10:15', delay: 5, platform: '12', platformConfirmed: true },
    { id: '3', trainType: 'IC', trainNumber: '2357', destination: 'VENEZIA S.LUCIA', time: '10:30', delay: 0, platform: '4', platformConfirmed: false },
    { id: '4', trainType: 'FR AV', trainNumber: '9526', destination: 'TORINO PORTA NUOVA', time: '10:45', delay: 2, platform: '3', platformConfirmed: true },
    { id: '5', trainType: 'REG', trainNumber: '18636', destination: 'NAPOLI CENTRALE', time: '11:00', delay: 0, platform: '9', platformConfirmed: true },
    { id: '6', trainType: 'IC', trainNumber: '2359', destination: 'VERONA PORTA NUOVA', time: '11:15', delay: -1, platform: '6', platformConfirmed: true },
    { id: '7', trainType: 'FR AV', trainNumber: '9528', destination: 'BOLOGNA CENTRALE', time: '11:30', delay: 12, platform: '10', platformConfirmed: true },
    { id: '8', trainType: 'FB', trainNumber: '18638', destination: 'FIRENZE S.M.N.', time: '11:45', delay: 0, platform: '5', platformConfirmed: false },
  ];

  const mockArrivals = [
    { id: '1', trainType: 'FR AV', trainNumber: '9523', origin: 'MILANO CENTRALE', time: '09:55', delay: 3, platform: '7', platformConfirmed: true },
    { id: '2', trainType: 'REG', trainNumber: '18633', origin: 'ROMA TERMINI', time: '10:10', delay: 0, platform: '11', platformConfirmed: true },
    { id: '3', trainType: 'IC', trainNumber: '2356', origin: 'VENEZIA S.LUCIA', time: '10:20', delay: 8, platform: '5', platformConfirmed: false },
    { id: '4', trainType: 'FR AV', trainNumber: '9525', origin: 'TORINO PORTA NUOVA', time: '10:35', delay: 0, platform: '2', platformConfirmed: true },
    { id: '5', trainType: 'REG', trainNumber: '18635', origin: 'NAPOLI CENTRALE', time: '10:50', delay: 4, platform: '8', platformConfirmed: true },
    { id: '6', trainType: 'IC', trainNumber: '2358', origin: 'VERONA PORTA NUOVA', time: '11:05', delay: -2, platform: '4', platformConfirmed: true },
    { id: '7', trainType: 'FR AV', trainNumber: '9527', origin: 'BOLOGNA CENTRALE', time: '11:20', delay: 0, platform: '9', platformConfirmed: true },
    { id: '8', trainNumber: '18637', origin: 'FIRENZE S.M.N.', time: '11:35', delay: 15, platform: '6' },
  ];

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedStation(null);
    setShowMap(false);
  };

  const renderStationItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.resultItem,
        {
          backgroundColor: theme.colors.card,
          borderBottomColor: theme.colors.border,
        },
      ]}
      onPress={() => handleSelectStation(item)}
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

  const screenWidth = Dimensions.get('window').width;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AnimatedScreen>
        <View style={styles.content}>
          {/* Search Bar */}
          <View style={styles.searchSection}>
            <View
              style={[
                styles.searchBar,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: theme.isDark ? 0 : 1 },
                  shadowOpacity: theme.isDark ? 0 : 0.03,
                  shadowRadius: theme.isDark ? 0 : 2,
                  elevation: theme.isDark ? 0 : 1,
                },
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
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={clearSearch} activeOpacity={0.6}>
                  <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <View
              style={[
                styles.resultsContainer,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: theme.isDark ? 0 : 2 },
                  shadowOpacity: theme.isDark ? 0 : 0.05,
                  shadowRadius: theme.isDark ? 0 : 4,
                  elevation: theme.isDark ? 0 : 2,
                },
              ]}
            >
              <FlatList
                data={searchResults}
                renderItem={renderStationItem}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              />
            </View>
          )}

          {/* Empty State */}
          {searchQuery.length === 0 && searchResults.length === 0 && (
            <ScrollView 
              style={styles.quickAccessContainer}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.quickAccessContent}
              scrollEnabled={scrollEnabled}
            >
              {/* Stazioni Recenti */}
              {recentStations.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionHeader, { color: theme.colors.textSecondary }]}>
                    STAZIONI RECENTI
                  </Text>
                  <View style={[
                    styles.listGroup,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.border,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: theme.isDark ? 0 : 1 },
                      shadowOpacity: theme.isDark ? 0 : 0.03,
                      shadowRadius: theme.isDark ? 0 : 2,
                      elevation: theme.isDark ? 0 : 1,
                    },
                  ]}>
                    {recentStations.map((station, index) => (
                      <View key={station.id}>
                        <SwipeableRow 
                          theme={theme}
                          onDelete={() => handleDeleteRecentStation(station.id)}
                          onSwipeStart={() => setScrollEnabled(false)}
                          onSwipeEnd={() => setScrollEnabled(true)}
                        >
                          <TouchableOpacity
                            style={styles.listItem}
                            onPress={() => handleSelectStation(station)}
                            activeOpacity={0.6}
                          >
                            <View style={styles.listItemContent}>
                              <Ionicons name="location-outline" size={20} color={theme.colors.text} style={{ marginRight: 12 }} />
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
              )}

              {/* Stazioni Vicine */}
              {locationPermission === true && (
                <View style={styles.section}>
                  <Text style={[styles.sectionHeader, { color: theme.colors.textSecondary }]}>
                    STAZIONI VICINE
                  </Text>
                  {loadingLocation ? (
                    <View style={[
                      styles.listGroup,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: theme.isDark ? 0 : 1 },
                        shadowOpacity: theme.isDark ? 0 : 0.03,
                        shadowRadius: theme.isDark ? 0 : 2,
                        elevation: theme.isDark ? 0 : 1,
                      },
                    ]}>
                      <View style={styles.listItemLoading}>
                        <ActivityIndicator size="small" color={"#3b79ff"} />
                        <Text style={[styles.listItemLoadingText, { color: theme.colors.textSecondary }]}>
                          Ricerca in corso...
                        </Text>
                      </View>
                    </View>
                  ) : nearbyStations.length > 0 ? (
                    <View style={[
                      styles.listGroup,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: theme.isDark ? 0 : 1 },
                        shadowOpacity: theme.isDark ? 0 : 0.03,
                        shadowRadius: theme.isDark ? 0 : 2,
                        elevation: theme.isDark ? 0 : 1,
                      },
                    ]}>
                      {nearbyStations.map((station, index) => (
                        <View key={station.id}>
                          <TouchableOpacity
                            style={styles.listItem}
                            onPress={() => handleSelectStation(station)}
                            activeOpacity={0.6}
                          >
                            <View style={styles.listItemContent}>
                              <Ionicons name="location-outline" size={20} color={theme.colors.text} style={{ marginRight: 12 }} />
                              <View style={styles.listItemText}>
                                <Text style={[styles.listItemTitle, { color: theme.colors.text }]} numberOfLines={1}>
                                  {station.name}
                                </Text>
                                <Text style={[styles.listItemSubtitle, { color: theme.colors.textSecondary }]}>
                                  {station.city ? `${station.city}, ${getRegionName(station.region)}` : getRegionName(station.region)} <Text style={{ color: "#3b79ff" }}>• {formatDistance(station.distance)}</Text>
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
                    <View style={[
                      styles.listGroup,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: theme.isDark ? 0 : 1 },
                        shadowOpacity: theme.isDark ? 0 : 0.03,
                        shadowRadius: theme.isDark ? 0 : 2,
                        elevation: theme.isDark ? 0 : 1,
                      },
                    ]}>
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
                  <Text style={[styles.sectionHeader, { color: theme.colors.textSecondary }]}>
                    STAZIONI VICINE
                  </Text>
                  <View style={[
                    styles.listGroup,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.border,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: theme.isDark ? 0 : 1 },
                      shadowOpacity: theme.isDark ? 0 : 0.03,
                      shadowRadius: theme.isDark ? 0 : 2,
                      elevation: theme.isDark ? 0 : 1,
                    },
                  ]}>
                    <TouchableOpacity
                      style={styles.listItem}
                      onPress={requestLocationPermission}
                      activeOpacity={0.6}
                    >
                      <View style={styles.listItemContent}>
                        <View style={styles.listItemIcon}>
                          <Ionicons name="location" size={22} color={"#3b79ff"} />
                        </View>
                        <View style={styles.listItemText}>
                          <Text style={[styles.listItemTitle, { color: "#3b79ff" }]}>
                            Attiva Servizi di Localizzazione
                          </Text>
                          <Text style={[styles.listItemSubtitle, { color: theme.colors.textSecondary }]}>
                            Per vedere le stazioni nelle vicinanze
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} style={{ opacity: 0.3 }} />
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Empty state solo se ci sono recenti ma non si sta cercando */}
              {recentStations.length === 0 && locationPermission !== false && (
                <View style={styles.emptyState}>
                  <Ionicons name="location-outline" size={64} color={theme.colors.textSecondary} style={{ opacity: 0.3 }} />
                  <Text style={[styles.emptyStateTitle, { color: theme.colors.text }]}>Cerca una stazione</Text>
                  <Text style={[styles.emptyStateSubtitle, { color: theme.colors.textSecondary }]}>
                    Inserisci il nome di una stazione ferroviaria per visualizzarne i dettagli
                  </Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>

        {/* Modal stazione */}
        <Modal
          visible={showStationModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={closeStationModal}
        >
          <View style={[styles.modalContainer, { backgroundColor: theme.colors.background, flex: 1 }]}>
            {/* Mappa fissa con animazione di compressione */}
            {selectedStation?.lat && selectedStation?.lon && (
              <Animated.View style={[
                styles.mapSection,
                {
                  height: pagesScrollY.interpolate({
                    inputRange: [0, 100, 150],
                    outputRange: [250, 160, 160],
                    extrapolate: 'clamp',
                  }),
                }
              ]}>
                <MapView
                  style={styles.mapFull}
                  provider={PROVIDER_DEFAULT}
                  initialRegion={{
                    latitude: selectedStation.lat,
                    longitude: selectedStation.lon,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                  pointerEvents="none"
                >
                  <Marker
                    coordinate={{
                      latitude: selectedStation.lat,
                      longitude: selectedStation.lon,
                    }}
                  />
                </MapView>
                
                {/* Header con X sopra mappa */}
                <View style={[styles.modalHeader, { backgroundColor: 'transparent' }]}>
                  <TouchableOpacity 
                    onPress={closeStationModal} 
                    style={[styles.closeButton, { backgroundColor: theme.colors.card, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 4 }]} 
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={24} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {/* Header sticky con nome e tab */}
            <View style={[
              styles.stickyHeader, 
              { backgroundColor: theme.colors.background }
            ]}>
              {/* Nome e Regione con pulsante mappe */}
              <View style={styles.stationInfoSection}>
                <View style={styles.stationNameRow}>
                  <View style={styles.stationTextContainer}>
                    <Text style={[styles.stationName, { color: theme.colors.text }]}>
                      {selectedStation?.name}
                    </Text>
                    {(selectedStation?.city || selectedStation?.region) && (
                      <Text style={[styles.regionLabel, { color: theme.colors.textSecondary }]}>
                        {selectedStation?.city ? `${selectedStation.city}, ${getRegionName(selectedStation.region)}` : getRegionName(selectedStation.region)}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity 
                    style={[styles.navigateButtonInline, { backgroundColor: "#3b79ff" }]}
                    onPress={openInMaps}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="navigate" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Slider delle sezioni */}
              <View style={styles.sectionSlider}>
                <View style={[styles.sliderContainer, { backgroundColor: theme.colors.border }]}>
                  <TouchableOpacity
                    style={[
                      styles.sliderButton,
                      selectedTab === 'partenze' && [styles.sliderButtonActive, { backgroundColor: "#3b79ff" }]
                    ]}
                    onPress={() => handleTabChange('partenze')}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      styles.sliderButtonText,
                      { color: selectedTab === 'partenze' ? '#FFFFFF' : theme.colors.textSecondary }
                    ]}>
                      Partenze
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.sliderButton,
                      selectedTab === 'arrivi' && [styles.sliderButtonActive, { backgroundColor: "#3b79ff" }]
                    ]}
                    onPress={() => handleTabChange('arrivi')}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      styles.sliderButtonText,
                      { color: selectedTab === 'arrivi' ? '#FFFFFF' : theme.colors.textSecondary }
                    ]}>
                      Arrivi
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <Animated.View style={{
              flex: 1,
              marginTop: pagesScrollY.interpolate({
                inputRange: [0, 100],
                outputRange: [0, -90],
                extrapolate: 'clamp',
              }),
              paddingTop: pagesScrollY.interpolate({
                inputRange: [0, 100],
                outputRange: [0, 100],
                extrapolate: 'clamp',
              })
            }}>
            <ScrollView
              ref={horizontalScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={1}
              decelerationRate="fast"
              onScroll={handleScroll}
              style={styles.horizontalScroll}
            >
              {/* Sezione Partenze */}
              <View style={[styles.pageContainer, { width: screenWidth }]}>
                <ScrollView 
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[styles.pageContent, { flexGrow: 1 }]}
                  style={{ flex: 1 }}
                  onScroll={handlePageScroll}
                  scrollEventThrottle={16}
                >
                <View style={styles.section}>
                <View style={[
                  styles.trainsContainer,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: theme.isDark ? 0 : 1 },
                    shadowOpacity: theme.isDark ? 0 : 0.03,
                    shadowRadius: theme.isDark ? 0 : 2,
                    elevation: theme.isDark ? 0 : 1,
                  },
                ]}>
                  {mockDepartures.map((train, index) => (
                    <React.Fragment key={train.id}>
                      <TouchableOpacity style={styles.trainItem} activeOpacity={0.6}>
                        <View style={styles.trainHeader}>
                          <View style={styles.trainLeftSection}>
                            <View style={styles.trainTypeAndNumber}>
                              <Text style={[styles.trainType, { color: theme.colors.textSecondary }]}>
                                {train.trainType}
                              </Text>
                              <Text style={[styles.trainNumber, { color: theme.colors.text }]}>
                                {train.trainNumber}
                              </Text>
                            </View>
                            <Text style={[styles.trainTime, { color: theme.colors.text }]}>
                              {train.time}
                            </Text>
                          </View>
                          <View style={styles.trainRightSection}>
                            {train.delay > 0 ? (
                              <View style={[styles.delayPill, { backgroundColor: '#FF3B30' + '20', borderColor: '#FF3B30' }]}>
                                <Text style={[styles.delayPillText, { color: '#FF3B30' }]}>+{train.delay} min</Text>
                              </View>
                            ) : train.delay < 0 ? (
                              <View style={[styles.delayPill, { backgroundColor: '#007AFF' + '20', borderColor: '#007AFF' }]}>
                                <Text style={[styles.delayPillText, { color: '#007AFF' }]}>{train.delay} min</Text>
                              </View>
                            ) : (
                              <View style={[styles.delayPill, { backgroundColor: '#34C759' + '20', borderColor: '#34C759' }]}>
                                <Text style={[styles.delayPillText, { color: '#34C759' }]}>in orario</Text>
                              </View>
                            )}
                            <View style={[styles.platformPill, { 
                              backgroundColor: train.platformConfirmed ? "#3b79ff" + '20' : theme.colors.border + '40',
                              borderColor: train.platformConfirmed ? "#3b79ff" : theme.colors.border,
                              borderWidth: 1
                            }]}>
                              <Text style={[styles.platformText, { color: train.platformConfirmed ? "#3b79ff" : theme.colors.textSecondary }]}>
                                {train.platform}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <Text style={[styles.trainDestination, { color: theme.colors.text }]} numberOfLines={1}>
                          per {train.destination}
                        </Text>
                      </TouchableOpacity>
                      {index < mockDepartures.length - 1 && (
                        <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
                      )}
                    </React.Fragment>
                  ))}
                </View>
              </View>
                </ScrollView>
              </View>

              {/* Sezione Arrivi */}
              <View style={[styles.pageContainer, { width: screenWidth }]}>
                <ScrollView 
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[styles.pageContent, { flexGrow: 1 }]}
                  style={{ flex: 1 }}
                  onScroll={handlePageScroll}
                  scrollEventThrottle={16}
                >
              <View style={styles.section}>
                <View style={[
                  styles.trainsContainer,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: theme.isDark ? 0 : 1 },
                    shadowOpacity: theme.isDark ? 0 : 0.03,
                    shadowRadius: theme.isDark ? 0 : 2,
                    elevation: theme.isDark ? 0 : 1,
                  },
                ]}>
                  {mockArrivals.map((train, index) => (
                    <React.Fragment key={train.id}>
                      <TouchableOpacity style={styles.trainItem} activeOpacity={0.6}>
                        <View style={styles.trainHeader}>
                          <View style={styles.trainLeftSection}>
                            <View style={styles.trainTypeAndNumber}>
                              <Text style={[styles.trainType, { color: theme.colors.textSecondary }]}>
                                {train.trainType}
                              </Text>
                              <Text style={[styles.trainNumber, { color: theme.colors.text }]}>
                                {train.trainNumber}
                              </Text>
                            </View>
                            <Text style={[styles.trainTime, { color: theme.colors.text }]}>
                              {train.time}
                            </Text>
                          </View>
                          <View style={styles.trainRightSection}>
                            {train.delay > 0 ? (
                              <View style={[styles.delayPill, { backgroundColor: '#FF3B30' + '20', borderColor: '#FF3B30' }]}>
                                <Text style={[styles.delayPillText, { color: '#FF3B30' }]}>+{train.delay} min</Text>
                              </View>
                            ) : train.delay < 0 ? (
                              <View style={[styles.delayPill, { backgroundColor: '#007AFF' + '20', borderColor: '#007AFF' }]}>
                                <Text style={[styles.delayPillText, { color: '#007AFF' }]}>{train.delay} min</Text>
                              </View>
                            ) : (
                              <View style={[styles.delayPill, { backgroundColor: '#34C759' + '20', borderColor: '#34C759' }]}>
                                <Text style={[styles.delayPillText, { color: '#34C759' }]}>in orario</Text>
                              </View>
                            )}
                            <View style={[styles.platformPill, { 
                              backgroundColor: train.platformConfirmed ? "#3b79ff" + '20' : theme.colors.border + '40',
                              borderColor: train.platformConfirmed ? "#3b79ff" : theme.colors.border,
                              borderWidth: 1
                            }]}>
                              <Text style={[styles.platformText, { color: train.platformConfirmed ? "#3b79ff" : theme.colors.textSecondary }]}>
                                {train.platform}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <Text style={[styles.trainDestination, { color: theme.colors.text }]} numberOfLines={1}>
                          da {train.origin}
                        </Text>
                      </TouchableOpacity>
                      {index < mockArrivals.length - 1 && (
                        <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
                      )}
                    </React.Fragment>
                  ))}
                </View>
              </View>
                </ScrollView>
              </View>
            </ScrollView>
            </Animated.View>
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
  content: {
    flex: 1,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'TikTokSans-Regular',
  },
  resultsContainer: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 400,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  resultTextContainer: {
    flex: 1,
  },
  resultName: {
    fontSize: 16,
    fontFamily: 'TikTokSans-Medium',
  },
  resultRegion: {
    fontSize: 13,
    fontFamily: 'TikTokSans-Regular',
    marginTop: 2,
  },
  selectedStationCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectedStationHeader: {
    marginBottom: 4,
  },
  selectedStationName: {
    fontSize: 22,
    fontFamily: 'TikTokSans-SemiBold',
  },
  detailLabel: {
    fontSize: 15,
    fontFamily: 'TikTokSans-Regular',
  },
  mapToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  mapToggleText: {
    fontSize: 15,
    fontFamily: 'TikTokSans-Medium',
  },
  mapContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    height: 180,
    marginTop: 12,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  mapOverlayText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'TikTokSans-SemiBold',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontFamily: 'TikTokSans-SemiBold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 15,
    fontFamily: 'TikTokSans-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  mapSection: {
    height: 180,
    position: 'relative',
  },
  mapFull: {
    width: '100%',
    height: '100%',
  },
  modalHeader: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    flex: 1,
  },
  stickyHeader: {
    borderBottomWidth: 0.5,
    borderBottomColor: 'transparent',
  },
  scrollContentContainer: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  stationInfoSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
  },
  stationNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stationTextContainer: {
    flex: 1,
  },
  stationName: {
    fontSize: 24,
    fontFamily: 'TikTokSans-SemiBold',
    marginBottom: 4,
  },
  regionLabel: {
    fontSize: 15,
    fontFamily: 'TikTokSans-Regular',
  },
  navigateButtonInline: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionSlider: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  sliderContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    backgroundColor: '#F2F2F7',
  },
  sliderButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 9,
    alignItems: 'center',
  },
  sliderButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sliderButtonText: {
    fontSize: 15,
    fontFamily: 'TikTokSans-Medium',
  },
  horizontalScroll: {
    flex: 1,
  },
  pageContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  pageContent: {
    paddingTop: 24,
  },
  sectionIndicator: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  indicatorContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: 'TikTokSans-SemiBold',
  },
  horizontalScroll: {
    flex: 1,
  },
  pageContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  tabSelector: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    borderWidth: 0,
  },
  tabButtonText: {
    fontSize: 16,
    fontFamily: 'TikTokSans-SemiBold',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  trainsContainer: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  trainItem: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  trainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  trainLeftSection: {
    flex: 1,
  },
  trainTypeAndNumber: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 2,
  },
  trainType: {
    fontSize: 13,
    fontFamily: 'TikTokSans-Medium',
  },
  trainNumber: {
    fontSize: 16,
    fontFamily: 'TikTokSans-SemiBold',
  },
  trainTime: {
    fontSize: 14,
    fontFamily: 'TikTokSans-Regular',
  },
  trainRightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  delayTextNew: {
    fontSize: 13,
    fontFamily: 'TikTokSans-Medium',
  },
  delayPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  delayPillText: {
    fontSize: 12,
    fontFamily: 'TikTokSans-Bold',
  },
  platformPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    minWidth: 28,
    alignItems: 'center',
  },
  platformText: {
    fontSize: 12,
    fontFamily: 'TikTokSans-Bold',
  },
  trainNumberBadge: {
    backgroundColor: '#4085fd',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  trainNumber: {
    fontSize: 14,
    fontFamily: 'TikTokSans-Bold',
  },
  trainTime: {
    fontSize: 18,
    fontFamily: 'TikTokSans-SemiBold',
    flex: 1,
  },
  delayBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  delayText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'TikTokSans-Bold',
  },
  onTimeBadge: {
    paddingHorizontal: 4,
  },
  onTimeText: {
    color: '#34C759',
    fontSize: 16,
  },
  trainDestination: {
    fontSize: 15,
    fontFamily: 'TikTokSans-Regular',
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
    fontSize: 13,
    fontFamily: 'TikTokSans-Regular',
  },
  separator: {
    height: 0.5,
    marginLeft: 16,
  },
  // Quick access styles (iOS grouped list style)
  quickAccessContainer: {
    flex: 1,
  },
  quickAccessContent: {
    paddingTop: 20,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    fontSize: 13,
    fontFamily: 'TikTokSans-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  listGroup: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
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
  listItemTitle: {
    fontSize: 17,
    fontFamily: 'TikTokSans-Regular',
    marginBottom: 2,
  },
  listItemSubtitle: {
    fontSize: 15,
    fontFamily: 'TikTokSans-Regular',
  },
  listDivider: {
    height: 0.5,
    marginLeft: 48,
  },
  listItemLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 20,
  },
  listItemLoadingText: {
    fontSize: 15,
    fontFamily: 'TikTokSans-Regular',
  },
  listItemEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  listItemEmptyText: {
    fontSize: 15,
    fontFamily: 'TikTokSans-Regular',
  },
});
