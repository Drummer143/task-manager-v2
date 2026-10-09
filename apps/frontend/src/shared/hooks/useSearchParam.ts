import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { NavigateOptions, useLocation, useNavigate } from 'react-router-dom';

export type SearchParamParser<T extends string> = (raw: string) => T | null;

const identity: SearchParamParser<string> = (raw) => raw;

export const oneOf = <const T extends string>(
  values: readonly T[],
): SearchParamParser<T> => {
  const allowed = new Set<string>(values);
  return (raw) => (allowed.has(raw) ? (raw as T) : null);
};

export const useSearchParam = <T extends string = string>(
  name: string,
  parse: SearchParamParser<T> = identity as SearchParamParser<T>,
) => {
  const { search } = useLocation();
  const navigate = useNavigate();

  const searchRef = useRef(search);

  useLayoutEffect(() => {
    searchRef.current = search;
  });

  const value = useMemo(() => {
    const raw = new URLSearchParams(search).get(name);
    return raw === null ? null : parse(raw);
  }, [search, name, parse]);

  const setValue = useCallback(
    (next: T | null, options?: Omit<NavigateOptions, 'replace'>) => {
      const params = new URLSearchParams(searchRef.current);

      if (params.get(name) === next) return;

      if (next === null) {
        params.delete(name);
      } else {
        params.set(name, next);
      }

      const nextSearch = `?${params}`;

      searchRef.current = nextSearch;

      navigate(nextSearch, { ...options, replace: true });
    },
    [name, navigate],
  );

  return [value, setValue] as const;
};
