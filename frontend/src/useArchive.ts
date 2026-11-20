import { useSyncExternalStore } from 'react';
import { emptyArchiveSnapshot, type ArchiveStore } from './archiveStore';
const empty = emptyArchiveSnapshot();
const subscribeEmpty = () => () => {};
export default function useArchive(store: ArchiveStore | null | undefined) {
  return useSyncExternalStore(store?.subscribe ?? subscribeEmpty, store?.getSnapshot ?? (() => empty));
}
