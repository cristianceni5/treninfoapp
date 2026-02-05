import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import AnimatedScreen from '../components/AnimatedScreen';
import Card from '../components/Card';
import ListRow from '../components/ListRow';
import { BORDER, INSETS, RADIUS, SPACING, SPACE, TYPE } from '../utils/uiTokens';
import { hapticSelection } from '../utils/haptics';

export default function AltroScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = Platform.OS === 'ios' ? 76 : 64;
  const bottomPadding = SPACE.xl + tabBarHeight + insets.bottom;

  const sections = [
    {
      id: 'settings',
      title: 'Impostazioni',
      subtitle: 'Tema, colore, localizzazione e preferenze',
      icon: 'settings-outline',
      route: 'Impostazioni',
    },
    {
      id: 'info',
      title: 'Info',
      subtitle: 'Privacy, contatti e progetto',
      icon: 'information-circle-outline',
      route: 'Info',
    },
    {
      id: 'news',
      title: 'News e infomobilità',
      subtitle: 'Avvisi e aggiornamenti di servizio',
      icon: 'newspaper-outline',
      route: 'News',
    },
    {
      id: 'novita',
      title: 'Novità',
      subtitle: 'Funzioni e miglioramenti recenti',
      icon: 'sparkles-outline',
      route: 'Novita',
    },
  ];

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AnimatedScreen animateOnce>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomPadding }}
        >
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>ALTRO</Text>
            <Card style={styles.optionsContainer}>
              {sections.map((item, index) => (
                <React.Fragment key={item.id}>
                  <ListRow
                    icon={item.icon}
                    title={item.title}
                    subtitle={item.subtitle}
                    showChevron
                    onPress={() => {
                      hapticSelection();
                      router.push(`/${item.route}`);
                    }}
                  />
                  {index < sections.length - 1 ? (
                    <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
                  ) : null}
                </React.Fragment>
              ))}
            </Card>
          </View>
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: SPACING.screenTop,
    paddingHorizontal: SPACING.screenX,
  },
  sectionTitle: {
    ...TYPE.sectionLabel,
    marginBottom: SPACE.sm,
    marginLeft: SPACING.sectionX,
  },
  optionsContainer: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    overflow: 'hidden',
  },
  separator: {
    height: BORDER.hairline,
    marginLeft: INSETS.settingsDividerLeft,
  },
});
