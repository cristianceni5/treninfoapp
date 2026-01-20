import { StyleSheet } from 'react-native';

export const SPACING = {
  screenTop: 32,
  screenX: 16,
  sectionX: 16,
  cardRadius: 16,
};

export const SPACE = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const RADIUS = {
  card: SPACING.cardRadius,
  button: 14,
  iconButton: 18,
  pill: 999,
};

export const FONTS = {
  light: 'TikTokSans-Light',
  regular: 'TikTokSans-Regular',
  medium: 'TikTokSans-Medium',
  semibold: 'TikTokSans-SemiBold',
  bold: 'TikTokSans-Bold',
};

export const TYPE = {
  sectionLabel: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  screenTitle: {
    fontSize: 24,
    fontFamily: FONTS.semibold,
    letterSpacing: -0.2,
  },
  headline: {
    fontSize: 20,
    fontFamily: FONTS.semibold,
    letterSpacing: -0.1,
  },
  callout: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    lineHeight: 20,
  },
  calloutSemibold: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    lineHeight: 20,
  },
  subheadline: {
    fontSize: 15,
    fontFamily: FONTS.regular,
    lineHeight: 20,
  },
  subheadlineMedium: {
    fontSize: 15,
    fontFamily: FONTS.medium,
    lineHeight: 20,
  },
  body: {
    fontSize: 16,
    fontFamily: FONTS.regular,
  },
  bodyMedium: {
    fontSize: 16,
    fontFamily: FONTS.medium,
  },
  bodySemibold: {
    fontSize: 16,
    fontFamily: FONTS.semibold,
  },
  title: {
    fontSize: 17,
    fontFamily: FONTS.medium,
  },
  titleSemibold: {
    fontSize: 17,
    fontFamily: FONTS.semibold,
  },
  titleBold: {
    fontSize: 18,
    fontFamily: FONTS.bold,
  },
  button: {
    fontSize: 16,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.2,
  },
  caption: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    lineHeight: 18,
  },
  captionMedium: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    lineHeight: 18,
  },
  captionSemibold: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    lineHeight: 18,
  },
  pill: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
  },
};

export const HIT_SLOP = {
  sm: { top: 10, bottom: 10, left: 10, right: 10 },
  md: { top: 12, bottom: 12, left: 12, right: 12 },
  lg: { top: 16, bottom: 16, left: 16, right: 16 },
};

export const BORDER = {
  card: 1,
  hairline: StyleSheet.hairlineWidth,
};

export const INSETS = {
  // settings rows (icon 20 + gap 12) with horizontal padding 16 => 48
  settingsDividerLeft: SPACE.lg + 20 + SPACE.md,
  // list rows (icon slot 28 + gap 12) with horizontal padding 16 => 56
  listDividerLeft: SPACE.lg + 28 + SPACE.md,
};

// Common iOS grouped-list gutter: 16 (screen padding) + 16 (section inset) = 32
export const GUTTER = {
  groupedTitleLeft: SPACING.screenX + SPACING.sectionX,
  groupedTitleRight: SPACING.screenX + SPACING.sectionX,
};

export const COLORS = {
  accent: '#3b79ff',
  destructive: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',
};
