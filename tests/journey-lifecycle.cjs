const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const T={};vm.runInNewContext([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)][0][1],{exports:T,module:{},console,performance});
const nodes=new Map(),handlers=new Map(),gradient={addColorStop(){}};
const cx=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,measureText:()=>({width:80})},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
class El{
 constructor(id=''){this.id=id;this.style={};this.dataset={};this.children=[];this.events={};this.open=false;this.hidden=false;this.width=1280;this.height=720;this.textContent='';this.classList={add(){},remove(){},toggle(){}};}
 set innerHTML(v){this.html=v;for(const tag of v.matchAll(/<(\w+)([^>]*)>/g)){const attrs=tag[2],id=/\bid="([^"]+)"/.exec(attrs)?.[1];if(!id&&!/data-(home|combat|place)=/.test(attrs))continue;const e=new El(id||'');for(const a of attrs.matchAll(/data-([\w-]+)="([^"]+)"/g))e.dataset[a[1]]=a[2];if(id)nodes.set(id,e);this.children.push(e);}}
 get innerHTML(){return this.html;}
 appendChild(e){this.children.push(e);if(e.id)nodes.set(e.id,e);}
 querySelectorAll(selector){const k=/data-(\w+)/.exec(selector)?.[1];return this.children.filter(e=>e.dataset[k]);}
 addEventListener(k,f){(this.events[k]??=[]).push(f);}
 showModal(){this.open=true;}
 close(){if(!this.open)return;this.open=false;for(const f of this.events.close||[])f({});}
 getContext(){return cx;}
 getBoundingClientRect(){return {left:0,top:0,width:118,height:118};}
 setPointerCapture(){} closest(){return null;} click(){this.onclick?.();} remove(){}
}
const body=new El('body'),canvas=new El('canvas');
const document={body,head:new El('head'),createElement:()=>new El(),getElementById:id=>nodes.get(id),querySelector:s=>s==='dialog[open]'?[...nodes.values()].find(e=>e.open)||null:null,addEventListener(){}};
nodes.set('world-regions',new El('world-regions'));
const saved=new Map();const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
const s={THREE:T,document,console,performance,matchMedia:()=>({matches:false}),navigator:{maxTouchPoints:0},innerWidth:1280,innerHeight:720,devicePixelRatio:1,localStorage:storage,URL,Date,window:null};s.window=s;s.addEventListener=(k,f)=>(handlers.get(k)||handlers.set(k,[]).get(k)).push(f);
vm.createContext(s);for(const f of ['core','regions','combat','rainport','watertown','temple','runtime'])vm.runInContext(fs.readFileSync(path.join(root,'journeys',f+'.js'),'utf8'),s,{filename:f+'.js'});
const baseScene=new T.Scene(),geometry=new T.BoxGeometry(1,1,1);let sharedDisposed=false;geometry.addEventListener('dispose',()=>sharedDisposed=true);
const avatar=()=>{const g=new T.Group(),body=new T.Group();g.add(body);body.add(new T.Mesh(geometry,new T.MeshBasicMaterial()));return {g,body,arms:[0,1].map(()=>({pivot:new T.Group(),elbow:new T.Group()})),legs:[0,1].map(()=>({pivot:new T.Group(),knee:new T.Group()}))};};
const player=avatar();baseScene.add(player.g);let renders=0,captures=0,restores=0,suspends=0;
const renderer={domElement:canvas,shadowMap:{enabled:true,type:1},toneMapping:7,toneMappingExposure:1.7,outputEncoding:9,physicallyCorrectLights:false,getPixelRatio:()=>1.5,setPixelRatio(){},setSize(){},render(scene,camera){assert(scene.isScene&&camera.isCamera);renders++;}};
const api=s.AstraJourneys.init({renderer,avatar:player,clearInput(){},capture:()=>{captures++;return {x:638,z:-67};},suspend:()=>suspends++,restore:state=>{assert.equal(state.x,638);restores++;baseScene.add(player.g);},renderMain(){},goHome(){},makePeer:()=>avatar()});
function key(code){for(const f of handlers.get('keydown')||[])f({code,target:new El(),preventDefault(){},stopImmediatePropagation(){}});}
(async()=>{
 const listenerCount=[...handlers.values()].reduce((n,a)=>n+a.length,0);
 for(const id of ['rainport','watertown','temple','rainport']){
  const old=api.active;let disposed=0;if(old)old.scene.traverse(o=>o.geometry?.addEventListener('dispose',()=>disposed++));
  await api.travel(id);assert.equal(api.active.id,id);assert.equal(player.g.parent,api.active.scene);assert(!sharedDisposed,'Host avatar geometry survives region disposal');if(old)assert(disposed>0,'Old region resources are released');
  const p={...api.active.pos};api.frame(.05);assert.equal(api.getPose().region,id);
  key('KeyD');api.frame(.05);const moved={...api.active.pos};assert(Math.hypot(moved.x-p.x,moved.z-p.z)>0,'Keyboard controls move the current region player');
  api.openMap();api.frame(.05);assert.equal(api.active.pos.x,moved.x,'Open travel map pauses movement');nodes.get('journey-dialog').close();api.frame(.05);assert.equal(api.active.pos.x,moved.x,'Closing travel map clears held inputs');
  api.onPeer({id:'abcdefgh',name:'同行者',color:0,pose:{x:2,y:0,z:3,heading:0,speed:1,region:id}});api.frame(.05);api.onPeerLeave('abcdefgh');
  assert.equal([...handlers.values()].reduce((n,a)=>n+a.length,0),listenerCount,'Region switching adds no global input listeners');
 }
 assert.equal(captures,1);assert.equal(suspends,1);api.home();assert.equal(restores,1);assert.equal(api.active,null);assert.equal(api.frame(.05),false);assert.equal(player.g.parent,baseScene);assert.equal(renderer.toneMapping,7);assert.equal(renderer.toneMappingExposure,1.7);assert(!sharedDisposed);
 assert(renders>=12);assert(saved.has('astra-journey-v1'));
 console.log('Journey lifecycle: lazy region creation, one avatar/renderer, keyboard movement, pause, input reset, resource disposal, peer lifecycle, saved visits and exact host restoration passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
