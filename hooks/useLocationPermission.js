import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { getLocationPermissionStatus, isPermissionGranted, openAppSettings, requestLocationPermission } from '../utils/permissions';

const useLocationPermission = (options = {}) => {
  const {
    alertOnDenied = true,
    alertOnError = true,
    autoCheck = true,
  } = options;

  const [status, setStatus] = useState(null);
  const [granted, setGranted] = useState(false);
  const [loading, setLoading] = useState(false);

  const syncStatus = useCallback(async () => {
    try {
      setLoading(true);
      const nextStatus = await getLocationPermissionStatus();
      setStatus(nextStatus);
      setGranted(isPermissionGranted(nextStatus));
      return nextStatus;
    } catch (error) {
      setStatus(null);
      setGranted(false);
      if (alertOnError) {
        Alert.alert(
          'Permesso posizione',
          'Non è stato possibile verificare il permesso. Puoi gestirlo dalle impostazioni del dispositivo.',
          [
            { text: 'OK' },
            { text: 'Apri impostazioni', onPress: () => openAppSettings() },
          ]
        );
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [alertOnError]);

  const requestPermission = useCallback(async () => {
    try {
      setLoading(true);
      const nextStatus = await requestLocationPermission();
      setStatus(nextStatus);
      const nextGranted = isPermissionGranted(nextStatus);
      setGranted(nextGranted);
      if (alertOnDenied && !nextGranted) {
        Alert.alert(
          'Permesso negato',
          'Per usare la localizzazione è necessario abilitarla nelle impostazioni del dispositivo.',
          [
            { text: 'OK' },
            { text: 'Apri impostazioni', onPress: () => openAppSettings() },
          ]
        );
      }
      return nextStatus;
    } catch (error) {
      setStatus(null);
      setGranted(false);
      if (alertOnError) {
        Alert.alert(
          'Permesso posizione',
          'Non è stato possibile richiedere il permesso. Puoi abilitarlo dalle impostazioni del dispositivo.',
          [
            { text: 'OK' },
            { text: 'Apri impostazioni', onPress: () => openAppSettings() },
          ]
        );
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [alertOnDenied, alertOnError]);

  useEffect(() => {
    if (autoCheck) {
      syncStatus();
    }
  }, [autoCheck, syncStatus]);

  return {
    status,
    granted,
    loading,
    syncStatus,
    requestPermission,
  };
};

export default useLocationPermission;
