import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowUpRight, Bell, Bookmark, Check, ChevronRight, Copy, Forward, Pin, PinOff, Reply, Trash2, Clock3, Eye, EyeOff, LogOut, MessageCircle, MoreHorizontal, Paperclip, Phone, Search, Send, Settings, Smile, SquarePen, UserRound, X } from 'lucide-react';
import { acceptChapter, canPulse, editMessage, forwardMessages, id, initialState, removeMessages, restoreMessages, restoreState, saveMoment, messageSummary, storageKey, timeNow, type MediaAsset, type DemoState, type Message, type RemovedMessage, type ReplySnapshot } from './domain';
import { MessageBubble, MessageContextMenu, type MessageMenuTarget } from './MessageActions';
import MediaView from './MediaView';
import RecordingControl from './RecordingControl';
import Avatar from './Avatar';
import AvatarCropDialog from './AvatarCropDialog';
import ForwardDialog from './ForwardDialog';
import ContactProfile from './ContactProfile';
import ConversationSearch from './ConversationSearch';
import { animateMessageDeletion } from './deletionAnimation';
import { fileKind, storeMedia } from './mediaStore';

function Star({pulse=false,ambient=false}:{pulse?:boolean;ambient?:boolean}){
 const bloom=useId().replaceAll(':','');const shape='M30 0C28 46 27 51 0 54C27 57 28 62 30 108C32 62 33 57 60 54C33 51 32 46 30 0Z';
 return <svg className={`star ${pulse?'is-pulsing':''} ${ambient?'is-ambient':''}`} viewBox="0 0 60 108" aria-hidden="true"><defs><filter id={bloom} x="-150%" y="-100%" width="400%" height="300%"><feGaussianBlur stdDeviation="7"/></filter><filter id={`${bloom}-close`} x="-100%" y="-70%" width="300%" height="240%"><feGaussianBlur stdDeviation="2.5"/></filter></defs><g className="star-halo"><path d={shape} fill="white" opacity=".85" filter={`url(#${bloom}-close)`}/><path d={shape} fill="white" filter={`url(#${bloom})`}/><path d={shape} fill="white" opacity=".9" filter={`url(#${bloom})`}/></g><path className="star-core" d={shape} fill="currentColor"/></svg>;
}
function Brand({ compact = false, pulse = false }: { compact?: boolean; pulse?: boolean }) {
  return <span className={`brand ${compact ? 'brand-compact' : ''}`}>{!compact && <Star pulse={pulse} ambient />}<span className="brand-type"><span>Are we{compact && <Star pulse={pulse} />}</span><span>strangers?</span></span></span>;
}
function IconButton({ label, children, onClick, className = '', type = 'button', disabled = false }: { label: string; children: ReactNode; onClick?: () => void; className?: string; type?: 'submit' | 'button'; disabled?: boolean }) {
  return <button type={type} disabled={disabled} className={`icon-button ${className}`} onClick={onClick} aria-label={label}>{children}</button>;
}
function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current!; node.showModal(); node.querySelector<HTMLInputElement | HTMLTextAreaElement>('textarea,input:not([type=hidden]):not([type=checkbox])')?.focus(); return () => node.close(); }, []);
  return <dialog ref={dialog} className={`modal glass ${className}`} onCancel={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }}><header><h2>{title}</h2><IconButton label="Закрыть" onClick={onClose}><X /></IconButton></header>{children}</dialog>;
}
function loadDemo() { try { return restoreState(localStorage.getItem(storageKey)); } catch { return initialState(); } }
type Panel = 'moments' | 'questions' | 'chapters';
type ModalName = 'settings' | 'profile' | 'calls' | 'new-chat' | 'recovery' | 'reset-confirm' | 'pinned' | null;

export default function App() {
  const [stage, setStage] = useState<'intro' | 'login' | 'chat'>('intro');
  const [register, setRegister] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registration, setRegistration] = useState({phone:'',email:'',name:'',username:''});
  const [avatar,setAvatar]=useState<MediaAsset|undefined>(()=>{try{return JSON.parse(localStorage.getItem('aws.avatar')||'null')||undefined;}catch{return undefined;}});
  const [cropFile,setCropFile]=useState<File|null>(null);
  const avatarInput=useRef<HTMLInputElement>(null);
  const [deleting,setDeleting]=useState(false);
  const [name, setName] = useState(() => { try { return localStorage.getItem('aws.name') || 'Алекс'; } catch { return 'Алекс'; } });
  const [state, setState] = useState<DemoState>(loadDemo);
  const [chatId, setChatId] = useState('mira');
  const [mobileChat, setMobileChat] = useState(false);
  const [search, setSearch] = useState('');
  const [messageSearch, setMessageSearch] = useState<string | null>(null);
  const [searchActiveId,setSearchActiveId]=useState<string|null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [attachment, setAttachment] = useState<{ chatId: string; items: MediaAsset[] } | null>(null);
  const [preparingFiles, setPreparingFiles] = useState(false);
  const fileGeneration = useRef(0);
  const [recordingActive,setRecordingActive]=useState(false);
  const recordSlot=useRef<HTMLDivElement>(null);
  const conversation=useRef<HTMLElement>(null);
  const composerArea=useRef<HTMLDivElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [contactOpen,setContactOpen]=useState(false);
  const [contactVisible,setContactVisible]=useState(false);
  const contactButton=useRef<HTMLButtonElement>(null);
  const [historyClosing,setHistoryClosing]=useState(false);
  const historyCloseTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [momentIds, setMomentIds] = useState<string[] | null>(null);
  const [reason, setReason] = useState('');
  const [messageMenu, setMessageMenu] = useState<MessageMenuTarget | null>(null);
  const [replyTo, setReplyTo] = useState<ReplySnapshot | null>(null);
  const [editing, setEditing] = useState<{ messageId: string; originalDraft: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [forwardIds, setForwardIds] = useState<string[] | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [deleteEveryone, setDeleteEveryone] = useState(true);
  const [removedUndo, setRemovedUndo] = useState<RemovedMessage[] | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [question, setQuestion] = useState('');
  const [questionDate, setQuestionDate] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [inlineError,setInlineError]=useState('');
  const [pulse, setPulse] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const lastPulse = useRef<number | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  const scrollIntent=useRef(0);
  const composer = useRef<HTMLTextAreaElement>(null);
  const loginInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const historyDialog = useRef<HTMLDialogElement>(null);
  const panelOpen = panel !== null;
  const chat = state.chats.find(item => item.id === chatId) || state.chats[0];
  const messages = state.messages.filter(item => item.chatId === chat.id);
  const pinned = state.messages.filter(item => item.chatId === chat.id && item.pinned && !item.kind);
  const draft = drafts[chat.id] || '';
  const currentAttachment = attachment?.chatId === chat.id ? attachment : null;
  const momentSelected=state.messages.filter(item=>item.chatId===chat.id&&!item.kind&&momentIds?.includes(item.id));
  const deletePartner = ({ mira: 'Миры', sasha: 'Саши', danya: 'Дани' } as Record<string, string>)[chat.id] || 'собеседника';

  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { setStorageError(true); } }, [state]);
  useEffect(() => {
    if (!panelOpen) return;
    const node = historyDialog.current!;
    node.showModal();
    return () => node.close();
  }, [panelOpen]);
  useEffect(() => { if (stage !== 'login') return; const timer = setTimeout(() => loginInput.current?.focus(), 1050); return () => clearTimeout(timer); }, [stage]);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [chat.id, messages.length, stage, mobileChat, replyTo?.id, editing?.messageId]);
  useEffect(() => {
    const node = scroll.current;
    if (!node || stage !== 'chat') return;
    followBottom.current = true;
    function onScroll() { if (node && performance.now()-scrollIntent.current<800 && scrollIntent.current>0) followBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; }
    function intent(){scrollIntent.current=performance.now();}
    node.addEventListener('wheel',intent,{passive:true});node.addEventListener('touchmove',intent,{passive:true});
    node.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(() => { if (followBottom.current) node.scrollTop = node.scrollHeight; });
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => { node.removeEventListener('scroll', onScroll);node.removeEventListener('wheel',intent);node.removeEventListener('touchmove',intent);observer.disconnect(); };
  }, [stage, chat.id, mobileChat]);
  useEffect(() => { const element = composer.current; if (element) { element.style.height = 'auto'; element.style.height = `${Math.min(element.scrollHeight, 126)}px`; } }, [draft]);
  useEffect(() => () => { if (pulseTimer.current) clearTimeout(pulseTimer.current); if (highlightTimer.current) clearTimeout(highlightTimer.current); }, []);

  useEffect(()=>{
    if(!contactVisible||contactOpen)return;
    const timer=setTimeout(()=>{setContactVisible(false);requestAnimationFrame(()=>contactButton.current?.focus({preventScroll:true}));},480);
    return()=>clearTimeout(timer);
  },[contactOpen,contactVisible]);
  useEffect(()=>{
    if(!contactOpen||panel||modal)return;
    function escape(event:KeyboardEvent){if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog[open]')){event.preventDefault();setContactOpen(false);}}
    window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);
  },[contactOpen,panel,modal]);
  useEffect(()=>()=>{if(historyCloseTimer.current)clearTimeout(historyCloseTimer.current);},[]);
  function openContact(){setMenuOpen(false);setContactVisible(true);requestAnimationFrame(()=>requestAnimationFrame(()=>setContactOpen(true)));}
  function closeHistory(){
    if(historyClosing)return;
    setHistoryClosing(true);
    historyCloseTimer.current=setTimeout(()=>{setPanel(null);setHistoryClosing(false);},320);
  }
  function selectChat(selected: string) {
    setContactOpen(false);setContactVisible(false); cancelEdit(); setReplyTo(null); setSelectedIds([]); setMessageMenu(null); setAttachment(null); fileGeneration.current += 1; setPreparingFiles(false);
    setChatId(selected); setMobileChat(true); setMessageSearch(null); setEmojiOpen(false); setMenuOpen(false); setPanel(null);
    setState(previous => ({ ...previous, chats: previous.chats.map(item => item.id === selected ? { ...item, unread: 0 } : item) }));
  }
  function signIn(event: FormEvent) {
    event.preventDefault();
    if (!(register?registration.username.trim():login.trim()) || !password) return;
    const displayName=register?registration.name.trim():login.trim();
    setName(displayName); try { localStorage.setItem('aws.name',displayName); if(register)localStorage.setItem('aws.registration',JSON.stringify(registration)); } catch { /* The demo remains usable without storage. */ }
    setPassword(''); setStage('chat'); setMobileChat(false);
  }
  function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (preparingFiles) return;
    if (editing) {
      const next = editMessage(state, editing.messageId, draft);
      if (next === state) return;
      setState(next); cancelEdit(); composer.current?.focus(); return;
    }
    if (!draft.trim() && !currentAttachment?.items.length) return;
    followBottom.current=true;scrollIntent.current=0;
    const message: Message = { id: id(), chatId: chat.id, own: true, time: timeNow(), text: draft.trim(), ...(replyTo ? { replyTo } : {}), ...(currentAttachment?.items.length ? { media: currentAttachment.items } : {}) };
    setState(previous => ({ ...previous, messages: [...previous.messages, message] }));
    setDrafts(previous => ({ ...previous, [chat.id]: '' })); setAttachment(null); setReplyTo(null); setEmojiOpen(false); composer.current?.focus();
  }
  function notify() {
    const target = state.chats.find(item => item.id !== chat.id) || chat;
    setState(previous => ({ ...previous, messages: [...previous.messages, { id: id(), chatId: target.id, own: false, text: 'Привет. Есть минутка поговорить?', time: timeNow() }], chats: previous.chats.map(item => item.id === target.id ? { ...item, unread: item.unread + 1 } : item) }));
    const now = Date.now();
    let silent=false;try{silent=localStorage.getItem(`aws.muted.${target.id}`)==='true';}catch{/* Notifications remain available without storage. */}
    if (!silent && canPulse(now, lastPulse.current)) { lastPulse.current = now; setPulse(true); pulseTimer.current = setTimeout(() => setPulse(false), 1400); }
  }
  function cancelEdit() {
    if (editing) setDrafts(previous => ({ ...previous, [chat.id]: editing.originalDraft }));
    setEditing(null);
  }
  function beginEdit(message: Message) {
    if (!message.own) return;
    setEditing({ messageId: message.id, originalDraft: editing?.originalDraft ?? draft });
    setDrafts(previous => ({ ...previous, [chat.id]: message.text }));
    setReplyTo(null); setAttachment(null); fileGeneration.current += 1; setPreparingFiles(false); requestAnimationFrame(() => composer.current?.focus());
  }
  function beginReply(message: Message) {
    cancelEdit();
    setReplyTo({ id: message.id, text: messageSummary(message), author: message.own ? name : chat.name });
    requestAnimationFrame(() => composer.current?.focus());
  }
  async function copyMessages(messageIds: string[]) {
    const text = state.messages.filter(item => messageIds.includes(item.id)).map(item => item.text || item.attachment || '').join('\n');
    try { await navigator.clipboard.writeText(text); }
    catch { setInlineError('Браузер не разрешил копирование. Попробуй ещё раз.'); }
  }
  function toggleSelected(messageId: string) {
    setSelectedIds(previous => previous.includes(messageId) ? previous.filter(item => item !== messageId) : [...previous, messageId]);
  }
  useEffect(()=>{setSearchActiveId(null);if(messageSearch!==null)followBottom.current=false;},[messageSearch,chat.id]);
  function navigateSearch(messageId:string){
    followBottom.current=false;scrollIntent.current=0;setSearchActiveId(messageId);
    const element=scroll.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
    element?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
  }
  function closeSearch(){setMessageSearch(null);setSearchActiveId(null);}
  function jumpToMessage(messageId: string) {
    setMessageSearch(null);
    requestAnimationFrame(() => {
      const element = [...document.querySelectorAll<HTMLElement>('[data-message-id]')].find(item => item.dataset.messageId === messageId);
      if (!element) { setInlineError('Исходного сообщения больше нет в этой переписке'); return; }
      element.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      setHighlightId(messageId);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightId(null), 1600);
    });
  }
  function requestDelete(ids: string[]) { setDeleteEveryone(true); setDeleteIds(ids); }
  function openMoment(ids: string[]) { setMomentIds(ids); setReason(''); }
  function unpin(messageId: string) {
    setState(previous => ({ ...previous, messages: previous.messages.map(item => item.id === messageId ? { ...item, pinned: false } : item) }));
  }
  async function attachFiles(files: File[]) {
    if (!files.length || preparingFiles) return;
    const originChat = chat.id;
    const token = ++fileGeneration.current;
    const existing = currentAttachment?.items || [];
    const accepted: MediaAsset[] = [];
    let problem = '';
    setPreparingFiles(true);
    for (const file of files.slice(0, Math.max(0, 10 - existing.length))) {
      try { accepted.push(await storeMedia(file, fileKind(file.type), file.name)); }
      catch (error) { problem = error instanceof Error ? error.message : 'Не удалось сохранить файл'; }
    }
    if (token !== fileGeneration.current) return;
    if (accepted.length) setAttachment({ chatId: originChat, items: [...existing, ...accepted] });
    setPreparingFiles(false);
    if (problem) setInlineError(problem);
    else if (existing.length + files.length > 10) setInlineError('К одному сообщению можно приложить до 10 файлов.');
  }
  function sendRecording(asset: MediaAsset) {
    followBottom.current=true;scrollIntent.current=0;
    const message: Message = { id: id(), chatId: chat.id, own: true, time: timeNow(), text: '', media: [asset], ...(replyTo ? { replyTo } : {}) };
    const origin=asset.kind==='circle'?document.querySelector('.record-circle')?.getBoundingClientRect():undefined;
    setState(previous => ({ ...previous, messages: [...previous.messages, message] }));
    setReplyTo(null);
    if(origin&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const bubble=document.querySelector<HTMLElement>(`[data-message-id="${message.id}"] .circle-bubble`);if(!bubble)return;const target=bubble.getBoundingClientRect();bubble.animate([{transform:`translate(${origin.left-target.left}px,${origin.top-target.top}px) scale(${origin.width/target.width})`},{transform:'translate(0,0) scale(1)'}],{duration:600,easing:'cubic-bezier(.2,.7,.2,1)'});
    }));
  }
  async function saveAvatar(image:Blob) {
    const asset=await storeMedia(image,'photo','avatar.jpg');setAvatar(asset);
    try{localStorage.setItem('aws.avatar',JSON.stringify(asset));}catch{setStorageError(true);}
    setCropFile(null);
  }
  function performForward(ids:string[],target:string){setState(previous=>forwardMessages(previous,ids,target,name));setForwardIds(null);setSelectedIds([]);selectChat(target);}
  async function confirmDelete(){
    if(!deleteIds||deleting)return;
    const ids=[...deleteIds],scope=deleteEveryone?'everyone':'self',deletionId=id();
    const undo=removeMessages(state,ids,scope,deletionId).removed;
    setDeleting(true);setDeleteIds(null);setSelectedIds([]);
    await animateMessageDeletion(ids);
    setState(previous=>removeMessages(previous,ids,scope,deletionId).state);setRemovedUndo(undo);
    if(editing&&ids.includes(editing.messageId))cancelEdit();setDeleting(false);
  }
  useEffect(()=>{const node=composerArea.current;if(!node)return;const update=()=>{conversation.current?.style.setProperty('--composer-height',`${node.offsetHeight}px`);if(followBottom.current)requestAnimationFrame(()=>{if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;});};update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect();},[stage,mobileChat]);
  const closeModal = () => setModal(null);

  return <>
    {stage !== 'chat' ? <main className={`auth-screen ${stage === 'login' ? 'auth-open' : ''} ${register?'auth-register':''}`}>
      <button className="brand-trigger" aria-label={stage === 'intro' ? 'Are we strangers? Открыть вход' : 'Are we strangers? Свернуть вход'} onClick={() => {loginInput.current?.blur();setStage(stage === 'intro' ? 'login' : 'intro');}}><Brand /></button>
      <form className="auth-form" aria-hidden={stage === 'intro'} inert={stage === 'intro' ? true : undefined} onSubmit={signIn}>
        {register ? <div className="registration-fields">
          <label className="auth-field"><span>Номер телефона</span><input type="tel" autoComplete="tel" value={registration.phone} onChange={e=>setRegistration(p=>({...p,phone:e.target.value}))} placeholder="+7" required maxLength={24}/></label>
          <label className="auth-field"><span>Почта</span><input type="email" autoComplete="email" value={registration.email} onChange={e=>setRegistration(p=>({...p,email:e.target.value}))} placeholder="you@example.com" required maxLength={120}/></label>
          <label className="auth-field"><span>Имя</span><input autoComplete="given-name" value={registration.name} onChange={e=>setRegistration(p=>({...p,name:e.target.value}))} placeholder="Как тебя зовут" required maxLength={40}/></label>
          <label className="auth-field"><span>Юзернейм</span><input autoComplete="username" value={registration.username} onChange={e=>setRegistration(p=>({...p,username:e.target.value}))} placeholder="username" pattern="[A-Za-z0-9_]{3,32}" title="От 3 до 32 латинских букв, цифр или подчёркиваний" required maxLength={32}/></label>
        </div> : <label className="auth-field"><span>Логин</span><input ref={loginInput} value={login} onChange={event => setLogin(event.target.value)} autoComplete="username" placeholder="alex" required maxLength={40} /></label>}
        <label className="auth-field"><span>Пароль</span><span className="password-input"><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete={register ? 'new-password' : 'current-password'} placeholder="••••••••••" required /><IconButton label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff /> : <Eye />}</IconButton></span></label>
        {!register && <button type="button" className="text-button forgot" onClick={() => setModal('recovery')}>Забыли пароль?</button>}
        <button className="primary auth-submit" type="submit">{register ? 'Создать аккаунт' : 'Войти'}</button>
        <button type="button" className="text-button auth-switch" onClick={() => setRegister(value => !value)}>{register ? 'Уже есть аккаунт? Войти' : 'Создать аккаунт'}</button>
        <p className="demo-note">{register?'Данные сохраняются только в этом браузере':'Прототип · любые логин и пароль'}</p>
      </form>
    </main> : <main className={`messenger ${mobileChat ? 'show-conversation' : ''}`}>
      <aside className="sidebar">
        <header className="sidebar-header"><button className="plain brand-home" onClick={() => { setContactOpen(false);setContactVisible(false);setStage('intro'); setPassword(''); }} aria-label="На начальный экран"><Brand compact pulse={pulse} /></button><IconButton label="Новый разговор" className="compose-new" onClick={() => setModal('new-chat')}><SquarePen /></IconButton></header>
        <div className="search-wrap glass"><Search size={21} /><input aria-label="Поиск чатов" value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск" />{search && <IconButton label="Очистить поиск" onClick={() => setSearch('')}><X size={17} /></IconButton>}</div>
        <div className="chat-list">
          {state.chats.filter(item => item.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))).map(item => {
            const last = state.messages.filter(message => message.chatId === item.id && !message.kind).at(-1);
            return <button className={`chat-card ${item.id === chat.id ? 'selected' : ''}`} key={item.id} onClick={() => selectChat(item.id)} aria-current={item.id === chat.id ? 'true' : undefined}><span className="avatar">{item.initial}</span><span className="chat-text"><span className="chat-title">{item.name}</span><span className="chat-preview">{last?.own ? 'Вы: ' : ''}{last ? messageSummary(last) : ''}</span></span><span className="chat-meta"><time>{last?.time}</time>{item.unread > 0 && <span className="unread">{item.unread}</span>}</span></button>;
          })}
          {!state.chats.some(item => item.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))) && <p className="empty-search">Таких разговоров пока нет</p>}
        </div>
        <nav className="bottom-nav" aria-label="Основная навигация"><IconButton label="Профиль" onClick={() => setModal('profile')}>{avatar?<Avatar asset={avatar} initial={name[0]} className="nav-avatar"/>:<UserRound />}</IconButton><IconButton label="Звонки" onClick={() => setModal('calls')}><Phone /></IconButton><IconButton label="Чаты" className="active" onClick={() => { setContactOpen(false);setContactVisible(false);setModal(null); setMobileChat(false); }}><MessageCircle /></IconButton><IconButton label="Настройки" onClick={() => setModal('settings')}><Settings /></IconButton></nav>
      </aside>
      <section ref={conversation} className={`conversation ${selectedIds.length?'is-selecting':''} ${contactOpen?'contact-is-open':''}`} aria-label={`Переписка: ${chat.name}`}>
        <div className="chat-surface" inert={contactVisible}><header className="conversation-header"><IconButton label="Назад к чатам" className="mobile-back" onClick={() => { setMobileChat(false); setPanel(null); }}><ArrowLeft /></IconButton><button ref={contactButton} className="contact-button plain glass" disabled={recordingActive} onClick={openContact} aria-label={`Открыть профиль: ${chat.name}`}><span className="avatar">{chat.initial}</span><span><strong>{chat.name}</strong><span className="status">{chat.online ? <><i />В сети</> : 'был(а) недавно'}</span></span></button><div className="header-actions glass"><IconButton label="Позвонить" onClick={() => setModal('calls')}><Phone /></IconButton><IconButton label="Поиск в переписке" onClick={() => setMessageSearch(value => value === null ? '' : null)}><Search /></IconButton><div className="menu-wrap"><IconButton label="Меню разговора" onClick={() => setMenuOpen(value => !value)}><MoreHorizontal /></IconButton>{menuOpen && <><button className="menu-scrim" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} /><div className="dropdown glass"><button onClick={()=>{setMessageSearch('');setMenuOpen(false);}}><Search/>Поиск в переписке</button><button onClick={() => { setPanel('moments'); setMenuOpen(false); }}><Bookmark />Сохранённые моменты</button><button onClick={() => { setPanel('questions'); setMenuOpen(false); }}><Clock3 />Вопрос на будущее</button><button onClick={() => { setPanel('chapters'); setMenuOpen(false); }}><ArrowUpRight />Начать заново</button></div></>}</div></div>{selectedIds.length>0&&<IconButton label="Завершить выбор сообщений" className="selection-done" onClick={()=>setSelectedIds([])}><Check/></IconButton>}</header>
        {messageSearch !== null && <ConversationSearch query={messageSearch} onQuery={setMessageSearch} messages={messages} chat={chat} ownName={name} ownAvatar={avatar} onNavigate={navigateSearch} onClose={closeSearch}/>}

        {pinned.length > 0 && <div className="pinned-bar"><button onClick={() => jumpToMessage(pinned.at(-1)!.id)}><Pin size={17} /><span><strong>Закреплённое сообщение{pinned.length > 1 ? ` · ${pinned.length}` : ''}</strong><span>{messageSummary(pinned.at(-1)!)}</span></span></button><IconButton label="Все закреплённые сообщения" onClick={() => setModal('pinned')}><MoreHorizontal /></IconButton><IconButton label="Открепить последнее сообщение" onClick={() => unpin(pinned.at(-1)!.id)}><X size={16} /></IconButton></div>}
        <div className="messages-scroll" ref={scroll}><div className="messages-inner"><div className="date-separator"><span>Сегодня</span></div>
          {messages.map(message => message.kind === 'chapter' ? <div className="chapter-divider" key={message.id}><span>Новая глава · {message.text}</span></div> : <MessageBubble key={message.id} message={message} selected={selectedIds.includes(message.id)} selecting={selectedIds.length > 0} active={messageMenu?.message.id === message.id || highlightId === message.id} searchQuery={messageSearch||''} searchActive={searchActiveId===message.id} onMenu={setMessageMenu} onSelect={toggleSelected} onJump={jumpToMessage} />)}
          {messages.length === 0 && <div className="conversation-empty">{messageSearch ? 'Сообщения не найдены' : 'С чего начнём разговор?'}</div>}
        </div></div>
        <div ref={composerArea} className={`composer-area ${recordingActive?'is-recording':''}`}>
          {selectedIds.length>0?<div className="selection-dock" aria-label="Действия с выбранными сообщениями"><IconButton label="Удалить выбранные сообщения" className="glass round" onClick={()=>requestDelete([...selectedIds])}><Trash2/></IconButton><span className="selection-count">Выбрано: {selectedIds.length}</span><div className="selection-dock-actions"><IconButton label="Копировать выбранные сообщения" onClick={()=>void copyMessages(selectedIds)}><Copy/></IconButton><IconButton label="Сохранить выбранные сообщения в момент" onClick={()=>openMoment([...selectedIds])}><Bookmark/></IconButton><IconButton label="Переслать выбранные сообщения" className="glass round" onClick={()=>setForwardIds([...selectedIds])}><Forward/></IconButton></div></div>:<>

          {(replyTo || editing) && <div className="composer-context">{editing ? <SquarePen size={19} /> : <Reply size={19} />}<span><strong>{editing ? 'Редактирование сообщения' : replyTo!.author}</strong><span>{editing ? state.messages.find(item => item.id === editing.messageId)?.text : replyTo!.text}</span></span><IconButton label={editing ? 'Отменить редактирование' : 'Отменить ответ'} onClick={() => { cancelEdit(); setReplyTo(null); }}><X size={18} /></IconButton></div>}
          {currentAttachment && <div className="pending-media">{currentAttachment.items.map(asset => <div className="pending-item" key={asset.id}><Paperclip size={14} /><span>{asset.name}</span><IconButton label={`Убрать файл: ${asset.name}`} onClick={() => setAttachment(previous => previous ? { ...previous, items: previous.items.filter(item => item.id !== asset.id) } : null)}><X size={14} /></IconButton></div>)}</div>}
          {preparingFiles && <p className="preparing-files" role="status">Подготавливаем файлы…</p>}
          <form className="composer" onSubmit={sendMessage}>
            <input type="file" ref={fileInput} hidden multiple onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void attachFiles(files); }} />
            <IconButton label="Прикрепить фото или файл" className="glass round attach-button" disabled={preparingFiles || !!editing || recordingActive} onClick={() => fileInput.current?.click()}><Paperclip /></IconButton>
            <div ref={recordSlot} className="composer-input glass"><textarea disabled={recordingActive} ref={composer} rows={1} aria-label="Написать сообщение" placeholder="Сообщение..." value={draft} maxLength={5000} onChange={event => setDrafts(previous => ({ ...previous, [chat.id]: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(); } }} />
              <div className="emoji-wrap"><IconButton disabled={recordingActive} label="Добавить эмодзи" onClick={() => setEmojiOpen(value => !value)}><Smile /></IconButton>{emojiOpen && <div className="emoji-picker glass">{['🤍', '🖤', '❤️', '🙂', '✨', '🎧', '🫂', '🌙'].map(emoji => <button key={emoji} type="button" onClick={() => { setDrafts(previous => ({ ...previous, [chat.id]: draft + emoji })); setEmojiOpen(false); composer.current?.focus(); }}>{emoji}</button>)}</div>}</div>
            </div>
            {draft.trim() || currentAttachment?.items.length || editing ? <IconButton label={editing ? 'Сохранить изменения' : 'Отправить сообщение'} className="glass red-glass round send-button" type="submit" disabled={preparingFiles}>{editing ? <Check /> : <Send />}</IconButton> : <RecordingControl key={chat.id} slot={recordSlot} scene={conversation} disabled={preparingFiles} onActive={setRecordingActive} onComplete={sendRecording}/>}
          </form>
          {inlineError&&<p className="composer-feedback" role="alert">{inlineError}<button aria-label="Закрыть сообщение об ошибке" onClick={()=>setInlineError('')}><X size={14}/></button></p>}
          </>}
        </div></div>
        {contactVisible&&<ContactProfile key={chat.id} open={contactOpen} chat={chat} state={state} onClose={()=>setContactOpen(false)} onStory={setPanel} onCall={()=>setModal('calls')} onSearch={()=>{setContactOpen(false);setMessageSearch('');setTimeout(()=>conversation.current?.querySelector<HTMLInputElement>('.conversation-search input')?.focus(),500);}}/>}
      </section>
      {panel && <dialog ref={historyDialog} className={`history-panel ${contactOpen?'profile-history':''} ${historyClosing?'history-closing':''}`} aria-label="История знакомства" onCancel={event => {event.preventDefault();closeHistory();}} onClick={event => { if (event.target === historyDialog.current) closeHistory(); }}><header><div><span className="eyebrow">ВЫ И {chat.name.toLocaleUpperCase('ru')}</span><h2>История знакомства</h2></div><IconButton label={contactOpen?"Назад к профилю":"Закрыть историю"} onClick={closeHistory}>{contactOpen?<ArrowLeft/>:<X/>}</IconButton></header><div className="panel-tabs" role="tablist" aria-label="История знакомства">{([['moments', 'Моменты'], ['questions', 'Будущее'], ['chapters', 'Главы']] as const).map(([tab, label]) => <button key={tab} role="tab" aria-selected={panel === tab} onClick={() => setPanel(tab)}>{label}</button>)}</div><div className="panel-content">
        <p className="panel-demo">Демонстрация механик. Ответы собеседника моделируются вручную.</p>
        {panel === 'moments' && <><h3>Не потерять важное</h3><p className="muted">Сохрани сообщение и расскажи, почему оно осталось с тобой.</p>{state.moments.filter(item => item.chatId === chat.id).length === 0 && <div className="empty-state"><Bookmark /><p>Пока ни одного момента</p><span>Открой меню сообщения правой кнопкой мыши или удержанием на телефоне и выбери «Добавить момент».</span></div>}{state.moments.filter(item => item.chatId === chat.id).map(item => <article className="history-card" key={item.id}><div className="moment-entries">{item.messages?.length ? item.messages.map(entry => <div className="moment-entry" key={entry.id}><span className="eyebrow">{entry.own ? name : chat.name} · {entry.time}</span>{entry.text && <p>{entry.text}</p>}{entry.attachment && <p>{entry.attachment}</p>}{entry.media?.map(asset => <MediaView key={asset.id} asset={asset} />)}</div>) : <blockquote>{item.message}</blockquote>}</div><label className="eyebrow">ПОЧЕМУ Я ЭТО СОХРАНИЛ</label><p>{item.reason}</p>{item.response ? <><label className="eyebrow">ОТВЕТ · {chat.name.toLocaleUpperCase('ru')}</label><p>{item.response}</p></> : <form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); const response = String(data.get('response') || '').trim(); if (!response) return; setState(previous => ({ ...previous, moments: previous.moments.map(moment => moment.id === item.id ? { ...moment, response } : moment) })); }}><input className="simple-input" name="response" placeholder={`Тестовый ответ: ${chat.name}`} required maxLength={500} /><button className="text-button small-action">Добавить ответ собеседника · демо</button></form>}</article>)}</>}
        {panel === 'questions' && <><h3>Спросить нас будущих</h3><p className="muted">Один вопрос, два ответа. Вернётесь к нему в выбранный день.</p><form className="stack-form" onSubmit={event => { event.preventDefault(); const opens = String(new FormData(event.currentTarget).get('opens') || ''); if (!question.trim() || !opens) return; setState(previous => ({ ...previous, questions: [...previous.questions, { id: id(), chatId: chat.id, text: question.trim(), date: opens, answer: '' }] })); setQuestion(''); setQuestionDate(''); }}><label>Наш вопрос<textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder="Какими мы будем через год?" required maxLength={500} /></label><label>Когда открыть<input type="date" name="opens" value={questionDate} min={new Date().toLocaleDateString('en-CA')} onChange={event => setQuestionDate(event.target.value)} required /></label><button className="primary">Оставить на будущее</button></form>{state.questions.filter(item => item.chatId === chat.id).map(item => <article className="history-card" key={item.id}><span className="eyebrow">{new Date(`${item.date}T12:00:00`).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}</span><h3>{item.text}</h3>{item.date > new Date().toLocaleDateString('en-CA') ? <p className="muted"><Clock3 size={16} /> Встретимся с этим вопросом позже.</p> : <><AnswerForm label="Твой ответ" value={item.answer} onSave={answer => setState(previous => ({ ...previous, questions: previous.questions.map(q => q.id === item.id ? { ...q, answer } : q) }))} /><AnswerForm label={`Ответ: ${chat.name} · демо`} value={item.otherAnswer || ''} onSave={otherAnswer => setState(previous => ({ ...previous, questions: previous.questions.map(q => q.id === item.id ? { ...q, otherAnswer } : q) }))} /></>}</article>)}</>}
        {panel === 'chapters' && <><h3>Давай начнём заново</h3><p className="muted">Новая глава начинается, когда вы оба согласны. Всё, что было до неё, остаётся.</p><form className="stack-form" onSubmit={event => { event.preventDefault(); if (!chapterTitle.trim()) return; setState(previous => ({ ...previous, chapters: [...previous.chapters, { id: id(), chatId: chat.id, title: chapterTitle.trim(), status: 'pending' }] })); setChapterTitle(''); }}><label>Название главы<input value={chapterTitle} onChange={event => setChapterTitle(event.target.value)} placeholder="Чуть ближе" maxLength={70} required /></label><button className="primary">Предложить новую главу</button></form>{state.chapters.filter(item => item.chatId === chat.id).map(item => <article className="history-card" key={item.id}><span className="eyebrow">{item.status === 'pending' ? 'ЖДЁМ СОГЛАСИЯ' : 'НОВАЯ ГЛАВА'}</span><h3>{item.title}</h3>{item.status === 'pending' ? <button className="secondary" onClick={() => { setState(previous => acceptChapter(previous, item.id));  }}>Смоделировать согласие {chat.name}</button> : <p className="muted">Вы решили продолжить с новой страницы.</p>}</article>)}</>}
      </div></dialog>}
    </main>}
    {messageMenu && <MessageContextMenu forwardTargets={state.chats} onForwardTo={target=>performForward(selectedIds.includes(messageMenu.message.id)?selectedIds:[messageMenu.message.id],target)} target={messageMenu} onClose={() => setMessageMenu(null)} onReply={() => beginReply(messageMenu.message)} onCopy={() => { void copyMessages([messageMenu.message.id]); }} onEdit={() => beginEdit(messageMenu.message)} onPin={() => { const message = messageMenu.message; setState(previous => ({ ...previous, messages: previous.messages.map(item => item.id === message.id ? { ...item, pinned: !item.pinned } : item) })); }} onForward={() => setForwardIds([messageMenu.message.id])} onSelect={() => setSelectedIds([messageMenu.message.id])} onMoment={() => openMoment(selectedIds.includes(messageMenu.message.id)?selectedIds:[messageMenu.message.id])} onDelete={() => requestDelete([messageMenu.message.id])} />}
    {forwardIds&&<ForwardDialog chats={state.chats} count={forwardIds.length} onClose={()=>setForwardIds(null)} onForward={target=>performForward(forwardIds,target)}/>}
    {deleteIds && <Modal className="delete-dialog" title={deleteIds.length > 1 ? `Удалить выбранные сообщения (${deleteIds.length})?` : 'Удалить выбранное сообщение?'} onClose={() => setDeleteIds(null)}><label className="delete-scope"><input type="checkbox" checked={deleteEveryone} onChange={event => setDeleteEveryone(event.target.checked)} /><span>Удалить у меня и у {deletePartner}</span></label><div className="modal-actions"><button className="secondary glass" onClick={() => setDeleteIds(null)}>Отмена</button><button className="primary" disabled={deleting} onClick={()=>{void confirmDelete();}}>Удалить</button></div></Modal>}

    {modal === 'pinned' && <Modal title="Закреплённые сообщения" onClose={closeModal}>{pinned.length === 0 && <p className="muted">Закреплённых сообщений пока нет.</p>}{pinned.map(item => <div className="pinned-entry" key={item.id}><button className="pinned-choice" onClick={() => { closeModal(); jumpToMessage(item.id); }}><Pin size={16} /><span>{messageSummary(item)}</span><time>{item.time}</time></button><IconButton label={`Открепить: ${messageSummary(item)}`} onClick={() => unpin(item.id)}><PinOff size={18} /></IconButton></div>)}</Modal>}
    {momentIds&&<Modal className="moment-dialog" title="Сохранить момент" onClose={()=>setMomentIds(null)}><p className="muted">Выбрано сообщений: {momentSelected.length}</p><div className="moment-picked">{momentSelected.map(message=><article className="moment-entry" key={message.id}><span className="eyebrow">{message.own?'Вы':chat.name} · {message.time}</span>{message.text&&<p>{message.text}</p>}{message.media?.map(asset=><MediaView key={asset.id} asset={asset}/>)}</article>)}</div><form className="stack-form" onSubmit={event=>{event.preventDefault();const next=saveMoment(state,chat.id,momentIds,reason);if(next===state)return;setState(next);setMomentIds(null);setSelectedIds([]);setPanel('moments');}}><label>Почему я это сохранил<textarea value={reason} onChange={event=>setReason(event.target.value)} placeholder="В этот момент мы стали немного ближе" required maxLength={1000}/></label><button className="primary" disabled={!momentSelected.length}>Сохранить момент · {momentSelected.length}</button></form></Modal>}
    {modal === 'settings' && <Modal title="Настройки" onClose={closeModal}><p className="muted">Прототип с локальными данными. Для настоящей переписки подключим твой FastAPI.</p><button className="setting-row" onClick={notify}><Bell /><span>Проверить уведомление<small>Яркая вспышка звезды · пауза 2,5 секунды</small></span><ChevronRight /></button><button className="setting-row" onClick={() => { setStage('intro'); closeModal(); }}><LogOut /><span>Вернуться на экран входа</span><ChevronRight /></button>{removedUndo&&<button className="setting-row" onClick={()=>{setState(previous=>restoreMessages(previous,removedUndo));setRemovedUndo(null);}}><Reply/><span>Восстановить последние удалённые сообщения</span></button>}<button className="text-button reset-button" onClick={() => setModal('reset-confirm')}>Сбросить демонстрацию</button></Modal>}
    {modal === 'reset-confirm' && <Modal title="Сбросить демонстрацию?" onClose={closeModal}><p className="muted">Локальная переписка и сохранённые моменты вернутся к начальному состоянию.</p><div className="modal-actions"><button className="secondary" onClick={closeModal}>Отмена</button><button className="primary" onClick={() => { fileGeneration.current += 1; setPreparingFiles(false); setState(initialState()); setChatId('mira'); setDrafts({}); setAttachment(null); setPanel(null); setReplyTo(null); setEditing(null); setSelectedIds([]); setRemovedUndo(null);  closeModal(); }}>Сбросить</button></div></Modal>}
    {modal === 'profile' && <Modal title="Профиль" onClose={closeModal}><Avatar asset={avatar} initial={name.slice(0,1).toLocaleUpperCase('ru')} className="profile-avatar"/><input type="file" ref={avatarInput} hidden accept="image/*" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)setCropFile(file);}}/><div className="avatar-actions"><button className="secondary" onClick={()=>avatarInput.current?.click()}>{avatar?'Изменить аватар':'Добавить аватар'}</button>{avatar&&<button className="text-button" onClick={()=>{setAvatar(undefined);try{localStorage.removeItem('aws.avatar');}catch{/* in memory */}}}>Убрать</button>}</div><form className="stack-form" onSubmit={event => { event.preventDefault(); const value = String(new FormData(event.currentTarget).get('name') || '').trim(); if (!value) return; setName(value); try { localStorage.setItem('aws.name', value); } catch { /* In-memory profile still works. */ } closeModal(); }}><label>Как тебя зовут<input name="name" defaultValue={name} required maxLength={40} /></label><button className="primary">Сохранить</button></form></Modal>}
    {modal === 'calls' && <Modal title="Звонки" onClose={closeModal}><div className="empty-state"><Phone /><p>Здесь будет голос</p><span>В этом прототипе проверяем вход и переписку. Звонки ещё не подключены.</span></div><button className="secondary full" onClick={closeModal}>Вернуться к разговору</button></Modal>}
    {modal === 'new-chat' && <Modal title="Начать разговор" onClose={closeModal}><p className="muted">В демо доступны три собеседника.</p>{state.chats.map(item => <button className="contact-choice" key={item.id} onClick={() => { selectChat(item.id); closeModal(); }}><span className="avatar">{item.initial}</span>{item.name}<ChevronRight /></button>)}</Modal>}
    {modal === 'recovery' && <Modal title="Восстановление доступа" onClose={closeModal}><p className="muted">Сейчас это демонстрационный вход: подойдут любые логин и пароль. Восстановление подключим к твоему бэку.</p><button className="secondary full" onClick={closeModal}>Понятно</button></Modal>}
    {cropFile&&<AvatarCropDialog file={cropFile} onClose={()=>setCropFile(null)} onSave={saveAvatar}/>}
    {storageError && <div className="storage-warning" role="status">Браузер не сохраняет данные. Изменения доступны до перезагрузки.</div>}
  </>;
}

function AnswerForm({ label, value, onSave }: { label: string; value: string; onSave: (value: string) => void }) {
  return value ? <div className="answer"><span className="eyebrow">{label}</span><p>{value}</p></div> : <form className="answer-form" onSubmit={event => { event.preventDefault(); const answer = String(new FormData(event.currentTarget).get('answer') || '').trim(); if (answer) onSave(answer); }}><label>{label}<textarea name="answer" required maxLength={1000} placeholder="Что бы ты ответил сейчас?" /></label><button className="text-button small-action">Сохранить ответ</button></form>;
}
