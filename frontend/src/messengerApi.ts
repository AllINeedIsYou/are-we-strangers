import { ApiError, apiRequest } from './authApi.ts';
import type { Chat, Message } from './domain.ts';

export type PublicUser = { id: number; name: string; username: string };
export type ServerChat = { id: number; created_at: string; partner: PublicUser; unread_count: number };
export type ServerMessage = { id: number; chat_id: number; sender_id: number; text: string; created_at: string; is_read: boolean; is_edited: boolean };
export type ReadReceipt = { reader_id: number; chat_id: number; message_ids: number[] };
export type DeletedMessages = { actor_id: number; chat_id: number; message_ids: number[]; scope: 'self' | 'everyone' };
export const chatKey = (id: number) => `server-${id}`;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const date = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function isPublicUser(value: unknown): value is PublicUser {
  const user = value as PublicUser | null;
  return !!user && positive(user.id) && typeof user.name === 'string' && typeof user.username === 'string';
}
export function isServerMessage(value: unknown): value is ServerMessage {
  const message = value as ServerMessage | null;
  return !!message && positive(message.id) && positive(message.chat_id) && positive(message.sender_id)
    && typeof message.text === 'string' && date(message.created_at) && typeof message.is_read === 'boolean' && typeof message.is_edited === 'boolean';
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
  search: async (q: string, signal?: AbortSignal) => list(await apiRequest(`/api/user/search?${new URLSearchParams({ q: q.trim() })}`, undefined, { signal }), isPublicUser),
  chats: async (signal?: AbortSignal) => list(await apiRequest('/api/chats', undefined, { signal }), isChat),
  createChat: async (partner_id: number, signal?: AbortSignal) => checked(await apiRequest('/api/chats', { partner_id }, { signal }), isChat),
  messages: async (chatId: number, beforeId?: number, signal?: AbortSignal) => {
    const suffix = beforeId === undefined ? '' : `?before_id=${beforeId}`;
    const messages = list(await apiRequest(`/api/chats/${chatId}/messages${suffix}`, undefined, { signal }), isServerMessage);
    if (messages.some(message => message.chat_id !== chatId)) throw new ApiError(0, 'Сервер вернул сообщения другого чата');
    return messages;
  },
  send: async (chatId: number, text: string, signal?: AbortSignal) => {
    const message = checked(await apiRequest(`/api/chats/${chatId}/messages`, { text }, { signal }), isServerMessage);
    if (message.chat_id !== chatId) throw new ApiError(0, 'Сервер вернул сообщение другого чата');
    return message;
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
    time: new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.created_at)) };
}
export function mergeMessages(previous: Message[], incoming: Message[]): Message[] {
  const messages = new Map(previous.map(message => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((a, b) => (a.serverId || 0) - (b.serverId || 0));
}
