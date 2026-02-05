import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'recentTrains';

const norm = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

const stripRecentContext = (train) => {
  if (!train || typeof train !== 'object') return train;
  const {
    date,
    timestampRiferimento,
    choice,
    choiceId,
    technical,
    technicalId,
    originName,
    origine,
    originCode,
    codiceOrigine,
    ...rest
  } = train;
  return rest;
};

const getTrainKey = (train) => {
  if (!train) return null;
  const number = norm(train.number ?? train.trainNumber) || '';
  if (!number) return norm(train.id) || null;

  return number;
};

export const getRecentTrains = async (limit = 5) => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const seen = new Set();
    const deduped = [];
    for (const t of list) {
      const key = getTrainKey(t);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push({ ...stripRecentContext(t), id: key });
    }

    // Ripulisci eventuali duplicati storici (es. id basati su timestamp).
    const normalizedForStorage = deduped.slice(0, 10).map(stripRecentContext);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedForStorage));

    return deduped.slice(0, limit);
  } catch (error) {
    console.warn('Error loading recent trains:', error);
    return [];
  }
};

export const saveRecentTrain = async (train) => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    const list = Array.isArray(parsed) ? parsed : [];

    const key = getTrainKey(train);
    if (!key) return;

    const without = list.filter((t) => getTrainKey(t) !== key);
    const next = [{ ...stripRecentContext(train), id: key }, ...without].slice(0, 10).map(stripRecentContext);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('Error saving recent train:', error);
  }
};

export const removeRecentTrain = async (trainId) => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const id = norm(trainId);
    if (!id) return;
    const next = list.filter((t) => getTrainKey(t) !== id && norm(t?.id) !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('Error removing recent train:', error);
  }
};

export const clearRecentTrains = async () => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  } catch (error) {
    console.warn('Error clearing recent trains:', error);
  }
};

export const overwriteRecentTrains = async (trains) => {
  try {
    const list = Array.isArray(trains) ? trains : [];
    const seen = new Set();
    const deduped = [];
    for (const t of list) {
      const key = getTrainKey(t);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push({ ...stripRecentContext(t), id: key });
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deduped.slice(0, 10).map(stripRecentContext)));
  } catch (error) {
    console.warn('Error overwriting recent trains:', error);
  }
};
