export type Account = {
  id: number;
  phone: string;
  email: string;
  name: string;
  username: string;
  created_at: string;
  phone_verified_at: string | null;
  email_verified_at: string | null;
};

export type PhoneChallenge = {
  verification_token: string;
  verification_expires_at: string;
  telegram_url: string;
};
export type Registration = { phone: string; email: string; name: string; username: string; password: string };
export type RegistrationResult = PhoneChallenge & { user: Account };

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const fieldNames: Record<string, string> = {
  phone: 'Номер телефона', email: 'Почта', name: 'Имя', username: 'Юзернейм',
  password: 'Пароль', login: 'Логин', code: 'Код', token: 'Ссылка',
};

function errorMessage(payload: unknown, status: number): string {
  const detail = payload && typeof payload === 'object' && 'detail' in payload ? payload.detail : undefined;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map(item => {
      const field = Array.isArray(item?.loc) ? String(item.loc.at(-1)) : '';
      const label = fieldNames[field] || 'Поле';
      if (item?.type === 'missing') return `${label}: обязательное поле`;
      if (item?.type === 'string_too_short') return `${label}: слишком короткое значение`;
      if (item?.type === 'string_too_long') return `${label}: слишком длинное значение`;
      if (item?.type === 'string_pattern_mismatch') return `${label}: неверный формат`;
      if (field === 'email') return 'Проверь адрес почты';
      if (field === 'phone') return 'Проверь номер телефона, включая код страны +7';
      if (typeof item?.msg === 'string' && /[а-яё]/i.test(item.msg)) return `${label}: ${item.msg.replace(/^Value error, /, '')}`;
      return `${label}: проверь введённое значение`;
    });
    return [...new Set(messages)].join('. ');
  }
  if (status === 401) return 'Необходимо войти в аккаунт';
  if (status === 429) return 'Слишком частые запросы. Подожди немного и попробуй ещё раз';
  if (status >= 500) return 'Сервер временно недоступен. Попробуй ещё раз позже';
  return 'Не удалось выполнить запрос. Попробуй ещё раз';
}

export async function apiRequest<T>(path: string, body?: unknown, options: { method?: string; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method || (body === undefined ? 'GET' : 'POST'),
      credentials: 'include',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(0, error instanceof Error && error.name === 'TimeoutError'
      ? 'Сервер долго не отвечает. Попробуй ещё раз'
      : 'Не удалось соединиться с сервером. Проверь подключение и попробуй ещё раз');
  }
  if (response.status === 204) return undefined as T;
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new ApiError(response.status, 'Сервер вернул неожиданный ответ. Попробуй ещё раз позже'); }
  if (!response.ok) throw new ApiError(response.status, errorMessage(payload, response.status));
  return payload as T;
}

function request<T>(path: string, body?: unknown, options: { method?: string; signal?: AbortSignal } = {}): Promise<T> {
  return apiRequest<T>(`/api/auth${path}`, body, options);
}

async function accountRequest(path: string, body?: unknown, signal?: AbortSignal): Promise<Account> {
  const user = await request<Account>(path, body, { signal });
  if (!user || typeof user.id !== 'number' || typeof user.name !== 'string' || typeof user.username !== 'string'
    || typeof user.email !== 'string' || typeof user.phone !== 'string') {
    throw new ApiError(0, 'Не удалось прочитать данные аккаунта');
  }
  return user;
}

export const authApi = {
  me: (signal?: AbortSignal) => accountRequest('/me', undefined, signal),
  login: (login: string, password: string) => accountRequest('/login', { login: login.trim(), password }),
  register: (data: Registration) => request<RegistrationResult>('/register', data),
  verifyPhone: (verification_token: string, code: string) => accountRequest('/verify-phone', { verification_token, code }),
  resendPhone: (phone: string, password: string) => request<PhoneChallenge>('/resend-phone-verification', { phone, password }),
  logout: () => request<void>('/logout', undefined, { method: 'POST' }),
  requestEmail: () => request<{ expires_at: string }>('/request-email-verification', undefined, { method: 'POST' }),
  verifyEmail: (token: string) => accountRequest('/verify-email', { token }),
};

export function telegramLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 't.me' && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}

export function friendlyError(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Что-то пошло не так. Попробуй ещё раз';
}
