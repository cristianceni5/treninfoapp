import React from 'react';
import { View, Text, StyleSheet, ScrollView, Modal, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import AnimatedScreen from '../components/AnimatedScreen';
import Card from '../components/Card';
import ListRow from '../components/ListRow';
import { BORDER, HIT_SLOP, INSETS, RADIUS, SPACING, SPACE, TYPE } from '../utils/uiTokens';
import { safeOpenURL } from '../utils/safeOpenURL';
import { iconButtonShadow } from '../utils/uiStyles';
import { hapticSelection, hapticModalClose, hapticModalOpen } from '../utils/haptics';

const MODAL_HEADER_BUTTON_SIZE = 36;
const MODAL_TOP_SPACER_HEIGHT = MODAL_HEADER_BUTTON_SIZE + SPACE.xs;
const MODAL_HEADER_TOP_OFFSET = SPACING.screenX;

export default function InfoScreen() {
  const { theme } = useTheme();
  const [privacyVisible, setPrivacyVisible] = React.useState(false);

  const handleOpenLink = (url) => {
    hapticSelection();
    safeOpenURL(url, { message: 'Impossibile aprire il link.' });
  };

  const handleClosePrivacy = ({ haptics = true } = {}) => {
    if (haptics) hapticModalClose();
    setPrivacyVisible(false);
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AnimatedScreen>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: SPACE.xl, paddingTop: SPACE.xl }}
        >
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>COME FUNZIONA</Text>
            <Card style={styles.infoCard}>
              <Text style={[styles.infoText, { color: theme.colors.text }]}>
                Treninfo combina servizi ufficiali (LeFrecce, RFI/ViaggiaTreno) per mostrare treni, stazioni e stati in tempo reale.
                {'\n\n'}
                Quando cerchi un treno, ricevi numero, tratta, orari programmati, ritardi e posizione. Nella ricerca stazioni trovi partenze e arrivi aggiornati.
                {'\n\n'}
                Preferiti e recenti restano sul dispositivo. La posizione viene usata solo per suggerire stazioni vicine e non viene salvata.
              </Text>
            </Card>
          </View>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>INFORMAZIONI</Text>
            <Card style={styles.optionsContainer}>
              <ListRow
                icon="logo-github"
                title="Repository GitHub"
                onPress={() => handleOpenLink('https://github.com/cristianceni5/treninfo')}
                right={<Ionicons name="open-outline" size={18} color={theme.colors.textSecondary} />}
              />

              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />

              <ListRow
                icon="mail-outline"
                title="Contatti"
                onPress={() => handleOpenLink('mailto:cenicristian@yahoo.com')}
                right={<Ionicons name="open-outline" size={18} color={theme.colors.textSecondary} />}
              />

              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />

              <ListRow
                icon="chatbubble-outline"
                title="Feedback"
                onPress={() => handleOpenLink('https://github.com/cristianceni5/treninfo/issues')}
                right={<Ionicons name="open-outline" size={18} color={theme.colors.textSecondary} />}
              />

              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />

              <ListRow
                icon="shield-checkmark-outline"
                title="Privacy"
                onPress={() => {
                  hapticModalOpen();
                  setPrivacyVisible(true);
                }}
                right={<Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} style={{ opacity: 0.35 }} />}
              />
            </Card>
          </View>
        </ScrollView>

        {privacyVisible ? (
          <Modal
            visible={true}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => handleClosePrivacy()}
            onDismiss={() => handleClosePrivacy({ haptics: false })}
          >
            <SafeAreaView edges={['bottom']} style={[styles.privacyModalContainer, { backgroundColor: theme.colors.background }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => handleClosePrivacy()}
                style={[
                  styles.closeButton,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                    borderWidth: BORDER.card,
                  },
                  iconButtonShadow(theme),
                ]}
                activeOpacity={0.7}
                hitSlop={HIT_SLOP.md}
                accessibilityLabel="Chiudi"
              >
                <Ionicons name="close" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.privacyScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.privacyContent}
            >
              <View style={[styles.modalTopSpacer, { height: MODAL_TOP_SPACER_HEIGHT }]} />
              <Text style={[styles.privacyTitle, { color: theme.colors.text }]}>Privacy</Text>
              <Text style={[styles.privacyIntro, { color: theme.colors.text }]}
              >
                Questa informativa descrive come Treninfo tratta i dati quando usi l'app.
              </Text>

              <View style={styles.privacySection}>
                <Text style={[styles.privacySectionTitle, { color: theme.colors.text }]}>Dati trattati</Text>
                <Text style={[styles.privacySectionBody, { color: theme.colors.textSecondary }]}
                >
                  - Posizione (solo se autorizzata) per mostrare le stazioni vicine. La posizione non viene salvata e
                  resta sul dispositivo.
                  {'\n'}- Preferenze app (tema, colore accento, schermata iniziale) e cronologia recente (treni, stazioni,
                  soluzioni) salvate localmente sul dispositivo.
                  {'\n'}- Dati tecnici minimi per le richieste di rete (es. indirizzo IP e parametri di ricerca) verso i
                  servizi Treninfo.
                </Text>
              </View>

              <View style={styles.privacySection}>
                <Text style={[styles.privacySectionTitle, { color: theme.colors.text }]}>Uso dei dati</Text>
                <Text style={[styles.privacySectionBody, { color: theme.colors.textSecondary }]}
                >
                  I dati vengono usati solo per fornire le funzionalita dell'app (risultati treni, stazioni vicine e
                  preferenze). Treninfo non usa strumenti di analytics o profilazione.
                </Text>
              </View>

              <View style={styles.privacySection}>
                <Text style={[styles.privacySectionTitle, { color: theme.colors.text }]}>Condivisione</Text>
                <Text style={[styles.privacySectionBody, { color: theme.colors.textSecondary }]}
                >
                  Le mappe sono fornite dai servizi di sistema (Apple Maps su iOS, Google Maps su Android). Quando apri
                  un link esterno, si applicano le rispettive policy di quei servizi.
                </Text>
              </View>

              <View style={styles.privacySection}>
                <Text style={[styles.privacySectionTitle, { color: theme.colors.text }]}>Gestione e controlli</Text>
                <Text style={[styles.privacySectionBody, { color: theme.colors.textSecondary }]}
                >
                  Puoi revocare il permesso di posizione dalle impostazioni del dispositivo. Puoi eliminare la cronologia
                  dalle sezioni "Recenti" dentro l'app.
                </Text>
              </View>

              <View style={styles.privacySection}>
                <Text style={[styles.privacySectionTitle, { color: theme.colors.text }]}>Contatti</Text>
                <Text style={[styles.privacySectionBody, { color: theme.colors.textSecondary }]}
                >
                  Per domande o richieste, usa la sezione Contatti in Info oppure visita la pagina GitHub del progetto.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.privacyLinkButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
                onPress={() => handleOpenLink('https://github.com/cristianceni5/treninfo/blob/main/PRIVACY.md')}
                activeOpacity={0.7}
              >
                <Ionicons name="open-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={[styles.privacyLinkText, { color: theme.colors.text }]}>Apri la versione online</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
          </Modal>
        ) : null}
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
  privacyModalContainer: {
    flex: 1,
  },
  modalHeader: {
    position: 'absolute',
    top: MODAL_HEADER_TOP_OFFSET,
    left: SPACING.screenX,
    right: SPACING.screenX,
    zIndex: 10,
  },
  modalTopSpacer: {
    height: MODAL_TOP_SPACER_HEIGHT,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyTitle: {
    ...TYPE.headline,
    marginBottom: SPACE.sm,
  },
  privacyScroll: {
    flex: 1,
  },
  privacyContent: {
    paddingHorizontal: SPACING.screenX,
    paddingBottom: SPACE.xxl,
  },
  privacyIntro: {
    ...TYPE.body,
    marginTop: SPACE.sm,
    marginBottom: SPACE.lg,
  },
  privacySection: {
    marginBottom: SPACE.lg,
  },
  privacySectionTitle: {
    ...TYPE.titleSemibold,
    marginBottom: SPACE.xs,
  },
  privacySectionBody: {
    ...TYPE.callout,
    lineHeight: 20,
  },
  privacyLinkButton: {
    marginTop: SPACE.md,
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  privacyLinkText: {
    ...TYPE.bodyMedium,
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
  infoCard: {
    borderRadius: RADIUS.card,
    borderWidth: BORDER.card,
    padding: SPACE.lg,
  },
  infoText: {
    ...TYPE.body,
    lineHeight: 22,
  },
  separator: {
    height: BORDER.hairline,
    marginLeft: INSETS.settingsDividerLeft,
  },
});
