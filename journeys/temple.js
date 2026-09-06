// Adapted from the user-supplied source for Astra. Three.js is provided by the host (r128).
window.AstraRegionFactories.temple=function(THREE,{mobile:touchMode=false}={}){
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#7e9389');
scene.fog = new THREE.Fog('#7e9389', 22, 79);
const camera = new THREE.PerspectiveCamera(49, 1, .1, 160);
scene.add(new THREE.HemisphereLight('#d4e0d2', '#28352d', 2.1));
const sunlight = new THREE.DirectionalLight('#ffdf9d', 3.05);
sunlight.position.set(-17, 30, 12);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(touchMode ? 1024 : 2048, touchMode ? 1024 : 2048);
Object.assign(sunlight.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 85 });
sunlight.shadow.normalBias = .035; sunlight.shadow.bias = -.00015;
scene.add(sunlight);
const fillLight = new THREE.DirectionalLight('#b1d6ce', .7);
fillLight.position.set(10, 6, -12); scene.add(fillLight);

let seed = 12879;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
const rand = (a, b) => a + random() * (b - a);
const material = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: .82, ...opts });
const M = {
  stone: material('#626e61'), stoneDark: material('#3e5048'), edge: material('#7a8470'),
  red: material('#763e32'), redBright: material('#b3543f'), roof: material('#304e47', { metalness: .12 }),
  roofEdge: material('#71836b', { metalness: .25 }), wood: material('#302d25'),
  gold: material('#bc934c', { metalness: .72, roughness: .34 }), darkGold: material('#756139', { metalness: .52 }),
  fur: material('#66503a'), face: material('#ad9367'), cloth: material('#343e36'),
  armor: material('#907b48', { metalness: .58, roughness: .38 }), black: material('#111b17'),
  jade: material('#4f7366', { metalness: .15 }), bossStone: material('#667467'),
  eye: material('#b7dec0', { emissive: '#85deb8', emissiveIntensity: 2.2 }),
  lantern: material('#f4cf7b', { emissive: '#ffae36', emissiveIntensity: 2.7 }),
  mountain: material('#536d63'), distant: material('#71847a'), tree: material('#29453a'), trunk: material('#48453a')
};
const G = {
  box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(1, 12, 8),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 10), cone: new THREE.ConeGeometry(1, 1, 9),
  rock: new THREE.IcosahedronGeometry(1, 1), torus: new THREE.TorusGeometry(1, .055, 6, 40)
};
function mesh(g, m, parent, x=0,y=0,z=0, sx=1,sy=1,sz=1, shadow=false) {
  const obj = new THREE.Mesh(g,m); obj.position.set(x,y,z); obj.scale.set(sx,sy,sz);
  obj.castShadow=shadow;obj.receiveShadow=true;parent.add(obj);return obj;
}
const box=(p,m,x,y,z,sx,sy,sz,shadow=false)=>mesh(G.box,m,p,x,y,z,sx,sy,sz,shadow);
const ball=(p,m,x,y,z,sx,sy,sz,shadow=false)=>mesh(G.sphere,m,p,x,y,z,sx,sy,sz,shadow);
const cyl=(p,m,x,y,z,sx,sy,sz,shadow=false)=>mesh(G.cylinder,m,p,x,y,z,sx,sy,sz,shadow);
const group=(p,x=0,y=0,z=0)=>{const g=new THREE.Group();g.position.set(x,y,z);p.add(g);return g;};

// Local procedural stone texture: no external assets or requests during play.
const textureCanvas = document.createElement('canvas'); textureCanvas.width=256; textureCanvas.height=256;
const ctx=textureCanvas.getContext('2d');ctx.fillStyle='#74786a';ctx.fillRect(0,0,256,256);
for(let i=0;i<5500;i++){const l=Math.floor(rand(70,150));ctx.fillStyle=`rgba(${l},${l+4},${l-5},${rand(.03,.19)})`;ctx.fillRect(rand(0,256),rand(0,256),rand(1,11),rand(1,6));}
ctx.strokeStyle='#4f584a60';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,rand(20,80));ctx.lineTo(95,90);ctx.lineTo(133,158);ctx.stroke();
const stoneTexture=new THREE.CanvasTexture(textureCanvas);stoneTexture.encoding=THREE.sRGBEncoding;stoneTexture.anisotropy=4;
const floorMaterial=material('#acb19d',{map:stoneTexture});
cyl(scene,M.stoneDark,0,-.65,0,17,.95,17);
cyl(scene,M.stone,0,-.23,0,16.3,.28,16.3);
const tilePositions=[];
for(let x=-14;x<=14;x+=2)for(let z=-14;z<=14;z+=2)if(Math.hypot(x,z)<15.1)tilePositions.push([x,z]);
const tiles=new THREE.InstancedMesh(new THREE.BoxGeometry(1.975,.13,1.975),floorMaterial,tilePositions.length);
const dummy=new THREE.Object3D();const tint=new THREE.Color();
tilePositions.forEach(([x,z],i)=>{dummy.position.set(x,rand(-.015,.015),z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();tiles.setMatrixAt(i,dummy.matrix);tint.setHSL(.19,.06,rand(.62,.89));tiles.setColorAt(i,tint);});
tiles.receiveShadow=true;scene.add(tiles);
const inlayMaterial=material('#999879',{metalness:.22});
for(const radius of [6.7,7.0,13.9]){const ring=mesh(new THREE.RingGeometry(radius-.035,radius+.035,96),inlayMaterial,scene,0,.072,0);ring.rotation.x=-Math.PI/2;}
for(let i=0;i<8;i++){
  const a=i*Math.PI/4;const inlay=box(scene,inlayMaterial,Math.sin(a)*7.8,.075,Math.cos(a)*7.8,.045,.008,.65);inlay.rotation.y=a;
}
const soil=mesh(new THREE.CircleGeometry(85,64),material('#344b3e'),scene,0,-1.2,0);soil.rotation.x=-Math.PI/2;

// Roof geometry has raised eaves and a curved silhouette, rather than a flat pyramid.
function roof(parent,x,y,z,w,d,h) {
  const vertices=[],indices=[];const seg=12;
  for(let side=0;side<2;side++)for(let i=0;i<=seg;i++){
    const t=i/seg, xx=-w/2+t*w, edge=Math.pow(Math.abs(t-.5)*2,5)*.4;
    const zz=(side?1:-1)*d/2;
    vertices.push(xx,h+edge,0,xx,edge+.42,zz*.53,xx,edge+.28,zz);
  }
  for(let side=0;side<2;side++)for(let i=0;i<seg;i++)for(let j=0;j<2;j++){
    const a=side*(seg+1)*3+i*3+j,b=a+3;indices.push(a,b,a+1,b,b+1,a+1);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
  const mat=M.roof.clone();mat.side=THREE.DoubleSide;
  const r=mesh(geo,mat,parent,x,y,z);r.castShadow=true;
  for(const side of [-1,1]){
    box(parent,M.roofEdge,x,y+.28,z+side*d/2,w,.13,.16,true);
    for(let i=0;i<18;i++){
      const xx=x-w/2+(i+.5)*w/18;
      const ridge=box(parent,M.roofEdge,xx,y+h*.43+.31,z+side*d*.25,.055,.065,d*.52);
      ridge.rotation.x=side*Math.atan2(h-.28,d*.5);
    }
  }
  box(parent,M.roofEdge,x,y+h+.08,z,w,.17,.2,true);
  for(const side of [-1,1]){
    const finial=box(parent,M.darkGold,x+side*w*.49,y+h+.4,z,.14,.85,.14,true);finial.rotation.z=-side*.45;
    ball(parent,M.gold,x+side*w*.51,y+h+.74,z,.14,.14,.14);
  }
}
function temple(x,z,scale=1) {
  const t=group(scene,x,0,z);t.scale.setScalar(scale);
  box(t,M.stone,0,.52,0,18.5,1,8.6,true);
  box(t,M.edge,0,1.08,0,18.8,.22,8.8);
  for(let i=0;i<4;i++)box(t,M.stone,0,.14+i*.19,5.1-i*.43,7.2,.24,2.2);
  box(t,M.red,0,3.35,-3.35,16,4.4,.35,true);
  for(const xx of [-7,-3.5,0,3.5,7])for(const zz of [-2.7,2.7]){
    cyl(t,M.red,xx,3.75,zz,.28,5.3,.28,true);
    cyl(t,M.darkGold,xx,1.5,zz,.33,.4,.33);cyl(t,M.gold,xx,5.88,zz,.34,.16,.34);
    box(t,M.red,xx,6.0,zz,1.7,.25,.36,true);
  }
  box(t,M.red,0,6.2,2.7,16.2,.45,.5,true);
  box(t,M.red,0,6.2,-2.7,16.2,.45,.5,true);
  box(t,M.wood,0,3.35,-3.03,4.1,4.45,.15);
  for(const xx of [-1,1]){
    box(t,M.darkGold,xx,3.35,-2.94,1.8,4.15,.06);
    box(t,M.wood,xx,3.35,-2.9,1.66,4,.08);
    for(let i=0;i<5;i++)box(t,M.red,xx-.65+i*.32,3.35,-2.83,.05,4,.04);
    for(let i=0;i<6;i++)box(t,M.red,xx,1.65+i*.66,-2.83,1.66,.06,.04);
    ball(t,M.gold,xx*.33,3.05,-2.7,.12,.12,.06);
  }
  for(const xx of [-5.1,5.1]){
    box(t,M.wood,xx,3.6,-3.05,2.4,2.5,.1);
    for(let i=0;i<6;i++)box(t,M.red,xx-1+i*.4,3.6,-2.95,.06,2.5,.06);
    for(let i=0;i<6;i++)box(t,M.red,xx,2.55+i*.42,-2.95,2.4,.06,.06);
  }
  box(t,M.wood,0,5.35,2.99,4.5,.86,.18);box(t,M.darkGold,0,5.35,3.1,4.55,.9,.06);
  box(t,M.wood,0,5.35,3.15,4.35,.7,.05);
  // A small canvas name plaque is part of the environment, not interface text.
  const c=document.createElement('canvas');c.width=512;c.height=128;const cc=c.getContext('2d');
  cc.fillStyle='#272e24';cc.fillRect(0,0,512,128);cc.fillStyle='#bea36a';cc.font='64px serif';cc.textAlign='center';cc.fillText('静  山  寺',256,89);
  const plaqueTexture=new THREE.CanvasTexture(c);plaqueTexture.encoding=THREE.sRGBEncoding;
  mesh(new THREE.PlaneGeometry(4.2,.65),new THREE.MeshBasicMaterial({map:plaqueTexture}),t,0,5.35,3.19);
  roof(t,0,6.37,0,20.4,11.4,2.0);
  box(t,M.red,0,8.18,-.12,10.6,1.7,4.6,true);
  for(let i=0;i<11;i++)box(t,M.darkGold,-4.9+i*.98,8.2,2.23,.1,1.6,.08);
  roof(t,0,9.05,-.12,13.3,7.2,1.5);
  for(const xx of [-6.5,6.5]){
    const cloth=box(t,M.redBright,xx,4.12,3.18,.7,3.5,.05);cloth.rotation.z=xx>0?.035:-.035;
    for(let j=0;j<3;j++)box(t,M.darkGold,xx,3.5+j*.6,3.22,.27,.07,.03);
  }
  return t;
}
const mainTemple=temple(0,-21,1);
const sideTemple=temple(-22,-6,.52);sideTemple.rotation.y=Math.PI*.39;
const otherTemple=temple(22,-8,.52);otherTemple.rotation.y=-Math.PI*.39;

function lantern(x,z) {
  const t=group(scene,x,0,z);
  box(t,M.stone,0,.16,0,1,.3,1);box(t,M.edge,0,.34,0,.74,.13,.74);
  cyl(t,M.stone,0,.85,0,.21,1.0,.21);
  box(t,M.edge,0,1.38,0,.79,.17,.79);
  box(t,M.lantern,0,1.77,0,.39,.58,.39);
  for(const xx of [-.26,.26])for(const zz of [-.26,.26])box(t,M.stoneDark,xx,1.77,zz,.1,.64,.1);
  mesh(new THREE.ConeGeometry(.71,.39,4),M.roof,t,0,2.23,0,1,1,1,true).rotation.y=Math.PI/4;
  ball(t,M.darkGold,0,2.51,0,.09,.17,.09);
  const glow=mesh(new THREE.PlaneGeometry(2.3,2.3),new THREE.MeshBasicMaterial({map:glowTexture,color:'#ffc565',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}),t,0,1.77,0);
  glows.push(glow);
  const halo=mesh(new THREE.CircleGeometry(1.9,24),new THREE.MeshBasicMaterial({color:'#efb95a',transparent:true,opacity:.08,depthWrite:false}),t,0,.08,0);halo.rotation.x=-Math.PI/2;
}
const glowCanvas=document.createElement('canvas');glowCanvas.width=64;glowCanvas.height=64;
const gc=glowCanvas.getContext('2d'),gradient=gc.createRadialGradient(32,32,0,32,32,32);
gradient.addColorStop(0,'rgba(255,255,255,.52)');gradient.addColorStop(.18,'rgba(255,255,255,.17)');gradient.addColorStop(1,'rgba(255,255,255,0)');gc.fillStyle=gradient;gc.fillRect(0,0,64,64);
const glowTexture=new THREE.CanvasTexture(glowCanvas),glows=[];
for(const x of [-11,11])for(const z of [-11,-3,6,13])lantern(x,z);

// Low stone balustrades frame the arena without obstructing the follow camera.
for(let i=0;i<26;i++){
  const a=(i/26)*Math.PI*2,x=Math.sin(a)*16.1,z=Math.cos(a)*16.1;
  if(z < -13 || z > 12)continue;
  const r=group(scene,x,0,z);r.rotation.y=a;
  box(r,M.stone,0,.58,0,.39,1.12,.39);box(r,M.edge,0,1.18,0,.49,.16,.49);
  ball(r,M.stone,0,1.4,0,.2,.25,.2);
  box(r,M.stoneDark,1.65,.82,0,3.1,.15,.2);box(r,M.stoneDark,1.65,.36,0,3.1,.13,.18);
}
for(let i=0;i<35;i++){
  const a=rand(0,Math.PI*2),r=rand(18,35);const rock=mesh(G.rock,i%2?M.stoneDark:M.stone,scene,Math.cos(a)*r,-.4,Math.sin(a)*r,rand(.8,3),rand(.8,2.8),rand(.8,3),true);rock.rotation.set(rand(0,1),rand(0,3),rand(0,1));
}
// Instanced pines and peaks keep the wooded valley inexpensive on phones.
const treeCount=95;
const trunks=new THREE.InstancedMesh(G.cylinder,M.trunk,treeCount);
const crowns=new THREE.InstancedMesh(G.cone,M.tree,treeCount*4);
for(let i=0;i<treeCount;i++){
  const a=rand(0,Math.PI*2),r=rand(22,67),x=Math.cos(a)*r,z=Math.sin(a)*r,h=rand(6,15),lean=rand(-.07,.07);
  dummy.position.set(x,h*.33-1,z);dummy.scale.set(.15,h*.7,.15);dummy.rotation.set(0,0,lean);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
  for(let j=0;j<4;j++){
    dummy.position.set(x+lean*h*.3,h*(.4+j*.16)-1,z);const w=h*(.26-j*.042);
    dummy.scale.set(w,h*.32,w);dummy.rotation.set(0,rand(0,6),0);dummy.updateMatrix();crowns.setMatrixAt(i*4+j,dummy.matrix);
    tint.setHSL(.37,.16,rand(.13,.23));crowns.setColorAt(i*4+j,tint);
  }
}
scene.add(trunks,crowns);
for(let i=0;i<25;i++){
  const a=i/25*Math.PI*2,r=rand(62,92);
  const peak=mesh(G.rock,i%3?M.mountain:M.distant,scene,Math.cos(a)*r,rand(5,10),Math.sin(a)*r,rand(8,17),rand(19,40),rand(8,17));peak.rotation.y=rand(0,3);
}
// Scattered grasses sit outside the walking surface.
const grass=new THREE.InstancedMesh(G.cone,material('#6b7754'),180);
for(let i=0;i<180;i++){
  const a=rand(0,6.283),r=rand(15.8,19.5);dummy.position.set(Math.cos(a)*r,-.1,Math.sin(a)*r);dummy.scale.set(.045,rand(.25,.8),.07);dummy.rotation.set(rand(-.3,.3),rand(0,6),rand(-.4,.4));dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);
}scene.add(grass);

function makeFighter(isBoss=false) {
  const root=group(scene),body=group(root,0,0,0);
  const skin=isBoss?M.bossStone:M.fur,armor=isBoss?M.jade:M.armor;
  const torso=group(body,0,1.12,0);
  ball(torso,skin,0,.18,0,.34,.45,.22,true);
  box(torso,armor,0,.22,.1,.64,.56,.27,true);
  for(let i=0;i<3;i++){
    box(torso,isBoss?M.darkGold:M.gold,0,-.04+i*.19,.25,.59,.045,.055);
    for(const side of [-1,1])box(torso,armor,side*.28,-.35,.02,.27,.42,.25,true).rotation.z=side*.18;
  }
  cyl(torso,M.darkGold,0,-.13,0,.365,.13,.27);
  const head=group(body,0,1.86,.005);
  ball(head,skin,0,0,0,.27,.31,.23,true);
  if(!isBoss){
    ball(head,M.face,0,-.03,.175,.215,.21,.105);
    for(const side of [-1,1]){
      ball(head,skin,side*.285,-.015,0,.09,.125,.08,true);
      ball(head,M.face,side*.3,-.015,.03,.048,.072,.052);
      ball(head,M.black,side*.078,.047,.269,.032,.022,.018);
      const brow=box(head,M.fur,side*.076,.091,.26,.098,.027,.035);brow.rotation.z=side*.15;
    }
    ball(head,M.fur,0,-.023,.288,.05,.033,.026);
    const band=mesh(new THREE.TorusGeometry(.255,.025,6,24),M.gold,head,0,.105,.015);band.rotation.x=Math.PI/2;
    box(head,M.gold,0,.115,.248,.1,.09,.05);
    const hair=mesh(G.cone,M.fur,head,0,.3,-.04,.19,.2,.17,true);hair.rotation.z=.15;
    const tailCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,.92,-.19),new THREE.Vector3(.14,.65,-.6),new THREE.Vector3(.58,.68,-.8),new THREE.Vector3(.72,1.08,-.58)]);
    mesh(new THREE.TubeGeometry(tailCurve,14,.045,6,false),M.fur,body);
  }else{
    box(head,M.jade,0,.12,0,.64,.28,.46,true);
    box(head,M.darkGold,0,.255,0,.69,.06,.48);
    for(const side of [-1,1]){
      box(head,M.eye,side*.092,-.025,.223,.086,.024,.03);
      box(head,M.stoneDark,side*.24,-.16,.02,.11,.33,.25,true);
      const horn=mesh(G.cone,M.darkGold,head,side*.32,.34,-.06,.08,.5,.09,true);horn.rotation.z=side*-.38;
      const cheek=box(head,M.jade,side*.16,-.1,.21,.1,.14,.05);cheek.rotation.z=side*.2;
    }
    box(head,M.stoneDark,0,-.17,.214,.19,.06,.055);
    mesh(G.cone,M.stoneDark,head,0,-.34,.11,.1,.24,.09).rotation.z=Math.PI;
    ball(torso,M.darkGold,0,.34,.285,.115,.115,.045);
    for(const side of [-1,1])box(torso,M.darkGold,side*.2,.17,.274,.025,.3,.05).rotation.z=side*.45;
  }
  const arms=[];
  for(const side of [-1,1]){
    const arm=group(body,side*.41,1.49,0);arms.push(arm);
    ball(arm,armor,0,0,0,isBoss?.23:.19,.16,.23,true);
    cyl(arm,skin,0,-.25,0,.095,.42,.095,true);
    cyl(arm,M.darkGold,0,-.38,0,.12,.18,.12,true);
    ball(arm,skin,0,-.57,.03,.095,.11,.095,true);
    box(arm,M.gold,0,-.34,.105,.12,.22,.035);
  }
  const legs=[];
  for(const side of [-1,1]){
    const leg=group(body,side*.17,.87,0);legs.push(leg);
    cyl(leg,isBoss?M.stoneDark:M.cloth,0,-.2,0,.14,.43,.14,true);
    box(leg,armor,0,-.44,.033,.19,.23,.18,true);
    ball(leg,M.wood,0,-.73,.11,.145,.105,.23,true);
    for(let j=0;j<2;j++)cyl(leg,M.darkGold,0,-.52-j*.1,0,.116,.05,.12);
  }
  const weapon=group(arms[1],0,-.58,.06);
  const shaft=cyl(weapon,isBoss?M.stoneDark:M.wood,0,.15,0,.036,isBoss?3.15:2.95,.036,true);
  for(const side of [-1,1]){
    cyl(weapon,M.gold,0,.15+side*1.35,0,isBoss?.115:.065,.4,isBoss?.115:.065,true);
    cyl(weapon,M.darkGold,0,.15+side*1.12,0,.055,.07,.055);
    if(isBoss)ball(weapon,M.darkGold,0,.15+side*1.55,0,.15,.2,.15,true);
  }
  weapon.rotation.z=-.15;
  const ribbons=[];
  for(const side of [-1,1]){
    const ribbon=group(body,side*.19,.95,-.23);ribbons.push(ribbon);
    box(ribbon,isBoss?M.red:M.redBright,0,-.32,0,.13,.71,.025,true);
    box(ribbon,M.darkGold,0,-.63,0,.13,.025,.03);
    ribbon.rotation.x=-.3;ribbon.rotation.z=side*.2;
  }
  box(torso,M.redBright,0,.55,0,.6,.11,.42,true);
  const scarf=group(body,-.16,1.65,-.23);
  box(scarf,M.redBright,0,0,-.38,.17,.045,.8,true);ribbons.push(scarf);
  const shadow=mesh(new THREE.PlaneGeometry(2.6,2.6),new THREE.MeshBasicMaterial({map:glowTexture,color:'#030c09',transparent:true,opacity:.75,depthWrite:false}),root,0,.09,0);
  shadow.rotation.x=-Math.PI/2;
  if(isBoss)root.scale.setScalar(1.78);
  return {root,body,torso,head,arms,legs,weapon,ribbons,shadow,isBoss};
}
const hero=makeFighter(false),warden=makeFighter(true);
// A circular tell and lock-on mark clearly separate combat cues from scenery.
const tellMaterial=new THREE.MeshBasicMaterial({color:'#ee7750',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false});
const tell=mesh(new THREE.RingGeometry(.9,1,72),tellMaterial,scene,0,.1,0);tell.rotation.x=-Math.PI/2;
const markMaterial=new THREE.MeshBasicMaterial({color:'#e9d9a2',transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false});
const targetMark=mesh(new THREE.RingGeometry(.065,.084,24),markMaterial,scene);
const binding=group(scene);
const bindMaterial=new THREE.MeshBasicMaterial({color:'#e9c975',transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false});
for(let i=0;i<3;i++){const r=mesh(G.torus,bindMaterial,binding,0,1+i*.85,0,1.3,1.3,1.3);r.rotation.x=Math.PI/2+(i-1)*.25;}
binding.visible=false;
const slashMaterial=new THREE.MeshBasicMaterial({color:'#ffe7a2',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
const slash=mesh(new THREE.RingGeometry(1.15,1.4,32,1,0,Math.PI*1.3),slashMaterial,scene);slash.rotation.x=-Math.PI/2;
const waveMeshes=[];
for(let i=0;i<8;i++){
  const m=mesh(new THREE.RingGeometry(.95,1,72),new THREE.MeshBasicMaterial({color:'#efad69',transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false}),scene);m.rotation.x=-Math.PI/2;m.visible=false;waveMeshes.push(m);
}

const particles=[],particleGroup=group(scene);
const particleGeometry=new THREE.SphereGeometry(1,4,3);
const sparkMat=new THREE.MeshBasicMaterial({color:'#ffcf76'}),healMat=new THREE.MeshBasicMaterial({color:'#b7e8aa'}),dustMat=material('#d6c39a');
function burst(x,y,z,count=16,kind='spark'){
  const mat=kind==='heal'?healMat:kind==='dust'?dustMat:sparkMat;
  for(let i=0;i<count;i++){
    if(particles.length>170)break;
    const p=mesh(particleGeometry,mat,particleGroup,x+rand(-.2,.2),y+rand(-.15,.15),z+rand(-.2,.2));
    p.scale.setScalar(kind==='dust'?rand(.035,.09):rand(.018,.05));
    particles.push({mesh:p,vx:rand(-3.5,3.5),vy:kind==='heal'?rand(.7,2.5):rand(.5,4),vz:rand(-3.5,3.5),life:rand(.3,.85),kind});
  }
}
const moteCount=touchMode?90:150,moteGeo=new THREE.BufferGeometry(),moteData=new Float32Array(moteCount*3);
for(let i=0;i<moteCount;i++){moteData[i*3]=rand(-27,27);moteData[i*3+1]=rand(.5,15);moteData[i*3+2]=rand(-28,24);}
moteGeo.setAttribute('position',new THREE.BufferAttribute(moteData,3));
const motes=new THREE.Points(moteGeo,new THREE.PointsMaterial({color:'#d3cf9c',size:.045,transparent:true,opacity:.6,depthWrite:false}));scene.add(motes);


function rotateToward(obj,target,dt,speed=15){const delta=Math.atan2(Math.sin(target-obj.rotation.y),Math.cos(target-obj.rotation.y));obj.rotation.y+=delta*Math.min(1,dt*speed);}
function animateFighter(f,a,dt,t){
  f.root.position.set(a.x,0,a.z);rotateToward(f.root,a.face,dt);
  const stride=a.moving?Math.sin(t*(f.isBoss?6.4:10.8)):Math.sin(t*1.7)*.06;
  f.body.position.y=a.moving?Math.abs(stride)*.06:Math.sin(t*2)*.014;
  f.body.rotation.set(0,0,0);f.head.rotation.y=Math.sin(t*.8)*.03;
  f.legs[0].rotation.x=stride*.59;f.legs[1].rotation.x=-stride*.59;
  f.arms[0].rotation.set(-stride*.3,0,-.12);f.arms[1].rotation.set(stride*.2,0,.11);
  f.weapon.rotation.set(.08,0,-.16);f.weapon.position.set(0,-.58,.06);
  for(let i=0;i<f.ribbons.length;i++){
    const r=f.ribbons[i];r.rotation.x=i===2?Math.sin(t*5)*.16:-.3-Math.abs(stride)*.4+Math.sin(t*6+i)*.12;
    r.rotation.z=Math.sin(t*4+i)*.11+(i===0?-.15:.15);
  }
  if(!f.isBoss){
    if(a.action==='attack'||a.action==='heavy'){
      const p=clamp(a.actionTime/a.duration,0,1),heavy=a.action==='heavy';
      const sweep=Math.sin(p*Math.PI),turn=heavy?Math.sin(p*Math.PI)*.8:Math.sin(p*Math.PI*2)*.8;
      f.body.rotation.y=turn;f.body.rotation.x=heavy?-.15+sweep*.28:.06;
      f.arms[1].rotation.x=heavy?-2.6+sweep*1.9:-.5-sweep*.45;
      f.arms[1].rotation.z=heavy?-.25:-1.0+sweep*2.4;
      f.arms[0].rotation.x=heavy?-1.6:-.9;
      f.weapon.rotation.x=heavy?-.4+p*2.8:.3;
      f.weapon.rotation.z=heavy?.2:1.5;
      f.weapon.position.z=.35;
    }else if(a.action==='dodge'){
      f.body.position.y=.07;f.body.rotation.x=-Math.sin(a.actionTime/a.duration*Math.PI)*.95;
      f.legs[0].rotation.x=-.7;f.legs[1].rotation.x=.9;f.arms[0].rotation.x=-.5;f.arms[1].rotation.x=-.7;
    }else if(a.action==='heal'){
      f.arms[0].rotation.x=-2.4;f.head.rotation.x=-.15;
    }else f.head.rotation.x=0;
  }else{
    if(a.action==='sweep'||a.action==='slam'){
      const p=clamp(a.actionTime/a.duration,0,1);
      if(a.action==='slam'){
        const lift=p<.7?p/.7:Math.max(0,1-(p-.7)/.18);
        f.arms[1].rotation.x=-2.5*lift;f.arms[0].rotation.x=-1.8*lift;f.body.rotation.x=-.2*lift;
        f.weapon.rotation.x=.4;f.weapon.rotation.z=-.2;
        if(p>.72){f.body.rotation.x=.22;f.weapon.rotation.x=1.5;}
      }else{
        const swing=p<.72?-p/.72:(p-.72)/.28*2.4-1;
        f.body.rotation.y=swing*.9;f.arms[1].rotation.z=.6+swing*.55;f.arms[1].rotation.x=-.7;
        f.weapon.rotation.z=1.45;f.weapon.rotation.x=-.25;f.arms[0].rotation.x=-.5;
      }
    }
    if(a.stun>0){f.body.rotation.z=Math.sin(t*21)*.009;}
  }
  if(a.hurt>0)f.body.rotation.z+=Math.sin(t*43)*.055;
}

return {scene,camera,hero,warden,mainTemple,sideTemple,otherTemple,tell,tellMaterial,targetMark,binding,slash,slashMaterial,waveMeshes,particles,particleGroup,glows,motes,burst,animateFighter,rotateToward,sunlight};

};
