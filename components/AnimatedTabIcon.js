import React, { useEffect } from 'react';
import { Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function AnimatedTabIcon({ name, size, color, focused }) {
  const scaleValue = React.useRef(new Animated.Value(0.95)).current;
  const opacityValue = React.useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scaleValue, {
        toValue: focused ? 1 : 0.95,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacityValue, {
        toValue: focused ? 1 : 0.85,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused]);

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleValue }],
        opacity: opacityValue,
      }}
    >
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}
