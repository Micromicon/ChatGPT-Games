import {INITIAL, ITEMS, SPEAKERS, SCENES, resolveNode, availableHotspots, directionHint, restoreState, transition} from './novel-data.js';
import {PHOTO_CREDITS} from './photo-credits.js';
import {ART,REGIONS,regionBounds,fitPainting,hitRegion,presentation} from './scene-art.js';

const $=id=>document.getElementById(id);
const SAVE_KEY='station-visual-novel-v2';
const PREFS_KEY='station-novel-preferences';
const imageCache=new Map();
let currentView={key:'overview',frame:[0,0,100,100],file:ART.overview.file},loading=false,showAreas=false;
const MEMORIES={orb:{title:'Можно не заслуживать',text:'Кто-то присел перед тобой, чтобы вы оказались на одной высоте. Тебе больше не нужно было быть удобным, чтобы тебя не оставили.'},ribbon:{title:'За одним словом — целая жизнь',text:'Ты пытался заменить последнее слово другим, правильным. Но до этого слова было столько дней, когда ты любил человека и сердился на него одновременно.'},sword:{title:'Не обязательно самому',text:'Тяжёлая сумка. Закрытая дверь. Твоё раздражённое «я сам». Кто-то дождался, пока ты согласишься отпустить ручку и принять помощь.'}};
let state=INITIAL(),saved=null,started=false,storageOK=true,prefs={sound:false,text:1},panelKind='',toastTimer,lastImageKey='',photoIndex=0,imageRequest=0;
let shownChoices=false;
try{const raw=localStorage.getItem(SAVE_KEY);if(raw){const parsed=JSON.parse(raw);if(parsed?.version===2&&(SCENES[parsed.scene]||parsed.scene==='waiting'))saved=restoreState(parsed);}const p=JSON.parse(localStorage.getItem(PREFS_KEY)||'{}');prefs.sound=p.sound===true;prefs.text=[1,1.12,1.25].includes(p.text)?p.text:1;}catch{storageOK=false;}

function el(tag,cls,text){const item=document.createElement(tag);if(cls)item.className=cls;if(text!==undefined)item.textContent=text;return item;}
function button(label,fn,cls=''){const item=el('button',cls,label);item.type='button';item.addEventListener('click',fn);return item;}
function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));saved=state;}catch{if(storageOK){storageOK=false;toast('Браузер не разрешил сохранить прогресс. Оставь эту вкладку открытой.');}}}
function savePrefs(){try{localStorage.setItem(PREFS_KEY,JSON.stringify(prefs));}catch{}}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('shown');toastTimer=setTimeout(()=>$('toast').classList.remove('shown'),3400);}
function layoutPainting(){const viewport=$('scene-viewport');const fit=fitPainting(viewport.clientWidth,viewport.clientHeight);$('painting-stage').style.width=fit.width+'px';$('painting-stage').style.height=fit.height+'px';$('hotspots').querySelectorAll('.scene-area').forEach(target=>{const points=hitRegion(REGIONS[target.dataset.region],fit.width,fit.height);target.style.clipPath='polygon('+points.map(p=>p[0]+'% '+p[1]+'%').join(',')+')';});}
function loadArt(file){if(imageCache.has(file))return imageCache.get(file);const promise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{imageCache.delete(file);reject(new Error('Image unavailable'));};image.src='./'+file;});imageCache.set(file,promise);return promise;}
function paintLayer(layer,view){const [x,y,w,h]=view.frame;layer.style.backgroundImage='url("./'+view.file+'")';layer.style.backgroundSize=(10000/w)+'% '+(10000/h)+'%';layer.style.backgroundPosition=(w===100?0:x/(100-w)*100)+'% '+(h===100?0:y/(100-h)*100)+'%';}
function setBackground(view){const signature=view.key+':'+view.frame.join(',');currentView=view;if(signature===lastImageKey)return;lastImageKey=signature;const request=++imageRequest,next=1-photoIndex,photo=$('photo-'+(next===0?'a':'b')),previous=$('photo-'+(photoIndex===0?'a':'b'));loading=true;$('novel').classList.add('changing-scene');hideHover();
  const delayed=setTimeout(()=>{if(request===imageRequest)$('scene-loader').hidden=false;},250);
  loadArt(view.file).then(()=>{if(request!==imageRequest)return;paintLayer(photo,view);photo.classList.add('visible');previous.classList.remove('visible');photoIndex=next;}).catch(()=>{if(request!==imageRequest)return;lastImageKey='';toast('Картина не загрузилась. При следующем переходе попробуем ещё раз.');}).finally(()=>{clearTimeout(delayed);if(request!==imageRequest)return;loading=false;$('novel').classList.remove('changing-scene');$('scene-loader').hidden=true;});
}
function hideHover(){$('hover-caption').classList.remove('visible');}
function hintAreas(on){showAreas=on;$('painting-stage').classList.toggle('show-areas',showAreas);$('areas-button').setAttribute('aria-pressed',String(showAreas));}
function makeArea(h,index){const points=REGIONS[h.region];if(!points)return null;const b=regionBounds(points),target=button('',()=>{if(loading)return;hideHover();hintAreas(false);$('painting-stage').style.setProperty('--arrival-x',(b.x+b.w/2)+'%');$('painting-stage').style.setProperty('--arrival-y',(b.y+b.h/2)+'%');dispatch({type:'interact',index});},'scene-area');target.setAttribute('aria-label',h.label);target.dataset.region=h.region;
  const poly='polygon('+points.map(p=>p[0]+'% '+p[1]+'%').join(',')+')';target.style.clipPath=poly;
  const bright=el('span','area-light');bright.setAttribute('aria-hidden','true');bright.style.backgroundImage='url("./'+currentView.file+'")';bright.style.clipPath=poly;target.append(bright);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');svg.classList.add('area-outline');const outline=document.createElementNS('http://www.w3.org/2000/svg','polygon');outline.setAttribute('points',points.map(p=>p.join(',')).join(' '));outline.setAttribute('vector-effect','non-scaling-stroke');svg.append(outline);target.append(svg);
  const label=()=>{$('hover-name').textContent=h.label;$('hover-action').textContent=h.scene?'Подойти ближе':h.node==='boarding'?'Войти в вагон':'Рассмотреть';$('hover-caption').classList.add('visible');};target.addEventListener('pointerenter',label);target.addEventListener('pointerleave',hideHover);target.addEventListener('focus',label);target.addEventListener('blur',hideHover);return target;
}
function applyTextSize(){document.documentElement.style.setProperty('--read-size',`clamp(${20*prefs.text}px,${1.85*prefs.text}vw,${27*prefs.text}px)`);document.documentElement.style.setProperty('--text-scale',prefs.text);}

// Sound is original, quiet and procedural. It starts only after a user gesture.
const ambience={context:null,master:null,timer:null,started:false,trainGain:null,
  async enable(){try{const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return false;if(!this.context)this.build(Context);await this.context.resume();this.master.gain.setTargetAtTime(.2,this.context.currentTime,.8);if(!this.timer){this.chime();this.timer=setInterval(()=>this.chime(),18000);}return true;}catch{return false;}},
  build(Context){const ctx=this.context=new Context();const master=this.master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
    const seconds=6,buffer=ctx.createBuffer(1,ctx.sampleRate*seconds,ctx.sampleRate);const data=buffer.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){last=(last+Math.random()*.03-.015)/1.01;data[i]=last;}
    const air=ctx.createBufferSource();air.buffer=buffer;air.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=650;const gain=ctx.createGain();gain.gain.value=.42;air.connect(filter);filter.connect(gain);gain.connect(master);air.start();
    const train=ctx.createOscillator(),trainGain=this.trainGain=ctx.createGain();train.type='sine';train.frequency.value=43;trainGain.gain.value=0;train.connect(trainGain);trainGain.connect(master);train.start();
    this.started=true;},
  chime(){if(!prefs.sound||!this.context||document.hidden)return;const ctx=this.context;[174.614,220,261.626,329.628].forEach((freq,i)=>{const note=ctx.createOscillator(),level=ctx.createGain(),time=ctx.currentTime+i*1.4;note.type='sine';note.frequency.value=freq;level.gain.setValueAtTime(0,time);level.gain.linearRampToValueAtTime(.023,time+1.8);level.gain.exponentialRampToValueAtTime(.0001,time+11);note.connect(level);level.connect(this.master);note.start(time);note.stop(time+11.1);});},
  disable(){if(this.master)this.master.gain.setTargetAtTime(0,this.context.currentTime,.35);clearInterval(this.timer);this.timer=null;},
  update(){if(this.trainGain)this.trainGain.gain.setTargetAtTime(state.flags.boarded ? .10 : 0,this.context.currentTime,2);}
};
async function setSound(enabled){prefs.sound=enabled;if(enabled){if(!await ambience.enable()){prefs.sound=false;toast('Звук недоступен в этом браузере.');}}else ambience.disable();savePrefs();renderSound();}
function renderSound(){$('sound-button').textContent=prefs.sound?'Звук вкл.':'Звук выкл.';$('sound-button').setAttribute('aria-pressed',String(prefs.sound));$('sound-button').setAttribute('aria-label',prefs.sound?'Выключить звуки вокзала':'Включить звуки вокзала');}

function begin(fresh=false){state=fresh?INITIAL():saved?restoreState(saved):INITIAL();started=true;$('novel').classList.add('playing');closePanel();$('start').hidden=true;$('header').hidden=false;if(!state.history.length&&state.node){const first=resolveNode(state.node,state).beats[0];if(first)state.history.push({...first});}persist();render();setTimeout(()=>Object.values(ART).forEach(a=>loadArt(a.file).catch(()=>{})),800);if(prefs.sound)setSound(true);if(!storageOK)toast('Сохранение недоступно. Пока читаешь, оставь эту вкладку открытой.');}
function dispatch(action){if(!started||$('panel').open||state.flags.ended)return;const previous=state;state=transition(state,action);if(state===previous)return;const newItem=state.items.find(k=>!previous.items.includes(k));const newMemory=Object.keys(ITEMS).find(k=>state.flags['memory_'+k]&&!previous.flags['memory_'+k]);persist();render();if(newItem)toast(ITEMS[newItem].name+' · у тебя');if(newMemory)toast('В записях осталось воспоминание.');}
function render(){const scene=SCENES[state.scene],node=state.node?resolveNode(state.node,state):null,ended=!!state.flags.ended,encounter=!node&&scene.kind==='encounter';
  hideHover();hintAreas(false);setBackground(presentation(state,SCENES));$('novel').classList.toggle('remembering',!!node?.memory);$('novel').classList.toggle('departing',!!node?.departure);$('novel').classList.toggle('finished',ended);$('novel').classList.toggle('reading',!!node||encounter);$('novel').classList.toggle('encounter',encounter);$('novel').style.setProperty('--fog',node?.departure?Math.min(.68,Math.max(0,(state.beat-3)*.115)):0);
  $('header').hidden=ended;$('exploration').hidden=!!node||encounter||ended;$('dialogue').hidden=(!node&&!encounter)||ended;$('hotspots').hidden=!!node||encounter||ended;$('ending').hidden=!ended;$('back-button').hidden=!!node||ended||!scene.back;$('back-button').textContent='← Общий план вокзала';
  $('areas-button').hidden=!!node||encounter||ended;
  $('clock').textContent=state.flags.boarded?'14:05:00':state.flags.named?'14:04:35':state.flags.first_train?'14:00:01':'13:59:59';$('clock-caption').textContent=state.flags.first_train?'ПОСЛЕДНИЙ ПОЕЗД · 14:05':'ВРЕМЯ ОСТАНОВИЛОСЬ';$('memory-mark').classList.toggle('active',Object.keys(ITEMS).some(k=>state.flags['memory_'+k]));
  if(ended){$('ending-title').focus({preventScroll:true});ambience.update();return;}
  if(node)renderDialogue(node);else renderScene(scene);layoutPainting();ambience.update();
}
function renderScene(scene){shownChoices=false;$('novel').classList.remove('choosing');$('hotspots').replaceChildren();
  if(scene.kind==='encounter'){renderEncounter(scene);return;}
  $('scene-title').textContent=scene.name;$('scene-subtitle').textContent=scene.subtitle;$('scene-description').textContent=scene.description(state);
  availableHotspots(state.scene,state).forEach((h,index)=>{const area=makeArea(h,index);if(area)$('hotspots').append(area);});$('scene-title').focus({preventScroll:true});
}
function renderEncounter(scene){$('novel').classList.add('choosing');$('dialogue-location').textContent=scene.subtitle;$('memory-label').hidden=true;$('speaker').textContent=scene.name;$('line').textContent=scene.description(state);$('line').classList.add('narration');$('choices').hidden=false;$('next-button').hidden=true;$('choices').replaceChildren();
  availableHotspots(state.scene,state).forEach((h,index)=>{$('choices').append(button(h.label,()=>dispatch({type:'interact',index}),'choice'));});$('dialogue').scrollTop=0;
}
function renderDialogue(node){const isChoice=state.beat>=node.beats.length;const beat=node.beats[Math.min(state.beat,node.beats.length-1)]||{speaker:'narrator',text:'Куда дальше?'};const speaker=SPEAKERS[beat.speaker]||SPEAKERS.narrator;const previousChoices=shownChoices;shownChoices=isChoice;
  $('novel').classList.toggle('choosing',isChoice);$('dialogue-location').textContent=SCENES[state.scene].name;$('memory-label').hidden=!node.memory;$('memory-label').textContent=node.memory||'';$('speaker').textContent=speaker.name||'Вокзал';$('line').textContent=beat.text;$('line').classList.toggle('narration',beat.speaker==='narrator'||beat.speaker==='memory');$('choices').hidden=!isChoice;$('next-button').hidden=isChoice;
  $('choices').replaceChildren();if(isChoice){node.choices.forEach((choice,index)=>{$('choices').append(button(choice.label,()=>dispatch({type:'choose',index}),'choice'));});if(!previousChoices)$('choices').firstElementChild?.focus({preventScroll:true});}else if(document.activeElement?.classList.contains('choice'))$('next-button').focus({preventScroll:true});
  $('dialogue').scrollTop=0;
}
function next(){if(state.node)dispatch({type:'advance'});}
function openPanel(kind){panelKind=kind;const title={notes:'Записи',history:'Сказанные слова',menu:'Время подождёт',credits:'О новелле',restart:'Начать сначала?'}[kind];$('panel-title').textContent=title;$('panel-eyebrow').textContent=kind==='credits'?'ГЛАВА ПЕРВАЯ · ВОКЗАЛ':kind==='history'?'МОЖНО ВЕРНУТЬСЯ К СЛОВАМ':'13:59:59';const body=$('panel-content');body.replaceChildren();
  if(kind==='notes')buildNotes(body);
  if(kind==='history')buildHistory(body);
  if(kind==='menu')buildMenu(body);
  if(kind==='credits')buildCredits(body);
  if(kind==='restart'){body.append(el('p','','Текущее прохождение будет заменено. Все встречи начнутся заново.'));const actions=el('div','confirm-actions');actions.append(button('Да, с первой строки',()=>begin(true),'primary'),button('Оставить моё прохождение',closePanel,'quiet'));body.append(actions);}
  if(!$('panel').open)$('panel').showModal();$('panel').scrollTop=0;}
function closePanel(){if($('panel').open)$('panel').close();panelKind='';}
function buildNotes(body){const found=Object.keys(MEMORIES).filter(k=>state.flags['memory_'+k]);body.append(el('p','aside','Здесь остаётся то, что удалось узнать. Можно читать без спешки: поезд не отправится, пока ты не закончишь главу.'));
  if(state.flags.clock_seen||state.flags.board_seen)body.append(el('p','',state.flags.first_train?'Часы снова идут. На табло остался последний поезд — в 14:05.':'Два отправления: 14:00 и 14:05. Часы стоят на 13:59:59.'));
  if(found.length){body.append(el('h3','','Вспомнилось'));found.forEach(key=>{const item=el('div','memory-note');item.append(el('h3','',MEMORIES[key].title),el('p','',MEMORIES[key].text));body.append(item);});}else body.append(el('p','','Пока всё незнакомо. Кроме привычки проверять карманы и искать взглядом человека, который знает дорогу.'));
  if(state.flags.remembered)body.append(el('p','','Своё имя вернулось. Ты услышал, как его произносили люди, которые тебя знали.'));
  body.append(el('h3','','С собой'));if(!state.items.length)body.append(el('p','aside',found.length?'Вещи остались у тех, кому были нужны.':'Карманы пока пусты.'));
  state.items.forEach(key=>{const item=el('div','item-note');item.append(el('h3','',ITEMS[key].name),el('p','',ITEMS[key].short));body.append(item);});
  body.append(button('Если не знаешь, куда дальше',event=>{if(body.querySelector('.hint-text'))return;body.append(el('p','hint-text',directionHint(state)));},'hint-button'));
}
function buildHistory(body){if(!state.history.length){body.append(el('p','','Разговоров пока не было.'));return;}body.append(el('p','aside','Последние разговоры и твои ответы. Сверху — то, что прозвучало раньше.'));state.history.slice(-250).forEach(entry=>{const row=el('div','history-line'+(['narrator','memory'].includes(entry.speaker)?' narration':''));row.append(el('b','',entry.speaker==='choice'?'ТВОЙ ВЫБОР':(SPEAKERS[entry.speaker]?.name||'ВОКЗАЛ')),el('p','',entry.text));body.append(row);});}
function buildMenu(body){body.append(button('Вернуться к истории',closePanel,'menu-action'),button('Записи и вещи',()=>openPanel('notes'),'menu-action'),button('Перечитать диалоги',()=>openPanel('history'),'menu-action'));
  const sound=el('label','setting');sound.append(el('span','','Звуки вокзала'));const input=el('input');input.type='checkbox';input.checked=prefs.sound;input.addEventListener('change',async()=>{await setSound(input.checked);input.checked=prefs.sound;});sound.append(input);body.append(sound);
  const size=el('label','setting');size.append(el('span','','Размер текста'));const select=el('select');select.setAttribute('aria-label','Размер текста');[1,1.12,1.25].forEach((value,i)=>{const option=el('option','',['Обычный','Крупнее','Большой'][i]);option.value=value;option.selected=prefs.text===value;select.append(option);});select.addEventListener('change',()=>{prefs.text=Number(select.value);applyTextSize();savePrefs();});size.append(select);body.append(size);
  body.append(el('p','aside','Наведи мышь на нарисованного человека или место: оно подсветится. Клик или касание откроет крупный план. «Осмотреться» или H покажет доступные места. Пробел — следующая строка. Вариант ответа выбирается отдельно. Esc — меню или закрыть окно. J — записи.'));
  body.append(el('p','aside',storageOK?'Прогресс сохраняется автоматически в этом браузере. Закрыв вкладку, можно продолжить с той же строки.':'Этот браузер не разрешил сохранение. Прохождение доступно, пока вкладка открыта.'));
  body.append(button('О новелле и иллюстрациях',()=>openPanel('credits'),'menu-action'),button('Начать главу заново',()=>openPanel('restart'),'menu-action'));}
function buildCredits(body){body.append(el('p','','«Вокзал» — первая глава иллюстрированной новеллы по твоему рукописному плану. События, остановившееся время, три вещи и последний поезд взяты из него. Разговоры и варианты ответов написаны для игры.'));
  body.append(el('p','','Общий план и крупные планы созданы специально для этой истории с помощью генерации изображений. Герои и размещение лавки вымышлены. Архитектурные референсы — настоящий Antwerpen-Centraal: парадная лестница, монументальные арки, каменные галереи и стеклянный свод.'));
  body.append(el('h3','','Архитектурные референсы'));PHOTO_CREDITS.filter(c=>['assets/hall.webp','assets/stairs.webp','assets/platform.webp'].includes(c.file)).forEach(credit=>{const row=el('div','credit');row.append(link(credit.title,credit.source),document.createTextNode(' — '),link(credit.author,credit.authorUrl),document.createTextNode('. '),link(credit.license,credit.licenseUrl));body.append(row);});
  body.append(el('p','aside','Фотографии: Vasyatka1 / Wikimedia Commons, CC BY-SA 4.0. Для игровых иллюстраций изменены композиция, окружение и свет, добавлены вымышленные персонажи. Адаптированные визуальные материалы сохраняют CC BY-SA 4.0. Это условие относится к изображениям; авторские права на рассказ остаются у его автора. Изображения сжаты в WebP. Звуковой фон синтезируется игрой.'));
}

function link(text,url){const a=el('a','',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}

$('begin-button').addEventListener('click',()=>begin());$('new-button').addEventListener('click',()=>openPanel('restart'));$('notes-button').addEventListener('click',()=>openPanel('notes'));$('history-button').addEventListener('click',()=>openPanel('history'));$('next-button').addEventListener('click',next);$('line').addEventListener('click',next);$('back-button').addEventListener('click',()=>dispatch({type:'back'}));$('sound-button').addEventListener('click',()=>setSound(!prefs.sound));$('areas-button').addEventListener('click',()=>{if(!lastImageKey)setBackground(currentView);hintAreas(!showAreas);});$('options-button').addEventListener('click',()=>openPanel('menu'));$('menu-button').addEventListener('click',()=>openPanel('menu'));$('close-panel').addEventListener('click',closePanel);$('cover-credits').addEventListener('click',()=>openPanel('credits'));$('ending-credits').addEventListener('click',()=>openPanel('credits'));$('ending-history').addEventListener('click',()=>openPanel('history'));$('ending-restart').addEventListener('click',()=>openPanel('restart'));
$('panel').addEventListener('click',event=>{if(event.target!==$('panel'))return;const rect=$('panel').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closePanel();});
$('panel').addEventListener('close',()=>{panelKind='';});
document.addEventListener('keydown',event=>{if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;if($('panel').open)return;if(event.code==='KeyH'&&started&&!state.node&&SCENES[state.scene].kind==='overview'){event.preventDefault();hintAreas(!showAreas);return;}if(event.code==='Escape'&&started&&!state.flags.ended){event.preventDefault();openPanel('menu');return;}if((event.code==='KeyJ')&&started){event.preventDefault();openPanel('notes');return;}if((event.code==='Space'||event.code==='ArrowRight')&&started&&state.node&&!state.flags.ended){if(event.target.tagName==='BUTTON')return;event.preventDefault();next();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(started)persist();ambience.disable();}else if(prefs.sound&&started)ambience.enable();});
window.addEventListener('pagehide',()=>{if(started)persist();});
new ResizeObserver(layoutPainting).observe($('scene-viewport'));layoutPainting();loadArt(ART.overview.file).catch(()=>{});if(matchMedia('(pointer:coarse)').matches)$('explore-instruction').textContent='Коснись персонажа или места, чтобы подойти. «Осмотреться» подсветит доступные места.';
applyTextSize();renderSound();$('begin-button').disabled=false;$('begin-button').replaceChildren(document.createTextNode(saved?(saved.flags.ended?'Вернуться к последней странице':'Продолжить историю'):'Открыть глаза'),el('span','','→'));$('new-button').hidden=!saved;if(!storageOK)$('save-notice').textContent='Сохранение недоступно. Оставь вкладку открытой.';
