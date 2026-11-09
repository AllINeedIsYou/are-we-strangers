import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { MessengerStore, emptySnapshot } from './messengerStore';

const empty = emptySnapshot();
const subscribeEmpty = () => () => {};
export default function useMessenger(userId: number | null, onExpired: () => void, onIncoming: (chatId: string) => void, onDelete?: (ids: string[], signal: AbortSignal) => Promise<void>) {
  const handlers = useRef({ onExpired, onIncoming, onDelete }); handlers.current = { onExpired, onIncoming, onDelete };
  const store = useMemo(() => userId === null ? null : new MessengerStore(userId, {
    onExpired: () => handlers.current.onExpired(), onIncoming: key => handlers.current.onIncoming(key), onDelete: (ids, signal) => handlers.current.onDelete?.(ids, signal) || Promise.resolve(),
  }), [userId]);
  const snapshot = useSyncExternalStore(store?.subscribe || subscribeEmpty, store?.getSnapshot || (() => empty));
  useEffect(() => {
    if (!store) return;
    store.start();
    const refresh = () => { if (document.visibilityState === 'visible') store.reconnect(); };
    window.addEventListener('online', refresh); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); store.stop(); };
  }, [store]);
  return { ...snapshot, store };
}
