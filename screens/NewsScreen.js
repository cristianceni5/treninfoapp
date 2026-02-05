import React from 'react';
import { StyleSheet, ScrollView, View, Text, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import AnimatedScreen from '../components/AnimatedScreen';
import Card from '../components/Card';
import { SPACING, SPACE, TYPE } from '../utils/uiTokens';
import { decodeHtmlEntities, getNews } from '../services/apiService';
import { hapticSelection } from '../utils/haptics';

export default function NewsScreen() {
  const { theme } = useTheme();
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState('');
  const [expandedIds, setExpandedIds] = React.useState({});

  const normalizeItem = (item, index) => {
    const rawText = decodeHtmlEntities(item?.testo ?? item?.text ?? '');
    const text = String(rawText || '').replace(/\s+\n/g, '\n').trim();
    return {
      id: String(item?.id ?? `${item?.data ?? 'news'}-${index}`),
      title: decodeHtmlEntities(item?.titolo ?? item?.title ?? '') || 'Aggiornamento',
      text,
      date: item?.data ?? item?.date ?? '',
      highlight: Boolean(item?.inEvidenza ?? item?.highlight),
    };
  };

  const loadNews = async ({ mode = 'initial' } = {}) => {
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'initial') setLoading(true);
    setError('');
    try {
      const response = await getNews();
      const list = Array.isArray(response?.data) ? response.data : [];
      const normalized = list.map(normalizeItem);
      setItems(normalized);
    } catch (err) {
      setError(err?.message || 'Errore nel caricamento news.');
    } finally {
      if (mode === 'refresh') setRefreshing(false);
      if (mode === 'initial') setLoading(false);
    }
  };

  React.useEffect(() => {
    loadNews({ mode: 'initial' });
  }, []);

  const toggleExpanded = (id) => {
    hapticSelection();
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AnimatedScreen>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadNews({ mode: 'refresh' })}
              tintColor={theme.colors.accent}
            />
          }
        >
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>NEWS E INFOMOBILITÀ</Text>

            {loading ? (
              <Card style={styles.card}>
                <Text style={[styles.cardText, { color: theme.colors.textSecondary }]}>Caricamento aggiornamenti…</Text>
              </Card>
            ) : error ? (
              <Card style={styles.card}>
                <Text style={[styles.cardText, { color: theme.colors.destructive }]}>{error}</Text>
              </Card>
            ) : items.length === 0 ? (
              <Card style={styles.card}>
                <Text style={[styles.cardText, { color: theme.colors.textSecondary }]}>
                  Nessuna news disponibile al momento.
                </Text>
              </Card>
            ) : (
              items.map((item) => {
                const expanded = Boolean(expandedIds[item.id]);
                const preview = item.text.split('\n').slice(0, 3).join('\n');
                return (
                  <Card
                    key={item.id}
                    style={[
                      styles.card,
                      item.highlight && { borderColor: theme.colors.accent, backgroundColor: `${theme.colors.accent}12` },
                    ]}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{item.title}</Text>
                      {item.date ? (
                        <Text style={[styles.cardMeta, { color: theme.colors.textSecondary }]}>{item.date}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.cardText, { color: theme.colors.textSecondary }]}>
                      {expanded ? item.text : preview}
                    </Text>
                    {item.text && item.text.length > preview.length ? (
                      <TouchableOpacity onPress={() => toggleExpanded(item.id)} activeOpacity={0.7}>
                        <Text style={[styles.expand, { color: theme.colors.accent }]}>
                          {expanded ? 'Mostra meno' : 'Leggi tutto'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </Card>
                );
              })
            )}
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
    marginBottom: SPACE.md,
  },
  cardHeader: {
    marginBottom: SPACE.xs,
  },
  cardTitle: {
    ...TYPE.calloutSemibold,
  },
  cardMeta: {
    ...TYPE.caption,
    marginTop: SPACE.xxs,
  },
  cardText: {
    ...TYPE.caption,
    lineHeight: 20,
  },
  expand: {
    ...TYPE.captionSemibold,
    marginTop: SPACE.sm,
  },
});
