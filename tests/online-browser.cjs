const assert=require('assert');
const {createRequire}=require('module');
const requireFrom=createRequire(__filename);
const playwright=requireFrom(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 try{
  for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
   const page=await browser.newPage({viewport});const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(()=>{
    const listeners={};let tracked=null;
    const channel={
     on(type,filter,callback){listeners[type+':'+filter.event]=callback;return this;},
     subscribe(callback){setTimeout(()=>callback('SUBSCRIBED'),0);return this;},
     async track(value){tracked=value;listeners['presence:sync']?.();},
     async untrack(){tracked=null;},
     presenceState(){return tracked?{self:[tracked]}:{};},
     async send(){return 'ok';},
     emitPose(payload){listeners['broadcast:pose']?.({payload});}
    };
    window.supabase={createClient(){window.__astraFakeChannel=channel;return{channel(){return channel;},async removeChannel(){}};}};
   });
   await page.goto('http://127.0.0.1:8766/',{waitUntil:'domcontentloaded'});
   await page.click('#online-button');await page.fill('#online-name','海风');await page.click('#online-create');
   await page.waitForFunction(()=>!document.querySelector('#online-room').hidden);
   const code=(await page.textContent('#online-current-code')).trim();assert.match(code,/^[A-HJ-NP-Z2-9]{8}$/);assert.equal(await page.textContent('#online-count'),'1 人在线');
   await page.fill('#online-chat-input','一起去港口');await page.click('#online-chat-send');assert((await page.textContent('#online-chat-log')).includes('一起去港口'));
   await page.evaluate(()=>window.__astraFakeChannel.emitPose({id:'remote_player_01',name:'远方旅人',color:2,pose:{x:640,y:4.2,z:-100,heading:0,speed:2,kind:'walk',region:'harbor'}}));
   await page.waitForFunction(()=>document.querySelector('#online-count').textContent==='2 人在线');assert((await page.textContent('#online-peer-list')).includes('远方旅人'));
   const box=await page.locator('#online-dialog').boundingBox();assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1,'Online dialog fits viewport');
   await page.click('#online-leave');assert.equal(await page.getAttribute('#online-room','hidden'),'');assert.deepEqual(errors,[]);
   await page.close();console.log(`${viewport.width}x${viewport.height}: online room, chat, remote presence and responsive dialog passed`);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
