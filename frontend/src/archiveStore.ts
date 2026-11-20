import { ApiError, friendlyError } from './authApi.ts';
import { isArchiveChange, type ArchiveChange, type ArchiveKind, type ServerArchive, type messengerApi } from './messengerApi.ts';

export const archiveKey = (kind: ArchiveKind, id: number) => `${kind}-${id}`;
export const archiveField = { chat: 'chat_ids', moment: 'moment_ids', question: 'question_ids' } as const;
export const emptyArchive = (): ServerArchive => ({ chat_ids: [], moment_ids: [], question_ids: [] });
export type ArchiveSnapshot = { data: ServerArchive | null; loading: boolean; error: string; busy: Record<string, boolean> };
export const emptyArchiveSnapshot = (): ArchiveSnapshot => ({ data: null, loading: false, error: '', busy: {} });
export type ArchiveTransition = (signal: AbortSignal) => Promise<void>;

function apply(data: ServerArchive, change: ArchiveChange): ServerArchive {
  const field = archiveField[change.item_type];
  const values = data[field].filter(id => id !== change.item_id);
  if (change.archived) values.push(change.item_id);
  return { ...data, [field]: values };
}

export class ArchiveStore {
  private snapshot = emptyArchiveSnapshot();
  private listeners = new Set<() => void>();
  private active = false;
  private epoch = 0;
  private abort = new AbortController();
  private job: Promise<void> | null = null;
  private queued = false;
  private sequence = 0;
  private changes = new Map<string, { version: number; change: ArchiveChange }>();
  private authoritative: ServerArchive | null = null;
  private transitions = new Map<string, { before: ArchiveChange; abort: AbortController }>();
  private api: Pick<typeof messengerApi, 'archive' | 'setArchived'>;
  private onExpired: () => void;
  constructor(api: Pick<typeof messengerApi, 'archive' | 'setArchived'>, onExpired: () => void) { this.api = api; this.onExpired = onExpired; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<ArchiveSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener(); }
  private current(epoch: number) { return this.active && this.epoch === epoch; }
  start() { if (this.active) return; this.active = true; this.epoch++; this.abort = new AbortController(); void this.load(); }
  stop() {
    this.active = false; this.epoch++; this.abort.abort(); this.job = null; this.queued = false;
    for (const transition of this.transitions.values()) transition.abort.abort();
    this.transitions.clear();
    this.update({ busy: {}, loading: false });
  }
  private publish(data: ServerArchive) {
    this.authoritative = data;
    let visible = data;
    for (const { before } of this.transitions.values()) visible = apply(visible, before);
    this.update({ data: visible });
  }
  load = (): Promise<void> => {
    if (!this.active) return Promise.resolve();
    if (this.job) { this.queued = true; return this.job; }
    const epoch = this.epoch, started = this.sequence;
    this.update({ loading: true, error: '' });
    this.job = (async () => {
      try {
        let data = await this.api.archive(this.abort.signal);
        if (!this.current(epoch)) return;
        for (const { version, change } of this.changes.values()) if (version > started) data = apply(data, change);
        this.publish(data); this.update({ error: '' });
      } catch (error) {
        if (!this.current(epoch)) return;
        if (error instanceof ApiError && error.status === 401) this.onExpired();
        else this.update({ error: friendlyError(error) });
      } finally {
        if (this.current(epoch)) {
          this.job = null; this.update({ loading: false });
          if (this.queued) { this.queued = false; void this.load(); }
        }
      }
    })();
    return this.job;
  };
  private merge(change: ArchiveChange) {
    this.changes.set(archiveKey(change.item_type, change.item_id), { version: ++this.sequence, change });
    if (this.authoritative) this.publish(apply(this.authoritative, change));
  }
  receive(value: unknown) {
    if (!this.active || !isArchiveChange(value)) return;
    this.merge(value);
    void this.load();
  }
  set = async (chatId: number, kind: ArchiveKind, itemId: number, archived: boolean, transition?: ArchiveTransition): Promise<boolean> => {
    const key = archiveKey(kind, itemId);
    if (!this.active || this.snapshot.busy[key]) return false;
    if (!this.snapshot.data) throw new ApiError(409, 'Дождись загрузки архива и попробуй ещё раз.');
    const epoch = this.epoch, version = this.changes.get(key)?.version;
    const effect = new AbortController();
    if (transition) this.transitions.set(key, { before: { chat_id: chatId, item_type: kind, item_id: itemId, archived: this.snapshot.data[archiveField[kind]].includes(itemId) }, abort: effect });
    const animation = transition ? Promise.resolve().then(() => transition(effect.signal)).catch(() => undefined) : Promise.resolve();
    this.update({ busy: { ...this.snapshot.busy, [key]: true } });
    try {
      const change = await this.api.setArchived(chatId, kind, itemId, archived, this.abort.signal);
      if (!this.current(epoch)) return false;
      // An event delivered while PATCH was running can already describe a newer state.
      if (this.changes.get(key)?.version === version) this.merge(change);
      void this.load();
      await animation;
      if (!this.current(epoch)) return false;
      return true;
    } catch (error) {
      effect.abort();
      if (!this.current(epoch)) return false;
      if (error instanceof ApiError && error.status === 401) this.onExpired();
      else void this.load();
      throw error;
    } finally {
      if (this.current(epoch)) {
        this.transitions.delete(key);
        if (this.authoritative) this.publish(this.authoritative);
        this.update({ busy: { ...this.snapshot.busy, [key]: false } });
        // Let React remove a confirmed card first. Cleanup also restores it if
        // a newer event kept the record on this side of the archive.
        if (transition) setTimeout(() => effect.abort(), 32);
      }
    }
  };
}
