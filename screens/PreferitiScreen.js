import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Linking, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTheme } from '../context/ThemeContext';
import AnimatedScreen from '../components/AnimatedScreen';

export default function PreferitiScreen() {
  const { theme, changeTheme, themeMode } = useTheme();
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(false);
  const [liveActivitiesEnabled, setLiveActivitiesEnabled] = React.useState(false);
  const [locationEnabled, setLocationEnabled] = React.useState(false);
  const [defaultScreen, setDefaultScreen] = React.useState('solutions');

  React.useEffect(() => {
    checkLocationPermission();
  }, []);

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
    { id: 'solutions', label: 'Orari', icon: 'time-outline' },
  ];

  const handleOpenLink = (url) => {
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AnimatedScreen>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          
          {/* Sezione Tema */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>TEMA</Text>
            <View style={[
              styles.optionsContainer,
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
              {themeOptions.map((option, index) => (
                <React.Fragment key={option.id}>
                  <TouchableOpacity
                    style={styles.optionItem}
                    onPress={() => changeTheme(option.id)}
                    activeOpacity={0.6}
                  >
                    <View style={styles.optionLeft}>
                      <Ionicons name={option.icon} size={20} color={theme.colors.text} />
                      <Text style={[styles.optionLabel, { color: theme.colors.text }]}>{option.label}</Text>
                    </View>
                    {themeMode === option.id && (
                      <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                    )}
                  </TouchableOpacity>
                  {index < themeOptions.length - 1 && (
                    <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>

          {/* Sezione Schermata Iniziale */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>SCHERMATA INIZIALE</Text>
            <View style={[
              styles.optionsContainer,
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
              {screenOptions.map((option, index) => (
                <React.Fragment key={option.id}>
                  <TouchableOpacity
                    style={styles.optionItem}
                    onPress={() => setDefaultScreen(option.id)}
                    activeOpacity={0.6}
                  >
                    <View style={styles.optionLeft}>
                      <Ionicons name={option.icon} size={20} color={theme.colors.text} />
                      <Text style={[styles.optionLabel, { color: theme.colors.text }]}>{option.label}</Text>
                    </View>
                    {defaultScreen === option.id && (
                      <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                    )}
                  </TouchableOpacity>
                  {index < screenOptions.length - 1 && (
                    <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>

          {/* Sezione Notifiche */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>NOTIFICHE</Text>
            <View style={[
              styles.optionsContainer,
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
              <View style={styles.optionItem}>
                <View style={styles.optionLeft}>
                  <Ionicons name="notifications-outline" size={20} color={theme.colors.text} />
                  <Text style={[styles.optionLabel, { color: theme.colors.text }]}>Notifiche push</Text>
                </View>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={theme.colors.border}
                />
              </View>
              
              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
              
              <View style={styles.optionItem}>
                <View style={styles.optionLeft}>
                  <Ionicons name="radio-outline" size={20} color={theme.colors.text} />
                  <Text style={[styles.optionLabel, { color: theme.colors.text }]}>Live Activities</Text>
                </View>
                <Switch
                  value={liveActivitiesEnabled}
                  onValueChange={setLiveActivitiesEnabled}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={theme.colors.border}
                />
              </View>
            </View>
            <Text style={[styles.sectionDescription, { color: theme.colors.textSecondary }]}>
              Ricevi notifiche push sui ritardi e cambiamenti dei tuoi treni. Live Activities ti mostra i dettagli in tempo reale nella Dynamic Island e nella schermata di blocco.
            </Text>
          </View>

          {/* Sezione Localizzazione */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>LOCALIZZAZIONE</Text>
            <View style={[
              styles.optionsContainer,
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
              <View style={styles.optionItem}>
                <View style={styles.optionLeft}>
                  <Ionicons name="location-outline" size={20} color={theme.colors.text} />
                  <Text style={[styles.optionLabel, { color: theme.colors.text }]}>Posizione</Text>
                </View>
                <Switch
                  value={locationEnabled}
                  onValueChange={handleLocationToggle}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={theme.colors.border}
                />
              </View>
            </View>
            <Text style={[styles.sectionDescription, { color: theme.colors.textSecondary }]}>
              Consenti l'accesso alla posizione per visualizzare le stazioni più vicine a te nella schermata di ricerca.
            </Text>
          </View>

          {/* Sezione Info */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>INFORMAZIONI</Text>
            <View style={[
              styles.optionsContainer,
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
                style={styles.optionItem}
                onPress={() => handleOpenLink('https://github.com/cristianceni5/treninfo')}
                activeOpacity={0.6}
              >
                <View style={styles.optionLeft}>
                  <Ionicons name="logo-github" size={20} color={theme.colors.text} />
                  <Text style={[styles.optionLabel, { color: theme.colors.text }]}>Repository GitHub</Text>
                </View>
                <Ionicons name="open-outline" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              
              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
              
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => handleOpenLink('mailto:cenicristian@yahoo.com')}
                activeOpacity={0.6}
              >
                <View style={styles.optionLeft}>
                  <Ionicons name="mail-outline" size={20} color={theme.colors.text} />
                  <Text style={[styles.optionLabel, { color: theme.colors.text }]}>Contatti</Text>
                </View>
                <Ionicons name="open-outline" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              
              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
              
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => handleOpenLink('https://github.com/cristianceni5/treninfo/issues')}
                activeOpacity={0.6}
              >
                <View style={styles.optionLeft}>
                  <Ionicons name="chatbubble-outline" size={20} color={theme.colors.text} />
                  <Text style={[styles.optionLabel, { color: theme.colors.text }]}>Feedback</Text>
                </View>
                <Ionicons name="open-outline" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              
              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
              
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => handleOpenLink('https://github.com/cristianceni5/treninfo/blob/main/PRIVACY.md')}
                activeOpacity={0.6}
              >
                <View style={styles.optionLeft}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.text} />
                  <Text style={[styles.optionLabel, { color: theme.colors.text }]}>Privacy</Text>
                </View>
                <Ionicons name="open-outline" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Sezione Powered By */}
          <View style={[styles.section, styles.poweredBySection]}>
            <Text style={[styles.poweredByText, { color: theme.colors.textSecondary }]}>Powered by</Text>
            <TouchableOpacity
              onPress={() => handleOpenLink('https://www.treninfo.netlify.app.')}
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
    marginTop: 32,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'TikTokSans-SemiBold',
    marginBottom: 8,
    marginLeft: 16,
  },
  sectionDescription: {
    fontSize: 13,
    fontFamily: 'TikTokSans-Regular',
    marginTop: 8,
    marginHorizontal: 16,
    lineHeight: 18,
  },
  optionsContainer: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  singleOptionContainer: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 16,
    fontFamily: 'TikTokSans-Regular',
    marginLeft: 12,
  },
  separator: {
    height: 0.5,
    marginLeft: 48,
  },
  colorGrid: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  colorOption: {
    alignItems: 'center',
    width: '30%',
    marginBottom: 16,
  },
  colorCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  colorLabel: {
    fontSize: 13,
    fontFamily: 'TikTokSans-Regular',
  },
  poweredBySection: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  poweredByText: {
    fontSize: 13,
    fontFamily: 'TikTokSans-Regular',
    marginBottom: 4,
  },
  linkText: {
    fontSize: 15,
    fontFamily: 'TikTokSans-SemiBold',
    marginBottom: 8,
  },
  versionText: {
    fontSize: 12,
    fontFamily: 'TikTokSans-Regular',
    marginTop: 4,
  },
});
