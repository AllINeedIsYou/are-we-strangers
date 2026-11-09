import { useEffect, useState } from 'react';
import { ApiError, friendlyError } from './authApi';
import { messengerApi, type PublicUser } from './messengerApi';
import { canRequestUsers } from './userSearch';

export default function useUserSearch(query: string, ownId: number | null, enabled: boolean, onExpired: () => void) {
  const [result, setResult] = useState<{ query: string; users: PublicUser[]; loading: boolean; error: string }>({ query: '', users: [], loading: false, error: '' });
  const trimmed = query.trim();
  const allowed = enabled && canRequestUsers(trimmed);
  useEffect(() => {
    if (!allowed) { setResult({ query: trimmed, users: [], loading: false, error: '' }); return; }
    const controller = new AbortController();
    setResult({ query: trimmed, users: [], loading: true, error: '' });
    const timer = setTimeout(async () => {
      try {
        const users = await messengerApi.search(trimmed, controller.signal);
        if (!controller.signal.aborted) setResult({ query: trimmed, users: users.filter(user => user.id !== ownId), loading: false, error: '' });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) onExpired();
        else setResult({ query: trimmed, users: [], loading: false, error: friendlyError(error) });
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [trimmed, ownId, allowed, onExpired]);
  if (!allowed) return { query: trimmed, users: [], loading: false, error: '' };
  return result.query === trimmed ? result : { query: trimmed, users: [], loading: true, error: '' };
}
