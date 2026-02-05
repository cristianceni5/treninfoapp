import { Linking } from 'react-native';
import * as Location from 'expo-location';

export const isPermissionGranted = (status) => status === 'granted';

export const getLocationPermissionStatus = async () => {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status;
};

export const requestLocationPermission = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status;
};

export const openAppSettings = async () => {
  try {
    if (typeof Linking.openSettings === 'function') {
      await Linking.openSettings();
      return true;
    }
  } catch {
    // ignore
  }
  return false;
};
