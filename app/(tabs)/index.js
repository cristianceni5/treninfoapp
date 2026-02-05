import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import OrariScreen from '../../screens/OrariScreen';

const normalizeDefaultScreenId = (value) => {
  const id = String(value || '').trim();
  if (id === 'train' || id === 'station' || id === 'orari') return id;
  if (id === 'solutions') return 'orari';
  return 'orari';
};

export default function OrariTab() {
  const router = useRouter();
  const hasCheckedRef = React.useRef(false);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem('defaultScreen');
        const normalized = normalizeDefaultScreenId(stored);
        if (normalized === 'train') {
          router.replace('/CercaTreno');
          return;
        }
        if (normalized === 'station') {
          router.replace('/CercaStazione');
          return;
        }
      } catch {
        // ignore
      }
      setReady(true);
    })();
  }, [router]);

  if (!ready) return null;
  return <OrariScreen />;
}
