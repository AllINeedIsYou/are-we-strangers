import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Bookmark, Check, CheckCheck, ChevronRight, CircleCheck, Search, Copy, Forward, Paperclip, Pin, PinOff, Reply, SquarePen, Trash2 } from 'lucide-react';
import { messageSummary, type Chat, type Message, type ReplySnapshot } from './domain';
import MediaView from './MediaView';
import { SearchText } from './ConversationSearch';

export type MessageMenuTarget = { message: Message; x: number; y: number };

export function MessageBubble({ message, pinned = message.pinned, quote = message.replyTo, selected, selecting, active, searchQuery = '', searchActive = false, onMenu, onSelect, onJump }: {
  message: Message; pinned?: boolean; quote?: ReplySnapshot; selected: boolean; selecting: boolean; active: boolean; searchQuery?: string; searchActive?: boolean;
  onMenu: (target: MessageMenuTarget) => void; onSelect: (messageId: string) => void; onJump: (messageId: string) => void;
}) {
  const allPhotos=!!message.media?.length&&message.media.every(asset=>asset.kind==='photo');
  return <div className={`message-row ${message.own ? 'own' : 'incoming'} ${selected ? 'message-selected' : ''} ${searchActive?'search-active-row':''}`} data-message-id={message.id}>
    {selecting && <button className="selection-check" aria-label={`${selected ? 'Снять выбор' : 'Выбрать сообщение'}: ${messageSummary(message)}`} aria-pressed={selected} onClick={() => onSelect(message.id)}>{selected && <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10 3.7 3.7 7.3-7.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}</button>}
    <div className={`bubble glass ${message.own ? 'red-glass' : ''} ${active ? 'context-active' : ''} ${message.media?.length === 1 && message.media[0].kind === 'circle' && !message.text ? 'circle-bubble' : ''} ${allPhotos?'photo-bubble':''} ${allPhotos&&!message.text?'media-only':''}`} tabIndex={0} role="group" aria-label={`Сообщение: ${messageSummary(message)}. ${message.time}`} aria-haspopup="menu"
      onContextMenu={event => { event.preventDefault(); onMenu({ message, x: event.clientX, y: event.clientY }); }}
      onClick={event => { if (selecting) { event.preventDefault(); onSelect(message.id); } }}
      onKeyDown={event => {
        if (event.key === 'Enter' && event.target !== event.currentTarget) return;
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10') || event.key === 'Enter') {
          event.preventDefault();
          if (selecting && event.key === 'Enter') { onSelect(message.id); return; }
          const bounds = event.currentTarget.getBoundingClientRect();
          onMenu({ message, x: bounds.left + Math.min(bounds.width / 2, 100), y: bounds.bottom });
        }
      }}>
      {message.forwardedFrom && <span className="forwarded-label"><Forward size={12} />Переслано от {message.forwardedFrom}</span>}
      {quote ? <button type="button" className="message-quote" onClick={event => { event.stopPropagation(); onJump(quote.id); }}><strong>{quote.author}</strong><span>{quote.text}</span></button>
        : message.replyToId && <div className="message-quote"><span>Исходное сообщение недоступно</span></div>}
      {message.media?.length ? <div className={`message-media ${allPhotos&&message.media!.length>1?'photo-album':''}`}>{message.media.map(asset => <MediaView key={asset.id} asset={asset} />)}</div> : null}
      {message.attachment && <span className="message-attachment"><Paperclip size={17} />{message.attachment}<small>Локальный пример · не загружен</small></span>}
      {message.text && <span className="message-body"><SearchText text={message.text} query={searchQuery}/></span>}
      <span className="message-meta">{pinned && <Pin size={11} aria-label="Закреплено" />}{message.edited && <span>изм.</span>}<time>{message.time}</time>{message.own && (message.serverId ? message.read ? <CheckCheck size={16} aria-label="Прочитано" /> : <Check size={16} aria-label="Сохранено на сервере" /> : <CheckCheck size={16} aria-label="Прочитано в демо" />)}</span>
    </div>
  </div>;
}

export function MessageContextMenu({live = false, pinned = false, pinBusy = false, forwardBusy = false, forwardTargets,onForwardTo, target, onClose, onReply, onCopy, onEdit, onPin, onForward, onSelect, onMoment, onDelete }: {
  live?: boolean;
  pinned?: boolean; pinBusy?: boolean;
  forwardBusy?: boolean; forwardTargets:Chat[];onForwardTo:(chatId:string)=>void;
  target: MessageMenuTarget; onClose: () => void; onReply: () => void; onCopy: () => void; onEdit: () => void;
  onPin: () => void; onForward: () => void; onSelect: () => void; onMoment: () => void; onDelete: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const popover=useRef<HTMLDivElement>(null);
  const [forwardOpen,setForwardOpen]=useState(false),[search,setSearch]=useState('');
  useLayoutEffect(()=>{if(!forwardOpen||!popover.current||!dialog.current)return;const pane=popover.current,box=dialog.current.getBoundingClientRect(),b=pane.getBoundingClientRect(),trigger=dialog.current.querySelector('[data-forward-trigger]')!.getBoundingClientRect();pane.style.left=box.right+b.width+8>innerWidth?`${-b.width-8}px`:'calc(100% + 8px)';pane.style.top=`${Math.max(8,Math.min(trigger.top-box.top,innerHeight-box.top-b.height-12))}px`;pane.querySelector('input')?.focus();},[forwardOpen]);
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(12, Math.min(target.x, window.innerWidth - bounds.width - 12))}px`;
    element.style.top = `${Math.max(12, Math.min(target.y, window.innerHeight - bounds.height - 12))}px`;
    element.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    return () => element.close();
  }, [target]);
  function item(label: string, icon: ReactNode, action: () => void, danger = false) {
    const demoOnly = live && !['Ответить', 'Копировать текст', 'Выбрать', 'Изменить', 'Удалить', 'Закрепить', 'Открепить', 'Добавить момент'].includes(label);
    const disabled = demoOnly || (pinBusy && (label === 'Закрепить' || label === 'Открепить'));
    return <button role="menuitem" disabled={disabled} title={demoOnly ? 'Пока доступно в демо' : undefined} className={danger ? 'danger' : ''} onClick={() => { onClose(); action(); }}>{icon}<span>{label}</span>{label === 'Переслать' && <ChevronRight className="context-chevron" />}</button>;
  }
  return <dialog ref={dialog} className="message-context glass" aria-label="Действия с сообщением" onCancel={onClose} onContextMenu={event => event.preventDefault()}
    onClick={event => { if (event.target === dialog.current) onClose(); }} onKeyDown={event => {
      if(event.key==='Escape'&&forwardOpen){event.preventDefault();event.stopPropagation();setForwardOpen(false);return;}
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...dialog.current!.querySelectorAll<HTMLButtonElement>('button[role=menuitem]:not(:disabled)')];
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}><div role="menu" aria-label="Меню сообщения">
      {item('Ответить', <Reply />, onReply)}
      {item('Копировать текст', <Copy />, onCopy)}
      <div className="context-divider" />
      {target.message.own && item('Изменить', <SquarePen />, onEdit)}
      {item(pinned ? 'Открепить' : 'Закрепить', pinned ? <PinOff /> : <Pin />, onPin)}
      <button role="menuitem" disabled={forwardBusy} data-forward-trigger aria-expanded={forwardOpen} onClick={()=>{if(innerWidth>760)setForwardOpen(v=>!v);else{onClose();onForward();}}}><Forward/><span>Переслать</span><ChevronRight className="context-chevron"/></button>
      {item('Выбрать', <CircleCheck />, onSelect)}
      {item('Добавить момент', <Bookmark />, onMoment)}
      <div className="context-divider" />
      {item('Удалить', <Trash2 />, onDelete, true)}
    </div>{forwardOpen&&<div ref={popover} className="forward-popover glass" role="menu" aria-label="Получатель пересылки"><label className="forward-search"><Search size={14}/><input aria-label="Найти получателя пересылки" placeholder="Поиск" value={search} onChange={e=>setSearch(e.target.value)}/></label>{forwardTargets.filter(chat=>chat.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))).map(chat=><button role="menuitem" className="forward-contact" key={chat.id} onClick={()=>{onClose();onForwardTo(chat.id);}}><span className="avatar">{chat.initial}</span><span>{chat.name}</span></button>)}</div>}</dialog>;
}
