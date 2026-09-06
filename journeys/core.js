/* Shared region navigation and collision rules; no browser or renderer dependency. */
(function(root){
'use strict';
const REGIONS={
 rainport:{name:'雨港 · 夜航',subtitle:'末班电车、深夜市场与海角灯塔',color:'#72aaa7',spawn:{x:-14,z:28},stops:[['canal','灯火沿岸',-14,28],['market','深夜市场',20,5],['lighthouse','海角灯塔',-22,68]]},
 watertown:{name:'烟雨渡',subtitle:'沿河慢行，进茶馆，划一段乌篷船',color:'#c8aa77',spawn:{x:-40,z:9},stops:[['dock','乌篷渡口',-40,9],['tea','听雨茶馆',21,9],['hill','山寺古道',-112,72]]},
 temple:{name:'静山寺 · 山门试炼',subtitle:'拜访守山人，挑战石玉守卫',color:'#8ca786',spawn:{x:0,z:10},stops:[['gate','庭院入口',0,10],['warden','守山人',4,1]]}
};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function inside(x,z,r,pad=0){return x>r.minX-pad&&x<r.maxX+pad&&z>r.minZ-pad&&z<r.maxZ+pad;}
function canStand(x,z,rects,land=()=>true,radius=.4){
 for(const [a,b] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]])if(!land(x+a,z+b))return false;
 return !rects.some(r=>inside(x,z,r,radius));
}
function move(pos,dx,dz,rects,land=()=>true,radius=.4,people=[]){
 // Test the swept path in short steps, including diagonal movement along narrow walls.
 const solids=people.length?rects.concat(people.map(p=>({minX:p.x-(p.radius||.3),maxX:p.x+(p.radius||.3),minZ:p.z-(p.radius||.3),maxZ:p.z+(p.radius||.3)}))):rects;
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
 for(let i=0;i<steps;i++){
  if(canStand(pos.x+dx/steps,pos.z,solids,land,radius))pos.x+=dx/steps;
  if(canStand(pos.x,pos.z+dz/steps,solids,land,radius))pos.z+=dz/steps;
 }
 return pos;
}
function safeSpot(x,z,rects,land=()=>true,radius=.4){
 if(canStand(x,z,rects,land,radius))return {x,z};
 for(let d=.6;d<=12;d+=.6)for(let i=0;i<24;i++){
  const px=x+Math.sin(i*Math.PI/12)*d,pz=z+Math.cos(i*Math.PI/12)*d;
  if(canStand(px,pz,rects,land,radius))return {x:px,z:pz};
 }
 return null;
}
function readProgress(storage){
 try{const raw=JSON.parse(storage.getItem('astra-journey-v1')||'{}');return {visited:Array.isArray(raw.visited)?raw.visited.filter(k=>REGIONS[k]):[],stamps:Array.isArray(raw.stamps)?raw.stamps.filter(k=>['market','tea','boat','warden'].includes(k)):[],positions:raw.positions&&typeof raw.positions==='object'?raw.positions:{}};}catch{return {visited:[],stamps:[],positions:{}};}
}
function saveProgress(storage,p){try{storage.setItem('astra-journey-v1',JSON.stringify(p));return true;}catch{return false;}}
function validPosition(p){return p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<1000&&Math.abs(p.z)<1000;}
root.AstraJourneyCore={REGIONS,clamp,inside,canStand,move,safeSpot,readProgress,saveProgress,validPosition};
})(typeof window==='undefined'?globalThis:window);
