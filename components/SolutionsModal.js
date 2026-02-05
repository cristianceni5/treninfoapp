import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { BORDER, HIT_SLOP } from '../utils/uiTokens';
import { cardShadow, iconButtonShadow, getTrainSiglaColor, getTrainTitleParts } from '../utils/uiStyles';
import {
  formatDurationMinutes,
  formatEuro,
  formatItLongDate,
  formatItTime,
  getDayDelta,
  minutesBetween,
  parseDateTime,
  toYmd,
} from '../utils/formatters';
import { hexToRgba } from '../utils/color';
import CardLoading from './CardLoading';

function SolutionRow({ item, styles, theme, onOpenTrain, isLast, isFastest, isCheapest }) {
  const depDate = item?.departureTime ? parseDateTime(item.departureTime) : null;
  const arrDate = item?.arrivalTime ? parseDateTime(item.arrivalTime) : null;
  const dayDelta = depDate && arrDate ? getDayDelta(depDate, arrDate) : 0;
  const arrivalDayLabel = dayDelta > 0 ? `+${dayDelta} g` : null;

  const nodes = Array.isArray(item?.nodes) ? item.nodes : [];
  const changes = Math.max(0, nodes.length - 1);
  const duration =
    typeof item?.duration === 'string' && item.duration.trim()
      ? item.duration.trim()
      : formatDurationMinutes(item?.duration);
  const priceAmount = item?.price?.amount ?? null;
  const priceCurrency = item?.price?.currency ?? '€';
  const priceLabel =
    priceAmount !== null && priceAmount !== undefined ? formatEuro(priceAmount, priceCurrency) : null;

  return (
    <View
      style={[
        styles.solutionRow,
        { borderBottomColor: theme.colors.border },
        isLast ? styles.solutionRowLast : null,
      ]}
    >
      {(isFastest || isCheapest) ? (
        <View style={styles.solutionBadgeRow}>
          {isFastest ? (
            <View style={styles.solutionBadgeInline}>
              <Ionicons name="flash" size={12} color={theme.colors.accent} />
              <Text style={[styles.solutionBadgeInlineText, { color: theme.colors.accent }]}>PIÙ VELOCE</Text>
            </View>
          ) : null}
          {isCheapest ? (
            <View style={styles.solutionBadgeInline}>
              <Text style={[styles.solutionBadgeInlineText, { color: theme.colors.success }]}>€</Text>
              <Text style={[styles.solutionBadgeInlineText, { color: theme.colors.success }]}>PIÙ ECONOMICO</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.solutionSegments}>
          {nodes.map((n, idx) => {
            const type = String(n?.train?.acronym || '').trim();
            const number = String(n?.train?.trainIdentifier || '').trim();
            const parts = getTrainTitleParts(type, number);
            const showType = Boolean(parts.sigla);
            const showNumber = Boolean(parts.number);
            const numberLabel = showNumber ? parts.number : parts.sigla ? '' : 'Treno';
            const origin = String(n?.origin || '').trim() || '—';
            const destination = String(n?.destination || '').trim() || '—';
            const segDepDate = n?.departureTime ? parseDateTime(n.departureTime) : null;
            const segArrDate = n?.arrivalTime ? parseDateTime(n.arrivalTime) : null;
            const dep = formatItTime(segDepDate);
            const arrBase = formatItTime(segArrDate);
            const segDayDelta = segDepDate && segArrDate ? getDayDelta(segDepDate, segArrDate) : 0;
            const arr = segDayDelta > 0 ? `${arrBase} (+${segDayDelta}g)` : arrBase;
            const changeMinutes =
              idx < nodes.length - 1 ? minutesBetween(n?.arrivalTime, nodes[idx + 1]?.departureTime) : null;
            const changeAt = destination !== '—' ? destination : null;
            const changeTone =
              changeMinutes == null
                ? 'neutral'
                : changeMinutes < 10
                  ? 'critical'
                  : changeMinutes < 20
                    ? 'warn'
                    : 'neutral';
            const changeColor =
              changeTone === 'critical'
                ? theme.colors.destructive
                : changeTone === 'warn'
                  ? theme.colors.warning
                  : theme.isDark
                    ? '#FFFFFF'
                    : theme.colors.text;
            const changeIcon =
              changeTone === 'critical'
                ? 'running'
                : changeTone === 'warn'
                  ? 'walking'
                  : 'coffee';
            const canOpenSegment = Boolean(onOpenTrain && number);

            const keyId = `${idx}-${parts.sigla || 'na'}-${parts.number || 'na'}-${origin}-${destination}`;
            const segmentContent = (
                <View
                  style={[
                    styles.segmentBlock,
                    idx === 0 ? styles.segmentBlockFirst : null,
                    idx === nodes.length - 1 ? styles.segmentBlockLast : null,
                  ]}
                >
                <View style={styles.segmentHeaderRow}>
                  <View style={styles.segmentTrainRow}>
                    {showType ? (
                      <Text style={[styles.segmentTrainType, { color: getTrainSiglaColor(parts.sigla, theme) }]} numberOfLines={1}>
                        {parts.sigla}
                      </Text>
                    ) : null}
                    {parts.showAv ? (
                      <Text style={[styles.segmentTrainType, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                        AV
                      </Text>
                    ) : null}
                    {numberLabel ? (
                      <Text style={[styles.segmentTrainNumber, { color: theme.colors.text }]} numberOfLines={1}>
                        {numberLabel}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.segmentStops}>
                  <View style={[styles.segmentStopLine, { backgroundColor: theme.colors.border }]} />
                  <View style={styles.segmentStopRow}>
                    <View style={styles.segmentStopIndicator}>
                      <View
                        style={[
                          styles.segmentStopDot,
                          styles.segmentStopDotHollow,
                          { borderColor: theme.colors.textSecondary },
                        ]}
                      />
                    </View>
                    <View style={styles.segmentStopTimeWrap}>
                      <Text style={[styles.segmentStopTime, { color: theme.colors.text }]} numberOfLines={1}>
                        {dep}
                      </Text>
                    </View>
                    <View style={styles.segmentStopStationWrap}>
                      <Text style={[styles.segmentStopStation, { color: theme.colors.text }]} numberOfLines={1}>
                        {origin}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.segmentStopRow}>
                    <View style={styles.segmentStopIndicator}>
                      <View style={[styles.segmentStopDot, { backgroundColor: theme.colors.accent }]} />
                    </View>
                    <View style={styles.segmentStopTimeWrap}>
                      <Text style={[styles.segmentStopTime, { color: theme.colors.text }]} numberOfLines={1}>
                        {arr}
                      </Text>
                    </View>
                    <View style={styles.segmentStopStationWrap}>
                      <Text style={[styles.segmentStopStation, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                        {destination}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            );

            return (
              <View key={keyId}>
                {canOpenSegment ? (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() =>
                      onOpenTrain?.({
                        trainNumber: number,
                        originName: origin || null,
                        departureTime: n?.departureTime || null,
                      })
                    }
                  >
                    {segmentContent}
                  </TouchableOpacity>
                ) : (
                  segmentContent
                )}

                {idx < nodes.length - 1 ? (
                  <View style={styles.changeRow}>
                    <View style={styles.changeContent}>
                      <View style={styles.changeIndicator}>
                        <Ionicons name="swap-horizontal" size={14} color={theme.colors.textSecondary} />
                      </View>
                      <View style={styles.changeTextCol}>
                        <Text style={[styles.changeText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                          {changeAt ? (
                            <>
                              Cambio a{' '}
                              <Text style={[styles.changeStation, { color: theme.colors.text }]}>
                                {changeAt}
                              </Text>
                            </>
                          ) : (
                            'Cambio'
                          )}
                          {changeMinutes !== null ? (
                            <>
                              {'\u00A0\u00A0'}
                              <Text style={[styles.changeTime, { color: changeColor }]}>
                                <FontAwesome5 name={changeIcon} size={12} color={changeColor} /> {`${changeMinutes} min`}
                              </Text>
                            </>
                          ) : null}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
      </View>

      <View style={styles.solutionMetaRow}>
        <View
          style={[
            styles.solutionMetaPill,
            changes === 0 ? styles.solutionMetaPillAccent : null,
            {
              backgroundColor: changes === 0 ? theme.colors.accent : theme.colors.background,
              borderColor: changes === 0 ? 'transparent' : theme.colors.border,
            },
          ]}
        >
          <Ionicons
            name={changes === 0 ? 'flash' : 'swap-horizontal'}
            size={12}
            color={changes === 0 ? theme.colors.onAccent : theme.colors.textSecondary}
          />
          <Text style={[styles.solutionMetaText, { color: changes === 0 ? theme.colors.onAccent : theme.colors.textSecondary }]}>
            {changes === 0 ? 'Diretto' : changes === 1 ? '1 cambio' : `${changes} cambi`}
          </Text>
        </View>
        {duration ? (
          <View
            style={[
              styles.solutionMetaPill,
              {
                backgroundColor: hexToRgba(theme.colors.accent, theme.isDark ? 0.2 : 0.12),
                borderColor: theme.colors.accent,
              },
            ]}
          >
            <Ionicons name="time-outline" size={12} color={theme.colors.accent} />
            <Text style={[styles.solutionMetaText, { color: theme.colors.accent }]}>{duration}</Text>
          </View>
        ) : null}
        {priceLabel ? (
          <View style={[styles.solutionMetaPill, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
            <Ionicons name="pricetag-outline" size={12} color={theme.colors.textSecondary} />
            <Text style={[styles.solutionMetaText, { color: theme.colors.textSecondary }]}>{priceLabel}</Text>
          </View>
        ) : null}
        {arrivalDayLabel ? (
          <View style={[styles.solutionMetaPill, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
            <Ionicons name="calendar-outline" size={12} color={theme.colors.textSecondary} />
            <Text style={[styles.solutionMetaText, { color: theme.colors.textSecondary }]}>{arrivalDayLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SolutionsModal({
  visible,
  onClose,
  onDismiss,
  headerTitle,
  headerRoute,
  onOpenTrain,
  loading,
  error,
  solutions,
  onRetry,
  queryWhen,
  canLoadMore,
  onLoadMore,
  styles,
  modalHeaderTop,
  modalTopSpacerHeight,
}) {
  const { theme } = useTheme();
  const [sortBy, setSortBy] = useState('departure');
  const [sortDir, setSortDir] = useState('asc');
  const rawList = Array.isArray(solutions) ? solutions : [];
  const list = useMemo(
    () => rawList.map((s, idx) => ({ ...s, __key: String(s?.id ?? `idx-${idx}`), __index: idx })),
    [rawList]
  );
  const queryDate = queryWhen instanceof Date ? queryWhen : new Date(queryWhen);
  const queryKey = toYmd(queryDate);
  const routeFrom = headerRoute?.from ? String(headerRoute.from) : '';
  const routeTo = headerRoute?.to ? String(headerRoute.to) : '';
  const hasRouteTitle = Boolean(routeFrom && routeTo);
  const hasSolutions = list.length > 0;
  const showInitialLoading = loading && !hasSolutions;
  const showEmpty = !loading && !error && !hasSolutions;
  const showError = !loading && Boolean(error) && !hasSolutions;

  const { fastestKeys, cheapestKeys } = useMemo(() => {
    const entries = list.map((s) => {
      const durationMinutes = minutesBetween(s?.departureTime, s?.arrivalTime);
      const priceAmount = Number.isFinite(Number(s?.price?.amount)) ? Number(s.price.amount) : null;
      return { key: s.__key, durationMinutes, priceAmount };
    });
    const validDurations = entries.map((e) => e.durationMinutes).filter((v) => Number.isFinite(v) && v > 0);
    const validPrices = entries.map((e) => e.priceAmount).filter((v) => Number.isFinite(v) && v >= 0);
    const distinctPrices = new Set(validPrices);
    const minDuration = validDurations.length > 0 ? Math.min(...validDurations) : null;
    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
    const fastest = new Set(
      minDuration == null ? [] : entries.filter((e) => e.durationMinutes === minDuration).map((e) => e.key)
    );
    const cheapest =
      minPrice == null || distinctPrices.size <= 1
        ? new Set()
        : new Set(entries.filter((e) => e.priceAmount === minPrice).map((e) => e.key));
    return { fastestKeys: fastest, cheapestKeys: cheapest };
  }, [list]);

  const groups = useMemo(() => {
    const getDuration = (s) => {
      const v = minutesBetween(s?.departureTime, s?.arrivalTime);
      return Number.isFinite(v) && v > 0 ? v : Number.POSITIVE_INFINITY;
    };
    const getPrice = (s) => {
      const v = Number(s?.price?.amount);
      return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
    };
    const getDepartureTs = (s) => {
      const d = parseDateTime(s?.departureTime);
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : Number.POSITIVE_INFINITY;
    };
    const getValue = (s) => {
      if (sortBy === 'price') return getPrice(s);
      if (sortBy === 'duration') return getDuration(s);
      return getDepartureTs(s);
    };
    const dir = sortDir === 'desc' ? -1 : 1;
    const compare = (a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (av !== bv) return (av - bv) * dir;
      const at = getDepartureTs(a);
      const bt = getDepartureTs(b);
      if (at !== bt) return at - bt;
      return (a.__index ?? 0) - (b.__index ?? 0);
    };

    const buckets = new Map();
    for (const s of list) {
      const d = parseDateTime(s?.departureTime);
      const key = toYmd(d) || 'unknown';
      const entry = buckets.get(key) || { key, date: d, items: [] };
      entry.items.push(s);
      buckets.set(key, entry);
    }

    return Array.from(buckets.values())
      .map((g) => ({ ...g, items: g.items.slice().sort(compare) }))
      .sort((a, b) => {
        const at = a.date instanceof Date && !Number.isNaN(a.date.getTime()) ? a.date.getTime() : Number.POSITIVE_INFINITY;
        const bt = b.date instanceof Date && !Number.isNaN(b.date.getTime()) ? b.date.getTime() : Number.POSITIVE_INFINITY;
        return at - bt;
      });
  }, [list, sortBy, sortDir]);

  const handleSortPress = (next) => {
    setSortBy((prev) => {
      if (prev === next) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('asc');
      return next;
    });
  };

  if (!visible) return null;

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <View style={[styles.modalContainer, { backgroundColor: theme.colors.background, flex: 1 }]}>
        <View style={[styles.modalHeader, { backgroundColor: 'transparent', top: modalHeaderTop }]}>
          <View style={styles.modalHeaderRow}>
            <TouchableOpacity
              style={[
                styles.closeButton,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  borderWidth: BORDER.card,
                },
                iconButtonShadow(theme),
              ]}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={HIT_SLOP.md}
            >
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.modalScrollArea}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            <View style={[styles.modalTopSpacer, { height: modalTopSpacerHeight }]} />

            <View style={styles.solutionsModalContent}>
              {hasRouteTitle ? (
                <View style={styles.solutionsTitleRow}>
                  <View style={styles.solutionsTitleIndicator}>
                    <View
                      style={[
                        styles.solutionsTitleDot,
                        styles.solutionsTitleDotHollow,
                        { borderColor: theme.colors.textSecondary },
                      ]}
                    />
                    <View style={[styles.solutionsTitleLine, { backgroundColor: theme.colors.border }]} />
                    <View style={[styles.solutionsTitleDot, { backgroundColor: theme.colors.accent }]} />
                  </View>
                  <View style={styles.solutionsTitleText}>
                    <Text style={[styles.solutionsTitleFrom, { color: theme.colors.text }]} numberOfLines={1}>
                      {routeFrom}
                    </Text>
                    <Text style={[styles.solutionsTitleTo, { color: theme.colors.text }]} numberOfLines={1}>
                      {routeTo}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={[styles.modalTitle, styles.solutionsModalTitle, { color: theme.colors.text }]}>
                  {headerTitle}
                </Text>
              )}

              {hasSolutions ? (
                <View style={styles.solutionSortRow}>
                  <TouchableOpacity
                    style={[
                      styles.solutionSortPill,
                      {
                        backgroundColor: sortBy === 'departure' ? theme.colors.accent : theme.colors.background,
                        borderColor: sortBy === 'departure' ? theme.colors.accent : theme.colors.border,
                      },
                    ]}
                    activeOpacity={0.8}
                    onPress={() => handleSortPress('departure')}
                  >
                    <Ionicons
                      name="time-outline"
                      size={12}
                      color={sortBy === 'departure' ? theme.colors.onAccent : theme.colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.solutionSortText,
                        { color: sortBy === 'departure' ? theme.colors.onAccent : theme.colors.textSecondary },
                      ]}
                    >
                      Partenza
                    </Text>
                    {sortBy === 'departure' ? (
                      <Ionicons
                        name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'}
                        size={12}
                        color={theme.colors.onAccent}
                      />
                    ) : null}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.solutionSortPill,
                      {
                        backgroundColor: sortBy === 'duration' ? theme.colors.accent : theme.colors.background,
                        borderColor: sortBy === 'duration' ? theme.colors.accent : theme.colors.border,
                      },
                    ]}
                    activeOpacity={0.8}
                    onPress={() => handleSortPress('duration')}
                  >
                    <Ionicons
                      name="hourglass-outline"
                      size={12}
                      color={sortBy === 'duration' ? theme.colors.onAccent : theme.colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.solutionSortText,
                        { color: sortBy === 'duration' ? theme.colors.onAccent : theme.colors.textSecondary },
                      ]}
                    >
                      Durata
                    </Text>
                    {sortBy === 'duration' ? (
                      <Ionicons
                        name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'}
                        size={12}
                        color={theme.colors.onAccent}
                      />
                    ) : null}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.solutionSortPill,
                      {
                        backgroundColor: sortBy === 'price' ? theme.colors.accent : theme.colors.background,
                        borderColor: sortBy === 'price' ? theme.colors.accent : theme.colors.border,
                      },
                    ]}
                    activeOpacity={0.8}
                    onPress={() => handleSortPress('price')}
                  >
                    <Ionicons
                      name="pricetag-outline"
                      size={12}
                      color={sortBy === 'price' ? theme.colors.onAccent : theme.colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.solutionSortText,
                        { color: sortBy === 'price' ? theme.colors.onAccent : theme.colors.textSecondary },
                      ]}
                    >
                      Prezzo
                    </Text>
                    {sortBy === 'price' ? (
                      <Ionicons
                        name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'}
                        size={12}
                        color={theme.colors.onAccent}
                      />
                    ) : null}
                  </TouchableOpacity>
                </View>
              ) : null}

              {showInitialLoading || showError || showEmpty ? (
                <>
                  <Text style={[styles.modalSectionTitle, { color: theme.colors.textSecondary }]}>
                    {`${formatItLongDate(queryWhen)} - ${formatItTime(queryWhen)}`.toUpperCase()}
                  </Text>
                  <View style={[styles.solutionsCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
                    {showInitialLoading ? (
                      <CardLoading label="Caricamento..." color={theme.colors.accent} textStyle={{ color: theme.colors.textSecondary }} />
                    ) : showError ? (
                      <View style={styles.resultsEmptyState}>
                        <Text style={[styles.resultsEmptyTitle, { color: theme.colors.text }]}>Nessuna risposta</Text>
                        <Text style={[styles.resultsEmptySubtitle, { color: theme.colors.textSecondary }]}>{error}</Text>
                      </View>
                    ) : (
                      <View style={styles.resultsEmptyState}>
                        <Text style={[styles.resultsEmptyTitle, { color: theme.colors.text }]}>Nessuna soluzione</Text>
                        <Text style={[styles.resultsEmptySubtitle, { color: theme.colors.textSecondary }]}>
                          Prova a cambiare orario o stazioni.
                        </Text>
                      </View>
                    )}
                  </View>
                </>
              ) : (
                <>
                  {groups.map((g, idx) => {
                    const rawTitle =
                      g.key !== 'unknown'
                        ? g.key === queryKey
                          ? `${formatItLongDate(g.date)} - ${formatItTime(queryWhen)}`
                          : formatItLongDate(g.date)
                        : '—';
                    const title = String(rawTitle || '—').toUpperCase();

                    const isLast = idx === groups.length - 1;

                    return (
                      <View key={g.key} style={!isLast ? styles.solutionGroup : null}>
                        <Text style={[styles.modalSectionTitle, { color: theme.colors.textSecondary }]}>{title}</Text>
                        <View style={[styles.solutionsCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, cardShadow(theme)]}>
                          <View>
                            {g.items.map((s, i) => (
                              <SolutionRow
                                key={s.__key}
                                item={s}
                                styles={styles}
                                theme={theme}
                                onOpenTrain={onOpenTrain}
                                isLast={i === g.items.length - 1}
                                isFastest={fastestKeys.has(s.__key)}
                                isCheapest={cheapestKeys.has(s.__key)}
                              />
                            ))}
                            {isLast && (canLoadMore || loading) ? (
                              <TouchableOpacity
                                style={[styles.loadMoreRow, { borderTopColor: theme.colors.border }]}
                                activeOpacity={0.75}
                                onPress={onLoadMore}
                                disabled={loading}
                              >
                                {loading ? (
                                  <>
                                    <ActivityIndicator size="small" color={theme.colors.accent} />
                                    <Text style={[styles.loadMoreText, { color: theme.colors.textSecondary }]}>Caricamento...</Text>
                                  </>
                                ) : (
                                  <>
                                    <Text style={[styles.loadMoreText, { color: theme.colors.accent }]}>Carica più soluzioni</Text>
                                    <Ionicons name="chevron-down" size={18} color={theme.colors.accent} />
                                  </>
                                )}
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default SolutionsModal;
