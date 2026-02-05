import { Platform } from 'react-native';

export function cardShadow(theme) {
  const isDark = theme?.isDark === true;
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: isDark ? 0 : 1 },
    shadowOpacity: isDark ? 0 : 0.03,
    shadowRadius: isDark ? 0 : 2,
    elevation: isDark ? 0 : 1,
  };
}

export function floatingShadow(theme, level = 'md') {
  const isDark = theme?.isDark === true;
  const variant = String(level || 'md').toLowerCase();
  const cfg =
    variant === 'lg'
      ? { height: 8, opacity: 0.18, radius: 14, elevation: 10 }
      : { height: 6, opacity: 0.12, radius: 12, elevation: 6 };
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: isDark ? 0 : cfg.height },
    shadowOpacity: isDark ? 0 : cfg.opacity,
    shadowRadius: isDark ? 0 : cfg.radius,
    elevation: isDark ? 0 : cfg.elevation,
  };
}

export function iconButtonShadow(theme) {
  const isDark = theme?.isDark === true;
  const opacity = isDark ? 0.18 : 0.25;
  const elevation = Platform.OS === 'android' ? 4 : 0;
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: opacity,
    shadowRadius: 4,
    elevation,
  };
}

export function getTrainSiglaColor(sigla, theme) {
  const ref = String(sigla || '').trim().toUpperCase();
  if (ref.startsWith('FR') || ref.startsWith('FA')) return '#E20613';
  if (ref.startsWith('ITA') || ref.startsWith('ITALO')) return '#9C1A39';
  if (ref.startsWith('ICN') || ref.startsWith('EN')) return '#0D47A1';
  if (ref.startsWith('FB') || ref.startsWith('IC') || ref.startsWith('EC')) return '#2196F3';
  if (ref.startsWith('REG') || ref.startsWith('REGIONALE')) return theme?.colors?.textSecondary || '#5E6E7A';
  return theme?.isDark ? theme?.colors?.text || '#FFFFFF' : '#000000';
}

const TRAIN_TYPE_CODES = new Set([
  'FR',
  'FA',
  'IC',
  'ICN',
  'EC',
  'EN',
  'FB',
  'REG',
  'REGIONALE',
  'RV',
  'R',
  'ITA',
  'ITALO',
  'AV',
]);

const normalizeToken = (value) => String(value || '').trim();
const normalizeUpper = (value) => normalizeToken(value).toUpperCase();

const isLikelyOperatorToken = (token, nextToken) => {
  const code = normalizeUpper(token);
  if (!code) return false;
  if (!/^[A-Z]{2,3}$/.test(code)) return false;
  if (TRAIN_TYPE_CODES.has(code)) return false;
  const next = normalizeUpper(nextToken);
  if (!next) return false;
  return TRAIN_TYPE_CODES.has(next);
};

export function getTrainTitleParts(type, number, operator) {
  const rawType = typeof type === 'string' ? type.trim() : '';
  let tokens = rawType.split(/\s+/).filter(Boolean);
  let operatorLabel = normalizeUpper(operator);

  if (!operatorLabel && tokens.length >= 2 && isLikelyOperatorToken(tokens[0], tokens[1])) {
    operatorLabel = normalizeUpper(tokens[0]);
    tokens = tokens.slice(1);
  } else if (operatorLabel && tokens.length >= 2 && normalizeUpper(tokens[0]) === operatorLabel) {
    tokens = tokens.slice(1);
  }

  const siglaRaw = tokens[0] || rawType;
  const siglaUpper = siglaRaw.toUpperCase();
  const sigla = siglaUpper.startsWith('REGIONALE') || siglaUpper === 'REG' ? 'REG' : siglaUpper;
  const showAv = tokens.some((t) => normalizeUpper(t) === 'AV');
  const num =
    typeof number === 'string'
      ? number.trim()
      : number !== null && number !== undefined
        ? String(number).trim()
        : '';
  return { operator: operatorLabel || null, sigla, showAv, number: num };
}
