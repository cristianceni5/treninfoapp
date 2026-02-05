import React from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import AnimatedScreen from '../components/AnimatedScreen';
import AccentSwitch from '../components/AccentSwitch';
import Card from '../components/Card';
import ListRow from '../components/ListRow';
import { COLOR_THEME_OPTIONS } from '../utils/appearanceOptions';
import { BORDER, INSETS, RADIUS, SPACING, SPACE, TYPE } from '../utils/uiTokens';
import useLocationPermission from '../hooks/useLocationPermission';
import { openAppSettings } from '../utils/permissions';
import { hapticImpact, hapticSelection } from '../utils/haptics';

export default function ImpostazioniScreen() {
  const { theme, changeColorTheme, colorThemeId } = useTheme();
  const isFocused = useIsFocused();
  const { granted: locationEnabled, syncStatus, requestPermission } = useLocationPermission({ autoCheck: false });
  const [defaultScreen, setDefaultScreen] = React.useState('orari');
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = React.useState(true);

  React.useEffect(() => {
    syncStatus();
    loadDefaultScreen();
    loadPreferences();
  }, []);

  React.useEffect(() => {
    if (!isFocused) return;
    syncStatus();
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

  const loadPreferences = async () => {
    try {
      const [[, notificationsValue], [, autoRefreshValue]] = await AsyncStorage.multiGet([
        'notificationsEnabled',
        'trainAutoRefresh60s',
      ]);
      setNotificationsEnabled(notificationsValue === '1');
      setAutoRefreshEnabled(autoRefreshValue == null ? true : autoRefreshValue === '1');
    } catch (error) {
      console.warn('Error loading preferences:', error);
    }
  };

  const handleLocationToggle = async (value) => {
    hapticImpact();
    if (value) {
      await requestPermission();
    } else {
      Alert.alert(
        'Disabilita localizzazione',
        'Per disabilitare la localizzazione, vai nelle impostazioni del dispositivo.',
        [
          { text: 'OK' },
          { text: 'Apri impostazioni', onPress: () => openAppSettings() },
        ]
      );
    }
  };

  const screenOptions = [
    { id: 'train', label: 'Treno', icon: 'train-outline' },
    { id: 'station', label: 'Stazione', icon: 'location-outline' },
    { id: 'orari', label: 'Orari', icon: 'time-outline' },
  ];

  const handleDefaultScreenChange = async (id) => {
    hapticSelection();
    setDefaultScreen(id);
    try {
      await AsyncStorage.setItem('defaultScreen', id);
    } catch (error) {
      console.warn('Error saving default screen:', error);
    }
  };

  const resolveAccent = (option) =>
    theme.isDark ? option.accentDark ?? option.accentLight : option.accentLight ?? option.accentDark;

  const handleNotificationsToggle = async (value) => {
    hapticImpact();
    setNotificationsEnabled(value);
    try {
      await AsyncStorage.setItem('notificationsEnabled', value ? '1' : '0');
    } catch (error) {
      console.warn('Error saving notifications preference:', error);
    }
  };

  const handleAutoRefreshToggle = async (value) => {
    hapticImpact();
    setAutoRefreshEnabled(value);
    try {
      await AsyncStorage.setItem('trainAutoRefresh60s', value ? '1' : '0');
    } catch (error) {
      console.warn('Error saving auto refresh preference:', error);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AnimatedScreen>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: SPACE.xl, paddingTop: SPACE.xl }}
        >
          
          {/* Sezione Colore Accento */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>COLORE ACCENTO</Text>
            <Card style={styles.optionsContainer}>
              {COLOR_THEME_OPTIONS.map((option, index) => {
                const selected = colorThemeId === option.id;
                const accent = resolveAccent(option);
                return (
                  <React.Fragment key={option.id}>
                    <ListRow
                      icon="ellipse"
                      iconColor={accent}
                      title={option.label}
                      onPress={() => {
                        hapticSelection();
                        changeColorTheme(option.id);
                      }}
                      right={
                        selected ? (
                          <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                        ) : null
                      }
                    />
                    {index < COLOR_THEME_OPTIONS.length - 1 && (
                      <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
                    )}
                  </React.Fragment>
                );
              })}
            </Card>
          </View>

          {/* Sezione Notifiche */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>NOTIFICHE</Text>
            <Card style={styles.optionsContainer}>
              <ListRow
                icon="notifications-outline"
                title="Notifiche"
                right={
                  <View style={styles.rowRight}>
                    <View
                      style={[
                        styles.betaBadge,
                        {
                          borderColor: theme.colors.accent,
                          backgroundColor: `${theme.colors.accent}22`,
                        },
                      ]}
                    >
                      <Text style={[styles.betaBadgeText, { color: theme.colors.accent }]}>BETA</Text>
                    </View>
                    <AccentSwitch value={notificationsEnabled} onValueChange={handleNotificationsToggle} />
                  </View>
                }
              />
            </Card>
            <Text style={[styles.sectionDescription, { color: theme.colors.textSecondary }]}>
              Attiva gli avvisi per variazioni e aggiornamenti sui treni che stai seguendo.
            </Text>
          </View>

          {/* Sezione Aggiornamento Treni */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>AGGIORNAMENTO TRENI</Text>
            <Card style={styles.optionsContainer}>
              <ListRow
                icon="refresh-outline"
                title="Aggiornamento automatico"
                right={<AccentSwitch value={autoRefreshEnabled} onValueChange={handleAutoRefreshToggle} />}
              />
            </Card>
            <Text style={[styles.sectionDescription, { color: theme.colors.textSecondary }]}>
              Aggiorna automaticamente lo stato del treno ogni 60 secondi quando il modal è aperto.
            </Text>
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
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  betaBadge: {
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
  },
  betaBadgeText: {
    ...TYPE.pill,
    letterSpacing: 0.4,
  },
  separator: {
    height: BORDER.hairline,
    marginLeft: INSETS.settingsDividerLeft,
  },
});
