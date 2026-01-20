import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import AnimatedScreen from '../components/AnimatedScreen';
import AccentSwitch from '../components/AccentSwitch';
import Card from '../components/Card';
import ListRow from '../components/ListRow';
import { BORDER, INSETS, RADIUS, SPACING, SPACE, TYPE } from '../utils/uiTokens';
import { requestNotificationPermissionIfNeeded } from '../services/notificationsService';
import {
  getLiveActivitiesEnabled as getLiveActivitiesEnabledSetting,
  getNotificationsEnabled as getNotificationsEnabledSetting,
  setLiveActivitiesEnabled as setLiveActivitiesEnabledSetting,
  setNotificationsEnabled as setNotificationsEnabledSetting,
} from '../services/settingsService';
import { cancelAllTrackingSchedules, clearAllTrackedTrains, getTrackedTrains } from '../services/trainTrackingService';
import { ensureTrainTrackingTaskRegistered, runTrainTrackingNow, unregisterTrainTrackingTask } from '../services/trainTrackingTask';

export default function PreferitiScreen() {
  const { theme, changeTheme, themeMode } = useTheme();
  const isFocused = useIsFocused();
  const [notificationsEnabled, setNotificationsEnabledState] = React.useState(false);
  const [liveActivitiesEnabled, setLiveActivitiesEnabledState] = React.useState(false);
  const [locationEnabled, setLocationEnabled] = React.useState(false);
  const [defaultScreen, setDefaultScreen] = React.useState('orari');
  const [trackedTrainsCount, setTrackedTrainsCount] = React.useState(0);

  React.useEffect(() => {
    checkLocationPermission();
    loadDefaultScreen();
    loadSettings();
    loadTrackedTrainsCount();
  }, []);

  React.useEffect(() => {
    if (!isFocused) return;
    loadSettings();
    loadTrackedTrainsCount();
    checkLocationPermission();
  }, [isFocused]);

  const normalizeDefaultScreenId = (value) => {
    const id = String(value || '').trim();
    if (id === 'train' || id === 'station' || id === 'orari') return id;
    // Migrazione: id legacy usato in versioni precedenti.
    if (id === 'solutions') return 'orari';
    return 'orari';
  };

  const loadDefaultScreen = async () => {
    try {
      const stored = await AsyncStorage.getItem('defaultScreen');
      const normalized = normalizeDefaultScreenId(stored);
      setDefaultScreen(normalized);
      if (stored && stored !== normalized) {
        await AsyncStorage.setItem('defaultScreen', normalized);
      }
    } catch (error) {
      console.warn('Error loading default screen:', error);
    }
  };

  const loadSettings = async () => {
    const [n, l] = await Promise.all([getNotificationsEnabledSetting(), getLiveActivitiesEnabledSetting()]);
    setNotificationsEnabledState(Boolean(n));
    setLiveActivitiesEnabledState(Boolean(l));
  };

  const loadTrackedTrainsCount = async () => {
    const tracked = await getTrackedTrains();
    setTrackedTrainsCount(Array.isArray(tracked) ? tracked.length : 0);
  };

  const checkLocationPermission = async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    setLocationEnabled(status === 'granted');
  };

  const handleLocationToggle = async (value) => {
    if (value) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationEnabled(status === 'granted');
      if (status !== 'granted') {
        Alert.alert(
          'Permesso negato',
          'Per mostrare le stazioni vicine è necessario abilitare la localizzazione nelle impostazioni del dispositivo.',
          [{ text: 'OK' }]
        );
      }
    } else {
      Alert.alert(
        'Disabilita localizzazione',
        'Per disabilitare la localizzazione, vai nelle impostazioni del dispositivo.',
        [{ text: 'OK' }]
      );
    }
  };

  const themeOptions = [
    { id: 'light', label: 'Chiaro', icon: 'sunny-outline' },
    { id: 'dark', label: 'Scuro', icon: 'moon-outline' },
    { id: 'auto', label: 'Automatico', icon: 'phone-portrait-outline' },
  ];

  const screenOptions = [
    { id: 'train', label: 'Treno', icon: 'train-outline' },
    { id: 'station', label: 'Stazione', icon: 'location-outline' },
    { id: 'orari', label: 'Orari', icon: 'time-outline' },
  ];

  const handleDefaultScreenChange = async (id) => {
    setDefaultScreen(id);
    try {
      await AsyncStorage.setItem('defaultScreen', id);
    } catch (error) {
      console.warn('Error saving default screen:', error);
    }
  };

  const handleNotificationsToggle = async (value) => {
    const next = Boolean(value);

    if (!next) {
      setNotificationsEnabledState(false);
      await setNotificationsEnabledSetting(false);
      await cancelAllTrackingSchedules();
      await unregisterTrainTrackingTask();
      return;
    }

    const perm = await requestNotificationPermissionIfNeeded();
    if (!perm.granted) {
      setNotificationsEnabledState(false);
      await setNotificationsEnabledSetting(false);
      Alert.alert(
        'Permesso notifiche negato',
        'Abilita le notifiche dalle impostazioni di sistema per ricevere gli avvisi di tracciamento.',
        [{ text: 'OK' }]
      );
      return;
    }

    setNotificationsEnabledState(true);
    await setNotificationsEnabledSetting(true);

    const tracked = await getTrackedTrains();
    if (Array.isArray(tracked) && tracked.length > 0) {
      await ensureTrainTrackingTaskRegistered();
      await runTrainTrackingNow();
    }
  };

  const handleLiveActivitiesToggle = async (value) => {
    const next = Boolean(value);
    if (!next) {
      setLiveActivitiesEnabledState(false);
      await setLiveActivitiesEnabledSetting(false);
      return;
    }

    if (Platform.OS !== 'ios') {
      Alert.alert('Non supportato', 'Live Activities è disponibile solo su iPhone (iOS 16+).', [{ text: 'OK' }]);
      setLiveActivitiesEnabledState(false);
      await setLiveActivitiesEnabledSetting(false);
      return;
    }

    setLiveActivitiesEnabledState(true);
    await setLiveActivitiesEnabledSetting(true);
    Alert.alert(
      'Live Activities',
      'In Treninfo verranno abilitate solo con una build nativa (EAS/Development Build). Su Expo Go potrebbe non funzionare.',
      [{ text: 'OK' }]
    );
  };

  const handleClearTrackedTrains = async () => {
    const tracked = await getTrackedTrains();
    const count = Array.isArray(tracked) ? tracked.length : 0;
    if (count === 0) return;

    Alert.alert('Treni seguiti', `Vuoi smettere di seguire ${count === 1 ? 'il treno' : `tutti i ${count} treni`}?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Smetti di seguire',
        style: 'destructive',
        onPress: async () => {
          await cancelAllTrackingSchedules();
          await clearAllTrackedTrains();
          await unregisterTrainTrackingTask();
          await loadTrackedTrainsCount();
        },
      },
    ]);
  };

  const handleOpenLink = (url) => {
    Linking.openURL(url);
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AnimatedScreen>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: SPACE.xl }}
        >
          
          {/* Sezione Tema */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>TEMA</Text>
            <Card style={styles.optionsContainer}>
              {themeOptions.map((option, index) => (
                <React.Fragment key={option.id}>
                  <ListRow
                    icon={option.icon}
                    title={option.label}
                    onPress={() => changeTheme(option.id)}
                    right={themeMode === option.id ? <Ionicons name="checkmark" size={20} color={theme.colors.primary} /> : null}
                  />
                  {index < themeOptions.length - 1 && (
                    <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
                  )}
                </React.Fragment>
              ))}
            </Card>
          </View>

          {/* Sezione Schermata Iniziale */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>SCHERMATA INIZIALE</Text>
            <Card style={styles.optionsContainer}>
              {screenOptions.map((option, index) => (
                <React.Fragment key={option.id}>
                  <ListRow
                    icon={option.icon}
                    title={option.label}
                    onPress={() => handleDefaultScreenChange(option.id)}
                    right={
                      defaultScreen === option.id ? <Ionicons name="checkmark" size={20} color={theme.colors.primary} /> : null
                    }
                  />
                  {index < screenOptions.length - 1 && (
                    <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
                  )}
                </React.Fragment>
              ))}
            </Card>
          </View>

          {/* Sezione Notifiche */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>NOTIFICHE</Text>
            <Card style={styles.optionsContainer}>
              <ListRow
                icon="notifications-outline"
                title="Notifiche"
                right={<AccentSwitch value={notificationsEnabled} onValueChange={handleNotificationsToggle} />}
              />
              
              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
              
              <ListRow
                icon="radio-outline"
                title="Live Activities"
                right={<AccentSwitch value={liveActivitiesEnabled} onValueChange={handleLiveActivitiesToggle} />}
              />

              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />

              <ListRow
                icon="train-outline"
                title="Treni seguiti"
                onPress={handleClearTrackedTrains}
                right={<Text style={[styles.optionHint, { color: theme.colors.textSecondary }]}>{trackedTrainsCount}</Text>}
                showChevron
              />
            </Card>
            <Text style={[styles.sectionDescription, { color: theme.colors.textSecondary }]}>
              Ricevi notifiche locali sui ritardi e cambiamenti dei tuoi treni. Live Activities ti mostra i dettagli in tempo reale nella Dynamic Island e nella schermata di blocco.
            </Text>
          </View>

          {/* Sezione Localizzazione */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>LOCALIZZAZIONE</Text>
            <Card style={styles.optionsContainer}>
              <ListRow
                icon="location-outline"
                title="Posizione"
                right={<AccentSwitch value={locationEnabled} onValueChange={handleLocationToggle} />}
              />
            </Card>
            <Text style={[styles.sectionDescription, { color: theme.colors.textSecondary }]}>
              Consenti l'accesso alla posizione per visualizzare le stazioni più vicine a te nella schermata di ricerca.
            </Text>
          </View>

          {/* Sezione Info */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>INFORMAZIONI</Text>
            <Card style={styles.optionsContainer}>
              <ListRow
                icon="logo-github"
                title="Repository GitHub"
                onPress={() => handleOpenLink('https://github.com/cristianceni5/treninfo')}
                right={<Ionicons name="open-outline" size={18} color={theme.colors.textSecondary} />}
              />
              
              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
              
              <ListRow
                icon="mail-outline"
                title="Contatti"
                onPress={() => handleOpenLink('mailto:cenicristian@yahoo.com')}
                right={<Ionicons name="open-outline" size={18} color={theme.colors.textSecondary} />}
              />
              
              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
              
              <ListRow
                icon="chatbubble-outline"
                title="Feedback"
                onPress={() => handleOpenLink('https://github.com/cristianceni5/treninfo/issues')}
                right={<Ionicons name="open-outline" size={18} color={theme.colors.textSecondary} />}
              />
              
              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
              
              <ListRow
                icon="shield-checkmark-outline"
                title="Privacy"
                onPress={() => handleOpenLink('https://github.com/cristianceni5/treninfo/blob/main/PRIVACY.md')}
                right={<Ionicons name="open-outline" size={18} color={theme.colors.textSecondary} />}
              />
            </Card>
          </View>

          {/* Sezione Powered By */}
          <View style={[styles.section, styles.poweredBySection]}>
            <Text style={[styles.poweredByText, { color: theme.colors.textSecondary }]}>Powered by</Text>
            <TouchableOpacity
              onPress={() => handleOpenLink('https://treninfo.netlify.app')}
              activeOpacity={0.6}
            >
              <Text style={[styles.linkText, { color: theme.colors.primary }]}>treninfo.netlify.app</Text>
            </TouchableOpacity>
            <Text style={[styles.versionText, { color: theme.colors.textSecondary }]}>Developed by Cristian Ceni · 2026</Text>
          </View>

        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: SPACING.screenTop,
    paddingHorizontal: SPACING.screenX,
  },
  sectionTitle: {
    ...TYPE.sectionLabel,
    marginBottom: SPACE.sm,
    marginLeft: SPACING.sectionX,
  },
  sectionDescription: {
    ...TYPE.caption,
    marginTop: SPACE.sm,
    marginHorizontal: SPACING.sectionX,
  },
  optionsContainer: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
  },
  singleOptionContainer: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACE.sm,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionLabel: {
    ...TYPE.body,
    marginLeft: SPACE.md,
  },
  optionHint: {
    ...TYPE.bodySemibold,
  },
  separator: {
    height: BORDER.hairline,
    marginLeft: INSETS.settingsDividerLeft,
  },
  colorGrid: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    padding: SPACE.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: SPACE.sm,
  },
  colorOption: {
    alignItems: 'center',
    width: '30%',
    marginBottom: SPACE.lg,
  },
  colorCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.sm,
  },
  colorLabel: {
    ...TYPE.caption,
  },
  poweredBySection: {
    alignItems: 'center',
    marginTop: SPACE.xxl,
    marginBottom: SPACE.xxl,
  },
  poweredByText: {
    ...TYPE.caption,
    marginBottom: SPACE.xs,
  },
  linkText: {
    ...TYPE.subheadlineMedium,
    fontFamily: TYPE.bodySemibold.fontFamily,
    marginBottom: SPACE.sm,
  },
  versionText: {
    ...TYPE.pill,
    fontFamily: TYPE.caption.fontFamily,
    marginTop: SPACE.xs,
  },
});
