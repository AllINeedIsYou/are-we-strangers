import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, authApi, friendlyError, type Account } from './authApi';

export default function useAuthSession() {
  const [user, setUser] = useState<Account | null>(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const acceptUser = useCallback((account: Account) => {
    revision.current += 1;
    controller.current?.abort();
    setUser(account);
    setChecking(false);
    setSessionError('');
  }, []);
  const clearUser = useCallback(() => {
    revision.current += 1;
    controller.current?.abort();
    setUser(null);
    setChecking(false);
    setSessionError('');
  }, []);
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    controller.current?.abort();
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15_000);
    controller.current = abort;
    setChecking(true);
    setSessionError('');
    try {
      const account = await authApi.me(abort.signal);
      if (revision.current === current && !abort.signal.aborted) setUser(account);
    } catch (error) {
      if (revision.current !== current) return;
      if (error instanceof ApiError && error.status === 401) setUser(null);
      else setSessionError(abort.signal.aborted ? 'Сервер долго не отвечает. Попробуй проверить вход ещё раз' : friendlyError(error));
    } finally {
      clearTimeout(timeout);
      if (revision.current === current) setChecking(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => { revision.current += 1; controller.current?.abort(); };
  }, [refresh]);

  return { user, checking, sessionError, acceptUser, clearUser, refresh };
}
