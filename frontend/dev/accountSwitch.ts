import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const route = '/__dev__/account-switch';
const ttl = 30 * 60 * 1000;
type Account = { id: number; username: string; name: string };
type Pair = { original: string; neo: string; originalId: number; neoId: number; expires: number };
type Options = { target: string; username: string; primaryUsername: string; password: string; fetcher?: typeof fetch };
const local = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
const cookie = (headers: string | undefined, name: string) => (headers || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const validToken = (value: string | undefined): value is string => !!value && /^[A-Za-z0-9_-]{16,512}$/.test(value);

// Development middleware only. Session cookies stay HttpOnly and are cached only
// in this local Vite process; the application backend remains the authority.
export function createAccountSwitch(options: Options) {
  const pairs = new Map<string, Pair>();
  const busy = new Set<string>();
  const fetcher = options.fetcher || fetch;
  const enabled = !!options.username && !!options.password && local(new URL(options.target).hostname);
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const reply = (res: ServerResponse, status: number, body: unknown, cookies?: string[]) => {
    res.writeHead(status, { ...headers, ...(cookies ? { 'Set-Cookie': cookies } : {}) }); res.end(JSON.stringify(body));
  };
  async function me(token: string): Promise<Account | null> {
    const response = await fetcher(new URL('/api/auth/me', options.target), { headers: { Cookie: `session_token=${token}` }, signal: AbortSignal.timeout(10_000) });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error('auth unavailable');
    const account = await response.json() as Account;
    if (!Number.isSafeInteger(account.id) || typeof account.username !== 'string') throw new Error('invalid account');
    return account;
  }
  async function middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (req.url?.split('?')[0] !== route) { next(); return; }
    const host = req.headers.host || '';
    let hostname = '';
    try { hostname = new URL(`http://${host}`).hostname; } catch { /* rejected below */ }
    if (!enabled || !local(hostname)) { reply(res, 404, { enabled: false }); return; }
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')) { reply(res, 403, { detail: 'Только для локального запуска' }); return; }
    if (req.method !== 'GET' && req.method !== 'POST') { reply(res, 405, { detail: 'Метод недоступен' }); return; }
    if (req.method === 'POST' && (req.headers.origin !== `http://${host}` || req.headers['x-aws-dev-switch'] !== '1')) {
      reply(res, 403, { detail: 'Переключение доступно только из этого приложения' }); return;
    }
    for (const [key, pair] of pairs) if (pair.expires <= Date.now()) pairs.delete(key);
    const currentToken = cookie(req.headers.cookie, 'session_token');
    if (!validToken(currentToken)) { reply(res, 401, { detail: 'Сначала войди в свой аккаунт' }); return; }
    const nonce = cookie(req.headers.cookie, 'aws_dev_switch');
    const saved = nonce ? pairs.get(nonce) : undefined;
    const pair = saved && (currentToken === saved.original || currentToken === saved.neo) ? saved : undefined;
    if (req.method === 'POST' && busy.has(currentToken)) { reply(res, 409, { detail: 'Переключение уже выполняется' }); return; }
    if (req.method === 'POST') busy.add(currentToken);
    try {
      const current = await me(currentToken);
      if (!current) { reply(res, 401, { detail: 'Сессия истекла. Войди в аккаунт ещё раз' }); return; }
      if (!pair && current.username.replace(/^@/, '') !== options.primaryUsername.replace(/^@/, '') && current.username !== options.username) {
        reply(res, 409, { detail: `Переключатель предназначен только для ${options.primaryUsername} и ${options.username}` }); return;
      }
      if (!pair && current.username === options.username) {
        reply(res, 409, { detail: 'Для переключения сначала войди в свой основной аккаунт' }); return;
      }
      const returning = !!pair && current.id === pair.neoId;
      if (req.method === 'GET') {
        reply(res, 200, { enabled: true, target: returning ? options.primaryUsername : options.username }); return;
      }
      let selectedToken: string;
      let selectedAccount: Account;
      let selectedPair = pair;
      let selectedNonce = nonce;
      if (!selectedPair) {
        const response = await fetcher(new URL('/api/auth/login', options.target), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login: options.username, password: options.password }), signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) { reply(res, 502, { detail: 'Не удалось войти в @neo. Проверь данные тестового аккаунта' }); return; }
        selectedAccount = await response.json() as Account;
        selectedToken = cookie(response.headers.get('set-cookie') || undefined, 'session_token') || '';
        if (!validToken(selectedToken) || selectedAccount.username !== options.username || !Number.isSafeInteger(selectedAccount.id) || selectedAccount.id === current.id) throw new Error('invalid login');
        selectedNonce = randomBytes(32).toString('hex');
        selectedPair = { original: currentToken, originalId: current.id, neo: selectedToken, neoId: selectedAccount.id, expires: Date.now() + ttl };
        pairs.set(selectedNonce, selectedPair);
      } else {
        selectedToken = returning ? selectedPair.original : selectedPair.neo;
        const account = await me(selectedToken);
        if (!account) { reply(res, 409, { detail: returning ? 'Твоя основная сессия истекла. Войди в неё обычным способом' : 'Сессия @neo истекла. Перезапусти локальный фронт и попробуй снова' }); return; }
        if (account.id !== (returning ? selectedPair.originalId : selectedPair.neoId)) throw new Error('session mismatch');
        selectedAccount = account;
      }
      selectedPair.expires = Date.now() + ttl;
      reply(res, 200, { user: selectedAccount }, [
        `session_token=${selectedToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
        `aws_dev_switch=${selectedNonce}; Path=/__dev__/account-switch; HttpOnly; SameSite=Strict; Max-Age=1800`,
      ]);
    } catch { reply(res, 503, { detail: 'Не удалось переключить аккаунт. Проверь, что бэк запущен' }); }
    finally { if (req.method === 'POST') busy.delete(currentToken); }
  }
  return { middleware, clear: () => { pairs.clear(); busy.clear(); } };
}

export function devAccountSwitch(options: Options): Plugin {
  return { name: 'local-account-switch', apply: 'serve', configureServer(server) {
    const switching = createAccountSwitch(options);
    server.middlewares.use((req, res, next) => { void switching.middleware(req, res, next); });
    server.httpServer?.once('close', switching.clear);
  } };
}
