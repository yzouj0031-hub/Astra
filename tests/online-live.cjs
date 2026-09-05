const assert=require('assert');
const {createClient}=require('@supabase/supabase-js');
const {createHarness}=require('./online-harness.cjs');
const clients=[],sockets=[];
const lib={createClient(url,key,options){
 const index=clients.length;
 class TestSocket extends WebSocket{constructor(...args){super(...args);sockets[index]=this;}}
 const client=createClient(url,key,{...options,realtime:{...options.realtime,transport:TestSocket}});clients.push(client);return client;
}};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,message,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(check())return;await sleep(80);}throw new Error(message);}
(async()=>{
 const a=createHarness(lib,'Network Test A'),b=createHarness(lib,'Network Test B'),room=a.context.AstraOnline._test.generateRoomCode();
 try{
  await a.join(room);assert.equal(a.online.roomCode,room,a.nodes.get('online-status').textContent);
  await b.join(room);assert.equal(b.online.roomCode,room,b.nodes.get('online-status').textContent);
  await until(()=>a.online.peerCount===1&&b.online.peerCount===1,'Both clients must discover each other');
  for(let i=0;i<6;i++){a.state.pose={...a.state.pose,x:660+i,speed:3};a.advance();await sleep(160);}
  await until(()=>b.changes.some(p=>p.pose.x===665),'Movement must arrive without a chat message');
  assert(new Set(b.changes.map(p=>p.pose.x).filter(x=>x>=660&&x<=665)).size>=4,'Several distinct movement updates reach the second client');
  b.chat('isolated test room');await until(()=>a.nodes.get('online-chat-log').textContent.includes('isolated test room'),'Chat must arrive');
  sockets[0].close(4000,'Exercise reconnect');
  await until(()=>a.nodes.get('online-button').dataset.online==='false','Disconnect must be visible');
  a.state.pose={...a.state.pose,x:720};
  await until(()=>a.nodes.get('online-button').dataset.online==='true'&&b.online.peerCount===1,'Reconnect must register presence again',30000);
  a.advance();await until(()=>b.changes.some(p=>p.pose.x===720),'Movement must resume after reconnect');
  await a.online.leave();await until(()=>b.online.peerCount===0,'Departure must remove the remote peer');
  console.log('Live Supabase: two isolated clients, repeated movement broadcasts, chat, real socket interruption/reconnection and departure passed.');
 }finally{
  await Promise.allSettled([a.online.leave(),b.online.leave()]);
  for(const client of clients)client.realtime.disconnect();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
