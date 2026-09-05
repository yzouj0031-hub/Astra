const assert=require('assert');
const {createRequire}=require('module');
const requireFrom=createRequire(__filename);
const playwright=requireFrom(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 const a=await browser.newPage({viewport:{width:900,height:700}}),b=await browser.newPage({viewport:{width:900,height:700}});
 try{
  await Promise.all([a.goto('http://127.0.0.1:8766/',{waitUntil:'domcontentloaded'}),b.goto('http://127.0.0.1:8766/',{waitUntil:'domcontentloaded'})]);
  await a.click('#online-button');await a.fill('#online-name','海风A');await a.click('#online-create');await a.waitForFunction(()=>!document.querySelector('#online-room').hidden,{timeout:25000});
  const code=(await a.textContent('#online-current-code')).trim();assert.match(code,/^[A-HJ-NP-Z2-9]{8}$/);
  await b.click('#online-button');await b.fill('#online-name','海风B');await b.fill('#online-room-code',code);await b.click('#online-join');await b.waitForFunction(()=>!document.querySelector('#online-room').hidden,{timeout:25000});
  await Promise.all([a.waitForFunction(()=>document.querySelector('#online-count').textContent==='2 人在线',{timeout:15000}),b.waitForFunction(()=>document.querySelector('#online-count').textContent==='2 人在线',{timeout:15000})]);
  await b.fill('#online-chat-input','真实频道收到吗');await b.click('#online-chat-send');await a.waitForFunction(()=>document.querySelector('#online-chat-log').textContent.includes('真实频道收到吗'),{timeout:10000});
  assert((await a.textContent('#online-peer-list')).includes('海风B'));assert((await b.textContent('#online-peer-list')).includes('海风A'));
  console.log(`Live Supabase Realtime: two isolated pages joined ${code}, presence and chat passed`);
 }finally{await Promise.allSettled([a.click('#online-leave'),b.click('#online-leave')]);await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
