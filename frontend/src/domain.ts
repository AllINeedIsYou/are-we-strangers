export type ReplySnapshot = { id: string; text: string; author: string };
export type MediaKind = 'photo' | 'voice' | 'circle' | 'video' | 'file';
export type MediaAsset = { id: string; name: string; mime: string; size: number; kind: MediaKind; duration?: number };
export type Message = { id: string; chatId: string; text: string; own: boolean; time: string; attachment?: string; media?: MediaAsset[]; kind?: 'chapter'; replyTo?: ReplySnapshot; forwardedFrom?: string; edited?: boolean; pinned?: boolean };
export type Chat = { id: string; name: string; initial: string; online: boolean; unread: number; avatar?: MediaAsset; username?: string; phone?: string; birthday?: string; bio?: string };
export type Moment = { id: string; chatId: string; message: string; messages?: Message[]; reason: string; response?: string };
export type FutureQuestion = { id: string; chatId: string; text: string; date: string; answer: string; otherAnswer?: string };
export type Chapter = { id: string; chatId: string; title: string; status: 'pending' | 'accepted' };
export type DeleteScope = 'self' | 'everyone';
export type Deletion = { id: string; messageIds: string[]; scope: DeleteScope; at: string };
export type DemoState = { messages: Message[]; chats: Chat[]; moments: Moment[]; questions: FutureQuestion[]; chapters: Chapter[]; deletions?: Deletion[] };
export const storageKey = 'aws.demo.v1';
export const notificationCooldown = 2_500;
export const id = () => crypto.randomUUID();
export const timeNow = () => new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(new Date());
export const canPulse = (now: number, lastPulse: number | null) => lastPulse === null || now - lastPulse >= notificationCooldown;
export const nextShimmerDelay = (_random: number) => 3000;
export const mediaLabel = (kind: MediaKind) => ({ photo: 'Фотография', voice: 'Голосовое сообщение', circle: 'Видеокружок', video: 'Видео', file: 'Файл' }[kind]);
export const messageSummary = (message: Message) => message.text || message.media?.map(item => mediaLabel(item.kind)).join(', ') || message.attachment || 'Сообщение';
export function saveMoment(state: DemoState, chatId: string, messageIds: string[], reason: string): DemoState {
  const messages = state.messages.filter(item => item.chatId === chatId && messageIds.includes(item.id) && !item.kind).map(item => ({ ...item, media: item.media?.map(asset => ({ ...asset })), replyTo: item.replyTo ? { ...item.replyTo } : undefined }));
  if (!messages.length || !reason.trim()) return state;
  return { ...state, moments: [...state.moments, { id: id(), chatId, message: messages.map(messageSummary).join('\n'), messages, reason: reason.trim() }] };
}
export const initialState = (): DemoState => ({
  chats: [
    { id: 'mira', name: 'Мира', initial: 'М', online: true, unread: 0 },
    { id: 'sasha', name: 'Саша', initial: 'С', online: false, unread: 0 },
    { id: 'danya', name: 'Даня', initial: 'Д', online: false, unread: 0 },
  ],
  messages: [
    ...[
      ['Тоже. Уже есть что-то общее.', true, '22:13'], ['Тогда начнём с музыки.', false, '22:14'],
      ['Скинешь любимый трек?', true, '22:14'], ['Конечно. Начни с Sextape.', false, '22:15'],
      ['Уже включил.', true, '22:15'], ['Ну как тебе?', false, '22:16'],
      ['Попала прямо в настроение.', true, '22:16'], ['Значит, мы уже не совсем чужие.', false, '22:17'],
      ['Похоже на то.', true, '22:17'],
    ].map(([text, own, time], index) => ({ id: `mira-${index}`, chatId: 'mira', text: text as string, own: own as boolean, time: time as string })),
    { id: 'sasha-0', chatId: 'sasha', text: 'Во сколько встретимся?', own: true, time: '19:38' },
    { id: 'sasha-1', chatId: 'sasha', text: 'Увидимся завтра', own: false, time: '19:40' },
    { id: 'danya-0', chatId: 'danya', text: 'Есть что послушать вечером?', own: true, time: '18:20' },
    { id: 'danya-1', chatId: 'danya', text: 'Отправил тебе трек', own: false, time: '18:26' },
  ], moments: [], questions: [], chapters: [],
});
export function acceptChapter(state: DemoState, chapterId: string): DemoState {
  const chapter = state.chapters.find(item => item.id === chapterId);
  if (!chapter || chapter.status !== 'pending') return state;
  return {
    ...state,
    chapters: state.chapters.map(item => item.id === chapterId ? { ...item, status: 'accepted' } : item),
    messages: [...state.messages, { id: `chapter-${chapterId}`, chatId: chapter.chatId, text: chapter.title, own: false, time: timeNow(), kind: 'chapter' }],
  };
}
export function editMessage(state: DemoState, messageId: string, text: string): DemoState {
  const message = state.messages.find(item => item.id === messageId);
  if (!message?.own || message.kind || (!text.trim() && !message.attachment && !message.media?.length)) return state;
  return { ...state, messages: state.messages.map(item => item.id === messageId ? { ...item, text: text.trim(), edited: true } : item) };
}
export function forwardMessages(state: DemoState, messageIds: string[], targetChat: string, ownName: string): DemoState {
  if (!state.chats.some(chat => chat.id === targetChat)) return state;
  const forwarded = state.messages.filter(item => messageIds.includes(item.id) && !item.kind).map(item => ({
    id: id(), chatId: targetChat, text: item.text, attachment: item.attachment, media: item.media?.map(asset => ({ ...asset })),
    own: true, time: timeNow(),
    forwardedFrom: item.forwardedFrom || (item.own ? ownName : state.chats.find(chat => chat.id === item.chatId)?.name || 'Собеседник'),
  }));
  return { ...state, messages: [...state.messages, ...forwarded] };
}
export type RemovedMessage = { message: Message; index: number; deletionId?: string };
export function removeMessages(state: DemoState, messageIds: string[], scope: DeleteScope = 'self', deletionId = id()): { state: DemoState; removed: RemovedMessage[] } {
  const removed = state.messages.flatMap((message, index) => messageIds.includes(message.id) && !message.kind ? [{ message, index, deletionId }] : []);
  if (!removed.length) return { state, removed };
  const deleted = new Set(removed.map(item => item.message.id));
  return { state: { ...state, messages: state.messages.filter(item => !deleted.has(item.id)), deletions: [...(state.deletions || []), { id: deletionId, messageIds: [...deleted], scope, at: new Date().toISOString() }] }, removed };
}
export function restoreMessages(state: DemoState, removed: RemovedMessage[]): DemoState {
  const messages = [...state.messages];
  for (const item of [...removed].sort((a, b) => a.index - b.index)) {
    if (!messages.some(message => message.id === item.message.id)) messages.splice(Math.min(item.index, messages.length), 0, item.message);
  }
  return { ...state, messages, deletions: state.deletions?.filter(item => !removed.some(entry => entry.deletionId === item.id)) };
}
export function restoreState(raw: string | null): DemoState {
  if (!raw) return initialState();
  try {
    const state = JSON.parse(raw) as DemoState;
    if (!Array.isArray(state.messages) || !Array.isArray(state.chats) || !Array.isArray(state.moments) || !Array.isArray(state.questions) || !Array.isArray(state.chapters)) return initialState();
    if (!state.chats.length || state.chats.some(chat => typeof chat.id !== 'string' || typeof chat.name !== 'string' || typeof chat.initial !== 'string' || typeof chat.online !== 'boolean' || typeof chat.unread !== 'number')) return initialState();
    if (state.messages.some(message => typeof message.id !== 'string' || typeof message.chatId !== 'string' || typeof message.text !== 'string' || typeof message.own !== 'boolean' || typeof message.time !== 'string')) return initialState();
    const validAsset = (item: MediaAsset) => !!item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.mime === 'string' && typeof item.size === 'number' && ['photo', 'voice', 'circle', 'video', 'file'].includes(item.kind);
    if (state.messages.some(message => message.media !== undefined && (!Array.isArray(message.media) || !message.media.every(validAsset)))) return initialState();
    if (state.messages.some(message => (message.replyTo !== undefined && (!message.replyTo || typeof message.replyTo.id !== 'string' || typeof message.replyTo.text !== 'string' || typeof message.replyTo.author !== 'string')) || (message.forwardedFrom !== undefined && typeof message.forwardedFrom !== 'string') || (message.pinned !== undefined && typeof message.pinned !== 'boolean') || (message.edited !== undefined && typeof message.edited !== 'boolean'))) return initialState();
    if (state.moments.some(item => typeof item.id !== 'string' || typeof item.chatId !== 'string' || typeof item.message !== 'string' || typeof item.reason !== 'string')) return initialState();
    if (state.moments.some(item => item.messages !== undefined && (!Array.isArray(item.messages) || item.messages.some(message => typeof message.id !== 'string' || typeof message.text !== 'string' || (message.media && (!Array.isArray(message.media) || !message.media.every(validAsset))))))) return initialState();
    if (state.questions.some(item => typeof item.id !== 'string' || typeof item.chatId !== 'string' || typeof item.text !== 'string' || typeof item.date !== 'string' || typeof item.answer !== 'string')) return initialState();
    if (state.chapters.some(item => typeof item.id !== 'string' || typeof item.chatId !== 'string' || typeof item.title !== 'string' || !['pending', 'accepted'].includes(item.status))) return initialState();
    return state;
  } catch { return initialState(); }
}
