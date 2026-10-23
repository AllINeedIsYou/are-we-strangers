import { id, type MediaAsset, type MediaKind } from './domain.ts';

const maxBytes = 50 * 1024 * 1024;
let connection: Promise<IDBDatabase> | null = null;
function openMediaDB(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('aws-media-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('assets');
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
    request.onerror = () => { connection = null; reject(request.error || new Error('Не удалось открыть хранилище медиа')); };
    request.onblocked = () => { connection = null; reject(new Error('Закрой другие вкладки мессенджера и повтори сохранение')); };
  });
  return connection;
}
export async function storeMedia(blob: Blob, kind: MediaKind, name: string, duration?: number): Promise<MediaAsset> {
  if (!blob.size) throw new Error('Запись пустая. Попробуй ещё раз.');
  if (blob.size > maxBytes) throw new Error('Файл слишком большой. Максимум — 50 МБ.');
  const asset: MediaAsset = { id: id(), kind, name, size: blob.size, mime: blob.type || 'application/octet-stream', ...(duration !== undefined ? { duration } : {}) };
  const db = await openMediaDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('assets', 'readwrite');
    transaction.objectStore('assets').put(blob, asset.id);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(new Error('Не удалось сохранить медиа. Возможно, память браузера заполнена.'));
    transaction.onerror = () => reject(new Error('Не удалось сохранить медиа в браузере.'));
  });
  return asset;
}
export async function loadMedia(assetId: string): Promise<Blob | null> {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction('assets', 'readonly').objectStore('assets').get(assetId);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => reject(request.error);
  });
}
export function fileKind(mime: string): MediaKind {
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') return 'photo';
  if (mime.startsWith('audio/')) return 'voice';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}
