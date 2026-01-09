/**
 * API Service per Treninfo
 * Base URL: https://treninfo.netlify.app
 * Documentazione completa: /old/API-DOCUMENTATION.md
 */

const API_BASE = 'https://treninfo.netlify.app';
const FETCH_TIMEOUT_MS = 12000; // 12 secondi come da documentazione

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
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
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
 * @returns {Promise<Object>} { ok: boolean, data: Array<{nome: string, codice: string}> }
 */
export async function searchStationsAPI(query) {
  if (!query || query.trim().length < 2) {
    return { ok: true, data: [] };
  }
  
  const url = `${API_BASE}/api/viaggiatreno/autocomplete?query=${encodeURIComponent(query)}`;
  return fetchWithTimeout(url);
}

/**
 * 2. Informazioni stazione
 * @param {string} stationCode - Codice stazione RFI (es. "S06421")
 * @returns {Promise<Object>} Dettagli stazione con coordinate, nome, regione
 */
export async function getStationInfo(stationCode) {
  const url = `${API_BASE}/api/stations/info?stationCode=${encodeURIComponent(stationCode)}`;
  return fetchWithTimeout(url);
}

/**
 * 3. Partenze da stazione
 * @param {string} stationCode - Codice stazione
 * @param {string} when - Timestamp ISO o "now" (default: "now")
 * @returns {Promise<Object>} Lista treni in partenza
 */
export async function getStationDepartures(stationCode, when = 'now') {
  const url = `${API_BASE}/api/stations/departures?stationCode=${encodeURIComponent(stationCode)}&when=${encodeURIComponent(when)}`;
  return fetchWithTimeout(url);
}

/**
 * 4. Arrivi in stazione
 * @param {string} stationCode - Codice stazione
 * @param {string} when - Timestamp ISO o "now" (default: "now")
 * @returns {Promise<Object>} Lista treni in arrivo
 */
export async function getStationArrivals(stationCode, when = 'now') {
  const url = `${API_BASE}/api/stations/arrivals?stationCode=${encodeURIComponent(stationCode)}&when=${encodeURIComponent(when)}`;
  return fetchWithTimeout(url);
}

/**
 * 5. Stato treno
 * @param {string} trainNumber - Numero treno
 * @param {Object} options - Opzioni aggiuntive
 * @param {string} options.originCode - Codice stazione origine (per disambiguare)
 * @param {string} options.technical - ID tecnico completo
 * @param {number} options.epochMs - Timestamp riferimento
 * @returns {Promise<Object>} Informazioni dettagliate treno (percorso, fermate, ritardi)
 */
export async function getTrainStatus(trainNumber, options = {}) {
  let url = `${API_BASE}/api/trains/status?trainNumber=${encodeURIComponent(trainNumber)}`;
  
  if (options.originCode) {
    url += `&originCode=${encodeURIComponent(options.originCode)}`;
  }
  if (options.technical) {
    url += `&technical=${encodeURIComponent(options.technical)}`;
  }
  if (options.epochMs) {
    url += `&epochMs=${encodeURIComponent(options.epochMs)}`;
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
 * @returns {Promise<Object>} Soluzioni di viaggio disponibili
 */
export async function getTravelSolutions(params) {
  const {
    fromName,
    toName,
    date,
    time,
    adults = 1,
    children = 0,
    frecceOnly = false,
    regionalOnly = false,
    intercityOnly = false,
    noChanges = false,
  } = params;

  let url = `${API_BASE}/api/solutions?fromName=${encodeURIComponent(fromName)}&toName=${encodeURIComponent(toName)}&date=${encodeURIComponent(date)}`;
  
  if (time) url += `&time=${encodeURIComponent(time)}`;
  if (adults !== 1) url += `&adults=${adults}`;
  if (children !== 0) url += `&children=${children}`;
  if (frecceOnly) url += `&frecceOnly=true`;
  if (regionalOnly) url += `&regionalOnly=true`;
  if (intercityOnly) url += `&intercityOnly=true`;
  if (noChanges) url += `&noChanges=true`;
  
  return fetchWithTimeout(url);
}

/**
 * Utility: Formatta timestamp epoch in stringa leggibile
 * @param {number} epochMs - Timestamp in millisecondi
 * @param {boolean} includeDate - Include anche la data (default: false)
 * @returns {string} Stringa formattata (HH:mm o DD/MM HH:mm)
 */
export function formatTimestamp(epochMs, includeDate = false) {
  if (!epochMs) return '--:--';
  
  const date = new Date(epochMs);
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
    'PLANNED': '#808080',    // Grigio
    'RUNNING': '#228B22',    // Verde
    'COMPLETED': '#0066CC',  // Blu
    'CANCELLED': '#DC143C',  // Rosso
    'PARTIAL': '#FFA500',    // Arancione
    'UNKNOWN': '#A9A9A9',    // Grigio chiaro
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
