import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { BORDER, INSETS, RADIUS, SPACE, SPACING } from '../utils/uiTokens';
import { cardShadow } from '../utils/uiStyles';

export default function SectionSkeleton({ title, rows = 3, containerStyle }) {
  const { theme } = useTheme();
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const lineStyle = { backgroundColor: theme.colors.border, opacity: pulse };

  return (
    <View style={[styles.section, containerStyle]}>
      {title ? <Animated.View style={[styles.titleBar, lineStyle]} /> : null}
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
        {Array.from({ length: rows }).map((_, index) => (
          <View key={`skeleton-${index}`}>
            <View style={styles.row}>
              <Animated.View style={[styles.iconStub, lineStyle]} />
              <View style={styles.textStack}>
                <Animated.View style={[styles.linePrimary, lineStyle]} />
                <Animated.View style={[styles.lineSecondary, lineStyle]} />
              </View>
            </View>
            {index < rows - 1 ? <View style={[styles.divider, { backgroundColor: theme.colors.border }]} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: SPACE.xxl,
  },
  titleBar: {
    height: 10,
    width: 120,
    marginBottom: SPACE.sm,
    marginLeft: SPACING.sectionX,
    borderRadius: 6,
  },
  card: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    gap: SPACE.md,
  },
  iconStub: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  textStack: {
    flex: 1,
    gap: 6,
  },
  linePrimary: {
    height: 12,
    width: '70%',
    borderRadius: 6,
  },
  lineSecondary: {
    height: 10,
    width: '45%',
    borderRadius: 6,
  },
  divider: {
    height: BORDER.hairline,
    marginLeft: INSETS.listDividerLeft,
  },
});
