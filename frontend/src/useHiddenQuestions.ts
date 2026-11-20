import { useEffect, useState } from 'react';

const keyFor = (userId: number) => `aws.hidden-questions.user.${userId}`;

function readHiddenQuestions(userId: number | null): Set<number> {
  if (userId === null) return new Set();
  try {
    const value: unknown = JSON.parse(localStorage.getItem(keyFor(userId)) || '[]');
    return new Set(Array.isArray(value) ? value.filter(id => Number.isSafeInteger(id) && id > 0) : []);
  } catch { return new Set(); }
}

export default function useHiddenQuestions(userId: number | null) {
  const [saved, setSaved] = useState(() => ({ userId, ids: readHiddenQuestions(userId) }));
  useEffect(() => { setSaved({ userId, ids: readHiddenQuestions(userId) }); }, [userId]);
  useEffect(() => {
    if (userId === null || saved.userId !== userId) return;
    try { localStorage.setItem(keyFor(userId), JSON.stringify([...saved.ids])); }
    catch { /* Hiding still works for the current browser session. */ }
  }, [saved, userId]);

  function setHidden(id: number, hidden: boolean) {
    setSaved(previous => {
      const ids = new Set(previous.userId === userId ? previous.ids : readHiddenQuestions(userId));
      if (hidden) ids.add(id);
      else ids.delete(id);
      return { userId, ids };
    });
  }

  return { hiddenQuestions: saved.userId === userId ? saved.ids : new Set<number>(), setQuestionHidden: setHidden };
}
