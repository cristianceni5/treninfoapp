import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import AnimatedScreen from '../components/AnimatedScreen';

export default function SoluzioniScreen() {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AnimatedScreen>
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Soluzioni di Viaggio</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Trova il percorso migliore per il tuo viaggio</Text>
        </View>
      </AnimatedScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontFamily: 'TikTokSans-SemiBold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'TikTokSans-Regular',
  },
});
