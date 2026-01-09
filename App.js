import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';

import { ThemeProvider, useTheme } from './context/ThemeContext';
import AnimatedTabIcon from './components/AnimatedTabIcon';
import CercaTrenoScreen from './screens/CercaTrenoScreen';
import CercaStazioneScreen from './screens/CercaStazioneScreen';
import SoluzioniScreen from './screens/SoluzioniScreen';
import PreferitiScreen from './screens/PreferitiScreen';

SplashScreen.preventAutoHideAsync();

const Tab = createBottomTabNavigator();

function MainApp() {
  const { theme, isDark } = useTheme();

  return (
    <NavigationContainer>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;

            if (route.name === 'CercaTreno') {
              iconName = 'train-outline';
            } else if (route.name === 'CercaStazione') {
              iconName = 'location-outline';
            } else if (route.name === 'Soluzioni') {
              iconName = 'time-outline';
            } else if (route.name === 'Preferiti') {
              iconName = 'settings-outline';
            }

            return <AnimatedTabIcon name={iconName} size={size} color={color} focused={focused} />;
          },
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textSecondary,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            borderTopWidth: theme.isDark ? 0.5 : 1,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: theme.isDark ? 0 : -1 },
            shadowOpacity: theme.isDark ? 0 : 0.03,
            shadowRadius: theme.isDark ? 0 : 2,
            elevation: theme.isDark ? 0 : 1,
          },
          headerShown: false,
          tabBarLabelStyle: {
            fontFamily: 'TikTokSans-Medium',
          },
        })}
      >
        <Tab.Screen 
          name="Soluzioni" 
          component={SoluzioniScreen}
          options={{ title: 'Orari' }}
        />
        <Tab.Screen 
          name="CercaTreno" 
          component={CercaTrenoScreen}
          options={{ title: 'Treno' }}
        />
        <Tab.Screen 
          name="CercaStazione" 
          component={CercaStazioneScreen}
          options={{ title: 'Stazione' }}
        />
        <Tab.Screen 
          name="Preferiti" 
          component={PreferitiScreen}
          options={{ title: 'Impostazioni' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        await Font.loadAsync({
          'TikTokSans-Light': require('./assets/fonts/TikTokSans_24pt-Light.ttf'),
          'TikTokSans-Regular': require('./assets/fonts/TikTokSans_24pt-Regular.ttf'),
          'TikTokSans-Medium': require('./assets/fonts/TikTokSans_24pt-Medium.ttf'),
          'TikTokSans-SemiBold': require('./assets/fonts/TikTokSans_24pt-SemiBold.ttf'),
          'TikTokSans-Bold': require('./assets/fonts/TikTokSans_24pt-Bold.ttf'),
        });
      } catch (e) {
        console.warn(e);
      } finally {
        setAppIsReady(true);
        await SplashScreen.hideAsync();
      }
    }
    prepare();
  }, []);

  if (!appIsReady) {
    return null;
  }

  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}
