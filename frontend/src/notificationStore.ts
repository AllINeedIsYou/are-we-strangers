import { ApiError, friendlyError } from './authApi.ts';
import { isChatNotifications, type ChatNotifications, type messengerApi } from './messengerApi.ts';

export type NotificationSnapshot = {
  chatIds: number[] | null; loading: boolean; error: string;
  busy: Record<number, boolean>; errors: Record<number, string>;
};
export const emptyNotificationSnapshot = (): NotificationSnapshot => ({ chatIds: null, loading: false, error: '', busy: {}, errors: {} });

export class NotificationStore {
  private snapshot = emptyNotificationSnapshot();
  private listeners = new Set<() => void>();
  private active = false;
  private epoch = 0;
  private abort = new AbortController();
  private job: Promise<void> | null = null;
  private queued = false;
  private sequence = 0;
  private changes = new Map<number, { version: number; value: ChatNotifications }>();
  private api: Pick<typeof messengerApi, 'mutedChats' | 'setChatNotifications'>;
  private onExpired: () => void;
  constructor(api: Pick<typeof messengerApi, 'mutedChats' | 'setChatNotifications'>, onExpired: () => void) { this.api = api; this.onExpired = onExpired; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<NotificationSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  private current(epoch: number) { return this.active && this.epoch === epoch; }
  private apply(ids: number[], value: ChatNotifications) {
    return [...ids.filter(id => id !== value.chat_id), ...(value.muted ? [value.chat_id] : [])].sort((a, b) => a - b);
  }
  private merge(value: ChatNotifications) {
    this.changes.set(value.chat_id, { version: ++this.sequence, value });
    if (this.snapshot.chatIds) this.update({ chatIds: this.apply(this.snapshot.chatIds, value) });
  }
  canNotify = (chatId: number) => this.snapshot.chatIds !== null && !this.snapshot.chatIds.includes(chatId);
  start() {
    if (this.active) return;
    this.active = true; this.epoch++; this.abort = new AbortController(); void this.load();
  }
  stop() {
    this.active = false; this.epoch++; this.abort.abort(); this.job = null; this.queued = false;
    this.update({ loading: false, busy: {} });
  }
  load = (): Promise<void> => {
    if (!this.active) return Promise.resolve();
    if (this.job) { this.queued = true; return this.job; }
    const epoch = this.epoch, started = this.sequence;
    this.update({ loading: true, error: '' });
    this.job = (async () => {
      try {
        let ids = await this.api.mutedChats(this.abort.signal);
        if (!this.current(epoch)) return;
        for (const { version, value } of this.changes.values()) if (version > started) ids = this.apply(ids, value);
        this.update({ chatIds: ids, error: '' });
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
  receive(value: unknown) {
    if (!this.active || !isChatNotifications(value)) return;
    this.merge(value); void this.load();
  }
  retry = () => { this.update({ errors: {} }); return this.load(); };
  set = async (chatId: number, muted: boolean): Promise<boolean> => {
    if (!this.active || this.snapshot.busy[chatId] || this.snapshot.chatIds === null) return false;
    const epoch = this.epoch, version = this.changes.get(chatId)?.version;
    this.update({ busy: { ...this.snapshot.busy, [chatId]: true }, errors: { ...this.snapshot.errors, [chatId]: '' } });
    try {
      const value = await this.api.setChatNotifications(chatId, muted, this.abort.signal);
      if (!this.current(epoch)) return false;
      if (this.changes.get(chatId)?.version === version) this.merge(value);
      void this.load(); return true;
    } catch (error) {
      if (!this.current(epoch)) return false;
      if (error instanceof ApiError && error.status === 401) this.onExpired();
      else {
        this.update({ errors: { ...this.snapshot.errors, [chatId]: friendlyError(error) } });
        void this.load();
      }
      return false;
    } finally { if (this.current(epoch)) this.update({ busy: { ...this.snapshot.busy, [chatId]: false } }); }
  };
}
