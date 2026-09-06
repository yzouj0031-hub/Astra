const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const vendor=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)][0][1];
const T={};vm.runInNewContext(vendor,{exports:T,module:{},console,performance});
const gradient={addColorStop(){}};
const ctx=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,measureText:t=>({width:t.length*20}),getImageData:()=>({data:new Uint8ClampedArray(256*256*4)})},{get:(t,k)=>t[k]||(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
const document={createElement:()=>({width:1,height:1,getContext:()=>ctx})};
const sandbox={THREE:T,document,console,performance,window:{},globalThis:{}};sandbox.window=sandbox;
const context=vm.createContext(sandbox);
for(const file of ['core','regions','combat','rainport','watertown','temple'])vm.runInContext(fs.readFileSync(path.join(root,'journeys',file+'.js'),'utf8'),context,{filename:file+'.js'});
const C=sandbox.AstraJourneyCore;
const wall=[{minX:0,maxX:.1,minZ:-10,maxZ:10}];
for(const sign of [-1,1]){const p={x:sign<0?3:-3,z:-5};C.move(p,sign*40,9,wall);assert(sign<0?p.x>.49:p.x<-.39,'Swept collision stops on original side of thin wall');}
const edge={x:0,z:0};C.move(edge,0,10,[],(x,z)=>z<2);assert(edge.z<=1.6,'Body radius stops before the water edge');
assert.equal(C.readProgress({getItem:()=>'{broken'}).stamps.length,0);
const events=[];
for(const mobile of [false,true]){
 for(const id of ['rainport','watertown','temple']){
  const progress={stamps:[],visited:[],positions:{}};
  const r=sandbox.AstraCreateRegion(T,id,{mobile,progress,notify:t=>events.push(t),stamp:k=>{if(!progress.stamps.includes(k))progress.stamps.push(k);},travel:k=>events.push('travel:'+k)});
  assert(r.scene.isScene);assert(r.camera.isPerspectiveCamera);assert(C.canStand(r.pos.x,r.pos.z,r.solids,r.land),id+' spawn is clear');
  for(const stop of r.meta.stops){r.place(stop);assert(C.canStand(r.pos.x,r.pos.z,r.solids,r.land),id+' stop '+stop[0]+' is clear');}
  for(let i=0;i<120;i++)r.update(1/60,{x:0,z:0,run:false});
  assert([r.pos.x,r.pos.y,r.pos.z].every(Number.isFinite));
  if(id==='rainport'){
   r.setRain();assert(r.world.npcs.every(n=>!n.g.userData.umbrella.visible));r.setRain();assert(r.world.npcs.every(n=>n.g.userData.umbrella.visible));
   r.place(['stop','电车站',-18.7,15]);assert(r.context().label.includes('电车'));r.context().run();assert(r.transport);r.update(.05,{x:0,z:0});r.context().run();assert(!r.transport);assert(C.canStand(r.pos.x,r.pos.z,r.solids,r.land));
   r.place(['market','市场',25,-1]);r.update(.05,{x:0,z:0});assert(progress.stamps.includes('market'));
  }
  if(id==='watertown'){
   r.place(['tea','茶馆门口',21,10]);
   // Walk through the actual doorway, and return along the same path.
   r.yaw=0;for(let i=0;i<110;i++)r.update(.02,{x:0,z:1});assert(r.pos.z>13&&r.pos.z<22,'Tea room is entered through the door');assert(progress.stamps.includes('tea'));
   for(let i=0;i<110;i++)r.update(.02,{x:0,z:-1});assert(r.pos.z<12,'Tea room can be exited');
   r.place(r.meta.stops[0]);r.update(.02,{x:0,z:0});assert(r.context()?.label.includes('乌篷船'));r.context().run();assert(r.transport);r.context().run();assert(!r.transport,'Boat returns to land');
  }
  if(id==='temple'){
   r.place(['warden','守山人',4,1]);r.context().run();assert(r.fighting);
   r.combat('bind',{x:0,z:0});assert(r.world.game.boss.stun>0);
   r.context().run();assert(!r.fighting,'Trial can be abandoned');
   r.place(['warden','守山人',4,1]);r.context().run();r.world.game.boss.hp=1;r.world.game.boss.stun=10;r.world.game.player.x=0;r.world.game.player.z=-1.5;r.world.game.player.face=Math.PI;
   r.combat('attack',{x:0,z:0});for(let i=0;i<30;i++)r.update(.02,{x:0,z:0});assert(progress.stamps.includes('warden'));assert(!r.fighting);
   r.place(['entry','台阶',1.6,-14]);for(let i=0;i<70;i++)r.update(.02,{x:0,z:-1});assert(r.pos.z<-18&&r.pos.y>1,'Victory opens walkable temple steps');
  }
  let meshes=0;r.scene.traverse(o=>{if(o.isMesh)meshes++;});console.log(`${id} ${mobile?'mobile':'desktop'}: ${meshes} meshes; movement, interactions and return paths passed.`);
  r.deactivate();
 }
}
console.log('Journey collision, weather, boarding, tea-room entry and boss progression checks passed.');
