import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { SPACE } from '../utils/uiTokens';

const hexToRgba = (hex, alpha) => {
  if (typeof hex !== 'string') return `rgba(0,0,0,${alpha})`;
  const raw = hex.trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (full.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
};

const colorWithAlpha = (color, alpha) => {
  if (typeof color !== 'string') return `rgba(0,0,0,${alpha})`;
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) return hexToRgba(trimmed, alpha);
  if (trimmed.startsWith('rgba(')) {
    const parts = trimmed.replace(/^rgba\(/, '').replace(/\)$/, '').split(',').map((p) => p.trim());
    if (parts.length >= 3) return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
  }
  if (trimmed.startsWith('rgb(')) {
    const parts = trimmed.replace(/^rgb\(/, '').replace(/\)$/, '').split(',').map((p) => p.trim());
    if (parts.length >= 3) return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
  }
  return `rgba(0,0,0,${alpha})`;
};

export default function EdgeFade({
  height = SPACE.lg,
  direction = 'down', // 'down' | 'up'
  color,
  style,
}) {
  const { theme } = useTheme();
  const base = color ?? theme.colors.background;
  // Multi-stop gradient to avoid a “hard start” and keep the fade very gradual.
  const stops = [1, 0.99, 0.94, 0.82, 0.62, 0.42, 0.24, 0.12, 0];
  const locations = [0, 0.18, 0.36, 0.52, 0.66, 0.78, 0.88, 0.95, 1];
  const forwardColors = stops.map((a) => colorWithAlpha(base, a));
  const colors = direction === 'down' ? forwardColors : [...forwardColors].reverse();

  const start = direction === 'down' ? { x: 0.5, y: 0 } : { x: 0.5, y: 1 };
  const end = direction === 'down' ? { x: 0.5, y: 1 } : { x: 0.5, y: 0 };

  return (
    <LinearGradient
      pointerEvents="none"
      colors={colors}
      locations={locations}
      start={start}
      end={end}
      style={[styles.fade, { height }, style]}
    />
  );
}

const styles = StyleSheet.create({
  fade: {
    width: '100%',
  },
});
