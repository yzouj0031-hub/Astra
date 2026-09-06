(function(root){
'use strict';
const C=root.AstraJourneyCore;
root.AstraRegionFactories=root.AstraRegionFactories||{};
function rect(x,z,w,d,height=12){return {minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,height};}
function createRegion(T,id,services){
 const {mobile,notify,stamp,progress,travel}=services;
 const meta=C.REGIONS[id];let scene,camera,world,solids=[],land=()=>true,ground=()=>0;
 let transport=false,phase=0,rain=id==='rainport',day=0,clock=0,active=true;
 const pos={...meta.spawn,y:0,heading:Math.PI,speed:0};
 const factory=root.AstraRegionFactories[id];
 if(id==='rainport'){
  const api=factory(T);scene=new T.Scene();scene.background=new T.Color('#102d3e');scene.fog=new T.Fog('#102d3e',65,215);
  camera=new T.PerspectiveCamera(57,1,.1,380);
  const hemi=new T.HemisphereLight('#b9d4db','#2b3440',.35);scene.add(hemi);
  const sun=new T.DirectionalLight('#c8deec',.15);sun.position.set(-35,60,20);scene.add(sun);
  world=api.createWorld(scene,{mobile});solids=world.colliders;land=api.isLand;ground=()=>.17;
  world.player.visible=false;
  for(const n of world.npcs){const p=C.safeSpot(n.x,n.z,solids,land,.28);if(p){n.x=p.x;n.z=p.z;n.g.position.set(p.x,.17,p.z);}}
  world.setRain(true);
  world.lightCycle=()=>{hemi.intensity=.35+day*.5;sun.intensity=.15+day*.65;scene.background.set(day?'#58757d':'#102d3e').convertSRGBToLinear();scene.fog.color.copy(scene.background);};
 }else if(id==='watertown'){
  world=factory(T);scene=world.scene;camera=world.camera;
  solids=world.obstacles.map(o=>({minX:o.x0,maxX:o.x1,minZ:o.z0,maxZ:o.z1,height:o.h||9.5}));
  land=(x,z)=>Math.abs(x)<175&&z>-95&&z<145&&!world.isWater(x,z);
  ground=world.groundY;world.player.g.visible=false;
  // Start every walker on a legal surface, including the foot of the bridges.
  for(const n of world.npcs){const p=C.safeSpot(n.x,n.z,solids,land,.28);if(p){n.x=p.x;n.z=p.z;n.per.g.position.set(p.x,ground(p.x,p.z),p.z);}}
 }else{
  world=factory(T,{mobile});scene=world.scene;camera=world.camera;
  world.hero.root.visible=false;
  // Floor height follows the actual temple plinth and the front steps.
  ground=(x,z)=>Math.abs(x)<9.1&&z>=-25.2&&z<=-16.6?1.2:Math.abs(x)<3.6&&z>-16.6&&z<-14.4?C.clamp((-z-14.4)/2.2,0,1)*1.2:0;
  land=(x,z)=>(Math.hypot(x,z)<15.8)||(Math.abs(x)<3.55&&z<=-13&&z>=-17)||(Math.abs(x)<8.85&&z>=-25.1&&z<=-16.6);
  solids=[rect(0,-24.35,16,.4,6),rect(0,-25.4,18,.3,6)];
  for(const x of [-7,-3.5,0,3.5,7])for(const z of [-23.7,-18.3])solids.push(rect(x,z,.6,.6,6));
  for(const x of [-11,11])for(const z of [-11,-3,6,13])solids.push(rect(x,z,1,1,2.5));
  world.game=root.AstraCombat.createGame();world.fighting=false;world.completed=progress.stamps.includes('warden');
  // A small, walkable exhibition behind the guardian gives the victory a destination.
  const table=new T.Mesh(new T.BoxGeometry(3,.18,1.2),new T.MeshStandardMaterial({color:'#655439',roughness:.8}));table.position.set(0,2.1,-22);scene.add(table);
  const stone=new T.Mesh(new T.IcosahedronGeometry(.4,1),new T.MeshStandardMaterial({color:'#72ab8b',emissive:'#284c37',emissiveIntensity:.5}));stone.position.set(0,2.6,-22);scene.add(stone);
  solids.push(rect(0,-22,3,1.2,2.8));
 }
 // r160/r170 convert CSS/hex colors from sRGB at construction; r128 does not.
 // Match their authored palette explicitly instead of washing every surface toward white.
 if(id!=='watertown'){
  const seen=new Set();scene.traverse(o=>{for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){if(seen.has(m))continue;seen.add(m);m.color?.convertSRGBToLinear();m.emissive?.convertSRGBToLinear();}if(id==='temple'&&o.isLight)o.intensity*=.45;});
  scene.background?.convertSRGBToLinear();scene.fog?.color.convertSRGBToLinear();
 }
 pos.y=ground(pos.x,pos.z);
 const region={id,meta,scene,camera,pos,solids,ground,land,world,yaw:0,pitch:.35,distance:7.5,firstPerson:false,overview:false,
  get fighting(){return !!world.fighting;},get rain(){return rain;},get transport(){return transport;},get day(){return day;},
  bounds:id==='watertown'?[-160,150,-65,115]:id==='rainport'?[-55,50,-65,95]:[-30,30,-32,22],
  place(stop){
   if(world.fighting){notify('先完成试炼，或从旅行地图离开庭院。');return;}
   transport=false;if(id==='watertown'&&world.S.riding)world.land();
   const p=C.safeSpot(stop[2],stop[3],solids,land);if(!p)return;
   Object.assign(pos,p);pos.y=ground(p.x,p.z);pos.speed=0;region.overview=false;region.cameraReady=false;
   region.yaw=id==='watertown'?(stop[0]==='tea'||stop[0]==='hill'?Math.PI:Math.PI/2):id==='rainport'&&stop[0]==='market'?-Math.PI/2:0;
  },
  restore(p){if(C.validPosition(p)&&C.canStand(p.x,p.z,solids,land)){Object.assign(pos,{x:p.x,z:p.z});pos.y=ground(p.x,p.z);}},
  setRain(){rain=!rain;if(id==='rainport')world.setRain(rain);if(id==='watertown')world.S.rain=rain;notify(rain?'雨落下来了。':'雨停了。');},
  setDay(){day=1-day;if(id==='watertown')world.S.dayT=day?.5:.95;if(id==='rainport')world.lightCycle();if(id==='temple'){scene.background.set(day?'#a8b7a0':'#7e9389');scene.fog.color.copy(scene.background);}notify(day?'日光漫游':'灯火时分');},
  people(){return id==='rainport'?world.npcs.map(n=>({x:n.g.position.x,z:n.g.position.z})):id==='watertown'?world.npcs.map(n=>({x:n.x,z:n.z})):(!world.fighting?[{x:world.game.boss.x,z:world.game.boss.z,radius:1.1}]:[]);},
  update(dt,input){
   if(!active)return;clock+=dt;phase+=dt;
   const old={x:pos.x,z:pos.z};
   const ix=input.x,iz=input.z,mag=Math.min(1,Math.hypot(ix,iz));
   const dx=Math.cos(region.yaw)*ix+Math.sin(region.yaw)*iz,dz=-Math.sin(region.yaw)*ix+Math.cos(region.yaw)*iz;
   if(id==='temple'&&world.fighting){
    const g=world.game,p0={...g.player},b0={...g.boss};
    root.AstraCombat.stepGame(g,dt,{x:dx,z:dz});
    // The source rules only confine a circle. Add swept collisions against actual courtyard props.
    const pp={x:p0.x,z:p0.z},bp={x:b0.x,z:b0.z};
    C.move(pp,g.player.x-p0.x,g.player.z-p0.z,solids,land,.4);C.move(bp,g.boss.x-b0.x,g.boss.z-b0.z,solids,land,.8);
    g.player.x=pp.x;g.player.z=pp.z;g.boss.x=bp.x;g.boss.z=bp.z;
    Object.assign(pos,{x:pp.x,z:pp.z,y:0,heading:g.player.face});
    for(const e of g.events){
     if(e.type==='boss-hit'||e.type==='player-hit')world.burst(e.x??pos.x,1.2,e.z??pos.z,12);
     if(e.type==='bind')notify('定身成功 · 抓住这次空隙');
     if(e.type==='phase')notify('石玉守卫进入第二阶段 · 留意双重冲击波');
     if(e.type==='won'){world.completed=true;world.fighting=false;stamp('warden');notify('试炼完成。山门已开，沿北侧台阶进入静山寺参观。',7);}
     if(e.type==='lost'){world.fighting=false;Object.assign(pos,meta.spawn);notify('在山门前歇一会儿。走近守山人，可以重新挑战。',6);}
    }
    g.events.length=0;
   }else if(id==='rainport'&&transport){
    const p=world.tram.position;pos.x=p.x;pos.z=p.z;pos.y=p.y+1;pos.heading=world.tram.rotation.y;
   }else if(id==='watertown'&&transport){
    world.input.x=ix;world.input.y=-iz;world.updatePlayer(dt);
    pos.x=world.P.x;pos.z=world.P.z;pos.y=world.P.y+.3;pos.heading=Math.PI/2-world.BOAT.h;
    if(Math.hypot(pos.x+40,pos.z)>18)stamp('boat');
   }else if(!region.overview){
    const speed=(input.run?7:4.3)*mag;
    if(mag>.02){
     C.move(pos,dx*speed*dt,dz*speed*dt,solids,(x,z)=>land(x,z)&&(id!=='temple'||world.completed||z>=-14.1),.4,region.people());
     if(Math.hypot(pos.x-old.x,pos.z-old.z)>.001)pos.heading=Math.atan2(dx,dz);
    }
    pos.y=ground(pos.x,pos.z);
   }
   pos.speed=Math.hypot(pos.x-old.x,pos.z-old.z)/Math.max(.001,dt);
   if(id==='rainport'){
    const previous=world.npcs.map(n=>({x:n.g.position.x,z:n.g.position.z}));
    world.update(clock,dt,{rainOn:rain,day,camera,focus:new T.Vector3(pos.x,pos.y,pos.z)});
    world.npcs.forEach((n,i)=>{const p=previous[i],wanted={x:n.g.position.x,z:n.g.position.z};C.move(p,wanted.x-p.x,wanted.z-p.z,solids,land,.28,transport?[]:[pos]);if(Math.hypot(p.x-wanted.x,p.z-wanted.z)>.001)n.dir*=-1;n.x=p.x;n.z=p.z;n.g.position.set(p.x,.17,p.z);});
    world.player.visible=false;
    if(pos.x>22&&pos.z>-13&&pos.z<33)stamp('market');
   }else if(id==='watertown'){
    const prev=world.npcs.map(n=>({x:n.x,z:n.z}));
    Object.assign(world.P,{x:pos.x,z:pos.z,y:pos.y,heading:pos.heading,speed:pos.speed});
    world.S.t=clock;world.S.dayT=(world.S.dayT+dt/world.S.dayLen)%1;
    world.updateNPCs(dt);
    world.npcs.forEach((n,i)=>{const p=prev[i];C.move(p,n.x-p.x,n.z-p.z,solids,land,.28,[pos]);n.x=p.x;n.z=p.z;n.per.g.position.set(n.x,ground(n.x,n.z),n.z);});
    world.updateBoats(dt);world.updateEnv(dt,new T.Vector3(pos.x,pos.y,pos.z));world.updateRain(dt,pos.x,pos.z);world.updateTeahouse(dt);
    world.player.g.visible=false;
    if(world.inTeahouse(pos.x,pos.z))stamp('tea');
   }else{
    const g=world.game;world.hero.root.visible=false;
    world.animateFighter(world.hero,g.player,dt,clock);world.animateFighter(world.warden,g.boss,dt,clock);
    if(g.mode==='won'){world.warden.body.position.y=-.55;world.warden.body.rotation.x=.55;}
    const b=g.boss;world.tellMaterial.opacity=0;
    if(world.fighting&&['sweep','slam'].includes(b.action)&&!b.hitDone&&b.stun<=0){const f=b.actionTime/b.duration;const r=(b.action==='slam'?4:4.9)*(1.18-f*.23);world.tell.position.set(b.x,.11,b.z);world.tell.scale.set(r,r,r);world.tellMaterial.opacity=.18+f*.5;}
    world.binding.visible=world.fighting&&b.stun>0;world.binding.position.set(b.x,0,b.z);world.binding.rotation.y=clock;
    world.targetMark.visible=world.fighting;world.targetMark.position.set(b.x,3,b.z);world.targetMark.quaternion.copy(camera.quaternion);
    world.waveMeshes.forEach((m,i)=>{const w=g.waves[i];m.visible=world.fighting&&!!w&&w.age>=0;if(m.visible){m.position.set(w.x,.15,w.z);m.scale.setScalar(w.radius);}});
    world.slashMaterial.opacity=0;
    if(world.fighting&&['attack','heavy'].includes(g.player.action)){const p=g.player,f=p.actionTime/p.duration;if(f>.19&&f<.7){world.slash.position.set(p.x,1.2,p.z);world.slash.rotation.set(-Math.PI/2+.25,p.action==='heavy'?1.1:0,-p.face+f*4);world.slash.scale.setScalar(p.action==='heavy'?1.85:1.5);world.slashMaterial.opacity=Math.sin((f-.19)/.51*Math.PI)*.45;}}
    for(let i=world.particles.length-1;i>=0;i--){const p=world.particles[i];p.life-=dt;if(p.life<=0){world.particleGroup.remove(p.mesh);world.particles.splice(i,1);}else{p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;p.vy-=7*dt;}}
    world.glows.forEach(g=>g.quaternion.copy(camera.quaternion));
   }
  },
  context(){
   if(world.fighting)return {label:'退出试炼',run:()=>{world.fighting=false;world.game=root.AstraCombat.createGame();Object.assign(pos,meta.spawn);notify('已退出试炼，随时可以再来。');}};
   if(id==='rainport'){
    if(transport)return {label:'下电车 · E',run:()=>{const p=C.safeSpot(pos.x+3.4,pos.z,solids,land);if(p){transport=false;Object.assign(pos,p);pos.y=ground(p.x,p.z);region.cameraReady=false;}else notify('这里不便下车，稍等电车驶到开阔处。');}};
    if(Math.hypot(pos.x-world.tram.position.x,pos.z-world.tram.position.z)<7||Math.hypot(pos.x+18.7,pos.z-15)<5)return {label:'乘环港电车 · E',run:()=>{transport=true;region.overview=false;notify('搭上末班电车了，随时可以下车。');}};
    if(Math.hypot(pos.x+14,pos.z-28)<5)return {label:'渡轮 · 前往烟雨渡',run:()=>travel('watertown')};
    if(pos.x>22&&pos.z>-13&&pos.z<33)return {label:'听摊主说两句 · E',run:()=>notify('「最后一锅汤还热着。吃完沿河走，电车就在桥那头。」')};
   }else if(id==='watertown'){
    if(transport)return {label:'靠岸下船 · E',run:()=>{if(world.land()){transport=false;const spot=C.safeSpot(world.P.x,world.P.z,solids,land)||meta.spawn;Object.assign(pos,spot);pos.y=ground(pos.x,pos.z);region.cameraReady=false;}else notify('沿主河道靠近岸边，再试着下船。');}};
    if(Math.hypot(pos.x+112,pos.z-72)<7)return {label:'沿古道 · 前往静山寺',run:()=>travel('temple')};
    if(Math.hypot(pos.x-world.BOAT.x,pos.z-world.BOAT.z)<7.5)return {label:'登上乌篷船 · E',run:()=>{Object.assign(world.P,pos);if(world.board()){transport=true;region.overview=false;notify('W / S 划船，A / D 转向；靠岸按 E 下船。');}}};
    if(world.inTeahouse(pos.x,pos.z))return {label:'坐听一段茶话 · E',run:()=>notify('「这条水路通雨港，西北的古道通静山寺。喝完这盏，再慢慢赶路。」',6)};
    const n=world.nearestNPC();if(n)return {label:'和路人说话 · E',run:()=>{n.talk=4.5;const lines=rain?world.LINES.rain:world.S.night>.5?world.LINES.night:world.LINES.day;notify(lines[Math.floor(Math.random()*lines.length)]);}};
   }else{
    if(world.completed&&pos.z<-19)return {label:'阅读静山寺藏品 · E',run:()=>notify('【山门玉印】旧时渡船人把山形刻进玉里，出航时带在身边。旅途最后一枚印记，留给愿意再走一段路的人。',8)};
    if(Math.hypot(pos.x-world.game.boss.x,pos.z-world.game.boss.z)<7)return {label:world.completed?'再次挑战守卫 · E':'开始山门试炼 · E',run:()=>{world.game=root.AstraCombat.createGame();world.fighting=true;Object.assign(pos,{x:0,z:8,y:0});region.overview=false;region.firstPerson=false;region.yaw=0;notify('J 轻击 · K 重击 · 空格闪避 · Q 定身 · R 喝药。红圈收紧时闪避。',7);}};
    if(Math.hypot(pos.x,pos.z-10)<3)return {label:'下山 · 返回烟雨渡',run:()=>travel('watertown')};
   }
   return null;
  },
  combat(action,input){if(!world.fighting)return;const x=Math.cos(region.yaw)*input.x+Math.sin(region.yaw)*input.z,z=-Math.sin(region.yaw)*input.x+Math.cos(region.yaw)*input.z;root.AstraCombat.command(world.game,action,{x,z});},
  deactivate(){active=false;}
 };
 return region;
}
root.AstraCreateRegion=createRegion;
})(window);
