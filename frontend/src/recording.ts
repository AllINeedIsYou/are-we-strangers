export type RecordingKind = 'voice' | 'circle';
export function chooseRecordingMime(kind: RecordingKind, supports: (mime: string) => boolean): string | undefined {
  const candidates = kind === 'circle'
    ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find(supports);
}
export function stopMediaTracks(stream: Pick<MediaStream, 'getTracks'> | null) {
  stream?.getTracks().forEach(track => track.stop());
}
export function recordingError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Нет доступа к камере или микрофону. Разреши доступ в настройках сайта и попробуй снова.';
  if (name === 'NotFoundError') return 'Камера или микрофон не найдены. Подключи устройство и попробуй снова.';
  if (name === 'NotReadableError') return 'Камера или микрофон заняты другим приложением.';
  return error instanceof Error ? error.message : 'Не удалось начать запись.';
}
export const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
