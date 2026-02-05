import * as Haptics from 'expo-haptics';

export const ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle;
export const MODAL_CLOSE_HAPTIC_STYLE = Haptics.ImpactFeedbackStyle.Medium;
export const MODAL_OPEN_HAPTIC_STYLE = MODAL_CLOSE_HAPTIC_STYLE;

export const hapticSelection = () => {
  try {
    Haptics.selectionAsync();
  } catch {
    // ignore
  }
};

export const hapticImpact = (style = Haptics.ImpactFeedbackStyle.Light) => {
  try {
    Haptics.impactAsync(style);
  } catch {
    // ignore
  }
};

export const hapticModalClose = () => {
  hapticImpact(MODAL_CLOSE_HAPTIC_STYLE);
};

export const hapticModalOpen = () => {
  hapticImpact(MODAL_OPEN_HAPTIC_STYLE);
};
