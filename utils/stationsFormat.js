import { getStationByName } from '../services/stationsService';
import { getRegionName } from './regionLabels';

export function enrichStation(station) {
  if (!station?.name) return station;
  const local = getStationByName(station.name);
  const regionCode = local?.region ?? local?.regione ?? null;
  const region = regionCode ? getRegionName(regionCode) : null;
  const lefrecceId =
    (local?.lefrecceId !== null && local?.lefrecceId !== undefined ? local.lefrecceId : null) ??
    (station?.lefrecceId !== null && station?.lefrecceId !== undefined ? station.lefrecceId : null);
  return { ...station, region, lefrecceId };
}

export function toPickerStation(station) {
  if (!station?.name) return null;
  const name = String(station.name).trim();
  if (!name) return null;
  const local = getStationByName(name);
  const regionCode = local?.region ?? station?.region ?? station?.regione ?? null;
  const region = regionCode ? getRegionName(regionCode) : null;
  const lefrecceId = local?.lefrecceId ?? null;
  return { name, id: null, region, lefrecceId };
}
