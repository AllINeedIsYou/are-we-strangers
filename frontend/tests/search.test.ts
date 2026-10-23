import test from 'node:test';
import assert from 'node:assert/strict';
import { findMessages, splitSearchText } from '../src/search.ts';
import type { Message } from '../src/domain.ts';
const messages: Message[] = [
 {id:'older',chatId:'mira',text:'Привет, как ты?',own:false,time:'12:00'},
 {id:'context',chatId:'mira',text:'Слушаю музыку',own:true,time:'12:01'},
 {id:'newer',chatId:'mira',text:'И тебе привет!',own:true,time:'12:02'},
 {id:'chapter',chatId:'mira',text:'Привет, новая глава',own:false,time:'12:03',kind:'chapter'},
];
test('search returns newest matches first while keeping the source conversation intact',()=>{
 const before=JSON.stringify(messages);
 assert.deepEqual(findMessages(messages,'  ПРИВЕТ  ').map(m=>m.id),['newer','older']);
 assert.equal(JSON.stringify(messages),before);
 assert.deepEqual(findMessages(messages,'   '),[]);
 assert.deepEqual(findMessages(messages,'нет такого слова'),[]);
});
test('search treats punctuation as literal text and preserves original case in highlights',()=>{
 assert.deepEqual(splitSearchText('C++ [a.b] и C++','C++').filter(p=>p.match).map(p=>p.text),['C++','C++']);
 assert.deepEqual(splitSearchText('abc a.b','a.b').filter(p=>p.match).map(p=>p.text),['a.b']);
 assert.deepEqual(splitSearchText('Привет и ПРИВЕТ!','привет').filter(p=>p.match).map(p=>p.text),['Привет','ПРИВЕТ']);
 const parts=splitSearchText('слово, СЛОВО и слово.','слово');
 assert.equal(parts.map(p=>p.text).join(''),'слово, СЛОВО и слово.');
 assert.equal(parts.filter(p=>p.match).length,3);
});
