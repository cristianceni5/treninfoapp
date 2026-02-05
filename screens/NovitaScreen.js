import React from 'react';
import { StyleSheet, ScrollView, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import AnimatedScreen from '../components/AnimatedScreen';
import Card from '../components/Card';
import { SPACING, SPACE, TYPE } from '../utils/uiTokens';

export default function NovitaScreen() {
  const { theme } = useTheme();

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AnimatedScreen>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>PRIMA VERSIONE</Text>
            <Card style={styles.card}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Funzioni</Text>
              <Text style={[styles.cardText, { color: theme.colors.textSecondary }]}>
                - Ricerca treni con stato in tempo reale{'\n'}
                - Mappa con posizione del treno e fermate{'\n'}
                - Ricerca stazioni con partenze e arrivi{'\n'}
                - Recenti e preferiti salvati localmente{'\n'}
                - Avvisi e notifiche (beta)
              </Text>
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
  content: {
    paddingTop: SPACE.xl,
    paddingBottom: SPACE.xl,
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
  card: {
    padding: SPACE.lg,
  },
  cardTitle: {
    ...TYPE.calloutSemibold,
    marginBottom: SPACE.sm,
  },
  cardText: {
    ...TYPE.caption,
    lineHeight: 20,
  },
});
