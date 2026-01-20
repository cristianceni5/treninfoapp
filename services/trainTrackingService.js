import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNotificationsEnabled } from './settingsService';
import { requestNotificationPermissionIfNeeded } from './notificationsService';
import { isExpoGo } from './runtimeEnv';

let NotificationsModule;
const Notifications = () => {
  if (!NotificationsModule) {
    // eslint-disable-next-line global-require
    NotificationsModule = require('expo-notifications');
  }
  return NotificationsModule;
};

const STORAGE_KEY = 'trainTracking:items';

const norm = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

export const getTrackingKeyFromTrain = (train) => {
  if (!train) return null;
  const number = norm(train.number ?? train.trainNumber) || '';
  if (!number) return norm(train.id) || null;

  const choice = train.choice ?? train.choiceId ?? null;
  const technical = norm(train.technical ?? train.technicalId);
  const originName = norm(train.originName ?? train.origine);
  const originCode = norm(train.originCode ?? train.codiceOrigine);
  const timestampRiferimento = train.timestampRiferimento ?? train.timestampReference ?? null;
  const date = norm(train.date);

  const parts = [number];
  if (choice !== null && choice !== undefined && String(choice).trim() !== '') parts.push(`choice:${String(choice).trim()}`);
  if (technical) parts.push(`tech:${technical}`);
  if (originName) parts.push(`origin:${originName}`);
  if (originCode) parts.push(`originCode:${originCode}`);
  if (timestampRiferimento !== null && timestampRiferimento !== undefined && String(timestampRiferimento).trim() !== '') {
    parts.push(`ts:${String(timestampRiferimento).trim()}`);
  }
  if (date) parts.push(`date:${date}`);

  return parts.join('|');
};

export async function getTrackedTrains() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveTrackedTrains(list) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  } catch {
    // ignore
  }
}

export async function getTrackedTrainById(id) {
  const key = norm(id);
  if (!key) return null;
  const list = await getTrackedTrains();
  return list.find((t) => norm(t?.id) === key) || null;
}

export async function isTrainTracked(trainOrId) {
  const key = typeof trainOrId === 'string' ? norm(trainOrId) : getTrackingKeyFromTrain(trainOrId);
  if (!key) return false;
  const item = await getTrackedTrainById(key);
  return Boolean(item);
}

export async function removeTrackedTrainById(id) {
  const key = norm(id);
  if (!key) return;
  const list = await getTrackedTrains();
  const next = list.filter((t) => norm(t?.id) !== key);
  await saveTrackedTrains(next);
}

export async function clearAllTrackedTrains() {
  await saveTrackedTrains([]);
}

export async function cancelAllTrackingSchedules() {
  if (isExpoGo()) return;
  const list = await getTrackedTrains();
  const next = [];
  for (const item of list) {
    const ids = item?.scheduled?.etaNotificationIds && typeof item.scheduled.etaNotificationIds === 'object'
      ? Object.values(item.scheduled.etaNotificationIds).filter(Boolean)
      : [];
    await Promise.all(ids.map((id) => Notifications().cancelScheduledNotificationAsync(String(id)).catch(() => {})));
    next.push({
      ...item,
      scheduled: {
        stopName: item?.scheduled?.stopName ?? null,
        etaNotificationIds: {},
      },
    });
  }
  await saveTrackedTrains(next);
}

export async function upsertTrackedTrain(item) {
  const nextItem = item && typeof item === 'object' ? item : null;
  const key = norm(nextItem?.id);
  if (!key) return null;

  const list = await getTrackedTrains();
  const without = list.filter((t) => norm(t?.id) !== key);
  const next = [nextItem, ...without].slice(0, 20);
  await saveTrackedTrains(next);
  return nextItem;
}

export async function enableTrackingForNormalizedTrain(train, options = {}) {
  const key = getTrackingKeyFromTrain(train);
  if (!key) return null;

  const targetStopName = norm(options.targetStopName) || norm(train?.nextStopName) || null;
  const notifyDelay = options.notifyDelay !== undefined ? Boolean(options.notifyDelay) : true;
  const notifyEta = options.notifyEta !== undefined ? Boolean(options.notifyEta) : true;
  const thresholds = Array.isArray(options.etaThresholds) && options.etaThresholds.length > 0 ? options.etaThresholds : [10];

  const item = {
    id: key,
    trainNumber: norm(train?.number) || null,
    type: norm(train?.type) || null,
    from: norm(train?.from) || null,
    to: norm(train?.to) || null,
    choice: train?.choice ?? null,
    originName: norm(train?.originName) || null,
    originCode: norm(train?.originCode) || null,
    technical: norm(train?.technical) || null,
    timestampRiferimento: train?.timestampRiferimento ?? null,
    date: norm(train?.date) || null,
    targetStopName,
    notifyDelay,
    notifyEta,
    etaThresholds: thresholds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0),
    state: {
      lastDelayMinutes: train?.delayMinutes ?? null,
      lastJourneyStateCode: norm(train?.journeyStateCode) || null,
      lastNextStopName: norm(train?.nextStopName) || null,
      lastUpdatedAtEpochMs: Date.now(),
    },
    scheduled: {
      stopName: targetStopName,
      etaNotificationIds: {},
    },
  };

  const notificationsEnabled = await getNotificationsEnabled();
  if (notificationsEnabled) {
    const perm = await requestNotificationPermissionIfNeeded();
    if (perm.granted) {
      // La registrazione del task viene gestita centralmente (App/init o UI).
    }
  }

  await upsertTrackedTrain(item);
  return item;
}

export async function disableTrackingForTrain(trainOrId) {
  const key = typeof trainOrId === 'string' ? norm(trainOrId) : getTrackingKeyFromTrain(trainOrId);
  if (!key) return;

  const existing = await getTrackedTrainById(key);
  if (existing?.scheduled?.etaNotificationIds) {
    const ids = Object.values(existing.scheduled.etaNotificationIds).filter(Boolean);
    if (!isExpoGo()) {
      await Promise.all(ids.map((id) => Notifications().cancelScheduledNotificationAsync(String(id)).catch(() => {})));
    }
  }

  await removeTrackedTrainById(key);
}
