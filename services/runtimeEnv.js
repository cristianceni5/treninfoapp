import Constants from 'expo-constants';

export function isExpoGo() {
  const exec = Constants?.executionEnvironment;
  if (exec === 'storeClient') return true;
  if (exec === 'standalone') return false;
  if (exec === 'bare') return false;

  const ownership = Constants?.appOwnership;
  if (ownership === 'expo') return true;
  if (ownership === 'standalone' || ownership === 'guest') return false;

  return false;
}

