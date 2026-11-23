import type { Chat, Message } from './domain.ts';
import type { ServerChapter } from './messengerApi.ts';

export type ChapterBoundary = { id: string; title: string; startedAt: string };

export function chapterWindow(boundaries: ChapterBoundary[], chapterId: string): { start: number; end: number } | null {
  const index = boundaries.findIndex(boundary => boundary.id === chapterId);
  if (index < 0) return null;
  const start = Date.parse(boundaries[index].startedAt);
  const end = index + 1 < boundaries.length ? Date.parse(boundaries[index + 1].startedAt) : Infinity;
  return Number.isFinite(start) && (Number.isFinite(end) || end === Infinity) && end >= start ? { start, end } : null;
}

export function recordsInChapter<T>(records: T[], getCreated: (record: T) => string | undefined, window: { start: number; end: number } | null): T[] {
  if (!window) return [];
  return records.filter(record => {
    const created = Date.parse(getCreated(record) ?? '');
    return Number.isFinite(created) && created >= window.start && created < window.end;
  });
}

export function chapterBoundaries(chat: Chat, chapters: ServerChapter[]): ChapterBoundary[] {
  const boundaries = chapters.flatMap(chapter => chapter.status === 'accepted' && chapter.started_at
    ? [{ id: `chapter-${chapter.id}`, title: chapter.title, startedAt: chapter.started_at }] : []);
  // Older chats have an existing creation date, even before chapter storage was added.
  if (chat.createdAt && !boundaries.some(chapter => Date.parse(chapter.startedAt) <= Date.parse(chat.createdAt!))) {
    boundaries.push({ id: `initial-${chat.id}`, title: 'Первое знакомство', startedAt: chat.createdAt });
  }
  return boundaries.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)
    || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export function completedChapterMinutes(boundaries: ChapterBoundary[]) {
  const durations = new Map<string, number>();
  for (let index = 0; index < boundaries.length - 1; index++) {
    const elapsed = Date.parse(boundaries[index + 1].startedAt) - Date.parse(boundaries[index].startedAt);
    durations.set(boundaries[index].id, Math.max(0, Math.floor(elapsed / 60_000)));
  }
  return durations;
}

export function placeChapterBoundaries(boundaries: ChapterBoundary[], messages: Message[], hasOlder: boolean) {
  const placed = new Map<string | null, ChapterBoundary[]>();
  const oldest = messages.reduce((time, message) => Math.min(time, Date.parse(message.createdAt ?? '') || Infinity), Infinity);
  for (const boundary of boundaries) {
    const started = Date.parse(boundary.startedAt);
    if (hasOlder && started < oldest) continue;
    const next = messages.find(message => message.createdAt && Date.parse(message.createdAt) >= started);
    const key = next?.id ?? null;
    const group = placed.get(key) ?? [];
    group.push(boundary);
    placed.set(key, group);
  }
  return placed;
}
