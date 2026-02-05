import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { HIT_SLOP, SPACE, TYPE } from '../utils/uiTokens';

export default function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  right,
  showChevron = false,
  onPress,
  disabled = false,
  style,
  contentStyle,
  titleNumberOfLines = 1,
  subtitleNumberOfLines = 2,
}) {
  const { theme } = useTheme();

  const canPress = typeof onPress === 'function' && !disabled;
  const Container = canPress ? TouchableOpacity : View;

  return (
    <Container
      style={[styles.row, contentStyle]}
      onPress={canPress ? onPress : undefined}
      activeOpacity={canPress ? 0.65 : 1}
      hitSlop={canPress ? HIT_SLOP.sm : undefined}
      pointerEvents={disabled ? 'none' : 'auto'}
      accessibilityRole={canPress ? 'button' : undefined}
      accessibilityState={disabled ? { disabled: true } : undefined}
    >
      <View style={[styles.left, style]}>
        {icon ? (
          <View style={styles.iconSlot}>
            <Ionicons name={icon} size={20} color={iconColor ?? theme.colors.text} />
          </View>
        ) : null}

        <View style={styles.text}>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={titleNumberOfLines}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]} numberOfLines={subtitleNumberOfLines}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.right}>
        {right ?? null}
        {showChevron && !right ? (
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} style={{ opacity: 0.35 }} />
        ) : null}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    flex: 1,
    minWidth: 0,
  },
  iconSlot: {
    width: 20,
    alignItems: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...TYPE.body,
  },
  subtitle: {
    ...TYPE.caption,
    marginTop: SPACE.xxs,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
});

