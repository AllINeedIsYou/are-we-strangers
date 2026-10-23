import type { Message } from './domain';

export function splitSearchText(text: string, query: string): { text: string; match: boolean }[] {
  const term = query.trim();
  if (!term) return [{ text, match: false }];
  const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  const parts: { text: string; match: boolean }[] = [];
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index!;
    if (start > end) parts.push({ text: text.slice(end, start), match: false });
    parts.push({ text: match[0], match: true });
    end = start + match[0].length;
  }
  if (end < text.length) parts.push({ text: text.slice(end), match: false });
  return parts.length ? parts : [{ text, match: false }];
}
export function findMessages(messages: Message[], query: string): Message[] {
  if (!query.trim()) return [];
  return messages.filter(message => !message.kind && splitSearchText(message.text || message.attachment || '', query).some(part => part.match)).reverse();
}
