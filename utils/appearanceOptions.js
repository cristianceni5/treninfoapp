export const COLOR_THEME_OPTIONS = [
  {
    id: 'treninfo',
    label: 'Treninfo',
    accentLight: '#0A63E5',
    accentDark: '#4C7DFF',
  },
  {
    id: 'intercity',
    label: 'InterCity',
    accentLight: '#2196F3',
    accentDark: '#2196F3',
  },
  {
    id: 'italo',
    label: 'Italo',
    accentLight: '#9C1A39',
    accentDark: '#9C1A39',
  },
  {
    id: 'frecciarossa',
    label: 'Frecciarossa',
    accentLight: '#E20613',
    accentDark: '#E20613',
  },
  {
    id: 'regionale',
    label: 'Regionale',
    accentLight: '#1B8A5A',
    accentDark: '#1B8A5A',
  },
];

export const DEFAULT_COLOR_THEME_ID = COLOR_THEME_OPTIONS[0].id;

export const getColorThemeById = (id) =>
  COLOR_THEME_OPTIONS.find((option) => option.id === id) ?? COLOR_THEME_OPTIONS[0];
