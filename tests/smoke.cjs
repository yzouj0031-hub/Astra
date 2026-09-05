const fs=require('fs'),vm=require('vm'),assert=require('assert');
const HTML=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const scripts=[...HTML.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
scripts.forEach((s,i)=>new vm.Script(s,{filename:`inline-${i}.js`}));
const THREE={};
vm.runInNewContext(scripts[0],{exports:THREE,module:{},console,performance},{filename:'embedded-three.js'});
function test(width,height){
 const nodes=new Map(),errors=[],events={};let renders=0;
 const ctx=new Proxy({}, {get:(t,k)=>k in t?t[k]:(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
 class El{
  constructor(id){this.id=id;this.style={};this.attrs={};this.handlers={};this.textContent='';this.innerHTML='';this.children=[];this.width=288;this.height=248;const classes=new Set();this.classList={add:k=>classes.add(k),remove:k=>classes.delete(k),toggle:(k,v)=>v===false?classes.delete(k):classes.add(k)};this.dataset={};}
  addEventListener(k,fn){(this.handlers[k]??=[]).push(fn)}
  appendChild(e){this.children.push(e);if(e.textContent?.startsWith('出错'))errors.push(e.textContent)}
  setAttribute(k,v){this.attrs[k]=v}
  getAttribute(k){return this.attrs[k]}
  getContext(){return ctx}
  getBoundingClientRect(){return {left:0,top:0,width:500,height:130,right:500,bottom:130}}
  querySelector(){return new El('close')}
  click(){this.handlers.click?.forEach(fn=>fn({}));this.onclick?.({})}
  closest(){return null}
  showModal(){this.open=true}close(){this.open=false}
 }
 for(const m of HTML.matchAll(/\bid="([^"]+)"/g)){assert(!nodes.has(m[1]),`Duplicate ID ${m[1]}`);nodes.set(m[1],new El(m[1]));}
 const body=new El('body');
 const document={body,hidden:false,getElementById:id=>nodes.get(id)||null,createElement:tag=>new El(tag),querySelector:()=>null,addEventListener:()=>{}};
 const canvas=new El('stage-canvas');canvas.width=width;canvas.height=height;
 const renderer={domElement:canvas,setSize:()=>{},setPixelRatio:()=>{},shadowMap:{},render:()=>renders++};
 const three={...THREE,WebGLRenderer:function(){return renderer;}};
 const sandbox={THREE:three,document,innerWidth:width,innerHeight:height,devicePixelRatio:1,requestAnimationFrame:()=>{},addEventListener:(k,f)=>(events[k]??=[]).push(f),setTimeout:()=>0,clearTimeout:()=>{},matchMedia:()=>({matches:false}),localStorage:{getItem:()=>null,setItem:()=>{}},performance,console,URL,Date};sandbox.window=sandbox;
 const c=vm.createContext(sandbox);vm.runInContext(scripts[1],c);
 const exported=scripts[2].replace('\nsetMode(MODE.VIEW);','globalThis.api={setMode,MODE,walk,ship,fish,keys,castPress,castRelease,updateWalk,updateSail,updateFishing,updateAtmosphere,selectPeriod,drawMap,terrainH,DOCK_DIR,DOCK_ANG,scene,camera,ctrl,clearInput,seaUniforms,periods,residents,updateResidents,greetResident,residentCanGreet,residentGroundClear,parkModule,animateResort,focusRegion,parkEntry,rideAttraction,leaveParkRide,updateParkCamera,worldWalkHeight,resortInstances};\nsetMode(MODE.VIEW);');
 vm.runInContext(exported,c,{timeout:20000});assert.deepEqual(errors,[],errors.join('\n'));assert(renders>0,'Initial render reached');const a=c.api;assert(a,'API initialized');
 for(const mode of Object.values(a.MODE)){a.setMode(mode);assert.equal(body.dataset.mode,mode);}
 a.setMode('fish');a.updateFishing(.016,1);
 const outward={x:-Math.sin(a.fish.yaw),z:-Math.cos(a.fish.yaw)};
 assert(outward.x*a.DOCK_DIR.x+outward.z*a.DOCK_DIR.y>.999,'Fishing camera faces out to sea');
 a.castPress();assert.equal(a.fish.state,'cast');for(let i=0;i<80;i++)a.updateFishing(.016,i*.016);assert.equal(a.fish.state,'wait');
 a.fish.state='bite';a.castPress();assert.equal(a.fish.state,'fight');a.castPress();assert(a.fish.pulling);a.castRelease();assert(!a.fish.pulling);
 a.setMode('sail');assert(Math.sin(a.ship.yaw)*a.DOCK_DIR.x+Math.cos(a.ship.yaw)*a.DOCK_DIR.y>.999,'Boat points out to sea');
 a.keys.w=true;const sx=a.ship.x,sz=a.ship.z;for(let i=0;i<180;i++)a.updateSail(.016,i*.016);assert(Math.hypot(a.ship.x-sx,a.ship.z-sz)>10,'Boat can leave harbor');
 a.clearInput();assert(!a.keys.w);a.setMode('walk');a.keys.w=true;for(let i=0;i<60;i++)a.updateWalk(.016,i*.016);assert(Number.isFinite(a.camera.position.y));a.clearInput();
 for(let p=0;p<3;p++){a.selectPeriod(p);for(let j=0;j<240;j++)a.updateAtmosphere(.016,j*.016);assert(Number.isFinite(a.seaUniforms.uMood.value.r));a.drawMap();}
 assert.equal(a.residents.length,7,'Seven residents are created');
 assert.equal(new Set(a.residents.map(n=>n.name)).size,7,'Residents have unique names');
 const walkers=a.residents.filter(n=>n.role==='walk');
 assert.equal(walkers.length,2);walkers.forEach(n=>assert(n.route.length>3,'Coastal walking route is reachable'));
 const starts=walkers.map(n=>n.g.position.clone());let traveled=[0,0];
 a.setMode('view');
 for(let f=0;f<3600;f++){
  const old=walkers.map(n=>n.g.position.clone());a.updateResidents(.05,f*.05);
  walkers.forEach((n,i)=>{traveled[i]+=n.g.position.distanceTo(old[i]);assert(a.residentGroundClear(n.g.position.x,n.g.position.z),'Walker stays on dry unobstructed ground');assert(Math.abs(n.g.position.y-a.terrainH(n.g.position.x,n.g.position.z))<.01,'Feet follow terrain');});
 }
 traveled.forEach(d=>assert(d>15,`Walker moves over time: ${d}`));
 a.setMode('walk');const target=walkers[0];let approachable=false;
 for(let i=0;i<16;i++){const angle=i*Math.PI/8;a.walk.x=target.g.position.x+Math.cos(angle)*2.5;a.walk.z=target.g.position.z+Math.sin(angle)*2.5;a.camera.position.y=a.terrainH(a.walk.x,a.walk.z)+1.72;if(a.residentGroundClear(a.walk.x,a.walk.z)&&a.residentCanGreet(target)){approachable=true;break;}}
 assert(approachable,'A walker can be approached');a.selectPeriod(0);a.updateResidents(0,200);assert(!nodes.get('greet-person').hidden,'Nearby greeting is exposed');a.greetResident();assert(nodes.get('resident-words').textContent.length>5,'Greeting displays a line');assert(!nodes.get('resident-speech').hidden);
 a.updateResidents(.05,207);assert(nodes.get('resident-speech').hidden,'Speech expires');a.setMode('sail');a.updateResidents(.05,208);assert(nodes.get('greet-person').hidden,'Greeting hidden outside walk mode');
 console.log(`Residents: ${a.residents.length}; 3-minute walks: ${traveled.map(d=>d.toFixed(1)+'m').join(', ')}; obstacles, ground following, approach, greeting and expiry passed.`);
 a.focusRegion('all');assert(a.ctrl.tDist>800);assert.equal(body.dataset.region,'all');
 a.parkEntry();assert.equal(body.dataset.region,'park');assert.equal(a.walk.z,-437);assert(a.worldWalkHeight(0,-230)>3,'Raised bridge supports walking');assert(a.terrainH(0,-510)>4,'Park land exists');assert(a.terrainH(260,-475)<0,'Pier is accessible from deep water');
 // Traverse the full boardwalk in both directions without camera falling into the sea.
 a.walk.x=0;a.walk.z=-90;a.walk.yaw=0;a.keys.w=true;
 for(let i=0;i<850;i++){a.updateWalk(.05,i*.05);assert(a.camera.position.y>a.worldWalkHeight(a.walk.x,a.walk.z)+1.5,'Camera stays above walking surface');}
 a.clearInput();assert(a.walk.z<-438,`Crossed bridge to park (${a.walk.z})`);
 a.walk.x=0;a.walk.z=-435;a.walk.yaw=Math.PI;a.keys.w=true;
 for(let i=0;i<880;i++)a.updateWalk(.05,i*.05);
 a.clearInput();assert(a.walk.z>-95,`Returned to island (${a.walk.z})`);
 a.parkEntry();let count=0;
 for(const ride of a.parkModule.rides.filter(r=>r.pov)){
  nodes.get('attraction-select').value=ride.id;a.rideAttraction();assert.equal(body.dataset.mode,'ride');
  for(let i=0;i<60;i++){a.animateResort(.05,i*.05);a.updateParkCamera(.05);assert(a.camera.position.toArray().every(Number.isFinite));assert(a.camera.position.z<-280,`${ride.name} stays on amusement island`);}
  a.leaveParkRide();assert.equal(body.dataset.mode,'walk');assert(a.walk.z<-280);count++;
 }
 a.ship.x=224;a.ship.z=-475;a.setMode('sail');a.ship.x=224;a.ship.z=-475;a.animateResort(.05,50);nodes.get('travel-action').onclick();assert.equal(body.dataset.mode,'walk');assert.equal(a.walk.x,212);assert.equal(a.walk.z,-475);
 console.log(`Merged world: bridge crossed both ways, ${count} ride seats checked, ride exit and boat landing passed. ${a.resortInstances.batches.length} instanced park batches.`);
 let meshes=0,visible=0;a.scene.traverse(o=>{if(o.isMesh){meshes++;if(o.visible)visible++;}});
 console.log(`Mesh objects ${meshes}; directly visible ${visible}.`);
 console.log(`${width}x${height}: scene initialized (${meshes} meshes), all 5 modes, fishing state changes, boat departure, input reset, 3 lighting presets passed.`);
}
test(1440,900);test(390,844);
console.log('All inline scripts parse. Tests use real Three.js scene objects with mocked DOM/renderer; GPU and visual rendering are not covered.');
