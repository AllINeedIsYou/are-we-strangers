import type { Chat } from './domain.ts';

export type SearchKind = 'empty' | 'name' | 'username' | 'phone';
export function searchKind(value: string): SearchKind {
  const query = value.trim();
  if (!query) return 'empty';
  if (query.startsWith('@')) return 'username';
  if (/^(?:tel:)?\+?[\d\s().-]*$/.test(query) && /\d/.test(query)) return 'phone';
  return 'name';
}
export function usesGlobalSearch(query: string) {
  return ['username', 'phone'].includes(searchKind(query));
}
export function canRequestUsers(query: string) {
  const value = query.trim();
  return usesGlobalSearch(value) && value !== '@';
}
const phoneDigits = (value: string) => value.replace(/\D/g, '');
const displayName = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
export function findOwnChats(chats: Chat[], query: string, phoneMatches: { id: number }[] = []): Chat[] {
  const value = query.trim(), kind = searchKind(value);
  return chats.filter(chat => {
    if (kind === 'empty') return true;
    if (kind === 'name') return displayName(chat.name).includes(displayName(value));
    if (kind === 'username') {
      if (!chat.username) return false;
      const username = chat.username.startsWith('@') ? chat.username : `@${chat.username}`;
      return username.startsWith(value);
    }
    // PublicUserResponse omits phone. An exact phone result still identifies an
    // existing dialog by partner ID, without adding private data to the contract.
    return !!chat.phone && phoneDigits(chat.phone) === phoneDigits(value)
      || phoneMatches.some(user => user.id === chat.partnerId);
  });
}
