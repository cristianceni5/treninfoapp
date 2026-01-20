import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_NOTIFICATIONS_ENABLED = 'settings:notificationsEnabled';
const KEY_LIVE_ACTIVITIES_ENABLED = 'settings:liveActivitiesEnabled';

const toBool = (value, fallback = false) => {
  if (value === true || value === false) return value;
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
  return fallback;
};

export async function getNotificationsEnabled() {
  try {
    const stored = await AsyncStorage.getItem(KEY_NOTIFICATIONS_ENABLED);
    return toBool(stored, false);
  } catch {
    return false;
  }
}

export async function setNotificationsEnabled(enabled) {
  try {
    await AsyncStorage.setItem(KEY_NOTIFICATIONS_ENABLED, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
}

export async function getLiveActivitiesEnabled() {
  try {
    const stored = await AsyncStorage.getItem(KEY_LIVE_ACTIVITIES_ENABLED);
    return toBool(stored, false);
  } catch {
    return false;
  }
}

export async function setLiveActivitiesEnabled(enabled) {
  try {
    await AsyncStorage.setItem(KEY_LIVE_ACTIVITIES_ENABLED, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
}

