import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { Archive, ArrowLeft, ArrowUpRight, Bookmark, Check, ChevronRight, Copy, Forward, Pin, PinOff, Reply, Trash2, Clock3, LogOut, MessageCircle, MoreHorizontal, Paperclip, Phone, Search, Send, Settings, Smile, SquarePen, UserRound, X } from 'lucide-react';
import { acceptChapter, canPulse, editMessage, forwardMessages, id, initialState, removeMessages, restoreMessages, restoreState, saveMoment, messageSummary, storageKey, timeNow, type Chat, type MediaAsset, type DemoState, type Message, type RemovedMessage, type ReplySnapshot } from './domain';
import { MessageBubble, MessageContextMenu, type MessageMenuTarget } from './MessageActions';
import MediaView from './MediaView';
import RecordingControl from './RecordingControl';
import Avatar from './Avatar';
import AvatarCropDialog from './AvatarCropDialog';
import ForwardDialog from './ForwardDialog';
import MomentCard from './MomentCard';
import FutureQuestionsPanel, { FutureQuestionsLayout } from './FutureQuestionsPanel';
import FutureQuestionAnswerForm from './FutureQuestionAnswerForm';
import { dateValue } from './QuestionDatePicker';
import ContactProfile from './ContactProfile';
import ChaptersPanel from './ChaptersPanel';
import ChapterHistory from './ChapterHistory';
import ChapterProposalNotice from './ChapterProposalNotice';
import ScrollToBottom from './ScrollToBottom';
import useArchive from './useArchive';
import useNotifications from './useNotifications';
import { archiveKey } from './archiveStore';
import ArchiveAction from './ArchiveAction';
import ArchiveEmpty from './ArchiveEmpty';
import HistoryArchive from './HistoryArchive';
import ChatArchiveList, { ArchiveChatRow } from './ChatArchiveList';
import DateSortButton, { sortByCreated, type DateOrder } from './DateSortButton';
import { chapterBoundaries, placeChapterBoundaries, type ChapterBoundary } from './chapterTimeline';
import ChatListDivider, { loadChatListWidth, maxChatListWidth, saveChatListWidth } from './ChatListDivider';
import ConversationSearch from './ConversationSearch';
import { animateMessageDeletion } from './deletionAnimation';
import { fileKind, storeMedia } from './mediaStore';
import AuthForm from './AuthForm';
import CenteredAuth from './CenteredAuth';
import AccountSettings from './AccountSettings';
import ProfileEditor from './ProfileEditor';
import EmailConfirmation from './EmailConfirmation';
import PasswordReset from './PasswordReset';
import PasswordRecoveryForm from './PasswordRecoveryForm';
import useAuthSession from './useAuthSession';
import { ApiError, authApi, friendlyError } from './authApi';
import useMessenger from './useMessenger';
import useReadTracking from './useReadTracking';
import useFutureQuestionClock from './useFutureQuestionClock';
import useHiddenQuestions from './useHiddenQuestions';
import useDragSelection from './useDragSelection';
import useAutoHistory from './useAutoHistory';
import useUserSearch from './useUserSearch';
import type { ArchiveKind, PublicUser, ServerChapter, ServerFutureQuestion } from './messengerApi';
import type { Moment } from './domain';
import DevAccountSwitch from './DevAccountSwitch';
import { findOwnChats, usesGlobalSearch } from './userSearch';
import { findMoments } from './search';

function Star({pulse=false,ambient=false}:{pulse?:boolean;ambient?:boolean}){
 const bloom=useId().replaceAll(':','');const shape='M30 0C28 46 27 51 0 54C27 57 28 62 30 108C32 62 33 57 60 54C33 51 32 46 30 0Z';
 return <svg className={`star ${pulse?'is-pulsing':''} ${ambient?'is-ambient':''}`} viewBox="0 0 60 108" aria-hidden="true"><defs><filter id={bloom} x="-150%" y="-100%" width="400%" height="300%"><feGaussianBlur stdDeviation="7"/></filter><filter id={`${bloom}-close`} x="-100%" y="-70%" width="300%" height="240%"><feGaussianBlur stdDeviation="2.5"/></filter></defs><g className="star-halo"><path d={shape} fill="white" opacity=".85" filter={`url(#${bloom}-close)`}/><path d={shape} fill="white" filter={`url(#${bloom})`}/><path d={shape} fill="white" opacity=".9" filter={`url(#${bloom})`}/></g><path className="star-core" d={shape} fill="currentColor"/></svg>;
}
function ChapterDivider({ title, boundaryId }: { title: string; boundaryId?: string }) {
  return <section className="chapter-divider" aria-label={title} data-chapter-id={boundaryId} tabIndex={boundaryId ? -1 : undefined}>
    <div className="chapter-rule" aria-hidden="true"><span className="chapter-star"><Star /></span></div>
    <h2>{title}</h2>
  </section>;
}
function Brand({ compact = false, pulse = false }: { compact?: boolean; pulse?: boolean }) {
  if (compact) return <span className="brand brand-compact"><span className="brand-type"><span className="brand-wordmark">Are we strangers?</span><Star pulse={pulse} /></span></span>;
  return <span className="brand"><Star pulse={pulse} ambient /><span className="brand-type"><span>Are we</span><span>strangers?</span></span></span>;
}
function IconButton({ label, children, onClick, className = '', type = 'button', disabled = false }: { label: string; children: ReactNode; onClick?: () => void; className?: string; type?: 'submit' | 'button'; disabled?: boolean }) {
  return <button type={type} disabled={disabled} className={`icon-button ${className}`} onClick={onClick} aria-label={label}>{children}</button>;
}
function Modal({ title, children, onClose, className = '', locked = false }: { title: string; children: ReactNode; onClose: () => void; className?: string; locked?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current!; node.showModal(); node.querySelector<HTMLInputElement | HTMLTextAreaElement>('textarea,input:not([type=hidden]):not([type=checkbox])')?.focus(); return () => node.close(); }, []);
  return <dialog ref={dialog} className={`modal glass ${className}`} onCancel={event => { if (locked) event.preventDefault(); else onClose(); }} onClick={event => { if (!locked && event.target === dialog.current) onClose(); }}><header><h2>{title}</h2><IconButton label="Закрыть" disabled={locked} onClick={onClose}><X /></IconButton></header>{children}</dialog>;
}
function loadDemo(userId: number) { try { return restoreState(localStorage.getItem(`${storageKey}.user.${userId}`)); } catch { return initialState(); } }
type Panel = 'moments' | 'questions' | 'chapters' | 'archive';
const minimumChatSearchWidth = 122;
type ModalName = 'settings' | 'profile' | 'calls' | 'new-chat' | 'recovery' | 'pinned' | null;
const emptyChat: Chat = { id: '', name: '', initial: '', online: false, unread: 0 };
function dayLabel(date: string) {
  const value = new Date(date), now = new Date();
  return value.toDateString() === now.toDateString() ? 'Сегодня' : new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: value.getFullYear() !== now.getFullYear() ? 'numeric' : undefined }).format(value);
}

export default function App() {
  const { user: account, checking, sessionError, acceptUser, clearUser, refresh } = useAuthSession();
  const { hiddenQuestions, setQuestionHidden } = useHiddenQuestions(account?.id ?? null);
  const [stage, setStage] = useState<'intro' | 'login' | 'chat'>('intro');
  const [register, setRegister] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [emailRoute, setEmailRoute] = useState(() => /^\/verify-email\/?$/.test(window.location.pathname));
  const [passwordRoute, setPasswordRoute] = useState(() => /^\/reset-password\/?$/.test(window.location.pathname));
  const [demoOwner, setDemoOwner] = useState<number | null>(null);
  const [avatar,setAvatar]=useState<MediaAsset|undefined>();
  const [cropFile,setCropFile]=useState<File|null>(null);
  const avatarInput=useRef<HTMLInputElement>(null);
  const [deleting,setDeleting]=useState(false);
  const [name, setName] = useState('Вы');
  const [demoState, setDemoState] = useState<DemoState>(initialState);
  const [demoMode, setDemoMode] = useState(false);
  const [chatId, setChatId] = useState('mira');
  const [mobileChat, setMobileChat] = useState(false);
  const [search, setSearch] = useState('');
  const [newSearch, setNewSearch] = useState('');
  const [openingUser, setOpeningUser] = useState<number | null>(null);
  const openingRef = useRef(false);
  const [openError, setOpenError] = useState('');
  const [messageSearch, setMessageSearch] = useState<string | null>(null);
  const [searchActiveId,setSearchActiveId]=useState<string|null>(null);
  const searchNavigation = useRef<AbortController | null>(null);
  const [searchNavigating, setSearchNavigating] = useState(false);
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
  const [chapterHistoryId, setChapterHistoryId] = useState<string | null>(null);
  const chapterHistoryTrigger = useRef<HTMLButtonElement | null>(null);
  const chapterListScroll = useRef(0);
  const [chatArchiveOpen, setChatArchiveOpen] = useState(false);
  const [answeringQuestion, setAnsweringQuestion] = useState<{ chatId: string; id: number } | null>(null);
  const [contactOpen,setContactOpen]=useState(false);
  const [contactVisible,setContactVisible]=useState(false);
  const contactButton=useRef<HTMLButtonElement>(null);
  const [historyClosing,setHistoryClosing]=useState(false);
  const historyCloseTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [momentIds, setMomentIds] = useState<string[] | null>(null);
  const [momentQuery, setMomentQuery] = useState<string | null>(null);
  const [momentOrder, setMomentOrder] = useState<DateOrder>('desc');
  const [reason, setReason] = useState('');
  const [momentSaving, setMomentSaving] = useState(false);
  const [momentError, setMomentError] = useState('');
  const momentRequest = useRef(false);
  const [messageMenu, setMessageMenu] = useState<MessageMenuTarget | null>(null);
  const [replyTo, setReplyTo] = useState<ReplySnapshot | null>(null);
  const [editing, setEditing] = useState<{ messageId: string; originalDraft: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [forwardIds, setForwardIds] = useState<string[] | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const forwardingRef = useRef(false);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [deleteEveryone, setDeleteEveryone] = useState(true);
  const [removedUndo, setRemovedUndo] = useState<RemovedMessage[] | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chapterTitle, setChapterTitle] = useState('');
  const chapterNavigation = useRef<AbortController | null>(null);
  const [chapterJump, setChapterJump] = useState<{ id: string; chatId: string; ownerId: number } | null>(null);
  const [inlineError,setInlineError]=useState('');
  const [pulse, setPulse] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const lastPulse = useRef<number | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [chatListWidth, setChatListWidth] = useState(loadChatListWidth);
  const wide = viewportWidth > 760;
  const maximumChatListWidth = Math.min(maxChatListWidth, viewportWidth - 420);
  const sidebarWidth = Math.min(chatListWidth, maximumChatListWidth);
  const compactSidebar = wide && sidebarWidth < 96;
  const showChatSearch = !wide || sidebarWidth >= minimumChatSearchWidth;
  const scrollIntent=useRef(0);
  const composer = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const historyDialog = useRef<HTMLDialogElement>(null);
  const panelOpen = panel !== null;
  const live = useMessenger(account?.id ?? null, clearUser, key => { if (!demoMode) pulseNotification(key); }, async (ids, signal) => {
    if (!demoMode) await animateMessageDeletion(ids, signal);
  });
  const archive = useArchive(demoMode ? null : live.store?.archives);
  const notifications = useNotifications(demoMode ? null : live.store?.notifications);
  const archivedChatIds = new Set(archive.data?.chat_ids);
  const archivedMomentIds = new Set(archive.data?.moment_ids);
  const archivedQuestionIds = new Set(archive.data?.question_ids);
  const state = demoMode ? demoState : live.state;
  function setState(next: SetStateAction<DemoState>) { if (demoMode) setDemoState(next); }
  const results = useUserSearch(search, account?.id ?? null, !!account && !demoMode, clearUser);
  const newResults = useUserSearch(newSearch, account?.id ?? null, !!account && !demoMode && modal === 'new-chat', clearUser);
  const chat = state.chats.find(item => item.id === chatId) || ((demoMode || archive.data) ? state.chats.find(item => demoMode || !archivedChatIds.has(item.serverId!)) : undefined) || emptyChat;
  const messages = !demoMode && live.store ? live.store.messagesForChat(chat.id) : state.messages.filter(item => item.chatId === chat.id);
  const messagesById = new Map(state.messages.filter(message => message.chatId === chat.id).map(message => [message.id, message]));
  const replySource = replyTo ? messagesById.get(replyTo.id) : undefined;
  const replyPreview = !demoMode && replyTo
    ? replySource ? quoteFor(replySource) : { ...replyTo, text: 'Исходное сообщение недоступно', author: 'Ответ на сообщение' }
    : replyTo;
  const activeChatRef = useRef(chat.id); activeChatRef.current = chat.id;
  const pinned = demoMode
    ? messages.filter(message => message.pinned && !message.kind).reverse()
    : live.pins[chat.id] ?? [];
  const pinnedIds = new Set(pinned.map(message => message.id));
  const draft = drafts[chat.id] || '';
  const currentAttachment = attachment?.chatId === chat.id ? attachment : null;
  const momentSelected=state.messages.filter(item=>item.chatId===chat.id&&!item.kind&&momentIds?.includes(item.id));
  const allMoments = state.moments.filter(moment => moment.chatId === chat.id);
  const moments = allMoments.filter(moment => demoMode || !archivedMomentIds.has(moment.serverId!));
  const visibleMoments = sortByCreated(findMoments(moments, momentQuery ?? ''), moment => moment.createdAt, momentOrder);
  const momentsStatus = live.momentsStatus[chat.id];
  const chaptersStatus = live.chapters[chat.id];
  const chapterCards = chaptersStatus?.cards ?? [];
  const chapterStarts = demoMode ? [] : chapterBoundaries(chat, chapterCards);
  const historyChapter = panel === 'chapters' ? chapterStarts.find(boundary => boundary.id === chapterHistoryId) : undefined;
  const futureQuestions = live.questions[chat.id];
  const futureQuestionCards = futureQuestions?.cards ?? [];
  const demoQuestions = demoMode && panel === 'questions' ? state.questions.filter(item => item.chatId === chat.id) : [];
  const questionClock = useFutureQuestionClock(demoMode
    ? demoQuestions.map(question => Date.parse(`${question.date}T00:00:00`))
    : futureQuestionCards.map(card => Date.parse(card.opens_at)));
  const questionNotices = new Map<string | null, ServerFutureQuestion[]>();
  const history = live.history[chat.id];
  const timelineVisible = (time: number) => !history?.range || (!!messages.length
    && (!history.hasOlder || time >= Date.parse(messages[0].createdAt!))
    && (!history.hasNewer || time <= Date.parse(messages.at(-1)!.createdAt!)));
  if (!demoMode && messageSearch === null) {
    const openQuestions = futureQuestionCards.filter(card => !hiddenQuestions.has(card.id) && !archivedQuestionIds.has(card.id) && Date.parse(card.opens_at) <= questionClock && timelineVisible(Date.parse(card.opens_at)))
      .sort((first, second) => Date.parse(first.opens_at) - Date.parse(second.opens_at) || first.id - second.id);
    for (const card of openQuestions) {
      const openedAt = Date.parse(card.opens_at);
      const nextMessage = messages.find(message => message.createdAt && Date.parse(message.createdAt) >= openedAt);
      const key = nextMessage?.id ?? null;
      const notices = questionNotices.get(key) ?? [];
      notices.push(card);
      questionNotices.set(key, notices);
    }
  }
  const chapterProposals = new Map<string | null, ServerChapter[]>();
  if (!demoMode && messageSearch === null) {
    for (const chapter of chapterCards.filter(card => card.status === 'pending' && timelineVisible(Date.parse(card.created_at)))) {
      const proposedAt = Date.parse(chapter.created_at);
      const nextMessage = messages.find(message => message.createdAt && Date.parse(message.createdAt) >= proposedAt);
      const key = nextMessage?.id ?? null;
      const proposals = chapterProposals.get(key) ?? [];
      proposals.push(chapter);
      chapterProposals.set(key, proposals);
    }
  }
  const chapterMarkers = !demoMode && messageSearch === null && history && chaptersStatus
    ? placeChapterBoundaries(chapterStarts.filter(chapter => timelineVisible(Date.parse(chapter.startedAt))), messages, history.hasOlder) : new Map<string | null, ChapterBoundary[]>();
  const showFirstChapter = demoMode;
  const sending = !demoMode && !!live.sending[chat.id];
  const historyTop = useRef<HTMLDivElement>(null);
  const historyBottom = useRef<HTMLDivElement>(null);
  const olderRequests = useRef(new Set<string>());
  const olderAnchor = useRef<{ chatId: string; ownerId: number | undefined; height: number; top: number; beforeId: number; messageId?: string; offset?: number } | null>(null);
  const draftVersions = useRef<Record<string, number>>({});
  const ownerRef = useRef(account?.id); ownerRef.current = account?.id;
  const viewRevision = useRef(0);
  const readEntry = useReadTracking({
    viewKey: !demoMode && stage === 'chat' && (wide || mobileChat) && chat.id ? `${account?.id}:${chat.id}:${wide || mobileChat}` : '',
    chatId: chat.id, store: live.store, messages, history, scroll, conversation, followBottom,
    obscured: !!(contactVisible || modal || panel || messageMenu || momentIds || forwardIds || deleteIds || menuOpen || emojiOpen || messageSearch !== null),
  });
  useAutoHistory({
    scroll, boundary: historyTop, viewKey: `${account?.id}:${chat.id}`,
    enabled: !demoMode && stage === 'chat' && (wide || mobileChat) && readEntry.ready
      && !contactVisible && !modal && !panel && (messageSearch === null || !!history?.range) && !searchNavigating,
    history, load: loadOlder,
  });
  useAutoHistory({
    scroll, boundary: historyBottom, viewKey: `${account?.id}:${chat.id}`, direction: 'newer',
    enabled: !demoMode && stage === 'chat' && (wide || mobileChat) && readEntry.ready
      && !contactVisible && !modal && !panel && !searchNavigating,
    history: { loading: !!(history?.loadingNewer || history?.loading), hasOlder: !!history?.hasNewer, error: history?.newerError ?? '' },
    load: async () => { await live.store?.loadNewer(chat.id); },
  });
  useDragSelection({
    scroll,
    viewKey: stage === 'chat' && (wide || mobileChat) && chat.id && !contactVisible ? `${account?.id}:${chat.id}` : '',
    selectedIds,
    limit: demoMode ? Infinity : 100,
    onSelect: ids => { followBottom.current = false; setSelectedIds(ids); },
    onMenu: (id, x, y) => {
      const message = messagesById.get(id);
      if (message) setMessageMenu({ message, x, y });
    },
  });
  const activity = new Map(state.chats.map(item => [item.id, Date.parse(item.createdAt || '') || 0]));
  for (const message of state.messages) if (message.createdAt) activity.set(message.chatId, Math.max(activity.get(message.chatId) || 0, Date.parse(message.createdAt)));
  const globalSearch = !demoMode && usesGlobalSearch(search);
  const existingPartners = new Set(state.chats.map(item => item.partnerId));
  const globalUsers = results.users.filter(user => !existingPartners.has(user.id));
  const archivedChats = state.chats.filter(item => archivedChatIds.has(item.serverId!));
  const visibleChats = !demoMode && !archive.data && !archive.error ? [] : findOwnChats(state.chats.filter(item => demoMode || (search.trim() && !chatArchiveOpen) || archivedChatIds.has(item.serverId!) === chatArchiveOpen), search, results.users);
  if (demoMode) visibleChats.sort((a, b) => (activity.get(b.id) || 0) - (activity.get(a.id) || 0));
  useEffect(() => { const resize = () => setViewportWidth(window.innerWidth); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  function resizeChatList(width: number, save: boolean) {
    setChatListWidth(width);
    if (width < minimumChatSearchWidth && search) setSearch('');
    if (save) saveChatListWidth(width);
  }
  useEffect(() => { setOpenError(''); }, [search, newSearch]);

  useEffect(() => {
    if (!demoMode && !archive.data) return;
    if (!state.chats.some(item => item.id === chatId)) setChatId(state.chats.find(item => demoMode || !archivedChatIds.has(item.serverId!))?.id || '');
  }, [state.chats, chatId, archive.data, demoMode]);
  useLayoutEffect(() => { live.store?.selectChat(!demoMode && (wide || mobileChat) ? chat.id : ''); }, [live.store, demoMode, chat.id, mobileChat, wide]);
  useEffect(() => {
    if (demoMode) return;
    const existing = new Set(messages.map(message => message.id));
    setSelectedIds(previous => previous.every(id => existing.has(id)) ? previous : previous.filter(id => existing.has(id)));
    if (editing && !existing.has(editing.messageId)) { cancelEdit(); setInlineError('Это сообщение удалено.'); }
    if (messageMenu && !existing.has(messageMenu.message.id)) setMessageMenu(null);
  }, [live.state.messages, demoMode, chat.id]);

  useEffect(() => {
    setModal(null); setPanel(null); setContactOpen(false); setContactVisible(false);
    setChatArchiveOpen(false);
    setDrafts({}); setAttachment(null); setReplyTo(null); setEditing(null); setSelectedIds([]);
    setMessageMenu(null); setForwardIds(null); setDeleteIds(null); setMomentIds(null); setCropFile(null);
    setRemovedUndo(null); setDeleting(false); setAccountError(''); setMobileChat(false); setChatId(''); setDemoMode(false); setSearch(''); setNewSearch(''); setOpenError(''); setInlineError('');
    draftVersions.current = {}; olderAnchor.current = null;
    viewRevision.current++;
    fileGeneration.current += 1; setPreparingFiles(false);
    if (!account) { setStage('intro'); setDemoOwner(null); setDemoState(initialState()); setAvatar(undefined); return; }
    setDemoState(loadDemo(account.id)); setDemoOwner(account.id); setStage('chat');
    try { setAvatar(JSON.parse(localStorage.getItem(`aws.avatar.user.${account.id}`) || 'null') || undefined); }
    catch { setAvatar(undefined); }
  }, [account?.id]);
  useEffect(() => { if (account) setName(account.name); }, [account?.name]);
  useEffect(() => {
    if (!account || demoOwner !== account.id) return;
    try { localStorage.setItem(`${storageKey}.user.${account.id}`, JSON.stringify(demoState)); }
    catch { setStorageError(true); }
  }, [demoState, account?.id, demoOwner]);
  useEffect(() => {
    if (!panelOpen) return;
    const node = historyDialog.current!;
    node.showModal();
    return () => node.close();
  }, [panelOpen]);
  useEffect(() => {
    if ((panel === 'moments' || panel === 'archive') && !demoMode && chat.serverId) void live.store?.loadMoments(chat.id);
    if (panel === 'archive' && !demoMode && chat.serverId) void live.store?.loadFutureQuestions(chat.id);
  }, [panel, demoMode, chat.id, chat.serverId, live.store]);
  useEffect(() => { setChapterHistoryId(null); chapterListScroll.current = 0; }, [chat.id, account?.id, panel]);
  useEffect(() => {
    if (!chapterHistoryId || panel !== 'chapters' || demoMode || !chat.serverId) return;
    void live.store?.loadMoments(chat.id);
    void live.store?.loadFutureQuestions(chat.id);
  }, [chapterHistoryId, panel, demoMode, chat.id, chat.serverId, live.store]);
  useLayoutEffect(() => {
    if (panel !== 'chapters') return;
    const content = historyDialog.current?.querySelector<HTMLElement>('.panel-content');
    if (content) content.scrollTop = chapterHistoryId ? 0 : chapterListScroll.current;
  }, [chapterHistoryId, panel]);
  useEffect(() => {
    if (stage === 'chat' && !demoMode && chat.serverId && (wide || mobileChat)) void live.store?.loadFutureQuestions(chat.id);
  }, [stage, demoMode, chat.id, chat.serverId, wide, mobileChat, live.store]);
  useEffect(() => {
    if (stage === 'chat' && !demoMode && chat.serverId && (wide || mobileChat)) void live.store?.loadChapters(chat.id);
  }, [stage, demoMode, chat.id, chat.serverId, wide, mobileChat, live.store]);
  useEffect(() => {
    setChapterJump(null);
    return () => chapterNavigation.current?.abort();
  }, [chat.id, account?.id, demoMode]);
  useLayoutEffect(() => {
    if (!chapterJump || contactVisible || panel !== null || chapterJump.chatId !== chat.id || chapterJump.ownerId !== account?.id) return;
    const boundary = scroll.current?.querySelector<HTMLElement>(`[data-chapter-id="${CSS.escape(chapterJump.id)}"]`);
    if (boundary) {
      boundary.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      boundary.focus({ preventScroll: true });
    } else setInlineError('Не удалось найти начало главы. Попробуй открыть её ещё раз.');
    setChapterJump(null);
  }, [chapterJump, contactVisible, panel, chat.id, account?.id]);
  useEffect(() => { setAnsweringQuestion(null); }, [chat.id, account?.id]);
  useEffect(() => { setMomentQuery(null); }, [panel, chat.id, demoMode, account?.id]);
  useLayoutEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const anchor = olderAnchor.current;
    if (anchor?.chatId === chat.id && anchor.ownerId === account?.id && (history?.hasOlder === false || messages.some(message => message.serverId && message.serverId < anchor.beforeId))) {
      const row = anchor.messageId ? node.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(anchor.messageId)}"]`) : null;
      if (row && anchor.offset !== undefined) node.scrollTop += row.getBoundingClientRect().top - node.getBoundingClientRect().top - anchor.offset;
      else node.scrollTop = anchor.top + node.scrollHeight - anchor.height;
      olderAnchor.current = null;
    } else if (followBottom.current && (demoMode || readEntry.ready)) node.scrollTop = node.scrollHeight;
  }, [chat.id, account?.id, messages.length, history?.hasOlder, history?.range, stage, mobileChat, replyTo?.id, editing?.messageId]);
  useEffect(() => {
    const node = scroll.current;
    if (!node || stage !== 'chat') return;
    followBottom.current = demoMode;
    function onScroll() { if (node && performance.now()-scrollIntent.current<800 && scrollIntent.current>0) followBottom.current = !live.store?.getSnapshot().history[chat.id]?.hasNewer && node.scrollHeight - node.scrollTop - node.clientHeight < 80; }
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
    setChatArchiveOpen(false);
    setContactOpen(false);setContactVisible(false); cancelEdit(); setReplyTo(null); setSelectedIds([]); setMessageMenu(null); setAttachment(null); fileGeneration.current += 1; setPreparingFiles(false);
    setMomentIds(null);
    followBottom.current = demoMode; olderAnchor.current = null; setInlineError('');
    setChatId(selected); setMobileChat(true); setMessageSearch(null); setEmojiOpen(false); setMenuOpen(false); setPanel(null);
    if (!demoMode) live.store?.selectChat(selected);
    setState(previous => ({ ...previous, chats: previous.chats.map(item => item.id === selected ? { ...item, unread: 0 } : item) }));
  }
  function requireDemo() {
    if (demoMode) return true;
    setInlineError('Эта возможность пока доступна в демо. Собеседнику ничего не отправлено.'); return false;
  }
  async function openUser(user: PublicUser) {
    if (openingRef.current || !live.store) return;
    openingRef.current = true; setOpeningUser(user.id); setOpenError('');
    const owner = account?.id;
    const revision = viewRevision.current;
    try {
      const key = await live.store.createChat(user.id);
      if (key && ownerRef.current === owner && viewRevision.current === revision) { selectChat(key); setSearch(''); setNewSearch(''); closeModal(); }
    } catch (error) { if (ownerRef.current === owner && viewRevision.current === revision) setOpenError(friendlyError(error)); }
    finally { openingRef.current = false; if (ownerRef.current === owner) setOpeningUser(null); }
  }
  async function loadOlder() {
    const node = scroll.current, key = chat.id;
    const requestKey = `${account?.id}:${key}:${history?.range?.target ?? 'latest'}`;
    if (!node || !live.store || olderRequests.current.has(requestKey) || history?.loading || (!history?.hasOlder && !history?.error)) return;
    olderRequests.current.add(requestKey);
    followBottom.current = false;
    const anchor: NonNullable<typeof olderAnchor.current> = {
      chatId: key, ownerId: account?.id, height: node.scrollHeight, top: node.scrollTop,
      beforeId: messages.reduce((oldest, message) => Math.min(oldest, message.serverId ?? Infinity), Infinity),
    };
    function capture() {
      const top = Math.max(node!.getBoundingClientRect().top, conversation.current?.querySelector('.conversation-header')?.getBoundingClientRect().bottom ?? 0);
      const row = [...node!.querySelectorAll<HTMLElement>('[data-message-id]')].find(element => element.getBoundingClientRect().bottom > top);
      anchor.top = node!.scrollTop; anchor.height = node!.scrollHeight;
      anchor.messageId = row?.dataset.messageId;
      anchor.offset = row ? row.getBoundingClientRect().top - node!.getBoundingClientRect().top : undefined;
    }
    capture();
    olderAnchor.current = anchor;
    const track = () => { if (olderAnchor.current === anchor && activeChatRef.current === key && ownerRef.current === anchor.ownerId) capture(); };
    node.addEventListener('scroll', track, { passive: true });
    try { await live.store.loadOlder(key); }
    finally {
      olderRequests.current.delete(requestKey);
      node.removeEventListener('scroll', track);
      requestAnimationFrame(() => { if (olderAnchor.current === anchor) olderAnchor.current = null; });
    }
  }
  async function signOut() {
    if (loggingOut) return;
    setLoggingOut(true); setAccountError('');
    try { await authApi.logout(); clearUser(); }
    catch (error) { setAccountError(friendlyError(error)); }
    finally { setLoggingOut(false); }
  }
  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (preparingFiles || sending) return;
    if (!demoMode) {
      if (!draft.trim() || !live.store || !chat.serverId) return;
      if (draft.length > 4096) { setInlineError('В одном сообщении может быть до 4096 символов.'); return; }
      const key = chat.id, text = draft, version = draftVersions.current[key] || 0, owner = account?.id;
      const edit = editing, revision = viewRevision.current;
      const reply = replyTo;
      if (!edit && reply && !replySource?.serverId) {
        setInlineError('Исходное сообщение недоступно. Отмени цитату, чтобы отправить текст.');
        return;
      }
      setInlineError('');
      try {
        const sent = edit ? await live.store.editText(key, edit.messageId, text) : await live.store.sendText(key, text, replySource?.serverId);
        if (!sent || ownerRef.current !== owner || viewRevision.current !== revision) return;
        setDrafts(previous => previous[key] === text && (draftVersions.current[key] || 0) === version ? { ...previous, [key]: edit?.originalDraft || '' } : previous);
        if (edit) setEditing(previous => previous?.messageId === edit.messageId ? null : previous);
        else if (reply) setReplyTo(previous => previous === reply ? null : previous);
        if (activeChatRef.current === key) {
          if (!edit) {
            followBottom.current = true;
            if (live.store.getSnapshot().history[key]?.range) {
              try { await live.store.returnToLatest(key); }
              catch { if (activeChatRef.current === key) setInlineError('Сообщение отправлено. Не удалось загрузить конец переписки — нажми кнопку прокрутки вниз ещё раз.'); }
            }
            if (activeChatRef.current !== key || ownerRef.current !== owner) return;
            requestAnimationFrame(() => { if (scroll.current && activeChatRef.current === key) scroll.current.scrollTop = scroll.current.scrollHeight; });
          }
          setEmojiOpen(false); composer.current?.focus();
        }
      } catch (error) {
        if (ownerRef.current === owner && viewRevision.current === revision && activeChatRef.current === key) setInlineError(`${friendlyError(error)}. Текст сохранён в поле ввода. Перед повторной отправкой проверь переписку.`);
      }
      return;
    }
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
  function pulseNotification(key: string) {
    const now = Date.now();
    let silent = key.startsWith('server-') ? !live.store?.notifications.canNotify(Number(key.slice(7))) : false;
    if (!key.startsWith('server-')) try{silent=localStorage.getItem(`aws.muted.${key}`)==='true';}catch{/* Demo preference stays local. */}
    if (!silent && canPulse(now, lastPulse.current)) { lastPulse.current = now; setPulse(true); pulseTimer.current = setTimeout(() => setPulse(false), 1400); }
  }
  function cancelEdit() {
    if (editing) setDrafts(previous => ({ ...previous, [chat.id]: editing.originalDraft }));
    setEditing(null);
  }
  function beginEdit(message: Message) {
    if (!message.own) return;
    setInlineError('');
    setEditing({ messageId: message.id, originalDraft: editing?.originalDraft ?? draft });
    setDrafts(previous => ({ ...previous, [chat.id]: message.text }));
    setReplyTo(null); setAttachment(null); fileGeneration.current += 1; setPreparingFiles(false); requestAnimationFrame(() => composer.current?.focus());
  }
  function quoteFor(message: Message): ReplySnapshot {
    return { id: message.id, text: messageSummary(message), author: message.own ? name : chat.name };
  }
  function beginReply(message: Message) {
    const source = messagesById.get(message.id);
    if (!source || (!demoMode && !source.serverId)) return;
    cancelEdit();
    setInlineError('');
    setReplyTo(quoteFor(source));
    requestAnimationFrame(() => composer.current?.focus());
  }
  async function copyMessages(messageIds: string[]) {
    const text = state.messages.filter(item => messageIds.includes(item.id)).map(item => item.text || item.attachment || '').join('\n');
    try { await navigator.clipboard.writeText(text); }
    catch { setInlineError('Браузер не разрешил копирование. Попробуй ещё раз.'); }
  }
  function toggleSelected(messageId: string) {
    setSelectedIds(previous => previous.includes(messageId) ? previous.filter(item => item !== messageId) : !demoMode && previous.length >= 100 ? previous : [...previous, messageId]);
  }
  useEffect(()=>{setSearchActiveId(null);if(messageSearch!==null)followBottom.current=false;},[messageSearch,chat.id]);
  useEffect(() => {
    searchNavigation.current?.abort(); setSearchNavigating(false);
    return () => searchNavigation.current?.abort();
  }, [chat.id, account?.id, messageSearch]);
  async function navigateSearch(messageId:string){
    searchNavigation.current?.abort();
    const controller = new AbortController(); searchNavigation.current = controller;
    followBottom.current=false;scrollIntent.current=0;setSearchActiveId(messageId);
    olderAnchor.current=null;
    setInlineError('');
    try {
      const existing=scroll.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
      if (!existing && !demoMode && live.store) {
        const id = Number(messageId.replace(/^message-/, ''));
        if (!Number.isSafeInteger(id) || id <= 0) return;
        setSearchNavigating(true);
        if (!await live.store.openMessageContext(chat.id, id, controller.signal)) return;
      }
      requestAnimationFrame(() => {
        if (controller.signal.aborted) return;
        scroll.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`)
          ?.scrollIntoView({behavior:'instant',block:'center'});
      });
    } catch (error) { if (!controller.signal.aborted) setInlineError(error instanceof ApiError && error.status === 404 ? 'Сообщение удалено или больше недоступно.' : friendlyError(error)); }
    finally { if (!controller.signal.aborted) setSearchNavigating(false); }
  }
  function closeSearch(){setMessageSearch(null);setSearchActiveId(null);}
  function openChapterHistory(boundary: ChapterBoundary, trigger: HTMLButtonElement) {
    chapterHistoryTrigger.current = trigger;
    chapterListScroll.current = historyDialog.current?.querySelector('.panel-content')?.scrollTop ?? 0;
    setChapterHistoryId(boundary.id);
  }
  function closeChapterHistory() {
    setChapterHistoryId(null);
    requestAnimationFrame(() => { if (chapterHistoryTrigger.current?.isConnected) chapterHistoryTrigger.current.focus({ preventScroll: true }); });
  }
  async function jumpToChapter(boundary: ChapterBoundary) {
    if (!live.store || !account) return false;
    chapterNavigation.current?.abort();
    const controller = new AbortController();
    chapterNavigation.current = controller;
    followBottom.current = false;
    const loaded = await live.store.loadChapterStart(chat.id, boundary.startedAt, controller.signal);
    if (!loaded || controller.signal.aborted) return false;
    setMessageSearch(null);
    setPanel(null);
    setContactOpen(false);
    setChapterJump({ id: boundary.id, chatId: chat.id, ownerId: account.id });
    return true;
  }
  function renderTimelineMarkers(beforeMessageId: string | null) {
    const markers = (chapterMarkers.get(beforeMessageId) ?? []).map(boundary => ({
      at: Date.parse(boundary.startedAt),
      element: <ChapterDivider key={boundary.id} boundaryId={boundary.id} title={boundary.title} />,
    }));
    const questions = questionNotices.get(beforeMessageId) ?? [];
    const notices = renderQuestionNotices(beforeMessageId);
    for (let index = 0; index < questions.length; index++) markers.push({ at: Date.parse(questions[index].opens_at), element: notices[index] });
    for (const chapter of chapterProposals.get(beforeMessageId) ?? []) markers.push({
      at: Date.parse(chapter.created_at),
      element: <ChapterProposalNotice key={`chapter-proposal-${chapter.id}`} chapter={chapter} own={chapter.author_id === account?.id}
        onDecide={status => live.store?.decideChapter(chat.id, chapter.id, status) ?? Promise.resolve(false)}><Star /></ChapterProposalNotice>,
    });
    return markers.sort((a, b) => a.at - b.at).map(marker => marker.element);
  }
  function renderQuestionNotices(beforeMessageId: string | null) {
    return (questionNotices.get(beforeMessageId) ?? []).map(card => {
      const isAnswering = answeringQuestion?.chatId === chat.id && answeringQuestion.id === card.id;
      return <aside className="future-question-notice" key={`question-notice-${card.id}`} aria-label="Вопрос на будущее">
        <IconButton label="Скрыть вопрос из чата" className="hide-question-notice" onClick={() => {
          setQuestionHidden(card.id, true);
          composer.current?.focus({ preventScroll: true });
        }}><X size={15} /></IconButton>
        <div className="future-question-notice-star" aria-hidden="true"><Star /></div>
        <span>Вопрос открылся</span>
        <p>{card.text}</p>
        {card.my_answer !== null ? card.partner_answer !== null ? <div className="future-question-answers">
          <div className="moment-note"><span className="eyebrow">Твой ответ</span><p>{card.my_answer}</p></div>
          <div className="moment-note"><span className="eyebrow">Ответ собеседника</span><p>{card.partner_answer}</p></div>
        </div> : <div className="future-question-accepted" role="status"><Check size={16} aria-hidden="true" /> Ваш ответ принят</div>
          : isAnswering ? <FutureQuestionAnswerForm
            onCancel={() => {
              setAnsweringQuestion(null);
              requestAnimationFrame(() => document.getElementById(`answer-question-${card.id}`)?.focus({ preventScroll: true }));
            }}
            onAnswer={async text => {
              const saved = await live.store?.answerFutureQuestion(chat.id, card.id, text);
              if (saved) setAnsweringQuestion(previous => previous?.chatId === chat.id && previous.id === card.id ? null : previous);
              return saved ?? false;
            }}
          /> : <button id={`answer-question-${card.id}`} className="primary" type="button" onClick={() => setAnsweringQuestion({ chatId: chat.id, id: card.id })}>Ответить</button>}
      </aside>;
    });
  }
  function jumpToMessage(messageId: string) {
    if (!demoMode && !scroll.current?.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)) {
      void navigateSearch(messageId); return;
    }
    setMessageSearch(null);
    followBottom.current = false;
    scrollIntent.current = 0;
    requestAnimationFrame(() => {
      const element = scroll.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
      if (!element) { setInlineError('Исходного сообщения больше нет в этой переписке'); return; }
      element.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      setHighlightId(messageId);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightId(null), 1600);
    });
  }
  function requestDelete(ids: string[]) { setInlineError(''); setDeleteEveryone(true); setDeleteIds(ids); }
  function openMoment(ids: string[]) {
    setMomentIds(ids);
    setReason('');
    setMomentError('');
  }
  async function submitMoment(event: FormEvent) {
    event.preventDefault();
    if (!momentIds || !reason.trim() || momentRequest.current || !momentSelected.length) return;
    if (demoMode) {
      const next = saveMoment(state, chat.id, momentIds, reason);
      if (next === state) return;
      setState(next);
    } else {
      if (!live.store) return;
      const owner = account?.id, revision = viewRevision.current, key = chat.id;
      const stillHere = () => ownerRef.current === owner && viewRevision.current === revision && activeChatRef.current === key;
      momentRequest.current = true;
      setMomentSaving(true);
      setMomentError('');
      try {
        if (!await live.store.createMoment(key, momentIds, reason.trim()) || !stillHere()) return;
      } catch (error) {
        if (stillHere()) setMomentError(friendlyError(error));
        return;
      } finally {
        momentRequest.current = false;
        setMomentSaving(false);
      }
    }
    setMomentIds(null);
    setSelectedIds([]);
    setPanel('moments');
  }
  async function changePin(message: Message, pinned: boolean) {
    if (demoMode) {
      setState(previous => ({ ...previous, messages: previous.messages.map(item => item.id === message.id ? { ...item, pinned } : item) }));
      return;
    }
    if (!message.serverId || !live.store) return;
    const key = chat.id, revision = viewRevision.current;
    setInlineError('');
    try {
      await live.store.setPin(key, message.serverId, pinned);
    } catch (error) {
      if (activeChatRef.current === key && viewRevision.current === revision) setInlineError(friendlyError(error));
    }
  }
  async function jumpToPin(message: Message) {
    if (!demoMode && live.store && message.serverId) { await navigateSearch(message.id); return; }
    jumpToMessage(message.id);
  }
  async function attachFiles(files: File[]) {
    if (!requireDemo()) return;
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
    if (!requireDemo()) return;
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
    if (!account) return;
    const generation = fileGeneration.current;
    const asset=await storeMedia(image,'photo','avatar.jpg');
    if (generation !== fileGeneration.current) return;
    setAvatar(asset);
    try{localStorage.setItem(`aws.avatar.user.${account.id}`,JSON.stringify(asset));}catch{setStorageError(true);}
    setCropFile(null);
  }
  function openForward(ids: string[]) {
    setInlineError('');
    setForwardIds(ids);
  }
  async function performForward(ids: string[], target: string) {
    if (forwardingRef.current) return;
    if (demoMode) {
      setState(previous => forwardMessages(previous, ids, target, name));
      setForwardIds(null);
      selectChat(target);
      return;
    }
    if (!live.store) return;
    const source = chat.id, owner = account?.id, revision = viewRevision.current;
    const stillInSource = () => ownerRef.current === owner && viewRevision.current === revision && activeChatRef.current === source;
    forwardingRef.current = true;
    setForwarding(true);
    setInlineError('');
    try {
      if (await live.store.forwardMessages(source, target, ids) && stillInSource()) {
        setForwardIds(null);
        selectChat(target);
        followBottom.current = true;
        requestAnimationFrame(() => {
          if (scroll.current && activeChatRef.current === target) scroll.current.scrollTop = scroll.current.scrollHeight;
        });
      }
    } catch (error) {
      if (stillInSource()) setInlineError(friendlyError(error));
    } finally {
      forwardingRef.current = false;
      setForwarding(false);
    }
  }
  async function confirmDelete(){
    if(!deleteIds||deleting)return;
    const ids=[...deleteIds],scope=deleteEveryone?'everyone':'self',deletionId=id();
    if (!demoMode) {
      const owner = account?.id, revision = viewRevision.current, key = chat.id;
      setDeleting(true); setDeleteIds(null); setSelectedIds([]);
      try {
        await live.store?.deleteMessages(key, ids, scope);
      } catch (error) {
        if (ownerRef.current === owner && viewRevision.current === revision && activeChatRef.current === key) setInlineError(friendlyError(error));
      } finally { if (ownerRef.current === owner) setDeleting(false); }
      return;
    }
    const undo=removeMessages(state,ids,scope,deletionId).removed;
    setDeleting(true);setDeleteIds(null);setSelectedIds([]);
    await animateMessageDeletion(ids);
    setState(previous=>removeMessages(previous,ids,scope,deletionId).state);setRemovedUndo(undo);
    if(editing&&ids.includes(editing.messageId))cancelEdit();setDeleting(false);
  }
  useLayoutEffect(()=>{const node=composerArea.current;if(!node)return;const update=()=>{conversation.current?.style.setProperty('--composer-height',`${node.offsetHeight}px`);if(followBottom.current)requestAnimationFrame(()=>{if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;});};update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect();},[stage,mobileChat,chat.id,demoMode]);
  const closeModal = () => setModal(null);

  if (emailRoute) return <EmailConfirmation brand={<Brand />} onVerified={user => { if (account?.id === user.id) void refresh(); }} onDone={() => {
    window.history.replaceState(null, '', '/'); setEmailRoute(false);
    if (account) setStage('chat'); else { setStage('login'); void refresh(); }
  }} />;
  if (passwordRoute) return <PasswordReset brand={<Brand />} onReset={clearUser} onDone={() => {
    window.history.replaceState(null, '', '/'); setPasswordRoute(false);
    setStage(account ? 'chat' : 'login');
  }} />;

  function recordArchiveAction(kind: ArchiveKind, itemId: number, archived: boolean) {
    if (demoMode || !live.store || !chat.serverId) return undefined;
    return <ArchiveAction archived={archived} busy={archive.busy[archiveKey(kind, itemId)]} disabled={!archive.data}
      onChange={transition => live.store!.archives.set(chat.serverId!, kind, itemId, !archived, transition)} />;
  }
  function renderMoment(moment: Moment, archived: boolean, showArchiveAction = true) {
    return <MomentCard key={moment.id} moment={moment} name={name} partner={chat.name} ownId={account?.id ?? 0} demo={demoMode}
      archiveAction={showArchiveAction && moment.serverId ? recordArchiveAction('moment', moment.serverId, archived) : undefined}
      onReply={response => {
        if (demoMode) setState(previous => ({ ...previous, moments: previous.moments.map(item => item.id === moment.id ? { ...item, response } : item) }));
        else if (moment.serverId) return live.store?.replyToMoment(chat.id, moment.serverId, response);
      }} />;
  }
  return <>
    {stage !== 'chat' || !account ? <CenteredAuth active={stage === 'login'} register={register}>
      <button className="brand-trigger" disabled={checking || authBusy} aria-label={stage === 'intro' ? 'Are we strangers? Открыть вход' : 'Are we strangers? Свернуть вход'} onClick={() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); setStage(stage === 'intro' ? 'login' : 'intro'); }}><Brand /></button>
      <AuthForm active={stage === 'login'} checking={checking} onAuthenticated={acceptUser} onRegisterMode={setRegister} onBusy={setAuthBusy} onRecovery={() => setModal('recovery')} />
      {(checking || sessionError) && <div className="auth-session-status" role="status">{checking ? 'Проверяем вход…' : <>{sessionError}<button className="text-button" onClick={() => { void refresh(); }}>Проверить вход ещё раз</button></>}</div>}
    </CenteredAuth> : <main className={`messenger ${mobileChat ? 'show-conversation' : ''}`} style={wide ? { '--desktop-chat-list-width': `${sidebarWidth}px` } as CSSProperties : undefined}>
      <aside id="chat-sidebar" className={`sidebar${compactSidebar ? ' sidebar-avatar-only' : ''}`}>
        <header className="sidebar-header"><button className="plain brand-home" onClick={() => { setContactOpen(false);setContactVisible(false);setPanel(null);setMobileChat(false); }} aria-label="К списку чатов"><Brand compact pulse={pulse} /></button><IconButton label="Новый разговор" className="compose-new" onClick={() => setModal('new-chat')}><SquarePen /></IconButton></header>
        {showChatSearch && <div className="search-wrap glass"><Search size={21} /><input aria-label="Поиск чатов" value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск" />{search && <IconButton label="Очистить поиск" onClick={() => setSearch('')}><X size={17} /></IconButton>}</div>}
        <div className="messenger-mode" role="status">{demoMode ? 'Демо · только в этом браузере' : live.connection === 'online' ? 'Соединение установлено' : live.connection === 'connecting' ? 'Подключаемся…' : 'Восстанавливаем соединение…'}</div>
        {import.meta.env.DEV && <DevAccountSwitch user={account} onSwitch={user => { live.store?.stop(); acceptUser(user); }} />}
        {!demoMode && live.error && <p className="messenger-error" role="alert">{live.error}<button onClick={() => live.store?.reconnect()}>Повторить</button></p>}
        <ChatArchiveList enabled={!demoMode} wide={wide} resetKey={`${account.id}:${mobileChat}:${demoMode}`} open={chatArchiveOpen}
          onOpen={() => { setChatArchiveOpen(true); setSearch(''); }} onClose={() => { setChatArchiveOpen(false); setSearch(''); }}
          names={archive.data ? archivedChats.map(item => item.name).join(', ') : 'Загружаем…'} unread={archivedChats.reduce((total, item) => total + item.unread, 0)}
          error={archive.error} onReload={() => void live.store?.archives.load()}>

          {search.trim() && <h2 className="search-section-heading">Мои чаты</h2>}
          {visibleChats.map(item => {
            const last = state.messages.filter(message => message.chatId === item.id && !message.kind).at(-1);
            return <ArchiveChatRow key={item.id} name={item.name} archived={archivedChatIds.has(item.serverId!)} enabled={!demoMode && !!archive.data} busy={!!archive.busy[archiveKey('chat', item.serverId!)]}
              onChange={() => live.store!.archives.set(item.serverId!, 'chat', item.serverId!, !archivedChatIds.has(item.serverId!))}><button className={`chat-card ${item.id === chat.id ? 'selected' : ''}`} key={item.id} onClick={() => selectChat(item.id)} aria-current={item.id === chat.id ? 'true' : undefined} title={compactSidebar ? item.name : undefined} aria-label={compactSidebar ? `${item.name}${item.unread ? `, непрочитанных: ${item.unread}` : ''}` : undefined}><Avatar initial={item.initial} asset={item.avatar} /><span className="chat-text"><span className="chat-title">{item.name}</span><span className="chat-preview">{last?.own ? 'Вы: ' : ''}{last ? messageSummary(last) : item.username || 'Начать разговор'}</span></span><span className="chat-meta"><time>{last?.time}</time>{item.unread > 0 && <span className="unread">{item.unread}</span>}</span></button></ArchiveChatRow>;
          })}
          {search.trim() && !visibleChats.length && <p className="search-section-empty">{globalSearch && results.loading ? 'Проверяем совпадения…' : 'В твоих чатах совпадений нет'}</p>}
          {globalSearch && <section className="global-user-search" aria-label="Глобальный поиск"><h2 className="search-section-heading">Глобальный поиск</h2><UserResults users={globalUsers} loading={results.loading} error={results.error || openError} opening={openingUser} onOpen={user => { void openUser(user); }} empty={search.trim() === '@' ? 'Введи юзернейм после @' : visibleChats.length ? 'Других пользователей не найдено' : 'Пользователи не найдены'} /></section>}
          {chatArchiveOpen && !archive.data && !archive.error && <p className="muted" role="status">Загружаем архив…</p>}
          {chatArchiveOpen && !visibleChats.length && !search.trim() && archive.data && <ArchiveEmpty />}
          {!visibleChats.length && !search.trim() && !chatArchiveOpen && <p className="empty-search">{!demoMode && (live.loading || (!archive.data && !archive.error)) ? 'Загружаем чаты…' : 'Пока нет разговоров. Найди человека по @юзернейму или номеру.'}</p>}
        </ChatArchiveList>
        <nav className="bottom-nav" aria-label="Основная навигация"><IconButton label="Профиль" className="nav-profile" onClick={() => setModal('profile')}>{avatar?<Avatar asset={avatar} initial={name[0]} className="nav-avatar"/>:<UserRound />}</IconButton><IconButton label="Звонки" className="nav-calls" onClick={() => setModal('calls')}><Phone /></IconButton><IconButton label="Чаты" className="nav-chats active" onClick={() => { setContactOpen(false);setContactVisible(false);setModal(null); setMobileChat(false); }}><MessageCircle /></IconButton><IconButton label="Настройки" className="nav-settings" onClick={() => setModal('settings')}><Settings /></IconButton></nav>
      </aside>
      {wide && !panel && <ChatListDivider width={sidebarWidth} maximum={maximumChatListWidth} onResize={resizeChatList} />}
      {!chat.id ? <section className="conversation live-empty"><Brand /><p>{live.loading ? 'Загружаем твои разговоры…' : 'С кем начнётся твоя история?'}</p><button className="secondary glass" onClick={() => setModal('new-chat')}>Начать разговор</button></section> : <section ref={conversation} className={`conversation ${selectedIds.length?'is-selecting':''} ${contactOpen?'contact-is-open':''}`} aria-label={`Переписка: ${chat.name}`}>
        <div className="chat-surface" inert={contactVisible}><header className="conversation-header"><IconButton label="Назад к чатам" className="mobile-back back-button" onClick={() => { setMobileChat(false); setPanel(null); }}><ArrowLeft /></IconButton><button ref={contactButton} className="contact-button plain glass" disabled={recordingActive} onClick={openContact} aria-label={`Открыть профиль: ${chat.name}`}><span className="avatar">{chat.initial}</span><span><strong>{chat.name}</strong><span className="status">{chat.serverId ? chat.username : chat.online ? <><i />В сети</> : 'был(а) недавно'}</span></span></button><div className="header-actions glass"><IconButton label="Позвонить" onClick={() => setModal('calls')}><Phone /></IconButton><IconButton label="Поиск в переписке" onClick={() => setMessageSearch(value => value === null ? '' : null)}><Search /></IconButton><div className="menu-wrap"><IconButton label="Меню разговора" onClick={() => setMenuOpen(value => !value)}><MoreHorizontal /></IconButton>{menuOpen && <><button className="menu-scrim" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} /><div className="dropdown glass"><button onClick={()=>{setMessageSearch('');setMenuOpen(false);}}><Search/>Поиск в переписке</button><button onClick={() => { setPanel('moments'); setMenuOpen(false); }}><Bookmark />Сохранённые моменты</button><button onClick={() => { setPanel('questions'); setMenuOpen(false); }}><Clock3 />Вопрос на будущее</button><button onClick={() => { setPanel('chapters'); setMenuOpen(false); }}><ArrowUpRight />Главы</button>{!demoMode && <><button onClick={() => { setPanel('archive'); setMenuOpen(false); }}><Archive />Архив истории</button>{recordArchiveAction('chat', chat.serverId!, archivedChatIds.has(chat.serverId!))}</>}</div></>}</div></div>{selectedIds.length>0&&<IconButton label="Завершить выбор сообщений" className="selection-done" onClick={()=>setSelectedIds([])}><Check/></IconButton>}</header>
        {messageSearch !== null && <><ConversationSearch key={`${account.id}:${chat.id}`} query={messageSearch} onQuery={setMessageSearch} messages={messages} chat={chat} ownName={name} ownAvatar={avatar} onNavigate={id=>{void navigateSearch(id);}} onClose={closeSearch} store={demoMode?null:live.store} ownId={account.id} onExpired={clearUser}/>{!demoMode && <span className="search-scope-label" role={searchNavigating?'status':undefined}>{searchNavigating?'Загружаем участок переписки…':'Поиск по всей переписке'}</span>}</>}

        {pinned.length > 0 && <div className="pinned-bar glass">
          <button type="button" className="pinned-preview" onClick={() => { void jumpToPin(pinned[0]); }}>
            <span>
              <strong>Закреплённое сообщение{pinned.length > 1 ? ` · ${pinned.length}` : ''}</strong>
              <span>{messageSummary(pinned[0])}</span>
            </span>
          </button>
          {pinned.length > 1 && <IconButton label="Все закреплённые сообщения" onClick={() => setModal('pinned')}><MoreHorizontal /></IconButton>}
          <IconButton label="Открепить последнее сообщение" disabled={!demoMode && live.pinBusy[chat.id]} onClick={() => { void changePin(pinned[0], false); }}><X size={16} /></IconButton>
        </div>}
        <div className={`messages-scroll ${!demoMode && !readEntry.ready ? 'preparing-entry' : ''}`} ref={scroll}><div className="messages-inner">
          {!demoMode && <div ref={historyTop} className="history-load-boundary">
            {history?.loading && messages.length > 0 && <span role="status">Загружаем сообщения…</span>}
            {history?.error && <button className="load-history glass" disabled={history.loading} onClick={() => { void loadOlder(); }}>Повторить загрузку истории</button>}
          </div>}
          {!demoMode && history?.error && <p className="history-error" role="alert">{history.error}</p>}
          {showFirstChapter && <ChapterDivider title="Первое знакомство" />}
          {demoMode && <div className="date-separator"><span>Сегодня</span></div>}
          {messages.length === 0 && renderTimelineMarkers(null)}
          {messages.length === 0 && <div className="conversation-empty">{!showFirstChapter && chapterMarkers.size === 0 && <Star ambient />}<p>{!demoMode && (history?.loading || live.loading) ? 'Загружаем переписку…' : messageSearch ? 'Сообщения не найдены' : 'С чего начнём разговор?'}</p></div>}
          {messages.flatMap((message, index) => {
            const original = message.replyToId ? messagesById.get(message.replyToId) : undefined;
            return [...renderTimelineMarkers(message.id), <Fragment key={message.id}>
            {message.createdAt && (!messages[index - 1]?.createdAt || new Date(messages[index - 1].createdAt!).toDateString() !== new Date(message.createdAt).toDateString()) && <div className="date-separator"><span>{dayLabel(message.createdAt)}</span></div>}
            {!demoMode && readEntry.boundary === message.id && <div className="unread-divider" data-unread-boundary><span>Новые сообщения</span></div>}
            {message.kind === 'chapter' ? <ChapterDivider title={message.text} /> : <MessageBubble message={message} pinned={pinnedIds.has(message.id)} quote={original ? quoteFor(original) : undefined} selected={selectedIds.includes(message.id)} selecting={selectedIds.length > 0} active={messageMenu?.message.id === message.id || highlightId === message.id} searchQuery={messageSearch||''} searchActive={searchActiveId===message.id} onMenu={setMessageMenu} onSelect={toggleSelected} onJump={jumpToMessage} />}
            </Fragment>];
          }).concat(messages.length ? renderTimelineMarkers(null) : [])}
          {!demoMode && history?.range && <div ref={historyBottom} className="history-load-boundary history-load-newer">
            {history.loadingNewer && <span role="status">Загружаем следующие сообщения…</span>}
            {history.newerError && <div role="alert"><p>{history.newerError}</p><button className="load-history glass" onClick={()=>{void live.store?.loadNewer(chat.id);}}>Повторить загрузку следующих сообщений</button></div>}
          </div>}
        </div></div>
        <ScrollToBottom key={`${account.id}:${chat.id}:${demoMode}`} scroll={scroll} enabled={(wide || mobileChat) && (demoMode || readEntry.ready) && !recordingActive} forceVisible={!!history?.range && !!history.hasNewer} onActivate={() => {
          followBottom.current = true;
          scrollIntent.current = 0;
          if (history?.range) void live.store?.returnToLatest(chat.id).catch(error=>setInlineError(friendlyError(error)));
        }} />
        <div ref={composerArea} className={`composer-area ${recordingActive?'is-recording':''}`}>
          {selectedIds.length>0?<div className="selection-dock" aria-label="Действия с выбранными сообщениями"><IconButton label="Удалить выбранные сообщения" disabled={deleting} className="glass round" onClick={()=>requestDelete([...selectedIds])}><Trash2/></IconButton><span className="selection-count">Выбрано: {selectedIds.length}{!demoMode && selectedIds.length === 100 ? ' · максимум 100' : ''}</span><div className="selection-dock-actions"><IconButton label="Копировать выбранные сообщения" onClick={()=>void copyMessages(selectedIds)}><Copy/></IconButton><IconButton label="Сохранить выбранные сообщения в момент" onClick={()=>openMoment([...selectedIds])}><Bookmark/></IconButton><IconButton label="Переслать выбранные сообщения" disabled={forwarding} className="glass round" onClick={()=>openForward([...selectedIds])}><Forward/></IconButton></div></div>:<>

          {(replyPreview || editing) && <div className={editing ? 'composer-context' : 'composer-context composer-context-reply'}>{editing ? <SquarePen size={19} /> : <Reply size={19} />}<span><strong>{editing ? 'Редактирование сообщения' : replyPreview!.author}</strong><span>{editing ? state.messages.find(item => item.id === editing.messageId)?.text : replyPreview!.text}</span></span><IconButton label={editing ? 'Отменить редактирование' : 'Отменить ответ'} onClick={() => { cancelEdit(); setReplyTo(null); }}><X size={18} /></IconButton></div>}
          {currentAttachment && <div className="pending-media">{currentAttachment.items.map(asset => <div className="pending-item" key={asset.id}><Paperclip size={14} /><span>{asset.name}</span><IconButton label={`Убрать файл: ${asset.name}`} onClick={() => setAttachment(previous => previous ? { ...previous, items: previous.items.filter(item => item.id !== asset.id) } : null)}><X size={14} /></IconButton></div>)}</div>}
          {preparingFiles && <p className="preparing-files" role="status">Подготавливаем файлы…</p>}
          <form className="composer" onSubmit={sendMessage}>
            <input type="file" ref={fileInput} hidden multiple onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void attachFiles(files); }} />
            <IconButton label="Прикрепить фото или файл" className="glass round attach-button" disabled={!demoMode || preparingFiles || !!editing || recordingActive} onClick={() => fileInput.current?.click()}><Paperclip /></IconButton>
            <div ref={recordSlot} className="composer-input glass"><textarea disabled={recordingActive} ref={composer} rows={1} aria-label="Написать сообщение" placeholder="Сообщение..." value={draft} maxLength={demoMode ? 5000 : 4096} onChange={event => { draftVersions.current[chat.id] = (draftVersions.current[chat.id] || 0) + 1; setDrafts(previous => ({ ...previous, [chat.id]: event.target.value })); }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(); } }} />
              <div className="emoji-wrap"><IconButton disabled={recordingActive} label="Добавить эмодзи" onClick={() => setEmojiOpen(value => !value)}><Smile /></IconButton>{emojiOpen && <div className="emoji-picker glass">{['🤍', '🖤', '❤️', '🙂', '✨', '🎧', '🫂', '🌙'].map(emoji => <button key={emoji} type="button" onClick={() => { setDrafts(previous => ({ ...previous, [chat.id]: draft + emoji })); setEmojiOpen(false); composer.current?.focus(); }}>{emoji}</button>)}</div>}</div>
            </div>
            {draft.trim() || currentAttachment?.items.length || editing ? <IconButton label={editing ? 'Сохранить изменения' : 'Отправить сообщение'} className="glass red-glass round send-button" type="submit" disabled={preparingFiles || sending}>{editing ? <Check /> : <Send />}</IconButton> : <RecordingControl key={chat.id} slot={recordSlot} scene={conversation} disabled={!demoMode || preparingFiles} onActive={setRecordingActive} onComplete={sendRecording}/>}
          </form>
          {!demoMode && <p className="live-composer-note" role="status">{sending ? 'Отправляем…' : 'Фото и записи подключим следующим этапом'}</p>}
          </>}
          {inlineError && !forwardIds && <p className="composer-feedback" role="alert">{inlineError}<button aria-label="Закрыть сообщение об ошибке" onClick={()=>setInlineError('')}><X size={14}/></button></p>}
        </div></div>
        {contactVisible&&<ContactProfile key={chat.id} open={contactOpen} chat={chat} state={state} serverChapterCount={demoMode ? undefined : chapterCards.length + Number(chapterStarts.some(chapter => chapter.id.startsWith('initial-')))} notifications={demoMode||!chat.serverId?undefined:{muted:notifications.chatIds===null?undefined:notifications.chatIds.includes(chat.serverId),busy:!!notifications.busy[chat.serverId],error:notifications.errors[chat.serverId]||notifications.error,onChange:muted=>live.store!.notifications.set(chat.serverId!,muted),onRetry:()=>{void live.store?.notifications.retry();}}} onClose={()=>setContactOpen(false)} onStory={setPanel} onCall={()=>setModal('calls')} onSearch={()=>{setContactOpen(false);setMessageSearch('');setTimeout(()=>conversation.current?.querySelector<HTMLInputElement>('.conversation-search input')?.focus(),500);}}/>}
      </section>}
      {panel && <dialog ref={historyDialog} className={`history-panel ${panel === 'archive' ? 'history-archive-panel' : ''} ${contactOpen?'profile-history':''} ${historyClosing?'history-closing':''}`} aria-label={historyChapter ? 'История главы' : 'История знакомства'} onCancel={event => {event.preventDefault();if (historyChapter) closeChapterHistory(); else closeHistory();}} onClick={event => { if (event.target === historyDialog.current) closeHistory(); }}>
        <header><div><span className="eyebrow">ВЫ И {chat.name.toLocaleUpperCase('ru')}</span><h2>{historyChapter ? 'История главы' : panel === 'archive' ? 'Архив' : 'История знакомства'}</h2></div>
          <IconButton className={historyChapter || contactOpen ? 'back-button' : ''} label={historyChapter ? 'Назад к главам' : contactOpen ? 'Назад к профилю' : 'Закрыть историю'} onClick={historyChapter ? closeChapterHistory : closeHistory}>{historyChapter || contactOpen ? <ArrowLeft/> : <X/>}</IconButton>
        </header>
        {panel !== 'archive' && !historyChapter && <div className="panel-tabs" role="tablist" aria-label="История знакомства">{([['moments', 'Моменты'], ['questions', 'Будущее'], ['chapters', 'Главы']] as const).map(([tab, label]) => <button key={tab} role="tab" aria-selected={panel === tab} onClick={() => setPanel(tab)}>{label}</button>)}</div>}<div className="panel-content">
        {demoMode && <p className="panel-demo">Демонстрация механик. Ответы собеседника моделируются вручную.</p>}
        <fieldset className="feature-fields">
        {panel === 'moments' && <>
          <div className="moments-heading">
            <h3>Не забывайте важные моменты</h3>
            <div className="history-toolbar">
            <DateSortButton order={momentOrder} onChange={setMomentOrder} />
            <button type="button" className="icon-button glass" aria-label={momentQuery === null ? 'Открыть поиск по моментам' : 'Закрыть поиск по моментам'} aria-expanded={momentQuery !== null} onClick={() => setMomentQuery(value => value === null ? '' : null)}>
              {momentQuery === null ? <Search size={17} /> : <X size={17} />}
            </button>
            </div>
          </div>
          {momentQuery !== null && <input className="simple-input moments-search" type="search" aria-label="Поиск по моментам" placeholder="Поиск по моментам" value={momentQuery} onChange={event => setMomentQuery(event.target.value)} autoFocus />}
          {!demoMode && momentsStatus?.error && <p className="history-error" role="alert">{momentsStatus.error} <button className="text-button" onClick={() => void live.store?.loadMoments(chat.id)}>Повторить</button></p>}
          {!moments.length && !demoMode && (!momentsStatus || momentsStatus.loading) && <p className="muted" role="status">Загружаем моменты…</p>}
          {!moments.length && (demoMode || (momentsStatus && !momentsStatus.loading && !momentsStatus.error)) && <div className="empty-state"><Bookmark /><p>Пока ни одного момента</p><span>Открой меню сообщения правой кнопкой мыши или удержанием на телефоне и выбери «Добавить момент».</span></div>}
          {moments.length > 0 && visibleMoments.length === 0 && <p className="muted" role="status">Совпадений нет</p>}
          {visibleMoments.map(moment => renderMoment(moment, false))}
        </>}
        {panel === 'questions' && !demoMode && live.store && <FutureQuestionsPanel
          key={chat.id}
          cards={futureQuestionCards.filter(card => !archivedQuestionIds.has(card.id))}
          now={questionClock}
          loading={futureQuestions?.loading ?? true}
          error={futureQuestions?.error}
          onReload={() => void live.store?.loadFutureQuestions(chat.id)}
          onCreate={(text, opensAt) => live.store?.createFutureQuestion(chat.id, text, opensAt) ?? Promise.resolve(false)}
          onAnswer={(questionId, text) => live.store?.answerFutureQuestion(chat.id, questionId, text) ?? Promise.resolve(false)}
          hiddenIds={hiddenQuestions}
          onShowInChat={id => setQuestionHidden(id, false)}
          renderArchiveAction={card => recordArchiveAction('question', card.id, false)}
        />}
        {panel === 'questions' && demoMode && <FutureQuestionsLayout
          key={chat.id}
          cards={demoQuestions}
          now={questionClock}
          getOpening={item => `${item.date}T00:00:00`}
          getCreated={item => item.createdAt}
          hasAnswer={item => !!item.answer}
          onCreate={(text, opening) => {
            setState(previous => ({ ...previous, questions: [...previous.questions, {
              id: id(), chatId: chat.id, text, date: dateValue(opening), answer: '', createdAt: new Date().toISOString(),
            }] }));
            return true;
          }}
          renderAnswer={item => <>
            <AnswerForm label="Твой ответ" value={item.answer} onSave={answer => setState(previous => ({
              ...previous, questions: previous.questions.map(question => question.id === item.id ? { ...question, answer } : question),
            }))} />
            <AnswerForm label={`Ответ: ${chat.name} · демо`} value={item.otherAnswer || ''} onSave={otherAnswer => setState(previous => ({
              ...previous, questions: previous.questions.map(question => question.id === item.id ? { ...question, otherAnswer } : question),
            }))} />
          </>}
        />}
        {panel === 'archive' && !demoMode && <HistoryArchive
          key={chat.id}
          moments={allMoments.filter(moment => archivedMomentIds.has(moment.serverId!))}
          questions={futureQuestionCards.filter(card => archivedQuestionIds.has(card.id))}
          now={questionClock}
          loading={!archive.data || !momentsStatus || !futureQuestions || (momentsStatus.loading && !allMoments.length) || (futureQuestions.loading && !futureQuestionCards.length)}
          error={[archive.error, momentsStatus?.error, futureQuestions?.error].filter(Boolean).join(' ')}
          onReload={() => { void live.store?.archives.load(); void live.store?.loadMoments(chat.id); void live.store?.loadFutureQuestions(chat.id); }}
          renderMoment={moment => renderMoment(moment, true)}
          renderAction={card => recordArchiveAction('question', card.id, true)}
          onAnswer={(id, text) => live.store?.answerFutureQuestion(chat.id, id, text) ?? Promise.resolve(false)}
        />}
        {panel === 'chapters' && !demoMode && live.store && <><div hidden={!!historyChapter}><ChaptersPanel
          key={chat.id}
          cards={chapterCards}
          boundaries={chapterStarts}
          ownId={account.id}
          loading={chaptersStatus?.loading ?? true}
          error={chaptersStatus?.error}
          onReload={() => void live.store?.loadChapters(chat.id)}
          onCreate={title => live.store?.createChapter(chat.id, title) ?? Promise.resolve(false)}
          onDecide={(id, status) => live.store?.decideChapter(chat.id, id, status) ?? Promise.resolve(false)}
          onJump={jumpToChapter}
          onHistory={openChapterHistory}
        /></div>
          {historyChapter && <ChapterHistory
            key={`${chat.id}:${historyChapter.id}`}
            chapter={historyChapter} boundaries={chapterStarts} moments={allMoments} questions={futureQuestionCards} now={questionClock}
            momentsLoading={momentsStatus?.loading ?? true} questionsLoading={futureQuestions?.loading ?? true}
            momentsError={momentsStatus?.error} questionsError={futureQuestions?.error}
            archivedMomentIds={archivedMomentIds} archivedQuestionIds={archivedQuestionIds}
            onReloadMoments={() => void live.store?.loadMoments(chat.id)} onReloadQuestions={() => void live.store?.loadFutureQuestions(chat.id)}
            renderMoment={moment => renderMoment(moment, archivedMomentIds.has(moment.serverId!), false)}
            onAnswer={(id, text) => live.store?.answerFutureQuestion(chat.id, id, text) ?? Promise.resolve(false)}
          />}
        </>}
        {panel === 'chapters' && demoMode && <><h3>Давай начнём заново</h3><p className="muted">Новая глава начинается, когда вы оба согласны. Всё, что было до неё, остаётся.</p><form className="stack-form" onSubmit={event => { event.preventDefault(); if (!chapterTitle.trim()) return; setState(previous => ({ ...previous, chapters: [...previous.chapters, { id: id(), chatId: chat.id, title: chapterTitle.trim(), status: 'pending' }] })); setChapterTitle(''); }}><label>Название главы<input value={chapterTitle} onChange={event => setChapterTitle(event.target.value)} placeholder="Чуть ближе" maxLength={70} required /></label><button className="primary">Предложить новую главу</button></form>{state.chapters.filter(item => item.chatId === chat.id).map(item => <article className="history-card" key={item.id}><span className="eyebrow">{item.status === 'pending' ? 'ЖДЁМ СОГЛАСИЯ' : 'НОВАЯ ГЛАВА'}</span><h3>{item.title}</h3>{item.status === 'pending' ? <button className="secondary" onClick={() => { setState(previous => acceptChapter(previous, item.id));  }}>Смоделировать согласие {chat.name}</button> : <p className="muted">Вы решили продолжить с новой страницы.</p>}</article>)}</>}
      </fieldset></div>{wide && <ChatListDivider width={sidebarWidth} maximum={maximumChatListWidth} onResize={resizeChatList} inHistory />}</dialog>}
    </main>}
    {messageMenu && <MessageContextMenu live={!demoMode} forwardBusy={forwarding} forwardTargets={state.chats} onForwardTo={target=>void performForward(selectedIds.includes(messageMenu.message.id)?selectedIds:[messageMenu.message.id],target)} target={messageMenu} pinned={pinnedIds.has(messageMenu.message.id)} pinBusy={!demoMode && live.pinBusy[chat.id]} onClose={() => setMessageMenu(null)} onReply={() => beginReply(messageMenu.message)} onCopy={() => { void copyMessages([messageMenu.message.id]); }} onEdit={() => beginEdit(messageMenu.message)} onPin={() => { void changePin(messageMenu.message, !pinnedIds.has(messageMenu.message.id)); }} onForward={() => openForward(selectedIds.includes(messageMenu.message.id) ? [...selectedIds] : [messageMenu.message.id])} onSelect={() => setSelectedIds([messageMenu.message.id])} onMoment={() => openMoment(selectedIds.includes(messageMenu.message.id)?selectedIds:[messageMenu.message.id])} onDelete={() => requestDelete([messageMenu.message.id])} />}
    {forwardIds&&<ForwardDialog chats={state.chats} count={forwardIds.length} busy={forwarding} error={inlineError} onClose={()=>{setForwardIds(null);setInlineError('');}} onForward={target=>void performForward(forwardIds,target)}/>}
    {deleteIds && <Modal className="delete-dialog" title={deleteIds.length > 1 ? `Удалить выбранные сообщения (${deleteIds.length})?` : 'Удалить выбранное сообщение?'} onClose={() => { if (!deleting) setDeleteIds(null); }}>{!demoMode && inlineError && <p className="history-error" role="alert">{inlineError}</p>}<label className="delete-scope"><input type="checkbox" disabled={deleting} checked={deleteEveryone} onChange={event => setDeleteEveryone(event.target.checked)} /><span>Удалить у меня и у «{chat.name}»</span></label><div className="modal-actions"><button className="secondary glass" disabled={deleting} onClick={() => setDeleteIds(null)}>Отмена</button><button className="primary" disabled={deleting} onClick={()=>{void confirmDelete();}}>{deleting ? 'Удаляем…' : 'Удалить'}</button></div></Modal>}

    {modal === 'pinned' && <Modal title="Закреплённые сообщения" onClose={closeModal}>{pinned.length === 0 && <p className="muted">Закреплённых сообщений пока нет.</p>}{pinned.map(item => <div className="pinned-entry" key={item.id}><button className="pinned-choice" onClick={() => { closeModal(); void jumpToPin(item); }}><Pin size={16} /><span>{messageSummary(item)}</span><time>{item.time}</time></button><IconButton label={`Открепить: ${messageSummary(item)}`} disabled={!demoMode && live.pinBusy[chat.id]} onClick={() => { void changePin(item, false); }}><PinOff size={18} /></IconButton></div>)}</Modal>}
    {momentIds && <Modal className="moment-dialog" title="Сохранить момент" locked={momentSaving} onClose={() => setMomentIds(null)}>
      <p className="muted">Выбрано сообщений: {momentSelected.length}</p>
      <div className="moment-picked">{momentSelected.map(message => <article className="moment-entry" key={message.id}>
        <span className="eyebrow">{message.forwardedFrom || (message.own ? 'Вы' : chat.name)} · {message.time}</span>
        {message.text && <p>{message.text}</p>}
        {message.media?.map(asset => <MediaView key={asset.id} asset={asset} />)}
      </article>)}</div>
      <form className="stack-form" onSubmit={submitMoment}>
        <label>Почему я это сохранил<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="В этот момент мы стали немного ближе" required maxLength={1000} disabled={momentSaving} /></label>
        {momentError && <p className="inline-error" role="alert">{momentError}</p>}
        <p id="moment-save-warning" className="moment-save-warning">Сохраняйте моменты вдумчиво. Их нельзя удалить или изменить.</p>
        <button className="primary" aria-describedby="moment-save-warning" disabled={momentSaving || !momentSelected.length || !reason.trim()}>{momentSaving ? 'Сохраняем…' : 'Сохранить момент'}</button>
      </form>
    </Modal>}
    {modal === 'settings' && account && <Modal title="Настройки" onClose={closeModal}>
      <AccountSettings key={account.id} user={account} onUpdate={acceptUser} onExpired={clearUser} />
      <button className="setting-row" disabled={loggingOut} onClick={() => { void signOut(); }}><LogOut /><span>{loggingOut ? 'Выходим…' : 'Выйти из аккаунта'}</span><ChevronRight /></button>
      {accountError && <p className="auth-error" role="alert">{accountError}</p>}
      {removedUndo && <button className="setting-row" onClick={() => { setState(previous => restoreMessages(previous, removedUndo)); setRemovedUndo(null); }}><Reply /><span>Восстановить последние удалённые сообщения</span></button>}
    </Modal>}
    {modal === 'profile' && account && <Modal title="Профиль" className="profile-dialog" onClose={closeModal}>
      <Avatar asset={avatar} initial={name.slice(0,1).toLocaleUpperCase('ru')} className="profile-avatar" />
      <input type="file" ref={avatarInput} hidden accept="image/*" onChange={event => { const file=event.target.files?.[0];event.target.value='';if(file)setCropFile(file); }} />
      <div className="avatar-actions"><button className="secondary" onClick={() => avatarInput.current?.click()}>{avatar ? 'Изменить аватар' : 'Добавить аватар'}</button>{avatar && <button className="text-button" onClick={() => { setAvatar(undefined);try{localStorage.removeItem(`aws.avatar.user.${account.id}`);}catch{/* in memory */} }}>Убрать</button>}</div>
      <div className="profile-account-data"><small>Аватар пока сохраняется только в этом браузере.</small></div>
      <ProfileEditor key={account.id} user={account} onUpdate={acceptUser} onExpired={clearUser} />
    </Modal>}
    {modal === 'calls' && <Modal title="Звонки" onClose={closeModal}><div className="empty-state"><Phone /><p>Здесь будет голос</p><span>В этом прототипе проверяем вход и переписку. Звонки ещё не подключены.</span></div><button className="secondary full" onClick={closeModal}>Вернуться к разговору</button></Modal>}
    {modal === 'new-chat' && <Modal title="Начать разговор" onClose={closeModal}>{demoMode ? <><p className="muted">В демо доступны три собеседника.</p>{state.chats.map(item => <button className="contact-choice" key={item.id} onClick={() => { selectChat(item.id); closeModal(); }}><span className="avatar">{item.initial}</span>{item.name}<ChevronRight /></button>)}</> : <><label className="new-user-search"><Search size={18}/><input autoComplete="off" aria-label="Найти человека" placeholder="@юзернейм или +7…" value={newSearch} onChange={event => setNewSearch(event.target.value)} /></label><UserResults users={newResults.users} loading={newResults.loading} error={newResults.error || openError} opening={openingUser} onOpen={user => { void openUser(user); }} empty={newSearch.trim() ? undefined : 'Введи @юзернейм с учётом регистра или полный номер телефона'} /></>}</Modal>}
    {modal === 'recovery' && <Modal title="Восстановление пароля" onClose={closeModal}><PasswordRecoveryForm /></Modal>}
    {cropFile&&<AvatarCropDialog file={cropFile} onClose={()=>setCropFile(null)} onSave={saveAvatar}/>}
    {storageError && <div className="storage-warning" role="status">Браузер не сохраняет данные. Изменения доступны до перезагрузки.</div>}
  </>;
}

function UserResults({ users, loading, error, opening, onOpen, empty }: { users: PublicUser[]; loading: boolean; error: string; opening: number | null; onOpen: (user: PublicUser) => void; empty?: string }) {
  return <div className="user-results" aria-label="Поиск пользователей" aria-busy={loading}>
    {loading ? <p role="status">Ищем…</p> : error ? <p role="alert">{error}</p> : !users.length ? <p>{empty || 'Никого не нашли. Используй @юзернейм или полный номер телефона.'}</p> : users.map(user => <button className="contact-choice" disabled={opening !== null} key={user.id} onClick={() => onOpen(user)}><span className="avatar">{Array.from(user.name)[0]}</span><span><strong>{user.name}</strong><small>{opening === user.id ? 'Открываем разговор…' : user.username}</small></span><ChevronRight /></button>)}
  </div>;
}

function AnswerForm({ label, value, onSave }: { label: string; value: string; onSave: (value: string) => void }) {
  return value ? <div className="answer"><span className="eyebrow">{label}</span><p>{value}</p></div> : <form className="answer-form" onSubmit={event => { event.preventDefault(); const answer = String(new FormData(event.currentTarget).get('answer') || '').trim(); if (answer) onSave(answer); }}><label>{label}<textarea name="answer" required maxLength={1000} placeholder="Что бы ты ответил сейчас?" /></label><button className="text-button small-action">Сохранить ответ</button></form>;
}
