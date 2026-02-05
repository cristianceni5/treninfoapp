const WHITE = '#FFFFFF';
const BLACK = '#000000';

const normalizeHex = (value) => {
  if (typeof value !== 'string') return null;
  const hex = value.trim().replace('#', '');
  if (hex.length !== 3 && hex.length !== 6) return null;

  const normalized = hex.length === 3
    ? hex.split('').map((c) => c + c).join('')
    : hex;

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
};

const toHex = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');

export function getReadableTextColor(backgroundColor, light = WHITE, dark = BLACK) {
  const rgb = normalizeHex(backgroundColor);
  if (!rgb) return light;

  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance > 0.6 ? dark : light;
}

export function mixHex(baseColor, tintColor, amount = 0) {
  const base = normalizeHex(baseColor);
  const tint = normalizeHex(tintColor);
  if (!base || !tint) return baseColor;

  const clamped = Math.max(0, Math.min(1, Number(amount) || 0));
  const r = base.r + (tint.r - base.r) * clamped;
  const g = base.g + (tint.g - base.g) * clamped;
  const b = base.b + (tint.b - base.b) * clamped;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToRgba(hex, alpha = 1) {
  if (typeof hex !== 'string') return `rgba(0,0,0,${alpha})`;
  const normalized = hex.replace('#', '').trim();
  const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized;
  if (full.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

const parseRgb = (value) => {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith('#')) {
    const normalized = raw.slice(1);
    const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized;
    if (full.length !== 6) return null;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if (![r, g, b].every(Number.isFinite)) return null;
    return { r, g, b };
  }
  const match = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1].split(',').map((p) => p.trim());
  if (parts.length < 3) return null;
  const [r, g, b] = parts.slice(0, 3).map((p) => Number(p));
  if (![r, g, b].every(Number.isFinite)) return null;
  return { r, g, b };
};

const getRelativeLuminance = (rgb) => {
  const toLinear = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const getContrastRatio = (foreground, background) => {
  const fg = parseRgb(foreground);
  const bg = parseRgb(background);
  if (!fg || !bg) return null;
  const l1 = getRelativeLuminance(fg);
  const l2 = getRelativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

export function pickReadableTextColor(preferred, background, fallback, minRatio = 4.5) {
  const prefRatio = getContrastRatio(preferred, background);
  if (prefRatio != null && prefRatio >= minRatio) return preferred;
  if (typeof fallback === 'string') {
    const fallbackRatio = getContrastRatio(fallback, background);
    if (fallbackRatio != null && fallbackRatio >= minRatio) return fallback;
  }
  const bgRgb = parseRgb(background);
  if (!bgRgb) return typeof fallback === 'string' ? fallback : preferred;
  return getRelativeLuminance(bgRgb) < 0.5 ? '#FFFFFF' : '#000000';
}
