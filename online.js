(function(global){
'use strict';

const SUPABASE_URL='https://hnlsmcucmbicygzjfmuf.supabase.co';
const SUPABASE_KEY='sb_publishable_pz6eS_bYsKjinBPtLgLYxQ_CvUXIEUf';
const SUPABASE_CDN='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/dist/umd/supabase.min.js';
const ROOM_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_LENGTH=8;
const SEND_INTERVAL=120;
const MAX_PEERS=16;

function safeName(value){return String(value||'').replace(/[<>\u0000-\u001f\u007f]/g,'').trim().slice(0,18);}
function normalizeRoomCode(value){return String(value||'').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,'').slice(0,ROOM_LENGTH);}
function generateRoomCode(randomBytes){
 const bytes=randomBytes||global.crypto?.getRandomValues?.(new Uint8Array(ROOM_LENGTH));
 if(!bytes||bytes.length<ROOM_LENGTH)throw new Error('当前浏览器无法安全生成房间码');
 return Array.from(bytes).slice(0,ROOM_LENGTH).map(n=>ROOM_ALPHABET[n%ROOM_ALPHABET.length]).join('');
}
function finite(value,min,max){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):null;}
// 朝向要环绕，不能截断。车、船、飞机的 yaw 都是一路累加的
// （index.html: ship.yaw-=turn*dt / plane.yaw-=... / car.yaw=oldYaw+...），
// 朝一个方向连续转四十秒就超过 8π。以前这里 clamp 到 ±8π，超出之后
// 远端看到的朝向就永远卡死在那个角度上 —— 船还在转，别人看着不动。
function wrapAngle(value){const n=Number(value);if(!Number.isFinite(n))return null;const t=(n+Math.PI)%(Math.PI*2);return (t<0?t+Math.PI*2:t)-Math.PI;}
// 与 index.html 的 MODE 保持一致，外加游泳。少一个就会被悄悄改写成 walk：
// 飞机是后来加的（#3），当时忘了同步这张表。
const POSE_KINDS=new Set(['view','walk','swim','sail','fish','ride','drive','fly']);
const POSE_REGIONS=new Set(['island','park','harbor','all','rainport','watertown','temple']);
function sanitizePose(value){
 if(!value||typeof value!=='object')return null;
 const x=finite(value.x,-2200,2200),y=finite(value.y,-100,500),z=finite(value.z,-2200,2200),heading=wrapAngle(value.heading),speed=finite(value.speed,0,80);
 if([x,y,z,heading,speed].some(v=>v===null))return null;
 return {x,y,z,heading,speed,kind:POSE_KINDS.has(value.kind)?value.kind:'walk',region:POSE_REGIONS.has(value.region)?value.region:'island'};
}
function safeMessage(value){return String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,160);}
function validPeer(value){
 if(!value||typeof value!=='object')return null;
 const id=String(value.id||'');if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id))return null;
 const name=safeName(value.name),pose=sanitizePose(value.pose);if(!name||!pose)return null;
 const color=Number(value.color);
 return {id,name,color:Number.isFinite(color)?Math.abs(Math.trunc(color))%4:0,pose};
}
function sessionId(){return global.crypto?.randomUUID?.().replace(/-/g,'')||generateRoomCode(global.crypto?.getRandomValues?.(new Uint8Array(16))).toLowerCase()+Date.now().toString(36);}
function roomUrl(code){
 const base=global.location?.protocol==='file:'?'https://yzouj0031-hub.github.io/Astra/':global.location.href;
 const url=new URL(base);url.searchParams.set('room',code);return url;
}

function init(options={}){
 const doc=global.document;if(!doc)return null;
 const byId=id=>doc.getElementById(id);
 const ui={button:byId('online-button'),dialog:byId('online-dialog'),close:byId('online-close'),setup:byId('online-setup'),room:byId('online-room'),name:byId('online-name'),code:byId('online-room-code'),create:byId('online-create'),join:byId('online-join'),status:byId('online-status'),current:byId('online-current-code'),count:byId('online-count'),peers:byId('online-peer-list'),log:byId('online-chat-log'),input:byId('online-chat-input'),send:byId('online-chat-send'),copy:byId('online-copy'),leave:byId('online-leave')};
 if(Object.values(ui).some(x=>!x))return null;
 const id=sessionId(),peers=new Map();let client=null,channel=null,currentCode='',lastSent=0,loading=null,connection=null,generation=0,joining=false,activeName='';
 const color=Array.from(id).reduce((n,c)=>n+c.charCodeAt(0),0)%4;
 const setStatus=(message,bad=false)=>{ui.status.textContent=message;ui.status.style.color=bad?'#a44f4f':'#6e817c';};
 const setBusy=busy=>{ui.create.disabled=busy;ui.join.disabled=busy;};
 const ownName=()=>safeName(ui.name.value);
 // 进房时用的名字。之后每条 pose/chat 都带名字，而对方的 validPeer 遇到空名字
 // 会整条丢掉 —— 所以在房间里把名字框清空，本来会让自己在所有人眼里当场卡住
 // （还留在名单上，人却不动了）。改名仍然实时生效，清空则退回进房时的名字。
 const sendName=()=>ownName()||activeName;
 const openDialog=()=>{if(!ui.dialog.open)ui.dialog.showModal();};
 const ownPose=()=>sanitizePose(options.getPose?.());
 function appendChat(name,message,system=false){
  const line=doc.createElement('div');line.className='online-chat-line'+(system?' system':'');
  if(system)line.textContent=message;else{const b=doc.createElement('b');b.textContent=name+'：';line.appendChild(b);line.appendChild(doc.createTextNode(message));}
  ui.log.appendChild(line);while(ui.log.children.length>60)ui.log.firstChild.remove();ui.log.scrollTop=ui.log.scrollHeight;
 }
 function renderPeers(){
  ui.peers.textContent='';const all=[{id,name:sendName()||'我',color},...peers.values()];
  for(const peer of all.slice(0,MAX_PEERS)){
   const tag=doc.createElement('span');tag.className='online-peer';const dot=doc.createElement('i');dot.style.background=['#a95f68','#4f8587','#806696','#a88248'][peer.color%4];tag.appendChild(dot);tag.appendChild(doc.createTextNode(peer.id===id?peer.name+'（我）':peer.name));ui.peers.appendChild(tag);
  }
  ui.count.textContent=all.length+' 人在线';
 }
 function updatePeer(raw){const peer=validPeer(raw);if(!peer||peer.id===id)return;if(!peers.has(peer.id)&&peers.size>=MAX_PEERS-1)return;const previous=peers.get(peer.id);peers.set(peer.id,peer);options.onPeer?.(peer);if(!previous||previous.name!==peer.name||previous.color!==peer.color)renderPeers();}
 function clearPeers(){const old=[...peers.keys()];peers.clear();old.forEach(peerId=>options.onPeerLeave?.(peerId));renderPeers();}
 function syncPresence(){
  if(!channel)return;const present=new Set();const state=channel.presenceState?.()||{};
  // Presence owns membership. Its join-time pose must never overwrite a newer broadcast.
  for(const rows of Object.values(state))for(const row of Array.isArray(rows)?rows:[]){const peer=validPeer(row);if(peer&&peer.id!==id){present.add(peer.id);if(!peers.has(peer.id))updatePeer(peer);}}
  for(const peerId of [...peers.keys()])if(!present.has(peerId)){peers.delete(peerId);options.onPeerLeave?.(peerId);}
  renderPeers();
 }
 function loadSupabase(timeout=9000){
  if(global.supabase)return Promise.resolve(global.supabase);if(loading)return loading;
  loading=new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;resolve(global.supabase||null);};const script=doc.createElement('script');script.src=SUPABASE_CDN;script.async=true;script.onload=finish;script.onerror=finish;(doc.head||doc.documentElement).appendChild(script);global.setTimeout(finish,timeout);}).then(lib=>{if(!lib)loading=null;return lib;});return loading;
 }
 async function leave(silent=false){
  ++generation;const oldChannel=channel,oldConnection=connection;channel=null;connection=null;
  oldConnection?.cancel?.();clearPeers();
  currentCode='';activeName='';ui.room.hidden=true;ui.setup.hidden=false;ui.button.dataset.online='false';ui.button.textContent='◎ 联机';renderPeers();
  ui.send.disabled=true;
  try{if(global.location?.protocol!=='file:'){const url=new URL(global.location.href);url.searchParams.delete('room');global.history?.replaceState?.(null,'',url);}}catch(_){}
  if(!silent)setStatus('已离开房间，单机游玩不受影响。');
  if(oldChannel){try{await client?.removeChannel?.(oldChannel);}catch(_){}}
 }
 async function join(code){
  if(joining)return;
  const name=ownName(),roomCode=normalizeRoomCode(code);if(!name){setStatus('请先填写你的名字。',true);ui.name.focus();return;}if(roomCode.length!==ROOM_LENGTH){setStatus('房间码应为 8 位字母或数字。',true);ui.code.focus();return;}
  joining=true;setBusy(true);setStatus('正在连接星屿房间……');let request;
  try{
   if(channel)await leave(true);request=++generation;const lib=await loadSupabase();if(request!==generation)return;if(!lib)throw new Error('联机组件加载失败，请检查网络后重试');
   client=client||lib.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:12}}});
   currentCode=roomCode;channel=client.channel('astra-world:'+roomCode,{config:{broadcast:{self:false,ack:false},presence:{key:id}}});
   const session={channel,ready:false,epoch:0};connection=session;
   const isCurrent=()=>connection===session&&generation===request;
   const disconnected=()=>{session.ready=false;ui.button.dataset.online='false';ui.button.textContent='◌ 重连中';ui.send.disabled=true;clearPeers();ui.count.textContent='连接中断，正在重连…';};
   channel.on('presence',{event:'sync'},()=>{if(isCurrent()&&session.ready)syncPresence();}).on('broadcast',{event:'pose'},event=>{if(isCurrent()&&session.ready)updatePeer(event.payload);}).on('broadcast',{event:'chat'},event=>{if(!isCurrent()||!session.ready)return;const peer=validPeer(event.payload),message=safeMessage(event.payload?.message);if(peer&&message){updatePeer(peer);appendChat(peer.name,message);}});
   await new Promise((resolve,reject)=>{
    let settled=false;let timer;
    const settle=error=>{if(settled)return;settled=true;global.clearTimeout?.(timer);error?reject(error):resolve();};
    session.cancel=()=>settle(new Error('已离开房间'));
    timer=global.setTimeout(()=>settle(new Error('房间连接超时')),10000);
    channel.subscribe(async status=>{
     if(!isCurrent())return;const epoch=++session.epoch;
     if(status==='SUBSCRIBED'){
      session.ready=false;
      try{
       const pose=ownPose();if(!pose)throw new Error('当前角色位置还没有准备好');
       const result=await session.channel.track({id,name,color,pose});
       if(!isCurrent()||epoch!==session.epoch)return;
       if(result!=='ok')throw new Error('在线状态登记失败，请重新加入房间');
       session.ready=true;activeName=name;lastSent=-Infinity;ui.button.dataset.online='true';ui.button.textContent='● '+roomCode;ui.send.disabled=false;syncPresence();
       if(settled)appendChat('','已重新连接房间',true);
       settle();
      }catch(error){if(!isCurrent()||epoch!==session.epoch)return;if(!settled)settle(error);else{disconnected();ui.count.textContent='重连失败，请离开后重新加入';}}
     }else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
      disconnected();if(!settled)settle(new Error('房间连接失败：'+status));
     }
    });
   });
   if(!isCurrent())return;
   try{global.localStorage?.setItem('astra-online-name',name);}catch(_){}ui.current.textContent=roomCode;ui.setup.hidden=true;ui.room.hidden=false;ui.log.textContent='';appendChat('',`已进入房间 ${roomCode}`,true);renderPeers();
   try{if(global.location?.protocol!=='file:')global.history?.replaceState?.(null,'',roomUrl(roomCode));}catch(_){}
  }catch(error){if(request===generation){await leave(true);setStatus(error.message||String(error),true);}}finally{joining=false;setBusy(false);}
 }
 function sendPose(now){
  if(!connection?.ready||!channel||!currentCode||now-lastSent<SEND_INTERVAL)return;const pose=ownPose();if(!pose)return;lastSent=now;Promise.resolve(channel.send({type:'broadcast',event:'pose',payload:{id,name:sendName(),color,pose}})).catch(()=>{});
 }
 function sendChat(){const message=safeMessage(ui.input.value);if(!message||!channel||!connection?.ready)return;const pose=ownPose();if(!pose)return;const payload={id,name:sendName(),color,pose,message};Promise.resolve(channel.send({type:'broadcast',event:'chat',payload})).catch(()=>{});appendChat(payload.name,message);ui.input.value='';}
 async function copyInvite(){const url=roomUrl(currentCode);try{await global.navigator.clipboard.writeText(url.href);appendChat('','邀请链接已复制',true);}catch(_){global.prompt?.('复制这个邀请链接：',url.href);}}
 ui.button.onclick=()=>{openDialog();ui.button.setAttribute('aria-expanded','true');};ui.close.onclick=()=>ui.dialog.close();ui.dialog.addEventListener('close',()=>ui.button.setAttribute('aria-expanded','false'));
 ui.create.onclick=()=>{const code=generateRoomCode();ui.code.value=code;join(code);};ui.join.onclick=()=>join(ui.code.value);ui.leave.onclick=()=>leave();ui.copy.onclick=copyInvite;ui.send.onclick=sendChat;ui.input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();sendChat();}});ui.code.addEventListener('input',()=>ui.code.value=normalizeRoomCode(ui.code.value));
 try{ui.name.value=safeName(global.localStorage?.getItem('astra-online-name'))||'';}catch(_){}
 const invited=normalizeRoomCode(new URL(global.location.href).searchParams.get('room'));if(invited.length===ROOM_LENGTH){ui.code.value=invited;global.setTimeout(openDialog,350);}
 global.addEventListener?.('pagehide',()=>leave(true));
 return {update:(_dt,_t)=>sendPose(global.performance.now()),leave,get roomCode(){return currentCode;},get peerCount(){return peers.size;}};
}

global.AstraOnline={init,_test:{safeName,normalizeRoomCode,generateRoomCode,sanitizePose,safeMessage,validPeer,roomUrl}};
})(typeof window!=='undefined'?window:globalThis);
