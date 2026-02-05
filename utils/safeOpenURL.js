import { Alert, Linking } from 'react-native';

export async function safeOpenURL(url, { title = 'Errore', message = 'Impossibile aprire il link.' } = {}) {
  const target = typeof url === 'string' ? url.trim() : '';
  if (!target) return false;
  try {
    const supported = await Linking.canOpenURL(target);
    if (!supported) {
      Alert.alert(title, message);
      return false;
    }
    await Linking.openURL(target);
    return true;
  } catch (error) {
    Alert.alert(title, message);
    return false;
  }
}
