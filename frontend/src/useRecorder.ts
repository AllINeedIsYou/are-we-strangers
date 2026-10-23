import { useEffect, useRef, useState } from 'react';
import { storeMedia } from './mediaStore';
import { chooseRecordingMime, recordingError, stopMediaTracks, type RecordingKind } from './recording';
import type { MediaAsset } from './domain';

export type RecordingPhase = 'idle' | 'requesting' | 'recording' | 'paused' | 'preview' | 'saving';
export function useRecorder(onComplete: (asset: MediaAsset) => void, requestStream?: (kind: RecordingKind) => Promise<MediaStream>) {
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [kind, setKind] = useState<RecordingKind>('voice');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [level, setLevel] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const tracks = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const generation = useRef(0);
  const alive = useRef(true);
  const elapsed = useRef(0);
  const lastTick = useRef(0);
  const samples = useRef<number[]>([]);
  const complete = useRef(onComplete); complete.current = onComplete;
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const saveOnStop = useRef(false);
  function release() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stopMediaTracks(tracks.current); tracks.current = null;
    void context.current?.close().catch(() => undefined); context.current = null;
    if (alive.current) { setStream(null); setLevel(0); }
  }
  function cancel() {
    generation.current++; saveOnStop.current = false;
    if (recorder.current?.state !== 'inactive') recorder.current?.stop();
    release(); setBlob(null); setDuration(0); setPeaks([]); setError(''); setPhase('idle'); phaseRef.current = 'idle';
  }
  async function save(result: Blob, mode: RecordingKind, seconds: number, token: number) {
    setPhase('saving'); phaseRef.current = 'saving';
    try {
      const ext = result.type.includes('mp4') ? (mode === 'voice' ? 'm4a' : 'mp4') : 'webm';
      const asset = await storeMedia(result, mode, `${mode === 'voice' ? 'Голосовое' : 'Кружок'}-${Date.now()}.${ext}`, seconds);
      if (!alive.current || token !== generation.current) return;
      complete.current(asset); setBlob(null); setPhase('idle'); phaseRef.current = 'idle';
    } catch (cause) { if (alive.current && token === generation.current) { setError(recordingError(cause)); setPhase('preview'); phaseRef.current = 'preview'; } }
  }
  function stop(send = false) {
    if (phaseRef.current === 'requesting') { cancel(); return; }
    if (!recorder.current || recorder.current.state === 'inactive') return;
    saveOnStop.current = send;
    if (recorder.current.state === 'recording') elapsed.current += performance.now() - lastTick.current;
    recorder.current.stop(); release();
  }
  async function start(mode: RecordingKind) {
    if (phaseRef.current !== 'idle') return;
    if (!window.isSecureContext || !window.MediaRecorder || (!requestStream && !navigator.mediaDevices?.getUserMedia)) { setError('Для записи нужен браузер с поддержкой камеры и микрофона и HTTPS.'); return; }
    const token = ++generation.current;
    setKind(mode); setPhase('requesting'); phaseRef.current = 'requesting'; setError(''); setBlob(null); setDuration(0); setPeaks([]); samples.current = []; elapsed.current = 0; saveOnStop.current = false;
    let obtained: MediaStream | null = null;
    let ownedContext:AudioContext|null=null;
    try {
      obtained = requestStream ? await requestStream(mode) : await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}, video:mode === 'circle' ? {facingMode:'user',width:{ideal:480},height:{ideal:480},aspectRatio:{ideal:1}} : false});
      if (!alive.current || token !== generation.current) { stopMediaTracks(obtained); return; }
      tracks.current = obtained; setStream(obtained);
      let analyser: AnalyserNode | null = null;
      try { const audio = new AudioContext();ownedContext=audio; context.current = audio; await audio.resume(); analyser = audio.createAnalyser(); analyser.fftSize = 256; audio.createMediaStreamSource(obtained).connect(analyser); } catch { /* Recording still works without a visual meter. */ }
      if (!alive.current || token !== generation.current) {stopMediaTracks(obtained);void ownedContext?.close().catch(()=>undefined);return;}
      const mime = chooseRecordingMime(mode, value => MediaRecorder.isTypeSupported(value));
      const next = new MediaRecorder(obtained, mime ? {mimeType:mime} : undefined);
      recorder.current = next;
      const chunks: Blob[] = []; let bytes = 0; let failure = '';
      next.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); bytes += event.data.size; if (bytes > 50*1024*1024) { failure = 'Запись превысила 50 МБ. Запиши короче.'; stop(); } } };
      next.onerror = () => {if(token!==generation.current)return;failure = 'Запись прервалась. Попробуй ещё раз.'; stop(); };
      next.onstop = () => {
        if (!alive.current || token !== generation.current) {stopMediaTracks(obtained);return;}
        release();
        if (failure) { setError(failure); setPhase('idle'); phaseRef.current = 'idle'; return; }
        const result = new Blob(chunks,{type:next.mimeType || chunks[0]?.type || (mode === 'voice' ? 'audio/webm' : 'video/webm')});
        if (!result.size || elapsed.current < 250) { setError('Запись слишком короткая. Удерживай кнопку чуть дольше.'); setPhase('idle'); phaseRef.current = 'idle'; return; }
        const seconds = Math.min(mode === 'circle' ? 60 : 300, elapsed.current/1000);
        setBlob(result); setDuration(seconds); setPeaks([...samples.current]);
        if (saveOnStop.current) void save(result,mode,seconds,token);
        else { setPhase('preview'); phaseRef.current = 'preview'; }
      };
      obtained.getTracks().forEach(track=>track.addEventListener('ended',()=>{ if (next.state !== 'inactive') stop(); },{once:true}));
      lastTick.current = performance.now(); next.start(150); setPhase('recording'); phaseRef.current = 'recording';
      const data = new Uint8Array(256);
      timer.current = setInterval(()=>{
        if (next.state !== 'recording') return;
        const seconds = (elapsed.current+performance.now()-lastTick.current)/1000;
        setDuration(seconds);
        let rms = 0;
        if (analyser) { analyser.getByteTimeDomainData(data); rms = Math.sqrt(data.reduce((sum,value)=>sum+((value-128)/128)**2,0)/data.length); }
        const amplitude = Math.min(1,rms*5); samples.current.push(amplitude); setLevel(amplitude); setPeaks(samples.current.slice(-64));
        if (seconds >= (mode === 'circle' ? 60 : 300)) stop();
      },100);
    } catch (cause) {stopMediaTracks(obtained);void ownedContext?.close().catch(()=>undefined);if (alive.current && token === generation.current) {release();setError(recordingError(cause));setPhase('idle');phaseRef.current='idle';} }
  }
  function pause() { if (recorder.current?.state !== 'recording') return; elapsed.current += performance.now()-lastTick.current; recorder.current.pause(); setPhase('paused'); phaseRef.current='paused'; }
  function resume() { if (recorder.current?.state !== 'paused') return; lastTick.current=performance.now();recorder.current.resume();setPhase('recording');phaseRef.current='recording'; }
  useEffect(()=>{alive.current=true;function hidden(){if(document.hidden && ['recording','paused'].includes(phaseRef.current)) stop();}document.addEventListener('visibilitychange',hidden);return()=>{alive.current=false;generation.current++;if(recorder.current?.state !== 'inactive') recorder.current?.stop();release();document.removeEventListener('visibilitychange',hidden);};},[]);
  return {phase,kind,stream,blob,duration,level,peaks,error,start,stop,pause,resume,cancel,send:()=>{if(blob && phase==='preview')void save(blob,kind,duration,generation.current);}};
}
