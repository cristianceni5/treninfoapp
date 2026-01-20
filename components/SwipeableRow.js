import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, TouchableOpacity } from 'react-native';
import { TYPE } from '../utils/uiTokens';

const SWIPE_THRESHOLD = -60;
const DELETE_BUTTON_WIDTH = 75;

export default function SwipeableRow({ children, onDelete, theme, onSwipeStart, onSwipeEnd, resetKey }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const isSwiping = useRef(false);
  const isDeleting = useRef(false);

  const deleteOpacity = translateX.interpolate({
    inputRange: [-DELETE_BUTTON_WIDTH, -10, 0],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });
  const deleteTranslateX = translateX.interpolate({
    inputRange: [-DELETE_BUTTON_WIDTH, 0],
    outputRange: [0, DELETE_BUTTON_WIDTH],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    // Forza lo stato "chiuso" (utile dopo Undo/ri-render di lista)
    translateX.stopAnimation();
    opacity.stopAnimation();
    translateX.setValue(0);
    opacity.setValue(1);
    isSwiping.current = false;
    isDeleting.current = false;
  }, [resetKey, opacity, translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const { dx, dy } = gestureState;
        // Prende il controllo solo se il movimento orizzontale è
        // molto maggiore di quello verticale (3 volte)
        return Math.abs(dx) > Math.abs(dy) * 3 && Math.abs(dx) > 10;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        translateX.stopAnimation();
        if (!isSwiping.current) {
          isSwiping.current = true;
          onSwipeStart?.();
        }
      },
      onPanResponderMove: (_, gestureState) => {
        // Solo swipe a sinistra consentito
        if (gestureState.dx <= 0) {
          let translation = gestureState.dx;
          if (translation < -DELETE_BUTTON_WIDTH) {
            // Rubber banding effect quando vai oltre
            const excess = Math.abs(translation) - DELETE_BUTTON_WIDTH;
            translation = -DELETE_BUTTON_WIDTH - (excess * 0.3);
          }
          translateX.setValue(translation);
        }
        // Ignora completamente lo swipe a destra
      },
      onPanResponderRelease: (_, gestureState) => {
        const velocity = gestureState.vx;
        const translation = gestureState.dx;
        
        isSwiping.current = false;
        onSwipeEnd?.();
        
        // Se ha velocità negativa alta o ha superato la soglia, apri
        if (velocity < -0.5 || translation < SWIPE_THRESHOLD) {
          Animated.spring(translateX, {
            toValue: -DELETE_BUTTON_WIDTH,
            useNativeDriver: true,
            velocity: velocity * 1000,
            tension: 40,
            friction: 7,
          }).start();
        } else {
          // Altrimenti chiudi
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            velocity: velocity * 1000,
            tension: 40,
            friction: 7,
          }).start();
        }
      },
    })
  ).current;

  const closeSwipe = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 40,
      friction: 7,
    }).start();
  };

  const handleDelete = () => {
    if (isDeleting.current) return;
    isDeleting.current = true;
    
    // Animazione: tile scorre via a sinistra con fade out
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: -500,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDelete();
    });
  };

  return (
    <Animated.View style={[
      styles.container,
      {
        opacity,
      },
    ]}>
      {/* Pulsante Delete sotto */}
      <Animated.View
        style={[
          styles.deleteContainer,
          {
            backgroundColor: theme.colors.destructive,
            opacity: deleteOpacity,
            transform: [{ translateX: deleteTranslateX }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          activeOpacity={0.8}
          pointerEvents={isDeleting.current ? 'none' : 'auto'}
        >
          <Text style={[styles.deleteText, { color: theme?.colors?.onDestructive || theme?.colors?.text || '#FFFFFF' }]}>
            Elimina
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Contenuto swipeable */}
      <Animated.View
        style={[
          styles.swipeableContent,
          {
            backgroundColor: theme.colors.card,
            transform: [{ translateX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity onPress={closeSwipe} activeOpacity={1} style={styles.touchableFill}>
          {children}
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
  },
  deleteContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 75,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteText: {
    ...TYPE.titleSemibold,
  },
  swipeableContent: {
    // backgroundColor applicato tramite prop
    width: '100%',
    alignSelf: 'stretch',
  },
  touchableFill: {
    width: '100%',
  },
});
