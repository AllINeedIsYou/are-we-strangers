import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, ArrowLeft } from 'lucide-react';
import { friendlyError } from './authApi';

export default function ChatArchiveList({ children, enabled, wide, resetKey, open, onOpen, onClose, names, unread, error, onReload }: {
  children: ReactNode; enabled: boolean; wide: boolean; resetKey: string; open: boolean;
  onOpen: () => void; onClose: () => void; names: string; unread: number; error: string; onReload: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => { setRevealed(false); setProgress(0); }, [resetKey]);
  useEffect(() => {
    const node = list.current;
    if (!node || !enabled || wide || open || revealed) return;
    let start: { x: number; y: number } | null = null, distance = 0;
    function begin(event: TouchEvent) {
      const touch = event.touches[0];
      start = touch && node!.scrollTop <= 0 && event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
      distance = 0;
    }
    function move(event: TouchEvent) {
      const touch = event.touches[0];
      if (!start || !touch) return;
      const dy = touch.clientY - start.y, dx = Math.abs(touch.clientX - start.x);
      if (dy < 0 || dx > Math.max(12, dy) || event.touches.length !== 1) { start = null; distance = 0; setProgress(0); return; }
      distance = dy;
      if (dy > 8 && event.cancelable) event.preventDefault();
      setProgress(Math.min(1, dy / 80));
    }
    function end() { if (distance >= 52) setRevealed(true); start = null; distance = 0; setProgress(0); }
    function cancel() { start = null; distance = 0; setProgress(0); }
    function wheel(event: WheelEvent) { if (node!.scrollTop <= 0 && event.deltaY < -12) setRevealed(true); }
    node.addEventListener('touchstart', begin, { passive: true });
    node.addEventListener('touchmove', move, { passive: false });
    node.addEventListener('touchend', end); node.addEventListener('touchcancel', cancel);
    node.addEventListener('wheel', wheel, { passive: true });
    return () => { node.removeEventListener('touchstart', begin); node.removeEventListener('touchmove', move); node.removeEventListener('touchend', end); node.removeEventListener('touchcancel', cancel); node.removeEventListener('wheel', wheel); };
  }, [enabled, wide, open, revealed]);
  const visibility = wide || revealed ? 1 : progress;
  return <div className={`chat-list${open ? ' archive-chat-list' : ''}`} ref={list}>
    {enabled && (open ? <div className="chat-archive-heading"><button type="button" className="icon-button back-button" aria-label="Назад к обычным чатам" onClick={onClose}><ArrowLeft /></button><h2>Архив чатов</h2></div>
      : <div className="chat-archive-reveal" style={{ '--archive-reveal': visibility } as CSSProperties} inert={visibility < 1} aria-hidden={visibility < 1}>
        <button type="button" className="chat-archive-button" onClick={onOpen} aria-label={`Архив чатов${unread > 0 ? `: ${unread}` : ''}`}>
          <span className="chat-archive-symbol"><Archive /></span><span className="chat-text"><span className="chat-title">Архив чатов</span><span className="chat-preview">{names || 'Пока пусто'}</span></span>{unread > 0 && <span className="chat-archive-count">{unread}</span>}
        </button>
      </div>)}
    {enabled && error && <p className="archive-chat-error" role="alert">{error} <button type="button" className="text-button" onClick={onReload}>Повторить</button></p>}
    {children}
  </div>;
}

export function ArchiveChatRow({ children, archived, enabled, busy, name, onChange }: {
  children: ReactNode; archived: boolean; enabled: boolean; busy: boolean; name: string; onChange: () => Promise<boolean>;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const suppress = useRef(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => cancel, []);
  useEffect(() => { if (menu) action.current?.focus(); }, [menu]);
  const show = (x: number, y: number) => { if (enabled) setMenu({ x: Math.min(x, window.innerWidth - 230), y: Math.min(y, window.innerHeight - 70) }); };
  function close() { setMenu(null); wrapper.current?.querySelector<HTMLButtonElement>('.chat-card')?.focus({ preventScroll: true }); }
  async function change() {
    if (busy) return;
    setError(''); close();
    try { await onChange(); } catch (error) { setError(friendlyError(error)); }
  }
  return <div ref={wrapper} className="archive-chat-row" onContextMenu={event => { if (enabled) { event.preventDefault(); cancel(); show(event.clientX, event.clientY); } }}
    onKeyDown={event => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); show(rect.left + 20, rect.bottom); }
    }}
    onPointerDown={event => {
      cancel(); suppress.current = false;
      if (!enabled || event.pointerType !== 'touch' || !event.isPrimary || !(event.target as Element).closest('.chat-card')) return;
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => { suppress.current = true; show(start.current.x, start.current.y); }, 500);
    }}
    onPointerMove={event => { if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10) cancel(); }}
    onPointerUp={cancel} onPointerCancel={cancel}
    onTouchEndCapture={event => { if (suppress.current) { event.preventDefault(); event.stopPropagation(); cancel(); } }}
    onClickCapture={event => { if (suppress.current && (event.target as Element).closest('.chat-card')) { event.preventDefault(); event.stopPropagation(); suppress.current = false; } }}>
    {children}
    {error && <p className="archive-chat-error" role="alert">{error}</p>}
    {menu && createPortal(<>
      <button className="archive-menu-scrim" aria-label="Закрыть меню чата" onClick={close} />
      <div className="archive-chat-menu glass" role="menu" aria-label={`Действия с чатом: ${name}`} style={{ left: Math.max(8, menu.x), top: Math.max(8, menu.y) }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
        <button ref={action} type="button" role="menuitem" disabled={busy} onClick={() => void change()}>{archived ? <ArchiveRestore size={19} /> : <Archive size={19} />}{archived ? 'Вернуть из архива' : 'В архив'}</button>
      </div>
    </>, document.body)}
  </div>;
}
