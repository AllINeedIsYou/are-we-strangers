import { useEffect, useRef, useState } from 'react';
import { ApiError, friendlyError } from './authApi';
import { messengerApi, toMessage, type ServerMessage } from './messengerApi';
import type { MessengerStore } from './messengerStore';

type Hit = { row: ServerMessage; started: number };
type SearchPage = { key: string; hits: Hit[]; loading: boolean; error: string; more: boolean; cursor?: number };

export default function useMessageSearch(query: string, chatId: number | undefined, ownId: number,
  store: MessengerStore | null, enabled: boolean, onExpired: () => void) {
  const term = query.trim(), key = `${ownId}:${chatId}:${term}`;
  const [page, setPage] = useState<SearchPage>({ key: '', hits: [], loading: false, error: '', more: false });
  const [retry, setRetry] = useState(0);
  const request = useRef<AbortController | null>(null);
  const current = useRef({ key, enabled, onExpired }); current.current = { key, enabled, onExpired };

  useEffect(() => {
    if (!enabled || !chatId || !term) return;
    if (term.length > 256) {
      setPage({ key, hits: [], loading: false, more: false, error: 'Запрос не должен быть длиннее 256 символов' });
      return;
    }
    const controller = new AbortController(); request.current = controller;
    setPage({ key, hits: [], loading: true, error: '', more: false });
    const timer = setTimeout(() => {
      const started = store?.getSequence() ?? 0;
      void messengerApi.searchMessages(chatId, term, undefined, controller.signal).then(rows => {
        if (!controller.signal.aborted && current.current.key === key && current.current.enabled) {
          setPage({ key, hits: rows.map(row => ({ row, started })), loading: false, error: '', more: rows.length === 50, cursor: rows.at(-1)?.id });
        }
      }).catch(caught => {
        if (controller.signal.aborted || current.current.key !== key) return;
        if (caught instanceof ApiError && caught.status === 401) current.current.onExpired();
        else setPage({ key, hits: [], loading: false, more: false, error: friendlyError(caught) });
      }).finally(() => { if (request.current === controller) request.current = null; });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); request.current?.abort(); request.current = null; };
  }, [enabled, key, chatId, term, store, retry]);

  const state = page.key === key && enabled ? page : { key, hits: [], loading: !!term && enabled, error: '', more: false };
  async function loadMore() {
    if (!enabled || !chatId || request.current || state.loading || !state.more || state.cursor === undefined) return;
    const controller = new AbortController(); request.current = controller;
    setPage(previous => ({ ...previous, loading: true, error: '' }));
    const started = store?.getSequence() ?? 0;
    try {
      const rows = await messengerApi.searchMessages(chatId, term, state.cursor, controller.signal);
      if (controller.signal.aborted || current.current.key !== key || !current.current.enabled) return;
      setPage(previous => {
        if (previous.key !== key) return previous;
        const hits = new Map(previous.hits.map(hit => [hit.row.id, hit]));
        for (const row of rows) hits.set(row.id, { row, started });
        return { key, hits: [...hits.values()], loading: false, error: '', more: rows.length === 50, cursor: rows.at(-1)?.id ?? previous.cursor };
      });
    } catch (caught) {
      if (controller.signal.aborted || current.current.key !== key) return;
      if (caught instanceof ApiError && caught.status === 401) current.current.onExpired();
      else setPage(previous => ({ ...previous, loading: false, error: friendlyError(caught) }));
    } finally { if (request.current === controller) request.current = null; }
  }
  const cached = new Map(store?.getSnapshot().state.messages.map(message => [message.serverId, message]));
  const messages = state.hits.flatMap(({ row, started }) => {
    if (store?.messageHidden(row.id)) return [];
    const message = (store?.messageVersion(row.id) ?? 0) > started ? (cached.get(row.id) ?? store?.editedMessage(row.id) ?? toMessage(row, ownId)) : toMessage(row, ownId);
    return message && message.text.toLocaleLowerCase('ru').includes(term.toLocaleLowerCase('ru')) ? [message] : [];
  }).sort((a, b) => b.serverId! - a.serverId!);
  return { messages, loading: state.loading, error: state.error, hasMore: state.more,
    loadMore, retry: () => { if (state.cursor !== undefined && state.hits.length) void loadMore(); else setRetry(value => value + 1); } };
}
