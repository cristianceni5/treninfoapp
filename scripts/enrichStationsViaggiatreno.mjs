import fs from 'node:fs/promises';
import path from 'node:path';

const WORKDIR = process.cwd();
const DATA_PATH = path.join(WORKDIR, 'data', 'stations-viaggiatreno.json');
const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'https://treninfo.netlify.app';
const LEFRECCE_BASE = 'https://www.lefrecce.it/Channels.Website.BFF.WEB';

const MAX_CONCURRENCY = Number(process.env.ENRICH_CONCURRENCY || 4);
const LEFRECCE_LIMIT = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const normalizeForKey = (str) =>
  String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

const normalizeForWords = (str) =>
  String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

const isValidCoord = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) > 1;

async function fetchJsonWithRetry(url, { method = 'GET', headers = {}, timeoutMs = 15000 } = {}, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers, signal: controller.signal });
      const text = await res.text();
      clearTimeout(t);

      if (res.status === 429) {
        const wait = 750 + attempt * 750;
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        if (attempt < retries) {
          await sleep(350 + attempt * 350);
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    } catch (e) {
      clearTimeout(t);
      if (attempt < retries) {
        await sleep(350 + attempt * 350);
        continue;
      }
      throw e;
    }
  }
  return null;
}

async function getViaggiaTrenoStationInfo(stationCode) {
  const code = String(stationCode || '').trim();
  if (!/^S\\d{5}$/.test(code)) return null;
  const url = `${API_BASE}/api/stations/info?stationCode=${encodeURIComponent(code)}`;
  const json = await fetchJsonWithRetry(url, {}, 2);
  if (!json?.ok) return null;
  return {
    regionId: json?.regione ?? null,
    lat: typeof json?.latitudine === 'number' ? json.latitudine : null,
    lon: typeof json?.longitudine === 'number' ? json.longitudine : null,
    name: typeof json?.stazione === 'string' ? json.stazione.trim() : null,
  };
}

const lefrecceCache = new Map();
async function searchLefrecce(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  if (lefrecceCache.has(q)) return lefrecceCache.get(q);

  const url = `${LEFRECCE_BASE}/website/locations/search?name=${encodeURIComponent(q)}&limit=${LEFRECCE_LIMIT}`;
  const json = await fetchJsonWithRetry(
    url,
    {
      headers: {
        accept: 'application/json, text/plain, */*',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      },
    },
    2
  );

  const list = Array.isArray(json) ? json : [];
  lefrecceCache.set(q, list);
  return list;
}

function scoreCandidate(stationName, candidate) {
  const a = String(stationName || '').trim();
  const b = String(candidate?.displayName || candidate?.name || '').trim();
  if (!a || !b) return -Infinity;

  const aKey = normalizeForKey(a);
  const bKey = normalizeForKey(b);
  if (!aKey || !bKey) return -Infinity;

  if (aKey === bKey) return 10000;

  let score = 0;
  if (bKey.includes(aKey) || aKey.includes(bKey)) score += 1800;

  const aWords = normalizeForWords(a);
  const bWords = normalizeForWords(b);
  const aSet = new Set(aWords);
  const bSet = new Set(bWords);
  let overlap = 0;
  for (const w of aSet) if (bSet.has(w)) overlap++;
  score += overlap * 220;

  const first = aWords[0];
  if (first && bWords[0] === first) score += 250;

  // penalità per parole mancanti
  const missing = Math.max(0, aSet.size - overlap);
  score -= missing * 140;

  // preferisci risultati "stazione" (non multistation) se parità
  if (candidate?.multistation === false) score += 40;

  // penalità per differenza lunghezza
  score -= Math.abs(aKey.length - bKey.length) * 6;
  return score;
}

function buildQueryCandidates(stationName) {
  const raw = String(stationName || '').trim();
  if (!raw) return [];

  const noParens = raw.replace(/\\s*\\([^)]*\\)\\s*/g, ' ').replace(/\\s+/g, ' ').trim();
  const spaced = raw.replace(/[\\-_/]+/g, ' ').replace(/\\s+/g, ' ').trim();
  const noDots = raw.replace(/[.]/g, '').replace(/\\s+/g, ' ').trim();
  const noDotsSpaced = spaced.replace(/[.]/g, '').replace(/\\s+/g, ' ').trim();

  const tokens = normalizeForWords(raw);
  const progressive = [];
  // prova varianti rimuovendo token finali (es. "Abano Terme" -> "Abano")
  for (let k = tokens.length; k >= 1; k--) {
    progressive.push(tokens.slice(0, k).join(' '));
  }

  // alcune parole spesso "rumore" per LeFrecce
  const stopSuffixes = ['terme', 'tavernelle', 'contr', 'contrada', 'stazione'];
  const trimmedStop = (() => {
    const t = [...tokens];
    while (t.length > 1 && stopSuffixes.includes(t[t.length - 1])) t.pop();
    return t.join(' ');
  })();

  return uniq([raw, noParens, spaced, noDots, noDotsSpaced, trimmedStop, ...progressive]).filter((q) => q.length >= 2);
}

async function resolveLefrecceId(stationName) {
  const candidates = buildQueryCandidates(stationName);
  for (const q of candidates) {
    const list = await searchLefrecce(q);
    if (!Array.isArray(list) || list.length === 0) continue;

    let best = null;
    let bestScore = -Infinity;
    for (const item of list) {
      const s = scoreCandidate(stationName, item);
      if (s > bestScore) {
        bestScore = s;
        best = item;
      }
    }

    // soglia empirica: evita match sbagliati
    if (best && bestScore >= 900) {
      const id = typeof best.id === 'number' ? best.id : Number(best.id);
      if (!Number.isNaN(id)) {
        return {
          id,
          name: best.displayName || best.name || null,
          multistation: best.multistation ?? null,
          centroidId: best.centroidId ?? null,
          query: q,
          score: bestScore,
        };
      }
    }
  }
  return null;
}

async function withConcurrency(items, limit, worker) {
  let idx = 0;
  const out = new Array(items.length);
  const runners = new Array(limit).fill(0).map(async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) break;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

const main = async () => {
  const raw = await fs.readFile(DATA_PATH, 'utf8');
  const stations = JSON.parse(raw);
  if (!Array.isArray(stations) || stations.length === 0) {
    throw new Error('stations-viaggiatreno.json vuoto o non valido');
  }

  const toFix = stations.filter((s) => {
    const lat = typeof s?.lat === 'number' ? s.lat : null;
    const lon = typeof s?.lon === 'number' ? s.lon : null;
    const regionId = s?.regionId ?? null;
    const coordsOk = isValidCoord(lat) && isValidCoord(lon);
    const regionOk = regionId !== null && regionId !== undefined && String(regionId).trim() !== '';
    return !coordsOk || !regionOk || s?.lefrecceId === null || s?.lefrecceId === undefined;
  });

  console.log(`Totale stazioni: ${stations.length}`);
  console.log(`Da arricchire (info/lefrecce): ${toFix.length}`);

  let done = 0;
  const start = Date.now();

  const updated = await withConcurrency(stations, MAX_CONCURRENCY, async (s) => {
    const station = { ...s };

    // 1) completa info ViaggiaTreno se mancanti o chiaramente invalidi
    const coordsOk = isValidCoord(station.lat) && isValidCoord(station.lon);
    const regionOk = station.regionId !== null && station.regionId !== undefined && String(station.regionId).trim() !== '';

    if (!coordsOk || !regionOk) {
      const info = await getViaggiaTrenoStationInfo(station.id);
      if (info) {
        if (!coordsOk) {
          if (typeof info.lat === 'number') station.lat = info.lat;
          if (typeof info.lon === 'number') station.lon = info.lon;
        }
        if (!regionOk && info.regionId !== null && info.regionId !== undefined) {
          station.regionId = String(info.regionId);
        }
      }
    }

    // 2) risolvi LeFrecce id se mancante
    if (station.lefrecceId === null || station.lefrecceId === undefined) {
      const resolved = await resolveLefrecceId(station.name);
      if (resolved?.id) {
        station.lefrecceId = resolved.id;
        station.lefrecceName = resolved.name;
        station.lefrecceMultistation = resolved.multistation;
        station.lefrecceCentroidId = resolved.centroidId;
        station.lefrecceMatchQuery = resolved.query;
        station.lefrecceMatchScore = resolved.score;
      } else {
        station.lefrecceId = null;
      }
    }

    done++;
    if (done % 100 === 0) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`Progress: ${done}/${stations.length} (${elapsed}s)`);
    }

    return station;
  });

  updated.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'it'));
  await fs.writeFile(DATA_PATH, JSON.stringify(updated, null, 2) + '\n', 'utf8');

  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`Fatto in ${elapsed}s. File aggiornato: ${DATA_PATH}`);
};

await main();

