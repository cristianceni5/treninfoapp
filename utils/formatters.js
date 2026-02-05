const pad2 = (n) => String(Number(n) || 0).padStart(2, '0');

export const parseDateTime = (input) => {
  if (input instanceof Date) return input;
  const str = String(input || '').trim();
  if (!str) return new Date('');

  // Se presente timezone esplicito (Z / +01:00 / +0100), affidiamoci al parser nativo.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(str)) return new Date(str);

  // ISO senza timezone: trattalo come locale (consistente con la UX in Italia).
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (m) {
    const [, yy, mm, dd, hh, mi] = m;
    return new Date(Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), 0, 0);
  }

  return new Date(str);
};

export const toYmd = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const toHm = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

export const formatItDateTime = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  try {
    const d = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
    const t = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    return `${d} - ${t}`;
  } catch {
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${String(date.getFullYear()).slice(-2)} - ${toHm(date)}`;
  }
};

export const formatItTime = (value) => {
  if (!value) return '—';
  const date = parseDateTime(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  } catch {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }
};

export const formatItLongDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  try {
    const raw = new Intl.DateTimeFormat('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '—';
  } catch {
    return '—';
  }
};

export const formatDurationMinutes = (mins) => {
  const m = Number(mins);
  if (!Number.isFinite(m) || m <= 0) return null;
  const hours = Math.floor(m / 60);
  const minutes = Math.round(m % 60);
  if (hours <= 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${pad2(minutes)} min`;
};

export const formatEuro = (amount, currency = '€') => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const fixed = n.toFixed(2);
  return `${currency} ${fixed.replace('.', ',')}`;
};

export const minutesBetween = (fromIso, toIso) => {
  if (!fromIso || !toIso) return null;
  const a = parseDateTime(fromIso);
  const b = parseDateTime(toIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const diff = Math.round((b.getTime() - a.getTime()) / 60000);
  if (!Number.isFinite(diff)) return null;
  return Math.max(0, diff);
};

const getCalendarDayIndex = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

export const getDayDelta = (from, to) => {
  if (!(from instanceof Date) || Number.isNaN(from.getTime())) return 0;
  if (!(to instanceof Date) || Number.isNaN(to.getTime())) return 0;
  const a = getCalendarDayIndex(from);
  const b = getCalendarDayIndex(to);
  const diff = Math.round((b - a) / 86400000);
  return Number.isFinite(diff) ? diff : 0;
};

export const addMinutesToHHmm = (hhmm, deltaMinutes) => {
  const delay = Number.isFinite(Number(deltaMinutes)) ? Number(deltaMinutes) : null;
  const s = typeof hhmm === 'string' ? hhmm.trim() : '';
  if (!s || s === '—' || delay === null) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  const total = hh * 60 + mm + delay;
  const wrapped = ((total % 1440) + 1440) % 1440;
  const outH = String(Math.floor(wrapped / 60)).padStart(2, '0');
  const outM = String(wrapped % 60).padStart(2, '0');
  return `${outH}:${outM}`;
};

export const minutesUntilEpoch = (epochMs) => {
  const ts = Number(epochMs);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  return Math.round((ts - Date.now()) / 60000);
};

export const minutesUntilHHmm = (hhmm) => {
  const s = typeof hhmm === 'string' ? hhmm.trim() : '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  const now = new Date();
  const target = new Date(now);
  target.setSeconds(0, 0);
  target.setHours(hh, mm, 0, 0);
  // Se l'orario è già passato (oltre 30 min), assumiamo il giorno successivo.
  if (target.getTime() < now.getTime() - 30 * 60000) {
    target.setDate(target.getDate() + 1);
  }
  return Math.round((target.getTime() - now.getTime()) / 60000);
};

export const formatMinutesLong = (minutes) => {
  if (!Number.isFinite(Number(minutes))) return null;
  const m = Number(minutes);
  if (m <= 0) return null;
  if (m === 1) return 'tra 1 minuto';
  if (m >= 60) {
    const hours = Math.floor(m / 60);
    const mins = m % 60;
    const hLabel = hours === 1 ? 'ora' : 'ore';
    if (mins === 0) return `tra ${hours} ${hLabel}`;
    return `tra ${hours} ${hLabel} e ${mins} min`;
  }
  return `tra ${m} minuti`;
};

export const formatDateDDMMYY = (input) => {
  if (input === null || input === undefined) return null;
  let date = null;

  if (typeof input === 'number') {
    const ts = Number(input);
    if (Number.isFinite(ts) && ts > 0) date = new Date(ts);
  } else if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return null;
    const ymdDash = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    const ymdSlash = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s);
    const dmySlash = /^(\d{2})\/(\d{2})\/(\d{2,4})$/.exec(s);
    const dmyDash = /^(\d{2})-(\d{2})-(\d{2,4})$/.exec(s);

    const makeUTCNoon = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

    if (ymdDash || ymdSlash) {
      const m = ymdDash || ymdSlash;
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(d)) date = makeUTCNoon(y, mo, d);
    } else if (dmySlash || dmyDash) {
      const m = dmySlash || dmyDash;
      const d = Number(m[1]);
      const mo = Number(m[2]);
      const yRaw = String(m[3]);
      const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
      if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(d)) date = makeUTCNoon(y, mo, d);
    }
  }

  if (!date || !Number.isFinite(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).format(date);
  } catch {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  }
};
