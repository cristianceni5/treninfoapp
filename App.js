import React, { useEffect, useState } from 'react';
import { DarkTheme as NavigationDarkTheme, DefaultTheme as NavigationDefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, useTheme } from './context/ThemeContext';
import AnimatedTabIcon from './components/AnimatedTabIcon';
import CercaTrenoScreen from './screens/CercaTrenoScreen';
import CercaStazioneScreen from './screens/CercaStazioneScreen';
import OrariScreen from './screens/OrariScreen';
import PreferitiScreen from './screens/PreferitiScreen';
import { initializeNotifications } from './services/notificationsService';
import { getNotificationsEnabled } from './services/settingsService';
import { getTrackedTrains } from './services/trainTrackingService';
import { ensureTrainTrackingTaskRegistered, unregisterTrainTrackingTask } from './services/trainTrackingTask';
import { isExpoGo } from './services/runtimeEnv';
import { FONTS } from './utils/uiTokens';
// `trainTrackingTask` definisce il task al top-level (TaskManager richiede defineTask fuori dai componenti).

if (typeof SplashScreen?.preventAutoHideAsync === 'function') {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

const Tab = createBottomTabNavigator();

function resolveInitialRouteName(defaultScreenId) {
  const id = String(defaultScreenId || '').trim();
  if (id === 'train') return 'CercaTreno';
  if (id === 'station') return 'CercaStazione';
  if (id === 'orari' || id === 'solutions') return 'Orari';
  return 'Orari';
}

function MainApp({ initialRouteName }) {
  const { theme, isDark } = useTheme();

  const navigationTheme = React.useMemo(() => {
    const base = isDark ? NavigationDarkTheme : NavigationDefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.accent,
        background: theme.colors.background,
        card: theme.colors.card,
        text: theme.colors.text,
        border: theme.colors.border,
      },
    };
  }, [isDark, theme.colors.accent, theme.colors.background, theme.colors.border, theme.colors.card, theme.colors.text]);

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <NavigationContainer theme={navigationTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Tab.Navigator
          initialRouteName={initialRouteName}
          screenOptions={({ route }) => ({
            tabBarIcon: ({ focused, color, size }) => {
              let iconName;

              if (route.name === 'CercaTreno') {
                iconName = 'train-outline';
              } else if (route.name === 'CercaStazione') {
                iconName = 'location-outline';
              } else if (route.name === 'Orari') {
                iconName = 'time-outline';
              } else if (route.name === 'Preferiti') {
                iconName = 'settings-outline';
              }

              return <AnimatedTabIcon name={iconName} size={size} color={color} focused={focused} />;
            },
            tabBarActiveTintColor: theme.colors.primary,
            tabBarInactiveTintColor: theme.colors.textSecondary,
            headerShown: false,
            sceneContainerStyle: { backgroundColor: theme.colors.background },
            tabBarStyle: {
              backgroundColor: theme.colors.card,
              borderTopColor: theme.colors.border,
              borderTopWidth: 1,
              shadowOpacity: 0,
              shadowRadius: 0,
              elevation: 0,
            },
            tabBarLabelStyle: {
              fontFamily: FONTS.medium,
            },
          })}
	        >
	          <Tab.Screen
	            name="Orari"
	            component={OrariScreen}
	            options={{ title: 'Orari' }}
	          />
	          <Tab.Screen 
	            name="CercaTreno" 
	            component={CercaTrenoScreen}
	            options={{ title: 'Treni' }}
	          />
	          <Tab.Screen 
	            name="CercaStazione" 
	            component={CercaStazioneScreen}
	            options={{ title: 'Stazioni' }}
	          />
	          <Tab.Screen 
	            name="Preferiti" 
	            component={PreferitiScreen}
	            options={{ title: 'Impostazioni' }}
	          />
	        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [initialRouteName, setInitialRouteName] = useState('Orari');

  useEffect(() => {
    async function prepare() {
      try {
        await initializeNotifications();

        await Font.loadAsync({
          'TikTokSans-Light': require('./assets/fonts/TikTokSans_24pt-Light.ttf'),
          'TikTokSans-Regular': require('./assets/fonts/TikTokSans_24pt-Regular.ttf'),
          'TikTokSans-Medium': require('./assets/fonts/TikTokSans_24pt-Medium.ttf'),
          'TikTokSans-SemiBold': require('./assets/fonts/TikTokSans_24pt-SemiBold.ttf'),
          'TikTokSans-Bold': require('./assets/fonts/TikTokSans_24pt-Bold.ttf'),
        });

        const storedDefaultScreen = await AsyncStorage.getItem('defaultScreen');
        setInitialRouteName(resolveInitialRouteName(storedDefaultScreen));

        if (!isExpoGo()) {
          const notificationsEnabled = await getNotificationsEnabled();
          const tracked = await getTrackedTrains();
          if (notificationsEnabled && Array.isArray(tracked) && tracked.length > 0) {
            await ensureTrainTrackingTaskRegistered();
          } else {
            await unregisterTrainTrackingTask();
          }
        }
      } catch (e) {
        console.warn(e);
      } finally {
        setAppIsReady(true);
        if (typeof SplashScreen?.hideAsync === 'function') {
          await SplashScreen.hideAsync().catch(() => {});
        }
      }
    }
    prepare();
  }, []);

  if (!appIsReady) {
    return null;
  }

  return (
    <ThemeProvider>
      <MainApp initialRouteName={initialRouteName} />
    </ThemeProvider>
  );
}
