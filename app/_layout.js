import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { FONTS } from '../utils/uiTokens';

if (typeof SplashScreen?.preventAutoHideAsync === 'function') {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

function RootNavigator() {
  const { theme, isDark } = useTheme();

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' },
          headerShadowVisible: false,
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontFamily: FONTS.semibold },
          headerBackTitleVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="Impostazioni" options={{ title: 'Impostazioni', headerBackTitle: 'Altro', headerBackTitleVisible: true }} />
        <Stack.Screen name="Info" options={{ title: 'Info', headerBackTitle: 'Altro', headerBackTitleVisible: true }} />
        <Stack.Screen name="News" options={{ title: 'News e infomobilità', headerBackTitle: 'Altro', headerBackTitleVisible: true }} />
        <Stack.Screen name="Novita" options={{ title: 'Novità', headerBackTitle: 'Altro', headerBackTitleVisible: true }} />
      </Stack>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded && typeof SplashScreen?.hideAsync === 'function') {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}
