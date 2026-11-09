import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { ApiError, apiRequest, friendlyError, type Account } from './authApi';

export default function DevAccountSwitch({ user, onSwitch }: { user: Account; onSwitch: (user: Account) => void }) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const revision = ++generation.current;
    setError('');
    void apiRequest<{ enabled: boolean; target: string }>('/__dev__/account-switch', undefined, { signal: controller.signal })
      .then(status => { if (!controller.signal.aborted && generation.current === revision) setTarget(status.enabled ? status.target : ''); })
      .catch(problem => { if (!controller.signal.aborted) { setTarget(''); if (!(problem instanceof ApiError && problem.status === 404)) setError(friendlyError(problem)); } });
    return () => { generation.current++; controller.abort(); };
  }, [user.id]);
  async function switchAccount() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    const revision = generation.current;
    try {
      const response = await fetch('/__dev__/account-switch', { method: 'POST', credentials: 'include', headers: { 'X-AWS-Dev-Switch': '1' }, signal: AbortSignal.timeout(25_000) });
      const result = await response.json() as { user?: Account; detail?: string };
      if (!response.ok || !result.user || !Number.isSafeInteger(result.user.id) || typeof result.user.username !== 'string') throw new Error(result.detail || 'Не удалось переключить аккаунт');
      if (generation.current === revision) onSwitch(result.user);
    } catch (problem) { if (generation.current === revision) setError(problem instanceof Error ? problem.message : friendlyError(problem)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (!target) return error ? <div className="dev-account-switch"><p role="alert">{error}</p></div> : null;
  return <div className="dev-account-switch"><button className="glass" disabled={busy} onClick={() => { void switchAccount(); }}><ArrowLeftRight size={15}/><span>{busy ? 'Переключаем…' : `Переключиться на ${target}`}</span><small>ВРЕМЕННО</small></button>{error && <p role="alert">{error}</p>}</div>;
}
