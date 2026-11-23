import { useSyncExternalStore } from 'react';
import { emptyNotificationSnapshot, type NotificationStore } from './notificationStore';

const empty = emptyNotificationSnapshot();
const subscribeEmpty = () => () => {};
export default function useNotifications(store: NotificationStore | null | undefined) {
  return useSyncExternalStore(store?.subscribe ?? subscribeEmpty, store?.getSnapshot ?? (() => empty));
}
