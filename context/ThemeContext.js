import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { COLORS } from '../utils/uiTokens';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeMode] = useState('dark'); // 'light', 'dark', 'auto'
  const systemColorScheme = useColorScheme();

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('themeMode');
      if (savedTheme !== null) setThemeMode(savedTheme);
    } catch (error) {
      console.warn('Error loading preferences:', error);
    }
  };

  const changeTheme = async (mode) => {
    setThemeMode(mode);
    try {
      await AsyncStorage.setItem('themeMode', mode);
    } catch (error) {
      console.warn('Error saving theme:', error);
    }
  };

  const isDark = themeMode === 'auto' 
    ? systemColorScheme === 'dark' 
    : (themeMode === 'dark');

  const theme = {
    isDark,
    colors: {
      background: isDark ? '#000' : '#F2F2F7',
      surface: isDark ? '#1C1C1E' : '#F2F2F7',
      primary: COLORS.accent,
      accent: COLORS.accent,
      destructive: COLORS.destructive,
      success: COLORS.success,
      warning: COLORS.warning,
      onAccent: '#FFFFFF',
      onDestructive: '#FFFFFF',
      onSuccess: '#FFFFFF',
      onWarning: '#FFFFFF',
      text: isDark ? '#FFFFFF' : '#000000',
      textSecondary: isDark ? '#8E8E93' : '#6C6C70',
      border: isDark ? '#38383A' : '#D1D1D6',
      card: isDark ? '#1C1C1E' : '#FFFFFF',
    },
  };

  return (
    <ThemeContext.Provider value={{ 
      theme, 
      changeTheme, 
      isDark, 
      themeMode,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};
