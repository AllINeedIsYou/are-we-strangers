import { ApiError, apiRequest } from './authApi.ts';
import type { Chat, Message, Moment } from './domain.ts';

export type PublicUser = { id: number; name: string; username: string };
export type ArchiveKind = 'chat' | 'moment' | 'question';
export type ServerArchive = { chat_ids: number[]; moment_ids: number[]; question_ids: number[] };
export type ArchiveChange = { chat_id: number; item_type: ArchiveKind; item_id: number; archived: boolean };
export function isArchiveChange(value: unknown): value is ArchiveChange {
  const row = value as ArchiveChange | null;
  return !!row && positive(row.chat_id) && positive(row.item_id) && ['chat', 'moment', 'question'].includes(row.item_type)
    && typeof row.archived === 'boolean' && (row.item_type !== 'chat' || row.item_id === row.chat_id);
}
export function isArchive(value: unknown): value is ServerArchive {
  const row = value as ServerArchive | null;
  return !!row && ids(row.chat_ids) && ids(row.moment_ids) && ids(row.question_ids);
}
export type ServerChat = { id: number; created_at: string; partner: PublicUser; unread_count: number };
export type ServerMessage = { id: number; chat_id: number; sender_id: number; text: string; created_at: string; is_read: boolean; is_edited: boolean; reply_to_id: number | null; forwarded_from_name?: string | null };
export type ReadReceipt = { reader_id: number; chat_id: number; message_ids: number[] };
export type DeletedMessages = { actor_id: number; chat_id: number; message_ids: number[]; scope: 'self' | 'everyone' };
type MomentCopy = { moments_id: number; source_message_id: number; author_name: string; text: string; message_created_at: string };
export type ServerMomentCard = {
  moment: { id: number; chat_id: number; author_id: number; reason: string; response: string | null; created_at: string };
  messages: MomentCopy[];
};
export type ServerFutureQuestion = {
  id: number; chat_id: number; author_id: number; text: string; opens_at: string; created_at: string;
  my_answer: string | null; partner_answer: string | null;
};
export type ChapterDecision = 'accepted' | 'rejected';
export type ServerChapter = {
  id: number; chat_id: number; author_id: number; title: string;
  status: 'pending' | ChapterDecision; created_at: string; started_at: string | null;
};
export const chatKey = (id: number) => `server-${id}`;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const date = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function isChapter(value: unknown): value is ServerChapter {
  const chapter = value as ServerChapter | null;
  return !!chapter && positive(chapter.id) && positive(chapter.chat_id) && positive(chapter.author_id)
    && typeof chapter.title === 'string' && chapter.title.trim().length > 0 && Array.from(chapter.title).length <= 70
    && date(chapter.created_at) && (chapter.status === 'pending' || chapter.status === 'accepted' || chapter.status === 'rejected')
    && (chapter.status === 'accepted' ? date(chapter.started_at) : chapter.started_at === null);
}
export function isChapterEvent(value: unknown): value is { chat_id: number; chapter_id: number } {
  const event = value as { chat_id?: unknown; chapter_id?: unknown } | null;
  return !!event && positive(event.chat_id) && positive(event.chapter_id);
}
function isFutureQuestion(value: unknown): value is ServerFutureQuestion {
  const question = value as ServerFutureQuestion | null;
  return !!question && positive(question.id) && positive(question.chat_id) && positive(question.author_id)
    && typeof question.text === 'string' && date(question.opens_at) && date(question.created_at)
    && (question.my_answer === null || typeof question.my_answer === 'string')
    && (question.partner_answer === null || (typeof question.my_answer === 'string' && typeof question.partner_answer === 'string'));
}
export function isFutureQuestionEvent(value: unknown): value is { chat_id: number; question_id: number } {
  const event = value as { chat_id?: unknown; question_id?: unknown } | null;
  return !!event && positive(event.chat_id) && positive(event.question_id);
}
export function isMomentCard(value: unknown): value is ServerMomentCard {
  const card = value as ServerMomentCard | null;
  const moment = card?.moment;
  return !!moment && positive(moment.id) && positive(moment.chat_id) && positive(moment.author_id)
    && typeof moment.reason === 'string' && (moment.response === null || typeof moment.response === 'string') && date(moment.created_at)
    && Array.isArray(card?.messages) && card.messages.every(copy => copy && copy.moments_id === moment.id
      && positive(copy.source_message_id) && typeof copy.author_name === 'string' && typeof copy.text === 'string' && date(copy.message_created_at));
}
export function isPublicUser(value: unknown): value is PublicUser {
  const user = value as PublicUser | null;
  return !!user && positive(user.id) && typeof user.name === 'string' && typeof user.username === 'string';
}
export function isServerMessage(value: unknown): value is ServerMessage {
  const message = value as ServerMessage | null;
  return !!message && positive(message.id) && positive(message.chat_id) && positive(message.sender_id)
    && typeof message.text === 'string' && date(message.created_at) && typeof message.is_read === 'boolean' && typeof message.is_edited === 'boolean'
    && (message.reply_to_id === null || positive(message.reply_to_id))
    && (message.forwarded_from_name == null || typeof message.forwarded_from_name === 'string');
}
const ids = (value: unknown): value is number[] => Array.isArray(value) && value.every(positive);
export function isReadReceipt(value: unknown): value is ReadReceipt {
  const receipt = value as ReadReceipt | null;
  return !!receipt && positive(receipt.reader_id) && positive(receipt.chat_id) && ids(receipt.message_ids);
}
export function isDeletedMessages(value: unknown): value is DeletedMessages {
  const deletion = value as DeletedMessages | null;
  return !!deletion && positive(deletion.actor_id) && positive(deletion.chat_id) && ids(deletion.message_ids) && ['self', 'everyone'].includes(deletion.scope);
}
function isChat(value: unknown): value is ServerChat {
  const chat = value as ServerChat | null;
  return !!chat && positive(chat.id) && date(chat.created_at) && isPublicUser(chat.partner) && Number.isSafeInteger(chat.unread_count) && chat.unread_count >= 0;
}
function checked<T>(value: unknown, guard: (value: unknown) => value is T): T {
  if (!guard(value)) throw new ApiError(0, 'Не удалось прочитать ответ сервера');
  return value;
}
function list<T>(value: unknown, guard: (value: unknown) => value is T): T[] {
  if (!Array.isArray(value) || !value.every(guard)) throw new ApiError(0, 'Не удалось прочитать ответ сервера');
  return value;
}
export const messengerApi = {
  archive: async (signal?: AbortSignal) => checked(await apiRequest('/api/archive', undefined, { signal }), isArchive),
  setArchived: async (chatId: number, kind: ArchiveKind, itemId: number, archived: boolean, signal?: AbortSignal) => {
    const suffix = kind === 'chat' ? '' : kind === 'moment' ? `/moments/${itemId}` : `/future-questions/${itemId}`;
    const result = checked(await apiRequest(`/api/chats/${chatId}${suffix}/archive`, { archived }, { method: 'PATCH', signal }), isArchiveChange);
    if (result.chat_id !== chatId || result.item_type !== kind || result.item_id !== itemId || result.archived !== archived) throw new ApiError(0, 'Некорректный ответ об архивировании');
    return result;
  },
  chapters: async (chatId: number, signal?: AbortSignal) => {
    const chapters = list(await apiRequest(`/api/chats/${chatId}/chapters`, undefined, { signal }), isChapter);
    if (chapters.some(chapter => chapter.chat_id !== chatId)) throw new ApiError(0, 'Сервер вернул главы другого чата');
    return chapters;
  },
  createChapter: async (chatId: number, title: string, signal?: AbortSignal) => {
    const chapter = checked(await apiRequest(`/api/chats/${chatId}/chapters`, { title }, { signal }), isChapter);
    if (chapter.chat_id !== chatId || chapter.status !== 'pending') throw new ApiError(0, 'Некорректный ответ о предложении главы');
    return chapter;
  },
  decideChapter: async (chatId: number, id: number, status: ChapterDecision, signal?: AbortSignal) => {
    const chapter = checked(await apiRequest(`/api/chats/${chatId}/chapters/${id}`, { status }, { method: 'PATCH', signal }), isChapter);
    if (chapter.chat_id !== chatId || chapter.id !== id || chapter.status !== status) throw new ApiError(0, 'Некорректный ответ о решении по главе');
    return chapter;
  },
  search: async (q: string, signal?: AbortSignal) => list(await apiRequest(`/api/user/search?${new URLSearchParams({ q: q.trim() })}`, undefined, { signal }), isPublicUser),
  chats: async (signal?: AbortSignal) => list(await apiRequest('/api/chats', undefined, { signal }), isChat),
  createChat: async (partner_id: number, signal?: AbortSignal) => checked(await apiRequest('/api/chats', { partner_id }, { signal }), isChat),
  futureQuestions: async (chatId: number, signal?: AbortSignal) => {
    const questions = list(await apiRequest(`/api/chats/${chatId}/future-questions`, undefined, { signal }), isFutureQuestion);
    if (questions.some(question => question.chat_id !== chatId)) throw new ApiError(0, 'Сервер вернул вопросы другого чата');
    return questions;
  },
  createFutureQuestion: async (chatId: number, text: string, opens_at: string, signal?: AbortSignal) => {
    const question = checked(await apiRequest(`/api/chats/${chatId}/future-questions`, { text, opens_at }, { signal }), isFutureQuestion);
    if (question.chat_id !== chatId) throw new ApiError(0, 'Сервер вернул вопрос другого чата');
    return question;
  },
  answerFutureQuestion: async (chatId: number, id: number, text: string, signal?: AbortSignal) => {
    const question = checked(await apiRequest(`/api/chats/${chatId}/future-questions/${id}/answer`, { text }, { signal }), isFutureQuestion);
    if (question.chat_id !== chatId || question.id !== id) throw new ApiError(0, 'Сервер вернул другой вопрос');
    return question;
  },
  moments: async (chatId: number, signal?: AbortSignal) => {
    const cards = list(await apiRequest(`/api/chats/${chatId}/moments`, undefined, { signal }), isMomentCard);
    if (cards.some(card => card.moment.chat_id !== chatId)) throw new ApiError(0, 'Сервер вернул моменты другого чата');
    return cards;
  },
  createMoment: async (chatId: number, message_ids: number[], reason: string, signal?: AbortSignal) => {
    const card = checked(await apiRequest(`/api/chats/${chatId}/moments`, { message_ids, reason }, { signal }), isMomentCard);
    if (card.moment.chat_id !== chatId) throw new ApiError(0, 'Сервер вернул момент другого чата');
    return card;
  },
  replyToMoment: async (chatId: number, momentId: number, response: string, signal?: AbortSignal) => {
    const card = checked(await apiRequest(`/api/chats/${chatId}/moments/${momentId}/reply`, { response }, { signal }), isMomentCard);
    if (card.moment.chat_id !== chatId || card.moment.id !== momentId) throw new ApiError(0, 'Сервер вернул другой момент');
    return card;
  },
  messages: async (chatId: number, beforeId?: number, signal?: AbortSignal) => {
    const suffix = beforeId === undefined ? '' : `?before_id=${beforeId}`;
    const messages = list(await apiRequest(`/api/chats/${chatId}/messages${suffix}`, undefined, { signal }), isServerMessage);
    if (messages.some(message => message.chat_id !== chatId)) throw new ApiError(0, 'Сервер вернул сообщения другого чата');
    return messages;
  },
  pins: async (chatId: number, signal?: AbortSignal) => {
    const messages = list(await apiRequest(`/api/chats/${chatId}/pins`, undefined, { signal }), isServerMessage);
    if (messages.some(message => message.chat_id !== chatId)) throw new ApiError(0, 'Сервер вернул закрепы другого чата');
    return messages;
  },
  setPin: (chatId: number, messageId: number, pinned: boolean, signal?: AbortSignal) =>
    apiRequest<void>(`/api/chats/${chatId}/pins/${messageId}`, undefined, { method: pinned ? 'POST' : 'DELETE', signal }),
  send: async (chatId: number, text: string, signal?: AbortSignal, replyToId?: number) => {
    const body = replyToId === undefined ? { text } : { text, reply_to_id: replyToId };
    const message = checked(await apiRequest(`/api/chats/${chatId}/messages`, body, { signal }), isServerMessage);
    if (message.chat_id !== chatId) throw new ApiError(0, 'Сервер вернул сообщение другого чата');
    return message;
  },
  forward: async (chatId: number, source_chat_id: number, message_ids: number[], signal?: AbortSignal) => {
    const messages = list(await apiRequest(`/api/chats/${chatId}/messages/forward`, { source_chat_id, message_ids }, { signal }), isServerMessage);
    if (messages.length !== new Set(message_ids).size || messages.some(message => message.chat_id !== chatId || message.forwarded_from_name == null)) {
      throw new ApiError(0, 'Некорректный ответ о пересылке');
    }
    return messages;
  },
  read: async (chatId: number, message_ids: number[], signal?: AbortSignal) => {
    const receipt = checked(await apiRequest(`/api/chats/${chatId}/read`, { message_ids }, { signal }), isReadReceipt);
    if (receipt.chat_id !== chatId || receipt.message_ids.some(id => !message_ids.includes(id))) throw new ApiError(0, 'Некорректный ответ о прочтении');
    return receipt;
  },
  edit: async (chatId: number, messageId: number, text: string, signal?: AbortSignal) => {
    const message = checked(await apiRequest(`/api/chats/${chatId}/messages/${messageId}`, { text }, { method: 'PATCH', signal }), isServerMessage);
    if (message.chat_id !== chatId || message.id !== messageId) throw new ApiError(0, 'Сервер вернул другое сообщение');
    return message;
  },
  delete: async (chatId: number, message_ids: number[], scope: DeletedMessages['scope'], signal?: AbortSignal) => {
    const result = checked(await apiRequest(`/api/chats/${chatId}/messages/delete`, { message_ids, scope }, { method: 'DELETE', signal }), isDeletedMessages);
    if (result.chat_id !== chatId || result.scope !== scope || result.message_ids.some(id => !message_ids.includes(id))) throw new ApiError(0, 'Некорректный ответ об удалении');
    return result;
  },
};
export function toChat(chat: ServerChat): Chat {
  return { id: chatKey(chat.id), serverId: chat.id, partnerId: chat.partner.id, createdAt: chat.created_at,
    name: chat.partner.name, username: chat.partner.username, initial: Array.from(chat.partner.name)[0]?.toLocaleUpperCase('ru') || '?', online: false, unread: chat.unread_count };
}
export function toMessage(message: ServerMessage, ownId: number): Message {
  return { id: `message-${message.id}`, serverId: message.id, chatId: chatKey(message.chat_id), createdAt: message.created_at,
    own: message.sender_id === ownId, text: message.text, read: message.is_read, edited: message.is_edited,
    replyToId: message.reply_to_id === null ? undefined : `message-${message.reply_to_id}`, forwardedFrom: message.forwarded_from_name ?? undefined,
    time: new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.created_at)) };
}
export function toMoment(card: ServerMomentCard): Moment {
  const moment = card.moment;
  const key = chatKey(moment.chat_id);
  const formatTime = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' });
  return {
    id: `moment-${moment.id}`, serverId: moment.id, chatId: key, authorId: moment.author_id,
    createdAt: moment.created_at, reason: moment.reason, response: moment.response ?? undefined,
    message: card.messages.map(copy => copy.text).join('\n'),
    messages: card.messages.map(copy => ({
      id: `moment-${moment.id}-copy-${copy.source_message_id}`, chatId: key, own: false,
      text: copy.text, authorName: copy.author_name, time: formatTime.format(new Date(copy.message_created_at)),
    })),
  };
}
export function mergeMessages(previous: Message[], incoming: Message[]): Message[] {
  const messages = new Map(previous.map(message => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((a, b) => (a.serverId || 0) - (b.serverId || 0));
}
