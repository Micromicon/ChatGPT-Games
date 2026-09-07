import * as T from './vendor/three.module.js';
import {buildWorld} from './world.js';
import {initialState,restore,reduce,dialogue,objective,memories} from './story.js';

const $=id=>document.getElementById(id);
const KEY='station-chapter-one-v1';
const touch=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
if(touch)document.body.classList.add('is-touch');
let saved=null;try{saved=JSON.parse(localStorage.getItem(KEY));}catch{}
let state=restore(saved?.story);
if(state.departed){state=initialState();saved=null;}
let renderer,scene,camera,world;
let mode='start',started=false,time=0,rememberedAt=state.name?0:null,cutsceneTime=0,current=null,sensitivity=1,sound=true;
const player={x:0,z:19,yaw:0,pitch:.055};
const keys=new Set(),joy={x:0,y:0};
let lookPointer=null,lookX=0,lookY=0,joystickPointer=null,toastTimer=null,subtitleTimer=null;
let saveAccumulator=0,stepAccumulator=0,lastTargetTime=0;
const direction=new T.Vector3(),toTarget=new T.Vector3();

function showError(error){
  console.error(error);$('error').hidden=false;
  $('error-text').textContent='Браузер не смог запустить 3D-сцену. Попробуй открыть ссылку в Chrome или на компьютере. Проверь, включено ли аппаратное ускорение.';
}
function persist(){
  try{localStorage.setItem(KEY,JSON.stringify({story:state,player:{...player},settings:{sound,sensitivity}}));}catch{}
}
function notify(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3700);}
function subtitle(message,duration=6000){clearTimeout(subtitleTimer);$('subtitle').textContent=message;subtitleTimer=setTimeout(()=>$('subtitle').textContent='',duration);}
function clearMovement(){keys.clear();joy.x=joy.y=0;joystickPointer=null;$('stick').style.transform='translate(-50%,-50%)';lookPointer=null;}
function releasePointer(){clearMovement();if(document.pointerLockElement)document.exitPointerLock();}
function requestPointer(){if(!touch&&mode==='play'&&$('world').requestPointerLock){try{const result=$('world').requestPointerLock();if(result?.catch)result.catch(()=>{});}catch{}}}
function activePanel(){return {'dialogue':$('dialogue'),'journal':$('journal'),'pause':$('pause'),'memory':$('memory'),'name':$('name-screen')}[mode];}
function setMode(next){
  mode=next;
  for(const [m,id] of [['dialogue','dialogue'],['journal','journal'],['pause','pause'],['memory','memory'],['name','name-screen']])$(id).hidden=next!==m;
  const play=next==='play';$('crosshair').hidden=!play;$('touch-controls').hidden=!(play&&touch);$('desktop-hint').hidden=!(play&&!touch);$('interact').hidden=true;
  if(!play)releasePointer();
  else{$('world').focus({preventScroll:true});requestPointer();}
  if(next==='pause'||next==='journal')setTimeout(()=>activePanel()?.querySelector('button')?.focus({preventScroll:true}),0);
}
function dispatch(event){
  const previous=state;state=reduce(state,event);persist();refreshHud();
  if(event.type==='take'&&state.held.length>previous.held.length){notify('С собой: '+memories[event.id].item);audio.chime([392,523],.12);}
  if(event.type==='memory'&&state.memories.length>previous.memories.length){
    setMode('memory');const m=memories[event.id];$('memory-number').textContent=state.memories.length+' / 3';$('memory-title').textContent=m.title;$('memory-text').textContent=m.text;$('memory-close').focus({preventScroll:true});audio.chime([261.63,329.63,392],.45);
  }
  if(event.type==='name'&&!previous.name&&state.name){rememberedAt=time;audio.chime([196,246.94,293.66],.6);subtitle('Стрелка дрогнула. Последняя секунда наконец закончилась.',7000);notify('Ты вспомнил своё имя. Первый поезд уходит.');}
  if(event.type==='admit'&&!previous.admitted&&state.admitted){notify('Путь на перрон открыт');audio.chime([293.66,392],.35);}
  if(event.type==='depart'&&!previous.departed&&state.departed)beginDeparture();
}
function refreshHud(){
  $('objective-text').textContent=objective(state);$('memory-count').textContent=state.memories.length+'/3';
  $('time-caption').textContent=state.name?'ПОСЛЕДНИЙ ПОЕЗД · 14:05':'ВРЕМЯ ОСТАНОВИЛОСЬ';
  $('place').textContent=player.z<-13?'ПЕРРОН · ПЛАТФОРМА 2':'ЗАЛ ОЖИДАНИЯ';
}
function showDialogue(id){
  if(id==='exit')dispatch({type:'exit'});
  const data=dialogue(id,state);setMode('dialogue');
  $('speaker').textContent=data.title;$('speaker-role').textContent=data.role;$('dialogue-text').textContent=data.text;
  $('choices').replaceChildren();
  data.options.forEach((o,i)=>{
    const b=document.createElement('button');b.type='button';
    const key=document.createElement('small');key.textContent=String(i+1).padStart(2,'0');b.append(key,document.createTextNode(o.text));
    b.addEventListener('click',()=>{
      if(o.action?.type==='recall'){setMode('name');$('player-name').focus();return;}
      if(o.action)dispatch(o.action);
      if(['memory','departure','ending'].includes(mode))return;
      if(o.next)showDialogue(o.next);else setMode('play');
    });$('choices').append(b);
  });
  if(world.npcs.some(n=>n.id===id))dispatch({type:'hear',id});
  $('choices').querySelector('button')?.focus({preventScroll:true});
}
function showJournal(){
  setMode('journal');const root=$('journal-content');root.replaceChildren();
  function section(title,text,cls='note'){const node=document.createElement('div');node.className=cls;const h=document.createElement('strong');h.textContent=title;const p=document.createElement('p');p.textContent=text;node.append(h,p);root.append(node);}
  section('Сейчас',objective(state));
  if(state.name)section('Моё имя',state.name);
  section('Часы и два поезда',state.name?'Время снова идёт. Поезд в 14:00 ушёл. Последнее отправление — в 14:05.':'Стрелки застыли на 13:59:59. На табло различимы только два времени: 14:00 и 14:05.');
  if(state.exitSeen)section('Выход в город','За дверью лето. Здесь прохладно. Дверь не открывается.');
  if(state.shopMet)section('Просьба продавца','Шар — мальчику у скамьи. Лента — девушке у балюстрады. Меч — девочке рядом с отцом. Предметы лежат на прилавке.');
  for(const [id,m] of Object.entries(memories))section(m.item,state.memories.includes(id)?m.note:state.held.includes(id)?'У меня с собой. Нужно поговорить с тем, кому эта вещь нужна.':'Воспоминание ещё не вернулось.',state.memories.includes(id)?'note':'note locked');
  if(state.heard.includes('elder'))section('Старик','Он проверяет ладони и записи в блокноте. Чтобы пройти на перрон, нужно назвать себя.');
}

const audio={
  ctx:null,master:null,ready:false,
  init(){
    if(this.ready){if(this.ctx?.state==='suspended')this.ctx.resume().catch(()=>{});return;}
    try{
      const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.ctx=new C();this.master=this.ctx.createGain();this.master.gain.value=sound?.5:0;this.master.connect(this.ctx.destination);this.ready=true;
      const n=this.ctx.sampleRate*3,b=this.ctx.createBuffer(1,n,this.ctx.sampleRate),arr=b.getChannelData(0);let smooth=0;for(let i=0;i<n;i++){smooth=(smooth+(Math.random()*2-1)*.03)/1.025;arr[i]=smooth;}
      const src=this.ctx.createBufferSource();src.buffer=b;src.loop=true;const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=450;const gain=this.ctx.createGain();gain.gain.value=.2;src.connect(filter);filter.connect(gain);gain.connect(this.master);src.start();
      for(const f of [73.416,110]){const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='sine';o.frequency.value=f;g.gain.value=.012;o.connect(g);g.connect(this.master);o.start();}
    }catch{}
  },
  toggle(){if(this.master)this.master.gain.setTargetAtTime(sound?.5:0,this.ctx.currentTime,.2);},
  chime(frequencies,duration=.3){
    if(!this.ready||!sound)return;
    frequencies.forEach((f,i)=>{const t=this.ctx.currentTime+i*.17,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.1,t+.018);g.gain.exponentialRampToValueAtTime(.0001,t+duration+1);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+1.1);});
  },
  step(){if(!this.ready||!sound)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain(),t=this.ctx.currentTime;o.type='triangle';o.frequency.setValueAtTime(105,t);o.frequency.exponentialRampToValueAtTime(35,t+.09);g.gain.setValueAtTime(.032,t);g.gain.exponentialRampToValueAtTime(.0001,t+.12);o.connect(g);g.connect(this.master);o.start();o.stop(t+.13);}
};

function interact(){if(mode==='play'&&current){audio.init();showDialogue(current.id);}}
function updateTarget(){
  camera.getWorldDirection(direction);let best=null,score=Infinity;
  for(const target of world.targets){
    if(target.obj&&!target.obj.visible)continue;
    if(target.id==='train'&&!state.admitted)continue;
    if(target.id==='gate'&&state.admitted)continue;
    if(target.id==='train'&&player.z> -16)continue;
    toTarget.copy(target.position).sub(camera.position);const d=toTarget.length();if(d>target.reach||d<.05)continue;
    const dot=toTarget.multiplyScalar(1/d).dot(direction);const minDot=target.id==='clock'?.984:target.id==='board'?.96:.80;
    if(dot<minDot)continue;
    const candidate=d*.07+(1-dot)*6;
    if(candidate<score){score=candidate;best=target;}
  }
  current=best;$('interact').hidden=!best;$('crosshair').classList.toggle('active',!!best);if(best)$('interact-text').textContent=best.label;
}
function beginDeparture(){
  mode='departure';cutsceneTime=0;releasePointer();for(const id of ['dialogue','hud','objective','crosshair','interact','touch-controls','desktop-hint'])$(id).hidden=true;
  audio.chime([146.83,220],1);subtitle('Двери закрываются. Старик остаётся на платформе.',4500);
}
function departureFrame(dt){
  cutsceneTime+=dt;
  const t=cutsceneTime;
  const train=world.train2;
  const desired=new T.Vector3(train.position.x-4.2,5.4+Math.min(3,t*.16),train.position.z+17.5);
  camera.position.lerp(desired,Math.min(1,dt*(t<2?1.7:4)));
  camera.lookAt(0,8+Math.max(0,t-2)*.5,-5);
  if(t>5&&t<5+dt)subtitle('Вокзал медленно отрывается от земли.',4200);
  if(t>10&&t<10+dt)subtitle('На рельсах проступает трава. Каменные своды теряются в тумане.',5500);
  scene.fog.near=T.MathUtils.lerp(28,2,Math.min(1,t/20));scene.fog.far=T.MathUtils.lerp(135,24,Math.min(1,t/20));
  if(t>17)$('fade').style.opacity=String(Math.min(1,(t-17)/3));
  if(t>21){mode='ending';$('ending').hidden=false;$('ending-text').textContent='Ты помнишь своё имя: '+state.name+'.\nВокзал остался позади.\nВпереди — только туман.';$('ending-text').style.whiteSpace='pre-line';$('subtitle').textContent='';$('ending-restart').focus();}
}

function startGame(){
  audio.init();if(state.departed){state=initialState();saved=null;}
  if(saved?.player){
    const p=saved.player;if([p.x,p.z,p.yaw,p.pitch].every(Number.isFinite)&&world.canMove(p.x,p.z,state))Object.assign(player,p);
  }
  started=true;$('start').hidden=true;$('hud').hidden=false;$('objective').hidden=false;setMode('play');refreshHud();
  camera.position.set(player.x,world.floorHeight(player.x,player.z)+1.72,player.z);camera.rotation.set(player.pitch,player.yaw,0,'YXZ');
  if(!state.awakened){setTimeout(()=>{if(mode==='play')showDialogue('boy');},550);}else subtitle('Тишина всё ещё ждёт тебя под сводами.',3000);
}
function restart(){
  try{localStorage.removeItem(KEY);}catch{}location.reload();
}
function bind(){
  $('start-btn').addEventListener('click',startGame);$('interact').addEventListener('click',interact);
  $('journal-btn').addEventListener('click',()=>{if(mode==='play')showJournal();});$('journal-close').addEventListener('click',()=>setMode('play'));
  $('pause-btn').addEventListener('click',()=>{if(mode==='play')setMode('pause');});$('resume-btn').addEventListener('click',()=>setMode('play'));
  $('dialogue-close').addEventListener('click',()=>setMode('play'));
  $('memory-close').addEventListener('click',()=>{setMode('play');if(state.memories.length===3)notify('Три воспоминания. Вернись к продавцу.');});
  $('restart-btn').addEventListener('click',()=>{if($('restart-btn').dataset.confirm==='yes')restart();else{$('restart-btn').dataset.confirm='yes';$('restart-btn').textContent='Подтвердить: начать заново';}});
  $('ending-restart').addEventListener('click',restart);$('reload-btn').addEventListener('click',()=>location.reload());
  $('name-form').addEventListener('submit',e=>{e.preventDefault();const name=$('player-name').value.trim();if(!name){$('player-name').focus();return;}dispatch({type:'name',name});setMode('play');});
  $('sound-toggle').addEventListener('change',e=>{sound=e.target.checked;audio.toggle();persist();});
  $('sensitivity').addEventListener('input',e=>{sensitivity=Number(e.target.value);persist();});
  document.addEventListener('keydown',e=>{
    if(e.code==='Tab'&&activePanel()){
      const items=[...activePanel().querySelectorAll('button,input')].filter(x=>!x.disabled),a=items[0],b=items.at(-1);
      if(e.shiftKey&&document.activeElement===a){e.preventDefault();b?.focus();}else if(!e.shiftKey&&document.activeElement===b){e.preventDefault();a?.focus();}return;
    }
    if(e.target instanceof HTMLInputElement)return;
    if(e.code==='Escape'){
      e.preventDefault();if(mode==='play')setMode('pause');else if(['pause','journal','dialogue'].includes(mode))setMode('play');else if(mode==='memory')$('memory-close').click();return;
    }
    if(mode==='dialogue'&&/^Digit[1-9]$/.test(e.code)){e.preventDefault();$('choices').children[Number(e.code.slice(-1))-1]?.click();return;}
    if(mode!=='play')return;
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
    if(e.repeat)return;
    if(e.code==='KeyE'){e.preventDefault();interact();return;}
    if(e.code==='KeyJ'){e.preventDefault();showJournal();return;}
    keys.add(e.code);
  });
  document.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{clearMovement();if(mode==='play')setMode('pause');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearMovement();persist();if(mode==='play')setMode('pause');}});
  document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&mode==='play'&&started&&!touch)setMode('pause');});
  document.addEventListener('mousemove',e=>{if(mode==='play'&&document.pointerLockElement===$('world'))look(e.movementX,e.movementY);});
  function look(dx,dy){player.yaw-=dx*.00225*sensitivity;player.pitch=T.MathUtils.clamp(player.pitch-dy*.00225*sensitivity,-1.3,1.35);}
  $('world').addEventListener('pointerdown',e=>{
    if(mode!=='play'||lookPointer!==null)return;
    if(!touch&&document.pointerLockElement===$('world'))return;
    lookPointer=e.pointerId;lookX=e.clientX;lookY=e.clientY;$('world').setPointerCapture(e.pointerId);
  });
  $('world').addEventListener('pointermove',e=>{if(mode==='play'&&lookPointer===e.pointerId){look(e.clientX-lookX,e.clientY-lookY);lookX=e.clientX;lookY=e.clientY;}});
  function stopLook(e){if(lookPointer===e.pointerId){lookPointer=null;if($('world').hasPointerCapture(e.pointerId))$('world').releasePointerCapture(e.pointerId);}}
  $('world').addEventListener('pointerup',stopLook);$('world').addEventListener('pointercancel',stopLook);
  const joystick=$('joystick');
  function moveStick(e){const r=joystick.getBoundingClientRect(),max=r.width*.32,dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,len=Math.hypot(dx,dy),f=len>max?max/len:1;joy.x=dx*f/max;joy.y=dy*f/max;$('stick').style.transform='translate(calc(-50% + '+dx*f+'px),calc(-50% + '+dy*f+'px))';}
  joystick.addEventListener('pointerdown',e=>{if(mode!=='play'||joystickPointer!==null)return;e.preventDefault();joystickPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveStick(e);});
  joystick.addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer){e.preventDefault();moveStick(e);}});
  function stopStick(e){if(e.pointerId===joystickPointer){joystickPointer=null;joy.x=joy.y=0;$('stick').style.transform='translate(-50%,-50%)';}}
  joystick.addEventListener('pointerup',stopStick);joystick.addEventListener('pointercancel',stopStick);joystick.addEventListener('lostpointercapture',stopStick);
  window.addEventListener('resize',resize);window.addEventListener('pagehide',persist);
}

function resize(){const width=innerWidth,height=innerHeight;camera.aspect=width/height;camera.fov=width<height?76:64;camera.updateProjectionMatrix();renderer.setSize(width,height);}
let previousFrame=performance.now();
function frame(now){
  const dt=Math.min(.045,(now-previousFrame)/1000);previousFrame=now;
  if(['play','start','departure'].includes(mode))time+=dt;
  if(mode==='start'){
    camera.position.set(9+Math.sin(time*.09)*.6,4.3,19);camera.lookAt(-1,8.5,-10);
  }else if(mode==='play'){
    const forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-joy.y;
    const right=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joy.x;
    const len=Math.max(1,Math.hypot(forward,right)),speed=keys.has('ShiftLeft')?4.7:3.05;
    const dx=(right*Math.cos(player.yaw)-forward*Math.sin(player.yaw))/len*speed*dt;
    const dz=(-right*Math.sin(player.yaw)-forward*Math.cos(player.yaw))/len*speed*dt;
    if(world.canMove(player.x+dx,player.z,state))player.x+=dx;
    if(world.canMove(player.x,player.z+dz,state))player.z+=dz;
    const walking=Math.abs(dx)+Math.abs(dz)>.002;
    camera.position.x=player.x;camera.position.z=player.z;
    const bob=walking?Math.sin(time*9)*.019:0;
    camera.position.y=T.MathUtils.damp(camera.position.y,world.floorHeight(player.x,player.z)+1.72+bob,15,dt);
    camera.rotation.set(player.pitch,player.yaw,0,'YXZ');
    if(walking){stepAccumulator+=dt;if(stepAccumulator>.51){audio.step();stepAccumulator=0;}}
    if(now-lastTargetTime>60){updateTarget();refreshHud();lastTargetTime=now;}
    saveAccumulator+=dt;if(saveAccumulator>2){persist();saveAccumulator=0;}
  }
  if(world){
    const worldDt=['play','start','departure'].includes(mode)?dt:0;
    world.update(worldDt,time,state,camera);
    if(mode==='departure')departureFrame(dt);
  }
  if(state.name){const seconds=state.departed?50700:Math.min(50699,50400+Math.floor((time-(rememberedAt??time))*.5));const h=Math.floor(seconds/3600),m=Math.floor(seconds/60)%60,s=seconds%60;$('time').textContent=[h,m,s].map(n=>String(n).padStart(2,'0')).join(':');}
  renderer.render(scene,camera);requestAnimationFrame(frame);
}

async function init(){
  renderer=new T.WebGLRenderer({canvas:$('world'),antialias:!touch,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,touch?1.35:1.75));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.28;
  renderer.shadowMap.enabled=!touch;renderer.shadowMap.type=T.PCFSoftShadowMap;
  scene=new T.Scene();scene.background=new T.Color(0xc1cec0);scene.fog=new T.Fog(0xc1cec0,28,135);
  camera=new T.PerspectiveCamera(64,innerWidth/innerHeight,.07,220);
  scene.add(new T.HemisphereLight(0xe4ecda,0x546756,2.2));
  const sun=new T.DirectionalLight(0xffe0ad,3.4);sun.position.set(-23,36,3);sun.target.position.set(4,0,2);scene.add(sun,sun.target);sun.castShadow=!touch;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-34,right:34,top:38,bottom:-38,near:1,far:100});sun.shadow.bias=-.0004;sun.shadow.normalBias=.08;
  const fill=new T.DirectionalLight(0xadcfc9,1.1);fill.position.set(0,12,-45);scene.add(fill);
  const warm=new T.PointLight(0xffcf8c,16,15,2);warm.position.set(-12,5,2);scene.add(warm);
  world=buildWorld(scene);
  if(saved?.settings){sound=saved.settings.sound!==false;sensitivity=T.MathUtils.clamp(Number(saved.settings.sensitivity)||1,.4,2);}
  $('sound-toggle').checked=sound;$('sensitivity').value=String(sensitivity);
  if(touch)$('control-help').innerHTML='Левый джойстик — идти.<br>Перетягивание справа — обзор.<br>Кнопка действия появляется рядом с человеком или предметом.';
  bind();resize();$('start-btn').disabled=false;$('start-btn').textContent=state.awakened&&!state.departed?'Продолжить':'Проснуться';
  $('world').addEventListener('webglcontextlost',e=>{e.preventDefault();setMode('pause');notify('3D-сцена приостановлена. Перезагрузи страницу — прогресс сохранён.');});
  requestAnimationFrame(frame);
}
init().catch(showError);
