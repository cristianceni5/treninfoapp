import React, { useRef } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, TouchableOpacity } from 'react-native';

const SWIPE_THRESHOLD = -60;
const DELETE_BUTTON_WIDTH = 75;

export default function SwipeableRow({ children, onDelete, theme, onSwipeStart, onSwipeEnd }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const height = useRef(new Animated.Value(1)).current;
  const isSwiping = useRef(false);

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
    // Animazione di eliminazione più fluida con fade out e height collapse
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: -400,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(height, {
        toValue: 0,
        duration: 250,
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
        transform: [{ scaleY: height }],
      },
    ]}>
      {/* Pulsante Delete sotto */}
      <View style={styles.deleteContainer}>
        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <Text style={styles.deleteText}>Elimina</Text>
        </TouchableOpacity>
      </View>

      {/* Contenuto swipeable */}
      <Animated.View
        style={[
          styles.swipeableContent,
          {
            transform: [{ translateX }],
            backgroundColor: theme.colors.card,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity onPress={closeSwipe} activeOpacity={1}>
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
  },
  deleteContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 75,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
  },
  deleteButton: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'TikTokSans-Regular',
  },
  swipeableContent: {
    backgroundColor: '#FFFFFF',
  },
});

