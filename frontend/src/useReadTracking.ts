import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Message } from './domain';
import type { MessengerStore } from './messengerStore';

export function visibleReadIds(messages: Message[], rows: Array<{ id: string; top: number; bottom: number }>, top: number, bottom: number): number[] {
  const eligible = new Map(messages.filter(message => !message.own && !message.read && message.serverId).map(message => [message.id, message.serverId!]));
  return rows.filter(row => row.bottom > row.top && Math.min(row.bottom, bottom) > Math.max(row.top, top))
    .flatMap(row => eligible.has(row.id) ? [eligible.get(row.id)!] : []);
}

export default function useReadTracking({ viewKey, chatId, store, messages, history, scroll, conversation, followBottom, obscured }: {
  viewKey: string; chatId: string; store: MessengerStore | null; messages: Message[];
  history?: { loading: boolean; error: string }; scroll: RefObject<HTMLDivElement | null>;
  conversation: RefObject<HTMLElement | null>; followBottom: RefObject<boolean>; obscured: boolean;
}) {
  const [entry, setEntry] = useState({ key: '', ready: false, boundary: null as string | null });
  const generation = useRef(0), preparing = useRef(false);
  useLayoutEffect(() => {
    generation.current++; preparing.current = false;
    if (viewKey) followBottom.current = false;
    setEntry({ key: viewKey, ready: false, boundary: null });
  }, [viewKey, store, followBottom]);
  useEffect(() => {
    if (!viewKey || !store || !history || history.loading || history.error || preparing.current || (entry.key === viewKey && entry.ready)) return;
    preparing.current = true;
    const revision = generation.current;
    void store.prepareChat(chatId).then(() => {
      if (revision !== generation.current) return;
      preparing.current = false;
      if (store.getSnapshot().history[chatId]?.error) return;
      const boundary = store.messagesForChat(chatId).find(message => !message.own && !message.read)?.id || null;
      setEntry({ key: viewKey, ready: true, boundary });
    });
  }, [viewKey, chatId, store, history?.loading, history?.error, entry]);
  const ready = !!viewKey && entry.key === viewKey && entry.ready;
  useLayoutEffect(() => {
    const node = scroll.current;
    if (!ready || !node) return;
    const range = store?.getSnapshot().history[chatId]?.range;
    if (range) {
      node.querySelector<HTMLElement>(`[data-message-id="message-${range.target}"]`)?.scrollIntoView({ block: 'center', behavior: 'instant' });
      followBottom.current = false;
      return;
    }
    const target = entry.boundary && node.querySelector<HTMLElement>('[data-unread-boundary]');
    if (target) {
      const header = conversation.current?.querySelector('.conversation-header')?.getBoundingClientRect();
      const visibleTop = Math.max(node.getBoundingClientRect().top, header?.bottom || 0);
      node.scrollTop += target.getBoundingClientRect().top - visibleTop - 12;
      followBottom.current = false;
    } else { node.scrollTop = node.scrollHeight; followBottom.current = true; }
  }, [ready, entry.boundary, scroll, conversation, followBottom, store, chatId]);
  useEffect(() => {
    const node = scroll.current, scene = conversation.current;
    if (!ready || !store || !node || !scene || obscured) return;
    let frame: number | null = null;
    const inspect = () => {
      frame = null;
      if (document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
      const bounds = node.getBoundingClientRect();
      const header = scene.querySelector('.conversation-header')?.getBoundingClientRect();
      const composer = scene.querySelector('.composer-area')?.getBoundingClientRect();
      const top = Math.max(0, bounds.top, header?.bottom || 0), bottom = Math.min(innerHeight, bounds.bottom, composer?.top ?? innerHeight);
      if (bottom <= top || bounds.width === 0) return;
      const rows = [...node.querySelectorAll<HTMLElement>('[data-message-id]')].map(row => {
        const box = row.getBoundingClientRect(); return { id: row.dataset.messageId!, top: box.top, bottom: box.bottom };
      });
      void store.markRead(chatId, visibleReadIds(messages, rows, top, bottom));
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(inspect); };
    const observer = new ResizeObserver(schedule); observer.observe(node); observer.observe(scene);
    const composer = scene.querySelector('.composer-area'); if (composer) observer.observe(composer);
    node.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', schedule);
    document.addEventListener('visibilitychange', schedule); window.addEventListener('focus', schedule);
    schedule();
    return () => { if (frame !== null) cancelAnimationFrame(frame); observer.disconnect(); node.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); document.removeEventListener('visibilitychange', schedule); window.removeEventListener('focus', schedule); };
  }, [ready, store, messages, chatId, obscured, scroll, conversation]);
  return { ready, boundary: ready ? entry.boundary : null };
}
