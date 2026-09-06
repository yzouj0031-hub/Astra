(function(root){
'use strict';
const C=root.AstraJourneyCore;
root.AstraRegionFactories=root.AstraRegionFactories||{};
const loads=new Map();
function loadScript(src){
 if(loads.has(src))return loads.get(src);
 const p=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>{s.remove();loads.delete(src);reject(new Error('地区文件未能加载，请检查网络后重试。'));};document.head.appendChild(s);});loads.set(src,p);return p;
}
function disposeScene(scene){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);if(m.uniforms)for(const u of Object.values(m.uniforms))if(u.value?.isTexture)textures.add(u.value);}if(o.shadow?.map)o.shadow.map.dispose();});
 textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());scene.clear();
}
function init(host){
 const T=root.THREE,renderer=host.renderer,canvas=renderer.domElement;
 const mobile=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
 let storage;try{storage=localStorage;}catch{storage={getItem:()=>null,setItem:()=>{}};}
 const progress=C.readProgress(storage),peerData=new Map(),peerModels=new Map();
 let active=null,busy=false,returnState=null,noteUntil=0,time=0,frameCount=0,frameTime=0,lowFrames=0,quality=1,savedRender=null;
 let context=null,joystickId=null,runId=null,lookId=null,lastLook=null,input={x:0,z:0,run:false},stick={x:0,z:0},keys=new Set();
 let audio=null,ambient=null,soundOn=false,blobURL=null;
 const ui=document.createElement('div');ui.id='journey-shell';ui.innerHTML=`
 <dialog id="journey-dialog" aria-labelledby="journey-map-title">
  <div class="journey-map-head"><div><span class="journey-kicker">ASTRA / A JOURNEY BETWEEN SHORES</span><h2 id="journey-map-title">下一站，去哪里？</h2></div><button id="journey-close" aria-label="关闭旅行地图">×</button></div>
  <p>沿海听一夜电车，再循水路入古镇。山上的守卫，等一位远来的旅人。</p>
  <svg class="journey-route" viewBox="0 0 760 128" role="img" aria-label="旅行路线：静屿和星辉乐园、维多利亚港、雨港、烟雨渡、静山寺"><path d="M50 75 Q120 15 200 65 T360 65 Q450 125 520 65 T700 40"/><circle cx="50" cy="75" r="4"/><circle cx="200" cy="65" r="4"/><circle cx="360" cy="65" r="4"/><circle cx="520" cy="65" r="4"/><circle cx="700" cy="40" r="4"/><text x="15" y="109">静屿 · 乐园</text><text x="167" y="96">维多利亚港</text><text x="342" y="34">雨港</text><text x="498" y="99">烟雨渡</text><text x="680" y="73">静山寺</text></svg>
  <div class="journey-cards">${Object.entries(C.REGIONS).map(([id,r],i)=>`<button class="journey-card" data-place="${id}" id="journey-travel-${id}"><span class="journey-number">0${i+1} /</span><em id="journey-visited-${id}">初次抵达</em><strong>${r.name}</strong><small>${r.subtitle}</small></button>`).join('')}</div>
  <div class="journey-old"><button data-home="island">回静屿</button><button data-home="park">星辉乐园</button><button data-home="harbor">维多利亚港</button><button id="journey-return">返回出发位置</button></div>
  <div class="journey-passport"><b id="journey-progress">沿途留印</b>${[['market','夜市寻灯'],['tea','茶馆听雨'],['boat','泛舟一程'],['warden','山门玉印']].map(([id,label])=>`<span class="journey-stamp" id="journey-stamp-${id}">${label}</span>`).join('')}</div>
  <p id="journey-map-status" style="font-size:11px">进入地区后按 M 打开旅行地图。旅程印记保存在本机。</p>
 </dialog>
 <div id="journey-loading" hidden role="status"><b>正在靠岸</b><small>为你点亮下一站的灯。</small></div>
 <section id="journey-hud" hidden aria-label="旅行操作">
  <div class="journey-title"><span class="journey-kicker">ASTRA / SHORE TO SHORE</span><h1 id="journey-title"></h1><p id="journey-description"></p></div>
  <div class="journey-tools"><button id="journey-map">旅行地图 · M</button><button id="journey-home">返航</button><button id="journey-weather">停雨</button><button id="journey-day">换个时辰</button><button id="journey-view">俯瞰</button><button id="journey-sound">声音</button><button id="journey-photo">明信片</button><button id="journey-online">同游</button></div>
  <div id="journey-stops" class="journey-guide" aria-label="地区导览"></div>
  <canvas id="journey-compass" width="290" height="290" aria-label="当前地区地图、目的地与玩家位置"></canvas>
  <div id="journey-note" role="status" aria-live="polite"></div>
  <div id="journey-joy" role="group" aria-label="拖动摇杆移动"><div id="journey-stick"></div></div><button id="journey-run">按住快跑</button>
  <div class="journey-bottom"><span id="journey-controls">WASD 移动 · 拖动环顾 · V 第一人称</span><button id="journey-action" hidden></button></div>
  <div id="journey-combat"><label>体力 <span id="journey-hp-text">100</span></label><div class="journey-meter"><i id="journey-health"></i></div><label>耐力 <span id="journey-potions">药葫芦 3</span></label><div class="journey-meter"><i id="journey-stamina"></i></div><label>石玉守卫 <span id="journey-phase">一阶段</span></label><div class="journey-meter"><i id="journey-boss"></i></div></div>
  <div id="journey-combat-actions"><button data-combat="attack">轻击 J</button><button data-combat="heavy">重击 K</button><button data-combat="dodge">闪避 ␣</button><button data-combat="bind">定身 Q</button><button data-combat="heal">喝药 R</button></div>
 </section>`;
 document.body.appendChild(ui);
 const $=id=>document.getElementById(id),book=$('journey-dialog'),hud=$('journey-hud');
 const button=document.createElement('button');button.id='journey-open';button.textContent='旅行地图 ↗';button.onclick=openMap;document.getElementById('world-regions').appendChild(button);
 hud.classList.toggle('journey-touch',mobile);
 function notify(text,duration=4.5){$('journey-note').textContent=text;$('journey-note').classList.add('show');noteUntil=time+duration;}
 function updateBook(){
  for(const id of Object.keys(C.REGIONS))$('journey-visited-'+id).textContent=active?.id===id?'正在此地':progress.visited.includes(id)?'再次启程 ↗':'初次抵达 ↗';
  for(const id of ['market','tea','boat','warden'])$('journey-stamp-'+id).classList.toggle('done',progress.stamps.includes(id));
  $('journey-progress').textContent=`旅行印记 ${progress.stamps.length} / 4`;
  $('journey-return').hidden=!active;
 }
 function stamp(id){if(progress.stamps.includes(id))return;progress.stamps.push(id);C.saveProgress(storage,progress);updateBook();notify('旅行册添了一枚印记：'+{market:'夜市寻灯',tea:'茶馆听雨',boat:'泛舟一程',warden:'山门玉印'}[id]);}
 function clear(){keys.clear();stick.x=stick.z=0;input={x:0,z:0,run:false};joystickId=runId=lookId=null;lastLook=null;$('journey-stick').style.transform='';host.clearInput();}
 function openMap(){clear();updateBook();if(!book.open)book.showModal();updateAudio();}
 function savePosition(){if(active&&!active.transport&&!active.fighting){progress.positions[active.id]={x:active.pos.x,z:active.pos.z};C.saveProgress(storage,progress);}}
 function address(id){try{const u=new URL(location.href);if(id)u.searchParams.set('journey',id);else u.searchParams.delete('journey');history.replaceState(null,'',u);}catch{}}
 function detach(){
  if(!active)return;savePosition();active.deactivate();
  active.weapon?.parent?.remove(active.weapon);
  host.avatar.g.removeFromParent?host.avatar.g.removeFromParent():host.avatar.g.parent?.remove(host.avatar.g);
  for(const a of peerModels.values())a.g.parent?.remove(a.g);
  disposeScene(active.scene);active=null;
 }
 async function travel(id){
  if(!C.REGIONS[id]||busy)return;
  if(active?.id===id){book.close();return;}
  busy=true;clear();$('journey-loading').hidden=false;book.close();
  try{
   if(id==='temple'&&!root.AstraCombat)await loadScript('journeys/combat.js');
   if(!root.AstraRegionFactories[id])await loadScript('journeys/'+id+'.js');
   // Build before replacing the old scene: a failed load leaves the previous region playable.
   const next=root.AstraCreateRegion(T,id,{mobile,progress,notify,stamp,travel});
   next.restore(progress.positions[id]);
   if(!returnState){returnState=host.capture();savedRender={toneMapping:renderer.toneMapping,toneMappingExposure:renderer.toneMappingExposure,outputEncoding:renderer.outputEncoding,physicallyCorrectLights:renderer.physicallyCorrectLights,shadow:renderer.shadowMap.enabled,shadowType:renderer.shadowMap.type,pixelRatio:renderer.getPixelRatio()};host.suspend();}
   detach();active=next;quality=1;lowFrames=0;frameCount=frameTime=0;
   if(!progress.visited.includes(id))progress.visited.push(id);C.saveProgress(storage,progress);
   document.body.dataset.journey=id;hud.hidden=false;address(id);
   renderer.physicallyCorrectLights=false;renderer.outputEncoding=id==='watertown'?T.LinearEncoding:T.sRGBEncoding;renderer.toneMapping=id==='watertown'?T.NoToneMapping:T.ACESFilmicToneMapping;renderer.toneMappingExposure=id==='temple'?1.05:1.2;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
   renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.25:1.5));renderer.setSize(innerWidth,innerHeight);
   active.scene.add(host.avatar.g);host.avatar.g.visible=true;host.avatar.g.scale.setScalar(1);
   if(id==='temple'){active.weapon=active.world.hero.weapon.clone(true);active.weapon.position.set(0,-.28,.12);active.weapon.visible=false;host.avatar.arms[1].elbow.add(active.weapon);}
   $('journey-title').textContent=next.meta.name;$('journey-description').textContent=next.meta.subtitle;
   $('journey-weather').hidden=id==='temple';$('journey-weather').textContent=next.rain?'停雨':'落雨';
   $('journey-stops').textContent='';
   for(const stop of next.meta.stops){const b=document.createElement('button');b.textContent=stop[1];b.onclick=()=>{clear();active.place(stop);};$('journey-stops').appendChild(b);}
   if(id==='temple'&&next.world.completed){const b=document.createElement('button');b.textContent='入寺参观';b.onclick=()=>active.place(['temple','静山寺',0,-20]);$('journey-stops').appendChild(b);}
   active.yaw=id==='watertown'?Math.PI/2:0;resize();updateCamera(1);updateBook();updateAudio();
   notify(id==='temple'?'庭院里的石玉守卫正等着你。走近它按 E 开始试炼。':id==='watertown'?'你到了烟雨渡。乌篷船停在渡口，茶馆在东边的广场。':'你到了雨港。沿河走向夜市，或到电车站乘车。',6);
  }catch(error){console.error('[Astra journeys]',error);$('journey-map-status').textContent=error.message||'这趟航程暂时没有完成，请重试。';openMap();}
  finally{busy=false;$('journey-loading').hidden=true;}
 }
 function home(where){
  if(busy)return;clear();book.close();detach();delete document.body.dataset.journey;hud.hidden=true;hud.classList.remove('journey-fighting');
  if(savedRender){const {shadow,shadowType,pixelRatio,...settings}=savedRender;Object.assign(renderer,settings);renderer.shadowMap.enabled=shadow;renderer.shadowMap.type=shadowType;renderer.setPixelRatio(pixelRatio);renderer.setSize(innerWidth,innerHeight);savedRender=null;}
  if(returnState){host.restore(returnState);returnState=null;}
  if(where)host.goHome(where);address(null);updateAudio();
 }
 function resize(){if(!active)return;const cam=active.camera;cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
 function safeCamera(anchor,wanted){
  const d=new T.Vector3().subVectors(wanted,anchor),length=d.length();if(length<.001)return wanted;
  d.normalize();const ray=new T.Ray(anchor,d),box=new T.Box3(),hit=new T.Vector3();let safe=length;
  for(const r of active.solids){box.min.set(r.minX-.15,-1,r.minZ-.15);box.max.set(r.maxX+.15,r.height||20,r.maxZ+.15);if(box.containsPoint(anchor)){safe=0;break;}if(ray.intersectBox(box,hit))safe=Math.min(safe,Math.max(0,hit.distanceTo(anchor)-.2));}
  return anchor.clone().addScaledVector(d,safe);
 }
 function updateCamera(dt){
  if(!active)return;const r=active,p=r.pos,cam=r.camera;
  let target=new T.Vector3(p.x,p.y+1.6,p.z),desired;
  if(r.overview){const b=r.bounds;target.set((b[0]+b[1])/2,0,(b[2]+b[3])/2);const d=r.id==='watertown'?180:r.id==='rainport'?105:48;desired=target.clone().add(new T.Vector3(Math.sin(r.yaw)*d,d*.8,Math.cos(r.yaw)*d));}
  else if(r.firstPerson&&!r.fighting&&!r.transport){desired=target.clone();target.add(new T.Vector3(-Math.sin(r.yaw)*Math.cos(r.pitch),-Math.sin(r.pitch),-Math.cos(r.yaw)*Math.cos(r.pitch)));}
  else{
   if(r.fighting){const b=r.world.game.boss;target.x+=C.clamp((b.x-p.x)*.22,-2.5,2.5);target.z+=C.clamp((b.z-p.z)*.22,-2.5,2.5);}
   const d=r.transport?11:r.fighting?9:r.distance;
   desired=target.clone().add(new T.Vector3(Math.sin(r.yaw)*Math.cos(r.pitch)*d,Math.sin(r.pitch)*d+.4,Math.cos(r.yaw)*Math.cos(r.pitch)*d));
   desired=safeCamera(target,desired);desired.y=Math.max(desired.y,active.ground(desired.x,desired.z)+.35);
  }
  // Only smooth unobstructed positions; never interpolate back through the wall just avoided.
  if(r.cameraReady&&!r.firstPerson){const smooth=cam.position.clone().lerp(desired,1-Math.exp(-dt*12));cam.position.copy(r.overview?smooth:safeCamera(target,smooth));}else cam.position.copy(desired);
  cam.lookAt(target);r.cameraReady=true;
  if(r.id==='watertown')r.world.skyGroup.position.copy(cam.position);
 }
 function poseAvatar(a,pos,dt,t){
  a.g.position.set(pos.x,pos.y||0,pos.z);const d=Math.atan2(Math.sin(pos.heading-a.g.rotation.y),Math.cos(pos.heading-a.g.rotation.y));a.g.rotation.y+=d*Math.min(1,dt*12);
  const gait=C.clamp(pos.speed/5,0,1),s=Math.sin(t*10)*.65*gait;
  for(let i=0;i<2;i++){a.legs[i].pivot.rotation.x=i?s:-s;a.legs[i].knee.rotation.x=Math.max(0,i?-s:s)*.9;a.arms[i].pivot.rotation.x=i?-s*.65:s*.65;a.arms[i].pivot.rotation.z=0;a.arms[i].elbow.rotation.x=-.15;}
  a.body.position.y=Math.abs(Math.sin(t*10))*.045*gait;a.body.rotation.set(0,0,0);
 }
 function updatePeers(dt){
  for(const [id,peer] of peerData){
   let model=peerModels.get(id);
   if(peer.pose.region!==active.id){if(model)model.g.visible=false;continue;}
   if(!model){model=host.makePeer(peer);peerModels.set(id,model);}
   if(model.g.parent!==active.scene)active.scene.add(model.g);
   if(!model.g.visible||model.g.position.distanceTo(new T.Vector3(peer.pose.x,peer.pose.y,peer.pose.z))>20)model.g.position.set(peer.pose.x,peer.pose.y,peer.pose.z);
   const p=model.g.position.clone().lerp(new T.Vector3(peer.pose.x,peer.pose.y,peer.pose.z),Math.min(1,dt*10));model.g.visible=true;poseAvatar(model,{x:p.x,y:p.y,z:p.z,heading:peer.pose.heading,speed:peer.pose.speed},dt,time);
  }
 }
 function minimap(){
  if(!active)return;const ctx=$('journey-compass').getContext('2d'),r=active,b=r.bounds,p=r.pos,w=290,h=290;
  ctx.clearRect(0,0,w,h);ctx.save();ctx.beginPath();ctx.arc(145,145,141,0,Math.PI*2);ctx.clip();ctx.fillStyle='#112b35';ctx.fillRect(0,0,w,h);
  const sx=250/(b[1]-b[0]),sz=250/(b[3]-b[2]),scale=Math.min(sx,sz),ox=145-(b[0]+b[1])/2*scale,oz=145-(b[2]+b[3])/2*scale;
  ctx.translate(ox,oz);ctx.scale(scale,scale);ctx.fillStyle='#607b73';for(const a of r.solids)ctx.fillRect(a.minX,a.minZ,a.maxX-a.minX,a.maxZ-a.minZ);
  ctx.strokeStyle='#caaf76';ctx.lineWidth=1/scale;for(const stop of r.meta.stops){ctx.beginPath();ctx.arc(stop[2],stop[3],3/scale,0,Math.PI*2);ctx.stroke();}
  ctx.fillStyle='#ffe4a2';ctx.beginPath();ctx.arc(p.x,p.z,4/scale,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffe4a2';ctx.beginPath();ctx.moveTo(p.x,p.z);ctx.lineTo(p.x+Math.sin(p.heading)*9/scale,p.z+Math.cos(p.heading)*9/scale);ctx.stroke();ctx.restore();ctx.fillStyle='#d6d9b9';ctx.font='16px sans-serif';ctx.textAlign='center';ctx.fillText('北',145,24);
 }
 function frame(dt){
  if(busy){if(active)renderer.render(active.scene,active.camera);else host.renderMain();return true;}
  if(!active)return false;time+=dt;
  if(!document.querySelector('dialog[open]')){
   input.x=stick.x+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
   input.z=stick.z+(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0);
   const length=Math.hypot(input.x,input.z);if(length>1){input.x/=length;input.z/=length;}input.run=runId!==null||keys.has('ShiftLeft')||keys.has('ShiftRight');
   active.update(dt,input);updateCamera(dt);updatePeers(dt);
  }
  poseAvatar(host.avatar,active.pos,dt,time);host.avatar.g.visible=!(active.firstPerson&&!active.overview)&&(!active.transport||active.id==='watertown');
  if(active.weapon)active.weapon.visible=active.fighting;
  if(active.fighting){
   const a=host.avatar,p=active.world.game.player,f=C.clamp(p.actionTime/(p.duration||1),0,1),swing=Math.sin(f*Math.PI);
   a.g.rotation.y=p.face;a.arms[1].pivot.rotation.x=-.3;a.arms[1].elbow.rotation.x=-.2;active.weapon.rotation.set(.08,0,-.16);
   if(p.action==='attack'){a.body.rotation.y=Math.sin(f*Math.PI*2)*.65;a.arms[1].pivot.rotation.z=-1+swing*2.1;a.arms[1].pivot.rotation.x=-.5-swing*.4;active.weapon.rotation.z=1.45;}
   else if(p.action==='heavy'){a.arms[1].pivot.rotation.x=-2.6+swing*1.9;a.arms[0].pivot.rotation.x=-1.7;a.body.rotation.x=-.15+swing*.3;active.weapon.rotation.x=-.4+f*2.8;}
   else if(p.action==='dodge'){a.body.rotation.x=-swing*.9;a.legs[0].pivot.rotation.x=-.7;a.legs[1].pivot.rotation.x=.9;}
   else if(p.action==='heal'){a.arms[0].pivot.rotation.x=-2.4;}
  }else host.avatar.arms.forEach(a=>a.pivot.rotation.z=0);
  if(active.transport&&active.id==='watertown'){host.avatar.g.position.y=active.pos.y;host.avatar.legs.forEach(l=>l.pivot.rotation.x=-1.2);}
  context=active.context();$('journey-action').hidden=!context;$('journey-action').textContent=context?.label||'';
  hud.classList.toggle('journey-fighting',active.fighting);
  $('journey-view').textContent=active.overview?'回到地面':'俯瞰';$('journey-view').disabled=active.fighting;
  if(active.fighting){const g=active.world.game;$('journey-health').style.transform=`scaleX(${g.player.hp/100})`;$('journey-stamina').style.transform=`scaleX(${g.player.stamina/100})`;$('journey-boss').style.transform=`scaleX(${g.boss.hp/root.AstraCombat.BOSS_HEALTH})`;$('journey-hp-text').textContent=Math.ceil(g.player.hp);$('journey-potions').textContent='药葫芦 '+g.player.gourds;$('journey-phase').textContent=g.boss.phase===2?'二阶段':'一阶段';}
  if(time>noteUntil)$('journey-note').classList.remove('show');
  if(Math.floor(time*6)!==Math.floor((time-dt)*6))minimap();
  frameCount++;frameTime+=dt;
  if(frameTime>2){if(frameCount/frameTime<27)lowFrames++;else lowFrames=0;if(lowFrames>=2&&quality){quality=0;renderer.setPixelRatio(1);renderer.shadowMap.enabled=false;active.scene.traverse(o=>{if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;});}frameCount=frameTime=0;}
  renderer.render(active.scene,active.camera);return true;
 }
 function updateAudio(){if(ambient)ambient.gain.setTargetAtTime(soundOn&&active&&!book.open? .045:0,audio.currentTime,.3);}
 function sound(){
  soundOn=!soundOn;$('journey-sound').textContent=soundOn?'静音':'声音';
  if(soundOn&&!audio){try{audio=new (window.AudioContext||window.webkitAudioContext)();ambient=audio.createGain();ambient.gain.value=0;ambient.connect(audio.destination);const length=audio.sampleRate*2,buffer=audio.createBuffer(1,length,audio.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*.5;const source=audio.createBufferSource();source.buffer=buffer;source.loop=true;const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=550;source.connect(filter).connect(ambient);source.start();}catch{soundOn=false;notify('这个浏览器暂时无法播放环境声。');}}
  if(audio?.state==='suspended')audio.resume();updateAudio();
 }
 function photo(){
  if(!active)return;renderer.render(active.scene,active.camera);
  const c=document.createElement('canvas');c.width=1440;c.height=Math.min(2400,Math.round(1440*canvas.height/canvas.width)+130);const ctx=c.getContext('2d');ctx.fillStyle='#eee6d2';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(canvas,26,26,c.width-52,c.height-156);ctx.fillStyle='#304e48';ctx.font='32px SimSun,serif';ctx.fillText(active.meta.name,36,c.height-70);ctx.font='14px sans-serif';ctx.fillText('ASTRA / '+new Date().toLocaleDateString('zh-CN'),38,c.height-36);
  c.toBlob(blob=>{if(!blob)return;if(blobURL)URL.revokeObjectURL(blobURL);blobURL=URL.createObjectURL(blob);const a=document.createElement('a');a.href=blobURL;a.download='星屿-旅行明信片.png';a.click();notify('明信片已生成。');},'image/png');
 }
 $('journey-close').onclick=()=>book.close();book.addEventListener('close',()=>{clear();updateAudio();});
 $('journey-map').onclick=openMap;$('journey-home').onclick=()=>home();$('journey-return').onclick=()=>home();
 for(const b of ui.querySelectorAll('[data-place]'))b.onclick=()=>travel(b.dataset.place);
 for(const b of ui.querySelectorAll('[data-home]'))b.onclick=()=>home(b.dataset.home);
 $('journey-action').onclick=()=>{clear();active?.context()?.run();};
 $('journey-weather').onclick=()=>{active?.setRain();$('journey-weather').textContent=active?.rain?'停雨':'落雨';};
 $('journey-day').onclick=()=>active?.setDay();$('journey-view').onclick=()=>{if(active&&!active.fighting){clear();active.overview=!active.overview;active.cameraReady=false;}};
 $('journey-photo').onclick=photo;$('journey-sound').onclick=sound;$('journey-online').onclick=()=>{clear();document.getElementById('online-button')?.click();};
 for(const b of ui.querySelectorAll('[data-combat]'))b.onclick=()=>active?.combat(b.dataset.combat,input);
 const combatKeys={KeyJ:'attack',KeyK:'heavy',Space:'dodge',KeyQ:'bind',KeyR:'heal'};
 window.addEventListener('keydown',e=>{
  if(!active||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,textarea,select'))return;
  if(e.code==='Tab'||e.code==='Enter')return;
  e.preventDefault();e.stopImmediatePropagation();keys.add(e.code);if(e.repeat)return;
  if(e.code==='KeyM'||e.code==='Escape')openMap();
  else if(e.code==='KeyE')active.context()?.run();
  else if(e.code==='KeyV'&&!active.fighting){active.firstPerson=!active.firstPerson;active.overview=false;active.cameraReady=false;}
  else if(active.fighting&&combatKeys[e.code])active.combat(combatKeys[e.code],input);
 },true);
 window.addEventListener('keyup',e=>{if(!active)return;keys.delete(e.code);e.stopImmediatePropagation();},true);
 window.addEventListener('blur',()=>{clear();if(active&&!book.open)openMap();});
 document.addEventListener('visibilitychange',()=>{clear();if(document.hidden&&active&&!book.open)openMap();});
 window.addEventListener('resize',()=>{clear();resize();});
 function lookDown(e){if(!active||document.querySelector('dialog[open]'))return;e.preventDefault();e.stopImmediatePropagation();if(lookId!==null)return;lookId=e.pointerId;lastLook={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}
 canvas.addEventListener('pointerdown',lookDown,true);
 canvas.addEventListener('pointermove',e=>{if(!active)return;e.stopImmediatePropagation();if(lookId!==e.pointerId||!lastLook)return;active.yaw-=(e.clientX-lastLook.x)*.006;active.pitch=C.clamp(active.pitch+(e.clientY-lastLook.y)*.004,-.1,1.1);lastLook={x:e.clientX,y:e.clientY};},true);
 function lookUp(e){if(!active)return;e.stopImmediatePropagation();if(lookId===e.pointerId){lookId=null;lastLook=null;}}
 canvas.addEventListener('pointerup',lookUp,true);canvas.addEventListener('pointercancel',lookUp,true);canvas.addEventListener('lostpointercapture',lookUp,true);
 canvas.addEventListener('wheel',e=>{if(!active)return;e.preventDefault();e.stopImmediatePropagation();active.distance=C.clamp(active.distance+e.deltaY*.01,3,15);},{capture:true,passive:false});
 // The old host has touch handlers as well as pointer handlers. In a journey only this input owner runs.
 for(const event of ['touchstart','touchmove','touchend','touchcancel'])canvas.addEventListener(event,e=>{if(active){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,passive:false});
 const joy=$('journey-joy');
 function moveStick(e){const r=joy.getBoundingClientRect(),range=r.width*.34;let x=(e.clientX-r.left-r.width/2)/range,z=(e.clientY-r.top-r.height/2)/range;const d=Math.max(1,Math.hypot(x,z));stick={x:x/d,z:z/d};$('journey-stick').style.transform=`translate(${stick.x*range}px,${stick.z*range}px)`;}
 joy.addEventListener('pointerdown',e=>{if(joystickId!==null)return;joystickId=e.pointerId;joy.setPointerCapture(e.pointerId);moveStick(e);e.preventDefault();});joy.addEventListener('pointermove',e=>{if(e.pointerId===joystickId)moveStick(e);});
 const release=e=>{if(e.pointerId===joystickId){joystickId=null;stick={x:0,z:0};$('journey-stick').style.transform='';}};
 for(const type of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(type,release);
 const run=$('journey-run');run.addEventListener('pointerdown',e=>{if(runId!==null)return;runId=e.pointerId;run.setPointerCapture(e.pointerId);e.preventDefault();});for(const type of ['pointerup','pointercancel','lostpointercapture'])run.addEventListener(type,e=>{if(runId===e.pointerId)runId=null;});
 updateBook();
 const requested=(()=>{try{return new URL(location.href).searchParams.get('journey');}catch{return null;}})();
 if(C.REGIONS[requested])setTimeout(()=>travel(requested),0);
 return {frame,travel,home,openMap,get active(){return active;},get busy(){return busy;},progress,
  getPose(){if(!active)return null;return {x:active.pos.x,y:active.pos.y,z:active.pos.z,heading:active.pos.heading,speed:active.pos.speed,kind:active.transport?'ride':'walk',region:active.id};},
  onPeer(peer){peerData.set(peer.id,peer);},onPeerLeave(id){peerData.delete(id);const a=peerModels.get(id);if(a){a.g.parent?.remove(a.g);peerModels.delete(id);}},render(){if(active)renderer.render(active.scene,active.camera);}
 };
}
root.AstraJourneys={init};
})(window);
