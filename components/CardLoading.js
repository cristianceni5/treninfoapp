import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SPACE, TYPE } from '../utils/uiTokens';
import ModernSpinner from './ModernSpinner';

export default function CardLoading({
  label,
  color,
  size = 20,
  thickness = 2,
  style,
  textStyle,
}) {
  return (
    <View style={[styles.container, style]}>
      <ModernSpinner size={size} thickness={thickness} color={color} />
      {label ? <Text style={[styles.label, textStyle]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexGrow: 1,
    paddingVertical: SPACE.xl,
    paddingHorizontal: SPACE.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
  },
  label: {
    ...TYPE.caption,
    textAlign: 'center',
  },
});
