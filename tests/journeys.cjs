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
for(const file of ['core','regions','foliage','combat','rainport','watertown','temple'])vm.runInContext(fs.readFileSync(path.join(root,'journeys',file+'.js'),'utf8'),context,{filename:file+'.js'});
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
/* 烟雨渡的树：glTF 路线与回退路线必须建出同一座镇子。
   树改用外部模型之后每棵少抽几百个随机数，而宝塔、远山、菜畦还排在同一条
   随机序列后面 —— 步数对不上，它们就会整片移位。watertown.js 里靠 skipTo()
   把种子推到原来的位置，这里守住这件事。
   同时确认：没有模型时才回退（Node 没有 XHR），而回退不改变碰撞体。 */
{
 const build=(trees,mobile)=>{
  const geo=new T.BoxGeometry(1,4,1);geo.computeBoundingBox();
  const parts={};
  for(const n of ['NormalTree_1','NormalTree_2','NormalTree_3','NormalTree_4','NormalTree_5',
                  'MapleTree_1','MapleTree_2','MapleTree_3','MapleTree_4','MapleTree_5',
                  'BirchTree_1','BirchTree_2','DeadTree_1','DeadTree_2','DeadTree_3',
                  'Bush','Bamboo','Bamboo_Mid'])
   parts[n]={meshes:[{geometry:geo,matName:'X'}],height:4};
  const cards=()=>new T.Texture();
  const materialFor=()=>new T.MeshPhongMaterial();
  return sandbox.AstraRegionFactories.watertown(T,{trees:trees?{parts,cards,materialFor}:null,mobile});
 };
 const plain=build(false),modelled=build(true),phone=build(true,true);
 assert.equal(plain.treeSpots.length,0,'回退路线直接拼几何，不记落点');
 // 竹丛和松只在有模型时才种，会往后面追加碰撞体；
 // 原有的那批必须一字不差 —— 这才说明镇子本身没被挪动。
 assert.deepEqual(modelled.obstacles.slice(0,plain.obstacles.length),plain.obstacles,
  '原有的碰撞体必须一字不差');
 assert(modelled.obstacles.length>plain.obstacles.length,'竹丛和层叠松要补上自己的碰撞体');
 const count=w=>w.treeSpots.reduce((a,s)=>(a[s.kind]=(a[s.kind]||0)+1,a),{});
 const kinds=count(modelled);
 assert.equal(kinds.camphor,1);
 assert(kinds.tree>0,'山脚和镇外是杂树');
 // 沿河的柳：老循环那 10 棵 + 另一组独立随机流补的。烟雨渡的招牌是柳荫夹河，
 // 一棵管二十多米河岸太稀，所以补到 25~30。
 assert(kinds.willow>=25&&kinds.willow<=30,`沿河柳应在 25~30 棵之间，实际 ${kinds.willow}`);
 assert(modelled.treeSpots.every(s=>Number.isFinite(s.x)&&Number.isFinite(s.y)&&Number.isFinite(s.z)&&s.scale>0));
 // 补的柳不能和已有的挤在一起：任意两棵落点至少隔开一点
 const bank=modelled.treeSpots.filter(s=>s.kind==='willow');
 for(let i=0;i<bank.length;i++)for(let j=i+1;j<bank.length;j++)
  assert(Math.hypot(bank[i].x-bank[j].x,bank[i].z-bank[j].z)>1.4,'两棵柳落点挤在一起了');

 // 手机端：株数按 LOD 减，广场那棵老樟树必须留着
 const phoneKinds=count(phone);
 assert.equal(phoneKinds.camphor,1,'手机端也要保留广场的老樟树');
 // 目标是手机端三角形压到桌面端的一半以下。这里只能量落点数（Node 里没有 GPU）；
 // 三角形是用 stats 探针在真浏览器里量的：桌面 102.0 万 / 手机 48.6 万 = 47.6%。
 // 静态的镇子本身就占 28.2 万且动不了，所以树这一块得砍到三成以下。
 assert(phone.treeSpots.length<modelled.treeSpots.length*0.35,
  `手机端落点应远少于桌面端，实际 ${phone.treeSpots.length} vs ${modelled.treeSpots.length}`);
 // 手机端少掉的树，碰撞体也要跟着少 —— 否则会撞到看不见的树
 assert(phone.obstacles.length<modelled.obstacles.length,
  '手机端剔掉的树必须连碰撞体一起剔掉');

 console.log(`Watertown trees: ${kinds.willow} bank willows, ${kinds.tree} misc trees, ${kinds.camphor} camphor, `
  +`plus ${modelled.obstacles.length-plain.obstacles.length} bamboo/pine clumps; `
  +`mobile thins to ${phone.treeSpots.length} spots. `
  +'Seeded layout and the original collision volumes identical with and without the glTF models.');
}

console.log('Journey collision, weather, boarding, tea-room entry and boss progression checks passed.');
