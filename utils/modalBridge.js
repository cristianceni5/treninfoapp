import { navigationRef } from './navigationRef';

const pending = [];

const flushPending = () => {
  if (!navigationRef.isReady()) return;
  while (pending.length > 0) {
    const next = pending.shift();
    if (!next) break;
    navigationRef.navigate(next.name, next.params);
  }
};

const queueNavigation = (name, params) => {
  pending.push({ name, params });
  flushPending();
};

export const flushModalQueue = () => {
  flushPending();
};

export const openTrainModal = ({ token, trainNumber, originName, date } = {}) => {
  const num = String(trainNumber || '').trim();
  if (!num) return;
  const openToken = token ?? Date.now();
  queueNavigation('TrainModal', {
    openTrainToken: openToken,
    openTrainNumber: num,
    openTrainOriginName: originName || null,
    openTrainDate: date || null,
    openTrainStacked: true,
    modalOnly: true,
  });
};

export const openStationModal = ({ token, stationName, station, page } = {}) => {
  const name = String(stationName || station?.name || '').trim();
  if (!name) return;
  const openToken = token ?? Date.now();
  queueNavigation('StationModal', {
    openStationToken: openToken,
    openStationName: name,
    openStationPage: Number.isFinite(Number(page)) ? Number(page) : 0,
    openStationStacked: true,
    modalOnly: true,
  });
};
