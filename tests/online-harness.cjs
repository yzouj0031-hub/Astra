const fs=require('fs'),path=require('path'),vm=require('vm'),{webcrypto}=require('crypto');
class Element {
 constructor(){this.value='';this.style={};this.dataset={};this.children=[];this.hidden=false;this.handlers={};this._text='';}
 set textContent(value){this._text=value;this.children=[];}get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
 appendChild(node){node.parent=this;this.children.push(node);return node;}
 get firstChild(){return this.children[0];}remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);}
 addEventListener(event,fn){this.handlers[event]=fn;}setAttribute(){}focus(){}showModal(){this.open=true;}close(){this.open=false;this.handlers.close?.();}
}
function createHarness(supabase,name='Tester'){
 const nodes=new Map(),changes=[],departed=[];let now=0;
 const document={getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement:()=>new Element(),createTextNode:text=>({textContent:text})};
 const state={pose:{x:640,y:4.2,z:-100,heading:0,speed:0,kind:'walk',region:'harbor'}};
 const context={console,URL,Uint8Array,crypto:webcrypto,performance:{now:()=>now},document,location:{protocol:'https:',href:'https://example.invalid/'},history:{replaceState(){}},setTimeout,clearTimeout,addEventListener(){},supabase};context.window=context;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','online.js'),'utf8'),context);
 const online=context.AstraOnline.init({getPose:()=>state.pose,onPeer:p=>changes.push(p),onPeerLeave:id=>departed.push(id)});
 nodes.get('online-name').value=name;
 return {context,nodes,changes,departed,state,online,advance(ms=120){now+=ms;online.update();},async join(code){nodes.get('online-room-code').value=code;await nodes.get('online-join').onclick();},chat(text){nodes.get('online-chat-input').value=text;nodes.get('online-chat-send').onclick();}};
}
// Deterministic room transport: run the real client lifecycle while controlling delivery and failure.
function createHub(){
 const channels=[],sent=[];
 const members=topic=>channels.filter(c=>c.topic===topic&&c.active&&c.payload);
 const sync=topic=>{for(const c of members(topic))c.emit('presence:sync');};
 const lib={createClient(){return {channel(topic){
  const handlers={};
  const channel={topic,active:false,payload:null,tracks:[],trackResult:'ok',
   on(type,filter,fn){handlers[type+':'+filter.event]=fn;return this;},
   subscribe(fn){this.subscriber=fn;queueMicrotask(()=>this.status('SUBSCRIBED'));return this;},
   status(status){this.active=status==='SUBSCRIBED';if(!this.active)this.payload=null;const result=this.subscriber(status);sync(topic);return result;},
   emit(event,payload){handlers[event]?.(payload);},
   async track(payload){this.tracks.push(payload);if(this.trackResult!=='ok')return this.trackResult;this.payload=payload;sync(topic);return 'ok';},
   presenceState(){return Object.fromEntries(members(topic).map(c=>[c.payload.id,[c.payload]]));},
   async send(message){sent.push({channel:this,message});for(const other of channels)if(other!==this&&other.active&&other.topic===topic)other.emit('broadcast:'+message.event,{payload:message.payload});return 'ok';}
  };channels.push(channel);return channel;
 },async removeChannel(channel){channel.active=false;channel.payload=null;channel.subscriber?.('CLOSED');sync(channel.topic);}};}};
 return {lib,channels,sent,sync};
}
module.exports={createHarness,createHub};
