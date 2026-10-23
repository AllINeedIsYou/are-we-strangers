import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, BellOff, BookOpen, Bookmark, ChevronRight, Clock3, Copy, Check, File, Image, Link, MessageCircle, Mic, Phone, Search, UserRound, Video, X } from 'lucide-react';
import Avatar from './Avatar';
import MediaView, { useMediaURL } from './MediaView';
import type { Chat, DemoState, MediaAsset } from './domain';

type ProfileTab = 'media' | 'files' | 'links' | 'voice' | 'gif';
type StoryTab = 'moments' | 'questions' | 'chapters';
const tabs: [ProfileTab, string][] = [['media','Медиа'],['files','Файлы'],['links','Ссылки'],['voice','Голосовые'],['gif','GIF']];

function MediaTile({asset,onOpen}:{asset:MediaAsset;onOpen:()=>void}) {
  const {url,missing}=useMediaURL(asset.id);
  return <button className="profile-media-tile" onClick={onOpen} aria-label={`Открыть: ${asset.name}`}>
    {url ? asset.kind==='photo'?<img src={url} alt="" loading="lazy"/>:<video src={url} muted playsInline preload="metadata"/> : <Image/>}
    {asset.kind!=='photo'&&<span><Video size={13}/>{asset.duration?`${Math.floor(asset.duration/60)}:${String(Math.floor(asset.duration%60)).padStart(2,'0')}`:'Видео'}</span>}
    {missing&&<small>Файл недоступен</small>}
  </button>;
}
function MediaPreview({asset,onClose}:{asset:MediaAsset;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=dialog.current!;node.showModal();return()=>node.close();},[]);
  return <dialog ref={dialog} className="profile-media-preview glass" aria-label={asset.name} onCancel={onClose} onClick={e=>{if(e.target===dialog.current)onClose();}}><header><span>{asset.name}</span><button aria-label="Закрыть медиа" onClick={onClose}><X/></button></header><MediaView asset={asset}/></dialog>;
}
export default function ContactProfile({open,chat,state,onClose,onStory,onCall,onSearch}:{open:boolean;chat:Chat;state:DemoState;onClose:()=>void;onStory:(tab:StoryTab)=>void;onCall:()=>void;onSearch:()=>void}) {
  const [tab,setTab]=useState<ProfileTab>('media');
  const [details,setDetails]=useState<'about'|'story'>('about');
  const [compact,setCompact]=useState(false);
  const [preview,setPreview]=useState<MediaAsset|null>(null);
  const [muted,setMuted]=useState(()=>{try{return localStorage.getItem(`aws.muted.${chat.id}`)==='true';}catch{return false;}});
  const back=useRef<HTMLButtonElement>(null);
  const scroller=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(open){const frame=requestAnimationFrame(()=>back.current?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);}},[open]);
  const messages=state.messages.filter(message=>message.chatId===chat.id&&!message.kind);
  const assets=Array.from(new Map(messages.flatMap(message=>message.media||[]).map(asset=>[asset.id,asset])).values());
  const isGif=(asset:MediaAsset)=>asset.mime==='image/gif';
  const displayed=assets.filter(asset=>tab==='media'?['photo','video','circle'].includes(asset.kind)&&!isGif(asset):tab==='files'?asset.kind==='file':tab==='voice'?asset.kind==='voice':tab==='gif'?isGif(asset):false);
  const links=Array.from(new Set(messages.flatMap(message=>message.text.match(/https?:\/\/[^\s<>]+/g)||[]))).map(url=>url.replace(/[.,!?;]+$/,''));
  const momentCount=state.moments.filter(moment=>moment.chatId===chat.id).length;
  const chapterCount=state.chapters.filter(chapter=>chapter.chatId===chat.id).length;
  const status=chat.online?'В сети':'был(а) недавно';
  function toggleMute(){setMuted(value=>{const next=!value;try{localStorage.setItem(`aws.muted.${chat.id}`,String(next));}catch{/* Session preference still works. */}return next;});}
  return <section className={`contact-profile ${open?'profile-open':''} ${compact?'profile-compact':''}`} aria-label={`Профиль: ${chat.name}`} inert={!open}>
    <div ref={scroller} className="profile-scroll" onScroll={event=>setCompact(event.currentTarget.scrollTop>130)}>
      <header className="profile-topbar"><button ref={back} className="glass" aria-label="Назад к переписке" onClick={onClose}><ArrowLeft/></button><div className="profile-compact-name" aria-hidden={!compact}><strong>{chat.name}</strong><small>{status}</small></div><button className="glass" aria-label="Поиск в этом чате" onClick={onSearch}><Search/></button></header>
      <div className="profile-content">
        <div className="profile-hero" aria-hidden={compact}><Avatar initial={chat.initial} asset={chat.avatar}/><h1>{chat.name}</h1><p className={chat.online?'online':''}>{status}</p></div>
        <nav className="profile-actions" aria-label="Действия с собеседником">
          <button onClick={onClose}><MessageCircle/><span>Чат</span></button><button onClick={onCall}><Phone/><span>Звонок</span></button><button onClick={onCall}><Video/><span>Видео</span></button><button onClick={toggleMute} aria-pressed={muted}>{muted?<BellOff/>:<Bell/>}<span>{muted?'Выключены':'Уведомления'}</span></button>
        </nav>
        <section className={`profile-details details-${details}`} aria-label="О собеседнике и ваша история">
          <div className="profile-details-tabs" role="tablist" aria-label="Раздел профиля"><span className="details-tab-indicator" aria-hidden="true"/>{([['about','О человеке'],['story','Ваша история']] as const).map(([key,label])=><button key={key} id={`details-tab-${key}`} role="tab" aria-selected={details===key} aria-controls={`details-panel-${key}`} tabIndex={details===key?0:-1} onClick={()=>setDetails(key)} onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();const next=key==='about'?'story':'about';setDetails(next);document.getElementById(`details-tab-${next}`)?.focus();}}}>{key==='about'?<UserRound/>:<svg className="story-tab-star" viewBox="0 0 60 108" aria-hidden="true"><path fill="currentColor" d="M30 0C28 46 27 51 0 54C27 57 28 62 30 108C32 62 33 57 60 54C33 51 32 46 30 0Z"/></svg>}<span>{label}</span>{key==='story'&&momentCount+chapterCount>0&&<i aria-hidden="true"/>}</button>)}</div>
          <div className="profile-details-panels">
            <div id="details-panel-about" className={`profile-about details-pane ${details==='about'?'details-pane-active':''}`} role="tabpanel" aria-labelledby="details-tab-about" aria-hidden={details!=='about'} inert={details!=='about'}>
              <ProfileField label="Имя пользователя" value={chat.username?`@${chat.username.replace(/^@/,'')}`:undefined} empty="Не указано" copyable/>
              <ProfileField label="Номер телефона" value={chat.phone} empty="Не указан" copyable/>
              <ProfileField label="День рождения" value={chat.birthday} empty="Не указан"/>
              <ProfileField label="О себе" value={chat.bio} empty="Пока ничего не добавлено"/>
            </div>
            <div id="details-panel-story" className={`profile-story details-pane ${details==='story'?'details-pane-active':''}`} role="tabpanel" aria-labelledby="details-tab-story" aria-hidden={details!=='story'} inert={details!=='story'}>
              <p className="details-story-intro">То, что делает вас ближе</p>
              <button onClick={()=>onStory('moments')}><Bookmark/><span><strong>История чата</strong><small>{momentCount?`Сохранённые моменты · ${momentCount}`:'Сохранённые моменты'}</small></span><ChevronRight/></button>
              <button onClick={()=>onStory('chapters')}><BookOpen/><span><strong>Главы</strong><small>{chapterCount?`Ваши новые начала · ${chapterCount}`:'Новые начала вашей истории'}</small></span><ChevronRight/></button>
              <button onClick={()=>onStory('questions')}><Clock3/><span><strong>Вопросы в будущее</strong><small>Один вопрос. Два ответа.</small></span><ChevronRight/></button>
            </div>
          </div>
        </section>
        <div className="profile-tabs" role="tablist" aria-label="Материалы переписки">{tabs.map(([key,label])=><button key={key} id={`profile-tab-${key}`} role="tab" aria-selected={key===tab} aria-controls="profile-tab-content" tabIndex={key===tab?0:-1} onClick={()=>setTab(key)} onKeyDown={event=>{const index=tabs.findIndex(([item])=>item===tab);if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();const next=tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length][0];setTab(next);document.getElementById(`profile-tab-${next}`)?.focus();}}}>{label}</button>)}</div>
        <div key={tab} id="profile-tab-content" className="profile-tab-content" role="tabpanel" aria-labelledby={`profile-tab-${tab}`}>
          {tab==='links'?links.length?<div className="profile-links">{links.map(url=><a href={url} key={url} target="_blank" rel="noopener noreferrer"><Link/><span>{url}</span><ChevronRight/></a>)}</div>:<ProfileEmpty icon="links" text="Здесь будут ссылки из переписки"/>:displayed.length?<div className={tab==='media'||tab==='gif'?'profile-media-grid':'profile-files'}>{displayed.map(asset=>tab==='media'||tab==='gif'?<MediaTile key={asset.id} asset={asset} onOpen={()=>setPreview(asset)}/>:<div key={asset.id}><MediaView asset={asset}/></div>)}</div>:<ProfileEmpty icon={tab} text={tab==='voice'?'Здесь будут голосовые сообщения':tab==='files'?'Здесь будут файлы из переписки':tab==='gif'?'Здесь будут GIF из переписки':'Здесь будут ваши фотографии и видео'}/>}
        </div>
      </div>
    </div>
    {preview&&<MediaPreview asset={preview} onClose={()=>setPreview(null)}/>}
  </section>;
}
function ProfileEmpty({icon,text}:{icon:ProfileTab;text:string}){const Icon=icon==='voice'?Mic:icon==='files'?File:icon==='links'?Link:Image;return <div className="profile-empty"><Icon/><p>{text}</p></div>;}

function ProfileField({label,value,empty,copyable=false}:{label:string;value?:string;empty:string;copyable?:boolean}){
  const [copied,setCopied]=useState(false);
  const [copyError,setCopyError]=useState(false);
  const reset=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(reset.current)clearTimeout(reset.current);},[]);
  async function copy(){
    if(!value)return;
    try{await navigator.clipboard.writeText(value);setCopied(true);setCopyError(false);if(reset.current)clearTimeout(reset.current);reset.current=setTimeout(()=>setCopied(false),1800);}
    catch{setCopyError(true);}
  }
  return <div className="profile-field"><div><span className="profile-field-label">{label}</span><p className={value?'':'profile-field-empty'}>{value||empty}</p>{copyError&&<small role="alert">Не удалось скопировать. Можно выделить текст.</small>}</div>{copyable&&value&&<button aria-label={copied?`Скопировано: ${label}`:`Копировать: ${label}`} onClick={()=>void copy()}>{copied?<Check/>:<Copy/>}</button>}</div>;
}
