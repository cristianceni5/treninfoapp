import { useCallback, useState } from 'react';

const useStationsSearch = ({ searchFn, minLength = 2, normalizer, emptyMessage = null } = {}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  const runSearch = useCallback(
    (text, { limit } = {}) => {
      const q = typeof text === 'string' ? text.trim() : '';
      if (!q || q.length < minLength) {
        setError('');
        setResults([]);
        return [];
      }

      try {
        const raw = typeof searchFn === 'function' ? searchFn(q, limit) : [];
        const normalized = Array.isArray(raw)
          ? (typeof normalizer === 'function' ? raw.map((s) => normalizer(s)).filter(Boolean) : raw)
          : [];
        setResults(normalized);
        if (emptyMessage && normalized.length === 0) {
          setError(emptyMessage);
        } else {
          setError('');
        }
        return normalized;
      } catch (e) {
        setError('Errore nella ricerca');
        setResults([]);
        return [];
      }
    },
    [emptyMessage, minLength, normalizer, searchFn]
  );

  const reset = useCallback(() => {
    setQuery('');
    setResults([]);
    setError('');
  }, []);

  return {
    query,
    setQuery,
    results,
    setResults,
    error,
    setError,
    runSearch,
    reset,
  };
};

export default useStationsSearch;
