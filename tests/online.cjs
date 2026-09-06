const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'online.js'),'utf8');
new vm.Script(source,{filename:'online.js'});
const sandbox={console,Uint8Array,URL,globalThis:null,location:{protocol:'file:',href:'file:///C:/Astra/index.html'}};sandbox.globalThis=sandbox;sandbox.window=sandbox;
vm.runInNewContext(source,sandbox);
const t=sandbox.AstraOnline._test;
assert.equal(t.normalizeRoomCode(' ab-01ioz9 '),'ABZ9');
assert.equal(t.generateRoomCode(Uint8Array.from([0,1,2,3,4,5,6,7])),'ABCDEFGH');
assert.equal(t.safeName('  <小\u0000明>  '),'小明');
assert.equal(t.safeMessage('  你好\n  星屿  '),'你好 星屿');
assert.deepEqual(JSON.parse(JSON.stringify(t.sanitizePose({x:1,y:2,z:3,heading:4,speed:5,kind:'drive',region:'harbor'}))),{x:1,y:2,z:3,heading:4,speed:5,kind:'drive',region:'harbor'});
assert.equal(t.sanitizePose({x:Infinity,y:2,z:3,heading:0,speed:0}),null);
for(const region of ['rainport','watertown','temple'])assert.equal(t.sanitizePose({x:12,y:0,z:8,heading:0,speed:3,region}).region,region,'Co-op keeps the journey region ID');
assert.equal(t.validPeer({id:'short',name:'A',pose:{x:0,y:0,z:0,heading:0,speed:0}}),null);
assert(t.validPeer({id:'abcdefgh',name:'A',color:7,pose:{x:0,y:0,z:0,heading:0,speed:0}}));
assert.equal(t.roomUrl('ABCDEFGH').href,'https://yzouj0031-hub.github.io/Astra/?room=ABCDEFGH');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const token of ['id="online-button"','id="online-dialog"','src="./online.js"','AstraOnline?.init','animateRemotePlayers(dt,t)'])assert(html.includes(token),`Missing online integration: ${token}`);
const server=fs.readFileSync(path.join(root,'scripts','serve.mjs'),'utf8');assert(server.includes("['/online.js'"),'Local server exposes the online client');
console.log('Online co-op: room validation, untrusted payload filtering, UI/world wiring and local serving passed');
assert.equal(t.validPeer({id:'abcdefgh',name:'A',color:.5,pose:{x:0,y:0,z:0,heading:0,speed:0}}).color,0);
assert.equal(t.validPeer({id:'abcdefgh',name:'A',color:Infinity,pose:{x:0,y:0,z:0,heading:0,speed:0}}).color,0);

const {createHarness,createHub}=require('./online-harness.cjs');
(async()=>{
 const hub=createHub(),a=createHarness(hub.lib,'A'),b=createHarness(hub.lib,'B');
 try{
  await a.join('ABCDEFGH');await b.join('ABCDEFGH');
  assert.equal(a.online.peerCount,1);assert.equal(b.online.peerCount,1);
  for(let i=0;i<30;i++){a.state.pose={...a.state.pose,x:640+i,speed:3};a.advance();}
  assert.equal(b.changes.at(-1).pose.x,669,'Second client receives movement without chat');
  const sent=hub.sent.length;a.advance(10);assert.equal(hub.sent.length,sent,'Broadcasts are rate-limited');
  hub.sync('astra-world:ABCDEFGH');assert.equal(b.changes.at(-1).pose.x,669,'Presence cannot rewind a moving peer');
  a.chat('hello');assert(b.nodes.get('online-chat-log').textContent.includes('hello'));
  const aChannel=hub.channels[0];await aChannel.status('CHANNEL_ERROR');
  assert.equal(a.nodes.get('online-button').dataset.online,'false');assert(a.nodes.get('online-chat-send').disabled);
  assert.equal(a.online.peerCount,0,'Disconnect clears stale remote avatars');
  const before=hub.sent.length;a.advance();a.chat('offline');assert.equal(hub.sent.length,before,'No broadcasts or chat while disconnected');
  a.state.pose={...a.state.pose,x:710};await aChannel.status('SUBSCRIBED');
  assert.equal(aChannel.tracks.length,2,'Every subscription registers presence again');
  assert.equal(aChannel.tracks[1].pose.x,710,'Reconnection announces current position');
  a.advance();assert.equal(b.changes.at(-1).pose.x,710);assert.equal(a.nodes.get('online-button').dataset.online,'true');
  await a.online.leave();assert.equal(b.online.peerCount,0,'Leaving removes the remote player');
  await a.join('JKLMNPQR');const count=a.changes.length;
  aChannel.emit('broadcast:pose',{payload:{id:'late_old_peer',name:'Old',color:0,pose:a.state.pose}});
  await aChannel.status('SUBSCRIBED');
  assert.equal(a.changes.length,count,'Late events from a departed room are ignored');assert.equal(a.online.roomCode,'JKLMNPQR');
  // An in-flight track must not revive a room after the user leaves it.
  const active=hub.channels.at(-1);await active.status('CHANNEL_ERROR');let finishTrack;
  active.track=()=>new Promise(resolve=>{finishTrack=resolve;});const reconnect=active.status('SUBSCRIBED');
  await a.online.leave();finishTrack('ok');await reconnect;
  assert.equal(a.online.roomCode,'');assert.equal(a.nodes.get('online-button').dataset.online,'false');
  // A failed presence registration cannot claim a successful connection.
  const failure=createHarness(hub.lib,'Failure');const pending=failure.join('RSTUVWXY');
  await Promise.resolve();hub.channels.at(-1).trackResult='error';await pending;
  assert.equal(failure.online.roomCode,'');assert.equal(failure.nodes.get('online-button').dataset.online,'false');
  console.log('Online lifecycle: two-client movement, throttling, membership changes, disconnect/reconnect, stale callbacks, leave races and registration failure passed');
 }finally{await Promise.allSettled([a.online.leave(),b.online.leave()]);}
})().catch(error=>{console.error(error);process.exitCode=1;});
