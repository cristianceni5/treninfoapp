import { useCallback, useRef, useState } from 'react';
import { toHm, toYmd } from '../utils/formatters';

const useTravelSolutions = ({ fetchSolutions, onSaveRecent, onLoadRecents } = {}) => {
  const [solutions, setSolutions] = useState([]);
  const [solutionsLoading, setSolutionsLoading] = useState(false);
  const [solutionsError, setSolutionsError] = useState('');
  const [solutionsOffset, setSolutionsOffset] = useState(0);
  const [solutionsLimit, setSolutionsLimit] = useState(10);
  const [solutionsHasNext, setSolutionsHasNext] = useState(false);
  const [solutionsQueryWhen, setSolutionsQueryWhen] = useState(null);
  const requestTokenRef = useRef(0);

  const runSearch = useCallback(
    async ({
      from,
      to,
      when,
      filters,
      offset = 0,
      limit = 10,
      append = false,
    } = {}) => {
      if (typeof fetchSolutions !== 'function') return null;
      const token = ++requestTokenRef.current;

      const date = toYmd(when);
      const time = toHm(when);

      setSolutionsLoading(true);
      setSolutionsError('');
      setSolutionsQueryWhen(when ?? null);
      setSolutionsOffset(offset);
      setSolutionsLimit(limit);
      if (!append) setSolutions([]);

      try {
        const resp = await fetchSolutions({
          fromName: from?.name ?? '',
          fromId: from?.lefrecceId ?? null,
          toName: to?.name ?? '',
          toId: to?.lefrecceId ?? null,
          date,
          time,
          offset,
          limit,
          frecceOnly: filters?.category === 'frecce',
          intercityOnly: filters?.category === 'intercity',
          regionalOnly: filters?.category === 'regional',
          noChanges: Boolean(filters?.directOnly),
        });

        if (token !== requestTokenRef.current) return resp;

        if (!resp?.ok) {
          setSolutionsError(String(resp?.error || 'Errore nel recupero soluzioni'));
          if (!append) {
            setSolutions([]);
            setSolutionsHasNext(false);
          }
          return resp;
        }

        const list = Array.isArray(resp?.solutions) ? resp.solutions : [];
        setSolutions((prev) => (append ? [...(Array.isArray(prev) ? prev : []), ...list] : list));
        setSolutionsHasNext(list.length === limit);

        if (!append && offset === 0) {
          if (typeof onSaveRecent === 'function') {
            await onSaveRecent({
              fromName: from?.name ?? null,
              fromId: from?.id ?? null,
              toName: to?.name ?? null,
              toId: to?.id ?? null,
            });
          }
          if (typeof onLoadRecents === 'function') {
            await onLoadRecents();
          }
        }
        return resp;
      } catch (e) {
        if (token !== requestTokenRef.current) return null;
        setSolutionsError(String(e?.message || 'Errore nel recupero soluzioni'));
        if (!append) {
          setSolutions([]);
          setSolutionsHasNext(false);
        }
        return null;
      } finally {
        if (token === requestTokenRef.current) {
          setSolutionsLoading(false);
        }
      }
    },
    [fetchSolutions, onLoadRecents, onSaveRecent]
  );

  return {
    solutions,
    setSolutions,
    solutionsLoading,
    solutionsError,
    setSolutionsError,
    solutionsOffset,
    setSolutionsOffset,
    solutionsLimit,
    setSolutionsLimit,
    solutionsHasNext,
    setSolutionsHasNext,
    solutionsQueryWhen,
    runSearch,
  };
};

export default useTravelSolutions;
