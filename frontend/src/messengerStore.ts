import { ApiError, friendlyError } from './authApi.ts';
import { chatKey, isDeletedMessages, isReadReceipt, isServerMessage, mergeMessages, messengerApi, toChat, toMessage, type DeletedMessages, type ReadReceipt, type ServerChat, type ServerMessage } from './messengerApi.ts';
import type { DemoState, Message } from './domain.ts';

type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';
type HistoryStatus = { loading: boolean; hasOlder: boolean; error: string };
export type MessengerSnapshot = { state: DemoState; loading: boolean; error: string; connection: ConnectionStatus;
  history: Record<string, HistoryStatus>; sending: Record<string, boolean>; pins: Record<string, Message[]>; pinBusy: Record<string, boolean> };
const emptyState = (): DemoState => ({ chats: [], messages: [], moments: [], questions: [], chapters: [] });
export const emptySnapshot = (): MessengerSnapshot => ({ state: emptyState(), loading: true, error: '', connection: 'connecting', history: {}, sending: {}, pins: {}, pinBusy: {} });
type Options = { api?: typeof messengerApi; connect?: () => WebSocket; onExpired: () => void; onIncoming: (chatId: string) => void; onDelete?: (ids: string[], signal: AbortSignal) => Promise<void> };

// Only confirmed server messages enter this store. POST and WS merge by the same ID.
export class MessengerStore {
  private snapshot = emptySnapshot();
  private listeners = new Set<() => void>();
  private api: typeof messengerApi;
  private options: Options;
  private ownId: number;
  private active = false;
  private epoch = 0;
  private abort = new AbortController();
  private socket: WebSocket | null = null;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private handshake?: ReturnType<typeof setTimeout>;
  private pongTimer?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private refreshJob: Promise<void> | null = null;
  private refreshQueued = false;
  private olderJobs = new Set<string>();
  private syncedThrough = new Map<number, number>();
  private selectedChat = '';
  private pinRequests = new Map<string, symbol>();
  private sequence = 0;
  private versions = new Map<number, number>();
  private readIds = new Set<number>();
  private hiddenIds = new Set<number>();
  private reading = new Set<number>();
  private pendingReads = new Map<number, string>();
  private deletions = new Map<number, Promise<void>>();
  private deletionAnimations = new Map<number, { promise: Promise<void>; abort: AbortController }>();
  private metadataTimer?: ReturnType<typeof setTimeout>;
  private readRetryAt = 0;

  constructor(ownId: number, options: Options) { this.ownId = ownId; this.options = options; this.api = options.api || messengerApi; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<MessengerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  private current(epoch: number) { return this.active && this.epoch === epoch; }
  private handleError(error: unknown, epoch: number) {
    if (!this.current(epoch) || this.abort.signal.aborted) return;
    if (error instanceof ApiError && error.status === 401) { this.stop(); this.options.onExpired(); }
    else this.update({ error: friendlyError(error) });
  }
  start() {
    if (this.active) return;
    this.active = true; this.epoch++; this.abort = new AbortController(); this.attempts = 0;
    this.update({ connection: 'connecting', loading: true });
    void this.refresh(); this.connect();
  }
  stop() {
    this.active = false; this.epoch++; this.abort.abort(); this.clearSocketTimers();
    clearTimeout(this.retryTimer); clearTimeout(this.metadataTimer); this.refreshJob = null; this.refreshQueued = false; this.olderJobs.clear();
    for (const animation of this.deletionAnimations.values()) animation.abort.abort();
    this.deletionAnimations.clear();
    this.pinRequests.clear();
    const socket = this.socket; this.socket = null;
    if (socket) { socket.onclose = null; socket.onerror = null; socket.onmessage = null; socket.close(); }
  }
  private clearSocketTimers() { clearInterval(this.heartbeat); clearTimeout(this.handshake); clearTimeout(this.pongTimer); }
  private connect() {
    if (!this.active) return;
    const epoch = this.epoch;
    let socket: WebSocket;
    try {
      socket = this.options.connect ? this.options.connect() : new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/ws`);
    } catch { this.scheduleReconnect(epoch); return; }
    this.socket = socket;
    const valid = () => this.current(epoch) && this.socket === socket;
    this.handshake = setTimeout(() => { if (valid()) socket.close(); }, 10_000);
    socket.onmessage = event => {
      if (!valid()) return;
      let data: unknown;
      try { data = JSON.parse(String(event.data)); } catch { return; }
      if (!data || typeof data !== 'object' || !('type' in data)) return;
      if (data.type === 'connected' && 'user_id' in data) {
        if (data.user_id !== this.ownId) { this.stop(); this.options.onExpired(); return; }
        this.clearSocketTimers(); this.attempts = 0; this.update({ connection: 'online' });
        // Refresh after subscribing: messages written during the handshake are recovered from history.
        void this.refresh();
        void this.loadPins(this.selectedChat);
        this.heartbeat = setInterval(() => {
          if (!valid() || socket.readyState !== 1) return;
          try {
            socket.send(JSON.stringify({ type: 'ping' }));
            this.pongTimer = setTimeout(() => { if (valid()) socket.close(); }, 10_000);
          } catch { socket.close(); }
        }, 20_000);
      } else if (data.type === 'pong') clearTimeout(this.pongTimer);
      else if (data.type === 'message.created' && 'message' in data && isServerMessage(data.message)) this.receive(data.message);
      else if (data.type === 'messages.read' && isReadReceipt(data)) this.receiveRead(data);
      else if (data.type === 'message.updated' && 'message' in data && isServerMessage(data.message)) this.receiveEdit(data.message);
      else if (data.type === 'messages.deleted' && isDeletedMessages(data)) void this.receiveDelete(data);
      else if (data.type === 'chat.pins_changed' && 'chat_id' in data && typeof data.chat_id === 'number') {
        const key = chatKey(data.chat_id);
        if (key === this.selectedChat || this.snapshot.pins[key]) void this.loadPins(key);
      }
    };
    socket.onerror = () => { if (valid()) socket.close(); };
    socket.onclose = () => {
      if (!valid()) return;
      this.socket = null; this.clearSocketTimers(); this.scheduleReconnect(epoch);
    };
  }
  private scheduleReconnect(epoch: number) {
    if (!this.current(epoch)) return;
    this.update({ connection: 'reconnecting' });
    const delay = Math.min(15_000, 1000 * 2 ** Math.min(this.attempts++, 4));
    this.retryTimer = setTimeout(async () => {
      // The handshake can be denied as HTTP 403; an HTTP request distinguishes expired auth from an outage.
      try { await this.api.chats(this.abort.signal); }
      catch (error) { if (error instanceof ApiError && error.status === 401) { this.handleError(error, epoch); return; } }
      if (this.current(epoch)) this.connect();
    }, delay);
  }
  reconnect = () => {
    if (!this.active) return;
    this.readRetryAt = 0;
    clearTimeout(this.retryTimer);
    if (!this.socket) this.connect();
    void this.refresh();
    void this.loadPins(this.selectedChat);
  };
  private upsertChats(chats: ServerChat[], replace = false) {
    const known = new Map(this.snapshot.state.chats.map(chat => [chat.id, chat]));
    for (const item of chats) {
      const key = chatKey(item.id), previous = known.get(key);
      const pending = [...this.pendingReads.values()].includes(key);
      known.set(key, { ...toChat(item), unread: pending && previous ? previous.unread : item.unread_count });
    }
    this.update({ state: { ...this.snapshot.state, chats: replace ? chats.map(item => known.get(chatKey(item.id))!) : [...known.values()] } });
  }
  private merge(messages: ServerMessage[], started = Infinity) {
    for (const message of messages) if (message.is_read) this.readIds.add(message.id);
    const incoming = messages.filter(message => !this.hiddenIds.has(message.id) && (this.versions.get(message.id) || 0) <= started)
      .map(message => toMessage({ ...message, is_read: message.is_read || this.readIds.has(message.id) || this.pendingReads.has(message.id) }, this.ownId));
    this.update({ state: { ...this.snapshot.state, messages: mergeMessages(this.snapshot.state.messages, incoming) } });
  }
  private metadataChanged() {
    clearTimeout(this.metadataTimer);
    this.metadataTimer = setTimeout(() => { if (this.active) void this.refresh(); }, 80);
  }
  private moveToTop(key: string) {
    const chats = this.snapshot.state.chats;
    this.update({ state: { ...this.snapshot.state, chats: [...chats.filter(chat => chat.id === key), ...chats.filter(chat => chat.id !== key)] } });
  }
  private receive(message: ServerMessage) {
    if (this.hiddenIds.has(message.id)) return;
    const mapped = toMessage(message, this.ownId);
    const seen = this.snapshot.state.messages.some(item => item.id === mapped.id);
    // A delayed create response must not overwrite a newer edit/read event.
    if (seen) return;
    this.versions.set(message.id, ++this.sequence);
    this.merge([message]);
    if (!seen && !mapped.own) {
      this.update({ state: { ...this.snapshot.state, chats: this.snapshot.state.chats.map(chat => chat.id === mapped.chatId ? { ...chat, unread: chat.unread + (message.is_read ? 0 : 1) } : chat) } });
      this.options.onIncoming(mapped.chatId);
    }
    this.moveToTop(mapped.chatId); this.metadataChanged();
    if (!this.snapshot.state.chats.some(chat => chat.id === mapped.chatId)) void this.refresh();
  }
  selectChat = (chatId: string) => {
    if (this.selectedChat === chatId) return;
    this.selectedChat = chatId;
    void this.loadPins(chatId);
  };
  private async loadPins(key: string) {
    const chatId = this.snapshot.state.chats.find(chat => chat.id === key)?.serverId;
    if (!this.active || !chatId) return;
    const epoch = this.epoch;
    const request = Symbol();
    this.pinRequests.set(key, request);
    try {
      const rows = await this.api.pins(chatId, this.abort.signal);
      if (!this.current(epoch) || this.pinRequests.get(key) !== request) return;
      const pins = rows.filter(row => !this.hiddenIds.has(row.id)).map(row => toMessage(row, this.ownId));
      this.update({ pins: { ...this.snapshot.pins, [key]: pins } });
    } catch (error) {
      if (this.pinRequests.get(key) === request) this.handleError(error, epoch);
    } finally {
      if (this.pinRequests.get(key) === request) this.pinRequests.delete(key);
    }
  }
  setPin = async (key: string, messageId: number, pinned: boolean) => {
    const chatId = this.snapshot.state.chats.find(chat => chat.id === key)?.serverId;
    if (!this.active || !chatId || this.snapshot.pinBusy[key]) return;
    const epoch = this.epoch;
    this.update({ pinBusy: { ...this.snapshot.pinBusy, [key]: true } });
    try {
      await this.api.setPin(chatId, messageId, pinned, this.abort.signal);
      if (this.current(epoch)) await this.loadPins(key);
    } catch (error) {
      this.handleError(error, epoch);
      if (this.current(epoch)) throw error;
    } finally {
      if (this.current(epoch)) this.update({ pinBusy: { ...this.snapshot.pinBusy, [key]: false } });
    }
  };
  private receiveRead(receipt: ReadReceipt) {
    const ids = new Set(receipt.message_ids);
    for (const id of ids) { this.readIds.add(id); this.versions.set(id, ++this.sequence); }
    this.update({ state: { ...this.snapshot.state, messages: this.snapshot.state.messages.map(message =>
      message.chatId === chatKey(receipt.chat_id) && ids.has(message.serverId!) ? { ...message, read: true } : message) } });
    // Counts come from the server, avoiding double subtraction when HTTP and WS overlap.
    if (ids.size && receipt.reader_id === this.ownId) this.metadataChanged();
  }
  private receiveEdit(message: ServerMessage) {
    this.versions.set(message.id, ++this.sequence);
    const key = chatKey(message.chat_id);
    if (this.snapshot.state.messages.some(item => item.serverId === message.id && item.chatId === key)) this.merge([message]);
    if (this.pinRequests.has(key) || this.snapshot.pins[key]?.some(pin => pin.serverId === message.id)) void this.loadPins(key);
  }
  private startDeletionAnimation(ids: number[]) {
    const fresh = ids.filter(id => !this.deletionAnimations.has(id));
    if (!fresh.length) return;
    const abort = new AbortController();
    const animation = { abort, promise: Promise.resolve() as Promise<void> };
    animation.promise = Promise.resolve().then(() => this.options.onDelete?.(fresh.map(id => `message-${id}`), abort.signal)).catch(() => undefined);
    for (const id of fresh) this.deletionAnimations.set(id, animation);
  }
  private async receiveDelete(result: DeletedMessages) {
    if (result.scope === 'self' && result.actor_id !== this.ownId) return;
    const fresh = result.message_ids.filter(id => !this.hiddenIds.has(id));
    for (const id of fresh) { this.hiddenIds.add(id); this.versions.set(id, ++this.sequence); }
    if (fresh.length) {
      const epoch = this.epoch;
      const key = chatKey(result.chat_id);
      if (this.snapshot.pins[key]) {
        this.update({ pins: { ...this.snapshot.pins, [key]: this.snapshot.pins[key].filter(pin => !this.hiddenIds.has(pin.serverId!)) } });
      }
      this.startDeletionAnimation(fresh);
      const job = (async () => {
        await Promise.all(fresh.map(id => this.deletionAnimations.get(id)?.promise));
        if (!this.current(epoch)) return;
        const ids = new Set(fresh);
        this.update({ state: { ...this.snapshot.state, messages: this.snapshot.state.messages.filter(message => !ids.has(message.serverId!)) } });
        this.metadataChanged();
      })();
      for (const id of fresh) this.deletions.set(id, job);
      void job.finally(() => { for (const id of fresh) { this.deletions.delete(id); this.deletionAnimations.delete(id); } });
    }
    await Promise.all(result.message_ids.map(id => this.deletions.get(id)));
  }
  private historyStatus(chatId: string, patch: Partial<HistoryStatus>) {
    const previous = this.snapshot.history[chatId] || { loading: false, hasOlder: false, error: '' };
    this.update({ history: { ...this.snapshot.history, [chatId]: { ...previous, ...patch } } });
  }
  refresh = (): Promise<void> => {
    if (!this.active) return Promise.resolve();
    if (this.refreshJob) { this.refreshQueued = true; return this.refreshJob; }
    const epoch = this.epoch;
    this.refreshJob = (async () => {
      try {
        const started = this.sequence;
        const chats = await this.api.chats(this.abort.signal);
        if (!this.current(epoch)) return;
        // An event during this request may be newer than its response. Fetch again.
        if (started === this.sequence) this.upsertChats(chats, true);
        else { this.upsertChats(chats.map(chat => ({ ...chat, unread_count: this.snapshot.state.chats.find(item => item.serverId === chat.id)?.unread ?? chat.unread_count }))); this.refreshQueued = true; }
        this.update({ error: '' });
        // The current API has no last-message field, so fetch the latest page for each dialog.
        const queue = [...chats];
        const worker = async () => {
          let chat: ServerChat | undefined;
          while ((chat = queue.shift()) && this.current(epoch)) await this.syncChat(chat.id, epoch);
        };
        await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
      } catch (error) { this.handleError(error, epoch); }
      finally {
        if (this.current(epoch)) {
          this.refreshJob = null; this.update({ loading: false });
          if (this.refreshQueued) { this.refreshQueued = false; void this.refresh(); }
        }
      }
    })();
    return this.refreshJob;
  };
  private async syncChat(serverId: number, epoch: number) {
    const key = chatKey(serverId);
    // Live events can arrive ahead of a reconnect history fetch. Use the last completed
    // history checkpoint, not the newest live ID, or messages inside the gap can be skipped.
    const newest = this.syncedThrough.get(serverId) || 0;
    const loaded = this.snapshot.state.messages.filter(message => message.chatId === key);
    const oldestLoaded = loaded.reduce((min, message) => Math.min(min, message.serverId || Infinity), Infinity);
    const through = Number.isFinite(oldestLoaded) ? Math.min(newest || oldestLoaded, oldestLoaded) : newest;
    const hadHistory = !!this.snapshot.history[key];
    if (!hadHistory) this.historyStatus(key, { loading: true, error: '' });
    try {
      let before: number | undefined;
      let firstPage = true;
      let checkpoint = newest;
      while (this.current(epoch)) {
        const started = this.sequence;
        const page = await this.api.messages(serverId, before, this.abort.signal);
        if (!this.current(epoch)) return;
        this.reconcilePage(serverId, page, before, started);
        checkpoint = Math.max(checkpoint, ...page.map(message => message.id));
        if (firstPage && !hadHistory) this.historyStatus(key, { hasOlder: page.length === 50 });
        firstPage = false;
        const oldest = page.length ? Math.min(...page.map(message => message.id)) : 0;
        if (!through || page.length < 50 || oldest <= through || (before !== undefined && oldest >= before)) {
          if (page.length < 50) this.historyStatus(key, { hasOlder: false });
          break;
        }
        before = oldest;
      }
      this.syncedThrough.set(serverId, checkpoint);
      this.historyStatus(key, { loading: false, error: '' });
    } catch (error) {
      if (!this.current(epoch)) return;
      this.historyStatus(key, { loading: false, error: friendlyError(error) }); this.handleError(error, epoch);
    }
  }
  private reconcilePage(serverId: number, page: ServerMessage[], before: number | undefined, started: number) {
    const returned = new Set(page.map(message => message.id));
    const lower = page.length === 50 ? Math.min(...returned) : 0;
    this.update({ state: { ...this.snapshot.state, messages: this.snapshot.state.messages.filter(message =>
      message.chatId !== chatKey(serverId) || message.serverId! < lower || message.serverId! >= (before ?? Infinity)
      || returned.has(message.serverId!) || (this.versions.get(message.serverId!) || 0) > started || this.deletions.has(message.serverId!)) } });
    this.merge(page, started);
  }
  loadOlder = async (key: string) => {
    const chat = this.snapshot.state.chats.find(item => item.id === key);
    if (!chat?.serverId || this.olderJobs.has(key) || this.snapshot.history[key]?.loading) return;
    const epoch = this.epoch;
    const oldest = this.snapshot.state.messages.filter(message => message.chatId === key).reduce((min, message) => Math.min(min, message.serverId || Infinity), Infinity);
    this.olderJobs.add(key); this.historyStatus(key, { loading: true, error: '' });
    try {
      const started = this.sequence;
      const page = await this.api.messages(chat.serverId, Number.isFinite(oldest) ? oldest : undefined, this.abort.signal);
      if (!this.current(epoch)) return;
      this.merge(page, started); this.historyStatus(key, { loading: false, hasOlder: page.length === 50, error: '' });
    } catch (error) {
      if (this.current(epoch)) { this.historyStatus(key, { loading: false, error: friendlyError(error) }); this.handleError(error, epoch); }
    } finally { if (this.current(epoch)) this.olderJobs.delete(key); }
  };
  createChat = async (partnerId: number) => {
    const epoch = this.epoch;
    try {
      const chat = await this.api.createChat(partnerId, this.abort.signal);
      if (!this.current(epoch)) return null;
      this.upsertChats([chat]); void this.syncChat(chat.id, epoch); return chatKey(chat.id);
    } catch (error) { this.handleError(error, epoch); throw error; }
  };
  sendText = async (key: string, text: string, replyToId?: number) => {
    const chat = this.snapshot.state.chats.find(item => item.id === key);
    if (!chat?.serverId || !this.active || this.snapshot.sending[key]) return false;
    const epoch = this.epoch;
    this.update({ sending: { ...this.snapshot.sending, [key]: true } });
    try {
      const message = await this.api.send(chat.serverId, text, this.abort.signal, replyToId);
      if (!this.current(epoch)) return false;
      this.receive(message); return true;
    } catch (error) {
      this.handleError(error, epoch);
      // No automatic POST retry: the server has no client_id/idempotency key yet.
      if (this.current(epoch)) void this.refresh();
      throw error;
    } finally { if (this.current(epoch)) this.update({ sending: { ...this.snapshot.sending, [key]: false } }); }
  };
  forwardMessages = async (sourceKey: string, targetKey: string, ids: string[]) => {
    const source = this.snapshot.state.chats.find(chat => chat.id === sourceKey);
    const target = this.snapshot.state.chats.find(chat => chat.id === targetKey);
    if (!source?.serverId || !target?.serverId || !this.active) return false;
    const selected = new Set(ids);
    if (!selected.size || selected.size > 100) throw new ApiError(422, 'Выбери от 1 до 100 сообщений');
    const messageIds = this.snapshot.state.messages.flatMap(message =>
      message.chatId === sourceKey && selected.has(message.id) && message.serverId && !this.hiddenIds.has(message.serverId) ? [message.serverId] : [],
    );
    if (messageIds.length !== selected.size) throw new ApiError(404, 'Одно или несколько сообщений недоступны');
    const epoch = this.epoch;
    try {
      const copies = await this.api.forward(target.serverId, source.serverId, messageIds, this.abort.signal);
      if (!this.current(epoch)) return false;
      for (const copy of copies) this.receive(copy);
      return true;
    } catch (error) {
      this.handleError(error, epoch);
      if (this.current(epoch)) void this.refresh();
      throw error;
    }
  };
  prepareChat = async (key: string) => {
    // The API provides a count, not a first-unread cursor. Walk back until the
    // oldest unread is loaded; never mark the newest page while this is running.
    while (this.active && this.selectedChat === key && this.snapshot.history[key]?.hasOlder) {
      const unread = this.snapshot.state.chats.find(chat => chat.id === key)?.unread || 0;
      const loadedUnread = this.snapshot.state.messages.filter(message => message.chatId === key && !message.own && !message.read).length;
      if (loadedUnread >= unread || this.snapshot.history[key]?.loading) break;
      const size = this.snapshot.state.messages.length;
      await this.loadOlder(key);
      if (size === this.snapshot.state.messages.length || this.snapshot.history[key]?.error) break;
    }
  };
  markRead = async (key: string, messageIds: number[]) => {
    const chat = this.snapshot.state.chats.find(chat => chat.id === key);
    if (!chat?.serverId || key !== this.selectedChat || !this.active || Date.now() < this.readRetryAt) return;
    const candidates = new Set(this.snapshot.state.messages.filter(message => message.chatId === key && !message.own && !message.read && !this.hiddenIds.has(message.serverId!)).map(message => message.serverId!));
    const ids = [...new Set(messageIds)].filter(id => candidates.has(id) && !this.reading.has(id)).slice(0, 100);
    if (!ids.length) return;
    const epoch = this.epoch;
    ids.forEach(id => { this.reading.add(id); this.pendingReads.set(id, key); this.versions.set(id, ++this.sequence); });
    const selected = new Set(ids);
    this.update({ state: { ...this.snapshot.state,
      messages: this.snapshot.state.messages.map(message => selected.has(message.serverId!) ? { ...message, read: true } : message),
      chats: this.snapshot.state.chats.map(chat => chat.id === key ? { ...chat, unread: Math.max(0, chat.unread - ids.length) } : chat),
    } });
    try {
      const result = await this.api.read(chat.serverId, ids, this.abort.signal);
      if (this.current(epoch) && result.reader_id === this.ownId) {
        // An empty response also means these messages were already read elsewhere.
        this.receiveRead({ ...result, message_ids: ids }); this.metadataChanged();
      }
    } catch (error) {
      if (this.current(epoch)) {
        this.readRetryAt = Date.now() + 5000;
        const rollback = new Set(ids.filter(id => !this.readIds.has(id) && !this.hiddenIds.has(id)));
        ids.forEach(id => this.versions.set(id, ++this.sequence));
        this.update({ state: { ...this.snapshot.state,
          messages: this.snapshot.state.messages.map(message => rollback.has(message.serverId!) ? { ...message, read: false } : message),
          chats: this.snapshot.state.chats.map(chat => chat.id === key ? { ...chat, unread: chat.unread + rollback.size } : chat),
        } });
      }
      this.handleError(error, epoch);
      if (this.current(epoch)) this.metadataChanged();
    } finally { ids.forEach(id => { this.reading.delete(id); this.pendingReads.delete(id); }); }
  };
  editText = async (key: string, messageId: string, text: string) => {
    const message = this.snapshot.state.messages.find(message => message.id === messageId && message.chatId === key && message.own);
    const chat = this.snapshot.state.chats.find(chat => chat.id === key);
    if (!message?.serverId || !chat?.serverId || this.hiddenIds.has(message.serverId) || !this.active || this.snapshot.sending[key]) return false;
    const epoch = this.epoch;
    this.update({ sending: { ...this.snapshot.sending, [key]: true } });
    try {
      const result = await this.api.edit(chat.serverId, message.serverId, text, this.abort.signal);
      if (!this.current(epoch)) return false;
      this.receiveEdit(result); return true;
    } catch (error) { this.handleError(error, epoch); if (this.current(epoch)) void this.refresh(); throw error; }
    finally { if (this.current(epoch)) this.update({ sending: { ...this.snapshot.sending, [key]: false } }); }
  };
  deleteMessages = async (key: string, ids: string[], scope: DeletedMessages['scope']) => {
    const chat = this.snapshot.state.chats.find(chat => chat.id === key);
    if (!chat?.serverId || !this.active) return false;
    const selected = this.snapshot.state.messages.filter(message => message.chatId === key && ids.includes(message.id)).map(message => message.serverId!);
    if (!selected.length || selected.length > 100) throw new ApiError(422, 'Выбери от 1 до 100 сообщений');
    const epoch = this.epoch;
    this.startDeletionAnimation(selected);
    try {
      const result = await this.api.delete(chat.serverId, selected, scope, this.abort.signal);
      if (!this.current(epoch)) return false;
      await this.receiveDelete({ ...result, message_ids: selected });
      // Includes idempotent deletions and changes made while this tab was offline.
      void this.refresh(); return this.current(epoch);
    } catch (error) {
      const animations = new Set(selected.filter(id => !this.hiddenIds.has(id)).map(id => this.deletionAnimations.get(id)));
      for (const animation of animations) animation?.abort.abort();
      await Promise.all([...animations].map(animation => animation?.promise));
      for (const id of selected) if (!this.hiddenIds.has(id)) this.deletionAnimations.delete(id);
      this.handleError(error, epoch); if (this.current(epoch)) void this.refresh(); throw error;
    }
  };
}
