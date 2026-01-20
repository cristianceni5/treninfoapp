/**
 * API Service per Treninfo
 * Base URL: https://treninfo.netlify.app
 * Documentazione completa: `old/API-DOCUMENTATION.md`
 */

import { decode as heDecode } from 'he';

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'https://treninfo.netlify.app';
const FETCH_TIMEOUT_MS = 12000; // 12 secondi come da documentazione

/**
 * Utility: Decodifica HTML entities (es. "&agrave;", "&#252;") in testo leggibile.
 * Il backend può inviare messaggi già HTML-escaped.
 * @param {unknown} value
 * @returns {string|null}
 */
export function decodeHtmlEntities(value) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (!text) return '';
  try {
    return heDecode(text);
  } catch {
    return text;
  }
}

/**
 * Wrapper fetch con timeout
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const raw = await response.text();
    const parseJson = () => {
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };
    const data = parseJson();

    if (!response.ok) {
      const messageFromBody =
        (data && typeof data === 'object' && (data.error || data.message)) ? String(data.error || data.message) : null;
      const message = messageFromBody || `HTTP ${response.status}: ${response.statusText}`;
      const err = new Error(message);
      err.status = response.status;
      err.data = data;
      err.url = url;
      throw err;
    }

    if (data !== null) return data;
    if (!raw) return null;
    throw new Error('Risposta non valida (JSON atteso)');
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Richiesta scaduta (timeout)');
    }
    throw error;
  }
}

/**
 * 1. Cerca stazioni (autocomplete)
 * @param {string} query - Testo da cercare (min 2 caratteri)
 * @returns {Promise<Object>} { ok: boolean, data: Array<string> }
 */
export async function searchStationsAPI(query) {
  if (!query || query.trim().length < 2) {
    return { ok: true, data: [] };
  }
  
  // Preferito (nuovo): /api/stations/autocomplete
  // Proviamo in ordine: LeFrecce (migliore per soluzioni), poi stations, poi ViaggiaTreno
  const q = encodeURIComponent(query);
  try {
    return await fetchWithTimeout(`${API_BASE}/api/lefrecce/autocomplete?query=${q}`);
  } catch (err1) {
    try {
      return await fetchWithTimeout(`${API_BASE}/api/stations/autocomplete?query=${q}`);
    } catch (err2) {
      return fetchWithTimeout(`${API_BASE}/api/viaggiatreno/autocomplete?query=${q}`);
    }
  }
}

/**
 * 2. Informazioni stazione
 * @param {string} station - Nome stazione (consigliato) oppure codice RFI (es. "S06421")
 * @returns {Promise<Object>} Dettagli stazione con coordinate, nome, regione
 */
export async function getStationInfo(station) {
  const value = String(station || '').trim();
  const isCode = /^S\d{5}$/.test(value);
  const qs = isCode ? `stationCode=${encodeURIComponent(value)}` : `stationName=${encodeURIComponent(value)}`;
  const url = `${API_BASE}/api/stations/info?${qs}`;
  return fetchWithTimeout(url);
}

/**
 * 3. Partenze da stazione
 * @param {string} station - Nome stazione (consigliato) oppure codice RFI
 * @param {string} when - Timestamp ISO o "now" (default: "now")
 * @returns {Promise<Object>} Lista treni in partenza
 */
export async function getStationDepartures(station, when = 'now') {
  const value = String(station || '').trim();
  const isCode = /^S\d{5}$/.test(value);
  const qsStation = isCode ? `stationCode=${encodeURIComponent(value)}` : `stationName=${encodeURIComponent(value)}`;
  const url = `${API_BASE}/api/stations/departures?${qsStation}&when=${encodeURIComponent(when)}`;
  return fetchWithTimeout(url);
}

/**
 * 4. Arrivi in stazione
 * @param {string} station - Nome stazione (consigliato) oppure codice RFI
 * @param {string} when - Timestamp ISO o "now" (default: "now")
 * @returns {Promise<Object>} Lista treni in arrivo
 */
export async function getStationArrivals(station, when = 'now') {
  const value = String(station || '').trim();
  const isCode = /^S\d{5}$/.test(value);
  const qsStation = isCode ? `stationCode=${encodeURIComponent(value)}` : `stationName=${encodeURIComponent(value)}`;
  const url = `${API_BASE}/api/stations/arrivals?${qsStation}&when=${encodeURIComponent(when)}`;
  return fetchWithTimeout(url);
}

/**
 * 5. Stato treno
 * @param {string} trainNumber - Numero treno
 * @param {Object} options - Opzioni aggiuntive
 * @param {string} options.originName - Origine (per disambiguare, nuovo backend)
 * @param {number|string} options.choice - Indice scelta (per disambiguare, nuovo backend)
 * @param {string} options.originCode - Codice stazione origine (legacy)
 * @param {string} options.technical - ID tecnico completo (legacy)
 * @param {number} options.epochMs - Timestamp riferimento
 * @returns {Promise<Object>} Informazioni dettagliate treno (percorso, fermate, ritardi)
 */
export async function getTrainStatus(trainNumber, options = {}) {
  let url = `${API_BASE}/api/trains/status?trainNumber=${encodeURIComponent(trainNumber)}`;

  // Nuovi parametri backend
  if (options.originName) url += `&originName=${encodeURIComponent(options.originName)}`;
  if (options.choice !== undefined && options.choice !== null && String(options.choice).trim() !== '') {
    url += `&choice=${encodeURIComponent(options.choice)}`;
  }
  // Selezione per data (nuovo backend): accetta date/timestampRiferimento
  if (options.date) url += `&date=${encodeURIComponent(options.date)}`;
  if (options.timestampRiferimento !== undefined && options.timestampRiferimento !== null && String(options.timestampRiferimento).trim() !== '') {
    url += `&timestampRiferimento=${encodeURIComponent(options.timestampRiferimento)}`;
  }

  // Compatibilità legacy: lasciali passare (se il backend li ignora non è un problema).
  if (options.originCode) url += `&originCode=${encodeURIComponent(options.originCode)}`;
  if (options.technical) url += `&technical=${encodeURIComponent(options.technical)}`;

  const ts = options.epochMs ?? options.referenceTimestamp ?? options.timestamp;
  if (ts) {
    url += `&epochMs=${encodeURIComponent(ts)}`;
    url += `&referenceTimestamp=${encodeURIComponent(ts)}`;
  }
  
  return fetchWithTimeout(url);
}

/**
 * 6. Soluzioni di viaggio
 * @param {Object} params - Parametri ricerca
 * @param {string} params.fromName - Nome stazione partenza
 * @param {string} params.toName - Nome stazione arrivo
 * @param {string} params.date - Data viaggio (YYYY-MM-DD)
 * @param {string} params.time - Ora viaggio (HH:mm) [opzionale]
 * @param {number} params.adults - Numero adulti (default: 1)
 * @param {number} params.children - Numero bambini (default: 0)
 * @param {boolean} params.frecceOnly - Solo Frecce
 * @param {boolean} params.regionalOnly - Solo regionali
 * @param {boolean} params.intercityOnly - Solo Intercity
 * @param {boolean} params.noChanges - Solo soluzioni dirette
 * @param {string} params.order - Ordinamento LeFrecce (es. "DEPARTURE_DATE") [opzionale]
 * @param {number} params.offset - Offset risultati (paginazione) [opzionale]
 * @param {number} params.limit - Limite risultati (paginazione) [opzionale]
 * @param {boolean} params.bestFare - Miglior tariffa (advancedSearchRequest) [opzionale]
 * @param {boolean} params.bikeFilter - Filtro bici (advancedSearchRequest) [opzionale]
 * @returns {Promise<Object>} Soluzioni di viaggio disponibili
 */
export async function getTravelSolutions(params) {
  const {
    fromName,
    fromId,
    fromStationCode,
    toName,
    toId,
    toStationCode,
    date,
    time,
    frecceOnly = false,
    regionalOnly = false,
    intercityOnly = false,
    noChanges = false,
    order = null,
    offset = null,
    limit = null,
    bestFare = false,
    bikeFilter = false,
  } = params;

  let url = `${API_BASE}/api/solutions?date=${encodeURIComponent(date)}`;
  if (fromId !== undefined && fromId !== null && String(fromId).trim() !== '') {
    url += `&fromId=${encodeURIComponent(String(fromId))}`;
  } else if (fromStationCode !== undefined && fromStationCode !== null && String(fromStationCode).trim() !== '') {
    url += `&fromStationCode=${encodeURIComponent(String(fromStationCode))}`;
  } else {
    url += `&fromName=${encodeURIComponent(fromName)}`;
  }

  if (toId !== undefined && toId !== null && String(toId).trim() !== '') {
    url += `&toId=${encodeURIComponent(String(toId))}`;
  } else if (toStationCode !== undefined && toStationCode !== null && String(toStationCode).trim() !== '') {
    url += `&toStationCode=${encodeURIComponent(String(toStationCode))}`;
  } else {
    url += `&toName=${encodeURIComponent(toName)}`;
  }
  if (time) url += `&time=${encodeURIComponent(time)}`;
  if (frecceOnly) url += `&frecceOnly=true`;
  if (regionalOnly) url += `&regionalOnly=true`;
  if (intercityOnly) url += `&intercityOnly=true`;
  if (noChanges) url += `&noChanges=true`;
  if (order) url += `&order=${encodeURIComponent(order)}`;
  if (offset !== null && offset !== undefined && Number.isFinite(Number(offset))) url += `&offset=${Number(offset)}`;
  if (limit !== null && limit !== undefined && Number.isFinite(Number(limit))) url += `&limit=${Number(limit)}`;
  if (bestFare) url += `&bestFare=true`;
  if (bikeFilter) url += `&bikeFilter=true`;

  let resp;
  try {
    resp = await fetchWithTimeout(url);
  } catch (error) {
    return {
      ok: false,
      solutions: [],
      minimumPrices: null,
      searchId: null,
      error: error?.message || 'Errore nel recupero soluzioni',
    };
  }

  // Normalizziamo nomi dei campi: alcuni backend rispondono in italiano (es. `soluzioni`),
  // altri in inglese (`solutions`). Restituiamo sempre `{ ok, solutions, minimumPrices, searchId, error? }`.
  const normalized = {
    ok: resp?.ok === undefined ? true : resp.ok,
    solutions: Array.isArray(resp?.solutions)
      ? resp.solutions
      : Array.isArray(resp?.soluzioni)
      ? resp.soluzioni
      : [],
    minimumPrices: resp?.minimumPrices ?? resp?.minimumPrices ?? resp?.minimumPrices ?? null,
    searchId: resp?.searchId ?? resp?.idRicerca ?? null,
    error: resp?.error ?? null,
  };

  // Se le soluzioni sono nella forma legacy (italiano), normalizziamo ogni elemento
  const mapSolution = (s) => {
    if (!s || typeof s !== 'object') return s;

    const parseHm = (val) => {
      const tm = String(val || '').trim();
      if (!/^\d{1,2}:\d{2}$/.test(tm)) return null;
      const [hRaw, mRaw] = tm.split(':');
      const hh = Number(hRaw);
      const mm = Number(mRaw);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
      return { hh: Math.max(0, Math.min(23, hh)), mm: Math.max(0, Math.min(59, mm)) };
    };

    const toLocalIso = (dt) => {
      if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return null;
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      const hh = String(dt.getHours()).padStart(2, '0');
      const mm = String(dt.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${d}T${hh}:${mm}:00.000`;
    };

    const makeLocalDate = (ymd, hm, dayOffset = 0) => {
      if (!ymd || !hm) return null;
      const base = new Date(`${ymd}T00:00:00`);
      if (Number.isNaN(base.getTime())) return null;
      base.setDate(base.getDate() + dayOffset);
      base.setHours(hm.hh, hm.mm, 0, 0);
      return base;
    };

    const dep = s.departureTime || s.partenza || s.partenzaTime || s.partenza || s.orarioPartenza || s.orarioPartenza2;
    const arr = s.arrivalTime || s.arrivo || s.orarioArrivo || s.arrival || s.orarioArrivo2;

    const depIsoRaw = String(dep || '').trim();
    const arrIsoRaw = String(arr || '').trim();

    const durationMinutes =
      typeof s.durata === 'number'
        ? s.durata
        : typeof s.duration === 'number'
        ? s.duration
        : null;

    const depHm = parseHm(depIsoRaw);
    const arrHm = parseHm(arrIsoRaw);

    let depDateObj = /^\d{4}-\d{2}-\d{2}T/.test(depIsoRaw) ? new Date(depIsoRaw) : makeLocalDate(date, depHm);
    if (depDateObj && Number.isNaN(depDateObj.getTime())) depDateObj = null;

    let arrivalDateObj = null;
    if (/^\d{4}-\d{2}-\d{2}T/.test(arrIsoRaw)) {
      const d = new Date(arrIsoRaw);
      arrivalDateObj = Number.isNaN(d.getTime()) ? null : d;
    } else if (depDateObj && Number.isFinite(Number(durationMinutes)) && Number(durationMinutes) > 0) {
      arrivalDateObj = new Date(depDateObj.getTime() + Number(durationMinutes) * 60000);
    } else if (date && arrHm) {
      arrivalDateObj = makeLocalDate(date, arrHm);
      if (arrivalDateObj && depDateObj && arrivalDateObj.getTime() < depDateObj.getTime()) {
        arrivalDateObj.setDate(arrivalDateObj.getDate() + 1);
      }
    }

    const departureTime = /^\d{4}-\d{2}-\d{2}T/.test(depIsoRaw) ? depIsoRaw : toLocalIso(depDateObj);
    const arrivalTime = /^\d{4}-\d{2}-\d{2}T/.test(arrIsoRaw) ? arrIsoRaw : toLocalIso(arrivalDateObj);

    const legacyTrains = s.treni || s.trains || s.vehicles || s.nodes || s.segments || s.solutionSegments || s.segmentsList || [];
    const nodes = (() => {
      if (!Array.isArray(legacyTrains)) return [];

      let cursor = depDateObj || (date && depHm ? makeLocalDate(date, depHm) : null);
      if (cursor && Number.isNaN(cursor.getTime())) cursor = null;
      if (!cursor && date) cursor = makeLocalDate(date, parseHm('00:00'));

      const out = [];
      for (const t of legacyTrains) {
        if (!t || typeof t !== 'object') continue;
        const tDep = t.departureTime || t.orarioPartenza || t.orarioPartenza || t.orarioPartenza;
        const tArr = t.arrivalTime || t.orarioArrivo || t.orarioArrivo || t.orarioArrivo;
        const number = t.numeroTreno || t.numero || t.number || t.trainNumber || t.num || null;
        const tipo = t.tipoTreno || t.tipo || t.tipoTreno || t.tipo_treno || null;
        const acronym = (typeof tipo === 'object' ? tipo.sigla || tipo.acronym || tipo.code : tipo) || '';
        const name = (typeof tipo === 'object' ? tipo.nome || tipo.name : null) || '';

        const tDepRaw = String(tDep || '').trim();
        const tArrRaw = String(tArr || '').trim();

        let depSeg = null;
        if (/^\d{4}-\d{2}-\d{2}T/.test(tDepRaw)) {
          const d = new Date(tDepRaw);
          depSeg = Number.isNaN(d.getTime()) ? null : d;
        } else if (cursor && date) {
          const hm = parseHm(tDepRaw);
          if (hm) {
            depSeg = new Date(cursor.getTime());
            depSeg.setHours(hm.hh, hm.mm, 0, 0);
            if (depSeg.getTime() < cursor.getTime()) depSeg.setDate(depSeg.getDate() + 1);
          }
        } else if (date) {
          depSeg = makeLocalDate(date, parseHm(tDepRaw), 0);
        }

        if (depSeg && cursor && depSeg.getTime() < cursor.getTime()) {
          // safety: mantieni monotonia anche su edge cases
          while (depSeg.getTime() < cursor.getTime()) depSeg.setDate(depSeg.getDate() + 1);
        }
        if (depSeg) cursor = depSeg;

        let arrSeg = null;
        if (/^\d{4}-\d{2}-\d{2}T/.test(tArrRaw)) {
          const d = new Date(tArrRaw);
          arrSeg = Number.isNaN(d.getTime()) ? null : d;
        } else if (depSeg && date) {
          const hm = parseHm(tArrRaw);
          if (hm) {
            arrSeg = new Date(depSeg.getTime());
            arrSeg.setHours(hm.hh, hm.mm, 0, 0);
            if (arrSeg.getTime() < depSeg.getTime()) arrSeg.setDate(arrSeg.getDate() + 1);
          }
        } else if (date) {
          arrSeg = makeLocalDate(date, parseHm(tArrRaw), 0);
        }

        if (arrSeg && depSeg && arrSeg.getTime() < depSeg.getTime()) {
          while (arrSeg.getTime() < depSeg.getTime()) arrSeg.setDate(arrSeg.getDate() + 1);
        }
        if (arrSeg) cursor = arrSeg;

        out.push({
          departureTime: /^\d{4}-\d{2}-\d{2}T/.test(tDepRaw) ? tDepRaw : toLocalIso(depSeg),
          arrivalTime: /^\d{4}-\d{2}-\d{2}T/.test(tArrRaw) ? tArrRaw : toLocalIso(arrSeg),
          origin: t.da || t.origin || t.startLocation || t.from || '',
          destination: t.a || t.destinazione || t.destination || t.to || t.endLocation || '',
          train: {
            trainIdentifier: number ? String(number) : undefined,
            acronym: String(acronym).trim(),
            denomination: name || undefined,
          },
        });
      }
      return out.filter(Boolean);
    })();

    const rawPrice = s.prezzo ?? (s.price && s.price.amount) ?? (s.minPrice && s.minPrice.amount) ?? null;
    const rawCurrency = (s.prezzo && typeof s.prezzo === 'object' ? (s.prezzo.valuta || s.prezzo.currency) : null) ?? null;
    const rawAmount =
      rawPrice && typeof rawPrice === 'object'
        ? rawPrice.importo ?? rawPrice.amount ?? rawPrice.prezzo ?? null
        : rawPrice;
    const numericAmount = rawAmount === null || rawAmount === undefined ? null : Number(rawAmount);
    const price =
      numericAmount !== null && Number.isFinite(numericAmount)
        ? { amount: numericAmount, currency: rawCurrency || '€' }
        : null;

    const durationValue =
      typeof s.duration === 'string'
        ? s.duration
        : typeof s.durata === 'number'
        ? s.durata
        : typeof s.duration === 'number'
        ? s.duration
        : s.duration ?? s.durata ?? null;

    return {
      id: s.id ?? s.solutionId ?? s.searchSolutionId ?? s.idRicerca ?? null,
      departureTime: departureTime || null,
      arrivalTime: arrivalTime || null,
      duration: durationValue,
      nodes,
      price,
      raw: s,
    };
  };

  normalized.solutions = normalized.solutions.map((s) => mapSolution(s));

  return normalized;
}

/**
 * Utility: Formatta timestamp epoch in stringa leggibile
 * @param {number} epochMs - Timestamp in millisecondi
 * @param {boolean} includeDate - Include anche la data (default: false)
 * @returns {string} Stringa formattata (HH:mm o DD/MM HH:mm)
 */
export function formatTimestamp(epochMs, includeDate = false) {
  if (!epochMs) return '--:--';

  const ts = Number(epochMs);
  if (!Number.isFinite(ts) || ts <= 0) return '--:--';

  const date = new Date(ts);

  // In inverno l'Italia è UTC+1: se il device è in UTC, forziamo Europe/Rome.
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
      const time = new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);

      if (includeDate) {
        const dayMonth = new Intl.DateTimeFormat('it-IT', {
          timeZone: 'Europe/Rome',
          day: '2-digit',
          month: '2-digit',
        }).format(date);
        return `${dayMonth} ${time}`;
      }

      return time;
    }
  } catch {
    // fallback sotto
  }

  // Fallback: timezone del device
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  if (includeDate) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month} ${hours}:${minutes}`;
  }

  return `${hours}:${minutes}`;
}

/**
 * Utility: Formatta ritardo in stringa leggibile
 * @param {number} delay - Ritardo in minuti (può essere negativo per anticipo)
 * @returns {string} Stringa formattata (es. "+15 min", "in orario", "-3 min")
 */
export function formatDelay(delay) {
  if (delay === null || delay === undefined) return 'N/D';
  if (delay === 0) return 'in orario';
  if (delay > 0) return `+${delay} min`;
  return `${delay} min`; // negativo = anticipo
}

/**
 * Utility: Ottiene il colore per la categoria treno
 * @param {string} category - Categoria treno (high-speed, intercity, regional, bus, unknown)
 * @returns {string} Codice colore hex
 */
export function getTrainCategoryColor(category) {
  const colors = {
    'high-speed': '#DC143C', // Rosso per Frecce
    'intercity': '#0066CC',   // Blu per Intercity
    'regional': '#228B22',    // Verde per Regionali
    'bus': '#FFA500',         // Arancione per Bus
    'unknown': '#808080',     // Grigio per Sconosciuto
  };
  return colors[category] || colors.unknown;
}

/**
 * Utility: Ottiene il colore per lo stato corsa
 * @param {string} stateCode - Codice stato (PLANNED, RUNNING, COMPLETED, CANCELLED, PARTIAL, UNKNOWN)
 * @returns {string} Codice colore hex
 */
export function getJourneyStateColor(stateCode) {
  const colors = {
    'PLANNED': '#8B8B95',    // Neutro
    'RUNNING': '#00B894',    // Teal (in viaggio)
    'COMPLETED': '#0984E3',  // Blu
    'CANCELLED': '#D63031',  // Rosso
    'PARTIAL': '#E17055',    // Arancio
    'UNKNOWN': '#B2BEC3',    // Grigio chiaro
  };
  return colors[stateCode] || colors.UNKNOWN;
}

/**
 * Utility: Calcola tempo relativo (es. "2 minuti fa", "tra 5 minuti")
 * @param {number} epochMs - Timestamp in millisecondi
 * @returns {string} Stringa relativa
 */
export function getRelativeTime(epochMs) {
  if (!epochMs) return 'N/D';
  
  const now = Date.now();
  const diffMs = epochMs - now;
  const diffMinutes = Math.round(diffMs / 60000);
  
  if (Math.abs(diffMinutes) < 1) return 'ora';
  if (diffMinutes > 0) return `tra ${diffMinutes} min`;
  return `${Math.abs(diffMinutes)} min fa`;
}

/**
 * Costanti utili
 */
export const TRAIN_CATEGORIES = {
  HIGH_SPEED: 'high-speed',
  INTERCITY: 'intercity',
  REGIONAL: 'regional',
  BUS: 'bus',
  UNKNOWN: 'unknown',
};

export const JOURNEY_STATES = {
  PLANNED: 'PLANNED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  PARTIAL: 'PARTIAL',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Refresh consigliato: 60 secondi per stato treni (come da documentazione)
 */
export const TRAIN_AUTO_REFRESH_INTERVAL_MS = 60000;
