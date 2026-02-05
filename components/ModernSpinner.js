import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { COLORS } from '../utils/uiTokens';

const hexToRgba = (hex, alpha) => {
  if (typeof hex !== 'string') return `rgba(0,0,0,${alpha})`;
  const normalized = hex.replace('#', '').trim();
  const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized;
  if (full.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
};

export default function ModernSpinner({
  size = 20,
  thickness = 2,
  color = COLORS.accent,
  trackColor,
  style,
  // compat: in precedenza usato per colorare il "centro" del ring
  innerStyle,
}) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 950,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const outer = Math.max(12, Number(size) || 26);
  const ring = Math.max(2, Number(thickness) || 2);
  const c = String(color || COLORS.accent).trim();
  const track = trackColor || hexToRgba(c, 0.12);
  const tail = hexToRgba(c, 0.28);

  return (
    <Animated.View style={[{ width: outer, height: outer, transform: [{ rotate }] }, style]}>
      <View
        style={[
          {
            width: outer,
            height: outer,
            borderRadius: outer / 2,
            borderWidth: ring,
            borderColor: track,
            borderTopColor: c,
            borderRightColor: tail,
          },
          innerStyle,
        ]}
      />
    </Animated.View>
  );
}
