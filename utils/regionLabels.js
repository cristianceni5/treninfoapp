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
  if (typeof regionCode === 'object') {
    const maybeName = regionCode?.name ?? regionCode?.label ?? regionCode?.nome;
    if (typeof maybeName === 'string' && maybeName.trim()) return maybeName.trim();
    const maybeId = regionCode?.id ?? regionCode?.code ?? regionCode?.regionId;
    if (maybeId !== undefined && maybeId !== null) {
      return REGION_LABELS[String(maybeId)] || 'Regione sconosciuta';
    }
    return 'Regione sconosciuta';
  }

  const key = String(regionCode).trim();
  if (!key) return null;
  if (REGION_LABELS[key]) return REGION_LABELS[key];
  if (/^\d+$/.test(key)) return 'Regione sconosciuta';
  // Se arriva già come nome (es. "Lombardia"), lo restituiamo direttamente.
  return key;
}
