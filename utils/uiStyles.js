import { Platform } from 'react-native';

export function cardShadow(theme) {
  const isDark = theme?.isDark === true;
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: isDark ? 0 : 1 },
    shadowOpacity: isDark ? 0 : 0.03,
    shadowRadius: isDark ? 0 : 2,
    elevation: isDark ? 0 : 1,
  };
}

export function floatingShadow(theme, level = 'md') {
  const isDark = theme?.isDark === true;
  const variant = String(level || 'md').toLowerCase();
  const cfg =
    variant === 'lg'
      ? { height: 8, opacity: 0.18, radius: 14, elevation: 10 }
      : { height: 6, opacity: 0.12, radius: 12, elevation: 6 };
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: isDark ? 0 : cfg.height },
    shadowOpacity: isDark ? 0 : cfg.opacity,
    shadowRadius: isDark ? 0 : cfg.radius,
    elevation: isDark ? 0 : cfg.elevation,
  };
}

export function iconButtonShadow(theme) {
  const isDark = theme?.isDark === true;
  const opacity = isDark ? 0.18 : 0.25;
  const elevation = Platform.OS === 'android' ? 4 : 0;
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: opacity,
    shadowRadius: 4,
    elevation,
  };
}
