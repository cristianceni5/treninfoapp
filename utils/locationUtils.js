// Calcola la distanza tra due coordinate usando la formula di Haversine
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Raggio della Terra in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return distance; // Ritorna la distanza in km
};

// Trova le stazioni vicine alla posizione dell'utente
export const getNearbyStations = (userLat, userLon, allStations, maxDistance = 50, limit = 5) => {
  // Calcola la distanza per ogni stazione
  const stationsWithDistance = allStations.map(station => ({
    ...station,
    distance: calculateDistance(userLat, userLon, station.lat, station.lon)
  }));
  
  // Filtra per distanza massima, ordina per distanza e limita i risultati
  return stationsWithDistance
    .filter(station => station.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
};

// Formatta la distanza per la visualizzazione
export const formatDistance = (distanceInKm) => {
  if (distanceInKm < 1) {
    return `${Math.round(distanceInKm * 1000)} m`;
  } else {
    return `${distanceInKm.toFixed(1)} km`;
  }
};
