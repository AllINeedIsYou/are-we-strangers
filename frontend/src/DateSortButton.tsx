import { ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react';

export type DateOrder = 'asc' | 'desc';

export function sortByCreated<T>(items: T[], getCreated: (item: T) => string | undefined, order: DateOrder): T[] {
  const direction = order === 'asc' ? 1 : -1;
  return items.map((item, index) => ({ item, index, time: Date.parse(getCreated(item) ?? '') || 0 }))
    .sort((a, b) => direction * (a.time - b.time || a.index - b.index))
    .map(entry => entry.item);
}

export default function DateSortButton({ order, onChange }: { order: DateOrder; onChange: (order: DateOrder) => void }) {
  const description = order === 'asc' ? 'Сначала старые' : 'Сначала новые';
  return <button type="button" className="icon-button glass round date-sort-button"
    aria-label={`Сортировка: ${description.toLocaleLowerCase('ru')}`}
    title={`${description}. Нажми, чтобы изменить порядок по времени создания.`}
    onClick={() => onChange(order === 'asc' ? 'desc' : 'asc')}>
    {order === 'asc' ? <ArrowUpNarrowWide size={20} aria-hidden="true" /> : <ArrowDownWideNarrow size={20} aria-hidden="true" />}
  </button>;
}
