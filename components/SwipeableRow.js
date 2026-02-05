import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const SWIPE_THRESHOLD = 60;
const ACTION_BUTTON_WIDTH = 75;

export default function SwipeableRow({
  children,
  onDelete,
  theme,
  onSwipeStart,
  onSwipeEnd,
  resetKey,
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const height = useRef(new Animated.Value(0)).current;
  const [rowHeight, setRowHeight] = useState(null);
  const rowHeightRef = useRef(null);
  const isSwiping = useRef(false);
  const isDeleting = useRef(false);

  const deleteOpacity = translateX.interpolate({
    inputRange: [-ACTION_BUTTON_WIDTH, -10, 0],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });
  const deleteTranslateX = translateX.interpolate({
    inputRange: [-ACTION_BUTTON_WIDTH, 0],
    outputRange: [0, ACTION_BUTTON_WIDTH],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    translateX.stopAnimation();
    opacity.stopAnimation();
    height.stopAnimation();
    translateX.setValue(0);
    opacity.setValue(1);
    if (rowHeightRef.current != null) {
      height.setValue(rowHeightRef.current);
    }
    isSwiping.current = false;
    isDeleting.current = false;
  }, [resetKey, height, opacity, translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const { dx, dy } = gestureState;
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
        if (gestureState.dx <= 0) {
          let translation = gestureState.dx;
          if (translation < -ACTION_BUTTON_WIDTH) {
            const excess = Math.abs(translation) - ACTION_BUTTON_WIDTH;
            translation = -ACTION_BUTTON_WIDTH - excess * 0.3;
          }
          translateX.setValue(translation);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const translation = gestureState.dx;
        isSwiping.current = false;
        onSwipeEnd?.();
        if (translation < -SWIPE_THRESHOLD) {
          Animated.spring(translateX, {
            toValue: -ACTION_BUTTON_WIDTH,
            useNativeDriver: true,
            tension: 40,
            friction: 7,
          }).start();
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
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

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: -500,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.timing(height, {
        toValue: 0,
        duration: 220,
        useNativeDriver: false,
      }).start(() => {
        onDelete?.();
      });
    });
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          height: rowHeight == null ? undefined : height,
        },
      ]}
      onLayout={(event) => {
        if (rowHeightRef.current != null) return;
        const measured = event.nativeEvent.layout.height;
        rowHeightRef.current = measured;
        setRowHeight(measured);
        height.setValue(measured);
      }}
    >
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
          <Ionicons name="trash" size={20} color={theme?.colors?.onDestructive || theme?.colors?.text || '#FFFFFF'} />
        </TouchableOpacity>
      </Animated.View>

      <Animated.View
        style={[
          styles.swipeableContent,
          {
            backgroundColor: theme.colors.card,
            opacity,
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
    width: ACTION_BUTTON_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeableContent: {
    width: '100%',
    alignSelf: 'stretch',
  },
  touchableFill: {
    width: '100%',
  },
});
