import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { BORDER, RADIUS, SPACING, SPACE, TYPE } from '../utils/uiTokens';
import { cardShadow } from '../utils/uiStyles';

export default function SectionPlaceholderCard({ title, description, containerStyle }) {
  const { theme } = useTheme();

  return (
    <View style={[styles.section, containerStyle]}>
      {title ? (
        <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
        <Text style={[styles.description, { color: theme.colors.textSecondary }]}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: SPACE.xxl,
  },
  sectionTitle: {
    ...TYPE.sectionLabel,
    marginBottom: SPACE.sm,
    marginLeft: SPACING.sectionX,
  },
  card: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  description: {
    ...TYPE.caption,
  },
});
