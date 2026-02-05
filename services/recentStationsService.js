import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_STATIONS_KEY = '@recent_stations';
const MAX_RECENT_STATIONS = 10;

// Sovrascrive l'intera lista delle stazioni recenti (utile per Undo)
export const overwriteRecentStations = async (stations) => {
  try {
    const list = Array.isArray(stations) ? stations : [];
    const trimmed = list.slice(0, MAX_RECENT_STATIONS);
    await AsyncStorage.setItem(RECENT_STATIONS_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch (error) {
    console.error('Errore nel sovrascrivere le stazioni recenti:', error);
    return [];
  }
};

// Salva una stazione nella lista delle recenti
export const saveRecentStation = async (station) => {
  try {
    // Recupera le stazioni recenti esistenti
    const existingString = await AsyncStorage.getItem(RECENT_STATIONS_KEY);
    let recentStations = existingString ? JSON.parse(existingString) : [];
    
    // Rimuovi la stazione se già presente (per spostarla in cima)
    recentStations = recentStations.filter(s => s.id !== station.id);
    
    // Aggiungi la nuova stazione in cima
    recentStations.unshift({
      id: station.id,
      name: station.name,
      region: station.region,
      lat: station.lat,
      lon: station.lon,
      timestamp: new Date().toISOString()
    });
    
    // Mantieni solo le ultime MAX_RECENT_STATIONS
    if (recentStations.length > MAX_RECENT_STATIONS) {
      recentStations = recentStations.slice(0, MAX_RECENT_STATIONS);
    }
    
    await AsyncStorage.setItem(RECENT_STATIONS_KEY, JSON.stringify(recentStations));
    return recentStations;
  } catch (error) {
    console.error('Errore nel salvare la stazione recente:', error);
    return [];
  }
};

// Recupera le stazioni recenti
export const getRecentStations = async (limit = 5) => {
  try {
    const existingString = await AsyncStorage.getItem(RECENT_STATIONS_KEY);
    if (!existingString) return [];
    
    const recentStations = JSON.parse(existingString);
    return recentStations.slice(0, limit);
  } catch (error) {
    console.error('Errore nel recuperare le stazioni recenti:', error);
    return [];
  }
};

// Rimuovi una singola stazione recente
export const removeRecentStation = async (stationId) => {
  try {
    const existingString = await AsyncStorage.getItem(RECENT_STATIONS_KEY);
    if (!existingString) return [];
    
    const recentStations = JSON.parse(existingString);
    const filteredStations = recentStations.filter(s => s.id !== stationId);
    
    await AsyncStorage.setItem(RECENT_STATIONS_KEY, JSON.stringify(filteredStations));
    return filteredStations;
  } catch (error) {
    console.error('Errore nel rimuovere la stazione recente:', error);
    return [];
  }
};

// Cancella tutte le stazioni recenti
export const clearRecentStations = async () => {
  try {
    await AsyncStorage.removeItem(RECENT_STATIONS_KEY);
    return true;
  } catch (error) {
    console.error('Errore nel cancellare le stazioni recenti:', error);
    return false;
  }
};
