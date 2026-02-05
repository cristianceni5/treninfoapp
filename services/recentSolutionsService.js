import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'recentSolutions';
const MAX_RECENTS = 10;

const norm = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

const makeKey = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const fromName = norm(entry.fromName);
  const toName = norm(entry.toName);
  if (!fromName || !toName) return null;

  const fromId = norm(entry.fromId);
  const toId = norm(entry.toId);
  const parts = [`${fromName}→${toName}`];
  if (fromId) parts.push(`fromId:${fromId}`);
  if (toId) parts.push(`toId:${toId}`);
  return parts.join('|');
};

const pickRouteEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const fromName = norm(entry.fromName);
  const toName = norm(entry.toName);
  if (!fromName || !toName) return null;
  return {
    fromName,
    fromId: entry.fromId ?? null,
    toName,
    toId: entry.toId ?? null,
  };
};

export const getRecentSolutions = async (limit = 5) => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    const list = Array.isArray(parsed) ? parsed : [];

    const seen = new Set();
    const deduped = [];
    for (const e of list) {
      const base = pickRouteEntry(e);
      const id = makeKey(base);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      deduped.push({ ...base, id });
    }

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deduped.slice(0, MAX_RECENTS)));
    return deduped.slice(0, limit);
  } catch (error) {
    console.warn('Error loading recent solutions:', error);
    return [];
  }
};

export const saveRecentSolution = async (entry) => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    const list = Array.isArray(parsed) ? parsed : [];

    const base = pickRouteEntry(entry);
    const id = makeKey(base);
    if (!id) return;

    const without = list.filter((e) => makeKey(e) !== id && norm(e?.id) !== id);
    const cleaned = without.map((e) => pickRouteEntry(e)).filter(Boolean);
    const next = [{ ...base, id }, ...cleaned].slice(0, MAX_RECENTS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('Error saving recent solution:', error);
  }
};

export const removeRecentSolution = async (solutionId) => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const id = norm(solutionId);
    if (!id) return;
    const next = list.filter((e) => makeKey(e) !== id && norm(e?.id) !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('Error removing recent solution:', error);
  }
};

export const clearRecentSolutions = async () => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  } catch (error) {
    console.warn('Error clearing recent solutions:', error);
  }
};

export const overwriteRecentSolutions = async (entries) => {
  try {
    const list = Array.isArray(entries) ? entries : [];
    const seen = new Set();
    const deduped = [];
    for (const e of list) {
      const base = pickRouteEntry(e);
      const id = makeKey(base);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      deduped.push({ ...base, id });
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deduped.slice(0, MAX_RECENTS)));
  } catch (error) {
    console.warn('Error overwriting recent solutions:', error);
  }
};
