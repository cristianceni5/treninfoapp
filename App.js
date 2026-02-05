import React, { useEffect, useState } from 'react';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  NavigationContainer,
  getFocusedRouteNameFromRoute,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
import ImpostazioniScreen from './screens/ImpostazioniScreen';
import AltroScreen from './screens/AltroScreen';
import InfoScreen from './screens/InfoScreen';
import NewsScreen from './screens/NewsScreen';
import NovitaScreen from './screens/NovitaScreen';
import { FONTS, SPACE } from './utils/uiTokens';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';

if (typeof SplashScreen?.preventAutoHideAsync === 'function') {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

const Tab = createBottomTabNavigator();
const AltroStackNav = createNativeStackNavigator();

function AltroStack() {
  const { theme } = useTheme();

  return (
    <AltroStackNav.Navigator
      screenOptions={{
        headerTransparent: true,
        headerStyle: { backgroundColor: 'transparent' },
        headerShadowVisible: false,
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontFamily: FONTS.semibold },
        contentStyle: { backgroundColor: theme.colors.background },
        headerBackTitleVisible: false,
        animation: 'slide_from_right',
      }}
    >
      <AltroStackNav.Screen
        name="AltroHome"
        component={AltroScreen}
        options={{ title: 'Altro', headerShown: false }}
      />
      <AltroStackNav.Screen name="Impostazioni" component={ImpostazioniScreen} options={{ title: 'Impostazioni' }} />
      <AltroStackNav.Screen name="Info" component={InfoScreen} options={{ title: 'Info' }} />
      <AltroStackNav.Screen name="News" component={NewsScreen} options={{ title: 'News e infomobilità' }} />
      <AltroStackNav.Screen name="Novita" component={NovitaScreen} options={{ title: 'Novità' }} />
    </AltroStackNav.Navigator>
  );
}

function resolveInitialRouteName(defaultScreenId) {
  const id = String(defaultScreenId || '').trim();
  if (id === 'train') return 'CercaTreno';
  if (id === 'station') return 'CercaStazione';
  if (id === 'orari' || id === 'solutions') return 'Orari';
  return 'Orari';
}

function Tabs({ initialRouteName }) {
  const { theme } = useTheme();
  const tabBarStyleBase = {
    backgroundColor: theme.colors.card,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  };

  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
      lazy={false}
      detachInactiveScreens={false}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'CercaTreno') {
            iconName = 'train-outline';
          } else if (route.name === 'CercaStazione') {
            iconName = 'location-outline';
          } else if (route.name === 'Orari') {
            iconName = 'time-outline';
          } else if (route.name === 'Altro') {
            iconName = 'ellipsis-horizontal-circle-outline';
          }

          return <AnimatedTabIcon name={iconName} size={size} color={color} focused={focused} />;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        headerShown: false,
        sceneContainerStyle: { backgroundColor: theme.colors.background },
        tabBarStyle: tabBarStyleBase,
        tabBarLabelStyle: {
          fontFamily: FONTS.medium,
          marginTop: SPACE.xxs,
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
        name="Altro"
        component={AltroStack}
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'AltroHome';
          return {
            title: 'Altro',
            tabBarStyle: routeName === 'AltroHome' ? tabBarStyleBase : { display: 'none' },
          };
        }}
      />
    </Tab.Navigator>
  );
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
        <Tabs initialRouteName={initialRouteName} />
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
        await Font.loadAsync({
          Manrope_400Regular,
          Manrope_500Medium,
          Manrope_600SemiBold,
          Manrope_700Bold,
          Manrope_800ExtraBold,
        });

        const storedDefaultScreen = await AsyncStorage.getItem('defaultScreen');
        setInitialRouteName(resolveInitialRouteName(storedDefaultScreen));
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
