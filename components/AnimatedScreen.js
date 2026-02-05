import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

export default function AnimatedScreen({ children, animateOnce = false }) {
  const isFocused = useIsFocused();
  const hasAnimatedRef = useRef(false);
  // Importante: inizializza i valori in base al focus per evitare un frame “bianco”
  // quando la schermata è già attiva ma l’effetto non è ancora partito.
  const fadeAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const scaleAnim = useRef(new Animated.Value(isFocused ? 1 : 0.98)).current;

  useEffect(() => {
    if (isFocused) {
      if (animateOnce && hasAnimatedRef.current) {
        fadeAnim.setValue(1);
        scaleAnim.setValue(1);
        return;
      }
      hasAnimatedRef.current = true;
      // Fade in e scale in quando la schermata diventa visibile
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      if (animateOnce && hasAnimatedRef.current) {
        return;
      }
      // Fade out e scale out quando la schermata perde il focus
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.98,
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [animateOnce, fadeAnim, isFocused, scaleAnim]);

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: fadeAnim,
        transform: [{ scale: scaleAnim }],
      }}
    >
      {children}
    </Animated.View>
  );
}
