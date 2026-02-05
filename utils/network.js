export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const isTransientError = (error) => {
  if (!error) return false;
  const status = Number(error.status);
  if (Number.isFinite(status) && status >= 500) return true;
  const name = String(error.name || '').toLowerCase();
  if (name === 'aborterror') return true;
  const msg = String(error.message || '').toLowerCase();
  return msg.includes('timeout') || msg.includes('network') || msg.includes('failed to fetch');
};

export const withRetry = async (fn, options = {}) => {
  const {
    retries = 2,
    minTimeout = 250,
    maxTimeout = 2000,
    factor = 2,
    jitter = 0.2,
    shouldRetry = isTransientError,
  } = options;

  let attempt = 0;
  let delay = minTimeout;
  while (attempt <= retries) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) throw error;
      const rand = 1 + (Math.random() * 2 - 1) * jitter;
      const wait = Math.min(maxTimeout, Math.max(0, Math.round(delay * rand)));
      await sleep(wait);
      attempt += 1;
      delay *= factor;
    }
  }
  return undefined;
};
