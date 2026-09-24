// Adapted from the user-supplied source for Astra. Three.js is provided by the host (r128).
window.AstraRegionFactories.temple=function(THREE,{mobile:touchMode=false,trees=null}={}){
const TREES=trees;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const scene = new THREE.Scene();
scene.background = new THREE.Color('#7e9389');
// 雾提前到 18 米就起、70 米收尽：远山成一层层渐隐的剪影，而不是清清楚楚的几座石头
scene.fog = new THREE.Fog('#7e9389', 18, 70);
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

/* 主随机序列：石纹画布、地砖、乱石、松、远峰、草、尘埃都排在上面，
   顺序和步数一个都不能动 —— 新加的东西用下面那条独立的 r2。 */
let seed = 12879;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
const rand = (a, b) => a + random() * (b - a);
let seed2 = 90210;
function r2() { seed2 = (seed2 * 1664525 + 1013904223) >>> 0; return seed2 / 4294967296; }
const rand2 = (a, b) => a + r2() * (b - a);
// name：regions.js 照名字挂程序化表面细节（石 / 墙 / 瓦 / 木 / 地砖），没名字的不动
const material = (color, opts = {}, name = '') => Object.assign(new THREE.MeshStandardMaterial({ color, roughness: .82, ...opts }), { name });
// 人物与特效还用这些单独材质；庭院本身走下面的合批
const M = {
  stone: material('#626e61', {}, 'stone'), stoneDark: material('#3e5048'), edge: material('#7a8470'),
  red: material('#763e32', {}, 'wall'), redBright: material('#b3543f'), roof: material('#304e47', { metalness: .12 }, 'roof'),
  roofEdge: material('#71836b', { metalness: .25 }), wood: material('#302d25', {}, 'wood'),
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
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 10), cyl16: new THREE.CylinderGeometry(1, 1, 1, 16), cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 9), cone6: new THREE.ConeGeometry(1, 1, 6),
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

/* ---------- 合批：庭院里成百上千个小几何体按材质合成几个 mesh，颜色写进顶点 ----------
   原来 1035 个 mesh 各画一次，绘制次数在五百到一千之间。
   颜色按 sRGB 写、进顶点前转成线性，和 regions.js 给材质做的转换一致。 */
class Batch{
  constructor(){this.pos=[];this.nor=[];this.col=[];this.uv=[];this.idx=[];this.n=0;}
  add(geo,matrix,color,colorFn){
    const p=geo.attributes.position,nrm=geo.attributes.normal,uv=geo.attributes.uv;
    const nm=new THREE.Matrix3().getNormalMatrix(matrix);const v=new THREE.Vector3(),nv=new THREE.Vector3(),lv=new THREE.Vector3();
    const c=(color&&color.isColor?color.clone():new THREE.Color(color)).convertSRGBToLinear(),cc=new THREE.Color();
    for(let i=0;i<p.count;i++){
      lv.fromBufferAttribute(p,i);v.copy(lv).applyMatrix4(matrix);this.pos.push(v.x,v.y,v.z);
      nv.fromBufferAttribute(nrm,i).applyMatrix3(nm).normalize();this.nor.push(nv.x,nv.y,nv.z);
      if(colorFn){cc.copy(c);colorFn(cc,lv,v);this.col.push(cc.r,cc.g,cc.b);}else this.col.push(c.r,c.g,c.b);
      if(uv)this.uv.push(uv.getX(i),uv.getY(i));else this.uv.push(0,0);
    }
    if(geo.index){const ix=geo.index;for(let i=0;i<ix.count;i++)this.idx.push(ix.getX(i)+this.n);}
    else{for(let i=0;i<p.count;i++)this.idx.push(i+this.n);}
    this.n+=p.count;
  }
  get empty(){return this.n===0;}
  build(mat){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.nor,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.col,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));g.setIndex(this.idx);return new THREE.Mesh(g,mat);}
}
const vc=(o,name='')=>Object.assign(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82,...o}),{name});
const BM={
  stone:vc({},'stone'), wall:vc({},'wall'), roof:vc({roughness:.7,metalness:.1,side:THREE.DoubleSide},'roof'), wood:vc({roughness:.75},'wood'),
  lacquer:vc({roughness:.42,metalness:.05}), gold:vc({roughness:.38,metalness:.65}), misc:vc({}), far:vc({roughness:1}),
  fire:vc({emissive:'#ffae36',emissiveIntensity:2.4}), ground:vc({roughness:.95},'ground'),
};
const BT={};for(const k in BM)BT[k]=new Batch();
const _v=new THREE.Vector3(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_s=new THREE.Vector3();
const M4=(x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0)=>{_e.set(rx,ry,rz);_q.setFromEuler(_e);_v.set(x,y,z);_s.set(sx,sy,sz);return new THREE.Matrix4().compose(_v,_q,_s);};
const bbox=(bt,color,w,h,d,x,y,z,parent=null,rx=0,ry=0,rz=0,colorFn)=>{let m=M4(x,y,z,w,h,d,rx,ry,rz);if(parent)m=parent.clone().multiply(m);bt.add(G.box,m,color,colorFn);};
const bgeo=(bt,color,geo,x,y,z,sx=1,sy=1,sz=1,parent=null,rx=0,ry=0,rz=0,colorFn)=>{let m=M4(x,y,z,sx,sy,sz,rx,ry,rz);if(parent)m=parent.clone().multiply(m);bt.add(geo,m,color,colorFn);};
/* 旋转剖面的法线有时朝里；按平均值检查一下，朝里就翻过来 */
function outward(g){const p=g.attributes.position,n=g.attributes.normal;let s=0;for(let i=0;i<p.count;i++)s+=n.getX(i)*p.getX(i)+n.getZ(i)*p.getZ(i);if(s<0){for(let i=0;i<n.count;i++)n.setXYZ(i,-n.getX(i),-n.getY(i),-n.getZ(i));const ix=g.index;if(ix)for(let i=0;i<ix.count;i+=3){const a=ix.getX(i+1),b=ix.getX(i+2);ix.setX(i+1,b);ix.setX(i+2,a);}}return g;}
const lathe=(pts,segs=16)=>outward(new THREE.LatheGeometry(pts.map(([r,y])=>new THREE.Vector2(r,y)),segs));
/* 揉过的二十面体：礁石、乱石、远峰共用，每个变体按下标错开 */
function boulder(k,detail=2,squash=.7){const g=new THREE.IcosahedronGeometry(1,detail),p=g.attributes.position;const h=(i,j)=>{const s=Math.sin(i*12.9898+j*78.233+k*37.719)*43758.5453;return s-Math.floor(s);};
  for(let i=0;i<p.count;i++){const j=1+(h(i,1)-.5)*.55;p.setXYZ(i,p.getX(i)*j,p.getY(i)*(squash+h(i,2)*.35),p.getZ(i)*j*(.85+h(i,3)*.3));}g.computeVertexNormals();return g;}
const ROCKS=[0,1,2,3,4,5].map(k=>boulder(k));
const PEAKS=[0,1,2,3].map(k=>boulder(k+10,2,1));
const shade=(k)=>(c,lv)=>c.multiplyScalar(lerp(k,1,smooth(-.6,.8,lv.y)));   // 底部压暗（远峰、礁石）

// Local procedural stone texture: no external assets or requests during play.
const textureCanvas = document.createElement('canvas'); textureCanvas.width=256; textureCanvas.height=256;
const ctx=textureCanvas.getContext('2d');ctx.fillStyle='#74786a';ctx.fillRect(0,0,256,256);
for(let i=0;i<5500;i++){const l=Math.floor(rand(70,150));ctx.fillStyle=`rgba(${l},${l+4},${l-5},${rand(.03,.19)})`;ctx.fillRect(rand(0,256),rand(0,256),rand(1,11),rand(1,6));}
ctx.strokeStyle='#4f584a60';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,rand(20,80));ctx.lineTo(95,90);ctx.lineTo(133,158);ctx.stroke();
const stoneTexture=new THREE.CanvasTexture(textureCanvas);stoneTexture.encoding=THREE.sRGBEncoding;stoneTexture.anisotropy=4;
const floorMaterial=material('#acb19d',{map:stoneTexture},'floor');
// 台地：一圈条石挡土墙托着院子，院子坐在崖头上，不再是贴在土盘上的两片薄饼
bgeo(BT.stone,0x4a5b52,G.cyl16,0,-4.6,0,16.6,9.0,16.6);
bgeo(BT.stone,0x3e5048,G.cyl16,0,-.5,0,17,.7,17);
bgeo(BT.stone,0x626e61,G.cyl16,0,-.23,0,16.3,.28,16.3);
for(let k=0;k<48;k++){const a=k/48*Math.PI*2;bbox(BT.stone,0x2f3d38,.08,4.2,.35,Math.sin(a)*16.62,-2.6,Math.cos(a)*16.62,null,0,a,0);}   // 墙面竖缝
for(const y of [-1.4,-3.3])bgeo(BT.stone,0x35443e,G.cyl16,0,y,0,16.66,.1,16.66);                                                        // 横缝
const tilePositions=[];
for(let x=-14;x<=14;x+=2)for(let z=-14;z<=14;z+=2)if(Math.hypot(x,z)<15.1)tilePositions.push([x,z]);
const tiles=new THREE.InstancedMesh(new THREE.BoxGeometry(1.975,.13,1.975),floorMaterial,tilePositions.length);
const dummy=new THREE.Object3D();const tint=new THREE.Color();
tilePositions.forEach(([x,z],i)=>{dummy.position.set(x,rand(-.015,.015),z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();tiles.setMatrixAt(i,dummy.matrix);tint.setHSL(.19,.06,rand(.62,.89));tiles.setColorAt(i,tint);});
tiles.receiveShadow=true;scene.add(tiles);
const INLAY=0x999879;
for(const radius of [6.7,7.0,13.9])bgeo(BT.gold,INLAY,new THREE.RingGeometry(radius-.035,radius+.035,96),0,.072,0,1,1,1,null,-Math.PI/2);
for(let i=0;i<8;i++){const a=i*Math.PI/4;bbox(BT.gold,INLAY,.045,.008,.65,Math.sin(a)*7.8,.075,Math.cos(a)*7.8,null,0,a,0);}

/* ---------- 地形：院子外面往下落成崖，再起伏出去 ---------- */
const fbm=(x,z)=>Math.sin(x*.21+z*.13)*.5+Math.sin(x*.07-z*.19+1.7)*.8+Math.sin(x*.043+z*.051+.4)*1.1+Math.cos(x*.31-z*.27)*.25;
function groundH(x,z){const r=Math.hypot(x,z);if(r<16.4)return -1.2;const drop=smooth(16.4,27,r);let y=-1.2-drop*3.2+fbm(x,z)*.9*drop;const far=smooth(36,90,r);y+=far*3.6+Math.sin(x*.05)*Math.cos(z*.045)*2.4*far;return y;}
{ const R=92,rings=26,segs=64,pos=[],col=[],idx=[];const c=new THREE.Color(),base=new THREE.Color(0x344b3e).convertSRGBToLinear(),dk=new THREE.Color(0x22332a).convertSRGBToLinear(),lt=new THREE.Color(0x4a5e44).convertSRGBToLinear();
  for(let i=0;i<=rings;i++){const r=i===0?0:16.2*Math.pow(i/rings,.6)+(R-16.2)*Math.pow(i/rings,2.2);for(let j=0;j<segs;j++){const a=j/segs*Math.PI*2,x=Math.cos(a)*r,z=Math.sin(a)*r,y=groundH(x,z);pos.push(x,y,z);
    c.copy(base).lerp(dk,clamp((-1.2-y)/4,0,.6)).lerp(lt,clamp((fbm(x*1.7,z*1.7)+1)/6,0,.35));col.push(c.r,c.g,c.b);}}
  for(let i=0;i<rings;i++)for(let j=0;j<segs;j++){const a=i*segs+j,b=a+segs,j2=(j+1)%segs,a2=i*segs+j2,b2=a2+segs;idx.push(a,a2,b,a2,b2,b);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();
  const soil=new THREE.Mesh(g,BM.ground);soil.receiveShadow=true;scene.add(soil); }
// 台地边缘一圈礁石，压住墙脚
for(let i=0;i<22;i++){const a=i/22*Math.PI*2+rand2(-.1,.1),r=rand2(16.9,18.6),s=rand2(1.1,2.4);bgeo(BT.stone,i%2?0x55655d:0x3e5048,ROCKS[i%6],Math.cos(a)*r,groundH(Math.cos(a)*r,Math.sin(a)*r)+s*.15,Math.sin(a)*r,s,s*.8,s*1.1,null,0,rand2(0,6.3),0,shade(.6));}

/* ---------- 屋顶：歇山，坡面下凹（举折），檐角起翘，筒瓦一垄一垄压出来 ---------- */
function slopeGrid(nS,nT,fn){const pos=[],uv=[],idx=[];for(let i=0;i<=nS;i++)for(let j=0;j<=nT;j++){const p=fn(i/nS,j/nT);pos.push(p[0],p[1],p[2]);uv.push(j/nT,i/nS);}
  for(let i=0;i<nS;i++)for(let j=0;j<nT;j++){const a=i*(nT+1)+j,b=a+nT+1;idx.push(a,b,a+1,a+1,b,b+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  // 朝下就翻
  const n=g.attributes.normal;let s=0;for(let i=0;i<n.count;i++)s+=n.getY(i);if(s<0){for(let i=0;i<n.count;i++)n.setXYZ(i,-n.getX(i),-n.getY(i),-n.getZ(i));const ix=g.index;for(let i=0;i<ix.count;i+=3){const a=ix.getX(i+1),b=ix.getX(i+2);ix.setX(i+1,b);ix.setX(i+2,a);}}
  return g;}
const TILE=0x2f4a44,TILE_DK=0x1f3330,RIDGE=0x1b2b28,RAFTER=0x4a2e26;
function buildRoof(parent,x,y,z,w,d,H,o={}){
  const rl=o.rl??w*.5, ov=o.ov??1.2, lift=o.lift??.5, sTop=o.sTop??.42, corr=o.corr??.03, period=.26;
  const hd=d/2, hw=w/2, P=parent.clone().multiply(M4(x,y,z));
  const prof=s=>H*Math.pow(1-s,1.55), hx=s=>lerp(rl/2,hw+ov,s), eave=hd+ov;
  const liftAt=(s,t)=>lift*Math.pow(s,3)*Math.pow(Math.abs(2*t-1),3);
  const nT=Math.max(16,Math.round((w+2*ov)/(touchMode?.16:.07))), nS=touchMode?5:8;
  const ridges=o.ridge!==false;
  for(const side of [-1,1]){
    bgeo(BT.roof,TILE,slopeGrid(nS,nT,(s,t)=>{const xx=(2*t-1)*hx(s),zz=side*s*eave;let yy=prof(s)+liftAt(s,t);if(!touchMode)yy+=corr*(.5+.5*Math.sin(xx*Math.PI*2/period))*smooth(0,.08,s);return [xx,yy,zz];}),0,0,0,1,1,1,P);
    // 山面：从 sTop 往下的一截坡
    const nTe=Math.max(8,Math.round(2*eave/(touchMode?.16:.08)));
    bgeo(BT.roof,TILE,slopeGrid(nS,nTe,(s0,t)=>{const s=sTop+(1-sTop)*s0,xx=side*hx(s),zz=(2*t-1)*s*eave;let yy=prof(s)+liftAt(s,t);if(!touchMode)yy+=corr*(.5+.5*Math.sin(zz*Math.PI*2/period))*smooth(0,.08,s0);return [xx,yy,zz];}),0,0,0,1,1,1,P);
    // 山花：木板封住山面上头的三角
    {const gx=side*(hx(sTop)-.14),zt=sTop*eave,y0=prof(sTop)-.06;const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute([gx,y0,-zt,gx,y0,zt,side*(rl/2-.1),H+.02,0],3));g.setAttribute('normal',new THREE.Float32BufferAttribute([side,0,0,side,0,0,side,0,0],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1],2));g.setIndex(side>0?[0,1,2]:[0,2,1]);
      bgeo(BT.wood,0x3a2a22,g,0,0,0,1,1,1,P);
      bbox(BT.wood,0x8a6a3a,.06,.55,.32,gx+side*.04,y0+.5,0,P);bbox(BT.gold,0xbc934c,.05,.16,.16,gx+side*.06,y0+.2,0,P);}   // 悬鱼
    // 檐口的瓦当、椽子
    const step=o.caps?period:.5;
    for(let xx=-hx(1)+.3;xx<hx(1)-.2;xx+=step){const t=(xx/hx(1)+1)/2,ye=prof(1)+liftAt(1,t);
      if(o.caps)bgeo(BT.roof,TILE_DK,G.cylinder,xx,ye+corr*.5,side*(eave+.02),.075,.05,.075,P,Math.PI/2,0,0);
      if(Math.abs((xx+hx(1))%.5)<step*.5+1e-6||!o.caps)bbox(BT.wood,RAFTER,.09,.09,ov+.5,xx,ye-.15,side*(eave-ov/2-.15),P,side*.28,0,0);}
    for(let zz=-eave+.35;zz<eave-.3;zz+=.5)bbox(BT.wood,RAFTER,ov+.5,.09,.09,side*(hx(1)-ov/2-.15),prof(1)-.15,zz,P,0,0,-side*.28);
  }
  if(!ridges)return;
  const tube=(pts,r,col)=>bgeo(BT.roof,col,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p)),false,'catmullrom',.3),Math.max(8,pts.length*4),r,touchMode?4:6,false),0,0,0,1,1,1,P);
  // 正脊（略微下垂）与两端的鸱吻
  tube([[-rl/2,H+.08,0],[0,H-.02,0],[rl/2,H+.08,0]],.17,RIDGE);
  for(const e of [-1,1]){const ex=e*rl/2;tube([[ex,H-.1,0],[ex+e*.12,H+.45,0],[ex-e*.1,H+.85,0],[ex-e*.45,H+.75,0]],.13,RIDGE);bbox(BT.roof,RIDGE,.12,.5,.08,ex+e*.05,H+.3,0,P,0,0,-e*.3);}
  // 垂脊沿着四条戗角走，末端蹲着小兽
  for(const sx of [-1,1])for(const sz of [-1,1]){const pts=[];for(let k=0;k<=6;k++){const s=k/6;pts.push([sx*hx(s),prof(s)+lift*Math.pow(s,3)+.06,sz*s*eave]);}tube(pts,.1,RIDGE);
    for(const s of [.78,.88,.97]){const px=sx*hx(s),pz=sz*s*eave,py=prof(s)+lift*Math.pow(s,3)+.12;bbox(BT.gold,0x5f4d2c,.16,.2,.16,px,py+.1,pz,P);bgeo(BT.gold,0x756139,G.sphere,px,py+.25,pz,.09,.08,.09,P);}}
}
/* 斗拱：一朵拱的簇，沿额枋每 1.2 米一朵 */
function dougong(parent,x,y,z,ry=0,k=1){const P=parent.clone().multiply(M4(x,y,z,k,k,k,0,ry,0));
  bbox(BT.wood,0x8a5a3a,.34,.26,.34,0,.13,0,P);bbox(BT.wood,0x7a4a30,.9,.14,.16,0,.33,0,P);bbox(BT.wood,0x7a4a30,.16,.14,.7,0,.33,.12,P);
  for(const dx of [-.36,0,.36])bbox(BT.wood,0x8a5a3a,.2,.16,.2,dx,.48,0,P);
  bbox(BT.wood,0x7a4a30,1.3,.13,.16,0,.62,0,P);bbox(BT.wood,0x7a4a30,.16,.13,1.05,0,.62,.24,P);bbox(BT.gold,0xbc934c,.16,.1,.3,0,.6,.72,P);
  for(const dx of [-.55,-.18,.18,.55])bbox(BT.wood,0x8a5a3a,.2,.14,.2,dx,.76,0,P);}
function dougongRow(P,w,d,y,k=1){const hw=w/2,hd=d/2;for(let xx=-hw+1.2;xx<hw-.6;xx+=1.2){dougong(P,xx,y,hd,0,k);dougong(P,xx,y,-hd,Math.PI,k);}
  for(let zz=-hd+1.2;zz<hd-.6;zz+=1.2){dougong(P,hw,y,zz,Math.PI/2,k);dougong(P,-hw,y,zz,-Math.PI/2,k);}
  for(const sx of [-1,1])for(const sz of [-1,1])dougong(P,sx*hw,y,sz*hd,Math.atan2(sx,sz),k);}
/* 格扇：步步锦的格心 + 下面一块裙板 */
function lattice(P,x,y,z,w,h,col=0x6b3b2c){bbox(BT.wood,col,w,h,.08,x,y,z,P);bbox(BT.misc,0x1c1712,w-.16,h-.16,.03,x,y,z-.02,P);
  const gh=h*.62,gy=y+h/2-gh/2-.08;for(let u=-w/2+.2;u<w/2-.1;u+=.2)bbox(BT.wood,col,.035,gh-.1,.05,x+u,gy,z+.03,P);
  for(let v=-gh/2+.2;v<gh/2-.1;v+=.34)bbox(BT.wood,col,w-.2,.035,.05,x,gy+v,z+.03,P);
  bbox(BT.wood,col,w-.2,.06,.06,x,gy-gh/2,z+.02,P);bbox(BT.wood,col,w-.3,h*.28,.04,x,y-h/2+h*.16,z+.03,P);bbox(BT.gold,0x8a6a3a,w*.4,h*.1,.05,x,y-h/2+h*.16,z+.05,P);}
// 牌匾：画布文字（环境的一部分，不是界面）
function plaque(parent,text,w,h,x,y,z,ry=0,bg='#272e24',fg='#bea36a',size=64){
  const c=document.createElement('canvas');c.width=512;c.height=Math.max(64,Math.round(512*h/w));const cc=c.getContext('2d');
  cc.fillStyle=bg;cc.fillRect(0,0,c.width,c.height);cc.strokeStyle=fg;cc.lineWidth=4;cc.strokeRect(8,8,c.width-16,c.height-16);cc.fillStyle=fg;cc.font=`${size}px serif`;cc.textAlign='center';cc.textBaseline='middle';
  const lines=text.split('\n');lines.forEach((s,i)=>cc.fillText(s,c.width/2,c.height*(i+.5)/lines.length));
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;const m=mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide}),parent,x,y,z);m.rotation.y=ry;m.castShadow=false;return m;}

/* ---------- 大殿 ---------- */
function hall(x,z){
  const t=group(scene,x,0,z);const P=M4(x,0,z);
  bbox(BT.stone,0x626e61,18.5,1,8.6,0,.52,0,P);bbox(BT.stone,0x7a8470,18.8,.22,8.8,0,1.08,0,P);
  for(let k=0;k<12;k++)bbox(BT.stone,0x3e5048,.05,.9,.06,-8.5+k*1.55,.52,4.33,P);   // 台基石缝
  // 台阶：踏步带踢面亮线，两侧垂带，中间御路，下层几级带青苔
  for(let i=0;i<5;i++){const top=1.0-.2*i,zc=4.62+.44*i,col=i>=3?0x55635a:0x626e61;bbox(BT.stone,col,7.2,.2,.44,0,top-.1,zc,P);bbox(BT.stone,0x8a927f,7.2,.035,.05,0,top-.017,zc-.2,P);}
  for(const sx of [-1,1]){bbox(BT.stone,0x7a8470,.38,.26,2.75,sx*3.75,.72,5.5,P,.455);bgeo(BT.stone,0x7a8470,G.sphere,sx*3.75,.28,6.85,.36,.26,.3,P);}
  bbox(BT.stone,0x8e9683,1.3,.12,2.6,0,.61,5.47,P,.455);bbox(BT.stone,0x5f6a5e,.9,.05,2.1,0,.69,5.47,P,.455);
  for(const [rx,rz,s] of [[-4.6,7.4,.55],[4.9,7.1,.7],[5.5,7.9,.4],[-5.2,8.1,.45]])bgeo(BT.stone,0x55655d,ROCKS[(rx*3|0)&5],rx,-.05+s*.2,rz,s,s*.7,s,P,0,rx,0,shade(.7));
  // 后墙、墙裙
  bbox(BT.wall,0x763e32,16,4.4,.35,0,3.35,-3.35,P);bbox(BT.stone,0x626e61,16.1,.8,.4,0,1.6,-3.35,P);bbox(BT.stone,0x7a8470,16.2,.1,.44,0,2.0,-3.35,P);
  // 柱：四根一排，正中一间是门（原来正中立着一根柱子，堵在门轴上）
  for(const xx of [-7.6,-2.9,2.9,7.6])for(const zz of [-2.7,2.7]){
    bgeo(BT.stone,0x7a8470,G.cyl16,xx,1.37,zz,.42,.34,.42,P);bgeo(BT.stone,0x626e61,G.cyl16,xx,1.6,zz,.34,.12,.34,P);
    bgeo(BT.lacquer,0x7a3a2c,G.cyl16,xx,3.85,zz,.27,4.5,.27,P);bgeo(BT.gold,0xbc934c,G.cyl16,xx,6.05,zz,.32,.14,.32,P);
    for(const s of [-1,1])bbox(BT.wood,0x8a5a3a,.7,.34,.2,xx+s*.55,5.75,zz,P,0,0,s*.35);   // 雀替
  }
  for(const zz of [-2.7,2.7]){bbox(BT.lacquer,0x7a3a2c,16.2,.45,.42,0,6.3,zz,P);bbox(BT.gold,0xbc934c,16.2,.06,.44,0,6.08,zz,P);}
  for(const xx of [-7.6,7.6])bbox(BT.lacquer,0x7a3a2c,.42,.45,5.8,xx,6.3,0,P);
  bbox(BT.lacquer,0x6e3226,16.2,.28,.3,0,6.62,2.55,P);
  dougongRow(P,16.2,5.4,6.55);
  // 正中一间：两扇隔扇门敞开着，折向殿内；两侧的间装格扇
  for(const s of [-1,1]){const hinge=P.clone().multiply(M4(s*2.72,1.2,2.55,1,1,1,0,-s*1.27,0));lattice(hinge,-s*1.15,2.35,0,2.25,4.5,0x6b3b2c);bgeo(BT.gold,0xbc934c,G.sphere,-s*.5,3.05,.08,.1,.1,.05,hinge);}
  for(const s of [-1,1]){lattice(P,s*5.25,3.55,2.62,4.4,4.6);}
  bbox(BT.stone,0x7a8470,4.6,.12,.5,0,1.25,2.62,P);   // 门槛石
  // 匾额与幡
  bbox(BT.wood,0x302d25,4.5,.86,.18,0,5.35,2.99,P);bbox(BT.gold,0x756139,4.55,.9,.06,0,5.35,3.1,P);
  plaque(t,'静  山  寺',4.2,.65,0,5.35,3.19);
  for(const xx of [-6.5,6.5]){bbox(BT.lacquer,0xb3543f,.7,3.5,.05,xx,4.12,3.18,P,0,0,xx>0?.035:-.035);for(let j=0;j<3;j++)bbox(BT.gold,0x756139,.27,.07,.03,xx,3.5+j*.6,3.22,P);}
  // 重檐：下檐、上层殿身、上檐
  buildRoof(P,0,6.45,0,20.4,11.4,2.2,{rl:10.5,ov:1.2,lift:.55,sTop:.42,caps:!touchMode});
  bbox(BT.wall,0x763e32,10.6,1.9,4.6,0,8.9,-.12,P);
  for(let i=0;i<11;i++)bbox(BT.gold,0x756139,.1,1.6,.08,-4.9+i*.98,8.9,2.23,P);
  bbox(BT.lacquer,0x7a3a2c,10.8,.3,4.8,0,9.9,-.12,P);
  buildRoof(P,0,9.95,-.12,13.6,7.6,1.8,{rl:6.4,ov:1.0,lift:.42,sTop:.42});
  // 殿内：供案、烛台、香碗、幡、碑
  bbox(BT.lacquer,0x5a2a22,3.0,.8,1.1,0,1.75,-1.0,P);bbox(BT.gold,0x9a7a3a,2.6,.32,.05,0,1.75,-.44,P);bbox(BT.lacquer,0x3a1a16,2.2,.14,.03,0,1.72,-.4,P);
  for(const sx of [-1.35,1.35])for(const sz of [-1.45,-.55])bbox(BT.lacquer,0x3a1a16,.14,.8,.14,sx,1.6,sz,P);
  for(const sx of [-1.1,1.1]){bgeo(BT.gold,0xbc934c,G.cyl16,sx,2.25,-1.0,.09,.1,.09,P);bgeo(BT.gold,0xbc934c,G.cyl16,sx,2.5,-1.0,.03,.42,.03,P);bgeo(BT.misc,0xe8dcc0,G.cyl16,sx,2.85,-1.0,.05,.28,.05,P);bgeo(BT.fire,0xffd27a,G.sphere,sx,3.05,-1.0,.04,.07,.04,P);}
  bgeo(BT.gold,0x6f5a2c,G.cyl16,0,2.32,-.55,.26,.22,.26,P);bgeo(BT.gold,0x8a6a3a,G.cyl16,0,2.44,-.55,.29,.04,.29,P);for(const dx of [-.08,0,.08])bgeo(BT.misc,0x8a2a1a,G.cylinder,dx,2.72,-.55+dx,.012,.45,.012,P,dx*2,0,dx*3);
  bbox(BT.lacquer,0xb3543f,.8,2.4,.03,0,4.7,-2.4,P);bbox(BT.gold,0x756139,.9,.06,.06,0,5.92,-2.4,P);bbox(BT.gold,0x756139,.8,.05,.05,0,3.48,-2.4,P);
  bbox(BT.stone,0x7a8470,1.7,.3,.6,-5.5,1.35,-2.75,P);bbox(BT.stone,0x626e61,1.3,2.3,.22,-5.5,2.65,-2.9,P);bbox(BT.stone,0x7a8470,1.42,.16,.3,-5.5,3.85,-2.9,P);
  plaque(t,'靜 山 寺 記\n山 門 試 煉',1.1,1.9,-5.5,2.65,-2.77,0,'#5c665c','#2a3128',44);
  // 青铜香炉：三足鼎，炉盖带钮，两耳，几支香
  const cx=0,cz=3.6,cy=1.2;
  for(let k=0;k<3;k++){const a=k/3*Math.PI*2;bgeo(BT.gold,0x4f4a34,G.cylinder,cx+Math.sin(a)*.32,cy+.22,cz+Math.cos(a)*.32,.07,.45,.07,P);}
  bgeo(BT.gold,0x5a5238,lathe([[.28,0],[.44,.12],[.48,.45],[.42,.62],[.5,.68]],16),cx,cy+.4,cz,1,1,1,P);
  bgeo(BT.gold,0x5a5238,G.torus,cx,cy+1.06,cz,.5,.5,.5,P,Math.PI/2);
  for(const s of [-1,1]){bgeo(BT.gold,0x5a5238,G.torus,cx+s*.52,cy+1.05,cz,.16,.16,.16,P,0,0,Math.PI/2);}
  bgeo(BT.gold,0x4f4a34,G.cyl16,cx,cy+1.12,cz,.46,.08,.46,P);bgeo(BT.gold,0x5a5238,lathe([[.4,0],[.36,.14],[.22,.28],[.1,.36],[.06,.5],[.1,.56],[0,.6]],16),cx,cy+1.14,cz,1,1,1,P);
  for(const [dx,dz] of [[-.12,.05],[.05,-.1],[.1,.12],[-.04,.14]])bgeo(BT.misc,0x8a2a1a,G.cylinder,cx+dx,cy+1.5,cz+dz,.012,.55,.012,P,dz*.8,0,dx*.8);
  return t;
}
const mainTemple=hall(0,-21);

/* ---------- 钟楼、鼓楼（替换原来缩小一半的大殿复制品） ---------- */
function tower(x,z,ry,kind){
  const t=group(scene,x,0,z);t.rotation.y=ry;const P=M4(x,0,z,1,1,1,0,ry,0);
  bbox(BT.stone,0x626e61,5.6,1.5,5.6,0,.75,0,P);bbox(BT.stone,0x7a8470,5.9,.2,5.9,0,1.55,0,P);
  for(let i=0;i<3;i++)bbox(BT.stone,0x626e61,2.4,.3,.5,0,.2+i*.42,3.2-i*.45,P);
  for(const xx of [-1.9,1.9])for(const zz of [-1.9,1.9]){bgeo(BT.stone,0x7a8470,G.cyl16,xx,1.8,zz,.3,.3,.3,P);bgeo(BT.lacquer,0x7a3a2c,G.cyl16,xx,3.5,zz,.2,3.6,.2,P);}
  for(const zz of [-1.9,1.9])bbox(BT.lacquer,0x7a3a2c,4.2,.35,.3,0,5.2,zz,P);for(const xx of [-1.9,1.9])bbox(BT.lacquer,0x7a3a2c,.3,.35,4.2,xx,5.2,0,P);
  bbox(BT.wall,0x763e32,3.9,3.2,.25,0,3.4,-1.9,P);
  for(const s of [-1,1]){lattice(P,s*1.1,3.4,1.85,1.7,3.2);}
  bbox(BT.wood,0x302d25,5.4,.28,5.4,0,5.5,0,P);
  // 上层：平座栏杆、四柱、屋顶
  for(const xx of [-2.4,2.4])for(const zz of [-2.4,2.4])bbox(BT.wood,0x6b3b2c,.14,1.0,.14,xx,6.1,zz,P);
  for(const zz of [-2.4,2.4]){bbox(BT.wood,0x6b3b2c,4.9,.1,.12,0,6.55,zz,P);for(let u=-2.0;u<=2.0;u+=.5)bbox(BT.wood,0x6b3b2c,.06,.7,.06,u,6.0,zz,P);}
  for(const xx of [-2.4,2.4]){bbox(BT.wood,0x6b3b2c,.12,.1,4.9,xx,6.55,0,P);for(let u=-2.0;u<=2.0;u+=.5)bbox(BT.wood,0x6b3b2c,.06,.7,.06,xx,6.0,u,P);}
  for(const xx of [-1.7,1.7])for(const zz of [-1.7,1.7])bgeo(BT.lacquer,0x7a3a2c,G.cyl16,xx,7.05,zz,.16,2.8,.16,P);
  for(const zz of [-1.7,1.7])bbox(BT.lacquer,0x7a3a2c,3.8,.3,.26,0,8.35,zz,P);for(const xx of [-1.7,1.7])bbox(BT.lacquer,0x7a3a2c,.26,.3,3.8,xx,8.35,0,P);
  dougongRow(P,3.8,3.8,8.5,.8);
  buildRoof(P,0,9.35,0,6.6,6.6,1.6,{rl:2.2,ov:1.0,lift:.4,sTop:.5});
  bbox(BT.wood,0x302d25,.2,.2,3.6,0,8.2,0,P);
  if(kind==='bell'){bgeo(BT.gold,0x5a5238,lathe([[0,0],[.62,0],[.66,.25],[.58,.85],[.42,1.15],[.28,1.3],[0,1.35]],16),0,6.5,0,1,1,1,P);bgeo(BT.gold,0x4f4a34,G.cyl16,0,7.95,0,.08,.5,.08,P);
    bbox(BT.wood,0x4a2e26,.16,.16,1.6,1.2,7.0,0,P,0,0,0);}
  else{bgeo(BT.lacquer,0x8a3a2c,G.cyl16,0,7.0,0,.8,1.1,.8,P,0,0,Math.PI/2);for(const s of [-1,1])bgeo(BT.misc,0xd9c9a2,G.cyl16,s*.56,7.0,0,.72,.04,.72,P,0,0,Math.PI/2);for(const s of [-1,1])bbox(BT.wood,0x4a2e26,.14,1.2,.14,s*.9,6.3,0,P);}
  plaque(t,kind==='bell'?'钟 楼':'鼓 楼',1.5,.5,0,4.85,1.98);
  return t;
}
const sideTemple=tower(-22,-6,Math.PI*.39,'bell');
const otherTemple=tower(22,-8,-Math.PI*.39,'drum');

/* ---------- 山门：南沿正中，四柱三间、小歇山顶、敞着门，石阶往雾里落下去 ---------- */
{
  const P=M4(0,0,16.6);const t=group(scene,0,0,16.6);
  bbox(BT.stone,0x626e61,11.5,.5,3.2,0,-.28,0,P);bbox(BT.stone,0x7a8470,11.8,.12,3.4,0,-.05,0,P);
  const xs=[-4.6,-1.7,1.7,4.6],hs=[4.3,5.1,5.1,4.3];
  xs.forEach((px,i)=>{bgeo(BT.stone,0x7a8470,G.cyl16,px,.24,0,.4,.36,.4,P);bgeo(BT.lacquer,0x7a3a2c,G.cyl16,px,hs[i]/2+.3,0,.24,hs[i],.24,P);bgeo(BT.gold,0xbc934c,G.cyl16,px,hs[i]+.34,0,.28,.12,.28,P);});
  bbox(BT.lacquer,0x7a3a2c,3.6,.4,.36,0,5.25,0,P);bbox(BT.lacquer,0x7a3a2c,3.6,.3,.3,0,4.35,0,P);
  for(const s of [-1,1]){bbox(BT.lacquer,0x7a3a2c,3.1,.34,.32,s*3.15,4.45,0,P);bbox(BT.lacquer,0x7a3a2c,3.1,.26,.28,s*3.15,3.65,0,P);}
  for(let xx=-4.2;xx<=4.3;xx+=1.2){dougong(P,xx,5.45,.45,0,.8);dougong(P,xx,5.45,-.45,Math.PI,.8);}
  buildRoof(P,0,6.2,0,11.4,3.4,1.5,{rl:5.6,ov:.95,lift:.42,sTop:.45});
  bbox(BT.wood,0x302d25,2.4,.7,.14,0,4.7,.28,P);bbox(BT.gold,0x756139,2.5,.76,.05,0,4.7,.36,P);plaque(t,'山  門',2.3,.6,0,4.7,.4,0,'#1f2622','#d9b76a',72);
  // 门扇：向南（外）敞开
  for(const s of [-1,1]){const hinge=P.clone().multiply(M4(s*1.62,-.0,.3,1,1,1,0,s*1.15,0));lattice(hinge,-s*.72,1.9,0,1.4,3.6,0x5a2e22);}
  bbox(BT.stone,0x7a8470,3.0,.14,.4,0,-.02,.4,P);
  // 抱鼓石
  for(const s of [-1,1]){bbox(BT.stone,0x7a8470,.5,.5,.9,s*5.3,.2,.1,P);bgeo(BT.stone,0x8e9683,G.cyl16,s*5.3,.75,.25,.42,.16,.42,P,0,0,Math.PI/2);}
  // 石阶：十一级往下，两侧垂带压顶，顶上一对望柱
  for(let i=0;i<11;i++){const top=-.1-.3*(i+1),zc=1.9+.55*i;bbox(BT.stone,i>6?0x55635a:0x626e61,6.2,.3,.56,0,top-.15,zc,P);bbox(BT.stone,0x8a927f,6.2,.03,.05,0,top-.015,zc-.26,P);}
  bbox(BT.stone,0x55635a,6.6,.6,1.6,0,-3.7,8.1,P);
  for(const s of [-1,1]){bbox(BT.stone,0x7a8470,.42,.28,6.9,s*3.3,-1.62,4.65,P,.503);bgeo(BT.stone,0x7a8470,lathe([[.2,0],[.2,1.05],[.14,1.1],[.24,1.25],[.2,1.45],[.1,1.55],[.02,1.62]],12),s*3.3,-.1,1.5,1,1,1,P);bgeo(BT.stone,0x7a8470,G.sphere,s*3.3,-3.55,8.2,.36,.26,.3,P);}
  for(const [rx,rz,s] of [[-4.4,4.5,.7],[4.6,6,.9],[-4.9,8,1.1],[4.4,9.5,.6]])bgeo(BT.stone,0x55655d,ROCKS[(rx*5|0)&5],rx,groundH(rx,rz+16.6)+s*.3,rz,s,s*.7,s,P,0,rx,0,shade(.7));
}

/* ---------- 石灯笼：旋转剖面的柱身，六角火袋，翘角小顶 ---------- */
const lanternBody=lathe([[.52,0],[.52,.16],[.34,.2],[.24,.32],[.2,1.02],[.4,1.08],[.46,1.2]],12);
const lanternRoof=new THREE.ConeGeometry(.62,.42,6);
const glows=[];let glowTexture=null;
const lanternSpots=[];
function lantern(x,z) {
  const P=M4(x,0,z,1,1,1,0,Math.PI/6,0);
  bbox(BT.stone,0x626e61,1.1,.24,1.1,0,.12,0,P,0,Math.PI/6,0);
  bgeo(BT.stone,0x7a8470,lanternBody,0,.24,0,1,1,1,P);
  bgeo(BT.fire,0xf4cf7b,G.cyl6,0,1.77,0,.32,.55,.32,P);
  for(let k=0;k<6;k++){const a=k/6*Math.PI*2;bbox(BT.stone,0x3e5048,.09,.62,.09,Math.sin(a)*.33,1.77,Math.cos(a)*.33,P);}
  bgeo(BT.stone,0x626e61,G.cyl6,0,2.08,0,.42,.08,.42,P);
  bgeo(BT.roof,0x304e47,lanternRoof,0,2.33,0,1,1,1,P);
  bgeo(BT.gold,0x756139,G.sphere,0,2.62,0,.09,.16,.09,P);
  lanternSpots.push({x,z});
}
{
  const glowCanvas=document.createElement('canvas');glowCanvas.width=64;glowCanvas.height=64;
  const gc=glowCanvas.getContext('2d'),gradient=gc.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba(255,255,255,.52)');gradient.addColorStop(.18,'rgba(255,255,255,.17)');gradient.addColorStop(1,'rgba(255,255,255,0)');gc.fillStyle=gradient;gc.fillRect(0,0,64,64);
  glowTexture=new THREE.CanvasTexture(glowCanvas);
}
for(const x of [-11,11])for(const z of [-11,-3,6,13])lantern(x,z);
const glowMat=new THREE.MeshBasicMaterial({map:glowTexture,color:'#ffc565',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
const haloMat=new THREE.MeshBasicMaterial({color:'#efb95a',transparent:true,opacity:.08,depthWrite:false});
for(const s of lanternSpots){const g=mesh(new THREE.PlaneGeometry(2.3,2.3),glowMat,scene,s.x,1.77,s.z);g.castShadow=false;glows.push(g);
  const h=mesh(new THREE.CircleGeometry(1.9,24),haloMat,scene,s.x,.08,s.z);h.rotation.x=-Math.PI/2;h.castShadow=false;}
const warmLights=[];
if(!touchMode){
  // 暖光：离大殿最近的四盏灯和殿内一盏。regions.js 会把所有灯乘 .45，所以这里写高一截
  for(const [x,z] of [[-11,-11],[11,-11],[-11,-3],[11,-3]]){const l=new THREE.PointLight('#ffb266',1.9,9,1.7);l.position.set(x,1.9,z);scene.add(l);warmLights.push(l);}
  const inner=new THREE.PointLight('#ffb266',2.4,11,1.6);inner.position.set(0,4.4,-21.3);scene.add(inner);warmLights.push(inner);
}

// Low stone balustrades frame the arena without obstructing the follow camera.
const postGeo=lathe([[.2,0],[.2,1.05],[.14,1.1],[.25,1.24],[.2,1.44],[.1,1.54],[.02,1.6]],12);
{
  const kept=[];
  for(let i=0;i<26;i++){const a=(i/26)*Math.PI*2,x=Math.sin(a)*16.1,z=Math.cos(a)*16.1;if(z<-13||z>12)continue;kept.push({i,a,x,z});}
  kept.forEach((k,n)=>{
    const P=M4(k.x,0,k.z,1,1,1,0,k.a,0);
    bgeo(BT.stone,0x626e61,postGeo,0,0,0,1,1,1,P);
    bbox(BT.stone,0x55635a,3.2,.16,.16,1.65,.1,0,P);                       // 地栿
    bbox(BT.stone,0x626e61,2.9,.62,.14,1.65,.62,0,P);bbox(BT.stone,0x4c5a51,2.4,.4,.05,1.65,.62,.08,P);bbox(BT.stone,0x4c5a51,2.4,.4,.05,1.65,.62,-.08,P);   // 栏板与刻槽
    bbox(BT.stone,0x7a8470,3.1,.15,.22,1.65,1.12,0,P);                     // 寻杖
    const next=kept[n+1];
    if(!next||next.i!==k.i+1){bgeo(BT.stone,0x7a8470,G.sphere,-.7,.32,0,.42,.32,.24,P);}   // 缺口处的抱鼓石
    if(n===0||kept[n-1].i!==k.i-1){bgeo(BT.stone,0x7a8470,G.sphere,3.9,.32,0,.42,.32,.24,P);}
  });
}
// 乱石：还吃原来那 8 个随机数，几何换成揉过的礁石，落在崖坡上
for(let i=0;i<35;i++){
  const a=rand(0,Math.PI*2),r=rand(18,35);const sx=rand(.8,3),sy=rand(.8,2.8),sz=rand(.8,3);const rx=rand(0,1),ry=rand(0,3),rz=rand(0,1);
  const x=Math.cos(a)*r,z=Math.sin(a)*r;bgeo(BT.stone,i%2?0x3e5048:0x626e61,ROCKS[i%6],x,groundH(x,z)+sy*.2,z,sx,sy*.8,sz,null,rx*.3,ry,rz*.3,shade(.6));
}
// Instanced pines and peaks keep the wooded valley inexpensive on phones.
const treeCount=touchMode?52:95;
/* 山谷的林子。有外部模型就交给 journeys/foliage.js（六地共用那一套），
   拿不到（npm test 的 Node 环境没有 XHR）才退回原来的圆柱加锥体。
   松林是这里的底色，所以针叶占多数，掺一点杂树。树脚跟着新地形走。 */
let foliage=null;
if(TREES){
  // 山谷原来那套锥体树是很暗的墨绿（#29453a）。换成模型后整片亮了一截，
  // 谷地从沉静变得发白，所以压回暗绿。
  foliage=window.AstraFoliage.create(THREE,scene,{srgb:true,assets:TREES,tint:0x76907a});
  const PARTS=['PineTree_1','PineTree_2','PineTree_4','PineTree_1','NormalTree_3'];
  const groups=new Map();
  for(let i=0;i<treeCount;i++){
    const a=rand(0,Math.PI*2),r=rand(22,67);
    const sp={x:Math.cos(a)*r,y:groundH(Math.cos(a)*r,Math.sin(a)*r)-.2,z:Math.sin(a)*r,scale:rand(.75,1.5),
      rot:rand(0,6.283),lean:rand(-.07,.07),phase:rand(0,6.283)};
    const k=PARTS[i%PARTS.length];
    (groups.get(k)||groups.set(k,[]).get(k)).push(sp);
  }
  for(const [part,items] of groups) foliage.plant(part,items,{height:9.5});
}else{
  const trunks=new THREE.InstancedMesh(G.cylinder,M.trunk,treeCount);
  const crowns=new THREE.InstancedMesh(G.cone,M.tree,treeCount*4);
  for(let i=0;i<treeCount;i++){
    const a=rand(0,Math.PI*2),r=rand(22,67),x=Math.cos(a)*r,z=Math.sin(a)*r,h=rand(6,15),lean=rand(-.07,.07),gy=groundH(x,z);
    dummy.position.set(x,h*.33+gy,z);dummy.scale.set(.15,h*.7,.15);dummy.rotation.set(0,0,lean);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    for(let j=0;j<4;j++){
      dummy.position.set(x+lean*h*.3,h*(.4+j*.16)+gy,z);const w=h*(.26-j*.042);
      dummy.scale.set(w,h*.32,w);dummy.rotation.set(0,rand(0,6),0);dummy.updateMatrix();crowns.setMatrixAt(i*4+j,dummy.matrix);
      tint.setHSL(.37,.16,rand(.13,.23));crowns.setColorAt(i*4+j,tint);
    }
  }
  scene.add(trunks,crowns);
}
// 远峰：更高更瘦的揉过的锥体，底部压暗，隔着雾成一层层剪影
for(let i=0;i<25;i++){
  const a=i/25*Math.PI*2,r=rand(62,92);const y=rand(5,10),sx=rand(8,17),sy=rand(19,40),sz=rand(8,17),ry=rand(0,3);
  const x=Math.cos(a)*r,z=Math.sin(a)*r;bgeo(BT.far,i%3?0x536d63:0x71847a,PEAKS[i%4],x,y-4,z,sx,sy*1.25,sz,null,0,ry,0,shade(.5));
}
// 草丛：有模型时用 alpha 卡片（自己画的四列草叶图集，随风摆），Node 里退回锥体
const grassSpots=[];
for(let i=0;i<180;i++){
  const a=rand(0,6.283),r=rand(15.8,19.5);const sy=rand(.25,.8);const rx=rand(-.3,.3),ry=rand(0,6),rz=rand(-.4,.4);
  grassSpots.push({x:Math.cos(a)*r,z:Math.sin(a)*r,sy,rx,ry,rz});
}
if(TREES&&foliage){
  const c=document.createElement('canvas');c.width=256;c.height=64;
  try{const g=c.getContext('2d');g.clearRect(0,0,256,64);for(let col=0;col<4;col++){for(let b=0;b<14;b++){const x0=col*64+8+r2()*48,h=22+r2()*36,lean=(r2()-.5)*26;g.strokeStyle=['#6b7a48','#7d8a52','#5e6f42','#8a955c'][(b+col)%4];g.lineWidth=1.2+r2()*1.6;g.beginPath();g.moveTo(x0,64);g.quadraticCurveTo(x0+lean*.5,64-h*.6,x0+lean,64-h);g.stroke();}}}catch(e){}
  const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;
  const mat=new THREE.MeshPhongMaterial({map:tex,alphaTest:.4,transparent:false,side:THREE.DoubleSide,specular:0x000000,shininess:1});
  const items=grassSpots.map((s,i)=>({m:foliage.M(s.x,groundH(s.x,s.z)+.02,s.z,.9+s.sy*.8,.7+s.sy*1.1,.9+s.sy*.8,0,s.ry,0),phase:s.ry*3,sway:.02,col:i%4}));
  foliage.instance(foliage.crossCard(1,1).translate(0,.5,0),foliage.windMat(mat,'card'),items,{shadow:false});
}else{
  const grass=new THREE.InstancedMesh(G.cone,material('#6b7754'),180);
  grassSpots.forEach((s,i)=>{dummy.position.set(s.x,groundH(s.x,s.z)+.1,s.z);dummy.scale.set(.045,s.sy,.07);dummy.rotation.set(s.rx,s.ry,s.rz);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);});
  scene.add(grass);
}

/* ---------- 天穹、雾片、地面薄霭 ---------- */
const skyU={uTop:{value:new THREE.Color('#6f8a86')},uBot:{value:new THREE.Color('#8d9f96')}};
const skyMat=new THREE.ShaderMaterial({uniforms:skyU,side:THREE.BackSide,depthWrite:false,fog:false,
  vertexShader:`varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec3 vDir;uniform vec3 uTop,uBot;void main(){float t=smoothstep(-.04,.5,vDir.y);gl_FragColor=vec4(mix(uBot,uTop,t),1.);}`});
const sky=new THREE.Mesh(new THREE.SphereGeometry(140,24,12),skyMat);sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);
const mistPlanes=[];
{
  const c=document.createElement('canvas');c.width=128;c.height=64;
  try{const g=c.getContext('2d');const gr=g.createRadialGradient(64,32,4,64,32,62);gr.addColorStop(0,'rgba(255,255,255,.85)');gr.addColorStop(.45,'rgba(255,255,255,.35)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,128,64);
    g.globalCompositeOperation='destination-out';for(let i=0;i<260;i++){g.fillStyle=`rgba(0,0,0,${.05+r2()*.2})`;g.beginPath();g.arc(r2()*128,r2()*64,2+r2()*7,0,6.3);g.fill();}}catch(e){}
  const tex=new THREE.CanvasTexture(c);
  const n=touchMode?5:11;
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2+rand2(-.2,.2),r=rand2(26,48),w=rand2(22,40),h=w*rand2(.28,.42);
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tex,color:'#93a49c',transparent:true,opacity:rand2(.12,.28),depthWrite:false,fog:false}));
    m.position.set(Math.cos(a)*r,rand2(1.5,5.5),Math.sin(a)*r);m.userData.base=m.position.x;m.userData.phase=rand2(0,6.3);m.userData.speed=rand2(.15,.35);m.renderOrder=1;scene.add(m);glows.push(m);mistPlanes.push(m);}
  const hc=document.createElement('canvas');hc.width=128;hc.height=128;
  try{const g=hc.getContext('2d');const gr=g.createRadialGradient(64,64,20,64,64,64);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.45,'rgba(255,255,255,.55)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,128,128);}catch(e){}
  const haze=new THREE.Mesh(new THREE.RingGeometry(14,44,48),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(hc),color:'#8f9f98',transparent:true,opacity:.42,depthWrite:false,fog:false,side:THREE.DoubleSide}));
  haze.rotation.x=-Math.PI/2;haze.position.y=-.3;haze.renderOrder=0;scene.add(haze);mistPlanes.haze=haze;
}
function setSky(day){const top=day?'#9fb3a4':'#6f8a86',bot=day?'#b6c3b0':'#8d9f96';skyU.uTop.value.set(top).convertSRGBToLinear();skyU.uBot.value.set(bot).convertSRGBToLinear();
  for(const m of mistPlanes)m.material.color.set(day?'#b3bfb2':'#93a49c').convertSRGBToLinear();mistPlanes.haze.material.color.set(day?'#adbaad':'#8f9f98').convertSRGBToLinear();
  for(const l of warmLights)l.intensity=(l.userData.base??(l.userData.base=l.intensity))*(day?.35:1);}
function tick(t){for(const m of mistPlanes)m.position.x=m.userData.base+Math.sin(t*m.userData.speed+m.userData.phase)*3.5;}

/* ---------- 把合批结果放进场景 ---------- */
for(const k in BT){if(BT[k].empty)continue;const m=BT[k].build(BM[k]);m.castShadow=k!=='far'&&k!=='fire';m.receiveShadow=true;m.frustumCulled=false;scene.add(m);}

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

return {scene,camera,foliage,hero,warden,mainTemple,sideTemple,otherTemple,tell,tellMaterial,targetMark,binding,slash,slashMaterial,waveMeshes,particles,particleGroup,glows,motes,burst,animateFighter,rotateToward,sunlight,setSky,tick,groundH};

};
