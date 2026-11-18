import { useEffect, useState } from 'react';
import { useCursorPages } from './CursorPagination';
import { tokenCursorQuery } from './token-data';

type Row = Record<string, any>;
type Directory = { items: Row[]; next_page_params?: Record<string, unknown> | null };
export function directoryResponse(value: unknown): Directory {
  const data = value as Directory;
  if (!data || !Array.isArray(data.items) || data.items.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('invalidApiResponse');
  const cursor = data.next_page_params;
  if (cursor != null && (typeof cursor !== 'object' || Array.isArray(cursor) || Object.values(cursor).some(value => value != null && !['string', 'number', 'boolean'].includes(typeof value)))) throw new Error('invalidApiResponse');
  return data;
}

// Scope both the cursor and visible response to the selected directory. Late
// replies from another page cannot replace the requested page or its retry.
export function useDirectoryPages(path: string, get: (path: string, signal?: AbortSignal) => Promise<any>) {
  const pages = useCursorPages(path), key = path + pages.query;
  const [state, setState] = useState<{ key: string; data?: Directory; error?: string }>();
  const [revision, setRevision] = useState(0);
  const data = state?.key === key ? state.data : undefined;
  const error = state?.key === key ? state.error || '' : '';
  const pending = !data && !error;
  useEffect(() => {
    const controller = new AbortController();
    setState({ key });
    get(key, controller.signal).then(directoryResponse).then(data => {
      if (!controller.signal.aborted) setState({ key, data });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'invalidApiResponse' });
    });
    return () => controller.abort();
  }, [key, revision, get]);
  const nextQuery = data?.next_page_params ? tokenCursorQuery(data.next_page_params) : '';
  const hasNext = !!nextQuery && nextQuery !== pages.query && !error && !pending;
  return {
    data, error, pending, page: pages.page, query: pages.query,
    hasPrevious: !pending && pages.page > 1, hasNext,
    previous: () => { if (!pending && pages.page > 1) pages.previous(); },
    newest: () => { if (!pending && pages.page > 1) pages.reset(); },
    next: () => { if (hasNext) pages.next(data!.next_page_params!); },
    retry: () => { setState({ key }); setRevision(value => value + 1); },
    apply: (data: Directory) => setState({ key, data }),
  };
}
