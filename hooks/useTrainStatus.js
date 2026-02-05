import { useCallback, useRef, useState } from 'react';

const useTrainStatus = ({
  initialTrain = null,
  fetchTrainStatus,
  onSaveRecent,
  onLoadRecents,
  onSelectionRequired,
  onError,
} = {}) => {
  const [selectedTrain, setSelectedTrain] = useState(initialTrain);
  const [trainModalRefreshing, setTrainModalRefreshing] = useState(false);
  const [trainAutoRefreshing, setTrainAutoRefreshing] = useState(false);
  const [lastTrainRefreshEpochMs, setLastTrainRefreshEpochMs] = useState(null);
  const refreshTokenRef = useRef(0);

  const invalidateRefresh = useCallback(() => {
    refreshTokenRef.current += 1;
  }, []);

  const resetRefreshing = useCallback(() => {
    setTrainModalRefreshing(false);
    setTrainAutoRefreshing(false);
  }, []);

  const refreshSelectedTrain = useCallback(
    async (trainOverride = null, { silent = false } = {}) => {
      if (typeof fetchTrainStatus !== 'function') return;
      const base = trainOverride || selectedTrain;
      const trainNumber = base?.number;
      if (!trainNumber) return;

      const token = ++refreshTokenRef.current;
      if (silent) setTrainAutoRefreshing(true);
      else setTrainModalRefreshing(true);
      try {
        const normalized = await fetchTrainStatus(trainNumber, {
          choice: base?.choice ?? null,
          originName: base?.originName ?? null,
          technical: base?.technical ?? null,
          originCode: base?.originCode ?? null,
          timestampRiferimento: base?.timestampRiferimento ?? null,
          date: base?.date ?? null,
          epochMs: base?.timestampRiferimento ?? null,
        });
        if (token !== refreshTokenRef.current) return;
        if (normalized?.kind === 'train') {
          setSelectedTrain(normalized.train);
          setLastTrainRefreshEpochMs(Date.now());
          if (!silent) {
            if (typeof onSaveRecent === 'function') {
              await onSaveRecent(normalized.train);
            }
            if (typeof onLoadRecents === 'function') {
              await onLoadRecents();
            }
          }
        } else if (normalized?.kind === 'selection' && !silent) {
          if (typeof onSelectionRequired === 'function') {
            onSelectionRequired(normalized);
          }
        }
      } catch (error) {
        if (token !== refreshTokenRef.current) return;
        if (!silent && typeof onError === 'function') {
          onError(error);
        }
      } finally {
        if (token === refreshTokenRef.current) {
          if (silent) setTrainAutoRefreshing(false);
          else setTrainModalRefreshing(false);
        }
      }
    },
    [fetchTrainStatus, onError, onLoadRecents, onSaveRecent, onSelectionRequired, selectedTrain]
  );

  return {
    selectedTrain,
    setSelectedTrain,
    trainModalRefreshing,
    trainAutoRefreshing,
    lastTrainRefreshEpochMs,
    setLastTrainRefreshEpochMs,
    refreshSelectedTrain,
    invalidateRefresh,
    resetRefreshing,
  };
};

export default useTrainStatus;
