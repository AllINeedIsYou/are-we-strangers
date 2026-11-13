import { useEffect,useRef,useState } from 'react';
import { Search,X } from 'lucide-react';
import type {Chat} from './domain';
export default function ForwardDialog({chats,count,busy,error,onClose,onForward}:{chats:Chat[];count:number;busy:boolean;error:string;onClose:()=>void;onForward:(chatId:string)=>void}){
 const ref=useRef<HTMLDialogElement>(null);const [search,setSearch]=useState('');
 useEffect(()=>{const dialog=ref.current!;dialog.showModal();dialog.querySelector('input')?.focus();return()=>dialog.close();},[]);
 const targets=chats.filter(chat=>chat.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')));
 return <dialog ref={ref} className="modal glass forward-dialog" aria-label="Переслать сообщения" onCancel={event=>{event.preventDefault();if(!busy)onClose();}} onClick={event=>{if(!busy&&event.target===ref.current)onClose();}}>
   <header><h2>Переслать{count>1?` · ${count}`:''}</h2><button className="icon-button" aria-label="Закрыть пересылку" disabled={busy} onClick={onClose}><X/></button></header>
   <label className="forward-search"><Search size={16}/><input autoFocus aria-label="Найти получателя" placeholder="Поиск" value={search} onChange={event=>setSearch(event.target.value)}/></label>
   {busy&&<p role="status" className="empty-search">Пересылаем…</p>}
   {error&&<p role="alert" className="inline-error">{error}</p>}
   <div className="forward-list">{targets.map(chat=><button className="forward-contact" key={chat.id} disabled={busy} onClick={()=>onForward(chat.id)}><span className="avatar">{chat.initial}</span><span><strong>{chat.name}</strong><small>{chat.online?'В сети':'был(а) недавно'}</small></span></button>)}{!targets.length&&<p className="empty-search">Никого не нашли</p>}</div>
 </dialog>;
}
