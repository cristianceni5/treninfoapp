import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { BORDER, RADIUS } from '../utils/uiTokens';
import { cardShadow, floatingShadow } from '../utils/uiStyles';

export default function Card({
  children,
  style,
  variant = 'card', // 'card' | 'floating' | 'none'
  border = true,
  overflow = 'hidden',
  radius = RADIUS.card,
  backgroundColor,
  borderColor,
  ...rest
}) {
  const { theme } = useTheme();

  const shadowStyle =
    variant === 'floating' ? floatingShadow(theme, 'md') : variant === 'card' ? cardShadow(theme) : null;

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: backgroundColor ?? theme.colors.card,
          borderColor: borderColor ?? theme.colors.border,
          borderWidth: border ? BORDER.card : 0,
          borderRadius: radius,
          overflow,
        },
        shadowStyle,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
  },
});

