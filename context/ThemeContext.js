import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import {
  COLOR_THEME_OPTIONS,
  DEFAULT_COLOR_THEME_ID,
  getColorThemeById,
} from '../utils/appearanceOptions';
import { getReadableTextColor } from '../utils/color';
import { COLORS } from '../utils/uiTokens';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

const STORAGE_KEYS = {
  themeMode: 'themeMode',
  colorThemeId: 'colorThemeId',
  legacyAccentId: 'accentColorId',
};

const THEME_MODES = new Set(['light', 'dark', 'auto']);
const COLOR_THEME_IDS = new Set(COLOR_THEME_OPTIONS.map((option) => option.id));
const LEGACY_THEME_MAP = {
  rfi: 'intercity',
  azzurro: 'intercity',
  italo: 'italo',
  italoGold: 'italo',
  italia: 'intercity',
  italyGreen: 'intercity',
  italyRed: 'intercity',
  regionale: 'regionale',
};

const normalizeThemeMode = (value) => {
  const id = String(value || '').trim();
  return THEME_MODES.has(id) ? id : 'dark';
};

const normalizeColorThemeId = (value) => {
  const raw = String(value || '').trim();
  const id = LEGACY_THEME_MAP[raw] ?? raw;
  return COLOR_THEME_IDS.has(id) ? id : DEFAULT_COLOR_THEME_ID;
};

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeMode] = useState('dark'); // 'light', 'dark', 'auto'
  const [colorThemeId, setColorThemeId] = useState(DEFAULT_COLOR_THEME_ID);
  const systemColorScheme = useColorScheme();

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const entries = await AsyncStorage.multiGet([
        STORAGE_KEYS.themeMode,
        STORAGE_KEYS.colorThemeId,
        STORAGE_KEYS.legacyAccentId,
      ]);
      const stored = Object.fromEntries(entries);
      const normalizedTheme = normalizeThemeMode(stored[STORAGE_KEYS.themeMode]);
      const storedColorTheme = stored[STORAGE_KEYS.colorThemeId] ?? stored[STORAGE_KEYS.legacyAccentId];
      const normalizedColorTheme = normalizeColorThemeId(storedColorTheme);

      setThemeMode(normalizedTheme);
      setColorThemeId(normalizedColorTheme);

      const toWrite = [];
      if (stored[STORAGE_KEYS.themeMode] && stored[STORAGE_KEYS.themeMode] !== normalizedTheme) {
        toWrite.push([STORAGE_KEYS.themeMode, normalizedTheme]);
      }
      if (stored[STORAGE_KEYS.colorThemeId] !== normalizedColorTheme) {
        toWrite.push([STORAGE_KEYS.colorThemeId, normalizedColorTheme]);
      }
      if (toWrite.length) {
        await AsyncStorage.multiSet(toWrite);
      }
    } catch (error) {
      console.warn('Error loading preferences:', error);
    }
  };

  const changeTheme = async (mode) => {
    const normalized = normalizeThemeMode(mode);
    setThemeMode(normalized);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.themeMode, normalized);
    } catch (error) {
      console.warn('Error saving theme:', error);
    }
  };

  const changeColorTheme = async (id) => {
    const normalized = normalizeColorThemeId(id);
    setColorThemeId(normalized);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.colorThemeId, normalized);
    } catch (error) {
      console.warn('Error saving color theme:', error);
    }
  };

  const isDark = themeMode === 'auto' 
    ? systemColorScheme === 'dark' 
    : (themeMode === 'dark');

  const colorTheme = getColorThemeById(colorThemeId);
  const accentLight = colorTheme?.accentLight ?? COLORS.accent;
  const accentDark = colorTheme?.accentDark ?? accentLight;
  const resolvedAccent = isDark ? accentDark : accentLight;
  const onAccent = getReadableTextColor(resolvedAccent);

  const baseColors = {
    background: isDark ? '#000' : '#F2F2F7',
    surface: isDark ? '#1C1C1E' : '#F2F2F7',
    card: isDark ? '#1C1C1E' : '#FFFFFF',
    border: isDark ? '#38383A' : '#D1D1D6',
    text: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#8E8E93' : '#6C6C70',
  };

  const theme = {
    isDark,
    colors: {
      background: baseColors.background,
      surface: baseColors.surface,
      primary: resolvedAccent,
      accent: resolvedAccent,
      destructive: COLORS.destructive,
      success: COLORS.success,
      warning: COLORS.warning,
      onAccent,
      onDestructive: '#FFFFFF',
      onSuccess: '#FFFFFF',
      onWarning: '#FFFFFF',
      text: baseColors.text,
      textSecondary: baseColors.textSecondary,
      border: baseColors.border,
      card: baseColors.card,
    },
  };

  return (
    <ThemeContext.Provider value={{ 
      theme, 
      changeTheme, 
      changeColorTheme,
      isDark, 
      themeMode,
      colorThemeId,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};
