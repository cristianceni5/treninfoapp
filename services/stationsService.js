import stationsData from '../data/stations-viaggiatreno.json';

function normalizeStation(station) {
  if (!station) return null;

  const region = station.region ?? station.regionId ?? null;

  const city =
    typeof station.city === 'string' && station.city.trim()
      ? station.city.trim()
      : typeof station[''] === 'string' && station[''].trim()
        ? station[''].trim()
        : null;

  const toNumberOrNull = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  };

  return {
    ...station,
    city,
    region,
    lat: toNumberOrNull(station.lat),
    lon: toNumberOrNull(station.lon),
  };
}

/**
 * Cerca stazioni in base a una query
 * @param {string} query - Termine di ricerca
 * @param {number} maxResults - Numero massimo di risultati (default: 10)
 * @returns {Array} Array di stazioni che corrispondono alla query
 */
export function searchStations(query, maxResults = 10) {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const normalizedQuery = normalizeString(query);
  const words = normalizedQuery.split(/\s+/);

  const results = stationsData
    .map(station => {
      const normalizedStation = normalizeStation(station);
      const normalizedName = normalizeString(station.name);
      
      // Calcola score di rilevanza
      let score = 0;
      
      // Se inizia con la query, priorità massima
      if (normalizedName.startsWith(normalizedQuery)) {
        score = 100;
      }
      // Se contiene tutte le parole della query
      else if (words.every(word => normalizedName.includes(word))) {
        score = 50;
        // Bonus se le parole sono all'inizio
        if (words.every(word => normalizedName.split(/\s+/).some(w => w.startsWith(word)))) {
          score = 75;
        }
      }
      // Se contiene almeno una parola
      else if (words.some(word => normalizedName.includes(word))) {
        score = 25;
      }

      return { ...normalizedStation, score };
    })
    .filter(station => station.score > 0)
    .sort((a, b) => {
      // Ordina prima per score, poi alfabeticamente
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.name.localeCompare(b.name, 'it');
    })
    .slice(0, maxResults);

  return results;
}

/**
 * Ottiene una stazione specifica per ID
 * @param {string} stationId - ID della stazione
 * @returns {Object|null} La stazione o null se non trovata
 */
export function getStationById(stationId) {
  const found = stationsData.find(station => station.id === stationId) || null;
  return found ? normalizeStation(found) : null;
}

/**
 * Ottiene una stazione specifica per nome (match tollerante su stringa normalizzata)
 * @param {string} stationName - Nome stazione
 * @returns {Object|null} La stazione o null se non trovata
 */
export function getStationByName(stationName) {
  const name = typeof stationName === 'string' ? stationName.trim() : '';
  if (!name) return null;

  const target = normalizeString(name);
  if (!target) return null;

  const exact = stationsData.find((s) => normalizeString(s?.name || '') === target) || null;
  if (exact) return normalizeStation(exact);

  const best = searchStations(name, 1)[0] || null;
  return best ? normalizeStation(best) : null;
}

/**
 * Normalizza una stringa per la ricerca (rimuove accenti, lowercase)
 */
function normalizeString(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Ottiene tutte le stazioni
 * @returns {Array} Array di tutte le stazioni
 */
export function getAllStations() {
  return stationsData.map(normalizeStation).filter(Boolean);
}
