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
 const exported=scripts[2].replace('\nsetMode(MODE.VIEW);','globalThis.api={setMode,MODE,walk,ship,fish,keys,castPress,castRelease,updateWalk,updateSail,updateFishing,updateAtmosphere,selectPeriod,drawMap,terrainH,DOCK_DIR,DOCK_ANG,scene,camera,ctrl,clearInput,seaUniforms,periods,residents,updateResidents,greetResident,residentCanGreet,residentGroundClear,parkModule,animateResort,focusRegion,parkEntry,rideAttraction,leaveParkRide,updateParkCamera,worldWalkHeight,resortInstances,harborBuildings,harborFacadeCount,harborVisitors,harborShips,harborStreetObstacles,harborStalls,harborRoutes,harborStaff,animateHarborLife,strollHarbor,focusHarbor,visitHarbor,goHarborBuilding,harborInteract,updateHarbor,exitHarborBuilding,resolveHarborWalk,sweepHarborMotion,harborCollisionWorld,harborRectContains,harborPeopleColliders,stepHarborCrowd,harborNearbySolids,harborStationaryPeople,getHarborState:()=>({active:activeHarborBuilding,floor:harborFloor,nearby:harborNearby})};\nsetMode(MODE.VIEW);');
 vm.runInContext(exported,c,{timeout:20000});assert.deepEqual(errors,[],errors.join('\n'));assert(renders>0,'Initial render reached');const a=c.api;assert(a,'API initialized');assert.equal(body.dataset.region,'harbor','Opens directly in the street');a.focusRegion('island');
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

 // Every landmark must be reachable, enterable and traversable on both floors.
 const landmarks=a.harborBuildings.filter(b=>!b.decorative);
 assert.equal(landmarks.length,5);assert(a.harborFacadeCount>=15,'Dense streets contain many buildings');
 assert.equal(a.harborVisitors.length,width<560?44:80);assert.equal(a.harborShips.length,7);
 // Continuous collision checks prevent a whole frame from crossing thin solids.
 for(const wall of [{x:0,z:0,w:.12,d:20},{x:0,z:0,w:20,d:.12}]){
  const acrossX=wall.w<wall.d;
  for(const direction of [-1,1]){
   const start=acrossX?{x:-5*direction,z:-8}:{x:-8,z:-5*direction};
   const end=acrossX?{x:15*direction,z:8}:{x:8,z:15*direction};
   const p=a.sweepHarborMotion(start,end,[wall]);
   assert(!a.harborRectContains(p,wall));assert((acrossX?p.x:p.z)*direction<-.87,'Large diagonal step stops on the near side of a thin wall');
  }
 }
 const corner=[{x:0,z:0,w:.15,d:10},{x:4.9,z:4.9,w:10,d:.15}];
 const stopped=a.sweepHarborMotion({x:-3,z:-3},{x:20,z:20},corner);
 assert(stopped.x<-.89&&stopped.z<4.01,'Sliding cannot squeeze through a joined corner');
 const overlapping=[{x:0,z:0,w:4,d:4},{x:3,z:0,w:4,d:4}];
 const recovered=a.sweepHarborMotion({x:1.5,z:0},{x:1.5,z:0},overlapping);
 assert(overlapping.every(r=>!a.harborRectContains(recovered,r)),'Recovery leaves every overlapping collider');
 const column=a.resolveHarborWalk(625,-385,635,-385,false);
 assert(column.x<627.2,'Market columns block movement');
 const bench=a.resolveHarborWalk(353,-94,353,-101,false);
 assert(bench.z>-96.6,'Quay benches block movement');
 const lamp=a.resolveHarborWalk(342,-99,350,-99,false);
 assert(lamp.x<345,'Lamp posts block movement');
 const quay=a.resolveHarborWalk(580,-94,580,-80,false);
 assert(quay.z<-90.8,'Cannot walk off the stone quay through its vertical edge');
 a.strollHarbor();a.walk.x=504;a.walk.z=-238;a.walk.yaw=0;a.walk.vx=a.walk.vz=0;a.keys.w=a.keys.shift=true;
 for(let i=0;i<12;i++)a.updateWalk(.5,i*.5);a.clearInput();
 assert(a.walk.z>-241.7,'Running during long frames cannot cross a shop back wall');
 a.animateHarborLife(.05,10);const tramX=380+10/150/.45*510;
 const pushed=a.resolveHarborWalk(tramX,-154,tramX,-154,false);
 assert(!a.harborRectContains(pushed,{x:tramX,z:-154,w:11,d:3.8}),'Moving tram contact separates the player');
 assert(a.harborCollisionWorld.every(r=>!a.harborRectContains(pushed,r)),'Tram cannot push the player into scenery');
 const person=a.harborVisitors[0].p.g.position;
 const personStop=a.resolveHarborWalk(person.x-4,person.z,person.x+4,person.z);
 assert(personStop.x<person.x-1.1,'The player cannot walk straight through a pedestrian');
 console.log(`Harbour collision: ${a.harborCollisionWorld.length} static volumes; thin-wall sweeps, corners, overlap recovery, poles, benches, quay edges, running and tram contact passed.`);
 a.scene.updateMatrixWorld(true);
 const solids=[];a.scene.traverse(o=>{if(o.isMesh&&o.visible&&!Array.isArray(o.material)&&(!o.material.transparent||o.material.opacity>.8))solids.push(o);});
 for(const b of landmarks){
  const ray=new THREE.Raycaster(new THREE.Vector3(b.x-b.w/2+13,16.02,b.z+b.d/2-2),new THREE.Vector3(0,0,1),0,8);
  assert.equal(ray.intersectObjects(solids,false).length,0,b.name+' upstairs window has an actual view through the facade');
 }
 a.focusHarbor();assert.equal(body.dataset.region,'harbor');assert(a.ctrl.tTarget.x>600);
 // New street details must preserve continuous walking routes and open shop interiors.
 a.strollHarbor();a.keys.w=true;
 for(let i=0;i<85;i++)a.updateWalk(.05,i*.05);a.clearInput();a.updateHarbor(.05,5);
 assert.equal(a.getHarborState().nearby?.type,'door','Can walk from the opening street scene to the hotel');
 assert.equal(a.getHarborState().nearby?.b.id,'hotel');
 a.walk.x=618;a.walk.z=-345;a.walk.yaw=0;a.walk.vx=a.walk.vz=0;a.keys.w=true;
 for(let i=0;i<180;i++)a.updateWalk(.05,i*.05);a.clearInput();
 assert(a.walk.z<-420,`The covered market can be crossed from end to end (${a.walk.x},${a.walk.z})`);
 a.walk.x=504;a.walk.z=-177;a.walk.yaw=0;a.walk.vx=a.walk.vz=0;a.keys.w=true;
 for(let i=0;i<70;i++)a.updateWalk(.05,i*.05);a.clearInput();
 assert(a.walk.z<-204,'An arcade shop can be entered directly from the street');
 for(const b of landmarks)assert(b.roomGroups>4,b.name+' contains usable furniture groups');
 for(const t of [0,40,110]){
  a.animateHarborLife(.05,t);
  for(const v of a.harborVisitors){const p=v.p.g.position,adjusted=a.resolveHarborWalk(p.x,p.z,p.x,p.z,false);assert(Math.hypot(adjusted.x-p.x,adjusted.z-p.z)<.01,`Pedestrian route avoids obstacles at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);}
 }
 for(const b of landmarks){
  nodes.get('harbor-building').value=b.id;a.goHarborBuilding();a.updateHarbor(.05,100);
  assert.equal(a.getHarborState().nearby?.type,'door',b.name+' entry is discoverable');
  a.harborInteract();assert.equal(a.getHarborState().active,b);assert.equal(body.dataset.mode,'walk');
  // Walk into the room before navigating around the furniture to the stair foot.
  a.walk.yaw=0;a.keys.w=true;for(let i=0;i<12;i++)a.updateWalk(.05,i*.05);a.clearInput();
  assert(a.walk.z<b.z+b.d/2-6,'Can walk through the entrance');
  a.walk.x=b.x+b.stairX;a.walk.z=b.z+12;a.walk.yaw=0;a.keys.w=true;
  for(let i=0;i<85;i++)a.updateWalk(.05,i*.05);a.clearInput();
  assert.equal(a.getHarborState().floor,1,b.name+' upstairs landing reached');
  assert(a.walk.z<b.z-14,`Climbed all steps (${a.walk.z-b.z})`);
  assert(Math.abs(a.worldWalkHeight(a.walk.x,a.walk.z)-14.3)<.01,'Upper floor supports player');
  assert(Math.abs(a.camera.position.y-16.02)<.3,'Camera follows upper floor');
  const stairSide=a.resolveHarborWalk(b.x+b.stairX-6,b.z+11.1,b.x+b.stairX,b.z+9.7,false);
  assert.equal(a.getHarborState().floor,1);assert(a.worldWalkHeight(stairSide.x,stairSide.z)>14.2,'Upper corridor cannot drop into the foot of the stairwell');
  const e=b.exhibitPoints[1];a.walk.x=e.x;a.walk.z=e.z;a.updateHarbor(.05,110);
  assert.equal(a.getHarborState().nearby?.type,'exhibit');a.harborInteract();
  // Solid walls and furniture constrain movement on the occupied floor.
  const wall=a.resolveHarborWalk(b.x,b.z,b.x-b.w,b.z);assert(wall.x>=b.x-b.w/2+1.3);
  const furniture=b.furniture.find(o=>o.floor===1&&o.w>3);
  const coll=a.resolveHarborWalk(b.x+furniture.x,b.z+furniture.z+furniture.d/2+1,b.x+furniture.x,b.z+furniture.z+furniture.d/2-.1);
  assert(coll.z>=b.z+furniture.z+furniture.d/2+.8,'Cannot walk through furniture');
  a.walk.x=b.x+b.stairX;a.walk.z=b.z-16;a.walk.yaw=Math.PI;a.keys.w=true;
  for(let i=0;i<85;i++)a.updateWalk(.05,i*.05);a.clearInput();
  assert.equal(a.getHarborState().floor,0,b.name+' downstairs landing reached');
  assert(Math.abs(a.worldWalkHeight(a.walk.x,a.walk.z)-4.3)<.01);
  a.walk.x=b.x;a.walk.z=b.z+b.d/2-3;a.updateHarbor(.05,120);
  assert.equal(a.getHarborState().nearby?.type,'exit');a.harborInteract();
  assert.equal(a.getHarborState().active,null);assert.equal(a.walk.z,b.entry.z);
  const exterior=a.resolveHarborWalk(b.x,b.entry.z,b.x,b.z+b.d/2-.1);
  assert(exterior.z>=b.z+b.d/2+.8,'Exterior facade blocks walking through walls');
 }
 // Switching region or travel mode cleans up the active interior and door state.
 a.goHarborBuilding();a.updateHarbor(.05,130);a.harborInteract();assert(a.getHarborState().active);
 a.focusRegion('island');assert.equal(a.getHarborState().active,null);assert(landmarks.every(b=>!b.doorOpen));
 a.visitHarbor();assert(a.worldWalkHeight(a.walk.x,a.walk.z)>4,'Harbour arrival is on its dock');
 nodes.get('harbor-sail').onclick();assert.equal(body.dataset.mode,'sail');assert(a.terrainH(a.ship.x,a.ship.z)<-1.6,'Harbour boat spawns in navigable water');
 a.updateHarbor(.05,140);nodes.get('travel-action').onclick();assert.equal(body.dataset.region,'harbor');assert.equal(body.dataset.mode,'walk');assert.equal(a.walk.x,638);
 a.setMode('sail');a.ship.x=309;a.ship.z=-200;a.ship.yaw=Math.PI/2;a.ship.spd=0;a.keys.w=true;
 for(let i=0;i<240;i++){a.updateSail(.05,i*.05);assert(a.terrainH(a.ship.x,a.ship.z)<-1.5,'Seawall collision pushes the boat toward water');}a.clearInput();
 console.log(`Victoria Harbour: ${landmarks.length} interiors, ${a.harborFacadeCount} street buildings, 7 ships, ${a.harborVisitors.length} pedestrians; doors, stairs up/down, exhibits, wall/furniture collisions, mode cleanup and dock landing passed.`);
 // Sustained crowd simulation catches contacts missed by checking isolated path samples.
 a.focusRegion('harbor');const walkedBefore=a.harborVisitors.map(v=>v.distanceWalked);
 for(let frame=0;frame<1800;frame++){
  const old=a.harborVisitors.map(v=>v.p.g.position.clone());a.stepHarborCrowd(.05);
  a.harborVisitors.forEach((v,i)=>assert(v.p.g.position.distanceTo(old[i])<=v.speed*.05+.01,'Crowd moves continuously without teleporting'));
  if(frame%10===0){
   a.harborVisitors.forEach((v,i)=>{
    const p=v.p.g.position;assert(a.harborNearbySolids(p.x,p.z).every(r=>!a.harborRectContains(p,r,.49)),`Pedestrian ${i} avoids static geometry at ${p.x},${p.z}`);
    for(let j=i+1;j<a.harborVisitors.length;j++)assert(p.distanceTo(a.harborVisitors[j].p.g.position)>.98,`Pedestrians ${i}/${j} remain separate`);
   });
  }
 }
 const walkingCount=a.harborVisitors.filter((v,i)=>v.distanceWalked-walkedBefore[i]>10).length;
 assert(walkingCount>a.harborVisitors.length*.75,'Most pedestrians continue along their routes instead of becoming stuck');
 a.strollHarbor();let playerSpot;
 for(const v of a.harborVisitors){if(v.route!==a.harborVisitors[0].route)continue;const p={x:v.p.g.position.x+(v.forward?3:-3),z:v.p.g.position.z};if(a.harborVisitors.every(n=>Math.hypot(n.p.g.position.x-p.x,n.p.g.position.z-p.z)>1.6)){playerSpot=p;break;}}
 assert(playerSpot,'A free position exists in a pedestrian route');a.walk.x=playerSpot.x;a.walk.z=playerSpot.z;
 for(let i=0;i<400;i++){
  a.stepHarborCrowd(.05);
  for(const v of a.harborVisitors)assert(Math.hypot(v.p.g.position.x-a.walk.x,v.p.g.position.z-a.walk.z)>1.28,'Pedestrians avoid a stationary player');
 }
 assert.equal(a.walk.x,playerSpot.x);assert.equal(a.walk.z,playerSpot.z);
 console.log(`Crowd: 90-second obstacle and separation simulation, ${walkingCount} moving pedestrians, continuous steps and 20 seconds avoiding a stationary player passed.`);
 let meshes=0,visible=0;a.scene.traverse(o=>{if(o.isMesh){meshes++;if(o.visible)visible++;}});
 console.log(`Mesh objects ${meshes}; directly visible ${visible}.`);
 console.log(`${width}x${height}: scene initialized (${meshes} meshes), all 5 modes, fishing state changes, boat departure, input reset, 3 lighting presets passed.`);
}
test(1440,900);test(390,844);
console.log('All inline scripts parse. Tests use real Three.js scene objects with mocked DOM/renderer; GPU and visual rendering are not covered.');
