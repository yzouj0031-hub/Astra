// Adapted from the user-supplied source for Astra. Three.js is provided by the host (r128).
window.AstraRegionFactories.rainport=function(T){

const PLACES={
  canal:{name:'灯火沿岸',description:'慢一点，末班电车还没有走。',position:[-14,0,28],target:[-1,4,4],yaw:.76,distance:108},
  market:{name:'深夜市场',description:'蒸汽升起来，夜宵刚刚好。',position:[18,0,1],target:[28,3,8],yaw:.68,distance:66},
  lighthouse:{name:'海角灯塔',description:'再往前，就是海的声音。',position:[-22,0,68],target:[-16,6,61],yaw:.65,distance:76}
};

let seed=314159;
const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const range=(a,b)=>a+(b-a)*rnd();
/* 固定种子：楼、天际线、水洼、路人、远山、星、雨丝都排在同一条随机序列上。
   新加的细节一律不抽主序列的数 —— 用坐标哈希，哪一栋楼、哪一扇窗都能各不相同。 */
const hash=(x,z,k=0)=>{const s=Math.sin(x*12.9898+z*78.233+k*37.719)*43758.5453;return s-Math.floor(s);};
const C={navy:0x263c52,blue:0x344d65,blue2:0x3c5469,teal:0x336a72,coral:0xb96661,cream:0xb5b7a1,wood:0x664c49,dark:0x142833,trim:0x718a8d,amber:0xffce87,pink:0xff7b89,cyan:0x81e5df};
const REFLECT_SLOTS=40;

function createWorld(scene,{mobile=false,trees=null,vehicles=null}={}){
  const TREES=trees;
  seed=314159;
  const colliders=[],batches=new Map(),matCache=new Map(),glows=[],reflections=[];
  const boxGeo=new T.BoxGeometry(1,1,1),cylGeo=new T.CylinderGeometry(1,1,1,10),cyl16=new T.CylinderGeometry(1,1,1,16),sphGeo=new T.SphereGeometry(1,10,8),planeGeo=new T.PlaneGeometry(1,1),dummy=new T.Object3D();
  const torusGeo=new T.TorusGeometry(1,.06,6,18),coneOpen=new T.ConeGeometry(1,1,14,1,true),ringGeo=new T.RingGeometry(.84,1,10);
  // 按用途给材质起名（墙 / 木 / 石 / 地面 / 车道），regions.js 照名字挂程序化表面细节；
  // 发光的、车船和人身上的颜色不起名，保持原样
  const ROLE=new Map([[C.blue,'wall'],[C.teal,'wall'],[C.coral,'wall'],[C.blue2,'wall'],[C.cream,'wall'],[C.navy,'wall'],[0xc9c3ab,'wall'],
   [C.wood,'wood'],[0x7d7164,'wood'],[0x273942,'stone'],[0x354d57,'stone'],[0x334b59,'stone'],[0x3f5058,'stone'],
   [0x43535b,'ground'],[0x829295,'ground'],[0x243442,'ground'],[0x202f3c,'road']]);
  // 材质缓存的键带上粗糙度/金属度：雨夜的路面、水洼、玻璃各有自己的反光，不能全是一档 .68
  const material=(color,glow=0,rough=.68,metal=.12)=>{
    const key=color+':'+glow+':'+rough+':'+metal;
    if(!matCache.has(key)){const m=new T.MeshStandardMaterial({color,roughness:rough,metalness:metal,emissive:glow?color:0,emissiveIntensity:glow});if(!glow&&ROLE.has(color))m.name=ROLE.get(color);matCache.set(key,m);}
    return matCache.get(key);
  };
  const batch=(geo,mat,pos,scale,rot=[0,0,0])=>{
    const key=geo.uuid+mat.uuid;
    if(!batches.has(key))batches.set(key,{geo,mat,items:[]});
    dummy.position.set(...pos);dummy.scale.set(...scale);dummy.rotation.set(...rot);dummy.updateMatrix();batches.get(key).items.push(dummy.matrix.clone());
  };
  const box=(x,y,z,w,h,d,col,rot=0,glow=0,rough,metal)=>batch(boxGeo,material(col,glow,rough,metal),[x,y,z],[w,h,d],[0,rot,0]);
  const cyl=(x,y,z,r,h,col,glow=0,rough,metal)=>batch(cylGeo,material(col,glow,rough,metal),[x,y,z],[r,h,r]);
  const segment=(a,b,r,col)=>{const av=new T.Vector3(...a),bv=new T.Vector3(...b),dir=bv.clone().sub(av);dummy.position.copy(av).add(bv).multiplyScalar(.5);dummy.scale.set(r,dir.length(),r);dummy.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize());dummy.updateMatrix();const mat=material(col),key=cylGeo.uuid+mat.uuid;if(!batches.has(key))batches.set(key,{geo:cylGeo,mat,items:[]});batches.get(key).items.push(dummy.matrix.clone());};
  const mesh=(geo,mat,x,y,z,rx=0,ry=0,rz=0,parent=scene)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  const obstacle=(x,z,w,d,pad=0)=>colliders.push({minX:x-w/2-pad,maxX:x+w/2+pad,minZ:z-d/2-pad,maxZ:z+d/2+pad});
  // 一条下垂的线：TubeGeometry 沿着过所有点的样条走，中间按跨度垂下去
  const V=(x,y,z)=>new T.Vector3(x,y,z);
  const sagTube=(points,sag,r,mat,segs=48)=>{const pts=[];for(let i=0;i<points.length;i++){pts.push(V(...points[i]));if(i<points.length-1){const a=points[i],b=points[i+1];pts.push(V((a[0]+b[0])/2,(a[1]+b[1])/2-sag,(a[2]+b[2])/2));}}const curve=new T.CatmullRomCurve3(pts,false,'centripetal');const m=mesh(new T.TubeGeometry(curve,segs*(points.length-1),r,4,false),mat,0,0,0);m.castShadow=false;return m;};

  const glowCanvas=document.createElement('canvas');glowCanvas.width=64;glowCanvas.height=64;const gc=glowCanvas.getContext('2d');const grad=gc.createRadialGradient(32,32,0,32,32,32);grad.addColorStop(0,'rgba(255,255,255,.9)');grad.addColorStop(.15,'rgba(255,255,255,.4)');grad.addColorStop(.45,'rgba(255,255,255,.1)');grad.addColorStop(1,'rgba(255,255,255,0)');gc.fillStyle=grad;gc.fillRect(0,0,64,64);const glowTexture=new T.CanvasTexture(glowCanvas);
  /* 光晕：原来每个都是一个 Sprite，一个就是一次绘制，全城八九十个。现在挂在场景上的
     光晕全进一个 InstancedMesh，逐实例颜色（透明度折进颜色里，反正是叠加混合），
     每帧把矩阵转向相机。挂在电车、浮标上的才还是 Sprite。 */
  const haloItems=[];
  const halo=(x,y,z,color,size=5,opacity=.3,parent=scene)=>{
    if(parent===scene){haloItems.push({p:new T.Vector3(x,y,z),c:new T.Color(color).multiplyScalar(opacity),s:size});return null;}
    const sp=new T.Sprite(new T.SpriteMaterial({map:glowTexture,color,transparent:true,opacity,blending:T.AdditiveBlending,depthWrite:false}));sp.position.set(x,y,z);sp.scale.set(size,size,1);parent.add(sp);glows.push(sp);return sp;
  };
  const light=(x,y,z,color,power=20,distance=12)=>{if(!mobile||scene.children.filter(c=>c.isPointLight).length<4){const l=new T.PointLight(color,power*.035,distance,1.6);l.position.set(x,y,z);scene.add(l);return l;}};
  function sign(text,w,h,x,y,z,rot=0,color='#ffc7a5',background='#273842',fontSize=76,vertical=false){
    const c=document.createElement('canvas');c.width=vertical?128:512;c.height=vertical?Math.max(256,Math.round(128*h/w)):Math.max(128,Math.round(512*h/w));const cx=c.getContext('2d');cx.fillStyle=background;cx.fillRect(0,0,c.width,c.height);cx.strokeStyle=color;cx.lineWidth=3;cx.strokeRect(10,10,c.width-20,c.height-20);cx.textAlign='center';cx.textBaseline='middle';cx.shadowColor=color;cx.shadowBlur=14;cx.font=`500 ${fontSize}px "Microsoft YaHei",sans-serif`;cx.fillStyle=color;
    const lines=vertical?text.replace(/\s/g,'').split(''):text.split('\n');lines.forEach((s,i)=>cx.fillText(s,c.width/2,c.height*(i+.5)/lines.length,c.width-35));
    const tex=new T.CanvasTexture(c);tex.encoding=T.sRGBEncoding;tex.anisotropy=4;const mat=new T.MeshBasicMaterial({map:tex,toneMapped:false,side:T.DoubleSide});const m=mesh(new T.PlaneGeometry(w,h),mat,x,y,z,0,rot);m.castShadow=false;halo(x,y,z,color,Math.max(w,h)*1.6,.1);return m;
  }
  // 条纹帆布（遮阳篷）：横向八道
  const stripeTexture=(a,b)=>{const c=document.createElement('canvas');c.width=128;c.height=32;try{const cx=c.getContext('2d');for(let i=0;i<8;i++){cx.fillStyle=i%2?a:b;cx.fillRect(i*16,0,16,32);}}catch(e){}const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;return t;};
  const awningMats=[new T.MeshStandardMaterial({map:stripeTexture('#b8564f','#d9cbb2'),roughness:.85,side:T.DoubleSide}),new T.MeshStandardMaterial({map:stripeTexture('#2f6d72','#d0d5c4'),roughness:.85,side:T.DoubleSide}),new T.MeshStandardMaterial({map:stripeTexture('#3d4f6e','#cfc6ad'),roughness:.85,side:T.DoubleSide})];
  // 四分之一圆筒壳：顶边贴墙（y=0），往外垂到 z=1、y=-1；宽 1，按楼宽缩放
  const quarterShell=(n=8)=>{const pos=[],nor=[],uv=[],idx=[];for(let i=0;i<=n;i++){const a=i/n*Math.PI/2,y=Math.cos(a)-1,z=Math.sin(a);for(const x of [-.5,.5]){pos.push(x,y,z);nor.push(0,Math.cos(a),Math.sin(a));uv.push(x+.5,i/n);}}for(let i=0;i<n;i++){const o=i*2;idx.push(o,o+2,o+1,o+1,o+2,o+3);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(nor,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);return g;};
  const awningGeo=quarterShell(8);
  // 弧形雨棚（电车站）：一段浅弧，宽 1、长 1，中间拱起
  const canopyGeo=(()=>{const n=10,th=1.0,pos=[],nor=[],uv=[],idx=[];const w=2*Math.sin(th/2);for(let i=0;i<=n;i++){const a=(i/n-.5)*th,x=Math.sin(a)/w,y=Math.cos(a)-Math.cos(th/2);for(const z of [-.5,.5]){pos.push(x,y,z);nor.push(-Math.sin(a),Math.cos(a),0);uv.push(i/n,z+.5);}}for(let i=0;i<n;i++){const o=i*2;idx.push(o,o+1,o+2,o+1,o+3,o+2);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(nor,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);return g;})();
  const glassMat=new T.MeshStandardMaterial({color:0x9fc7c9,roughness:.12,metalness:.2,transparent:true,opacity:.42,side:T.DoubleSide,depthWrite:false});glassMat.userData.noShadow=true;
  const bleedMat=new T.MeshBasicMaterial({color:0xffc27a,transparent:true,opacity:.12,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide});bleedMat.userData.noShadow=true;
  const bleedCool=new T.MeshBasicMaterial({color:0x9fe4d6,transparent:true,opacity:.1,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide});bleedCool.userData.noShadow=true;
  // 灯光贴在墙上的一层微光；rot 是楼的朝向
  const bleed=(p,w,h,rot,cool)=>batch(planeGeo,cool?bleedCool:bleedMat,p,[w,h,1],[0,rot,0]);

  // The two quays are separate pieces of land; the canal stays open to the sea.
  box(-32,-1.1,0,44,2,132,0x273942);box(32,-1.1,0,44,2,132,0x273942);
  // 湿路面：粗糙度压到 .32，天空和灯光在地上有一层薄薄的反光
  box(-32,-.03,0,44,.18,132,0x43535b,0,0,.34,.1);box(32,-.03,0,44,.18,132,0x43535b,0,0,.34,.1);
  box(-23,.07,0,7,.05,126,0x202f3c,0,0,.3,.1);box(23,.07,0,7,.05,126,0x202f3c,0,0,.3,.1);
  for(const x of [-27.4,-18.7,18.7,27.4])box(x,.08,0,.12,.07,125,0x819c9f);
  for(const x of [-10.25,10.25])box(x,.15,0,.5,.55,132,0x728e8e);
  // 驳岸的条石面：临水一侧一条条压顶石缝
  for(const x of [-10.5,10.5])for(let z=-64;z<66;z+=2.4)box(x,.4,z,.06,.06,.06,0x1c2a32);
  for(const x of [-51.8,51.8])box(x,.1,0,.35,.3,129,0x758687);
  for(let z=-63;z<65;z+=4){for(const x of [-15.1,15.1])box(x,.076,z,9.2,.04,.04,0x688087);}
  for(const z of [-55,55]){
    box(0,-.22,z,47,.7,8,0x334b59);box(0,.16,z,47,.06,7.4,0x243442,0,0,.34,.1);
    for(const dz of [-4.15,4.15]){box(0,.23,z+dz,47,.3,.45,0x7c9397);box(0,1.6,z+dz,19,.09,.1,0x829f9c);for(let x=-9;x<10;x+=2)box(x,.9,z+dz,.07,1.45,.09,0x7b9495);}
    for(const x of [-8,8]){box(x,-1.1,z,1.1,2.2,8,0x293d4c);}
  }
  // Tram loop, with broad rounded corners.
  const trackPoints=[[-23,-52],[-20,-55],[20,-55],[23,-52],[23,52],[20,55],[-20,55],[-23,52]].map(([x,z])=>new T.Vector3(x,.21,z));
  const track=new T.CatmullRomCurve3(trackPoints,true,'catmullrom',.2);
  for(const offset of [-.9,.9]){
    const pts=[];for(let i=0;i<=420;i++){const p=track.getPointAt(i/420),t=track.getTangentAt(i/420);p.x+=t.z*offset;p.z-=t.x*offset;pts.push(p);}
    const curve=new T.CatmullRomCurve3(pts,false,'centripetal');mesh(new T.TubeGeometry(curve,420,.035,4,false),material(0xadb7b3,0,.35,.6),0,0,0);
  }
  const trackLength=track.getLength();
  for(let d=0;d<trackLength;d+=1.2){const p=track.getPointAt(d/trackLength),t=track.getTangentAt(d/trackLength);box(p.x,.13,p.z,2.6,.055,.22,0x47545a,Math.atan2(t.x,t.z));}
  for(const x of [-23,23]){for(let z=-43;z<48;z+=24){cyl(x-4,4.7,z,.07,9.4,0x708892);segment([x-4,9.35,z],[x+.7,9.35,z],.055,0x708892);}segment([x,9.2,-47],[x,9.2,47],.025,0x4f7180);}
  // Buildings face the water, with illuminated shop fronts, roof structures and side windows.
  const facadeColors=[C.blue,C.teal,C.coral,C.blue2,C.cream,C.navy];
  const neonColor=hex=>parseInt(hex.slice(1),16);
  function building(x,z,w,d,h,rot,color,shop,shopColor='#ffcaa2',idx=0){
    const world=(lx,ly,lz)=>[x+Math.cos(rot)*lx+Math.sin(rot)*lz,ly,z-Math.sin(rot)*lx+Math.cos(rot)*lz];
    const local=(lx,ly,lz,ww,hh,dd,col,gl=0,rough,metal)=>{const p=world(lx,ly,lz);box(...p,ww,hh,dd,col,rot,gl,rough,metal);};
    local(0,h/2,0,w,h,d,color);local(0,.7,d/2+.09,w,1.4,.22,C.dark);local(0,h+.15,0,w+.45,.4,d+.45,C.trim);local(0,h+.4,0,w-.8,.2,d-.8,0x263a47);
    // 檐口：出挑两层，下面一道暗影带
    local(0,h-.25,d/2+.16,w+.2,.14,.32,C.trim);local(0,h-.42,d/2+.08,w+.1,.2,.16,0x1b2d38);
    const worldW=Math.abs(Math.cos(rot))*w+Math.abs(Math.sin(rot))*d,worldD=Math.abs(Math.sin(rot))*w+Math.abs(Math.cos(rot))*d;obstacle(x,z,worldW,worldD,.18);
    const cols=Math.max(2,Math.floor(w/2.4)),floors=Math.floor((h-4)/2.9);
    const neon=neonColor(shopColor);
    for(let f=0;f<floors;f++){
      const wy=5.1+f*2.8;local(0,wy-1.1,d/2+.12,w,.12,.25,0x69858c);
      for(let c=0;c<cols;c++){
        const wx=(c-(cols-1)/2)*w/(cols+.3),lit=rnd()>.23,co=lit?(rnd()>.6?0xb8e0d4:C.amber):0x244252;
        // 窗退进墙里：窗纸几乎贴平墙面，四边窗套探出来 —— 有了进深就不再是画在墙上的方块
        const curtain=lit&&((f*7+c*3)%10)<3;
        local(wx,wy,d/2+.015,1.16,1.5,.05,curtain?0xe2b98d:co,lit?(curtain?.32:.7):0,.15,.05);
        if(curtain){local(wx-.3,wy,d/2+.045,.5,1.44,.03,0x7a4a48,.08);local(wx+.34,wy+.1,d/2+.045,.36,1.24,.03,0x7a4a48,.08);}
        local(wx,wy,d/2+.05,.05,1.5,.05,C.dark);local(wx,wy+.22,d/2+.05,1.16,.045,.05,C.dark);
        local(wx-.64,wy,d/2+.1,.1,1.72,.2,C.trim);local(wx+.64,wy,d/2+.1,.1,1.72,.2,C.trim);local(wx,wy+.81,d/2+.1,1.38,.1,.2,C.trim);local(wx,wy-.81,d/2+.17,1.5,.1,.36,C.trim);
        if(lit)bleed(world(wx,wy-.25,d/2+.24),1.9,2.4,rot,co===0xb8e0d4);
        if(f===1&&c%2===0){local(wx,wy-.56,d/2+.62,1.85,.09,.7,0x425960);local(wx,wy,d/2+.92,1.85,.07,.07,C.trim);for(const dx of [-.8,0,.8])local(wx+dx,wy-.3,d/2+.92,.055,.65,.055,C.trim);
          if(hash(x,z,c)>.5){local(wx+.5,wy-.35,d/2+.72,.4,.32,.4,0x5c6b58);local(wx+.5,wy-.05,d/2+.72,.55,.3,.55,0x3f6a4f);}}
      }
    }
    for(const side of [-1,1])for(let f=0;f<floors;f++)for(let c=0;c<2;c++)local(side*(w/2+.02),5.1+f*2.8,(c-.5)*d*.47,.06,1.3,1.2,rnd()>.4?0xf0bf87:0x274052,rnd()>.4?.45:0);
    // 落水管与空调机：按位置哈希挑一侧
    const dp=hash(x,z,1)>.5?1:-1;local(dp*(w/2-.35),h/2+.2,d/2+.1,.09,h-.6,.09,0x4b5f66);local(dp*(w/2-.35),1.0,d/2+.2,.09,.4,.3,0x4b5f66);
    if(hash(x,z,2)>.4){local(-dp*(w/2-1.2),7.6,d/2+.35,.8,.55,.5,0x8d9a98);local(-dp*(w/2-1.2),7.3,d/2+.35,.9,.06,.6,C.trim);}
    local(0,1.65,d/2+.08,w-1.0,2.5,.1,0x192d37);local(-w*.22,1.65,d/2+.15,w*.3,2.1,.06,C.amber,.65,.15,.05);local(w*.21,1.65,d/2+.15,w*.28,2.1,.06,0xa0ccc2,.35,.15,.05);
    bleed(world(0,1.4,d/2+.3),w-1,3,rot,false);
    local(0,1.45,d/2+.23,.15,2.8,.1,C.dark);
    // 帆布遮阳篷（四分之一圆筒），代替原来的黑板；下面一道流苏边
    batch(awningGeo,awningMats[idx%3],world(0,3.95,d/2+.05),[w+.2,.85,1.15],[0,rot,0]);
    local(0,3.1,d/2+1.18,w+.2,.12,.04,0xd9cbb2);
    const p=world(0,3.25,d/2+.21);sign(shop,w-.65,.85,...p,rot,shopColor,'#1c303a',58);
    // 霓虹灯管：招牌四周一圈发光细管
    for(const dy of [-.52,.52])local(0,3.25+dy,d/2+.24,w-.5,.045,.045,neon,2.2);
    for(const dx of [-1,1])local(dx*(w-.55)/2,3.25,d/2+.24,.045,1.08,.045,neon,2.2);
    // 侧挑招牌：竖排字，垂直于立面
    const bx=hash(x,z,3)>.5?1:-1;local(bx*(w/2-.9),5.2,d/2+.5,.06,.06,1.0,C.trim);
    const bp=world(bx*(w/2-.9),4.3,d/2+.95);const blade=sign(shop.replace(/\s/g,'').slice(0,4),.7,1.9,...bp,rot+Math.PI/2,shopColor,'#182a33',60,true);
    local(w*.2,h+.85,-d*.2,2.3,1.1,1.7,C.trim);local(w*.2,h+1.44,-d*.2,2.1,.1,1.5,C.dark);
    if(h>16){const p1=world(-w*.26,h+1.5,0);cyl(...p1,1.1,2.5,0x45616c);const p2=world(-w*.26,h+3,0);mesh(new T.ConeGeometry(1.3,.8,8),material(C.dark),...p2);const ant=world(w*.25,h+3.5,-d*.2);cyl(...ant,.035,6,C.trim);}
    if(reflections.length<REFLECT_SLOTS){const p2=world(0,2,d/2+1);reflections.push({x:p2[0]>0?9:-9,z:p2[2],color:new T.Color(shopColor)});}
  }
  const westNames=['NIGHT FERRY','雨宿 HOTEL','海 辺 食 堂','MIDNIGHT','レコード','港口书店','LATE COFFEE','青 波'];
  for(let i=0;i<8;i++){const z=-51+i*14.5,w=range(9.5,12.3),h=i===2?27:range(10,22);building(-37,z,w,12,h,Math.PI/2,facadeColors[i%6],westNames[i],i%3===0?'#86f0df':'#ffc3a0',i);}
  const eastNames=['小岛旅舍','STEREO 24','SEASIDE','雨后电影院','NEON ROOM','夜航','AM/PM'];
  for(let i=0;i<7;i++){const z=-51+i*16,w=range(10,14),h=i===1?28:range(11,24);building(40,z,w,12,h,-Math.PI/2,facadeColors[(i+3)%6],eastNames[i],i%2===0?'#ffa8b2':'#9ae2df',i+1);}
  // A luminous vertical hotel sign is the skyline's anchor.
  box(-29,20,-21,.65,12,3.7,C.dark);sign('雨\n宿',3.2,9,-28.65,20,-21,Math.PI/2,'#ff9b8e','#402c37',175);halo(-27.8,20,-21,C.pink,14,.12);light(-27,7,-21,0xff8f78,70,22);
  // Behind the waterfront, staggered silhouettes give the city depth.
  for(let i=0;i<20;i++){const x=-78+i*8,z=-87-range(0,17),h=range(11,36),w=range(5,9);box(x,h/2-1,z,w,h,range(8,14),i%3===0?0x35465e:0x263c55);box(x,h,z,w+.2,.3,9,0x4d6178);for(let f=4;f<h-2;f+=4)for(let j=-1;j<=1;j++){if(rnd()>.4)box(x+j*1.8,f,z+5,.6,1.1,.08,0xcaa780,.35);}}
  cyl(15,37,-100,.45,58,0x48627e);cyl(15,49,-100,5.1,2,0x688493);cyl(15,50.2,-100,4.5,.35,C.pink,1.3);cyl(15,51,-100,3.4,2,0x2b4b63);cyl(15,64,-100,.1,22,0x677b8c);halo(15,74,-100,C.pink,4,.45);

  // 路灯：弯臂、锥形灯罩、灯泡、罩沿一圈，灯与灯之间一根垂下来的电线
  const armGeo=new T.TubeGeometry(new T.QuadraticBezierCurve3(V(0,0,0),V(.5,.42,0),V(.95,.3,0)),8,.045,6,false);
  const lampRows={};
  function streetLamp(x,z){
    const dir=x<0?1:-1,hx=x+dir*.9;
    cyl(x,3.35,z,.095,6.7,0x779396,0,.5,.4);cyl(x,.2,z,.23,.4,C.dark);cyl(x,.55,z,.13,.3,0x5b7377);
    batch(armGeo,material(0x94a9a2,0,.5,.4),[x,6.4,z],[1,1,1],[0,dir>0?0:Math.PI,0]);
    batch(coneOpen,material(0x2b4048,0,.5,.3),[hx,6.72,z],[.42,.3,.42]);
    batch(torusGeo,material(0x94a9a2,0,.5,.4),[hx,6.58,z],[.42,.42,.42],[Math.PI/2,0,0]);
    batch(sphGeo,material(C.amber,2.6),[hx,6.5,z],[.13,.13,.13]);
    halo(hx,6.4,z,0xffc987,6,.3);
    const pool=mesh(new T.CircleGeometry(2.5,24),new T.MeshBasicMaterial({color:0xffc782,transparent:true,opacity:.045,depthWrite:false}),hx,.18,z,-Math.PI/2);pool.scale.set(1,1.4,1);pool.castShadow=false;
    if(reflections.length<REFLECT_SLOTS)reflections.push({x:x<0?-9:9,z,color:new T.Color(C.amber)});
    obstacle(x,z,.35,.35);
    (lampRows[x]||(lampRows[x]=[])).push([x,6.55,z]);
  }
  for(let z=-45;z<64;z+=15){streetLamp(-11.8,z);streetLamp(11.8,z+5);}
  for(const row of Object.values(lampRows))sagTube(row,.55,.022,material(0x22323c),10);
  for(const x of [-10.3,10.3])for(let z=-64;z<66;z+=4){if(Math.abs(z-55)<5||Math.abs(z+55)<5)continue;cyl(x,.75,z,.08,1.15,C.trim);box(x,1.27,z,.09,.06,4,C.trim);}
  // 系船柱：铸铁墩子加一圈箍
  for(const x of [-10.9,10.9])for(let z=-58;z<60;z+=12){if(Math.abs(z-55)<6||Math.abs(z+55)<6||Math.abs(z-25)<4||Math.abs(z+24)<4)continue;batch(cyl16,material(0x2a3a44,0,.45,.5),[x,.42,z],[.17,.5,.17]);batch(sphGeo,material(0x2a3a44,0,.45,.5),[x,.68,z],[.19,.12,.19]);batch(torusGeo,material(0x4e6068,0,.45,.5),[x,.5,z],[.19,.19,.19],[Math.PI/2,0,0]);}
  for(let i=0;i<13;i++){const z=-47+i*8;for(const x of [-17,17])box(x,.095,z,.07,.02,.75,0xd8c7a2);}
  // Furnished tram stops.
  function stop(x,z,rot){
    const world=(lx,ly,lz)=>[x+Math.cos(rot)*lx+Math.sin(rot)*lz,ly,z-Math.sin(rot)*lx+Math.cos(rot)*lz];
    const local=(lx,ly,lz,ww,hh,dd,col,gl=0,rough,metal)=>{const p=world(lx,ly,lz);box(...p,ww,hh,dd,col,rot,gl,rough,metal);};
    // 站台
    local(0,.2,0,1.9,.08,4.5,0x5a6d72);
    // 四根立柱、弧形玻璃雨棚、前沿檐沟
    for(const lx of [-.75,.75])for(const lz of [-2.7,2.7]){const p=world(lx,2.15,lz);cyl(...p,.06,4.3,C.trim,0,.5,.4);}
    for(const lz of [-2.7,2.7])local(0,4.3,lz,1.8,.08,.12,C.trim);
    batch(canopyGeo,glassMat,world(0,4.05,0),[3.6,3.6,6.4],[0,rot,0]);
    for(const lx of [-1.75,1.75])local(lx,4.0,0,.12,.1,6.4,0x2f4650);
    local(-1.82,3.92,0,.1,.14,6.4,0x2f4650);
    local(0,4.12,0,2.9,.04,5.7,C.cyan,0,.5);halo(...world(0,3.7,0),0x9ee0d0,7,.12);
    // 背面玻璃：三块，竖梃分隔，上下横档
    local(.8,2.55,0,.05,2.7,5.7,0x9fc7c9,0,.12,.2);for(const lz of [-2.85,-.95,.95,2.85])local(.8,2.55,lz,.09,2.7,.09,C.trim);
    local(.8,1.2,0,.1,.1,5.8,C.trim);local(.8,3.9,0,.1,.1,5.8,C.trim);
    // 条凳（五条板）、垃圾桶、时刻表灯箱
    for(let i=0;i<5;i++)local(-.1+i*.14,1.35,0,.11,.05,3.2,0x8b9e8f);
    for(const lz of [-1.4,1.4]){local(.05,1.1,lz,.6,.06,.08,C.dark);local(-.25,.75,lz,.06,.72,.06,C.dark);local(.35,.75,lz,.06,.72,.06,C.dark);}
    local(.1,1.85,0,.05,.9,3.2,0x7a8f86);
    local(.4,.55,1.85,.4,.7,.4,0x33464e);local(.4,.92,1.85,.44,.05,.44,C.trim);
    local(.86,2.5,-2.0,.08,.75,.55,0x1f2f38);local(.9,2.5,-2.0,.02,.6,.42,0xd7e8dc,.9);
    sign('末 班 電 車',4.8,.72,...world(0,4.1,3.08),rot,'#a7efda');
    sign('环 港 线 · 3 分 一 班',1.4,.5,...world(.93,3.4,.6),rot+Math.PI/2,'#cfe8dd','#1f333b',40);
    obstacle(x,z,1.8,4.2);
  }stop(-18.7,15,0);stop(18.6,-25,Math.PI);
  // The night market is open to walk through: pillars, stalls, stools and hanging lanterns.
  const tilt=.36;
  for(let i=0;i<5;i++){
    const x=29.9,z=-9+i*8.5,col=i%2?0xae514f:0x427f7d;
    // 人字形铁皮顶：两片斜坡，瓦楞是一根根顺坡向的细圆管；脊上一条压条
    for(const s of [-1,1]){
      batch(boxGeo,material(col),[x+s*1.75,3.78,z],[3.75,.07,5.7],[0,0,-s*tilt]);
      for(let k=0;k<19;k++)batch(cylGeo,material(0x8e9b97,0,.45,.5),[x+s*1.75,3.83,z-2.7+k*.3],[.05,3.7,.05],[0,0,Math.PI/2-s*tilt]);
    }
    box(x,4.42,z,.32,.14,5.8,0x2d3d45);box(x,3.04,z-2.85,7.3,.16,.14,col);box(x,3.04,z+2.85,7.3,.16,.14,col);
    // 前檐花边：一排小垂片，两色交替
    for(let k=0;k<12;k++)box(x-3.5,2.9,z-2.6+k*.47,.04,.28,.42,k%2?0xe9dcc0:col);
    for(const dx of [-3,3])for(const dz of [-2.35,2.35]){cyl(x+dx,1.6,z+dz,.07,3.2,0xb4aa89);obstacle(x+dx,z+dz,.2,.2);}
    box(x+1.6,1.18,z,1.3,1.6,4.7,C.wood);box(x+1.6,2.05,z,1.6,.18,4.9,0xbdaf88);obstacle(x+1.6,z,1.7,5.1);
    // 柜台围裙：竖条纹布
    for(let k=0;k<9;k++)box(x+.93,1.05,z-2.0+k*.5,.03,1.3,.5,k%2?0xe6d8b8:(i%2?0x8a3e3c:0x2e5f5d));
    box(x+.93,1.75,z,.04,.1,4.7,0x5a4038);
    for(let j=0;j<3;j++){cyl(x-.4,.8,z-1.5+j*1.5,.42,.16,0xc77c60);cyl(x-.4,.4,z-1.5+j*1.5,.06,.75,C.dark);obstacle(x-.4,z-1.5+j*1.5,.65,.65);cyl(x+1.6,2.22,z-1.5+j*1.5,.25,.15,C.cream);}
    // 柜台上的锅、后面的货箱、蒸汽
    batch(cyl16,material(0x4a5259,0,.4,.6),[x+1.5,2.32,z+.6],[.34,.32,.34]);batch(cyl16,material(0x2b3338,0,.4,.6),[x+1.5,2.5,z+.6],[.3,.04,.3]);
    halo(x+1.5,2.95,z+.6,0xffffff,1.6,.16);halo(x+1.5,3.3,z+.6,0xffffff,1.1,.08);
    for(const [dz,h] of [[-1.6,.5],[-1.0,.5],[1.3,.45],[1.9,.6]]){box(x+2.75,h/2+.02,z+dz,.5,h,.55,0x8a6d4b);box(x+2.75,h/2+.02,z+dz,.53,.05,.58,0x5b4630);}
    box(x+2.75,.02+.5+.25,z-1.3,.5,.5,.55,0x8a6d4b);
    // 一串纸灯笼挂在前檐下
    const lc=i%2?C.pink:C.amber;
    segment([x-3.1,3.0,z-2.6],[x-3.1,3.0,z+2.6],.012,0x22323c);
    for(let j=0;j<4;j++){const lz=z-1.95+j*1.3,ly=2.62;
      batch(sphGeo,material(lc,1.25),[x-3.1,ly,lz],[.22,.28,.22]);
      batch(cylGeo,material(0x3a2c28),[x-3.1,ly+.28,lz],[.08,.05,.08]);batch(cylGeo,material(0x3a2c28),[x-3.1,ly-.28,lz],[.07,.05,.07]);
      cyl(x-3.1,ly-.4,lz,.012,.2,0xd8b46a);
      if(!mobile||j%2===0)halo(x-3.1,ly,lz,lc,2.4,.16);
    }
    sign(['拉 面','深 夜 食 堂','海 风 酒 场','焼 鳥','花 与 咖 啡'][i],4.9,.6,x-3.1,3.35,z,-Math.PI/2,'#ffe0b5','#753d3d',62);
    sign(['拉面 800\n叉烧 +200','关东煮\n热酒 一杯','啤酒 · 烧酒\n下酒小菜','串烧 三串\n盐 / 酱','咖啡 · 花茶\n蛋糕'][i],1.0,.8,x+.82,1.55,z-1.9,-Math.PI/2,'#f4e2c4','#2a2f2c',34);
  }
  light(27,4,8,0xffad70,95,22);light(27,4,27,0xff9c72,80,20);
  // A festoon of warm lights crosses the market lane. 电线顺着灯泡走（原来是一根直线，灯泡悬在线下面）
  for(const z of [-3,22,42]){const pts=[];for(let x=14;x<=35;x+=1.05){pts.push(V(x,8.05-Math.sin((x-14)/21*Math.PI)*1.3,z));}
    const wire=mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts,false,'centripetal'),40,.02,4,false),material(0x182a38),0,0,0);wire.castShadow=false;
    for(const x of [14,35]){cyl(x,4,z,.05,8,0x3d5057);}
    for(let x=15;x<=34;x+=2.1){const y=8-Math.sin((x-14)/21*Math.PI)*1.3;cyl(x,y+.12,z,.035,.4,C.dark);batch(sphGeo,material(C.amber,2),[x,y-.1,z],[.11,.11,.11]);halo(x,y-.1,z,C.amber,1.7,.32);}}
  // Two small waterside jetties.
  for(const z of [25,-24]){
    box(-5.5,.18,z,9,.28,4.5,0x7d7164);for(let x=-9.5;x<-1;x+=.7)box(x,.345,z,.05,.02,4.5,0x3a4b4f);
    for(const x of [-9,-2])for(const dz of [-1.8,1.8])cyl(x,-.3,z+dz,.13,2,0x685e52);
    box(-3.5,.7,z+1.7,2.3,.6,.8,0x7e6250);obstacle(-3.5,z+1.7,2.3,.8);
    // 货箱、缆绳圈、系缆桩
    box(-2.4,.62,z-1.4,.6,.6,.6,0x8a6d4b);box(-2.4,.62,z-1.4,.63,.05,.63,0x5b4630);box(-3.05,.5,z-1.5,.5,.36,.5,0x6f5a44);
    batch(torusGeo,material(0xa89676),[-6.5,.36,z+1.5],[.32,.32,.32],[Math.PI/2,0,0]);batch(torusGeo,material(0xa89676),[-6.5,.42,z+1.5],[.26,.26,.26],[Math.PI/2,0,0]);
    batch(cyl16,material(0x3a3a3a,0,.45,.5),[-1.6,.5,z+1.6],[.12,.35,.12]);batch(sphGeo,material(0x3a3a3a,0,.45,.5),[-1.6,.7,z+1.6],[.14,.09,.14]);
  }
  // Promenade furniture, weathered planters and compact coastal trees.
  for(const x of [-15.5,15.5])for(const z of [-37,-6,35,45]){
    for(let i=0;i<4;i++)box(x-.45+i*.3,.6,z,.22,.05,2.4,C.wood);
    box(x+Math.sign(x)*.5,1.02,z,.13,.8,2.4,C.wood);for(const dz of [-.8,.8])box(x,.28,z+dz,.75,.5,.1,C.dark);obstacle(x,z,1.3,2.5);
  }
  /* 行道树。有外部模型就只记落点，几何交给 journeys/foliage.js 实例化；
     拿不到模型（npm test 的 Node 环境没有 XHR）才退回原来那套圆柱加多面体。
     树池那圈石沿两条路都保留 —— 它是街景的一部分，也是碰撞体。 */
  const treeSpots=[];
  function tree(x,z,s=1){
    box(x,.32,z,1.7*s,.6,1.7*s,0x596f73);            // 树池石沿
    obstacle(x,z,1.6*s,1.6*s);
    if(TREES){ treeSpots.push({x,y:.17,z,scale:s,rot:(x*0.7+z*0.31)%6.283,lean:0,phase:(x*0.13+z*0.29)%6.283}); return; }
    cyl(x,2*s,z,.14*s,4*s,0x697c77);
    const foliage=mesh(new T.IcosahedronGeometry(1,1),material(0x315c65),x,4*s,z);
    foliage.scale.set(1.25*s,2.3*s,1.25*s);
  }
  for(const z of [-47,-29,-10,8,30,46,62]){tree(-49,z,1.1);tree(49,z,.95);}
  /* 行道树交给共用的植被模块实例化。srgb:true —— 雨港是 sRGB 输出，
     和烟雨渡那套 Linear 管线不一样，贴图要打 sRGB 标记（见 foliage.js 的说明）。
     夜港的街树用针叶和杂树掺着来，一棵一种地轮。 */
  let foliage=null;
  if(TREES&&treeSpots.length){
    // 夜港：压暗压冷，原色的黄绿在这片深蓝里会跳出来
    foliage=window.AstraFoliage.create(T,scene,{srgb:true,assets:TREES,tint:0x6a7d82});
    const PARTS=['PineTree_1','NormalTree_3','PineTree_2','NormalTree_5'];
    const groups=new Map();
    treeSpots.forEach((sp,i)=>{const k=PARTS[i%PARTS.length];(groups.get(k)||groups.set(k,[]).get(k)).push(sp);});
    for(const [part,items] of groups) foliage.plant(part,items,{height:7.4});
  }
  // Scattered wet paving catches the shop lights. 水洼：近乎镜面，映的是天空和环境贴图，不再是发紫的一滩
  const puddleMats=[new T.MeshStandardMaterial({color:0x1c2a33,roughness:.04,metalness:.75,transparent:true,opacity:.62,depthWrite:false}),new T.MeshStandardMaterial({color:0x22313a,roughness:.05,metalness:.7,transparent:true,opacity:.55,depthWrite:false})];
  for(let i=0;i<42;i++){const x=(i%2?1:-1)*range(12,30),z=range(-62,62);const puddle=mesh(new T.CircleGeometry(range(.5,1.3),14),puddleMats[i%3?0:1],x,.19,z,-Math.PI/2);puddle.scale.y=range(1.4,3.2);puddle.castShadow=false;}
  // Seaside lighthouse, with its own connected headland.
  box(-22,-.48,70,16,1.4,18,0x354d57);box(-22,.25,70,16,.12,18,0x829295,0,0,.4,.1);
  cyl(-22,1,74,3.4,1.4,0x79908c);const tower=mesh(new T.CylinderGeometry(1.6,2.35,14,16),material(0xc9c3ab),-22,8.2,74);obstacle(-22,74,4.8,4.8);
  for(const y of [5,10.2])mesh(new T.CylinderGeometry(y===5?2.15:1.88,y===5?2.25:1.98,1.4,16),material(0xae6861),-22,y,74);
  // 门（朝南，面向栈道）、三扇竖长小窗、塔基一圈石阶
  box(-22,2.6,76.25,1.0,1.9,.2,0x2a3238);box(-22,3.6,76.28,1.2,.16,.24,0x8d8a7c);for(const dx of [-.55,.55])box(-22+dx,2.6,76.28,.12,1.9,.24,0x8d8a7c);
  for(const [y,a] of [[6.3,.5],[9,-.4],[12.5,.3]])box(-22+Math.sin(a)*2.05,y,74+Math.cos(a)*2.05,.22,.7,.12,0xe8d3a1,a,.9);
  cyl(-22,1.55,74,3.0,.3,0x6f8380);
  cyl(-22,15.5,74,2.6,.45,C.dark);cyl(-22,17,74,1.55,2.5,C.amber,2);
  for(let a=0;a<Math.PI*2;a+=Math.PI/4){cyl(-22+Math.sin(a)*1.64,17,74+Math.cos(a)*1.64,.07,2.8,C.dark);}
  mesh(new T.ConeGeometry(2.35,1.8,12),material(C.dark),-22,19,74);cyl(-22,20.2,74,.065,1.5,C.trim);halo(-22,17,74,C.amber,11,.4);light(-22,17,74,0xffc789,100,26);
  for(let a=0;a<Math.PI*2;a+=Math.PI/6)cyl(-22+Math.sin(a)*2.55,16.2,74+Math.cos(a)*2.55,.04,1.2,C.trim);
  // 平台栏杆：两圈扶手
  for(const y of [16.75,16.3])batch(torusGeo,material(C.trim),[-22,y,74],[2.55,2.55,2.55],[Math.PI/2,0,0]);
  const lighthouseBeam=new T.Group();lighthouseBeam.position.set(-22,17,74);scene.add(lighthouseBeam);
  const beamMat=new T.MeshBasicMaterial({color:0xffdea4,transparent:true,opacity:.035,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide});const beam=mesh(new T.ConeGeometry(8,70,16,1,true),beamMat,0,0,35,Math.PI/2,0,0,lighthouseBeam);beam.castShadow=false;beam.receiveShadow=false;
  sign('海 角 / 1978',3,.6,-22,2.8,76.2,0,'#ffdcab');
  // 海角四周的礁石：三种揉过的二十面体，落在可走的矩形之外（x<-29.2 或 z>78）
  const rockGeos=[0,1,2].map(k=>{const g=new T.IcosahedronGeometry(1,1),p=g.attributes.position;for(let i=0;i<p.count;i++){const j=1+(hash(i,k,7)-.5)*.5;p.setXYZ(i,p.getX(i)*j,p.getY(i)*(.55+hash(i,k,8)*.3),p.getZ(i)*j);}g.computeVertexNormals();return g;});
  const rockMat=material(0x3f5058,0,.85,.05);
  [[-31.2,63,1.6],[-32.4,67.5,2.1],[-31.6,72,1.4],[-32.8,76,2.4],[-30.4,79.6,1.7],[-26,80.4,2.0],[-21,80.2,1.5],[-16.5,80.6,2.2],[-13.4,77,1.3],[-13.2,70,1.1],[-30.5,60.6,1.2],[-18,81.8,1.0]].forEach(([x,z,s],i)=>batch(rockGeos[i%3],rockMat,[x,-.35+s*.15,z],[s,s*.75,s*.85],[0,hash(x,z,9)*6.28,0]));

  // Tram model: a coral body, dark running gear, lit windows and roof hardware.
  function modelBox(parent,x,y,z,w,h,d,col,glow=0){return mesh(new T.BoxGeometry(w,h,d),material(col,glow),x,y,z,0,0,0,parent);}
  const tram=new T.Group();scene.add(tram);
  modelBox(tram,0,1.25,0,2.7,1.8,7.7,0xd66a5e);modelBox(tram,0,2.35,0,2.68,1.05,7.5,0xdee0c2);modelBox(tram,0,.45,0,2.35,.45,7.4,C.dark);modelBox(tram,0,3,0,2.9,.25,8,0x32616a);
  for(const side of [-1,1]){for(let j=-2;j<=2;j++){modelBox(tram,side*1.355,2.28,j*1.35,.035,.83,1.06,0xffd999,.8);modelBox(tram,side*1.38,1.5,j*1.35,.025,.08,1.07,0xe9c398);}for(const zz of [-2.7,2.7]){const wh=mesh(new T.CylinderGeometry(.42,.42,.2,12),material(C.dark),side*1.17,.42,zz,0,0,Math.PI/2,tram);}}
  for(const zz of [-3.87,3.87]){modelBox(tram,0,2.32,zz,2,.8,.04,0xaed9cb,.5);modelBox(tram,0,1.52,zz*1.006,2.5,.14,.06,0xf5d99d);for(const x of [-.8,.8]){const head=mesh(new T.SphereGeometry(.15,8,6),material(C.amber,3),x,1.12,zz,0,0,0,tram);halo(x,1.12,zz,C.amber,3,.3,tram);}}
  modelBox(tram,0,3.23,0,1.9,.18,3.3,C.dark);
  const pantograph=mesh(new T.TorusGeometry(.8,.035,4,4),material(0x99a39c),0,4.1,0,0,Math.PI/2,Math.PI/4,tram);pantograph.scale.y=1.1;
  const tramGlow=new T.PointLight(C.amber,mobile?0:.7,8,1.5);tramGlow.position.set(0,2,0);tram.add(tramGlow);
  // 有模型（blender/tools/build_trams.py）就把上面拼的方块车身藏掉、换模型；只有 Node 测试里没有模型。
  // 模型沿 X 建，旧车沿 Z：绕 Y 转 -90°（车两头对称）。车里那盏暖灯留着
  if(vehicles&&vehicles['tram_rainport.glb']){for(const ch of tram.children)if(!ch.isLight)ch.visible=false;const m=vehicles['tram_rainport.glb'].clone(true);m.rotation.y=-Math.PI/2;m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});tram.add(m);}
  // A moored canal boat and the slow night ferry out at sea.
  function makeBoat(ferry=false){const g=new T.Group();scene.add(g);
    // 有模型就用模型（blender/tools/build_canal_boats.py），沿 X 建的船头转到 +Z，和渡轮的航向算法对上
    const model=vehicles&&vehicles[ferry?'rainport_ferry.glb':'rainport_boat.glb'];
    if(model){const m=model.clone(true);m.rotation.y=-Math.PI/2;m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});g.add(m);return g;}
   const hull=mesh(new T.CylinderGeometry(1.8,1.3,.85,8),material(ferry?0x3e7980:0x9c655d),0,0,0,0,Math.PI/8,0,g);hull.scale.z=ferry?3.1:2.4;modelBox(g,0,.55,.6,2.4,.5,5,0xc6b79b);modelBox(g,0,1.4,1,2.1,1.25,2.5,0xbdb89b);modelBox(g,0,2.12,1,2.6,.17,3.2,0x3a6875);for(const x of [-1.07,1.07])modelBox(g,x,1.55,1,.04,.55,1.8,C.amber,.5);modelBox(g,0,1.6,-.28,1.5,.5,.05,C.cyan,.3);return g;}
  const boat=makeBoat();boat.position.set(.5,-.35,25);boat.rotation.y=.09;const ferry=makeBoat(true);ferry.scale.setScalar(1.5);
  // People are articulated, with geometric umbrellas and a clear silhouette.
  const umbrellaGeo=new T.ConeGeometry(.92,.45,10,1,true);
  function person(color,umbrellaColor){
    const g=new T.Group();const body=modelBox(g,0,1.13,0,.5,.72,.32,color);body.rotation.z=.025;
    const head=mesh(new T.IcosahedronGeometry(.2,1),material(0xd3ac8b),0,1.75,0,0,0,0,g);
    const legs=[modelBox(g,-.14,.46,0,.17,.67,.18,C.dark),modelBox(g,.14,.46,0,.17,.67,.18,C.dark)];
    for(const x of [-.31,.31])modelBox(g,x,1.14,.03,.14,.6,.17,color);
    // Keep every umbrella part together so dry weather leaves no floating pole or tip.
    const umbrella=new T.Group();g.add(umbrella);
    modelBox(umbrella,.25,1.93,.06,.026,1.35,.026,0xb1b2a1);
    const canopy=mesh(umbrellaGeo,material(umbrellaColor),.23,2.65,.05,0,0,0,umbrella);canopy.material.side=T.DoubleSide;
    mesh(new T.SphereGeometry(.06,6,4),material(C.dark),.23,2.91,.05,0,0,0,umbrella);
    g.userData.legs=legs;g.userData.umbrella=umbrella;return g;
  }
  const player=person(0xf08767,0xe5d9aa);player.scale.setScalar(1.25);scene.add(player);player.visible=false;
  const npcs=[];for(let i=0;i<(mobile?15:27);i++){const side=i%2?1:-1,x=side*(i%3===0?17.7:13.5),z=range(-49,49),dir=i%4<2?1:-1;const g=person([0x737f9b,0xa0786e,0x65918c,0xb08b66][i%4],[0x769aa0,0xbb8e8b,0xd8b880,0x587584][i%4]);g.position.set(x,.17,z);g.rotation.y=dir>0?0:Math.PI;scene.add(g);npcs.push({g,x,z,dir,speed:range(.45,.95),phase:range(0,8)});}
  // Small mooring posts and a navigational buoy finish the harbor silhouette.
  const buoy=new T.Group();scene.add(buoy);modelBox(buoy,0,0,0,1.2,.35,1.2,0xbd645d);modelBox(buoy,0,1,0,.15,2,.15,0xbd645d);halo(0,2.05,0,0xff8c78,3,.5,buoy);buoy.position.set(15,-.2,86);

  for(const {geo,mat,items} of batches.values()){const im=new T.InstancedMesh(geo,mat,items.length);items.forEach((m,i)=>im.setMatrixAt(i,m));im.castShadow=!mat.userData.noShadow;im.receiveShadow=!mat.userData.noShadow;if(mat.userData.noShadow)im.renderOrder=2;scene.add(im);}
  // 光晕合成一个实例网格（见 halo）
  const haloMesh=new T.InstancedMesh(planeGeo,new T.MeshBasicMaterial({map:glowTexture,transparent:true,blending:T.AdditiveBlending,depthWrite:false,fog:false,toneMapped:false}),haloItems.length);
  haloItems.forEach((h,i)=>{dummy.position.copy(h.p);dummy.scale.set(h.s,h.s,1);dummy.rotation.set(0,0,0);dummy.updateMatrix();haloMesh.setMatrixAt(i,dummy.matrix);haloMesh.setColorAt(i,h.c);});
  haloMesh.castShadow=false;haloMesh.receiveShadow=false;haloMesh.frustumCulled=false;haloMesh.renderOrder=3;scene.add(haloMesh);
  // Long horizontal highlights break up the reflections as the sea moves.
  const reflectPositions=Array.from({length:REFLECT_SLOTS},(_,i)=>new T.Vector2(reflections[i]?.x??500,reflections[i]?.z??500));
  const reflectColors=Array.from({length:REFLECT_SLOTS},(_,i)=>reflections[i]?.color??new T.Color(0));
  const waterMat=new T.ShaderMaterial({uniforms:{uTime:{value:0},uDay:{value:0},uCam:{value:new T.Vector3()},uLightPos:{value:reflectPositions},uLightColor:{value:reflectColors}},vertexShader:`varying vec3 vWorld; uniform float uTime; void main(){vec3 p=position;p.z+=sin(p.x*.36+uTime*.65)*.07+sin(p.y*.28+uTime*.48)*.07;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,fragmentShader:`precision highp float; varying vec3 vWorld;uniform float uTime;uniform float uDay;uniform vec3 uCam;uniform vec2 uLightPos[${REFLECT_SLOTS}];uniform vec3 uLightColor[${REFLECT_SLOTS}];void main(){vec2 p=vWorld.xz;float w=sin(p.y*2.6+sin(p.x*.5+uTime)*1.8+uTime*1.8);float rip=sin(p.x*.5+p.y*4.-uTime*1.5)*sin(p.y*1.7+uTime*.5);vec3 col=mix(vec3(.012,.052,.083),vec3(.025,.16,.2),uDay);col+=vec3(.012,.03,.04)*(w*.5+.5);float highlights=pow(max(0.,w),9.)*.6+pow(max(0.,rip),7.)*.45;for(int i=0;i<${REFLECT_SLOTS};i++){vec2 d=p-uLightPos[i];d.x+=sin(d.y*.8+uTime)*.3;float shape=exp(-abs(d.x)*.55)*exp(-abs(d.y)*.13);col+=uLightColor[i]*shape*(.1+highlights)*.52*(1.-uDay*.3);}float moon=exp(-abs(p.x+18.+sin(p.y*.2+uTime)*1.2)*.05)*smoothstep(8.,110.,p.y);col+=vec3(.15,.21,.24)*moon*highlights*.25;float edge=exp(-abs(abs(p.x)-9.5)*2.)*step(abs(p.y),66.);col+=vec3(.025,.11,.11)*edge;float dist=length(uCam-vWorld);col=mix(col,mix(vec3(.045,.07,.115),vec3(.12,.2,.28),uDay),smoothstep(150.,450.,dist));gl_FragColor=vec4(col,1.);}`,side:T.DoubleSide});
  const water=mesh(new T.PlaneGeometry(1200,1200,120,120),waterMat,0,-.55,0,-Math.PI/2);water.castShadow=false;water.receiveShadow=false;water.renderOrder=-1;
  // Night sky, a soft moon and mist-softened mountainous islands.
  const moon=mesh(new T.SphereGeometry(7.6,32,20),new T.MeshBasicMaterial({color:0xffe8bd}),-61,72,-116);moon.castShadow=false;halo(-61,72,-116,0xb2dbea,39,.18);
  for(let i=0;i<9;i++){const x=-210+i*51;const m=mesh(new T.ConeGeometry(range(32,58),range(24,55),5),material(0x243b57),x,5,-175);m.scale.z=.7;}
  const starPositions=[];for(let i=0;i<170;i++){const a=range(0,Math.PI*2),r=range(180,280);starPositions.push(Math.sin(a)*r,range(40,190),Math.cos(a)*r);}
  const starGeo=new T.BufferGeometry();starGeo.setAttribute('position',new T.Float32BufferAttribute(starPositions,3));const stars=new T.Points(starGeo,new T.PointsMaterial({color:0xbdcfe5,size:.48,transparent:true,opacity:.55,sizeAttenuation:true,depthWrite:false}));scene.add(stars);

  const rainCount=mobile?700:1400,rainCoords=new Float32Array(rainCount*6);const rainGeo=new T.BufferGeometry();rainGeo.setAttribute('position',new T.BufferAttribute(rainCoords,3));const rainMat=new T.LineBasicMaterial({color:0x9bbbbf,transparent:true,opacity:.22,depthWrite:false});const rain=new T.LineSegments(rainGeo,rainMat);rain.frustumCulled=false;scene.add(rain);const rainSeeds=Array.from({length:rainCount},()=>[range(-70,70),range(0,50),range(-70,70),range(.6,1.8)]);
  /* 雨点落地的涟漪：一批圆环跟着玩家附近的地面，按哈希各自错开周期，扩开就重新落一处。
     种子在雨丝之后才抽（主序列到这里已经结束，后面没有别的东西了）。 */
  const splashCount=mobile?30:90,splash=new T.InstancedMesh(ringGeo,new T.MeshBasicMaterial({color:0xbfd6da,transparent:true,opacity:.14,depthWrite:false,side:T.DoubleSide}),splashCount);
  splash.castShadow=false;splash.receiveShadow=false;splash.frustumCulled=false;scene.add(splash);
  const splashState=Array.from({length:splashCount},(_,i)=>({x:0,z:0,cycle:-1,off:hash(i,3,11),spd:.9+hash(i,5,12)*.8}));
  const RAD=7;

  function setRain(rainOn){
    const visible=Boolean(rainOn);
    rain.visible=visible;splash.visible=visible;
    player.userData.umbrella.visible=visible;
    for(const n of npcs)n.g.userData.umbrella.visible=visible;
  }

  function update(t,dt,{rainOn,day,camera,focus}){
    waterMat.uniforms.uTime.value=t;waterMat.uniforms.uDay.value=day;waterMat.uniforms.uCam.value.copy(camera.position);
    const tramU=(.52+t*.0125)%1,p=track.getPointAt(tramU),tangent=track.getTangentAt(tramU);tram.position.copy(p);tram.rotation.y=Math.atan2(tangent.x,tangent.z);
    boat.position.y=-.22+Math.sin(t*1.2)*.09;boat.rotation.z=Math.sin(t*.9)*.03;ferry.position.set(45+Math.sin(t*.014)*68,-.18+Math.sin(t*.8)*.12,105+Math.cos(t*.014)*22);ferry.rotation.y=Math.atan2(Math.cos(t*.014)*68,-Math.sin(t*.014)*22);
    buoy.position.y=-.2+Math.sin(t*1.4)*.12;lighthouseBeam.rotation.y=t*.12;
    for(const n of npcs){n.z+=n.dir*n.speed*dt;if(n.z>48){n.z=48;n.dir=-1;}if(n.z<-48){n.z=-48;n.dir=1;}n.g.position.set(n.x,.15,n.z);n.g.rotation.y=n.dir>0?0:Math.PI;const step=Math.sin(t*4+n.phase)*.38;n.g.userData.legs[0].rotation.x=step;n.g.userData.legs[1].rotation.x=-step;}
    setRain(rainOn);
    if(rainOn){const cx=focus.x,cz=focus.z;for(let i=0;i<rainCount;i++){const a=rainSeeds[i],y=((a[1]-t*17)%50+50)%50,o=i*6,x=a[0]+cx+(50-y)*.1,z=a[2]+cz;rainCoords[o]=x;rainCoords[o+1]=y;rainCoords[o+2]=z;rainCoords[o+3]=x+.14;rainCoords[o+4]=y-a[3];rainCoords[o+5]=z;}rainGeo.attributes.position.needsUpdate=true;
      for(let i=0;i<splashCount;i++){const s=splashState[i],ph=t*s.spd+s.off,cyc=Math.floor(ph),f=ph-cyc;
        if(cyc!==s.cycle){s.cycle=cyc;s.x=cx+(hash(i,cyc,1)-.5)*2*RAD;s.z=cz+(hash(i,cyc,2)-.5)*2*RAD;s.on=isLand(s.x,s.z);}
        const r=s.on?(.05+f*.22):0;dummy.position.set(s.x,.2,s.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(r,r,r);dummy.updateMatrix();splash.setMatrixAt(i,dummy.matrix);}
      splash.instanceMatrix.needsUpdate=true;}
    // 光晕转向相机
    if(haloItems.length){const q=camera.quaternion;for(let i=0;i<haloItems.length;i++){const h=haloItems[i];dummy.position.copy(h.p);dummy.quaternion.copy(q);dummy.scale.set(h.s,h.s,1);dummy.updateMatrix();haloMesh.setMatrixAt(i,dummy.matrix);}haloMesh.instanceMatrix.needsUpdate=true;}
    if(foliage)foliage.tick(t);
    stars.material.opacity=.5*(1-day);moon.material.color.set(day?0xf2d7ac:0xffe8bd);
  }
  return {colliders,track,tram,player,npcs,waterMat,setRain,update,glows,materialCount:matCache.size};
}

function isLand(x,z){
  const bank=(Math.abs(x)>=10.65&&Math.abs(x)<=53&&z>=-65&&z<=65);
  const bridge=Math.abs(x)<=24&&(Math.abs(z-55)<3.3||Math.abs(z+55)<3.3);
  const jetty=x>=-10.8&&x<=-1.5&&(Math.abs(z-25)<=1.65||Math.abs(z+24)<=1.65);
  const headland=x>=-29.2&&x<=-14.8&&z>=61&&z<=78;
  return bank||bridge||jetty||headland;
}

function canStand(x,z,colliders,radius=.43){
  if(!isLand(x,z)||!isLand(x-radius,z)||!isLand(x+radius,z)||!isLand(x,z-radius)||!isLand(x,z+radius))return false;
  return !colliders.some(c=>x>c.minX-radius&&x<c.maxX+radius&&z>c.minZ-radius&&z<c.maxZ+radius);
}

function moveWithCollision(position,dx,dz,colliders){
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.2));
  for(let i=0;i<steps;i++){
    if(canStand(position.x+dx/steps,position.z,colliders))position.x+=dx/steps;
    if(canStand(position.x,position.z+dz/steps,colliders))position.z+=dz/steps;
  }
}

return {createWorld,PLACES,canStand,moveWithCollision,isLand};
};
