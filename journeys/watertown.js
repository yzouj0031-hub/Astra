// Adapted from the user-supplied source for Astra. Three.js is provided by the host (r128).
window.AstraRegionFactories.watertown=function(THREE){
/* ============================================================
   烟雨渡 · 一座可以走进去的江南水乡
   单文件 Three.js 世界。所有几何体由代码拼出，不加载任何外部资源。
   ============================================================ */
'use strict';
const IS_NODE = true;
const T = THREE;
const NODE_ENV={aspect:1,makeCanvas:(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;},makeRenderer:()=>({shadowMap:{},setPixelRatio(){},setSize(){}}),ready(){}};

/* ---------- 随机：固定种子，每次打开都是同一座镇子 ---------- */
let _seed = 20260906;
function rnd(){ _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; }
const rr = (a,b)=>a+(b-a)*rnd();
const ri = (a,b)=>Math.floor(rr(a,b+1));
const pick = arr=>arr[Math.floor(rnd()*arr.length)];
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const TAU=Math.PI*2;

/* ---------- 调色 ---------- */
const C = {
  wall:0xf1ece1, wallWarm:0xe9dfcd, wallCool:0xe3e6e2,
  slate:0x2c3137, slateDk:0x1d2125, slateLt:0x3a4048,
  wood:0x6b4a2b, woodDk:0x3a2716, woodLt:0x8c6a42,
  stone:0x9a978a, stoneDk:0x767468, stoneLt:0xb0ac9e,
  lantern:0xd94a35, glowWin:0xffc27a,
  willow:0x86a86b, willowDk:0x5f8a4c, trunk:0x5a4634,
  grass:0x7c8f5f, grassDk:0x5f7348, soil:0x8a7a5c,
};
function tint(hex, amt){ // 轻微色偏，避免整片颜色太平
  const c=new T.Color(hex); const h={}; c.getHSL(h);
  return c.setHSL(h.h + rr(-0.008,0.008), clamp(h.s + rr(-amt,amt),0,1), clamp(h.l + rr(-amt,amt),0,1));
}

/* ---------- 合批：成百上千个小几何体合成一个 mesh，颜色写进顶点 ---------- */
class Batch {
  constructor(){ this.pos=[]; this.nor=[]; this.col=[]; this.uv=[]; this.idx=[]; this.n=0; }
  add(geo, matrix, color, uvBox){
    const p=geo.attributes.position, nrm=geo.attributes.normal, uv=geo.attributes.uv;
    const nm=new T.Matrix3().getNormalMatrix(matrix);
    const v=new T.Vector3(), nv=new T.Vector3();
    const c=(color&&color.isColor)?color:new T.Color(color);
    for(let i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i).applyMatrix4(matrix); this.pos.push(v.x,v.y,v.z);
      nv.fromBufferAttribute(nrm,i).applyMatrix3(nm).normalize(); this.nor.push(nv.x,nv.y,nv.z);
      this.col.push(c.r,c.g,c.b);
      if(uv){ let u=uv.getX(i), w=uv.getY(i); if(uvBox){ u=uvBox[0]+u*(uvBox[2]-uvBox[0]); w=uvBox[1]+w*(uvBox[3]-uvBox[1]); } this.uv.push(u,w); }
      else this.uv.push(0,0);
    }
    if(geo.index){ const ix=geo.index; for(let i=0;i<ix.count;i++) this.idx.push(ix.getX(i)+this.n); }
    else { for(let i=0;i<p.count;i++) this.idx.push(i+this.n); }
    this.n+=p.count;
  }
  get empty(){ return this.n===0; }
  build(material){
    const g=new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.pos,3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.nor,3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.col,3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.uv,2));
    g.setIndex(this.idx);
    return new T.Mesh(g, material);
  }
}
function flipInside(geo){ // 把几何体翻成"从里面看"（桥洞内壁用）
  const n=geo.attributes.normal; for(let i=0;i<n.count;i++){ n.setXYZ(i,-n.getX(i),-n.getY(i),-n.getZ(i)); }
  if(geo.index){ const ix=geo.index; for(let i=0;i<ix.count;i+=3){ const a=ix.getX(i+1), b=ix.getX(i+2); ix.setX(i+1,b); ix.setX(i+2,a); } }
  return geo;
}

/* ---------- 基础几何与矩阵 ---------- */
const G = {
  box:new T.BoxGeometry(1,1,1), cyl:new T.CylinderGeometry(1,1,1,8), cyl6:new T.CylinderGeometry(1,1,1,6),
  sph:new T.SphereGeometry(1,9,7), cone:new T.ConeGeometry(1,1,8), cone6:new T.ConeGeometry(1,1,6), plane:new T.PlaneGeometry(1,1),
  leg:new T.BoxGeometry(0.18,0.62,0.2).translate(0,-0.31,0),
};
const _p=new T.Vector3(), _q=new T.Quaternion(), _s=new T.Vector3(), _e=new T.Euler();
function M(px,py,pz, sx=1,sy=1,sz=1, rx=0,ry=0,rz=0){
  _e.set(rx,ry,rz); _q.setFromEuler(_e); _p.set(px,py,pz); _s.set(sx,sy,sz);
  return new T.Matrix4().compose(_p,_q,_s);
}
function box(batch,color, w,h,d, x,y,z, ry=0,rx=0,rz=0, parent=null, uvBox){
  let m=M(x,y,z,w,h,d,rx,ry,rz); if(parent) m=parent.clone().multiply(m); batch.add(G.box,m,color,uvBox);
}
function shape(batch,color,geo, x,y,z, parent=null, ry=0){
  let m=M(x,y,z,1,1,1,0,ry,0); if(parent) m=parent.clone().multiply(m); batch.add(geo,m,color);
}

/* ---------- 文字贴图：招牌、酒旗、牌匾共用一张画布 ---------- */
const SIGNS=['同福茶楼','老酒坊','米行','绸缎庄','书肆','药铺','悦来客栈','张记豆腐','糕团','伞铺','笔墨','布庄','醋坊','船票','面馆','香烛','铁铺','酱园','当铺','裁缝','馄饨','茶叶','渔具','灯笼'];
const FLAGS=['酒','茶','面','客'];
const Atlas={ tex:null, cells:{}, W:1024, H:1024 };
const CJK='"Noto Serif SC","Noto Serif CJK SC","Songti SC","STSong","SimSun","Source Han Serif SC",serif';
function buildAtlas(){
  const cv=document.createElement('canvas'); cv.width=Atlas.W; cv.height=Atlas.H;
  const g=cv.getContext('2d');
  g.fillStyle='#5a3a22'; g.fillRect(0,0,Atlas.W,Atlas.H);
  g.textAlign='center'; g.textBaseline='middle';
  const cell=(x,y,w,h)=>[x/Atlas.W, 1-(y+h)/Atlas.H, (x+w)/Atlas.W, 1-y/Atlas.H];
  // 竖排招牌：64x256 一格
  SIGNS.forEach((s,i)=>{
    const x=(i%16)*64, y=Math.floor(i/16)*256;
    g.fillStyle=['#3a2716','#5a3a22','#6f4a2c'][i%3]; g.fillRect(x,y,64,256);
    g.strokeStyle='rgba(242,230,200,.4)'; g.lineWidth=2; g.strokeRect(x+5,y+5,54,246);
    const n=s.length, size=n<=2?44:(n===3?40:36), step=n<=2?70:(n===3?60:54), y0=y+128-(n-1)*step/2;
    g.fillStyle='#f2e6c8'; g.font=`600 ${size}px ${CJK}`;
    for(let k=0;k<n;k++) g.fillText(s[k], x+32, y0+k*step);
    Atlas.cells['sign'+i]=cell(x,y,64,256);
  });
  // 酒旗：128x128 一格，第 3 行
  FLAGS.forEach((s,i)=>{
    const x=i*128, y=512; const bg=['#2f3a5c','#f0e6d0','#8c2f2f','#3f5a6e'][i], fg=['#f0e6d0','#2f3a5c','#f0e6d0','#f0e6d0'][i];
    g.fillStyle=bg; g.fillRect(x,y,128,128);
    g.fillStyle=fg; g.font=`700 92px ${CJK}`; g.fillText(s, x+64, y+68);
    Atlas.cells['flag'+i]=cell(x,y,128,128);
  });
  // 牌匾（横排）
  const plaque=(key,text,x,y,w,h,bg,fg,size)=>{ g.fillStyle=bg; g.fillRect(x,y,w,h); g.fillStyle=fg; g.font=`700 ${size}px ${CJK}`;
    g.fillText(text, x+w/2, y+h/2+4); Atlas.cells[key]=cell(x,y,w,h); };
  plaque('gate','烟雨渡',0,660,320,100,'#1f2327','#e8c66a',72);
  plaque('tea','同福茶楼',340,660,320,100,'#3a2716','#f2e6c8',66);
  plaque('dock','渡口',680,660,160,100,'#7e7c72','#1f2327',60);
  plaque('pagoda','望江塔',0,780,320,100,'#8c2f2f','#f2e6c8',66);
  const tex=new T.CanvasTexture(cv); tex.anisotropy=4; Atlas.tex=tex;
}
const uvOf = key => Atlas.cells[key] || null;

/* ---------- 镇子的布局与碰撞 ---------- */
const L = {
  canal:6,            // 主河道半宽
  laneIn:6, laneOut:12,
  hill:{x:-112, z:84, r:60, h:20},
  branch:{x0:60, x1:68, z0:6, z1:92},
};
const waterRects=[ {x0:-300,x1:300,z0:-L.canal,z1:L.canal}, {x0:L.branch.x0,x1:L.branch.x1,z0:L.branch.z0,z1:L.branch.z1} ];
const bridges=[];      // {x,z,axis:'z'|'x',len,halfW,h}
const obstacles=[];    // {x0,x1,z0,z1}
const lanternSpots=[]; // {x,y,z,water:1|-1|0}
function inWaterRaw(x,z){ for(const w of waterRects){ if(x>=w.x0&&x<=w.x1&&z>=w.z0&&z<=w.z1) return true; } return false; }
function bridgeAt(x,z){
  for(const b of bridges){
    if(b.axis==='z'){ if(Math.abs(x-b.x)<=b.halfW && Math.abs(z-b.z)<=b.len) return b; }
    else { if(Math.abs(z-b.z)<=b.halfW && Math.abs(x-b.x)<=b.len) return b; }
  } return null;
}
function bridgeY(b,x,z){ const s=(b.axis==='z'?(z-b.z):(x-b.x))/b.len; return b.h*(1-s*s); }
function isWater(x,z){ return inWaterRaw(x,z) && !bridgeAt(x,z); }
function hillY(x,z){ const h=L.hill; const d=Math.hypot(x-h.x,z-h.z)/h.r; if(d>=1) return 0; const t=1-d*d; return h.h*t*t; }
function groundY(x,z){ const b=bridgeAt(x,z); if(b) return bridgeY(b,x,z); return hillY(x,z); }
function blocked(x,z){
  if(isWater(x,z)) return true;
  if(Math.abs(x)>330||Math.abs(z)>330) return true;
  for(const o of obstacles){ if(x>o.x0&&x<o.x1&&z>o.z0&&z<o.z1) return true; }
  return false;
}

/* ============================================================
   建筑：粉墙、黛瓦、马头墙、拱桥、石驳岸、柳树、宝塔、牌坊、茶馆
   ============================================================ */
const B={};                                    // 静态合批容器
const BATCH_KEYS=['wall','roof','wood','stone','glow','foliage','sign','misc'];
for(const k of BATCH_KEYS) B[k]=new Batch();

/* 屋顶截面：从脊到檐，下凹的曲线 */
function roofProfile(H,r,halfD){
  const pts=[]; for(const s of [0,0.34,0.68,1]){ pts.push([s*halfD, H + r*Math.pow(1-s,1.6) - (s===1?0.12:0)]); } return pts;
}
function roofYAt(H,r,halfD,z){ const s=clamp(Math.abs(z)/halfD,0,1); return H + r*Math.pow(1-s,1.6); }

function addRoof(parent,w,d,H,r,ox,oz,slateC,stripC,bt){
  const halfD=d/2+oz, prof=roofProfile(H,r,halfD), t=0.3, len=w+2*ox;
  const outer=[]; for(let i=prof.length-1;i>=0;i--) outer.push([-prof[i][0],prof[i][1]]); for(let i=1;i<prof.length;i++) outer.push([prof[i][0],prof[i][1]]);
  const sh=new T.Shape(); sh.moveTo(outer[0][0],outer[0][1]); for(let i=1;i<outer.length;i++) sh.lineTo(outer[i][0],outer[i][1]);
  for(let i=outer.length-1;i>=0;i--) sh.lineTo(outer[i][0],outer[i][1]-t); sh.closePath();
  const geo=new T.ExtrudeGeometry(sh,{depth:len,bevelEnabled:false});
  bt.roof.add(geo, parent.clone().multiply(M(-len/2,0,0,1,1,1,0,Math.PI/2,0)), slateC);
  // 瓦垄：每段坡面铺细条
  const segs=[]; for(let i=0;i<prof.length-1;i++){ const [z0,y0]=prof[i],[z1,y1]=prof[i+1]; segs.push({z:(z0+z1)/2,y:(y0+y1)/2+0.09,len:Math.hypot(z1-z0,y1-y0)+0.05,ang:Math.atan2(y1-y0,z1-z0)}); }
  const n=Math.max(2,Math.round(len/1.0));
  for(let k=0;k<=n;k++){
    const x=-len/2+0.12+(len-0.24)*k/n;
    for(const sg of segs){
      box(bt.roof,stripC,0.13,0.1,sg.len, x,sg.y, sg.z, 0,-sg.ang,0,parent);
      box(bt.roof,stripC,0.13,0.1,sg.len, x,sg.y,-sg.z, 0, sg.ang,0,parent);
    }
  }
  // 正脊与两端翘起的脊饰
  box(bt.roof,C.slateDk,len+0.4,0.36,0.62, 0,H+r+0.1,0, 0,0,0,parent);
  box(bt.roof,C.slateDk,0.5,0.78,0.34,  len/2+0.15,H+r+0.4,0, 0,0,-0.35,parent);
  box(bt.roof,C.slateDk,0.5,0.78,0.34, -len/2-0.15,H+r+0.4,0, 0,0, 0.35,parent);
}
function addBody(parent,w,d,H,r,yBase,color,bt){
  const sh=new T.Shape(), hd=d/2, halfD=hd+0.8;
  sh.moveTo(-hd,yBase); sh.lineTo(hd,yBase); sh.lineTo(hd,H);
  for(const s of [0.85,0.7,0.5,0.3,0.15,0,-0.15,-0.3,-0.5,-0.7,-0.85]) sh.lineTo(s*hd, roofYAt(H,r,halfD,s*hd)-0.26);
  sh.lineTo(-hd,H); sh.closePath();
  const geo=new T.ExtrudeGeometry(sh,{depth:w,bevelEnabled:false});
  bt.wall.add(geo, parent.clone().multiply(M(-w/2,0,0,1,1,1,0,Math.PI/2,0)), color);
}
/* 马头墙：山墙两端阶梯状高出屋面 */
function addGables(parent,w,d,H,r,oz,wallC,bt){
  const halfD=d/2+oz, bounds=[0,0.2*d,0.42*d,d/2+0.5];
  for(const sx of [-1,1]){
    const gx=sx*(w/2+0.14);
    for(let k=0;k<3;k++){
      const z0=bounds[k], z1=bounds[k+1], top=roofYAt(H,r,halfD,z0)+0.6;
      for(const sz of (k===0?[1]:[-1,1])){
        const zc=k===0?0:sz*(z0+z1)/2, zl=k===0?2*z1:(z1-z0);
        box(bt.wall,wallC,0.5,top,zl+0.02, gx,top/2,zc, 0,0,0,parent);
        box(bt.roof,C.slateDk,0.82,0.28,zl+0.45, gx,top+0.12,zc, 0,0,0,parent);
      }
    }
  }
}
/* 临街立面：窗、门、铺面、招牌、酒旗、阳台、灯笼 */
function addFront(parent,o,H,bt,upperOnly){
  const w=o.w, d=o.d, zf=d/2, wood=C.woodDk;
  const slots=Math.max(1,Math.floor((w-1.4)/2.5)), gap=(w-1.4)/slots;
  const xs=[]; for(let i=0;i<slots;i++) xs.push(-w/2+0.7+gap*(i+0.5));
  const win=(x,y)=>{
    box(bt.wood,wood,1.32,1.52,0.14, x,y,zf+0.03, 0,0,0,parent);
    box(bt.glow,C.glowWin,1.1,1.3,0.06, x,y,zf+0.08, 0,0,0,parent);
    box(bt.wood,wood,0.05,1.3,0.06, x-0.2,y,zf+0.11, 0,0,0,parent); box(bt.wood,wood,0.05,1.3,0.06, x+0.2,y,zf+0.11, 0,0,0,parent);
    box(bt.wood,wood,1.1,0.05,0.06, x,y-0.22,zf+0.11, 0,0,0,parent); box(bt.wood,wood,1.1,0.05,0.06, x,y+0.22,zf+0.11, 0,0,0,parent);
  };
  if(o.floors===2){ for(const x of xs) win(x,4.9); }
  if(upperOnly){}
  else if(o.shop){
    const ow=Math.min(w*0.62,7);
    box(bt.misc,0x120f0d,ow,2.75,0.5, 0,1.4,zf-0.15, 0,0,0,parent);          // 敞开的铺面（深色内里）
    box(bt.wood,wood,ow+0.5,0.3,0.4, 0,2.95,zf+0.1, 0,0,0,parent);           // 门楣
    box(bt.wood,wood,0.3,2.9,0.4, -ow/2-0.1,1.45,zf+0.1, 0,0,0,parent); box(bt.wood,wood,0.3,2.9,0.4, ow/2+0.1,1.45,zf+0.1, 0,0,0,parent);
    box(bt.wood,C.woodLt,ow*0.85,0.9,0.7, 0,0.45,zf+0.3, 0,0,0,parent);      // 柜台
    if(o.signKind==='board'){                                                  // 竖招牌
      const sx=w/2-1.0, cellKey='sign'+(o.signIdx%SIGNS.length);
      box(bt.wood,wood,0.08,0.08,1.1, sx,H-0.3,zf+0.55, 0,0,0,parent);
      box(bt.sign,C.wood,0.56,1.9,0.07, sx,H-1.35,zf+1.05, 0,0,0,parent, uvOf(cellKey));
    } else {                                                                   // 酒旗
      const sx=-w/2+1.2, key='flag'+(o.signIdx%FLAGS.length);
      box(bt.wood,wood,0.07,0.07,2.4, sx,H-0.6,zf+1.1, 0,0,0.0,parent);
      box(bt.sign,C.wood,0.06,1.2,1.0, sx+0.04,H-1.25,zf+1.7, 0,0,0,parent, uvOf(key));
    }
    if(o.floors===1) for(const x of xs){ if(Math.abs(x)>ow/2+0.7) win(x,1.9); }
  } else {
    const di=Math.floor(xs.length/2);
    for(let i=0;i<xs.length;i++){ if(i===di) box(bt.wood,wood,1.3,2.5,0.12, xs[i],1.25,zf+0.03, 0,0,0,parent); else win(xs[i],1.9); }
    box(bt.stone,C.stoneDk,1.9,0.25,0.6, xs[di],0.12,zf+0.25, 0,0,0,parent);  // 门前台阶
  }
  if(o.floors===2 && o.balcony){
    const bw=w-1.6; box(bt.wood,C.woodLt,bw,0.18,1.1, 0,3.2,zf+0.5, 0,0,0,parent);
    box(bt.wood,C.woodLt,bw,0.07,0.07, 0,4.1,zf+1.02, 0,0,0,parent); box(bt.wood,C.woodLt,bw,0.05,0.05, 0,3.6,zf+1.02, 0,0,0,parent);
    for(let x=-bw/2;x<=bw/2+0.01;x+=0.9) box(bt.wood,C.woodLt,0.08,0.95,0.08, x,3.72,zf+1.02, 0,0,0,parent);
  }
  // 檐下灯笼
  const p=new T.Vector3();
  for(const sx of [-1,1]){ p.set(sx*(w/2-0.9),H-0.55,zf+0.45).applyMatrix4(parent); lanternSpots.push({x:p.x,y:p.y,z:p.z,water:0}); }
}
function buildHouse(o){
  const bt=o.batches||B;
  const facing=o.facing||0;
  const parent=M(o.x,o.y||0,o.z,1,1,1,0,facing,0);
  const H=o.floors===2?6.3:3.7, r=clamp(o.d*0.3,2.0,3.3), ox=0.55, oz=0.8;
  const wallC=tint(pick([C.wall,C.wall,C.wallWarm,C.wallCool]),0.02), slateC=tint(C.slate,0.03), stripC=tint(C.slateDk,0.02);
  box(B.stone,tint(C.stone,0.03),o.w+0.3,0.4,o.d+0.3, 0,0.2,0, 0,0,0,parent);
  if(!o.openGround) addBody(parent,o.w,o.d,H,r,0,wallC,bt);
  else {
    addBody(parent,o.w,o.d,H,r,3.0,wallC,bt);                      // 二层以上
    const hd=o.d/2, hw=o.w/2;
    box(B.wall,wallC,o.w,3.05,0.4, 0,1.5,-hd+0.2, 0,0,0,parent);   // 后墙
    box(B.wall,wallC,0.4,3.05,o.d, -hw+0.2,1.5,0, 0,0,0,parent); box(B.wall,wallC,0.4,3.05,o.d, hw-0.2,1.5,0, 0,0,0,parent);
    const dw=3.2; const side=(o.w-dw)/2;
    box(B.wall,wallC,side,3.05,0.4, -hw+side/2,1.5,hd-0.2, 0,0,0,parent); box(B.wall,wallC,side,3.05,0.4, hw-side/2,1.5,hd-0.2, 0,0,0,parent);
    box(B.wood,C.woodDk,0.3,3.0,0.3, -dw/2,1.5,hd-0.15, 0,0,0,parent); box(B.wood,C.woodDk,0.3,3.0,0.3, dw/2,1.5,hd-0.15, 0,0,0,parent);
    box(B.wood,C.woodDk,dw+0.6,0.35,0.4, 0,3.0,hd-0.15, 0,0,0,parent);
    for(let i=0;i<4;i++) box(B.wood,C.woodDk,0.24,3.0,0.24, -hw+0.9+i*(o.w-1.8)/3,1.5,hd-0.5, 0,0,0,parent);
  }
  addRoof(parent,o.w,o.d,H,r,ox,oz,slateC,stripC,bt);
  if(o.gable) addGables(parent,o.w,o.d,H,r,oz,wallC,bt);
  addFront(parent,o,H,bt,!!o.openGround);
  const sw=Math.abs(Math.sin(facing))>0.5, ex=(sw?o.d:o.w)/2+0.25, ez=(sw?o.w:o.d)/2+0.25;
  if(!o.noObstacle) obstacles.push({x0:o.x-ex,x1:o.x+ex,z0:o.z-ez,z1:o.z+ez,pad:1.1});
  return {H,r,parent};
}

/* ---------- 石拱桥（本地坐标：桥面沿 z） ---------- */
function buildBridge(b){
  const parent=M(b.x,0,b.z,1,1,1,0,b.axis==='x'?Math.PI/2:0,0);
  const Lh=b.len, W=b.halfW*2, Hb=b.h, span=6;
  const y=z=>Hb*(1-(z/Lh)*(z/Lh));
  // 两侧栏墙：轮廓含桥洞
  const sh=new T.Shape();
  sh.moveTo(-Lh,-1.6); sh.lineTo(-span-0.6,-1.6);
  const cx=0, cy=-1.3, rx=span, ry=Hb-0.9-cy;
  for(let i=0;i<=20;i++){ const a=Math.PI-Math.PI*i/20; sh.lineTo(cx+rx*Math.cos(a), cy+ry*Math.sin(a)); }
  sh.lineTo(span+0.6,-1.6); sh.lineTo(Lh,-1.6); sh.lineTo(Lh,0.05);
  for(let i=20;i>=0;i--){ const z=-Lh+2*Lh*i/20; sh.lineTo(z,y(z)+0.95); }
  sh.lineTo(-Lh,0.05); sh.closePath();
  const wallGeo=new T.ExtrudeGeometry(sh,{depth:0.4,bevelEnabled:false});
  const stoneC=tint(C.stone,0.02), stoneD=tint(C.stoneDk,0.02);
  for(const sx of [-1,1]) B.stone.add(wallGeo, parent.clone().multiply(M(sx>0?W/2-0.4:-W/2,0,0,1,1,1,0,Math.PI/2,0)), stoneC);
  // 台阶式桥面
  const stoneC2=stoneC.clone().lerp(new T.Color(C.stoneDk),0.16);
  for(let z=-Lh+0.4;z<=Lh-0.4;z+=0.8){ box(B.stone,(Math.round(z/0.8)%2?stoneC:stoneC2),W-0.5,1.0,0.82, 0,y(z)-0.5,z, 0,0,0,parent); }
  // 桥洞内壁 + 桥身
  const arch=flipInside(new T.CylinderGeometry(1,1,W-0.4,16,1,true,0,Math.PI));
  B.stone.add(arch, parent.clone().multiply(M(0,cy,0,ry-0.05,1,rx-0.05,0,0,Math.PI/2)), stoneD);
  box(B.stone,stoneC,W-0.6,1.2,0.6, 0,Hb-1.5,-span-0.3, 0,0,0,parent); box(B.stone,stoneC,W-0.6,1.2,0.6, 0,Hb-1.5,span+0.3, 0,0,0,parent);
  // 桥头石灯柱
  const p=new T.Vector3();
  for(const sz of [-1,1]) for(const sx of [-1,1]){
    const z=sz*(Lh-1.0), yy=y(z);
    box(B.stone,stoneD,0.45,2.2,0.45, sx*(W/2+0.05),yy+1.1,z, 0,0,0,parent);
    p.set(sx*(W/2+0.05),yy+2.55,z).applyMatrix4(parent); lanternSpots.push({x:p.x,y:p.y,z:p.z,water:0,light:!!b.big});
  }
  bridges.push(b);
}

/* ---------- 河岸：石驳岸、石板路、河埠头、灯柱 ---------- */
function buildBanks(){
  const stoneC=C.stone, dk=C.stoneDk;
  for(const s of [1,-1]){
    box(B.stone,dk,560,1.5,0.5, 0,-0.6,s*6.15);                          // 驳岸墙
    box(B.stone,stoneC,560,0.16,0.9, 0,0.1,s*6.3);                        // 压顶
    box(B.stone,tint(stoneC,0.02),280,0.3,6, 0,-0.13,s*9);                // 石板路
    for(let x=-118;x<=124;x+=34){                                          // 河埠头：下到水面的台阶
      for(let k=0;k<4;k++) box(B.stone,k%2?stoneC:dk,3.2,0.35,0.7, x+rr(-4,4),-0.05-k*0.32,s*(5.6-k*0.62));
    }
    for(let x=-124;x<=124;x+=9){                                           // 灯柱
      if(Math.abs(x-64)<7&&s===1) continue;
      box(B.wood,C.woodDk,0.16,3.4,0.16, x,1.7,s*5.55);
      box(B.wood,C.woodDk,0.7,0.1,0.1, x,3.35,s*5.55);
      box(B.wood,C.woodDk,0.16,0.4,0.16, x+0.28,3.15,s*5.55);
      lanternSpots.push({x:x+0.28,y:2.75,z:s*5.55,water:s,light:false});
    }
  }
  // 支流两岸
  for(const x of [L.branch.x0-0.15,L.branch.x1+0.15]){ box(B.stone,dk,0.5,1.5,86, x,-0.6,49); box(B.stone,stoneC,0.9,0.16,86, x,0.1,49); }
}

/* ---------- 树 ---------- */
function buildWillow(x,z,scale=1,bank=false){
  const y=hillY(x,z); const parent=M(x,y,z,scale,scale,scale,0,rr(0,TAU),0);
  const lean=bank?(z>0?0.16:-0.16):rr(-0.08,0.08);
  const top=bank?6.6:5.4;
  box(B.foliage,C.trunk,0.55,top-0.6,0.55, 0,(top-0.6)/2,0, 0,lean,0,parent);
  box(B.foliage,C.trunk,0.32,2.4,0.32, 0.7,top-1.0,0.2, 0,0.35,-0.6,parent);
  box(B.foliage,C.trunk,0.28,2.2,0.28, -0.6,top-1.1,-0.3, 0,-0.3,0.6,parent);
  const greens=[0x8faa6a,0x7d9c5c,0x6f8f52];
  for(let i=0;i<4;i++){ B.foliage.add(G.sph, parent.clone().multiply(M(rr(-1.4,1.4),top+0.4+rr(-0.3,0.7),rr(-1.4,1.4), rr(2.0,2.9),rr(1.3,1.7),rr(2.0,2.9))), tint(pick(greens),0.03)); }
  for(let i=0;i<30;i++){ const a=rr(0,TAU), rad=rr(1.8,3.1), len=rr(0.9,2.0), t0=top+rr(-0.4,0.3); box(B.foliage,tint(pick([0x6f8f52,0x7d9c5c,0x5f8a4c]),0.04),0.24,len,0.05, Math.cos(a)*rad,t0-len/2,Math.sin(a)*rad, rr(0,TAU),rr(-0.08,0.08),rr(-0.08,0.08),parent); }
  obstacles.push({x0:x-0.5,x1:x+0.5,z0:z-0.5,z1:z+0.5});
}
function buildCamphor(x,z,scale=1){ // 广场上的老樟树
  const parent=M(x,0,z,scale,scale,scale);
  box(B.foliage,C.trunk,1.3,4.5,1.3, 0,2.2,0, 0,0,0,parent);
  for(let i=0;i<5;i++){ const a=i/5*TAU; box(B.foliage,C.trunk,0.5,3.4,0.5, Math.cos(a)*1.2,5.2,Math.sin(a)*1.2, 0,Math.cos(a)*0.55,-Math.sin(a)*0.55,parent); }
  for(let i=0;i<7;i++){ const a=i/7*TAU, rad=i?2.4:0; B.foliage.add(G.sph, parent.clone().multiply(M(Math.cos(a)*rad,7.2+(i?0:0.9),Math.sin(a)*rad, rr(2.4,3.2),rr(1.8,2.4),rr(2.4,3.2))), tint(pick([0x4f7a3e,0x5e8a48,0x476e38]),0.04)); }
  obstacles.push({x0:x-0.9,x1:x+0.9,z0:z-0.9,z1:z+0.9});
}

/* ---------- 宝塔（山顶） ---------- */
function buildPagoda(x,z){
  const y=hillY(x,z); const parent=M(x,y,z);
  box(B.stone,C.stone,14,2.6,14, 0,0.5,0, 0,0,0,parent);
  B.stone.add(G.cyl,parent.clone().multiply(M(0,2.1,0, 6.2,0.6,6.2)),C.stoneLt);
  let r=3.4, yy=2.4; const tiers=5;
  for(let i=0;i<tiers;i++){
    const h=2.7;
    B.wall.add(G.cyl,parent.clone().multiply(M(0,yy+h/2,0, r,h,r)),tint(C.wallWarm,0.02));
    B.wood.add(G.cyl,parent.clone().multiply(M(0,yy+h*0.55,0, r*1.25,0.14,r*1.25)),C.woodDk);        // 平座
    for(let k=0;k<8;k++){ const a=k/8*TAU+Math.PI/8; box(B.wood,C.woodDk,0.22,h,0.22, Math.cos(a)*(r-0.05),yy+h/2,Math.sin(a)*(r-0.05), -a,0,0,parent); }
    B.roof.add(G.cone,parent.clone().multiply(M(0,yy+h+0.55,0, r*1.75,1.3,r*1.75)),tint(C.slate,0.02));
    B.roof.add(G.cyl,parent.clone().multiply(M(0,yy+h+0.1,0, r*1.75,0.25,r*1.75)),C.slateDk);
    const p=new T.Vector3();
    for(const k of [1,5]){ const a=k/8*TAU; p.set(Math.cos(a)*(r*1.55),yy+h-0.1,Math.sin(a)*(r*1.55)).applyMatrix4(parent); lanternSpots.push({x:p.x,y:p.y,z:p.z,water:0,light:false}); }
    yy+=h+1.0; r*=0.86;
  }
  B.wood.add(G.cyl,parent.clone().multiply(M(0,yy+1.4,0, 0.18,3.2,0.18)),C.woodDk);
  B.sign.add(G.sph,parent.clone().multiply(M(0,yy+3.0,0, 0.5,0.5,0.5)),0xe8c66a);
  obstacles.push({x0:x-7,x1:x+7,z0:z-7,z1:z+7});
}

/* ---------- 牌坊 ---------- */
function buildGate(x,z){
  const parent=M(x,0,z);
  const xs=[-5.2,-1.9,1.9,5.2]; const hs=[5.6,7.4,7.4,5.6];
  xs.forEach((px,i)=>{ box(B.stone,C.stoneLt,0.62,hs[i],0.62, px,hs[i]/2,0, 0,0,0,parent); box(B.stone,C.stoneDk,1.1,0.5,1.1, px,0.25,0, 0,0,0,parent); });
  box(B.wood,C.woodDk,4.4,0.55,0.7, 0,6.6,0, 0,0,0,parent); box(B.wood,C.woodDk,4.4,0.42,0.7, 0,5.2,0, 0,0,0,parent);
  for(const s of [-1,1]){ box(B.wood,C.woodDk,3.9,0.45,0.6, s*3.55,4.9,0, 0,0,0,parent); }
  box(B.sign,C.woodDk,3.3,1.0,0.18, 0,5.9,0.42, 0,0,0,parent,uvOf('gate'));
  // 三段小屋顶
  const mini=(px,w,yb)=>{ const sh=new T.Shape(); sh.moveTo(-1.3,yb); sh.lineTo(1.3,yb); sh.lineTo(1.3,yb+0.3); sh.lineTo(0,yb+1.25); sh.lineTo(-1.3,yb+0.3); sh.closePath();
    const g=new T.ExtrudeGeometry(sh,{depth:w,bevelEnabled:false}); B.roof.add(g,parent.clone().multiply(M(px-w/2,0,0,1,1,1,0,Math.PI/2,0)),C.slate);
    box(B.roof,C.slateDk,w+0.5,0.3,0.4, px,yb+1.3,0, 0,0,0,parent); };
  mini(0,4.6,7.6); mini(-3.55,4.0,5.9); mini(3.55,4.0,5.9);
  for(const px of xs) obstacles.push({x0:x+px-0.45,x1:x+px+0.45,z0:z-0.45,z1:z+0.45});
}

/* ---------- 茶馆（单独 mesh，走进去时屋顶会隐去） ---------- */
const TH={ batches:{}, box:{x0:14,x1:28,z0:12,z1:24}, door:{x:21,z:12}, upper:null, lower:null, lights:[] };
function buildTeahouse(){
  for(const k of BATCH_KEYS) TH.batches[k]=new Batch();
  const o={x:21,z:18,w:14,d:12,floors:2,facing:Math.PI,openGround:true,batches:TH.batches,noObstacle:true,gable:true};
  buildHouse(o);
  // 匾额
  box(B.sign,C.woodDk,3.4,0.9,0.16, 21,3.55,11.6,0,0,0,null,uvOf('tea'));
  // 室内：方桌、条凳、柜台、茶壶
  const inside=B;
  const tables=[[17.5,15.5],[24.5,15.5],[17.5,20.5],[24.5,20.5]];
  for(const [tx,tz] of tables){
    box(inside.wood,C.wood,1.5,0.08,1.5, tx,0.8,tz); box(inside.wood,C.woodDk,0.14,0.76,0.14, tx,0.4,tz);
    for(const [dx,dz] of [[0,1.15],[0,-1.15],[1.15,0],[-1.15,0]]) box(inside.wood,C.woodLt,0.9,0.06,0.3, tx+dx,0.48,tz+dz, dz===0?Math.PI/2:0);
    inside.misc.add(G.sph,M(tx+0.2,0.98,tz-0.1,0.16,0.14,0.16),0xc9c0aa); inside.misc.add(G.cyl,M(tx-0.3,0.9,tz+0.25,0.09,0.12,0.09),0xc9c0aa);
    obstacles.push({x0:tx-0.9,x1:tx+0.9,z0:tz-0.9,z1:tz+0.9,h:1.1});
  }
  box(inside.wood,C.woodDk,6,1.0,0.8, 21,0.5,23.2); box(inside.wood,C.wood,6,0.1,0.9, 21,1.02,23.2);
  box(inside.wood,C.woodDk,5,2.4,0.3, 21,2.0,23.8);
  for(let i=0;i<5;i++) inside.misc.add(G.cyl,M(18.9+i*1.05,1.65,23.65,0.2,0.28,0.2),pick([0x7a5230,0xb5ac93,0x4f6b6b]));
  obstacles.push({x0:17.8,x1:24.2,z0:22.6,z1:24.4,h:1.2});
  // 墙体碰撞（留门）
  obstacles.push({x0:14,x1:28,z0:23.6,z1:24.4},{x0:14,x1:14.5,z0:12,z1:24},{x0:27.5,x1:28,z0:12,z1:24},{x0:14,x1:19.4,z0:12,z1:12.5},{x0:22.6,x1:28,z0:12,z1:12.5});
  lanternSpots.push({x:18,y:2.7,z:18,water:0,light:true},{x:24,y:2.7,z:18,water:0,light:true});
}

/* ---------- 地面、广场、远山、稻田 ---------- */
function groundPiece(x0,x1,z0,z1){
  const w=x1-x0, d=z1-z0; const geo=new T.PlaneGeometry(w,d,Math.max(2,Math.round(w/7)),Math.max(2,Math.round(d/7)));
  geo.rotateX(-Math.PI/2); geo.translate((x0+x1)/2,0,(z0+z1)/2);
  const p=geo.attributes.position, col=[]; const c=new T.Color();
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), z=p.getZ(i);
    const inTown=Math.abs(z)<34&&Math.abs(x)<150;
    let y=hillY(x,z); if(!inTown) y+=Math.sin(x*0.13)*Math.cos(z*0.11)*0.7+Math.sin(x*0.31+z*0.17)*0.3;
    p.setY(i,y-0.02);
    const hillT=clamp(y/L.hill.h,0,1);
    c.set(C.grass).lerp(new T.Color(C.grassDk),rr(0,0.4)+hillT*0.4);
    if(Math.abs(z)<27&&Math.abs(x)<140) c.lerp(new T.Color(C.soil),0.6);
    col.push(c.r,c.g,c.b);
  }
  geo.setAttribute('color',new T.Float32BufferAttribute(col,3)); geo.computeVertexNormals();
  const m=new T.Mesh(geo,MAT.ground); m.receiveShadow=true; return m;
}
function buildGround(){
  const g=new T.Group();
  for(const r of [[-380,L.branch.x0,L.canal,380],[L.branch.x1,380,L.canal,380],[L.branch.x0,L.branch.x1,L.branch.z1,380],[-380,380,-380,-L.canal]]) g.add(groundPiece(...r));
  return g;
}
function buildPlaza(){
  box(B.stone,tint(C.stone,0.02),26,0.3,17, 1,-0.13,20.5);
  // 古井、石凳
  B.stone.add(G.cyl,M(-3,0.45,25.5,0.9,0.9,0.9),C.stoneLt); B.stone.add(G.cyl,M(-3,0.92,25.5,0.6,0.1,0.6),0x1b2a2e);
  obstacles.push({x0:-4,x1:-2,z0:24.5,z1:26.5,h:1.0});
  for(const [x,z] of [[-10.5,16],[9,25.5]]){ box(B.stone,C.stoneLt,2.2,0.45,0.6, x,0.45,z); }
  // 渡口牌子
  box(B.wood,C.woodDk,0.14,2.6,0.14, -42.5,1.3,7.6); box(B.sign,C.stone,1.4,0.8,0.1, -42.5,2.4,7.6,0,0,0,null,uvOf('dock'));
}
function buildMountains(){
  for(let i=0;i<18;i++){
    const a=i/18*TAU+rr(-0.12,0.12), dist=rr(240,320); const x=Math.cos(a)*dist, z=Math.sin(a)*dist;
    if(Math.abs(z)<60&&Math.abs(x)<200) continue;
    const col=new T.Color(0x4c6272).lerp(new T.Color(0x5e7a86),rnd());
    for(let k=0;k<3;k++){ const h=rr(40,90)*(k?0.7:1), w=rr(60,120); B.foliage.add(G.cone6,M(x+rr(-40,40),h/2-6,z+rr(-30,30),w,h,w*rr(0.7,1),0,rr(0,TAU),0),col); }
  }
}
function buildFields(){
  for(let i=0;i<6;i++){
    const x=120+rr(-8,8)+(i%3)*18, z=40+Math.floor(i/3)*16+rr(-2,2);
    box(B.foliage,tint(0x6f9a4e,0.05),15,0.3,13, x,0.05,z);
    for(let k=-5;k<=5;k++) box(B.foliage,0x4f7a38,15,0.12,0.25, x,0.26,z+k*1.2);
    box(B.foliage,C.soil,15.6,0.36,0.5, x,0.05,z-6.75); box(B.foliage,C.soil,15.6,0.36,0.5, x,0.05,z+6.75);
  }
}

/* ============================================================
   天、水、雨、光、时辰
   ============================================================ */
const scene=new T.Scene();
const camera=new T.PerspectiveCamera(58,1,0.3,1600);
const S={ t:0, dayT:0.735, dayLen:540, rain:false, sound:false, riding:false, uiHidden:false, quality:2, fps:60, night:0, pano:false };

/* ---------- 天穹 ---------- */
const skyU={ uZen:{value:new T.Color(0x76a2cf)}, uHor:{value:new T.Color(0xd7e2ea)}, uSun:{value:new T.Vector3(0,1,0)}, uSunC:{value:new T.Color(0xffffff)}, uMoon:{value:new T.Vector3(0,-1,0)}, uMoonC:{value:new T.Color(0xcdd6ee)}, uGlow:{value:1} };
const skyMat=new T.ShaderMaterial({ uniforms:skyU, side:T.BackSide, depthWrite:false, fog:false,
  vertexShader:`varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader:`varying vec3 vDir; uniform vec3 uZen,uHor,uSun,uSunC,uMoon,uMoonC; uniform float uGlow;
  void main(){
    float t=pow(max(vDir.y,0.0),0.5);
    vec3 col=mix(uHor,uZen,t);
    float sd=max(dot(vDir,uSun),0.0);
    col+=uSunC*(pow(sd,300.0)*1.8+pow(sd,7.0)*0.32*uGlow);
    float md=max(dot(vDir,uMoon),0.0);
    col+=uMoonC*(pow(md,1800.0)*1.4+pow(md,30.0)*0.08);
    gl_FragColor=vec4(col,1.0);
  }` });
const skyGroup=new T.Group();
const skyMesh=new T.Mesh(new T.SphereGeometry(900,24,14),skyMat); skyMesh.renderOrder=-10; skyGroup.add(skyMesh);
const starGeo=new T.BufferGeometry(); { const a=[]; for(let i=0;i<1100;i++){ const th=rr(0,TAU), ph=Math.acos(rr(0.02,1)); a.push(Math.sin(ph)*Math.cos(th)*820, Math.cos(ph)*820, Math.sin(ph)*Math.sin(th)*820); } starGeo.setAttribute('position',new T.Float32BufferAttribute(a,3)); }
const starMat=new T.PointsMaterial({color:0xe8eeff,size:2.0,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false,fog:false});
const stars=new T.Points(starGeo,starMat); stars.renderOrder=-9; skyGroup.add(stars);
scene.add(skyGroup);

/* ---------- 河水 ---------- */
const waterU=T.UniformsUtils.merge([T.UniformsLib.fog,{ uTime:{value:0}, uA:{value:new T.Color(0x4f7f78)}, uB:{value:new T.Color(0xa8c4c6)}, uSun:{value:new T.Vector3(0,1,0)}, uSunC:{value:new T.Color(0xffffff)}, uCam:{value:new T.Vector3()} }]);
const waterMat=new T.ShaderMaterial({ uniforms:waterU, fog:true,
  vertexShader:`uniform float uTime; varying vec3 vW;
  #include <fog_pars_vertex>
  void main(){
    vec3 p=position;
    p.z+=sin(p.x*0.35+uTime*1.1)*0.05+sin(p.y*0.6-uTime*0.8)*0.04;
    vec4 wp=modelMatrix*vec4(p,1.0); vW=wp.xyz;
    vec4 mvPosition=viewMatrix*wp; gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
  }`,
  fragmentShader:`uniform vec3 uA,uB,uSun,uSunC,uCam; uniform float uTime; varying vec3 vW;
  #include <fog_pars_fragment>
  void main(){
    float w1=sin(vW.x*0.8+vW.z*0.5+uTime*1.5)+sin(vW.x*1.7-uTime*2.1)*0.5;
    float w2=sin(vW.z*1.1-vW.x*0.4-uTime*1.2)+sin(vW.z*2.3+uTime*1.7)*0.5;
    vec3 n=normalize(vec3(w1*0.05,1.0,w2*0.05));
    vec3 v=normalize(uCam-vW);
    float f=pow(1.0-max(dot(n,v),0.0),2.5);
    vec3 col=mix(uA,uB,f*0.42);
    vec3 h=normalize(uSun+v);
    float sp=pow(max(dot(n,h),0.0),320.0);
    col+=uSunC*sp*0.35;
    float rip=smoothstep(0.93,1.0,sin(vW.x*0.6+vW.z*2.1+uTime*0.7+sin(vW.z*0.3+uTime*0.2)*3.0));
    col+=rip*0.045;
    gl_FragColor=vec4(col,1.0);
    #include <fog_fragment>
  }` });
function buildWater(){
  const g1=new T.PlaneGeometry(600,12,150,3); g1.rotateX(-Math.PI/2);
  const m1=new T.Mesh(g1,waterMat); m1.position.y=-0.8; scene.add(m1);
  const g2=new T.PlaneGeometry(8,86,2,22); g2.rotateX(-Math.PI/2);
  const m2=new T.Mesh(g2,waterMat); m2.position.set(64,-0.8,49); scene.add(m2);
}

/* ---------- 灯笼在水里的倒影（夜里才有） ---------- */
const streakU={ uTime:{value:0}, uNight:{value:0}, uCol:{value:new T.Color(0xff7040)} };
const streakMat=new T.ShaderMaterial({ uniforms:streakU, transparent:true, depthWrite:false, blending:T.AdditiveBlending, vertexColors:true,
  vertexShader:`varying vec2 vUv; varying float vPh; uniform float uTime;
  void main(){ vUv=uv; vPh=color.r*6.2832; vec3 p=position; p.x+=sin(uTime*1.3+vPh+position.z*0.8)*0.1; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
  fragmentShader:`uniform float uNight,uTime; uniform vec3 uCol; varying vec2 vUv; varying float vPh;
  void main(){ float a=pow(1.0-vUv.y,0.8)*smoothstep(0.0,0.08,vUv.y); float cx=1.0-abs(vUv.x-0.5)*2.0; a*=pow(cx,1.5);
    a*=uNight*(0.72+0.2*sin(uTime*2.4+vPh)+0.08*sin(uTime*5.1+vUv.y*9.0+vPh)); gl_FragColor=vec4(uCol*a,a); }` });
function buildStreaks(){
  const b=new Batch();
  for(const s of lanternSpots){ if(!s.water) continue; const zc=s.water*(3.0); b.add(G.plane, M(s.x,-0.62,zc,0.9,5.5,1,-Math.PI/2,0,s.water>0?0:Math.PI), new T.Color(rnd(),0,0)); }
  const m=b.build(streakMat); m.frustumCulled=false; scene.add(m);
}

/* ---------- 雨 ---------- */
const RAIN_N=1000;
const rainGeo=new T.BufferGeometry(); const rainPos=new Float32Array(RAIN_N*6); rainGeo.setAttribute('position',new T.BufferAttribute(rainPos,3));
const rainMat=new T.LineBasicMaterial({color:0xd8e0e8,transparent:true,opacity:0});
const rain=new T.LineSegments(rainGeo,rainMat); rain.frustumCulled=false; rain.visible=false; scene.add(rain);
const rainDrops=[]; for(let i=0;i<RAIN_N;i++) rainDrops.push({x:rr(-22,22),y:rr(0,24),z:rr(-22,22),v:rr(18,24)});
function updateRain(dt,cx,cz){
  const target=S.rain?0.42:0; rainMat.opacity+= (target-rainMat.opacity)*Math.min(1,dt*1.5);
  rain.visible=rainMat.opacity>0.01; if(!rain.visible) return;
  for(let i=0;i<RAIN_N;i++){
    const d=rainDrops[i]; d.y-=d.v*dt; d.x+=dt*2.5;
    if(d.y<-1){ d.y=rr(16,26); d.x=cx+rr(-22,22); d.z=cz+rr(-22,22); }
    if(Math.abs(d.x-cx)>24) d.x=cx+rr(-22,22); if(Math.abs(d.z-cz)>24) d.z=cz+rr(-22,22);
    const o=i*6; rainPos[o]=d.x; rainPos[o+1]=d.y; rainPos[o+2]=d.z; rainPos[o+3]=d.x-0.08; rainPos[o+4]=d.y+0.7; rainPos[o+5]=d.z;
  }
  rainGeo.attributes.position.needsUpdate=true;
}

/* ---------- 光 ---------- */
const sun=new T.DirectionalLight(0xffffff,1.2); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.near=1; sun.shadow.camera.far=260;
sun.shadow.camera.left=-48; sun.shadow.camera.right=48; sun.shadow.camera.top=48; sun.shadow.camera.bottom=-48;
sun.shadow.bias=-0.0006; sun.shadow.normalBias=0.35;
scene.add(sun); scene.add(sun.target);
const hemi=new T.HemisphereLight(0xbfd4e6,0x6a6a5a,0.7); scene.add(hemi);
scene.fog=new T.Fog(0xc9d4d8,40,320);
const pointLights=[];

/* 关键帧：按太阳高度插值 */
const KEYS={
  e:      [-1,   -0.22, -0.08,  0.0,   0.12,  0.4,   1.0],
  zen:    [0x090f1f,0x151f3b,0x2a3560,0x3b4a7c,0x5b7eb0,0x74a0cf,0x6b9ad0],
  hor:    [0x121a28,0x2a2d44,0x5f4a57,0xd07f55,0xf0c08a,0xd8e2ea,0xd2e0ea],
  fog:    [0x10161f,0x262a3a,0x4d4650,0xa78673,0xcbb9a0,0xc6d2d8,0xc4d3d8],
  sunC:   [0x7f93c4,0x8a7fa0,0xff8a52,0xffa066,0xffd2a0,0xfff1de,0xffffff],
  sunI:   [0.36, 0.24, 0.26, 0.55, 0.82, 0.98, 1.05],
  hemiS:  [0x1a2540,0x232c48,0x4a4c6a,0x8a7f92,0xb9b4b6,0xbfd4e6,0xc2d6e8],
  hemiG:  [0x0c0c10,0x121218,0x2a2622,0x4a4033,0x5e564a,0x6a6a5a,0x6d6d5c],
  hemiI:  [0.5, 0.48, 0.5, 0.52, 0.55, 0.55, 0.55],
  waterA: [0x0e1622,0x18202f,0x31394a,0x51586a,0x5e7d7a,0x4f7f78,0x4a7c76],
  waterB: [0x25334a,0x3a4258,0x66586a,0x9d8478,0xa9a596,0x93b2b6,0x8fb4b8],
};
const _ca=new T.Color(), _cb=new T.Color();
function keyColor(arr,e,out){ const E=KEYS.e; if(e<=E[0]) return out.set(arr[0]); for(let i=0;i<E.length-1;i++){ if(e<=E[i+1]){ const t=(e-E[i])/(E[i+1]-E[i]); return out.set(arr[i]).lerp(_cb.set(arr[i+1]),t); } } return out.set(arr[arr.length-1]); }
function keyNum(arr,e){ const E=KEYS.e; if(e<=E[0]) return arr[0]; for(let i=0;i<E.length-1;i++){ if(e<=E[i+1]){ return lerp(arr[i],arr[i+1],(e-E[i])/(E[i+1]-E[i])); } } return arr[arr.length-1]; }
const sunDir=new T.Vector3(), moonDir=new T.Vector3();
const ENV={ glow:0 };
let lanternMat=null, glowMat=null, thGlow=null;
function updateEnv(dt, focus){
  const th=(S.dayT-0.25)*TAU;
  sunDir.set(Math.cos(th)*0.95, Math.sin(th), 0.32).normalize();
  moonDir.set(-Math.cos(th)*0.9, -Math.sin(th)*0.85, -0.4).normalize();
  const e=sunDir.y;
  const rainMix=S.rain?0.55:0;
  keyColor(KEYS.zen,e,skyU.uZen.value).lerp(_ca.set(0x6b7480),rainMix);
  keyColor(KEYS.hor,e,skyU.uHor.value).lerp(_ca.set(0x9aa3ab),rainMix);
  skyU.uSun.value.copy(sunDir); skyU.uMoon.value.copy(moonDir);
  keyColor(KEYS.sunC,e,skyU.uSunC.value); skyU.uGlow.value=S.rain?0.2:1;
  starMat.opacity=smooth(0.02,-0.2,e)*(S.rain?0.15:0.9);
  keyColor(KEYS.fog,e,scene.fog.color).lerp(_ca.set(0x8b949c),rainMix);
  scene.fog.near=S.rain?18:(e<0?30:40); scene.fog.far=(S.rain?150:(e<0?250:320))*(S.pano?1.6:1);
  // 太阳/月亮：谁在地平线上谁来照
  const useMoon=e<-0.02;
  const dir=useMoon?moonDir:sunDir;
  sun.position.copy(dir).multiplyScalar(90).add(focus); sun.target.position.copy(focus);
  keyColor(KEYS.sunC,e,sun.color);
  let inten=keyNum(KEYS.sunI,e); if(useMoon) inten=0.36*smooth(-0.02,-0.2,e); else inten*=smooth(-0.02,0.04,e);
  sun.intensity=inten*(S.rain?0.45:1);
  keyColor(KEYS.hemiS,e,hemi.color).lerp(_ca.set(0x8a9299),rainMix); keyColor(KEYS.hemiG,e,hemi.groundColor);
  hemi.intensity=keyNum(KEYS.hemiI,e)*(S.rain?0.9:1);
  keyColor(KEYS.waterA,e,waterU.uA.value).lerp(_ca.set(0x4a545c),rainMix); keyColor(KEYS.waterB,e,waterU.uB.value).lerp(_ca.set(0x8f9aa2),rainMix);
  waterU.uSun.value.copy(dir); waterU.uSunC.value.copy(sun.color).multiplyScalar(useMoon?0.5:(S.rain?0.2:1)); waterU.uTime.value=S.t; waterU.uCam.value.copy(camera.position);
  // 灯笼与窗火
  const night=smooth(0.16,-0.04,e)*(S.rain?1:1)+ (S.rain?0.35*smooth(0.5,0.16,e):0);
  S.night=clamp(night,0,1);
  if(lanternMat) lanternMat.emissiveIntensity=0.15+1.3*S.night;
  if(glowMat) glowMat.emissiveIntensity=0.9*S.night;
  if(thGlow) thGlow.emissiveIntensity=0.9*S.night;
  streakU.uNight.value=S.night*0.9; streakU.uTime.value=S.t;
  for(const pl of pointLights) pl.intensity=pl.userData.base*S.night;
}

/* ============================================================
   把镇子摆出来
   ============================================================ */
const NPC_NODES={}, NPC_EDGES=[];
function node(name,x,z){ NPC_NODES[name]={x,z,n:[]}; }
function edge(a,b){ NPC_EDGES.push([a,b]); NPC_NODES[a].n.push(b); NPC_NODES[b].n.push(a); }
let signCounter=0;
function layoutTown(){
  // 桥
  buildBridge({x:-72,z:0,axis:'z',len:11,halfW:2.1,h:3.6});
  buildBridge({x:-4,z:0,axis:'z',len:12,halfW:2.5,h:4.8,big:true});
  buildBridge({x:88,z:0,axis:'z',len:11,halfW:2.1,h:3.6});
  buildBridge({x:64,z:9,axis:'x',len:10,halfW:2.0,h:3.0});
  buildBanks();
  // 沿河两排房子
  const alleys={1:[-92,-46,100],'-1':[-92,-46,46,100]};
  for(const side of [1,-1]){
    for(const row of [0,1]){
      let x=-134+rr(0,3);
      while(x<134){
        const w=rr(7,13);
        let skip=false;
        if(side===1&&row===0&&x+w>-13&&x<30){ x=30; continue; }
        if(side===1&&x+w>44&&x<84){ x=84; continue; }
        if(side===1&&row===1&&x+w>-14&&x<30){ x=30; continue; }
        if(row===1&&side===1&&x<-85){ x=-85; continue; }
        for(const a of alleys[side]){ if(x<a+3.6&&x+w>a-0.2){ x=a+3.6; skip=true; break; } }
        if(skip) continue;
        if(row===1&&rnd()<0.35){ x+=w+rr(2,6); continue; }
        const d=rr(8.5,12), floors=rnd()<(row?0.4:0.6)?2:1;
        const zc=row===0? side*(L.laneOut+d/2+rr(0,1.0)) : side*(28+d/2+rr(0,3));
        const shop=row===0&&rnd()<0.5;
        buildHouse({x:x+w/2,z:zc,w,d,floors,facing:side===1?Math.PI:0,shop,gable:rnd()<0.5,balcony:rnd()<0.5,signKind:rnd()<0.7?'board':'flag',signIdx:signCounter++});
        x+=w+rr(0.5,2.2);
      }
    }
  }
  // 支流两岸：房子直接临水
  for(const [xw,facing] of [[L.branch.x0,Math.PI/2],[L.branch.x1,-Math.PI/2]]){
    let z=15;
    while(z<88){ const w=rr(7,11), d=rr(8,11); const xc=facing>0?xw-d/2-0.4:xw+d/2+0.4;
      buildHouse({x:xc,z:z+w/2,w,d,floors:rnd()<0.6?2:1,facing,shop:false,gable:rnd()<0.6,balcony:rnd()<0.6,signIdx:signCounter++}); z+=w+rr(0.6,2); }
  }
  // 广场、牌坊、茶馆、老树
  buildPlaza(); buildGate(1,23); buildTeahouse(); buildCamphor(-7,19,1.1);
  // 柳树
  for(let x=-122;x<=122;x+=rr(24,40)){ for(const s of [1,-1]){ if(rnd()<0.8&&!(s===1&&x>40&&x<86)&&!(s===1&&x>-14&&x<30)&&!(s===1&&Math.abs(x+34)<14)) buildWillow(x+rr(-3,3),s*rr(6.9,7.4),rr(0.9,1.1),true); } }
  for(let i=0;i<40;i++){ const a=rr(0,TAU), r=rr(30,58); const x=L.hill.x+Math.cos(a)*r, z=L.hill.z+Math.sin(a)*r; if(z>26) buildWillow(x,z,rr(0.8,1.3)); }
  for(let i=0;i<30;i++){ const x=rr(-160,180), z=pick([1,-1])*rr(44,140); if(!(x>100&&x<175&&z>30&&z<62)) buildWillow(x,z,rr(0.9,1.4)); }
  buildPagoda(L.hill.x,L.hill.z);
  buildMountains(); buildFields();
  // 灯笼：广场、牌坊、渡口
  for(const [x,z,lt] of [[-42,7.3,true],[-10,13,true],[12,13,true],[-2,28,false],[8,28,false]]){ box(B.wood,C.woodDk,0.16,3.2,0.16,x,1.6,z); box(B.wood,C.woodDk,0.7,0.1,0.1,x,3.15,z); box(B.wood,C.woodDk,0.16,0.4,0.16,x+0.28,2.95,z); lanternSpots.push({x:x+0.28,y:2.55,z,water:0,light:lt}); }
  // NPC 路网
  node('N1',-125,9); node('N2',-92,9); node('N3',-72,9); node('N4',-46,9); node('N5',-4,9); node('N6',6,9); node('N7',21,9); node('N8',40,9); node('N9',52,9); node('N10',76,9); node('N11',88,9); node('N12',100,9); node('N13',125,9);
  node('S1',-125,-9); node('S2',-92,-9); node('S3',-72,-9); node('S4',-46,-9); node('S5',-4,-9); node('S6',46,-9); node('S7',88,-9); node('S8',100,-9); node('S9',125,-9);
  node('P1',1,16); node('P2',-8,26); node('P3',10,27); node('TH',21,17); node('TH2',21,20);
  node('AN1',-92,26); node('AN2',-46,26); node('AN3',100,26); node('AS1',-92,-26); node('AS2',-46,-26); node('AS3',46,-26); node('AS4',100,-26);
  node('H1',-100,52); node('H2',-112,72); node('D1',-40,9);
  const chain=(...ns)=>{ for(let i=0;i<ns.length-1;i++) edge(ns[i],ns[i+1]); };
  chain('N1','N2','N3','N4','D1','N5','N6','N7','N8','N9','N10','N11','N12','N13');
  chain('S1','S2','S3','S4','S5','S6','S7','S8','S9');
  edge('N3','S3'); edge('N5','S5'); edge('N11','S7');
  edge('N6','P1'); edge('P1','P2'); edge('P1','P3'); edge('N7','TH'); edge('TH','TH2'); edge('P3','TH');
  edge('N2','AN1'); edge('N4','AN2'); edge('N12','AN3'); edge('AN1','AN2'); edge('S2','AS1'); edge('S4','AS2'); edge('S6','AS3'); edge('S8','AS4'); edge('AS1','AS2'); edge('AS3','AS4');
  edge('AN1','H1'); edge('H1','H2');
}

/* ---------- 把合批结果变成 mesh ---------- */
const MAT={};
function makeMaterials(){
  const ph=(o)=>new T.MeshPhongMaterial(Object.assign({vertexColors:true,specular:0x000000,shininess:1},o));
  MAT.wall=ph({}); MAT.roof=ph({}); MAT.wood=ph({}); MAT.stone=ph({}); MAT.foliage=ph({}); MAT.misc=ph({}); MAT.ground=ph({});
  MAT.glow=ph({emissive:0xffb86a,emissiveIntensity:0}); glowMat=MAT.glow;
  MAT.sign=Atlas.tex? new T.MeshPhongMaterial({map:Atlas.tex,specular:0x000000,shininess:1}) : ph({});
  MAT.person=ph({});
  MAT.lantern=new T.MeshPhongMaterial({color:0xd94a35,emissive:0xff3b1f,emissiveIntensity:0.15,specular:0x000000,shininess:1}); lanternMat=MAT.lantern;
}
function commitBatches(){
  for(const k of BATCH_KEYS){ if(B[k].empty) continue; const m=B[k].build(MAT[k]); m.castShadow=(k!=='foliage'&&k!=='glow'); m.receiveShadow=true; m.frustumCulled=false; scene.add(m); }
  // 茶馆上半部分：单独材质，走进去会变透明
  TH.upperMats=[];
  for(const k of BATCH_KEYS){ const b=TH.batches[k]; if(!b||b.empty) continue; const mat=MAT[k].clone(); mat.transparent=true; if(k==='glow') thGlow=mat; const m=b.build(mat); m.castShadow=true; m.receiveShadow=true; scene.add(m); TH.upperMats.push(mat); }
  // 灯笼
  const lg=new T.SphereGeometry(0.28,10,8); lg.scale(1,1.22,1);
  const inst=new T.InstancedMesh(lg,MAT.lantern,lanternSpots.length);
  const capB=new Batch();
  lanternSpots.forEach((s,i)=>{ inst.setMatrixAt(i,M(s.x,s.y,s.z)); capB.add(G.cyl,M(s.x,s.y+0.36,s.z,0.14,0.08,0.14),C.woodDk); capB.add(G.cyl,M(s.x,s.y-0.36,s.z,0.12,0.08,0.12),C.woodDk); capB.add(G.cyl,M(s.x,s.y-0.55,s.z,0.05,0.3,0.05),0xe0b040);
    if(s.light&&pointLights.length<9){ const pl=new T.PointLight(0xff9a4a,0,15,1.6); pl.position.set(s.x,s.y-0.2,s.z); pl.userData.base=1.0; scene.add(pl); pointLights.push(pl); } });
  inst.instanceMatrix.needsUpdate=true; inst.frustumCulled=false; scene.add(inst);
  const cm=capB.build(MAT.wood); cm.frustumCulled=false; scene.add(cm);
}

/* ============================================================
   人、船、玩家、镜头、输入
   ============================================================ */
const ROBES=[0x2f3a5c,0x5c6b4a,0x9a7b48,0x8a8a88,0x6b3d4f,0xe6dcc6,0x3f5a6e,0x7a5a3a,0xb03a2e,0x4a5568];
const SKINS=[0xf0c9a8,0xe8b898,0xd9a880];
const UMBS=[0xc67a3a,0x8c2f2f,0x3f5a6e,0xe9dcc0];

function makePerson(opt){
  const g=new T.Group(); const tb=new Batch();
  const robe=new T.Color(opt.robe), dk=robe.clone().multiplyScalar(0.72);
  tb.add(G.box,M(0,1.02,0, 0.52,0.7,0.32),robe);
  tb.add(G.box,M(0,0.62,0, 0.56,0.42,0.36),dk);
  tb.add(G.box,M(0,1.05,0, 0.58,0.1,0.36),0x2b2b2b);
  tb.add(G.box,M(0,1.62,0, 0.34,0.36,0.32),opt.skin);
  tb.add(G.box,M(0,1.79,-0.02, 0.37,0.12,0.35),0x1e1a18);
  if(opt.hat==='straw'){ tb.add(G.cone,M(0,1.92,0, 0.66,0.28,0.66),0xb99a5e); }
  else if(opt.hat==='bun'){ tb.add(G.sph,M(0,1.88,-0.08, 0.12,0.12,0.12),0x1e1a18); }
  if(opt.umbrella){
    tb.add(G.box,M(0.34,1.49,0.2, 0.14,0.55,0.14, 0.8,0,0),robe);
    tb.add(G.box,M(-0.34,1.0,0, 0.14,0.6,0.14, -0.15,0,0),robe);
    tb.add(G.cyl,M(0.36,2.1,0.4, 0.03,1.0,0.03),0x5a3a22);
    tb.add(G.cone,M(0.36,2.55,0.4, 0.98,0.32,0.98),opt.umbrella);
  } else {
    tb.add(G.box,M(0.34,1.0,0, 0.14,0.6,0.14, 0.15,0,0),robe);
    tb.add(G.box,M(-0.34,1.0,0, 0.14,0.6,0.14, -0.15,0,0),robe);
  }
  const torso=tb.build(MAT.person); torso.castShadow=true; g.add(torso);
  const lm=new T.MeshPhongMaterial({color:opt.pants||0x2a2d33,specular:0x000000,shininess:1});
  const ll=new T.Mesh(G.leg,lm), rl=new T.Mesh(G.leg,lm);
  ll.position.set(-0.13,0.66,0); rl.position.set(0.13,0.66,0); ll.castShadow=rl.castShadow=true; g.add(ll); g.add(rl);
  return {g,torso,ll,rl,phase:rr(0,TAU)};
}
function animPerson(p,speed,dt){
  if(speed>0){ p.phase+=dt*speed*4.4; const s=Math.sin(p.phase); p.ll.rotation.x=s*0.62; p.rl.rotation.x=-s*0.62; p.torso.position.y=Math.abs(Math.cos(p.phase))*0.05; }
  else { p.ll.rotation.x*=0.85; p.rl.rotation.x*=0.85; p.torso.position.y*=0.85; }
}

/* ---------- 镇上的人 ---------- */
const npcs=[];
function spawnNPCs(){
  const names=Object.keys(NPC_NODES).filter(n=>!n.startsWith('H')&&n!=='TH2');
  for(let i=0;i<26;i++){
    const a=pick(names); const b=pick(NPC_NODES[a].n); if(!b) continue;
    const umb=rnd()<0.35?pick(UMBS):null;
    const per=makePerson({robe:pick(ROBES),skin:pick(SKINS),hat:pick(['none','none','straw','bun']),umbrella:umb,pants:pick([0x2a2d33,0x3b3630,0x50493f])});
    const A=NPC_NODES[a],Bn=NPC_NODES[b],t=rnd();
    const n={per,from:a,to:b,t,speed:rr(1.0,1.7),x:lerp(A.x,Bn.x,t),z:lerp(A.z,Bn.z,t),wait:0,umb:!!umb,talk:0};
    per.g.position.set(n.x,groundY(n.x,n.z),n.z); scene.add(per.g); npcs.push(n);
  }
}
function updateNPCs(dt){
  for(const n of npcs){
    if(n.talk>0){ n.talk-=dt; const dx=P.x-n.x, dz=P.z-n.z; n.per.g.rotation.y=Math.atan2(dx,dz); animPerson(n.per,0,dt); continue; }
    if(n.wait>0){ n.wait-=dt; animPerson(n.per,0,dt); continue; }
    const A=NPC_NODES[n.from],Bn=NPC_NODES[n.to];
    const len=Math.max(0.1,Math.hypot(Bn.x-A.x,Bn.z-A.z));
    n.t+=n.speed*dt/len;
    if(n.t>=1){ n.t=0; const opts=Bn.n.filter(k=>k!==n.from); const next=opts.length?pick(opts):n.from; n.from=n.to; n.to=next; if(rnd()<0.3) n.wait=rr(2,7); continue; }
    n.x=lerp(A.x,Bn.x,n.t); n.z=lerp(A.z,Bn.z,n.t);
    n.per.g.position.set(n.x,groundY(n.x,n.z),n.z); n.per.g.rotation.y=Math.atan2(Bn.x-A.x,Bn.z-A.z);
    animPerson(n.per,n.speed,dt);
  }
}

/* ---------- 乌篷船 ---------- */
function makeBoat(opt){
  const g=new T.Group(); const b=new Batch();
  const Lb=3.4,Wb=0.85; const sh=new T.Shape();
  sh.moveTo(-Lb,0); sh.quadraticCurveTo(-Lb*0.5,Wb*1.1,0,Wb); sh.quadraticCurveTo(Lb*0.5,Wb*1.1,Lb,0); sh.quadraticCurveTo(Lb*0.5,-Wb*1.1,0,-Wb); sh.quadraticCurveTo(-Lb*0.5,-Wb*1.1,-Lb,0);
  const hull=new T.ExtrudeGeometry(sh,{depth:0.75,bevelEnabled:false,curveSegments:6});
  b.add(hull,M(0,0.75,0,1,1,1,Math.PI/2,0,0),opt.hull||0x3a2a1c);
  b.add(G.box,M(0,0.52,0, Lb*1.1,0.06,Wb*1.2),0x8c6a42);
  b.add(G.box,M(-1.2,0.62,0, 0.5,0.14,Wb*1.5),0x5a4634); b.add(G.box,M(1.3,0.62,0, 0.5,0.14,Wb*1.5),0x5a4634);
  const can=new T.CylinderGeometry(1,1,2.4,10,1,true,0,Math.PI);
  b.add(can,M(0.3,0.72,0, 0.95,1,0.95, 0,0,Math.PI/2),0x1f2226);
  b.add(flipInside(can.clone()),M(0.3,0.72,0, 0.93,1,0.93, 0,0,Math.PI/2),0x2a2622);
  for(let i=0;i<2;i++) b.add(G.sph,M(-0.3+i*0.6,0.72,(i?-1:1)*0.35, 0.22,0.2,0.22),pick([0xb08c5a,0x8a7b5a]));
  if(opt.lantern){ b.add(G.cyl,M(2.6,1.0,0, 0.04,0.9,0.04),0x3a2716); }
  const hullMesh=b.build(MAT.person); hullMesh.castShadow=true; g.add(hullMesh);
  let lamp=null;
  if(opt.lantern){ lamp=new T.Mesh(new T.SphereGeometry(0.22,8,6),MAT.lantern); lamp.position.set(2.6,1.3,0); g.add(lamp); }
  const man=makePerson({robe:pick([0x2f3a5c,0x3b3630,0x5c6b4a]),skin:pick(SKINS),hat:'straw',pants:0x2a2d33});
  man.g.position.set(-2.3,0.55,0); man.g.rotation.y=Math.PI/2; g.add(man.g);
  const oar=new T.Group(); oar.position.set(-2.9,1.05,0.35); g.add(oar);
  const oarM=new T.Mesh(G.box,new T.MeshPhongMaterial({color:0x8c6a42,specular:0x000000})); oarM.scale.set(3.6,0.09,0.12); oarM.position.set(-1.7,0,0); oar.add(oarM); oar.rotation.z=0.55;
  return {g,man,oar,bob:rr(0,TAU)};
}
const boats=[];
function spawnBoats(){
  for(let i=0;i<5;i++){ const dir=i%2?1:-1; const b=makeBoat({}); const o={b,x:rr(-200,200),z:dir*2.6,dir,speed:rr(1.4,2.2),axis:'x'}; scene.add(b.g); boats.push(o); }
  const bb=makeBoat({hull:0x2e2a26}); boats.push({b:bb,x:64,z:40,dir:1,speed:1.2,axis:'z'}); scene.add(bb.g);
}
function placeBoat(b,x,z,ry){ b.g.position.set(x,-1.25+Math.sin(S.t*1.3+b.bob)*0.05,z); b.g.rotation.set(0,ry,Math.sin(S.t*0.9+b.bob)*0.02); }
function updateBoats(dt){
  for(const o of boats){
    if(o.axis==='x'){ o.x+=o.dir*o.speed*dt; if(o.x>240) o.x=-240; if(o.x<-240) o.x=240; placeBoat(o.b,o.x,o.z,o.dir>0?0:Math.PI); }
    else { o.z+=o.dir*o.speed*dt; if(o.z>84||o.z<14) o.dir*=-1; placeBoat(o.b,o.x,o.z,o.dir>0?-Math.PI/2:Math.PI/2); }
    o.b.oar.rotation.y=Math.sin(S.t*1.6+o.b.bob)*0.4; animPerson(o.b.man,0,dt);
  }
}

/* ---------- 玩家 ---------- */
let player=null, pboat=null;
const P={x:-34,z:9,y:0,heading:Math.PI/2,speed:0};
const BOAT={x:-40,z:2.8,h:0,v:0};
function spawnPlayer(){
  player=makePerson({robe:0x3f5a6e,skin:0xf0c9a8,hat:'straw',pants:0x2a2d33});
  player.g.position.set(P.x,0,P.z); scene.add(player.g);
  pboat=makeBoat({lantern:true,hull:0x4a3320}); scene.add(pboat.g); placeBoat(pboat,BOAT.x,BOAT.z,0);
}
const input={x:0,y:0,keys:{}};
function moveWithCollision(o,dx,dz){
  if(!blocked(o.x+dx,o.z)) o.x+=dx;
  if(!blocked(o.x,o.z+dz)) o.z+=dz;
}
function updatePlayer(dt){
  if(S.pano){ animPerson(player,0,dt); placeBoat(pboat,BOAT.x,BOAT.z,BOAT.h); return; }
  let jx=input.x, jy=input.y;
  const k=input.keys;
  if(k.KeyW||k.ArrowUp) jy+=1; if(k.KeyS||k.ArrowDown) jy-=1; if(k.KeyA||k.ArrowLeft) jx-=1; if(k.KeyD||k.ArrowRight) jx+=1;
  const mag=Math.min(1,Math.hypot(jx,jy)); if(mag>0){ jx/=Math.max(1,Math.hypot(jx,jy)); jy/=Math.max(1,Math.hypot(jx,jy)); }
  if(S.riding){
    BOAT.v+=(jy*5.5-BOAT.v)*Math.min(1,dt*1.1);
    if(Math.abs(BOAT.v)>0.3) BOAT.h-=jx*0.75*dt*(BOAT.v>0?1:-1);
    const fx=Math.cos(BOAT.h), fz=-Math.sin(BOAT.h);
    const nx=BOAT.x+fx*BOAT.v*dt, nz=BOAT.z+fz*BOAT.v*dt;
    const ok=[[3.3,0],[-3.3,0],[0,1.0],[0,-1.0]].every(([a,b])=>inWaterRaw(nx+fx*a-fz*b, nz+fz*a+fx*b));
    if(ok&&Math.abs(nx)<290){ BOAT.x=nx; BOAT.z=nz; } else BOAT.v*=0.3;
    placeBoat(pboat,BOAT.x,BOAT.z,BOAT.h);
    pboat.oar.rotation.y=Math.sin(S.t*2.2)*0.5*clamp(Math.abs(BOAT.v)/3,0.2,1);
    P.x=BOAT.x; P.z=BOAT.z; P.y=-0.5;
    return;
  }
  const yaw=cam.yaw;
  const fX=-Math.sin(yaw), fZ=-Math.cos(yaw), rX=Math.cos(yaw), rZ=-Math.sin(yaw);
  let dx=fX*jy+rX*jx, dz=fZ*jy+rZ*jx;
  const target=mag*4.2; P.speed+=(target-P.speed)*Math.min(1,dt*8);
  if(mag>0.05){ P.heading=Math.atan2(dx,dz); const len=Math.hypot(dx,dz); moveWithCollision(P,dx/len*P.speed*dt,dz/len*P.speed*dt); }
  const gy=groundY(P.x,P.z); P.y+=(gy-P.y)*Math.min(1,dt*12);
  player.g.position.set(P.x,P.y,P.z); player.g.rotation.y=P.heading;
  animPerson(player,P.speed,dt);
  // 船就停在旁边
  placeBoat(pboat,BOAT.x,BOAT.z,BOAT.h);
}
function nearDock(){ return !S.riding && Math.hypot(P.x-BOAT.x,P.z-BOAT.z)<7.5; }
function canLand(){ return S.riding && Math.abs(BOAT.z)<6.5 && Math.abs(BOAT.x)<150; }
function board(){
  if(!nearDock()) return false;
  S.riding=true; scene.remove(player.g); pboat.g.add(player.g);
  player.g.position.set(0.9,0.42,0); player.g.rotation.y=Math.PI/2; player.ll.rotation.x=-1.45; player.rl.rotation.x=-1.45; player.torso.position.y=0;
  BOAT.v=0; return true;
}
function land(){
  if(!canLand()) return false;
  const s=BOAT.z>=0?1:-1; let lx=BOAT.x, lz=s*8.5;
  if(blocked(lx,lz)){ let found=false; for(let d=1;d<12&&!found;d+=1){ for(const sx of [-1,1]){ if(!blocked(lx+sx*d,lz)){ lx+=sx*d; found=true; break; } } } if(!found) return false; }
  S.riding=false; pboat.g.remove(player.g); scene.add(player.g);
  player.ll.rotation.x=0; player.rl.rotation.x=0;
  P.x=lx; P.z=lz; P.y=groundY(lx,lz); P.heading=BOAT.h>-Math.PI/2&&BOAT.h<Math.PI/2?Math.PI/2:-Math.PI/2; P.speed=0;
  player.g.position.set(P.x,P.y,P.z); player.g.rotation.y=P.heading;
  return true;
}
function nearestNPC(){ let best=null,bd=3.2; for(const n of npcs){ const d=Math.hypot(n.x-P.x,n.z-P.z); if(d<bd){ bd=d; best=n; } } return S.riding?null:best; }
function inTeahouse(x,z){ return x>TH.box.x0&&x<TH.box.x1&&z>TH.box.z0&&z<TH.box.z1; }

/* ---------- 镜头 ---------- */
const cam={yaw:Math.PI*1.5,pitch:0.32,dist:7.2,lastDrag:-10,fov:58,pDist:150,savedPitch:0.32};
const PANO={x:8,y:0,z:8};
function togglePano(){
  S.pano=!S.pano; const sc=sun.shadow.camera;
  if(S.pano){ cam.savedPitch=cam.pitch; cam.pitch=0.7; cam.lastDrag=-10; sc.left=sc.bottom=-180; sc.right=sc.top=180; }
  else { cam.pitch=cam.savedPitch; sc.left=sc.bottom=-48; sc.right=sc.top=48; }
  sc.updateProjectionMatrix(); if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map=null; }
}
const _tgt=new T.Vector3(), _want=new T.Vector3(), _pos=new T.Vector3();
function wrapAngle(a){ while(a>Math.PI) a-=TAU; while(a<-Math.PI) a+=TAU; return a; }
function updateCamera(dt){
  if(S.pano){
    if(Math.abs(input.x)>0.1||Math.abs(input.y)>0.1){ cam.yaw-=input.x*dt*1.1; cam.pDist=clamp(cam.pDist*(1-input.y*dt*0.9),45,300); cam.lastDrag=S.t; }
    if(S.t-cam.lastDrag>3) cam.yaw+=dt*0.05;
    cam.pitch=clamp(cam.pitch,0.25,1.35); cam.pDist=clamp(cam.pDist,45,300);
    _tgt.set(PANO.x,PANO.y,PANO.z); const cp=Math.cos(cam.pitch);
    _want.set(_tgt.x+Math.sin(cam.yaw)*cp*cam.pDist,_tgt.y+Math.sin(cam.pitch)*cam.pDist,_tgt.z+Math.cos(cam.yaw)*cp*cam.pDist);
    const gy=groundY(_want.x,_want.z); if(_want.y<gy+4) _want.y=gy+4;
    camera.position.lerp(_want,Math.min(1,dt*2.2)); camera.lookAt(_tgt); skyGroup.position.copy(camera.position); return;
  }
  let focusH=S.riding?(BOAT.h+Math.PI*1.5):(P.heading+Math.PI);
  const moving=S.riding?Math.abs(BOAT.v)>0.5:P.speed>0.3;
  if(moving && S.t-cam.lastDrag>1.5){ cam.yaw+=wrapAngle(focusH-cam.yaw)*Math.min(1,dt*1.4); }
  cam.pitch=clamp(cam.pitch,-0.12,1.15);
  const dist=S.riding?9.5:cam.dist;
  _tgt.set(P.x,P.y+(S.riding?1.6:1.55),P.z);
  const cp=Math.cos(cam.pitch);
  _want.set(_tgt.x+Math.sin(cam.yaw)*cp*dist, _tgt.y+Math.sin(cam.pitch)*dist+0.4, _tgt.z+Math.cos(cam.yaw)*cp*dist);
  // 镜头别穿墙：从人往后找第一个挡住的地方
  let tEnd=1;
  for(let i=1;i<=24;i++){ const t=i/24; const x=lerp(_tgt.x,_want.x,t), z=lerp(_tgt.z,_want.z,t), y=lerp(_tgt.y,_want.y,t);
    let hit=false; if(y<9.5){ for(const o of obstacles){ if(o.h&&y>o.h) continue; const m=o.pad||0; if(x>o.x0-m&&x<o.x1+m&&z>o.z0-m&&z<o.z1+m){ hit=true; break; } } }
    if(!hit && y<groundY(x,z)+0.5 && !inWaterRaw(x,z)) hit=true;
    if(hit){ tEnd=Math.max(0.12,t-1/24); break; } }
  _pos.lerpVectors(_tgt,_want,tEnd);
  const gy=groundY(_pos.x,_pos.z); if(_pos.y<gy+0.6) _pos.y=gy+0.6;
  camera.position.lerp(_pos,Math.min(1,dt*10));
  camera.lookAt(_tgt);
  skyGroup.position.copy(camera.position);
}

/* ---------- 输入：摇杆、拖动、键盘 ---------- */
function setupInput(){
  if(IS_NODE) return;
  const joy=document.getElementById('joy'), knob=document.getElementById('knob');
  let joyId=null, joyC={x:0,y:0}, dragId=null, dragLast={x:0,y:0}, mouseDown=false, pinchId=null, pinchLast={x:0,y:0};
  const R=46;
  function placeJoy(x,y){ joy.style.left=(x-60)+'px'; joy.style.top=(y-60)+'px'; }
  function resetJoy(){ joy.style.left=''; joy.style.top=''; knob.style.transform='translate(0,0)'; input.x=0; input.y=0; }
  function setKnob(x,y){ let dx=x-joyC.x, dy=y-joyC.y; const d=Math.hypot(dx,dy); if(d>R){ dx*=R/d; dy*=R/d; } knob.style.transform=`translate(${dx}px,${dy}px)`; input.x=dx/R; input.y=-dy/R; }
  const isUI=el=>el&&el.closest&&el.closest('#actions,#brand,#readout,#bubble,#boot,#uitab');
  window.addEventListener('touchstart',e=>{
    for(const t of e.changedTouches){
      if(isUI(t.target)) continue;
      if(joyId===null && t.clientX<window.innerWidth*0.45 && t.clientY>window.innerHeight*0.3){ joyId=t.identifier; joyC={x:t.clientX,y:t.clientY}; placeJoy(t.clientX,t.clientY); }
      else if(dragId===null){ dragId=t.identifier; dragLast={x:t.clientX,y:t.clientY}; }
      else if(pinchId===null&&S.pano){ pinchId=t.identifier; pinchLast={x:t.clientX,y:t.clientY}; }
    }
  },{passive:true});
  window.addEventListener('touchmove',e=>{
    for(const t of e.changedTouches){
      if(t.identifier===joyId) setKnob(t.clientX,t.clientY);
      else if(t.identifier===dragId||t.identifier===pinchId){
        if(pinchId!==null){ const a=t.identifier===dragId?{x:t.clientX,y:t.clientY}:dragLast, b=t.identifier===pinchId?{x:t.clientX,y:t.clientY}:pinchLast; const d0=Math.hypot(dragLast.x-pinchLast.x,dragLast.y-pinchLast.y), d1=Math.hypot(a.x-b.x,a.y-b.y); if(d0>10&&d1>10) cam.pDist=clamp(cam.pDist*d0/d1,45,300); if(t.identifier===dragId) dragLast=a; else pinchLast=b; cam.lastDrag=S.t; }
        else { cam.yaw-=(t.clientX-dragLast.x)*0.0062; cam.pitch+=(t.clientY-dragLast.y)*0.0045; dragLast={x:t.clientX,y:t.clientY}; cam.lastDrag=S.t; }
      }
    }
    if(!isUI(e.target)) e.preventDefault();
  },{passive:false});
  const endT=e=>{ for(const t of e.changedTouches){ if(t.identifier===joyId){ joyId=null; resetJoy(); } if(t.identifier===dragId) dragId=null; if(t.identifier===pinchId) pinchId=null; } };
  window.addEventListener('touchend',endT); window.addEventListener('touchcancel',endT);
  const cv=document.getElementById('c');
  cv.addEventListener('mousedown',e=>{ mouseDown=true; dragLast={x:e.clientX,y:e.clientY}; });
  window.addEventListener('mousemove',e=>{ if(!mouseDown) return; cam.yaw-=(e.clientX-dragLast.x)*0.005; cam.pitch+=(e.clientY-dragLast.y)*0.004; dragLast={x:e.clientX,y:e.clientY}; cam.lastDrag=S.t; });
  window.addEventListener('mouseup',()=>mouseDown=false);
  cv.addEventListener('wheel',e=>{ if(S.pano){ cam.pDist=clamp(cam.pDist*(1+e.deltaY*0.001),45,300); cam.lastDrag=S.t; } else cam.dist=clamp(cam.dist+e.deltaY*0.01,3.5,14); },{passive:true});
  window.addEventListener('keydown',e=>{ input.keys[e.code]=true; if(e.code==='KeyE') UI.action(); if(e.code==='KeyT') UI.nextTime(); if(e.code==='KeyR') UI.toggleRain(); if(e.code==='KeyP') UI.togglePano(); });
  window.addEventListener('keyup',e=>{ input.keys[e.code]=false; });
}

/* ============================================================
   声音：水声、雨声、一把随手拨的古筝、远处的塔钟、夜里的虫鸣
   （全部由 Web Audio 现场合成，没有任何音频文件）
   ============================================================ */
const AU={ctx:null,master:null,conv:null,rainG:null,nextPluck:0,nextBell:20,nextChirp:0};
const PENTA=[293.66,349.23,392.0,440.0,523.25,587.33,698.46,783.99];
function setupAudio(){
  if(AU.ctx||IS_NODE) return;
  const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
  const ctx=new AC(); AU.ctx=ctx;
  const master=ctx.createGain(); master.gain.value=0; master.connect(ctx.destination); AU.master=master;
  const len=Math.floor(ctx.sampleRate*1.8), ir=ctx.createBuffer(2,len,ctx.sampleRate);
  for(let c=0;c<2;c++){ const d=ir.getChannelData(c); for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.4)*0.5; }
  const conv=ctx.createConvolver(); conv.buffer=ir; const wet=ctx.createGain(); wet.gain.value=0.4; conv.connect(wet); wet.connect(master); AU.conv=conv;
  const nb=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate); const nd=nb.getChannelData(0); for(let i=0;i<nd.length;i++) nd[i]=Math.random()*2-1;
  const water=ctx.createBufferSource(); water.buffer=nb; water.loop=true;
  const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=360; const wg=ctx.createGain(); wg.gain.value=0.06;
  const lfo=ctx.createOscillator(); lfo.frequency.value=0.12; const lg=ctx.createGain(); lg.gain.value=0.025; lfo.connect(lg); lg.connect(wg.gain); lfo.start();
  water.connect(lp); lp.connect(wg); wg.connect(master); water.start();
  const rs=ctx.createBufferSource(); rs.buffer=nb; rs.loop=true; const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=2400; bp.Q.value=0.45;
  const rg=ctx.createGain(); rg.gain.value=0; rs.connect(bp); bp.connect(rg); rg.connect(master); rs.start(); AU.rainG=rg;
  master.gain.linearRampToValueAtTime(0.9,ctx.currentTime+1.5);
}
function pluck(freq,vol){
  const ctx=AU.ctx,t=ctx.currentTime;
  const o1=ctx.createOscillator(); o1.type='triangle'; o1.frequency.value=freq;
  const o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=freq*2.01;
  const g=ctx.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+0.012); g.gain.exponentialRampToValueAtTime(0.001,t+1.7);
  const g2=ctx.createGain(); g2.gain.value=0.3;
  o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(AU.master); g.connect(AU.conv);
  o1.start(t); o2.start(t); o1.stop(t+1.8); o2.stop(t+1.8);
}
function bell(){
  const ctx=AU.ctx,t=ctx.currentTime;
  for(const [f,v,d] of [[196,0.22,4.5],[392,0.08,3.2],[523.3,0.05,2.2],[110,0.1,5]]){
    const o=ctx.createOscillator(); o.frequency.value=f; const g=ctx.createGain();
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(v,t+0.02); g.gain.exponentialRampToValueAtTime(0.001,t+d);
    o.connect(g); g.connect(AU.conv); g.connect(AU.master); o.start(t); o.stop(t+d+0.1);
  }
}
function chirp(){
  const ctx=AU.ctx,t=ctx.currentTime; const o=ctx.createOscillator(); o.frequency.setValueAtTime(rr(3400,4200),t); o.frequency.exponentialRampToValueAtTime(3000,t+0.08);
  const g=ctx.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.012,t+0.01); g.gain.exponentialRampToValueAtTime(0.0005,t+0.09);
  o.connect(g); g.connect(AU.master); o.start(t); o.stop(t+0.1);
}
function updateAudio(dt){
  if(!AU.ctx||!S.sound) return;
  const rg=AU.rainG.gain; rg.value+=((S.rain?0.11:0)-rg.value)*Math.min(1,dt*0.8);
  if(S.t>AU.nextPluck){
    const base=pick(PENTA); pluck(base,S.rain?0.05:0.08);
    if(rnd()<0.4) setTimeout(()=>{ if(AU.ctx&&S.sound) pluck(pick(PENTA),0.06); },rr(180,420));
    AU.nextPluck=S.t+rr(1.8,5.0)*(S.night>0.5?1.7:1);
  }
  if(S.t>AU.nextBell){ bell(); AU.nextBell=S.t+rr(38,70); }
  if(S.night>0.6&&S.t>AU.nextChirp){ chirp(); AU.nextChirp=S.t+rr(0.3,1.6); }
}

/* ============================================================
   界面
   ============================================================ */
const LINES={
  day:['今日的茶是明前的，进来尝一口？','桥那头新开了家糕团铺子，去看看。','这河水，一年到头都不歇。','船家等下要去东头，你顺路么？','石桥上风大，扶着栏杆走。','塔在山上，路不远，就是有点陡。'],
  dusk:['这会儿的天色，一年也没几回。','灯快点上了，河面就要好看了。','晚饭吃了没？茶楼今晚有评弹。'],
  night:['灯都点上了，早些回去吧。','夜里的水路，船家心里都有数。','塔上的灯亮着，山路就不怕黑。','夜里的河像一整条铺开的灯。'],
  rain:['落雨了，伞借你一把？','雨天的河面最好看，你信不信。','瓦上的雨声，比戏文还好听。','雨里走慢些，石板滑。'],
};
const SHICHEN='子丑寅卯辰巳午未申酉戌亥';
const UI={
  el:{}, hintT:0, bubbleT:0, frames:0, lastFpsT:0, lowT:0, started:false,
  $(id){ return document.getElementById(id); },
  init(){
    if(IS_NODE) return;
    for(const id of ['boot','brand','readout','ro-time','ro-fps','ro-wx','hint','bubble','actions','b-act','b-time','b-rain','b-sound','b-ui','b-pano','uitab','joy']) this.el[id]=this.$(id);
    const on=(id,fn)=>{ const e=this.el[id]; e.addEventListener('click',ev=>{ ev.preventDefault(); fn(); }); };
    on('b-act',()=>UI.action()); on('b-time',()=>UI.nextTime()); on('b-rain',()=>UI.toggleRain()); on('b-sound',()=>UI.toggleSound()); on('b-ui',()=>UI.toggleUI()); on('uitab',()=>UI.toggleUI()); on('b-pano',()=>UI.togglePano());
    this.hint('左下摇杆走路，拖动画面转视角',6);
  },
  hint(text,sec){ if(IS_NODE) return; this.el.hint.textContent=text; this.el.hint.classList.add('show'); this.hintT=sec; },
  bubble(text){ if(IS_NODE) return; this.el.bubble.textContent=text; this.el.bubble.classList.add('show'); this.bubbleT=4.5; },
  action(){
    if(S.riding){ if(!land()) this.hint('这一段靠不了岸，再往前划一划',3); else this.hint('上岸了',2); return; }
    if(nearDock()){ if(board()) this.hint('摇杆往前推是划船，左右是转向',5); return; }
    const n=nearestNPC(); if(n){ const e=sunDir.y; const pool=S.rain?LINES.rain:(S.night>0.5?LINES.night:(e<0.3?LINES.dusk:LINES.day)); n.talk=4.5; this.bubble(pick(pool)); }
  },
  nextTime(){ const presets=[0.27,0.5,0.735,0.95]; const next=presets.find(p=>p>S.dayT+0.02); S.dayT=next===undefined?presets[0]:next; },
  toggleRain(){ S.rain=!S.rain; if(!IS_NODE) this.el['b-rain'].textContent=S.rain?'停雨':'落雨'; },
  toggleSound(){ S.sound=!S.sound; if(S.sound){ setupAudio(); if(AU.ctx&&AU.ctx.state==='suspended') AU.ctx.resume(); } else if(AU.ctx){ AU.master.gain.value=0; } if(S.sound&&AU.ctx) AU.master.gain.linearRampToValueAtTime(0.9,AU.ctx.currentTime+0.8); this.el['b-sound'].textContent=S.sound?'静音':'声音'; },
  togglePano(){ togglePano(); if(!IS_NODE){ this.el['b-pano'].textContent=S.pano?'回去':'全景'; if(S.pano) this.hint('拖动旋转，两指或摇杆上下缩放',4); } },
  toggleUI(){ S.uiHidden=!S.uiHidden; document.body.classList.toggle('chrome-off',S.uiHidden); },
  update(dt){
    if(IS_NODE) return;
    if(this.hintT>0){ this.hintT-=dt; if(this.hintT<=0) this.el.hint.classList.remove('show'); }
    if(this.bubbleT>0){ this.bubbleT-=dt; if(this.bubbleT<=0) this.el.bubble.classList.remove('show'); }
    const act=this.el['b-act']; let label=null;
    if(S.pano) label=null; else if(S.riding) label=canLand()?'下船':null; else if(nearDock()) label='上船'; else if(nearestNPC()) label='说话';
    if(label){ act.textContent=label; act.classList.add('show'); } else act.classList.remove('show');
    const hour=S.dayT*24; this.el['ro-time'].textContent=SHICHEN[Math.floor(((hour+1)%24)/2)]+'时';
    this.el['ro-wx'].textContent=S.rain?'小雨':(S.night>0.5?'晴夜':'晴');
    if(!S.riding&&!this.tipTea&&Math.hypot(P.x-TH.door.x,P.z-TH.door.z)<5){ this.tipTea=true; this.hint('茶馆到了，进去坐坐',3); }
  },
  afterFrame(){
    if(IS_NODE) return;
    if(!this.started){ this.started=true; setTimeout(()=>this.el.boot.classList.add('gone'),200); }
    this.frames++;
    if(S.t-this.lastFpsT>=1){ S.fps=this.frames/(S.t-this.lastFpsT); this.frames=0; this.lastFpsT=S.t; this.el['ro-fps'].textContent=Math.round(S.fps)+' 帧';
      if(S.fps<26) this.lowT++; else this.lowT=0; if(this.lowT>=3&&S.quality>0){ setQuality(S.quality-1); this.lowT=0; } }
  }
};
function setQuality(q){
  S.quality=q;
  if(q===2){ renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5)); renderer.shadowMap.enabled=true; sun.shadow.mapSize.set(2048,2048); }
  else if(q===1){ renderer.setPixelRatio(1); sun.shadow.mapSize.set(1024,1024); if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map=null; } }
  else { renderer.shadowMap.enabled=false; scene.traverse(o=>{ if(o.material) o.material.needsUpdate=true; }); }
}
function updateTeahouse(dt){
  const inside=inTeahouse(P.x,P.z); const target=inside?0.1:1;
  for(const m of TH.upperMats){ m.opacity+=(target-m.opacity)*Math.min(1,dt*6); m.depthWrite=m.opacity>0.6; }
}

/* ============================================================
   启动与主循环
   ============================================================ */
let renderer=null; const _focus=new T.Vector3();
function makeRenderer(){
  if(IS_NODE) return NODE_ENV.makeRenderer(T);
  const r=new T.WebGLRenderer({canvas:document.getElementById('c'),antialias:true,powerPreference:'high-performance'});
  r.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5)); r.setSize(window.innerWidth,window.innerHeight);
  r.shadowMap.enabled=true; r.shadowMap.type=T.PCFShadowMap;
  return r;
}
function resize(){ if(IS_NODE) return; camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight); }
function init(){
  buildAtlas(); makeMaterials(); layoutTown(); buildWater(); buildStreaks(); scene.add(buildGround()); commitBatches();
  spawnNPCs(); spawnBoats(); spawnPlayer();
  renderer=makeRenderer();
  camera.aspect=IS_NODE?NODE_ENV.aspect:window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
  setupInput(); UI.init(); if(!IS_NODE) window.addEventListener('resize',resize);
  P.y=groundY(P.x,P.z); player.g.position.set(P.x,P.y,P.z); player.g.rotation.y=P.heading;
  updateEnv(0,_focus.set(P.x,P.y,P.z)); for(let i=0;i<30;i++) updateCamera(0.1);
}
function step(dt){
  S.t+=dt; S.dayT=(S.dayT+dt/S.dayLen)%1;
  updatePlayer(dt); updateNPCs(dt); updateBoats(dt);
  updateEnv(dt,S.pano?_focus.set(PANO.x,0,PANO.z):_focus.set(P.x,P.y,P.z)); updateRain(dt,S.pano?camera.position.x:P.x,S.pano?camera.position.z:P.z); updateTeahouse(dt); updateCamera(dt); UI.update(dt); updateAudio(dt);
}
let _last=0;
function frame(now){
  const dt=_last?Math.min(0.05,(now-_last)/1000):0.016; _last=now;
  step(dt); renderer.render(scene,camera); UI.afterFrame(); requestAnimationFrame(frame);
}
init();
return {scene,camera,S,P,cam,BOAT,TH,input,player,pboat,npcs,obstacles,groundY,isWater,inWaterRaw,blocked,board,land,nearDock,canLand,nearestNPC,inTeahouse,LINES,sunDir,skyGroup,
updatePlayer,updateNPCs,updateBoats,updateEnv,updateRain,updateTeahouse,updateCamera,placeBoat};

};
