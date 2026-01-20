import { Platform } from 'react-native';
import { isExpoGo } from './runtimeEnv';

let initialized = false;

let NotificationsModule;
const Notifications = () => {
  if (!NotificationsModule) {
    // Lazy-load to avoid noisy warnings in Expo Go.
    // eslint-disable-next-line global-require
    NotificationsModule = require('expo-notifications');
  }
  return NotificationsModule;
};

export async function initializeNotifications() {
  if (initialized) return;
  initialized = true;

  if (isExpoGo()) return;

  Notifications().setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    try {
      await Notifications().setNotificationChannelAsync('train-tracking', {
        name: 'Tracciamento treni',
        importance: Notifications().AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 300, 150, 300, 150, 450],
        lockscreenVisibility: Notifications().AndroidNotificationVisibility.PUBLIC,
        lightColor: '#1C1C1E',
      });
    } catch {
      // ignore
    }
  }
}

export async function requestNotificationPermissionIfNeeded() {
  try {
    if (isExpoGo()) return { granted: false, status: 'unavailable' };
    const current = await Notifications().getPermissionsAsync();
    const existing = current?.status || null;
    if (existing === 'granted') return { granted: true, status: existing };
    const next = await Notifications().requestPermissionsAsync();
    return { granted: next?.status === 'granted', status: next?.status || null };
  } catch {
    return { granted: false, status: null };
  }
}
