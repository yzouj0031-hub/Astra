const fs=require('fs'),vm=require('vm'),assert=require('assert');
const HTML=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
// External feature clients are tested separately; this harness executes only inline game scripts.
const scripts=[...HTML.matchAll(/<script(?![^>]*\bsrc=)(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
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
 const onlineSamples=[];sandbox.AstraOnline={init:options=>({update:()=>onlineSamples.push(options.getPose())})};
 const c=vm.createContext(sandbox);vm.runInContext(scripts[1],c);
 const exported=scripts[2].replace('\nsetMode(MODE.VIEW);','globalThis.api={setMode,MODE,walk,ship,fish,keys,castPress,castRelease,updateWalk,updateSail,updateFishing,updateAtmosphere,selectPeriod,drawMap,terrainH,DOCK_DIR,DOCK_ANG,scene,camera,ctrl,clearInput,seaUniforms,periods,residents,updateResidents,greetResident,residentCanGreet,residentGroundClear,parkModule,animateResort,focusRegion,parkEntry,rideAttraction,leaveParkRide,updateParkCamera,worldWalkHeight,resortInstances,harborBuildings,harborFacadeCount,harborVisitors,harborShips,harborStreetObstacles,harborStalls,harborRoutes,harborStaff,animateHarborLife,strollHarbor,focusHarbor,visitHarbor,goHarborBuilding,harborInteract,updateHarbor,exitHarborBuilding,resolveHarborWalk,sweepHarborMotion,harborCollisionWorld,harborRectContains,harborPeopleColliders,stepHarborCrowd,harborNearbySolids,harborStationaryPeople,harborBuildingAt,syncHarborInterior,harborLandmarks,getHarborState:()=>({active:activeHarborBuilding,floor:harborFloor,nearby:harborNearby}),tick,localOnlinePose,upsertRemotePlayer,removeRemotePlayer,animateRemotePlayers,remotePlayers,car,roadster,player,carRect,vehicleHalfExtents,CAR_TOP,CAR_DISCS,CAR_DISC_R,CAR_HALF_WIDTH,CAR_HALF_LENGTH,CAR_R,vehicleDiscRects,chaseBlocked,updateDrive,updateActors,updateWalkCamera:placeChaseCamera,enterCar,exitCar,toggleVehicle,toggleCameraView,resolveVehicle,carGroundY,carExitSpot,pickMode,CAR_R,getVehicleNear:()=>vehicleNear,getShipNear:()=>shipNear,shipStepOff,leaveShip,boardShip,shipHullDistance,summonShip,DOCK_SHORE,shoreRadius,playerJump,jumpAction,waterDepth,seaAt,updateSplash,WADE,worldWalkHeight2:worldWalkHeight,obstacles,plane,seaplane,updateFly,boardPlane,leavePlane,planeStepOff,updateMooredPlane,planeGroundAt,planeOverLand,airHazards,resortWorldPoint,lighthousePos,getPlaneNear:()=>planeNear,getHitch:()=>hitch,getHitchNear:()=>hitchNear,PLANE_BOARD_R,getThrottleHeld:()=>throttleHeld,setBrakeHeld:v=>{brakeHeld=v},PLANE_STALL,PLANE_ROTATE,PLANE_CEIL,PLANE_EDGE,PLANE_FLOAT};\nsetMode(MODE.VIEW);');
 vm.runInContext(exported,c,{timeout:20000});assert.deepEqual(errors,[],errors.join('\n'));assert(renders>0,'Initial render reached');const a=c.api;assert(a,'API initialized');assert.equal(body.dataset.region,'harbor','Opens directly in the street');a.focusRegion('island');
 for(const mode of Object.values(a.MODE)){a.setMode(mode);assert.equal(body.dataset.mode,mode);}
 a.setMode('fish');a.updateFishing(.016,1);
 const outward={x:-Math.sin(a.fish.yaw),z:-Math.cos(a.fish.yaw)};
 assert(outward.x*a.DOCK_DIR.x+outward.z*a.DOCK_DIR.y>.999,'Fishing camera faces out to sea');
 a.castPress();assert.equal(a.fish.state,'cast');for(let i=0;i<80;i++)a.updateFishing(.016,i*.016);assert.equal(a.fish.state,'wait');
 a.fish.state='bite';a.castPress();assert.equal(a.fish.state,'fight');a.castPress();assert(a.fish.pulling);a.castRelease();assert(!a.fish.pulling);
 assert(a.terrainH(a.ship.x,a.ship.z)<-1.6,'Sailboat is moored in navigable water');
 a.setMode('sail');assert(Math.sin(a.ship.yaw)*a.DOCK_DIR.x+Math.cos(a.ship.yaw)*a.DOCK_DIR.y>.999,'Boat points out to sea');assert(a.shipStepOff(),'There is always a side to step off onto');
 a.keys.w=true;const sx=a.ship.x,sz=a.ship.z;for(let i=0;i<180;i++)a.updateSail(.016,i*.016);assert(Math.hypot(a.ship.x-sx,a.ship.z-sz)>10,'Boat can leave harbor');
 a.clearInput();assert(!a.keys.w);a.setMode('walk');a.keys.w=true;for(let i=0;i<60;i++)a.updateWalk(.016,i*.016);assert(Number.isFinite(a.camera.position.y));a.clearInput();
 // Walking off the beach wades into the sea and starts a swim instead of hitting an invisible wall.
 // Islanders are parked inland so a wandering body cannot block the walk to the water.
 // Pick a stretch of beach with no rocks or palms in the way; scenery placement is random per run.
 let beach=null;
 for(let i=0;i<48&&beach===null;i++){
  const ang=a.DOCK_ANG+.3+i*.13, R=a.shoreRadius(ang);
  let open=true;
  for(let r=R-22;r<=R+8&&open;r+=1.2){
   const x=Math.cos(ang)*r,z=Math.sin(ang)*r;
   if(a.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+1.7)) open=false;
  }
  if(open) beach=ang;
 }
 assert(beach!==null,'Found an unobstructed stretch of beach');
 {const parked=a.residents.map(n=>({n,x:n.g.position.x,z:n.g.position.z}));
  a.residents.forEach(n=>{n.g.position.x=0;n.g.position.z=0;});
  a.setMode('walk');a.walk.x=Math.cos(beach)*(a.shoreRadius(beach)-20);a.walk.z=Math.sin(beach)*(a.shoreRadius(beach)-20);
  a.walk.y=a.worldWalkHeight(a.walk.x,a.walk.z);a.walk.vx=a.walk.vz=0;a.walk.swim=false;a.walk.air=false;a.walk.climb=null;
  assert(a.terrainH(a.walk.x,a.walk.z)>0,'The swim starts from dry sand');
  const seaward=()=>{a.walk.yaw=Math.atan2(-a.walk.x,-a.walk.z);},inland=()=>{a.walk.yaw=Math.atan2(a.walk.x,a.walk.z);};
  a.keys.w=true;
  for(let i=0;i<200&&!a.walk.swim;i++){seaward();a.updateWalk(.05,i*.05);}
  a.clearInput();
  assert(a.walk.swim,`Walking into the sea starts a swim (ground=${a.worldWalkHeight(a.walk.x,a.walk.z).toFixed(2)})`);
  assert(Math.abs(a.walk.y-a.seaAt(a.walk.x,a.walk.z))<.6,'A swimmer floats at the surface, not on the seabed');
  assert(a.camera.position.y>a.seaAt(a.camera.position.x,a.camera.position.z),'The chase camera stays above water while swimming');
  assert(a.localOnlinePose().kind==='swim','Swimming is published to co-op peers');
  a.keys.w=true;
  for(let i=0;i<300&&a.walk.swim;i++){inland();a.updateWalk(.05,i*.05);}
  assert(!a.walk.swim,'Swimming back to the beach ends the swim');
  for(let i=0;i<80;i++){inland();a.updateWalk(.05,i*.05);}
  a.clearInput();
  assert(a.terrainH(a.walk.x,a.walk.z)>0,`Waded out onto dry sand (${a.terrainH(a.walk.x,a.walk.z).toFixed(2)})`);
  assert(!a.walk.climb,'A gentle beach needs no climbing');
  parked.forEach(p=>{p.n.g.position.x=p.x;p.n.g.position.z=p.z;});}
 // Jumping: off the ground, through the air, and a dive that ends in the water.
 {a.setMode('walk');a.walk.x=Math.cos(beach)*(a.shoreRadius(beach)-20);a.walk.z=Math.sin(beach)*(a.shoreRadius(beach)-20);
  a.walk.swim=false;a.walk.air=false;a.walk.climb=null;a.walk.vy=0;
  a.walk.y=a.worldWalkHeight(a.walk.x,a.walk.z);a.walk.vx=a.walk.vz=0;
  assert(a.terrainH(a.walk.x,a.walk.z)>0.5,'The jump starts from dry sand');
  const stand=a.walk.y;a.playerJump();assert(a.walk.air,'Space leaves the ground');
  let peak=stand;for(let i=0;i<80&&a.walk.air;i++){a.updateWalk(.02,i*.02);peak=Math.max(peak,a.walk.y);}
  assert(peak>stand+0.8,`The jump clears the ground (${(peak-stand).toFixed(2)}m from ${stand.toFixed(2)}, swim=${a.walk.swim})`);
  assert(!a.walk.air&&Math.abs(a.walk.y-a.worldWalkHeight(a.walk.x,a.walk.z))<.05,`Gravity brings the jump back down onto the ground (air=${a.walk.air} y=${a.walk.y.toFixed(3)})`);
  // Step off the raised boardwalk and fall into the sea below.
  a.walk.x=0;a.walk.z=-200;a.walk.y=a.worldWalkHeight(0,-200);a.walk.vx=a.walk.vz=0;
  assert(a.walk.y>4,'Standing on the bridge deck');
  a.walk.yaw=Math.PI/2;a.keys.w=true;
  for(let i=0;i<40;i++)a.updateWalk(.02,i*.02);
  assert(Math.abs(a.walk.x)>3.1&&!a.walk.air,'Walking into the bridge rail stops at the edge');
  a.playerJump();
  for(let i=0;i<160&&!a.walk.swim;i++)a.updateWalk(.02,i*.02);
  a.clearInput();assert(a.walk.swim,'Jumping over the rail drops you into the sea');
  assert(Math.abs(a.walk.x)>3.7,'The jump cleared the rail that blocks walking');}
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
 a.setMode('walk');nodes.get('park-sail').onclick();assert.equal(body.dataset.mode,'sail');assert.equal(a.ship.x,224);assert.equal(body.dataset.region,'park');
 a.animateResort(.05,50);a.updateActors(.2,50);assert(!nodes.get('travel-action').hidden&&!nodes.get('travel-action').disabled,'Stepping off is always offered');
 // Off the pier's end there is only water beside the hull, so stepping off is a jump into the sea.
 nodes.get('travel-action').onclick();assert.equal(body.dataset.mode,'walk');assert.equal(body.dataset.region,'park');
 assert(a.walk.swim,'Stepping off over deep water starts a swim');
 assert(a.shipHullDistance(a.walk.x,a.walk.z)>0,'The step-off point is outside the hull');
 assert(Math.hypot(a.walk.x-a.ship.x,a.walk.z-a.ship.z)<7,'Stepping off lands beside the boat, not across the bay');
 assert.equal(a.ship.x,224,'The boat stays exactly where it was left');
 // Swim west to the pier and climb out onto its deck.
 a.walk.yaw=Math.PI/2;a.keys.w=true;
 for(let i=0;i<200&&!a.walk.climb&&a.walk.swim;i++)a.updateWalk(.05,i*.05);
 a.clearInput();assert(a.walk.climb,'Swimming into the pier starts a climb out of the water');
 for(let i=0;i<20;i++)a.updateWalk(.05,i*.05);
 assert(!a.walk.swim&&!a.walk.climb,'The climb finishes on land');
 assert(a.worldWalkHeight(a.walk.x,a.walk.z)>5&&Math.abs(a.walk.y-a.worldWalkHeight(a.walk.x,a.walk.z))<.05,'Climbed onto the pier deck');
 // Walk back along the pier to the hull and board again.
 a.walk.x=a.ship.x-a.shipHullDistance(a.ship.x-3,a.ship.z)*0;a.walk.x=221;a.walk.z=-475;a.walk.y=5.15;
 for(let i=0;i<10;i++)a.updateActors(.05,i*.05);
 assert(a.getShipNear(),'The boat is within boarding reach from the pier');assert(!nodes.get('vehicle-interact').hidden&&nodes.get('vehicle-interact').textContent.includes('上船'));
 a.toggleVehicle();assert.equal(body.dataset.mode,'sail');assert(Math.abs(a.ship.x-224)<6&&Math.abs(a.ship.z+475)<6,'Boarding resumes from the moored boat');
 // Walk away, then the dock-bar button returns to wherever the boat is.
 a.leaveShip();a.walk.x=0;a.walk.z=-437;a.walk.swim=false;a.walk.y=a.worldWalkHeight(0,-437);a.updateActors(.05,61);
 assert(!a.getShipNear());a.pickMode('sail');assert.equal(body.dataset.mode,'sail');assert(Math.abs(a.ship.x-224)<6,'Sail button rejoins the moored boat instead of respawning it');
 // Beach landing on the main island: run the boat aground-adjacent and step straight onto dry sand.
 {const ang=beach,r=a.shoreRadius(ang);a.ship.x=Math.cos(ang)*r;a.ship.z=Math.sin(ang)*r;a.ship.yaw=Math.atan2(-a.ship.x,-a.ship.z);
  a.leaveShip();assert.equal(body.dataset.mode,'walk');assert.equal(body.dataset.region,'island');
  assert(Math.hypot(a.walk.x-a.ship.x,a.walk.z-a.ship.z)<6,'You step off the side, not across the bay');
  assert(a.terrainH(a.ship.x,a.ship.z)<0,'The boat is left floating where it stopped');
  // Beached bow-in: step off into the shallows and walk straight up the sand, no climb.
  a.keys.w=true;   // head inland every frame: forward is -(sin yaw, cos yaw), so aim at the island centre
  for(let i=0;i<220;i++){a.walk.yaw=Math.atan2(a.walk.x,a.walk.z);a.updateWalk(.05,i*.05);}
  a.clearInput();assert(!a.walk.swim&&!a.walk.climb,'The gentle beach needs no climbing');
  assert(a.terrainH(a.walk.x,a.walk.z)>0,'Waded ashore from the boat');
  a.walk.x=a.ship.x;a.walk.z=a.ship.z;a.updateWalk(.05,0);assert(a.shipHullDistance(a.walk.x,a.walk.z)>0.3,'Walker is pushed out of the hull');}
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
 for(let i=0;i<180;i++){if(i%2)a.stepHarborCrowd(.1);a.updateWalk(.05,i*.05);}a.clearInput();a.updateHarbor(.05,5);
 assert.equal(a.getHarborState().active?.id,'hotel','Walking up the opening street carries you into the hotel, with no key press');
 assert(!nodes.get('harbor-exit').hidden,'The interior panel opens on its own');
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
  assert.equal(a.getHarborState().active,null,b.name+' is still outside before the threshold is crossed');
  // Walking straight ahead from the approach is the whole entry: no prompt, no teleport.
  a.walk.yaw=0;a.walk.vx=a.walk.vz=0;a.keys.w=true;
  const approach={x:a.walk.x,z:a.walk.z};let crossed=-1;
  for(let i=0;i<90;i++){if(i%2)a.stepHarborCrowd(.1);a.updateWalk(.05,i*.05);if(crossed<0&&a.getHarborState().active===b)crossed=i;}
  a.clearInput();
  assert(crossed>0,b.name+' can be walked into from the street');
  assert(a.walk.z<approach.z-1,'The player really travelled, rather than being placed inside');
  assert.equal(a.getHarborState().active,b);assert.equal(body.dataset.mode,'walk');
  assert(a.walk.z<b.z+b.d/2-6,'Can walk through the entrance');
  assert(Math.abs(a.worldWalkHeight(a.walk.x,a.walk.z)-4.3)<.01,'Ground floor supports the player');
  a.walk.x=b.x+b.stairX;a.walk.z=b.z+12;a.walk.yaw=0;a.keys.w=true;
  for(let i=0;i<85;i++)a.updateWalk(.05,i*.05);a.clearInput();
  assert.equal(a.getHarborState().floor,1,b.name+' upstairs landing reached');
  assert(a.walk.z<b.z-14,`Climbed all steps (${a.walk.z-b.z})`);
  assert(Math.abs(a.worldWalkHeight(a.walk.x,a.walk.z)-14.3)<.01,'Upper floor supports player');
  assert(a.camera.position.y>14.7&&a.camera.position.y<18,`Camera follows the upper floor (${a.camera.position.y.toFixed(2)})`);
  assert(Math.hypot(a.camera.position.x-a.walk.x,a.camera.position.z-a.walk.z)<7,'Chase camera stays with the player upstairs');
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
  // Leaving is the same doorway in reverse.
  a.walk.x=b.x;a.walk.z=b.z+b.d/2-6;a.walk.yaw=Math.PI;a.walk.vx=a.walk.vz=0;a.updateHarbor(.05,120);
  assert.equal(a.getHarborState().active,b);
  a.keys.w=true;for(let i=0;i<90;i++){if(i%2)a.stepHarborCrowd(.1);a.updateWalk(.05,i*.05);}a.clearInput();
  assert.equal(a.getHarborState().active,null,b.name+' can be walked out of');
  assert(a.walk.z>b.z+b.d/2+3,'The player ends up back on the street');
  assert(Math.abs(a.worldWalkHeight(a.walk.x,a.walk.z)-4.15)<.2,'Back on the roadway');
  // Only the 8 m doorway is open; the rest of the facade is still a wall.
  for(const offset of [-b.w/4,-6,6,b.w/4]){
   const through=a.resolveHarborWalk(b.x+offset,b.entry.z,b.x+offset,b.z-b.d/2,false);
   assert(!a.harborBuildingAt(through.x,through.z),`Facade at x+${offset} blocks walking through the wall`);
  }
  const back=a.resolveHarborWalk(b.x,b.z-b.d/2-6,b.x,b.z,false);
  assert(!a.harborBuildingAt(back.x,back.z),'The back wall blocks entry');
  for(const side of [-1,1]){
   const flank=a.resolveHarborWalk(b.x+side*(b.w/2+6),b.z-10,b.x,b.z-10,false);
   assert(!a.harborBuildingAt(flank.x,flank.z),'The side walls block entry');
  }
  // The panel shortcut still puts you back on the approach.
  a.walk.x=b.x;a.walk.z=b.z;a.syncHarborInterior();assert.equal(a.getHarborState().active,b);
  a.exitHarborBuilding();assert.equal(a.getHarborState().active,null);assert.equal(a.walk.z,b.entry.z);
 }
 // Switching region or travel mode cleans up the active interior and door state.
 a.goHarborBuilding();a.walk.x=landmarks[0].x;a.walk.z=landmarks[0].z;a.updateHarbor(.05,130);assert(a.getHarborState().active);
 a.focusRegion('island');assert.equal(a.getHarborState().active,null);assert(landmarks.every(b=>!b.doorOpen));
 a.visitHarbor();assert(a.worldWalkHeight(a.walk.x,a.walk.z)>4,'Harbour arrival is on its dock');
 nodes.get('harbor-sail').onclick();assert.equal(body.dataset.mode,'sail');assert(a.terrainH(a.ship.x,a.ship.z)<-1.6,'Harbour boat spawns in navigable water');
 a.updateHarbor(.05,140);nodes.get('travel-action').onclick();assert.equal(body.dataset.region,'harbor');assert.equal(body.dataset.mode,'walk');
 assert(a.walk.swim,'Stepping off in the harbour drops you in the water');
 a.walk.yaw=Math.PI/2;a.keys.w=true;
 for(let i=0;i<200&&!a.walk.climb&&a.walk.swim;i++)a.updateWalk(.05,i*.05);
 a.clearInput();assert(a.walk.climb,'Swimming into the timber pier starts a climb');
 for(let i=0;i<20;i++)a.updateWalk(.05,i*.05);
 assert(!a.walk.swim,'The harbour climb finishes on the pier');
 assert(a.worldWalkHeight(a.walk.x,a.walk.z)>4,`Standing on the harbour pier deck (${a.walk.x.toFixed(1)}, ${a.walk.z.toFixed(1)})`);
 assert(a.harborCollisionWorld.every(r=>!a.harborRectContains({x:a.walk.x,z:a.walk.z},r)),'The climb ends clear of the pier edge, not straddling it');
 a.setMode('sail');
 // Jumping off the stone quay is allowed, and the swimmer can always climb back out.
 a.setMode('walk');a.walk.x=580;a.walk.z=-92;a.walk.y=a.worldWalkHeight(580,-92);a.walk.vx=a.walk.vz=0;
 assert(a.walk.y>4,'Standing on the stone quay');
 a.walk.yaw=Math.PI;a.keys.w=true;
 for(let i=0;i<40;i++)a.updateWalk(.02,i*.02);
 assert(!a.walk.swim&&a.walk.z<-90.7,'Walking cannot cross the quay edge');
 a.playerJump();
 for(let i=0;i<160&&!a.walk.swim;i++)a.updateWalk(.02,i*.02);
 a.clearInput();assert(a.walk.swim,'Jumping over the quay edge drops you into the harbour');
 a.walk.yaw=0;a.keys.w=true;
 for(let i=0;i<300&&!a.walk.climb&&a.walk.swim;i++)a.updateWalk(.05,i*.05);
 a.clearInput();assert(a.walk.climb,'Swimming back to the quay finds a way up');
 for(let i=0;i<20;i++)a.updateWalk(.05,i*.05);
 assert(!a.walk.swim&&a.worldWalkHeight(a.walk.x,a.walk.z)>4,`Climbed back onto the quay (${a.walk.z.toFixed(1)})`);
 assert(a.harborCollisionWorld.every(r=>!a.harborRectContains({x:a.walk.x,z:a.walk.z},r)),'Standing clear of the quay edge after climbing');
 // ---- the harbour floatplane: moored, boarded from the pier, flown, landed, left behind ----
 a.setMode('walk');
 assert(a.plane.water,'The floatplane starts on the water');
 assert(a.terrainH(a.plane.x,a.plane.z)<-1.6,'It is moored in navigable water, not on the quay');
 assert(Math.abs(a.plane.y-(a.seaAt(a.plane.x,a.plane.z)+a.PLANE_FLOAT))<.4,'Its floats rest on the surface');
 // Walk out along the timber pier to the aircraft and board it.
 a.visitHarbor();a.walk.x=a.plane.x-7;a.walk.z=a.plane.z;a.walk.y=a.worldWalkHeight(a.walk.x,a.walk.z);
 a.walk.vx=a.walk.vz=0;a.walk.swim=false;a.walk.air=false;
 for(let i=0;i<6;i++)a.updateActors(.05,i*.05);
 assert(a.getPlaneNear(),'The aircraft is within boarding reach of the pier');
 assert(!nodes.get('vehicle-interact').hidden&&nodes.get('vehicle-interact').textContent.includes('上机'),'The board prompt names the aircraft');
 a.toggleVehicle();assert.equal(body.dataset.mode,'fly','F boards the aircraft');
 // Cannot step out in mid-air, and cannot step out until it has slowed down.
 const moored={x:a.plane.x,z:a.plane.z};
 // Take off: throttle up, then pull back once past rotation speed.
 a.keys.shift=true;
 let unstuck=null,runFrames=0;
 for(let i=0;i<600&&a.plane.water;i++){ if(a.plane.spd>a.PLANE_ROTATE)a.keys.w=true; a.updateFly(.02,i*.02); runFrames++; }
 a.clearInput();
 assert(!a.plane.water,'Full throttle and back stick gets the floatplane off the water');
 unstuck={x:a.plane.x,z:a.plane.z};
 const run=Math.hypot(unstuck.x-moored.x,unstuck.z-moored.z);
 assert(run>40&&run<400,`Take-off run is a plausible ${run.toFixed(0)}m`);
 assert(a.plane.spd>a.PLANE_ROTATE,'It leaves the water above rotation speed');
 // Climb away, then check the telemetry and the ceiling.
 a.keys.shift=a.keys.w=true;
 for(let i=0;i<1500;i++)a.updateFly(.02,i*.02);
 a.clearInput();
 const alt=a.plane.y-a.seaAt(a.plane.x,a.plane.z);
 assert(alt>100,`Climbs well clear of the sea (${alt.toFixed(0)}m)`);
 assert(a.plane.y<=a.PLANE_CEIL+1,`The soft ceiling holds at ${a.plane.y.toFixed(0)}m`);
 assert(Number.isFinite(a.plane.spd)&&Number.isFinite(a.plane.yaw),'Flight state stays finite');
 // Banking turns the aircraft, and a full-bank circle is small enough to orbit the island.
 {const yaw0=a.plane.yaw;a.keys.a=true;
  const xs=[],zs=[];
  for(let i=0;i<900;i++){a.updateFly(.02,i*.02);if(i>300){xs.push(a.plane.x);zs.push(a.plane.z);}}
  a.clearInput();
  assert(Math.abs(a.plane.yaw-yaw0)>Math.PI,'Holding bank comes round through half a circle and more');
  const radius=((Math.max(...xs)-Math.min(...xs))+(Math.max(...zs)-Math.min(...zs)))/4;
  assert(radius<220,`A full-bank turn stays inside ${radius.toFixed(0)}m, tight enough to circle the island`);}
 // The world has an edge: flying straight out is stopped, not escaped.
 {for(let i=0;i<4000;i++){a.keys.shift=true;a.updateFly(.05,i*.05);}
  a.clearInput();
  assert(Math.hypot(a.plane.x,a.plane.z)<=a.PLANE_EDGE+1,'The aircraft is held inside the charted sea');}
 // Flying low across the harbour is pushed up off the stone, never through it.
 {a.plane.x=640;a.plane.z=-300;a.plane.y=a.worldWalkHeight(640,-300)+1;a.plane.water=false;
  a.plane.pitch=0;a.plane.roll=0;a.plane.spd=40;a.plane.vy=0;
  for(let i=0;i<40;i++)a.updateFly(.02,i*.02);
  assert(a.plane.y>a.worldWalkHeight(a.plane.x,a.plane.z)+2,'Skimming the quay lifts the aircraft instead of sinking it into the stone');}
 // Rooftops are solid too: the walking surface inside a building is only its ground floor.
 {const tall=a.harborBuildings.filter(b=>b.h&&b.h>14).sort((x,y)=>y.h-x.h)[0];
  assert(tall,'The harbour has tall buildings to avoid');
  assert(a.planeGroundAt(tall.x,tall.z)>4.15+tall.h-0.01,'A building footprint reports its roof, not its floor');
  a.plane.x=tall.x;a.plane.z=tall.z;a.plane.y=10;a.plane.water=false;
  a.plane.pitch=0;a.plane.roll=0;a.plane.spd=40;a.plane.vy=0;
  for(let i=0;i<30;i++)a.updateFly(.02,i*.02);
  assert(a.plane.y>4.15+tall.h,`Flying at rooftop height is lifted over ${tall.name} instead of through it`);}
 // The lighthouse and the fairground rides are not in the walking surface either.
 {assert(a.airHazards.length>10,'Tall structures outside the harbour are registered');
  const ferris=a.parkModule.rides.find(r=>r.id==='ferris');
  const p=a.resortWorldPoint(ferris.target.x,0,ferris.target.z);
  assert(a.planeGroundAt(p.x,p.z)>20,`The ferris wheel reads as ${a.planeGroundAt(p.x,p.z).toFixed(0)}m of obstacle`);
  a.plane.x=p.x;a.plane.z=p.z;a.plane.y=8;a.plane.water=false;a.plane.pitch=0;a.plane.roll=0;a.plane.spd=38;a.plane.vy=0;
  for(let i=0;i<30;i++)a.updateFly(.02,i*.02);
  assert(a.plane.y>20,'Flying at the fairground is lifted over the wheel, not through it');
  assert(a.planeGroundAt(a.lighthousePos.x,a.lighthousePos.z)>a.terrainH(a.lighthousePos.x,a.lighthousePos.z)+20,'The lighthouse tower counts as height');}
 // Taxiing is water-only: the floats cannot ride up over the stone quay.
 {a.setMode('fly');
  a.plane.x=580;a.plane.z=-60;a.plane.y=a.seaAt(580,-60)+a.PLANE_FLOAT;a.plane.water=true;
  a.plane.yaw=Math.PI;a.plane.spd=16;a.plane.thr=.6;a.plane.pitch=0;a.plane.roll=0;
  assert(a.terrainH(580,-60)<-1,'Starting in open water off the quay');
  const z0=a.plane.z;
  a.keys.shift=true;
  for(let i=0;i<200;i++)a.updateFly(.02,i*.02);
  a.clearInput();
  assert(a.plane.z<z0-10,`It really taxis (${(z0-a.plane.z).toFixed(0)}m travelled)`);
  assert(a.plane.water,'Still on the water');
  assert(!a.planeOverLand(a.plane.x,a.plane.z),`The floats stop short of the quay instead of riding onto it (z=${a.plane.z.toFixed(1)}, surface ${a.worldWalkHeight(a.plane.x,a.plane.z).toFixed(2)})`);}
 // Abandoning the aircraft in mid-air over land must not park it inside the island.
 {a.plane.x=0;a.plane.z=-20;a.plane.y=180;a.plane.water=false;a.plane.yaw=Math.atan2(0,1);
  a.plane.spd=45;a.plane.pitch=0;a.plane.roll=0;a.plane.vy=0;
  a.setMode('view');
  for(let i=0;i<4000&&!a.plane.water;i++)a.updateMooredPlane(.05,i*.05);
  assert(a.plane.water,'The unflown aircraft finds water and settles');
  assert(a.terrainH(a.plane.x,a.plane.z)<0,`It ditches at sea, not inside the island (terrain ${a.terrainH(a.plane.x,a.plane.z).toFixed(1)})`);
  assert(a.plane.y>a.planeGroundAt(a.plane.x,a.plane.z),'It never comes to rest below the surface it is over');}
 // Scraping a rooftop must not pin the aircraft: there is a speed floor and an upward nudge.
 {const tall=a.harborBuildings.filter(b=>b.h&&b.h>14).sort((x,y)=>y.h-x.h)[0];
  a.setMode('fly');a.plane.x=tall.x;a.plane.z=tall.z;a.plane.y=4.15+tall.h;a.plane.water=false;
  a.plane.spd=32;a.plane.thr=1;a.plane.pitch=0;a.plane.roll=0;a.plane.vy=0;
  a.keys.shift=a.keys.w=true;   // full power and back stick, the way a player reacts
  for(let i=0;i<200;i++)a.updateFly(.02,i*.02);
  a.clearInput();
  assert(a.plane.spd>=a.PLANE_ROTATE-0.01,`Contact keeps enough speed to fly (${a.plane.spd.toFixed(1)} m/s)`);
  assert(a.plane.y>4.15+tall.h+40,`Pulling up climbs away from the roof (${a.plane.y.toFixed(0)}m over a ${(4.15+tall.h).toFixed(0)}m building)`);
  assert(!a.plane.water,'Still flying');}
 // At its mooring the aircraft is beside the jetty, so stepping off should reach the deck rather than the water.
 {a.plane.x=656;a.plane.z=-60;a.plane.yaw=0;a.plane.water=true;a.plane.spd=0;
  a.plane.y=a.seaAt(656,-60)+a.PLANE_FLOAT;
  const spot=a.planeStepOff();
  assert(spot&&spot.dry,'Stepping off at the mooring lands on the timber jetty');
  assert(a.worldWalkHeight(spot.x,spot.z)>4,`On the deck, not the ramp (${a.worldWalkHeight(spot.x,spot.z).toFixed(1)}m)`);
  // Wherever stepping off puts you, boarding has to reach back — the two distances must agree.
  assert(Math.hypot(spot.x-a.plane.x,spot.z-a.plane.z)<a.PLANE_BOARD_R,
    `The step-off spot is within boarding range (${Math.hypot(spot.x-a.plane.x,spot.z-a.plane.z).toFixed(2)}m vs ${a.PLANE_BOARD_R.toFixed(2)}m)`);
  a.setMode('fly');a.leavePlane();
  for(let i=0;i<20;i++)a.updateWalk(.05,i*.05);
  for(let i=0;i<6;i++)a.updateActors(.05,i*.05);
  assert(a.getPlaneNear(),'Standing where it put you, the aircraft can be boarded again');
  assert(nodes.get('vehicle-interact').textContent.includes('上机'),'And the prompt says so');}
 // Touch controls: the throttle is held per finger, and there is a way to ease it off again.
 {a.setMode('fly');
  const btn=nodes.get('jump-button');
  btn.handlers.pointerdown[0]({pointerId:7,preventDefault(){}});
  assert(a.getThrottleHeld(),'Holding the round button engages the throttle');
  events.pointerup.forEach(f=>f({pointerId:99}));
  assert(a.getThrottleHeld(),'A second finger leaving the joystick does not cut the throttle');
  events.pointerup.forEach(f=>f({pointerId:7}));
  assert(!a.getThrottleHeld(),'Lifting that finger releases the throttle');
  // Deliberate shared change: a vessel moored against the stone quay now lets you climb straight
  // ashore. The rail exists to stop a walker stumbling off, not to stop someone climbing on.
  {a.setMode('sail');a.ship.x=580;a.ship.z=-87.5;a.ship.yaw=0;a.ship.spd=0;
   const spot=a.shipStepOff();
   assert(spot&&spot.dry,'Moored against the quay, the boat offers the quay itself');
   assert(a.worldWalkHeight(spot.x,spot.z)>4,'That spot is the quay deck');
   assert(a.harborCollisionWorld.every(r=>!a.harborRectContains({x:spot.x,z:spot.z},r)),'And it is a legal place to stand, clear of the rail');
   a.leaveShip();
   for(let i=0;i<20;i++)a.updateWalk(.05,i*.05);
   assert(!a.walk.swim&&a.worldWalkHeight(a.walk.x,a.walk.z)>4,'You end up on the quay, not in the harbour');
   a.setMode('fly');}
  const brake=nodes.get('brake-button');
  assert(brake,'Flying has a throttle-down control for touch');
  brake.handlers.pointerdown[0]({pointerId:8,preventDefault(){}});
  a.plane.x=700;a.plane.z=300;a.plane.y=a.seaAt(700,300)+120;a.plane.water=false;
  a.plane.spd=42;a.plane.thr=.68;a.plane.pitch=0;a.plane.roll=0;a.plane.yaw=0;a.plane.vy=0;
  for(let i=0;i<200;i++)a.updateFly(.02,i*.02);
  assert(a.plane.thr<0.15,`Holding it winds the throttle back (${a.plane.thr.toFixed(2)})`);
  events.pointerup.forEach(f=>f({pointerId:8}));
  // Ride it down with the nose low; touching this slow is a soft landing, not a heavy one.
  for(let i=0;i<3000&&!a.plane.water;i++){ a.keys.s=(a.plane.y-a.seaAt(a.plane.x,a.plane.z))>10; a.setBrakeHeld(true); a.updateFly(.02,i*.02); }
  a.setBrakeHeld(false);a.clearInput();
  assert(a.plane.water,'It comes down on the water');
  assert(a.plane.spd<38,`Touchdown is gentle, not a heavy landing (${a.plane.spd.toFixed(1)} m/s)`);}
 // Land it: idle throttle, nose down, touch the water.
 {a.plane.x=700;a.plane.z=200;a.plane.y=a.seaAt(700,200)+120;a.plane.water=false;
  a.plane.spd=40;a.plane.pitch=0;a.plane.roll=0;a.plane.yaw=0;a.plane.thr=.2;
  let frames=0;
  for(let i=0;i<3000&&!a.plane.water;i++){a.keys[' ']=true;if(a.plane.y-a.seaAt(a.plane.x,a.plane.z)>12)a.keys.s=true;else a.keys.s=false;a.updateFly(.02,i*.02);frames++;}
  a.clearInput();
  assert(a.plane.water,`It comes down and settles on the water (${(frames*0.02).toFixed(0)}s)`);
  assert(Math.abs(a.plane.y-(a.seaAt(a.plane.x,a.plane.z)+a.PLANE_FLOAT))<1.2,'It floats at rest height after landing');}
 // Cannot get out while moving; can once it stops; the aircraft stays where it was left.
 a.plane.spd=20;a.leavePlane();assert.equal(body.dataset.mode,'fly','No stepping out while it is still moving');
 a.plane.spd=0;
 const parkedPlane={x:a.plane.x,z:a.plane.z};
 a.leavePlane();
 assert.equal(body.dataset.mode,'walk','Stepping out of a stopped aircraft works');
 assert(Math.abs(a.plane.x-parkedPlane.x)<.01&&Math.abs(a.plane.z-parkedPlane.z)<.01,'The aircraft stays exactly where it was left');
 assert(Math.hypot(a.walk.x-a.plane.x,a.walk.z-a.plane.z)<9,'You step off beside the aircraft, not across the bay');
 assert(a.walk.swim,'Stepping out over open water drops you in to swim');
 for(let i=0;i<10;i++)a.updateActors(.05,i*.05);
 assert(a.getPlaneNear(),'Treading water beside it, you can climb back in');
 // The dock-bar button returns to wherever the aircraft is parked.
 a.walk.x=0;a.walk.z=0;a.walk.swim=false;a.walk.y=a.worldWalkHeight(0,0);
 a.updateActors(.05,1);assert(!a.getPlaneNear());
 a.pickMode('fly');assert.equal(body.dataset.mode,'fly');
 assert(Math.abs(a.plane.x-parkedPlane.x)<.01,'The fly button rejoins the parked aircraft instead of respawning it');
 a.leavePlane();a.setMode('walk');
 console.log(`Floatplane: moored at the pier, boarded, ${run.toFixed(0)}m take-off run, climb to ceiling, banked circle, world edge, quay clearance, water landing and step-out passed.`);
 a.setMode('sail');a.ship.x=309;a.ship.z=-200;a.ship.yaw=Math.PI/2;a.ship.spd=0;a.keys.w=true;
 for(let i=0;i<240;i++){a.updateSail(.05,i*.05);assert(a.terrainH(a.ship.x,a.ship.z)<-1.5,'Seawall collision pushes the boat toward water');}a.clearInput();
 console.log(`Victoria Harbour: ${landmarks.length} interiors, ${a.harborFacadeCount} street buildings, 7 ships, ${a.harborVisitors.length} pedestrians; walked in and out through the doorways, stairs up/down, exhibits, facade/side/back walls still solid, furniture collisions, mode cleanup and dock landing passed.`);
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

 // ---- Third-person character ----
 a.strollHarbor();a.walk.tps=true;a.walk.vx=a.walk.vz=0;a.updateWalk(.016,1);a.updateActors(.016,1);
 assert(a.player.g.visible,'The avatar is shown in third person');
 const eye=a.walk.groundY+1.55;
 assert(Math.hypot(a.camera.position.x-a.walk.x,a.camera.position.z-a.walk.z)>1.5,'The camera sits behind the character, not inside it');
 assert(a.camera.position.y>a.walk.groundY+0.4,'The chase camera never sinks through the pavement');
 assert(Math.abs(a.player.g.position.y-a.walk.groundY)<1e-6,'The avatar stands on the walking surface');
 // Running turns the body toward travel, independently of where the camera looks.
 a.walk.x=700;a.walk.z=-120;a.walk.yaw=0;a.walk.heading=0;a.walk.vx=a.walk.vz=0;
 a.keys.d=true;a.keys.shift=true;
 for(let i=0;i<60;i++){a.updateWalk(.05,i*.05);a.updateActors(.05,i*.05);}
 a.clearInput();
 assert(a.walk.x>702,'Strafe input moves the character');
 assert(Math.abs(Math.sin(a.walk.heading-Math.PI/2))<0.25,'The body turns to face the direction of travel');
 assert.equal(a.player.g.rotation.y,a.walk.heading,'The avatar mesh follows the body heading');
 assert(a.walk.speed>8.5,`Shift sprints (${a.walk.speed.toFixed(1)} m/s)`);
 // Toggling back to first person puts the camera in the head again.
 a.toggleCameraView();a.updateWalk(.016,1);a.updateActors(.016,1);
 assert(!a.walk.tps&&!a.player.g.visible,'First person hides the avatar');
 assert(Math.abs(a.camera.position.x-a.walk.x)<1e-6&&Math.abs(a.camera.position.z-a.walk.z)<1e-6,'First-person camera sits on the character');
 a.toggleCameraView();assert(a.walk.tps);
 // Indoors the camera pulls in and stays inside the room.
 nodes.get('harbor-building').value='museum';a.goHarborBuilding();a.updateHarbor(.05,150);
 a.walk.yaw=0;a.walk.vx=a.walk.vz=0;a.keys.w=true;
 for(let i=0;i<90;i++){if(i%2)a.stepHarborCrowd(.1);a.updateWalk(.05,i*.05);}a.clearInput();
 const inside=a.getHarborState().active;
 assert(inside,'Entered an interior');
 assert(Math.abs(a.camera.position.x-inside.x)<inside.w/2&&Math.abs(a.camera.position.z-inside.z)<inside.d/2,'Indoor chase camera stays inside the building');
 assert(a.camera.position.y>a.worldWalkHeight(a.walk.x,a.walk.z)+0.3,'Indoor camera stays above the floor');
 a.exitHarborBuilding();

 // The parked car is a solid obstacle on foot.
 a.walk.x=a.car.x;a.walk.z=a.car.z+8;a.walk.yaw=0;a.walk.vx=a.walk.vz=0;a.keys.w=true;
 for(let i=0;i<40;i++)a.updateWalk(.05,i*.05);a.clearInput();
 assert(a.walk.z>a.car.z+a.vehicleHalfExtents(a.car.yaw).z+.5,`Walking toward the parked car stops outside its body (${a.walk.z.toFixed(1)} vs ${a.car.z})`);
 assert(a.walk.z<a.car.z+7,'The player actually approaches the parked car');

 // ---- Driving ----
 a.pickMode('drive');assert.equal(body.dataset.mode,'drive');assert.equal(body.dataset.region,'harbor');
 const parked=a.resolveVehicle(a.car.x,a.car.z,a.car.x,a.car.z);
 assert(!parked.hit&&Math.hypot(parked.x-a.car.x,parked.z-a.car.z)<.01,'The car is parked clear of the street furniture');
 assert(a.carGroundY(a.car.x,a.car.z)>3.2,'The car is parked on the roadway');
 const start={x:a.car.x,z:a.car.z};let peak=0;
 a.keys.w=true;for(let i=0;i<200;i++){a.updateDrive(.05,i*.05);peak=Math.max(peak,a.car.spd);}
 a.clearInput();
 // Fast enough to cross the harbour, slow enough to place on a street full of kerbs and
 // lamp posts — the old 94 km/h was the main reason the car felt unmanageable.
 assert(peak>13&&peak<=a.CAR_TOP+1e-6,`The car reaches town speed without running away (${(peak*3.6).toFixed(0)} km/h)`);
 assert(Math.hypot(a.car.x-start.x,a.car.z-start.z)>110,'The car covers the length of the boulevard');
 assert(a.roadster.g.position.x===a.car.x&&a.roadster.g.position.z===a.car.z,'The car body follows the simulated position');
 // Steering signs: D turns right (yaw up), A turns left.
 for(const [key,sign] of [['d',1],['a',-1]]){
  a.car.x=650;a.car.z=-120;a.car.yaw=0;a.car.spd=18;a.car.wheel=0;
  a.keys[key]=true;for(let i=0;i<20;i++)a.updateDrive(.05,i*.05);a.keys[key]=false;
  const turn=a.car.yaw*sign;
  assert(turn>0.2&&turn<1.4,`${key.toUpperCase()} turns the right way at a sane rate (${(a.car.yaw*180/Math.PI).toFixed(0)}deg/s)`);
 }
 a.clearInput();
 // Walls stop the car instead of letting it pass through.
 a.car.x=650;a.car.z=-120;a.car.yaw=0;a.car.spd=0;a.car.wheel=0;
 a.keys.w=true;for(let i=0;i<200;i++){a.updateDrive(.05,i*.05);
  assert(a.carGroundY(a.car.x,a.car.z)>3.2,'The car never leaves the roadway for the sea');
  assert(a.resolveVehicle(a.car.x,a.car.z,a.car.x,a.car.z).hit===false,'The car never ends a frame inside a wall');
 }
 a.clearInput();
 // Reverse and handbrake.
 a.car.spd=14;a.keys.s=true;for(let i=0;i<60;i++)a.updateDrive(.05,i*.05);a.clearInput();
 assert(a.car.spd<-1,'S brakes and then reverses');
 a.car.spd=20;a.keys[' ']=true;for(let i=0;i<30;i++)a.updateDrive(.05,i*.05);a.clearInput();
 assert(a.car.spd<10,'The handbrake scrubs off speed');
 // Getting out leaves the player standing on solid ground beside the car.
 a.car.spd=0;a.exitCar();
 assert.equal(body.dataset.mode,'walk');
 assert(a.carGroundY(a.walk.x,a.walk.z)>3.2,'The exit spot is on the roadway');
 assert(Math.hypot(a.walk.x-a.car.x,a.walk.z-a.car.z)<7,'The player steps out next to the car');
 assert(!a.harborRectContains(a.walk,a.carRect(),.6),'The exit spot clears the complete rotated car body');
 const clearOfCar=a.resolveHarborWalk(a.walk.x,a.walk.z,a.walk.x,a.walk.z,false);
 assert(Math.hypot(clearOfCar.x-a.walk.x,clearOfCar.z-a.walk.z)<.35,'The exit spot is not inside a wall');
 a.updateActors(.05,1);
 assert(a.getVehicleNear(),'Standing beside the car offers a way back in');
 assert(!nodes.get('vehicle-interact').hidden,'The get-in prompt is shown');
 a.enterCar();assert.equal(body.dataset.mode,'drive');
 // Walking far away hides the prompt again.
 a.exitCar();a.walk.x=a.car.x+40;a.walk.z=a.car.z;a.updateActors(.05,2);
 assert(!a.getVehicleNear()&&nodes.get('vehicle-interact').hidden,'The prompt disappears once you walk away');
 console.log(`Third person and driving: avatar rig, chase camera indoors and out, view toggle, ${(peak*3.6).toFixed(0)} km/h boulevard run, steering, walls, reverse, handbrake, get in and out passed.`);

 // Regressions: test rendered car geometry, not only the solver's own collision proxy.
 const customs=a.harborLandmarks.find(b=>b.id==='customs'),wallFace=customs.z-customs.d/2-.6;
 a.pickMode('drive');
 Object.assign(a.car,{x:customs.x,z:wallFace-12,y:4.15,yaw:0,spd:0,wheel:0,steer:0,hop:0});
 a.keys.w=true;for(let i=0;i<180;i++)a.updateDrive(.05,i*.05);a.clearInput();
 a.roadster.g.updateMatrixWorld(true);
 assert(new THREE.Box3().setFromObject(a.roadster.g).max.z<wallFace,'The rendered front bumper stops before the wall');
 // Reverse, diagonal body contact and visual suspension/steering remain inside the safety envelope.
 for(const yaw of [0,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.25]){
  const solved=a.resolveVehicle(customs.x,wallFace-14,customs.x,wallFace+20,yaw,yaw);
  assert(solved.hit,'A long step detects the wall for every vehicle orientation');
  a.roadster.g.position.set(solved.x,4.15,solved.z);a.roadster.g.rotation.set(.05,solved.yaw,.11);
  for(const wheel of a.roadster.wheels)wheel.mount.rotation.y=wheel.steer?.6:0;
  a.roadster.g.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(a.roadster.g),half=a.vehicleHalfExtents(solved.yaw);
  assert(box.max.z<wallFace,`Actual body clears the wall at yaw ${yaw}`);
  assert(box.min.x>=solved.x-half.x&&box.max.x<=solved.x+half.x&&box.min.z>=solved.z-half.z&&box.max.z<=solved.z+half.z,'Collision envelope covers wheels, bumpers and body lean');
 }
 const turned=a.resolveVehicle(customs.x,wallFace-2.7,customs.x,wallFace-2.7,0,Math.PI);
 assert(turned.hit&&turned.yaw===0,'A turn whose endpoints fit but middle strikes the wall is rejected');
 // The disc hull replaced the axis-aligned envelope: it must still cover every part of the
 // body, and must stay near the real shape rather than ballooning into a square again.
 for(let lx=-a.CAR_HALF_WIDTH;lx<=a.CAR_HALF_WIDTH+1e-9;lx+=a.CAR_HALF_WIDTH/8)
  for(let lz=-a.CAR_HALF_LENGTH;lz<=a.CAR_HALF_LENGTH+1e-9;lz+=a.CAR_HALF_LENGTH/12)
   assert(a.CAR_DISCS.some(([dx,dz])=>Math.hypot(lx-dx,lz-dz)<=a.CAR_DISC_R+1e-9),
    `Disc hull covers body point (${lx.toFixed(2)}, ${lz.toFixed(2)})`);
 const hullReach=Math.max(...a.CAR_DISCS.map(([dx,dz])=>Math.hypot(dx,dz)))+a.CAR_DISC_R;
 assert(hullReach<a.CAR_R+0.2,`Disc hull hugs the body instead of a square (${hullReach.toFixed(2)} vs ${a.CAR_R.toFixed(2)})`);
 // Wedged against something (a pedestrian walking into the car, a contact-epsilon landing)
 // used to freeze the car forever; it has to be able to drive back out.
 {
  const pinned=a.resolveVehicle(customs.x,wallFace-2.0,customs.x,wallFace-9,0,0);
  assert(Math.hypot(pinned.x-customs.x,pinned.z-(wallFace-2.0))>1,'A car overlapping something can still reverse out');
 }

 // Free-look toward a nearby wall used to force the driving camera into it.
 a.car.spd=0;a.car.camYaw=0;a.car.camPitch=0;a.car.camFree=10;a.updateDrive(0,10);
 assert(!a.chaseBlocked(...a.camera.position.toArray()),'Driving camera stays clear of the wall after clamping');
 a.strollHarbor();a.walk.x=customs.x;a.walk.z=wallFace-.9;a.walk.yaw=0;a.walk.pitch=0;a.walk.tps=true;
 a.updateWalkCamera(a.worldWalkHeight(a.walk.x,a.walk.z),0);
 assert(!a.chaseBlocked(...a.camera.position.toArray()),'Walking camera stays clear while backed closely against a wall');
 assert(Math.hypot(a.camera.position.x-a.walk.x,a.camera.position.z-a.walk.z)<1.1,'Camera can retract below the former minimum distance');

 // A stopped person in the open driving lane must stop the approaching car.
 const victim=a.harborVisitors[0];a.pickMode('drive');
 Object.assign(a.car,{x:650,z:-148,y:4.15,yaw:-Math.PI/2,spd:22,wheel:0,steer:0,hop:0});
 victim.p.g.position.set(620,4.25,-148);a.keys.w=true;
 for(let i=0;i<100;i++){
  a.updateDrive(.05,i*.05);
  assert(!a.harborRectContains(victim.p.g.position,a.carRect(),.49),'The car never overlaps a stationary pedestrian');
 }
 a.clearInput();assert(a.car.x>623&&a.car.x<624&&a.car.spd<1,'Contact with the person stops the car, rather than an unrelated obstacle');
 // Exercise the app update order with a walking person, too.
 Object.assign(a.car,{x:650,z:-120,y:4.15,yaw:-Math.PI/2,spd:22,wheel:0,steer:0,hop:0});
 victim.p.g.position.set(620,4.25,-120.8);victim.forward=false;a.keys.w=true;
 for(let i=0;i<100;i++){
  a.stepHarborCrowd(.05);a.updateDrive(.05,i*.05);
  assert(!a.harborRectContains(victim.p.g.position,a.carRect(),.45),'Crowd-first frame order preserves vehicle/person separation');
 }
 a.clearInput();
 // Doorways retain human collisions; route avoidance must not grant permission to walk through bodies.
 a.strollHarbor();const hotel=a.harborLandmarks.find(b=>b.id==='hotel'),doorZ=hotel.z+hotel.d/2+2;
 victim.p.g.position.set(hotel.x,4.25,doorZ);
 const crossing=a.resolveHarborWalk(hotel.x,doorZ+2,hotel.x,doorZ);
 assert(Math.hypot(crossing.x-hotel.x,crossing.z-doorZ)>1.1,'A person standing in the doorway remains solid');
 // 撞到路人卡死：harborRecover 要找一个不和任何盒子重叠的落点，
 // 在窄街上被墙和几个路人夹住时它会失败 —— 以前失败就原地返回，玩家当场钉死。
 // 人是软障碍，挤不出去时可以从人身上穿过去；墙必须照旧挡人。
 {
  const soft=(x,z)=>({x,z,w:.6,d:.6,soft:true});
  const me={x:640,z:-100};
  const pinned=[{x:640,z:-99,w:8,d:.4},soft(639.5,-100.4),soft(640.5,-100.4),soft(640,-100.7)];
  const out=a.sweepHarborMotion(me,{x:me.x,z:me.z-0.12},pinned);
  assert(Math.hypot(out.x-me.x,out.z-me.z)>1e-3,'被墙和路人夹住时不能一动不动');
  const boxed=[soft(639.4,-100),soft(640.6,-100),soft(640,-99.4),soft(640,-100.6)];
  const out2=a.sweepHarborMotion(me,{x:me.x+0.12,z:me.z},boxed);
  assert(Math.hypot(out2.x-me.x,out2.z-me.z)>1e-3,'四面被人围死也要能挤出去');
  const wall=a.sweepHarborMotion({x:640,z:-100},{x:640,z:-101},[{x:640,z:-100.6,w:8,d:.4}]);
  assert(wall.z>-100.5,'墙必须还是硬的，不能跟着人一起被放行');
 }
 console.log('Collision regressions: rendered bumpers/wheels, reverse and diagonal contact, intermediate rotation, both cameras at walls, stationary/moving pedestrians and doorway bodies passed.');
 // The actual game loop must publish current movement, not merely construct an online client.
 a.strollHarbor();onlineSamples.length=0;a.keys.w=true;
 for(let i=0;i<40;i++){a.updateWalk(.05,i*.05);a.tick();}a.clearInput();
 assert.equal(onlineSamples.length,40,'Every game frame reaches the network update');
 assert(Math.hypot(onlineSamples.at(-1).x-onlineSamples[0].x,onlineSamples.at(-1).z-onlineSamples[0].z)>1,'Network samples contain changing character positions');
 assert.equal(onlineSamples.at(-1).x,a.walk.x);assert.equal(onlineSamples.at(-1).z,a.walk.z);
 const remotePose={x:640,y:4.2,z:-100,heading:1,speed:0,kind:'walk',region:'harbor'};
 a.upsertRemotePlayer({id:'smoke_peer',name:'Guest',color:0,pose:remotePose});
 const remote=a.remotePlayers.get('smoke_peer');
 assert.deepEqual(remote.avatar.g.position.toArray(),[640,4.2,-100],'A new avatar appears at its transmitted position');
 a.upsertRemotePlayer({id:'smoke_peer',name:'Guest',color:0,pose:{...remotePose,x:641}});a.animateRemotePlayers(.016,1);
 assert(remote.avatar.g.position.x>640&&remote.avatar.g.position.x<641,'Normal movement is interpolated');
 assert.equal(remote.avatar.legs[0].pivot.rotation.x,0,'A stationary remote player does not walk in place');
 a.upsertRemotePlayer({id:'smoke_peer',name:'Guest',color:0,pose:{...remotePose,x:800}});
 assert.equal(remote.avatar.g.position.x,800,'Region teleports snap instead of sweeping through intervening buildings');
 // 朋友开车/开船/开飞机时得看得见那台载具：以前不管对方在干什么，
 // 远端永远只有一个人形，于是"人以每秒三十米贴着马路滑行"。
 for(const [kind,label] of [['drive','车'],['sail','船'],['fly','飞机']]){
  a.upsertRemotePlayer({id:'smoke_peer',name:'Guest',color:0,pose:{...remotePose,x:800,kind}});
  assert(remote.vehicle,`远端${label}应该有模型`);
  assert(a.scene.children.includes(remote.vehicle.g),`远端${label}要挂进场景`);
  assert(!remote.avatar.g.children.some(c=>c!==remote.label&&c.visible),`坐进${label}以后人形要收起来`);
  assert(remote.label?.visible,'名牌要留着，不然认不出是谁');
  a.animateRemotePlayers(.016,1);
  assert.deepEqual(remote.vehicle.g.position.toArray(),remote.avatar.g.position.toArray(),`${label}要跟着人走`);
 }
 const stowed=remote.vehicle.g;
 a.upsertRemotePlayer({id:'smoke_peer',name:'Guest',color:0,pose:{...remotePose,x:800,kind:'walk'}});
 assert(!remote.vehicle,'下了载具就收掉');assert(!a.scene.children.includes(stowed),'收掉的载具要从场景里摘走');
 assert(remote.avatar.g.children.some(c=>c!==remote.label&&c.visible),'下车之后人形回来');
 a.upsertRemotePlayer({id:'smoke_peer',name:'Guest',color:0,pose:{...remotePose,x:800,kind:'drive'}});
 const leaving=remote.vehicle.g;
 a.removeRemotePlayer('smoke_peer');assert.equal(a.remotePlayers.size,0);assert(!a.scene.children.includes(remote.avatar.g));
 assert(!a.scene.children.includes(leaving),'人走了载具也要一起收走');
 // 搭朋友的车：联机里第一个"真的一起玩"的动作。刻意不碰物理 ——
 // 开车的人照旧本地模拟，乘客每帧贴到对方广播的位姿上。
 a.setMode('walk');a.walk.x=640;a.walk.z=-150;a.walk.y=a.walk.groundY=0;
 const drive=(x,z,speed)=>a.upsertRemotePlayer({id:'pal',name:'阿友',color:1,
   pose:{x,y:0,z,heading:0,speed,kind:'drive',region:'harbor'}});
 drive(642,-150,0);a.animateRemotePlayers(.016,1);a.updateActors(.016,1);
 assert(a.getHitchNear(),'走到朋友的车边应该能搭');
 a.toggleVehicle();assert(a.getHitch(),'按一下就搭上');
 assert.equal(a.localOnlinePose().kind,'ride','搭车时报 ride，别人看到的是坐车不是以车速滑行的行人');
 for(let i=0;i<40;i++){drive(642+i*2,-150,14);a.animateRemotePlayers(.05,i*.05);a.tick();}
 const seat=a.localOnlinePose();
 assert(seat.x>700,'乘客跟着车走');assert(Math.abs(seat.z+150)<2,'坐在司机旁边');
 drive(seat.x,-150,1);
 a.upsertRemotePlayer({id:'pal',name:'阿友',color:1,pose:{x:seat.x,y:0,z:-150,heading:0,speed:1,kind:'walk',region:'harbor'}});
 a.animateRemotePlayers(.016,1);a.tick();
 assert(!a.getHitch(),'司机下车，乘客自动落地');
 drive(seat.x,-150,10);a.animateRemotePlayers(.016,1);a.updateActors(.016,1);a.toggleVehicle();
 assert(a.getHitch(),'再搭一次');
 a.removeRemotePlayer('pal');a.tick();
 assert(!a.getHitch(),'司机断线也要放人，不能把乘客卡在车上');
 console.log('Online game integration: frame-loop publishing, spawn, movement, teleport, remote vehicles, riding along and departure passed.');
 let meshes=0,visible=0;a.scene.traverse(o=>{if(o.isMesh){meshes++;if(o.visible)visible++;}});
 console.log(`Mesh objects ${meshes}; directly visible ${visible}.`);
 console.log(`${width}x${height}: scene initialized (${meshes} meshes), all 6 modes, fishing state changes, boat departure, input reset, 3 lighting presets passed.`);
}
test(1440,900);test(390,844);
console.log('All inline scripts parse. Tests use real Three.js scene objects with mocked DOM/renderer; GPU and visual rendering are not covered.');
