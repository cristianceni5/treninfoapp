import React from 'react';
import { Platform } from 'react-native';
import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { FONTS } from '../../utils/uiTokens';

export default function TabLayout() {
  const { theme } = useTheme();
  const tabIconSources = React.useMemo(() => {
    if (Platform.OS === 'web') return null;
    return {
      orari: Ionicons.getImageSource('time-outline', 24, '#ffffff'),
      treni: Ionicons.getImageSource('train-outline', 24, '#ffffff'),
      stazioni: Ionicons.getImageSource('location-outline', 24, '#ffffff'),
      altro: Ionicons.getImageSource('ellipsis-horizontal-circle-outline', 24, '#ffffff'),
    };
  }, []);

  return (
    <NativeTabs
      labelStyle={{
        default: { fontFamily: FONTS.medium, fontSize: 11, color: theme.colors.textSecondary },
        selected: { fontFamily: FONTS.medium, fontSize: 11, color: theme.colors.primary },
      }}
      iconColor={{ default: theme.colors.textSecondary, selected: theme.colors.primary }}
      tintColor={theme.colors.primary}
      labelVisibilityMode="labeled"
    >
      <NativeTabs.Trigger name="index">
        <Icon src={tabIconSources?.orari ?? <VectorIcon family={Ionicons} name="time-outline" />} />
        <Label>Orari</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="CercaTreno">
        <Icon src={tabIconSources?.treni ?? <VectorIcon family={Ionicons} name="train-outline" />} />
        <Label>Treni</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="CercaStazione">
        <Icon src={tabIconSources?.stazioni ?? <VectorIcon family={Ionicons} name="location-outline" />} />
        <Label>Stazioni</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="Altro">
        <Icon
          src={tabIconSources?.altro ?? <VectorIcon family={Ionicons} name="ellipsis-horizontal-circle-outline" />}
        />
        <Label>Altro</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
