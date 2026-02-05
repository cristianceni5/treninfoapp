import React from 'react';
import { Switch } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function AccentSwitch({
  value,
  onValueChange,
  disabled,
  trackColor,
  thumbColor,
  ios_backgroundColor,
  ...rest
}) {
  const { theme } = useTheme();

  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={trackColor ?? { false: theme.colors.border, true: theme.colors.accent }}
      thumbColor={thumbColor ?? '#FFFFFF'}
      ios_backgroundColor={ios_backgroundColor ?? theme.colors.border}
      {...rest}
    />
  );
}
