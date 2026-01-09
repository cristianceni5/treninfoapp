import stationsData from '../data/stations.json';

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

      return { ...station, score };
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
  return stationsData.find(station => station.id === stationId) || null;
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
  return stationsData;
}
