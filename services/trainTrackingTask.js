import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { BackgroundTaskResult } from 'expo-background-task';
import { getTrainStatus } from './apiService';
import { getNotificationsEnabled } from './settingsService';
import { getTrackedTrains, upsertTrackedTrain } from './trainTrackingService';
import { isExpoGo } from './runtimeEnv';

let NotificationsModule;
const Notifications = () => {
  if (!NotificationsModule) {
    // eslint-disable-next-line global-require
    NotificationsModule = require('expo-notifications');
  }
  return NotificationsModule;
};

export const TRAIN_TRACKING_TASK = 'train-tracking-background-fetch';

const norm = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

const lower = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

const isSelectionResponse = (raw) => {
  if (!raw) return false;
  return Boolean(
    raw.richiestaSelezione ||
      raw.needsSelection ||
      raw.requireSelection ||
      raw.selectionRequired ||
      raw.selezioneRichiesta
  );
};

const getJourneyState = (raw) => {
  const principali = raw?.principali || raw?.data?.principali || null;
  const statoObj = principali?.statoViaggio || principali?.journeyState || null;
  const stato = norm(statoObj?.stato || statoObj?.state) || null;
  const label = norm(statoObj?.etichetta || statoObj?.label) || null;
  const statoTreno = norm(principali?.statoTreno || principali?.stato) || null;

  const normalizeFromString = () => {
    const s = lower(statoTreno);
    if (!s) return { code: null, label: null };
    if (s === 'programmato' || s === 'non partito' || s === 'non_partito') return { code: 'PLANNED', label: 'Programmato' };
    if (s === 'in stazione' || s === 'fermo in stazione') return { code: 'RUNNING', label: 'In stazione' };
    if (s === 'partito' || s === 'in viaggio' || s === 'in_viaggio' || s === 'inviaggio' || s === 'in corsa' || s === 'in_corsa' || s === 'running') {
      return { code: 'RUNNING', label: 'In viaggio' };
    }
    if (s === 'concluso' || s === 'arrivato' || s === 'completato' || s === 'completed' || s === 'terminato') {
      return { code: 'COMPLETED', label: 'Completato' };
    }
    if (s === 'soppresso' || s === 'cancellato' || s === 'cancelled') return { code: 'CANCELLED', label: 'Soppresso' };
    if (s === 'parziale' || s === 'limitato' || s === 'partial') return { code: 'PARTIAL', label: 'Parziale' };
    return { code: 'UNKNOWN', label: 'Sconosciuto' };
  };

  if (stato) return { code: stato, label };
  return normalizeFromString();
};

const pickEpoch = (block) => {
  if (!block) return null;
  const actual = typeof block?.reale === 'number' ? block.reale : null;
  const predicted = typeof block?.probabile === 'number' ? block.probabile : null;
  const scheduled = typeof block?.programmato === 'number' ? block.programmato : null;
  return actual ?? predicted ?? scheduled ?? null;
};

const extractSnapshot = (raw) => {
  if (!raw || raw.ok === false || isSelectionResponse(raw)) return null;

  const principali = raw?.principali || raw?.data?.principali || null;
  const treno = raw?.treno || null;

  if (principali) {
    const delayMinutes = typeof principali?.ritardoMinuti === 'number' ? principali.ritardoMinuti : null;
    const journey = getJourneyState(raw);
    const nextStop =
      principali.prossimaFermata ||
      principali.fermataSuccessiva ||
      principali.successivaFermata ||
      principali.nextStop ||
      principali.tratta?.prossimaFermata ||
      principali.tratta?.nextStop ||
      null;
    const nextStopName = norm(nextStop?.stazione || nextStop?.stationName || nextStop?.nomeStazione || nextStop?.nome || null) || null;

    const ultimoRil = principali.ultimoRil || principali.ultimoRilevamento || null;
    const lastSeenEpochMs = typeof ultimoRil?.timestamp === 'number' ? ultimoRil.timestamp : (typeof ultimoRil?.epochMs === 'number' ? ultimoRil.epochMs : null);
    const lastSeenStationName = norm(ultimoRil?.luogo || ultimoRil?.stationName || null) || null;

    const isInStation = principali.inStazione === true || principali.isInStazione === true || principali.isInStation === true;
    const currentStation = norm(principali.stazioneCorrente || principali.currentStation || null) || null;

    const positionText = (() => {
      if (journey.code === 'CANCELLED') return 'Treno soppresso';
      if (journey.code === 'COMPLETED') return 'Corsa conclusa';
      if (isInStation && (currentStation || lastSeenStationName)) return `Fermo a ${currentStation || lastSeenStationName}`;
      if (lastSeenStationName && nextStopName) return `In viaggio tra ${lastSeenStationName} e ${nextStopName}`;
      return null;
    })();

    const rfiMessage = norm(principali.aggiornamentoRfi || principali.messaggioRfi || principali.messaggio || null) || null;

    return {
      delayMinutes,
      journeyStateCode: norm(journey.code) || null,
      journeyStateLabel: norm(journey.label) || null,
      nextStopName,
      lastSeenEpochMs,
      lastSeenStationName,
      positionText,
      rfiMessage,
    };
  }

  if (treno && (treno.numeroTreno || treno.numeroTreno === 0)) {
    const delayMinutes = typeof treno?.ritardoMinuti === 'number' ? treno.ritardoMinuti : null;
    const journey = getJourneyState({ principali: treno });
    const fermate = Array.isArray(treno.fermate) ? treno.fermate : [];
    const next = fermate.find((f) => {
      const arr = pickEpoch(f?.orari?.arrivo);
      const dep = pickEpoch(f?.orari?.partenza);
      return Boolean(arr || dep);
    });
    const nextStopName = norm(next?.stazione || null) || null;
    return {
      delayMinutes,
      journeyStateCode: norm(journey.code) || null,
      journeyStateLabel: norm(journey.label) || null,
      nextStopName,
      lastSeenEpochMs: null,
      lastSeenStationName: null,
      positionText: null,
      rfiMessage: null,
    };
  }

  return null;
};

const pickTargetStopArrivalEpoch = (raw, targetStopName) => {
  const target = norm(targetStopName);
  if (!target) return null;

  const principali = raw?.principali || raw?.data?.principali || null;
  const treno = raw?.treno || null;
  const stops = Array.isArray(principali?.fermate)
    ? principali.fermate
    : Array.isArray(treno?.fermate)
      ? treno.fermate
      : [];

  const match = stops.find((s) => lower(s?.stazione) === lower(target));
  if (!match) return null;

  const arrEpoch = pickEpoch(match?.orari?.arrivo);
  if (arrEpoch) return arrEpoch;

  return null;
};

async function ensureEtaSchedulesForTrain(item, raw, snapshot) {
  const prev = item?.scheduled?.etaNotificationIds && typeof item.scheduled.etaNotificationIds === 'object'
    ? item.scheduled.etaNotificationIds
    : {};
  const prevStop = norm(item?.scheduled?.stopName) || null;

  if (!item?.notifyEta) {
    const ids = Object.values(prev).filter(Boolean);
    if (ids.length > 0) {
      await Promise.all(ids.map((id) => Notifications().cancelScheduledNotificationAsync(String(id)).catch(() => {})));
      return { changed: true, nextScheduled: { stopName: prevStop, etaNotificationIds: {} } };
    }
    return { changed: false };
  }
  const stopName = norm(item?.targetStopName || snapshot?.nextStopName);
  if (!stopName) return { changed: false };

  const thresholds = Array.isArray(item?.etaThresholds) && item.etaThresholds.length > 0 ? item.etaThresholds : [10, 3];
  const arrivalEpoch = pickTargetStopArrivalEpoch(raw, stopName);
  const now = Date.now();

  if (!arrivalEpoch || arrivalEpoch <= now + 30000) {
    const ids = Object.values(prev).filter(Boolean);
    await Promise.all(ids.map((id) => Notifications().cancelScheduledNotificationAsync(String(id)).catch(() => {})));
    return {
      changed: ids.length > 0 || prevStop !== stopName,
      nextScheduled: { stopName, etaNotificationIds: {} },
    };
  }

  if (prevStop && prevStop !== stopName) {
    const ids = Object.values(prev).filter(Boolean);
    await Promise.all(ids.map((id) => Notifications().cancelScheduledNotificationAsync(String(id)).catch(() => {})));
  } else if (prevStop === stopName && Object.keys(prev).length > 0) {
    // Se l'ETA cambia (ritardi), preferiamo rischedulare per avere orari coerenti.
    const ids = Object.values(prev).filter(Boolean);
    await Promise.all(ids.map((id) => Notifications().cancelScheduledNotificationAsync(String(id)).catch(() => {})));
  }

  const etaNotificationIds = {};
  for (const minutesBefore of thresholds) {
    const m = Number(minutesBefore);
    if (!Number.isFinite(m) || m <= 0) continue;
    const triggerEpoch = arrivalEpoch - m * 60000;
    if (triggerEpoch <= now + 30000) continue;

    const identifier = await Notifications().scheduleNotificationAsync({
      content: {
        title: `Treno ${item?.trainNumber || ''}`.trim() || 'Treno',
        body: `Arrivo a ${stopName} tra ~${m} min`,
        data: { kind: 'trainTracking', trainId: item?.id, trainNumber: item?.trainNumber, stopName, minutesBefore: m },
        sound: 'default',
        interruptionLevel: 'timeSensitive',
        priority: Notifications().AndroidNotificationPriority.MAX,
      },
      trigger: { type: 'date', date: new Date(triggerEpoch), channelId: 'train-tracking' },
    });
    etaNotificationIds[String(m)] = identifier;
  }

  const changed = prevStop !== stopName || Object.keys(prev).length !== Object.keys(etaNotificationIds).length;
  return { changed, nextScheduled: { stopName, etaNotificationIds } };
}

async function notifyDelayChange(item, prevDelay, nextDelay, snapshot) {
  if (!item?.notifyDelay) return false;
  if (nextDelay === null || nextDelay === undefined) return false;

  const prev = prevDelay === null || prevDelay === undefined ? null : Number(prevDelay);
  const next = Number(nextDelay);
  if (!Number.isFinite(next)) return false;

  if (prev === null || !Number.isFinite(prev)) return false;
  if (prev === next) return false;

  const fmt = (v) => {
    if (v === 0) return 'in orario';
    if (v > 0) return `+${v} min`;
    return `${v} min`;
  };

  const bodyParts = [];
  bodyParts.push(`Ritardo: ${fmt(prev)} → ${fmt(next)}`);
  if (snapshot?.positionText) bodyParts.push(snapshot.positionText);

  await Notifications().scheduleNotificationAsync({
    content: {
      title: `Ritardo aggiornato · Treno ${item?.trainNumber || ''}`.trim(),
      body: bodyParts.join(' · '),
      data: { kind: 'trainTracking', trainId: item?.id, trainNumber: item?.trainNumber },
      sound: 'default',
      interruptionLevel: 'timeSensitive',
      priority: Notifications().AndroidNotificationPriority.MAX,
    },
    trigger: { channelId: 'train-tracking' },
  });
  return true;
}

async function notifyStatusChange(item, prevCode, nextCode, snapshot) {
  const prev = norm(prevCode);
  const next = norm(nextCode);
  if (!next || prev === next) return false;
  if (next !== 'CANCELLED' && next !== 'COMPLETED' && next !== 'PARTIAL') return false;

  const bodyParts = [];
  if (snapshot?.journeyStateLabel) bodyParts.push(snapshot.journeyStateLabel);
  if (snapshot?.rfiMessage) bodyParts.push(snapshot.rfiMessage);
  else if (snapshot?.positionText) bodyParts.push(snapshot.positionText);

  await Notifications().scheduleNotificationAsync({
    content: {
      title: `Aggiornamento corsa · Treno ${item?.trainNumber || ''}`.trim(),
      body: bodyParts.join(' · ') || 'Aggiornamento disponibile',
      data: { kind: 'trainTracking', trainId: item?.id, trainNumber: item?.trainNumber },
      sound: 'default',
      interruptionLevel: 'timeSensitive',
      priority: Notifications().AndroidNotificationPriority.MAX,
    },
    trigger: { channelId: 'train-tracking' },
  });
  return true;
}

async function runTrackingCycle() {
  const enabled = await getNotificationsEnabled();
  if (!enabled) return { anyNotified: false, anyUpdated: false };

  const tracked = await getTrackedTrains();
  if (!Array.isArray(tracked) || tracked.length === 0) return { anyNotified: false, anyUpdated: false };

  let anyNotified = false;
  let anyUpdated = false;

  for (const item of tracked) {
    const trainNumber = norm(item?.trainNumber);
    if (!trainNumber) continue;

    try {
      const raw = await getTrainStatus(trainNumber, {
        choice: item?.choice ?? null,
        originName: item?.originName ?? null,
        technical: item?.technical ?? null,
        originCode: item?.originCode ?? null,
        timestampRiferimento: item?.timestampRiferimento ?? null,
        date: item?.date ?? null,
        epochMs: Date.now(),
      });

      const snapshot = extractSnapshot(raw);
      if (!snapshot) continue;

      const prevDelay = item?.state?.lastDelayMinutes ?? null;
      const prevState = item?.state?.lastJourneyStateCode ?? null;

      const statusNotified = await notifyStatusChange(item, prevState, snapshot.journeyStateCode, snapshot);
      const delayNotified = await notifyDelayChange(item, prevDelay, snapshot.delayMinutes, snapshot);

      const schedRes = await ensureEtaSchedulesForTrain(item, raw, snapshot);
      const nextItem = {
        ...item,
        state: {
          lastDelayMinutes: snapshot.delayMinutes ?? null,
          lastJourneyStateCode: snapshot.journeyStateCode ?? null,
          lastNextStopName: snapshot.nextStopName ?? null,
          lastUpdatedAtEpochMs: Date.now(),
        },
        scheduled: schedRes?.nextScheduled
          ? { ...(item.scheduled || {}), ...schedRes.nextScheduled }
          : item.scheduled || {},
      };
      await upsertTrackedTrain(nextItem);

      anyUpdated = true;
      if (statusNotified || delayNotified) anyNotified = true;
      if (schedRes?.changed) anyUpdated = true;
    } catch (e) {
      // non interrompere il ciclo per un singolo treno
      console.warn('Train tracking error:', e?.message || e);
    }
  }

  return { anyNotified, anyUpdated };
}

export async function runTrainTrackingNow() {
  if (isExpoGo()) return { anyNotified: false, anyUpdated: false };
  return runTrackingCycle();
}

if (!TaskManager.isTaskDefined(TRAIN_TRACKING_TASK)) {
  TaskManager.defineTask(TRAIN_TRACKING_TASK, async () => {
    try {
      const res = await runTrackingCycle();
      if (res.anyNotified || res.anyUpdated) return BackgroundTaskResult.Success;
      return BackgroundTaskResult.Success;
    } catch (e) {
      console.warn('Train tracking task failed:', e?.message || e);
      return BackgroundTaskResult.Failed;
    }
  });
}

export async function ensureTrainTrackingTaskRegistered() {
  if (isExpoGo()) return false;
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;

  const isRegistered = await TaskManager.isTaskRegisteredAsync(TRAIN_TRACKING_TASK);
  if (isRegistered) return true;

  await BackgroundTask.registerTaskAsync(TRAIN_TRACKING_TASK, { minimumInterval: 60 });
  return true;
}

export async function unregisterTrainTrackingTask() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TRAIN_TRACKING_TASK);
    if (!isRegistered) return;
    await BackgroundTask.unregisterTaskAsync(TRAIN_TRACKING_TASK);
  } catch {
    // ignore
  }
}
