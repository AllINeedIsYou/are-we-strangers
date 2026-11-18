import { useRef } from 'react';

export const compactChatListWidth = 62;
export const defaultChatListWidth = 292;
export const maxChatListWidth = 440;
const preferenceKey = 'aws.chat-list-width';

export function loadChatListWidth() {
  try {
    const width = Number(localStorage.getItem(preferenceKey));
    if (width >= compactChatListWidth && width <= maxChatListWidth) return width;
  } catch { /* The divider also works without browser storage. */ }
  return defaultChatListWidth;
}

export function saveChatListWidth(width: number) {
  try { localStorage.setItem(preferenceKey, String(width)); }
  catch { /* Keep the width for the current session. */ }
}

export default function ChatListDivider({ width, maximum, inHistory = false, onResize }: {
  width: number;
  maximum: number;
  inHistory?: boolean;
  onResize: (width: number, save: boolean) => void;
}) {
  const drag = useRef<{ pointer: number; start: number; width: number } | null>(null);
  const fit = (value: number) => Math.min(maximum, Math.max(compactChatListWidth, Math.round(value)));
  const toggle = () => onResize(width === compactChatListWidth ? fit(defaultChatListWidth) : compactChatListWidth, true);

  return <div className={`chat-list-divider${inHistory ? ' in-history' : ''}`} role="separator" tabIndex={0}
    aria-label="Ширина списка чатов" aria-orientation="vertical" aria-controls="chat-sidebar"
    aria-valuemin={compactChatListWidth} aria-valuemax={maximum} aria-valuenow={width}
    title="Потяни, чтобы изменить ширину. Двойной щелчок сворачивает или раскрывает список."
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointer: event.pointerId, start: event.clientX, width };
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (current?.pointer === event.pointerId) onResize(fit(current.width + event.clientX - current.start), false);
    }}
    onPointerUp={event => {
      const current = drag.current;
      if (current?.pointer !== event.pointerId) return;
      drag.current = null;
      onResize(fit(current.width + event.clientX - current.start), true);
    }}
    onLostPointerCapture={() => { drag.current = null; }}
    onDoubleClick={toggle}
    onKeyDown={event => {
      const step = event.shiftKey ? 40 : 16;
      switch (event.key) {
        case 'ArrowLeft': onResize(fit(width - step), true); break;
        case 'ArrowRight': onResize(fit(width + step), true); break;
        case 'Home': onResize(compactChatListWidth, true); break;
        case 'End': onResize(maximum, true); break;
        case 'Enter': toggle(); break;
        default: return;
      }
      event.preventDefault();
    }} />;
}
