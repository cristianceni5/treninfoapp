/**
 * Mappatura codici regione RFI -> Nomi regioni italiane
 */
export const REGION_LABELS = {
  '1': 'Lombardia',
  '2': 'Liguria',
  '3': 'Piemonte',
  '4': "Valle d'Aosta",
  '5': 'Lazio',
  '6': 'Umbria',
  '7': 'Molise',
  '8': 'Emilia-Romagna',
  '10': 'Friuli Venezia Giulia',
  '11': 'Marche',
  '12': 'Veneto',
  '13': 'Toscana',
  '14': 'Sicilia',
  '15': 'Basilicata',
  '16': 'Puglia',
  '17': 'Calabria',
  '18': 'Campania',
  '19': 'Abruzzo',
  '20': 'Sardegna',
  '21': 'Trentino-Alto Adige',
  '22': 'Trentino-Alto Adige',
};

/**
 * Ottiene il nome della regione dal codice
 * @param {string|number} regionCode - Codice regione RFI
 * @returns {string} Nome regione o "Regione sconosciuta"
 */
export function getRegionName(regionCode) {
  if (!regionCode) return null;
  return REGION_LABELS[String(regionCode)] || 'Regione sconosciuta';
}
