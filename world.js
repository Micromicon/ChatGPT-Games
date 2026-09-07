import * as T from './vendor/three.module.js';

export function buildWorld(scene){
  const station=new T.Group();scene.add(station);
  const targets=[],solids=[],npcs=[],batches=new Map();let vanishingWing=null;
  const materials={
    stone:new T.MeshStandardMaterial({color:0xc6b799,roughness:.86}),
    pale:new T.MeshStandardMaterial({color:0xe0d0ac,roughness:.78}),
    darkStone:new T.MeshStandardMaterial({color:0x6a6960,roughness:.74}),
    marble:new T.MeshStandardMaterial({color:0x77736b,roughness:.37,metalness:.12}),
    floor:new T.MeshStandardMaterial({color:0xc7bda6,roughness:.47}),
    tile:new T.MeshStandardMaterial({color:0x344845,roughness:.43,metalness:.08}),
    iron:new T.MeshStandardMaterial({color:0x2d4c46,roughness:.56,metalness:.63}),
    brass:new T.MeshStandardMaterial({color:0xb89a5b,roughness:.4,metalness:.72}),
    wood:new T.MeshStandardMaterial({color:0x554030,roughness:.8}),
    leather:new T.MeshStandardMaterial({color:0x5e3729,roughness:.86}),
    black:new T.MeshStandardMaterial({color:0x182323,roughness:.8}),
    rail:new T.MeshStandardMaterial({color:0x485350,metalness:.8,roughness:.33}),
    glass:new T.MeshStandardMaterial({color:0xa5c1b2,transparent:true,opacity:.2,roughness:.16,side:T.DoubleSide,depthWrite:false}),
    window:new T.MeshBasicMaterial({color:0xb2cbb6,transparent:true,opacity:.45,side:T.DoubleSide,depthWrite:false}),
    lamp:new T.MeshBasicMaterial({color:0xffd28d}),
    grass:new T.MeshStandardMaterial({color:0x607b4a,roughness:1,side:T.DoubleSide})
  };
  const matrix=new T.Matrix4(),quat=new T.Quaternion(),euler=new T.Euler();
  function mesh(geometry,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0,group=station,batch=true){
    if(batch){
      matrix.compose(new T.Vector3(x,y,z),quat.setFromEuler(euler.set(rx,ry,rz)),new T.Vector3(1,1,1));
      const g=geometry.index?geometry.toNonIndexed():geometry.clone();g.applyMatrix4(matrix);geometry.dispose();
      const key=mat.uuid+'|'+group.uuid;if(!batches.has(key))batches.set(key,{mat,group,list:[]});batches.get(key).list.push(g);return null;
    }
    const m=new T.Mesh(geometry,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=!mat.transparent;m.receiveShadow=true;group.add(m);return m;
  }
  function box(w,h,d,mat,x,y,z,group=station,batch=true,ry=0){return mesh(new T.BoxGeometry(w,h,d),mat,x,y,z,0,ry,0,group,batch);}
  function cyl(rt,rb,h,mat,x,y,z,group=station,batch=true,rz=0,rx=0){return mesh(new T.CylinderGeometry(rt,rb,h,12),mat,x,y,z,rx,0,rz,group,batch);}
  function sphere(r,mat,x,y,z,group=station,batch=true){return mesh(new T.SphereGeometry(r,12,8),mat,x,y,z,0,0,0,group,batch);}
  function solid(x1,x2,z1,z2,condition){solids.push({x1,x2,z1,z2,condition});}
  function tube(points,r,mat,group=station,batch=true){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),points.length*2,r,6,false),mat,0,0,0,0,0,0,group,batch);}
  function arch(x,y,z,r,thickness=.36,mat=materials.pale,group=station){
    const p=[];for(let a=0;a<=32;a++){const theta=a/32*Math.PI;p.push(new T.Vector3(x+Math.cos(theta)*r,y+Math.sin(theta)*r,z));}tube(p,thickness,mat,group);
  }
  function column(x,z,base=0,h=9,r=.56,group=station){
    if(base<3)solid(x-r*1.3,x+r*1.3,z-r*1.3,z+r*1.3,s=>!(group===vanishingWing&&s.name));
    box(r*2.65,.34,r*2.65,materials.darkStone,x,base+.17,z,group);
    box(r*2.3,.2,r*2.3,materials.pale,x,base+.44,z,group);
    cyl(r*.82,r,h-1.15,materials.marble,x,base+(h-.2)/2,z,group);
    for(const yy of [base+.73,base+h-.7])cyl(r*1.11,r*1.11,.16,materials.pale,x,yy,z,group);
    box(r*2.3,.3,r*2.3,materials.stone,x,base+h-.4,z,group);
    box(r*2.65,.3,r*2.65,materials.pale,x,base+h-.13,z,group);
  }
  function label(text,x,y,z,w=3.2,h=.55,opts={}){
    const c=document.createElement('canvas');c.width=1024;c.height=Math.round(1024*h/w);
    const ctx=c.getContext('2d');ctx.fillStyle=opts.bg||'#203833';ctx.fillRect(0,0,c.width,c.height);
    ctx.strokeStyle=opts.color||'#dac99d';ctx.lineWidth=3;ctx.strokeRect(8,8,c.width-16,c.height-16);
    ctx.fillStyle=opts.color||'#e8dbb8';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=(opts.font||'500')+' '+Math.round(c.height*.47)+'px Georgia';ctx.fillText(text,c.width/2,c.height/2,c.width-45);
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const m=new T.MeshBasicMaterial({map:tex,side:T.DoubleSide});
    const o=mesh(new T.PlaneGeometry(w,h),m,x,y,z,0,opts.ry||0,0,opts.group||station,false);
    return {mesh:o,canvas:c,texture:tex,ctx};
  }
  function target(id,labelText,x,y,z,reach=3.5,obj){const v={id,label:labelText,position:new T.Vector3(x,y,z),reach,obj};targets.push(v);return v;}

  // The stone waiting hall, with an unobstructed central aisle.
  box(38,.5,41,materials.darkStone,0,-.32,7);
  box(36,.13,38,materials.floor,0,-.02,7);
  for(let x=-16;x<=16;x+=2)for(let z=-9;z<=23;z+=2){
    if(((x+z+33)/2)%2===0)box(1.92,.025,1.92,materials.tile,x,.057,z);
  }
  for(const x of [-16.8,-5.5,5.5,16.8])box(.12,.045,36,materials.brass,x,.08,7);
  for(const z of [-8.5,23])box(33.6,.04,.13,materials.brass,0,.08,z);
  // Marble inlay medallion under the dome.
  mesh(new T.RingGeometry(3.85,4,80),materials.brass,0,.095,11,-Math.PI/2);
  mesh(new T.RingGeometry(4.15,4.3,80),materials.tile,0,.1,11,-Math.PI/2);
  for(let k=0;k<12;k++)box(.08,.025,1.1,materials.brass,Math.sin(k*Math.PI/6)*3,.11,11+Math.cos(k*Math.PI/6)*3,station,true,k*Math.PI/6);

  // Monumental symmetrical facade and the grand staircase.
  box(38,4,2,materials.stone,0,19.9,-11);
  box(38,.48,2.6,materials.pale,0,17.7,-10.7);
  box(38,.4,2.8,materials.pale,0,21.9,-10.7);
  for(const side of [-1,1]){
    box(12,14,1.5,materials.stone,side*12,9.3,-11);
    box(4,11,1.5,materials.stone,side*4.9,7.8,-11);
    box(12,2.4,5.5,materials.darkStone,side*11.5,1.2,-10);
    box(12,.18,5.8,materials.pale,side*11.5,2.48,-10);
    for(let j=0;j<4;j++){
      const x=side*(7.4+j*2.8);column(x,-9.35,2.5,8.8,.47);
      if(j<3)arch(side*(8.8+j*2.8),8,-9.3,1.25,.24);
      box(1.8,3.4,.08,materials.black,x,5.4,-10.18);
      box(1.45,3.05,.035,materials.window,x,5.4,-10.08);
      for(const yy of [4.1,5.4,6.7])box(1.5,.055,.08,materials.brass,x,yy,-10.01);
    }
    box(12,.42,.6,materials.pale,side*11.5,11.5,-9.6);
    box(12,.24,.6,materials.pale,side*11.5,13,-9.6);
    for(let j=0;j<27;j++)cyl(.065,.095,1.2,materials.darkStone,side*(5.8+j*.44),12.25,-9.5);
    for(const xx of [3.8,5.6])column(side*xx,-9.15,2.4,9.7,.64);
    box(1.3,1.35,1.2,materials.pale,side*4.7,12.65,-9.5);
    sphere(.44,materials.brass,side*4.7,13.62,-9.4);
    // Sculpted stone scrolls either side of the clock.
    arch(side*2.1,11.7,-9.4,1.4,.3,materials.stone);
    box(3,.45,1.3,materials.pale,side*2.3,11.55,-9.65);
  }
  arch(0,6.1,-9.6,3.3,.48);arch(0,6.1,-9.75,3.9,.18,materials.darkStone);
  for(const x of [-3.3,3.3])box(.92,3.8,1.2,materials.pale,x,4.25,-10);
  box(8.1,.5,2.2,materials.pale,0,10.6,-10);
  for(let i=0;i<16;i++){
    const top=(i+1)*.15,z=-2-i*.5;
    box(10.5,top,.5,materials.pale,0,top/2,z);
    box(10.5,.035,.08,materials.darkStone,0,top+.009,z+.21);
  }
  box(10.5,2.4,4.7,materials.pale,0,1.2,-11.7);
  for(const side of [-1,1]){
    const xx=side*5.6;
    tube([new T.Vector3(xx,.95,-1.65),new T.Vector3(xx,3.35,-9.55),new T.Vector3(xx,3.35,-13.5)],.09,materials.darkStone);
    for(let i=0;i<15;i++){
      const z=-2-i*.5,y=(i+1)*.15;
      cyl(.085,.12,.9,materials.stone,xx,y+.45,z);
      sphere(.105,materials.pale,xx,y+.85,z);
    }
    for(const z of [-1.75,-9.6]){const y=z<-5?2.4:0;box(.68,1.18,.68,materials.darkStone,xx,y+.59,z);sphere(.37,materials.pale,xx,y+1.42,z);}
    solid(side<0?-5.95:5.3,side<0?-5.3:5.95,-10.1,-1.2);
  }
  solid(-18,-3.18,-12.7,-10.25);solid(3.18,18,-12.7,-10.25);

  // Clock, crest, and the huge semicircular fanlight.
  const face=document.createElement('canvas');face.width=face.height=768;const fc=face.getContext('2d');
  fc.fillStyle='#d7c99e';fc.beginPath();fc.arc(384,384,372,0,Math.PI*2);fc.fill();fc.strokeStyle='#514833';fc.lineWidth=12;fc.stroke();
  fc.font='40px Georgia';fc.fillStyle='#343f34';fc.textAlign='center';fc.textBaseline='middle';
  ['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'].forEach((n,i)=>{let a=i/12*Math.PI*2;fc.fillText(n,384+Math.sin(a)*295,384-Math.cos(a)*295);});
  for(let i=0;i<60;i++){let a=i*Math.PI/30;fc.beginPath();fc.moveTo(384+Math.sin(a)*338,384-Math.cos(a)*338);fc.lineTo(384+Math.sin(a)*(i%5?329:315),384-Math.cos(a)*(i%5?329:315));fc.lineWidth=i%5?2:5;fc.stroke();}
  const ct=new T.CanvasTexture(face);ct.colorSpace=T.SRGBColorSpace;
  mesh(new T.CircleGeometry(1.76,64),new T.MeshStandardMaterial({map:ct,roughness:.8}),0,13,-8.9,0,0,0,station,false);
  mesh(new T.TorusGeometry(1.85,.13,8,64),materials.brass,0,13,-8.84);
  const hands=[];
  for(const [l,w,mat] of [[.91,.13,materials.iron],[1.36,.095,materials.iron],[1.51,.034,materials.brass]]){
    const g=new T.Group();g.position.set(0,13,-8.71+hands.length*.025);station.add(g);box(w,l,.065,mat,0,l/2-.08,0,g,false);hands.push(g);
  }
  sphere(.13,materials.brass,0,13,-8.52);
  box(2.3,.38,1,materials.pale,0,15.25,-9.25);sphere(.52,materials.brass,0,16,-9.4);
  for(const x of [-.7,0,.7])mesh(new T.ConeGeometry(.19,.72,5),materials.brass,x,16.4,-9.4);
  arch(0,16.6,-10.1,6.9,.24,materials.darkStone);
  mesh(new T.CircleGeometry(6.65,48,0,Math.PI),materials.window,0,16.6,-10.18);
  for(let i=0;i<13;i++){const a=i/12*Math.PI;tube([new T.Vector3(0,16.6,-10.03),new T.Vector3(Math.cos(a)*6.6,16.6+Math.sin(a)*6.6,-10.03)],.045,materials.iron);}
  arch(0,16.6,-10,3.3,.065,materials.iron);
  label('ANTWERPEN · CENTRAAL',0,18.4,-9.98,7.2,.85,{bg:'#38483c'});
  target('clock','Осмотреть часы',0,13,-8.8,25);

  // Side arcades, tall windows and warm wall lamps.
  for(const side of [-1,1]){
    const wing=new T.Group();station.add(wing);if(side===1)vanishingWing=wing;
    box(1,15,38,materials.stone,side*18,7.5,7,wing);
    box(1.35,.6,39,materials.pale,side*17.85,11.5,7,wing);
    box(1.55,.5,39,materials.pale,side*17.75,15.2,7,wing);
    for(const z of [-5,3,11,19]){
      column(side*15.5,z,0,11.2,.7,wing);
      const frame=new T.Group();frame.position.set(side*17.38,0,z+2);frame.rotation.y=side<0?Math.PI/2:-Math.PI/2;wing.add(frame);
      box(4,7,.13,materials.darkStone,0,5.3,0,frame);
      box(3.5,6.5,.07,materials.window,0,5.3,.09,frame);
      arch(0,8.5,.11,2,.21,materials.pale,frame);
      mesh(new T.CircleGeometry(1.8,20,0,Math.PI),materials.window,0,8.5,.02,0,0,0,frame);
      for(const xx of [-1.1,0,1.1])box(.055,7,.13,materials.iron,xx,5.3,.19,frame);
      for(const yy of [3,5,7.1])box(3.65,.06,.12,materials.iron,0,yy,.2,frame);
      box(.4,.28,.6,materials.brass,side*14.95,5.9,z,wing);
      cyl(.15,.23,.65,materials.lamp,side*14.95,6.3,z,wing);
      cyl(.29,.18,.17,materials.iron,side*14.95,6.72,z,wing);
    }
    for(const z of [-1,7,15]){
      const a=new T.Group();a.position.set(side*15.5,0,z);a.rotation.y=Math.PI/2;wing.add(a);arch(0,7.4,0,3.85,.35,materials.stone,a);
    }
    box(.65,.35,38,materials.darkStone,side*14.9,12.4,7,wing);
    for(let z=-9;z<25;z+=.75)cyl(.07,.1,.8,materials.iron,side*14.9,12,z,wing);
  }

  // High dome over the main hall, clear fanlight and radial ribs.
  const dome=new T.SphereGeometry(14.3,48,20,0,Math.PI*2,0,Math.PI/2);dome.scale(1,.69,1);
  mesh(dome,materials.glass,0,15.1,7);
  for(let i=0;i<16;i++){
    const a=i/16*Math.PI*2,p=[];for(let j=0;j<=20;j++){const b=j/20*Math.PI/2;p.push(new T.Vector3(Math.cos(a)*Math.cos(b)*14.3,15.1+Math.sin(b)*9.87,7+Math.sin(a)*Math.cos(b)*14.3));}tube(p,.115,materials.iron);
  }
  for(const theta of [.1,.34,.61,.91,1.2]){
    const r=Math.cos(theta)*14.3;mesh(new T.TorusGeometry(r,.075,6,64),materials.iron,0,15.1+Math.sin(theta)*9.87,7,Math.PI/2);
  }
  mesh(new T.TorusGeometry(14.4,.3,8,64),materials.pale,0,15,7,Math.PI/2);
  // Rear facade and the unreachable summer street.
  box(36,16,1.3,materials.stone,0,8,26);
  box(10,12,.1,materials.darkStone,0,6.1,25.28);
  box(8.2,9.6,.08,materials.window,0,6.1,25.2);
  for(const x of [-4.3,0,4.3])box(.23,9.7,.3,materials.iron,x,6.05,25.08);
  for(const yy of [2.6,5.5,8.4,10.9])box(8.6,.16,.3,materials.iron,0,yy,25.07);
  for(const x of [-.6,.6])box(.055,.55,.25,materials.brass,x,1.35,24.85);
  label('SORTIE · UITGANG',0,3.2,24.91,3.4,.6,{ry:Math.PI});
  for(const x of [-11,11]){column(x,24.85,0,12,.8);box(7,.45,1,materials.pale,x,10.5,25);}
  const summer=new T.MeshBasicMaterial({color:0x8da475});for(const side of [-1,1]){
    sphere(1.6,summer,side*3,6.4,25.13);sphere(1.2,summer,side*2.2,7.4,25.15);
  }
  target('exit','Essayer la porte',0,1.6,24.7,3.5).label='Проверить дверь в город';

  // Benches and luggage define the three small scenes.
  function bench(x,z,ry=0){
    const g=new T.Group();g.position.set(x,0,z);g.rotation.y=ry;station.add(g);
    for(const xx of [-1.35,1.35]){box(.1,.65,.9,materials.iron,xx,.35,0,g);box(.1,1.1,.12,materials.iron,xx,.95,-.33,g);}
    for(let j=0;j<4;j++)box(3.2,.09,.16,materials.wood,0,.67,-.28+j*.2,g);
    for(let j=0;j<3;j++)box(3.2,.13,.085,materials.wood,0,1.02+j*.17,-.38,g);
    solid(x-1.7,x+1.7,z-.5,z+.55);
  }
  bench(-7,17.4);bench(7,17.4);bench(10.3,8.5);bench(-9.3,9.5);
  for(const [x,z] of [[-9,16.8],[9.8,4.9],[-9.6,7]]){
    box(.7,.5,.32,materials.leather,x,.3,z);mesh(new T.TorusGeometry(.13,.025,6,14,Math.PI),materials.brass,x,.61,z);
    for(const xx of [-.21,.21])box(.065,.5,.335,materials.brass,x+xx,.3,z);
  }

  // The souvenir counter, with three real 3D objects.
  box(6,1.12,1.3,materials.wood,-12.1,.56,2.3);box(6.25,.15,1.5,materials.darkStone,-12.1,1.19,2.3);
  solid(-15.3,-8.9,1.52,3.07);
  box(6.3,4,.24,materials.wood,-12.1,2.1,-.6);
  for(const yy of [1.2,2.25,3.25])box(5.8,.09,.65,materials.brass,-12.1,yy,-.3);
  for(let row=0;row<3;row++)for(let j=0;j<9;j++){
    const x=-14.5+j*.57,y=1.25+row*1.03;box(.22,.24+(j%3)*.12,.21,j%2?materials.leather:materials.iron,x,y+.15,-.22);
  }
  label('ВОСПОМИНАНИЯ',-12.1,4.45,-.4,6.4,.7);
  const items={};
  for(const [id,x] of [['orb',-14.1],['ribbon',-12.15],['sword',-10.15]]){
    const g=new T.Group();g.position.set(x,1.3,2.4);station.add(g);items[id]=g;
    cyl(.32,.37,.08,materials.brass,0,.015,0,g,false);
    if(id==='orb'){
      sphere(.23,new T.MeshStandardMaterial({color:0x75ad9e,metalness:.5,roughness:.18,emissive:0x275d42,emissiveIntensity:.45}),0,.29,0,g,false);
      mesh(new T.TorusGeometry(.235,.027,8,32),materials.brass,0,.29,0,Math.PI/4,Math.PI/5,0,g,false);
    }else if(id==='ribbon'){
      const red=new T.MeshStandardMaterial({color:0x872f3f,roughness:.7,side:T.DoubleSide});
      mesh(new T.TorusGeometry(.18,.055,6,24),red,0,.15,0,Math.PI/2,0,0,g,false);
      box(.13,.025,.6,red,-.14,.07,.19,g,false,.25);box(.13,.026,.58,red,.11,.073,.16,g,false,-.3);
    }else{
      const wood=new T.MeshStandardMaterial({color:0xb59362,roughness:.8});
      box(.12,.05,.86,wood,0,.08,-.09,g,false);box(.48,.06,.09,materials.wood,0,.1,.2,g,false);box(.1,.06,.25,materials.wood,0,.1,.33,g,false);
    }
    target(id,id==='orb'?'Осмотреть шар':id==='ribbon'?'Осмотреть ленту':'Осмотреть меч',x,1.65,2.5,3.5,g);
  }

  // Departure board: unreadable destinations until identity returns.
  const board=label(' ',11.6,5,-7.7,7,2.5);board.canvas.width=1120;board.canvas.height=400;
  function updateBoard(remembered){
    const c=board.ctx;c.fillStyle='#142a2b';c.fillRect(0,0,1120,400);c.strokeStyle='#b9aa78';c.lineWidth=3;c.strokeRect(8,8,1104,384);
    c.fillStyle='#dfcfaa';c.textAlign='left';c.font='26px Georgia';c.fillText('VERTREK  /  DÉPART  /  ОТПРАВЛЕНИЕ',38,58);
    c.font='66px Georgia';c.fillText('14:00',40,164);c.fillText('14:05',40,280);
    c.font='32px Georgia';c.fillText(remembered?'ПОЕЗД УШЁЛ':'▥▥ ▥▥▥▥▥',335,161);c.fillText(remembered?'ПОСЛЕДНИЙ ПОЕЗД':'▥▥▥▥ ▥▥▥',335,277);
    c.fillStyle='#8caa9a';c.font='20px Georgia';c.fillText(remembered?'ПОСАДКА · ПЛАТФОРМА 2':'—   —   —',337,322);
    c.strokeStyle='#6d796555';c.beginPath();c.moveTo(28,207);c.lineTo(1092,207);c.stroke();board.texture.needsUpdate=true;
  }updateBoard(false);target('board','Прочитать табло',11.6,5,-7.6,10);

  // Hinged gate, with a strict walkable central passage.
  const gates=[];
  for(const side of [-1,1]){
    const g=new T.Group();g.position.set(side*3,2.4,-12.1);station.add(g);gates.push(g);
    for(let i=0;i<8;i++)box(.055,3.8,.09,materials.iron,-side*(.1+i*.4),1.9,0,g,false);
    for(const yy of [.2,1.2,3.6])box(3,.09,.14,materials.brass,-side*1.5,yy,0,g,false);
  }
  solid(-3.2,3.2,-12.5,-11.8,s=>!s.admitted);target('gate','Путь на перрон',0,3.8,-12,4.5);

  // The iron-and-glass train shed: broad barrel vault, repeated ribs.
  box(36,.5,58,materials.darkStone,0,1.7,-40);
  box(11,1.05,54,materials.pale,0,1.87,-40);
  for(const xx of [-5.28,5.28])box(.19,.035,52,materials.brass,xx,2.416,-40);
  for(let zz=-15;zz>=-64;zz-=1)for(const xx of [-5.03,5.03])box(.32,.045,.15,materials.darkStone,xx,2.42,zz);
  for(let z=-16;z>=-68;z-=6){
    for(const x of [-17,17]){cyl(.16,.25,8,materials.iron,x,6,z);box(.7,.4,.7,materials.stone,x,2.1,z);}
    const p=[];for(let k=0;k<=32;k++){let a=k*Math.PI/32;p.push(new T.Vector3(Math.cos(a)*17,10+Math.sin(a)*10,z));}tube(p,.16,materials.iron);
    for(const yy of [9.2,9.6])box(34,.09,.1,materials.iron,0,yy,z);
    for(let x=-15;x<15;x+=3)tube([new T.Vector3(x,9.2,z),new T.Vector3(x+1.5,9.6,z),new T.Vector3(x+3,9.2,z)],.035,materials.iron);
  }
  for(let k=0;k<16;k++){
    const a=k/16*Math.PI,b=(k+1)/16*Math.PI;
    const pos=[Math.cos(a)*17,10+Math.sin(a)*10,-14,Math.cos(b)*17,10+Math.sin(b)*10,-14,Math.cos(a)*17,10+Math.sin(a)*10,-69,Math.cos(b)*17,10+Math.sin(b)*10,-69];
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex([0,1,2,2,1,3]);g.computeVertexNormals();mesh(g,materials.glass);
    box(.08,.08,55,materials.iron,Math.cos(a)*17,10+Math.sin(a)*10,-41.5);
  }
  for(const track of [-10,10]){
    for(const xx of [track-.82,track+.82])box(.105,.14,130,materials.rail,xx,1.98,-53);
    for(let z=-14;z>-110;z-=1.05)box(2.6,.15,.22,materials.wood,track,1.86,z);
  }
  label('1',-4.3,5.8,-20,1,1);label('2',4.3,5.8,-20,1,1);
  for(const x of [-4.3,4.3])cyl(.05,.05,4,materials.iron,x,7.9,-20);
  // Restrict walking to the safe central platform, without invisible falls.
  solid(-18,-5.52,-75,-14);solid(5.52,18,-75,-14);

  function character(id,name,role,x,z,opts={}){
    const g=new T.Group(),scale=opts.child?.72:1;g.position.set(x,opts.y||0,z);g.scale.setScalar(scale);station.add(g);
    const cloth=new T.MeshStandardMaterial({color:opts.color||0x48534b,roughness:.95});
    const skin=new T.MeshStandardMaterial({color:opts.skin||0xba9777,roughness:1});
    const hair=new T.MeshStandardMaterial({color:opts.hair||0x3a3029,roughness:1});
    const pants=new T.MeshStandardMaterial({color:0x303d3b,roughness:.95});
    const parts=[];
    for(const xx of [-.14,.14]){cyl(.11,.095,.69,pants,xx,.45,0,g,false);box(.2,.14,.35,materials.black,xx,.08,.065,g,false);}
    cyl(.24,.32,.68,cloth,0,1.08,0,g,false);
    box(.055,.64,.06,materials.brass,0,1.12,.25,g,false);
    for(const xx of [-.34,.34]){const a=cyl(.085,.095,.59,cloth,xx,1.09,0,g,false,xx*.2);parts.push(a);sphere(.095,skin,xx,.76,.015,g,false);}
    cyl(.095,.105,.15,skin,0,1.49,0,g,false);
    const head=new T.Group();head.position.y=1.68;g.add(head);
    const h=sphere(.235,skin,0,0,0,head,false);h.scale.set(.86,1.08,.89);
    mesh(new T.SphereGeometry(.237,12,8,0,Math.PI*2,0,Math.PI*.52),hair,0,.035,-.025,0,0,0,head,false);
    for(const xx of [-.074,.074])sphere(.019,materials.black,xx,.012,.188,head,false);
    sphere(.035,skin,0,-.037,.205,head,false);
    if(opts.hat){cyl(.29,.31,.12,cloth,0,.23,0,head,false);cyl(.24,.24,.23,cloth,0,.39,0,head,false);box(.3,.025,.2,materials.brass,0,.26,.18,head,false);}
    if(opts.scarf){const scarf=new T.MeshStandardMaterial({color:0x873741});cyl(.16,.17,.14,scarf,0,1.47,0,g,false);box(.12,.36,.07,scarf,.13,1.3,.27,g,false);}
    if(id==='elder'){box(.37,.46,.1,materials.wood,.34,.99,.2,g,false);box(.3,.36,.025,materials.pale,.34,1,.262,g,false);}
    const mark=new T.Mesh(new T.OctahedronGeometry(.075),new T.MeshBasicMaterial({color:0xe5c892}));mark.position.y=2.22;g.add(mark);
    const tar=target(id,'Поговорить · '+name,x,(opts.y||0)+1.4*scale,z,3.7,g);
    const npc={id,name,role,group:g,head,parts,mark,target:tar,origin:g.position.clone(),adult:['mother','man','father'].includes(id)};npcs.push(npc);solid(x-.34,x+.34,z-.34,z+.34,s=>!s.name||!npc.adult);return npc;
  }
  character('boy','Мальчик','Пассажир',-5.7,15.5,{child:true,color:0x546e73,hair:0x754e2e});
  character('mother','Женщина','Первый поезд',-7.5,15.2,{color:0x5b454d,scarf:true});
  character('woman','Девушка','Пассажир',8,5.6,{color:0x7b7464,scarf:true,hair:0x8d6845});
  character('man','Юноша','Первый поезд',9.8,5,{color:0x404e50});
  character('father','Мужчина','Первый поезд',-8.2,6.8,{color:0x665947,hat:true});
  character('girl','Девочка','Пассажир',-6.7,7.1,{child:true,color:0x805848,hair:0x5d422d});
  character('seller','Продавец','Хозяин магазина',-12.1,.65,{color:0x414b47,hat:true,hair:0x989180});
  character('elder','Старик','У перрона',3.7,-5.2,{y:.96,color:0x273f3d,hat:true,hair:0xbab3a0});

  // Steam locomotives, coupled carriages, wheels and side windows.
  function train(x,z,colour){
    const g=new T.Group();g.position.set(x,2.05,z);scene.add(g);
    const paint=new T.MeshStandardMaterial({color:colour,metalness:.45,roughness:.45});
    const warm=new T.MeshStandardMaterial({color:0xd8b574,emissive:0x795c2b,emissiveIntensity:.5,roughness:.5});
    box(2.6,.38,8.5,materials.black,0,.7,-3.1,g,false);
    cyl(1.05,1.05,5.5,paint,0,1.83,-3.4,g,false,0,Math.PI/2);
    cyl(1.1,1.1,.15,materials.brass,0,1.83,-6.21,g,false,0,Math.PI/2);
    sphere(.22,materials.lamp,0,2.2,-6.35,g,false);
    cyl(.29,.22,1.22,materials.black,0,3.03,-5.35,g,false);
    cyl(.39,.29,.19,materials.brass,0,3.7,-5.35,g,false);
    for(const zz of [-4.2,-2.5]){cyl(.27,.35,.55,materials.brass,0,2.97,zz,g,false);}
    box(2.55,2.15,2.4,paint,0,1.77,.2,g,false);
    box(2.78,.22,2.8,materials.black,0,2.96,.2,g,false);
    for(const side of [-1,1]){
      box(.06,.77,1.2,warm,side*1.3,2.13,.22,g,false);
      for(const zz of [-4.9,-3.2,-1.5,.35]){
        cyl(.64,.64,.18,materials.black,side*1.33,.61,zz,g,false,Math.PI/2);
        cyl(.46,.46,.2,materials.brass,side*1.34,.61,zz,g,false,Math.PI/2);
        cyl(.36,.36,.22,paint,side*1.35,.61,zz,g,false,Math.PI/2);
      }
      box(.07,.08,5.6,materials.rail,side*1.5,.6,-2.3,g,false);
    }
    for(const zz of [7.5,17.5]){
      box(2.8,2.38,8.8,paint,0,1.69,zz,g,false);
      box(3,.28,9.1,materials.black,0,3,zz,g,false);
      box(2.85,.13,8.7,materials.brass,0,1,zz,g,false);
      for(const side of [-1,1]){
        for(let j=0;j<5;j++){
          box(.06,1,1.05,materials.brass,side*1.42,2.02,zz-3.25+j*1.62,g,false);
          box(.075,.83,.91,warm,side*1.425,2.02,zz-3.25+j*1.62,g,false);
        }
        for(const wheelz of [-2.7,2.7])cyl(.48,.48,.19,materials.black,side*1.34,.53,zz+wheelz,g,false,Math.PI/2);
      }
      box(.85,1.85,.07,materials.wood,0,1.75,zz+4.43,g,false);
    }
    return g;
  }
  const train1=train(-10,-44,0x3b5550),train2=train(9,-44,0x354f4b);
  const boarding=target('train','Monter',4.7,3.7,-23.8,4);boarding.label='Сесть в последний поезд';
  box(1.8,.22,2,materials.darkStone,6.2,2.36,-23.8);
  const steamMaterial=new T.MeshBasicMaterial({color:0xe0e5d7,transparent:true,opacity:.16,depthWrite:false});
  const steam=[];for(let i=0;i<16;i++){const p=new T.Mesh(new T.SphereGeometry(1,7,5),steamMaterial);scene.add(p);steam.push(p);}
  const dustGeometry=new T.BufferGeometry(),dust=[];let seed=781;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<350;i++)dust.push((random()-.5)*31,random()*17,random()*34-8);
  dustGeometry.setAttribute('position',new T.Float32BufferAttribute(dust,3));const motes=new T.Points(dustGeometry,new T.PointsMaterial({color:0xe3d2a3,size:.026,transparent:true,opacity:.4,depthWrite:false}));station.add(motes);

  // Vegetation on the abandoned rails appears during the departure.
  const growth=new T.Group();scene.add(growth);growth.visible=false;
  for(let i=0;i<180;i++){
    const xx=(i%2?-10:10)+(random()-.5)*2.5,zz=-14-random()*90;
    mesh(new T.ConeGeometry(.15+random()*.2,.4+random()*.7,4),materials.grass,xx,2.14,zz,0,random()*3,0,growth);
  }

  // Merge immutable geometry by material: affordable on mobile GPUs.
  for(const {mat,group,list} of batches.values()){
    let n=0;for(const g of list)n+=g.attributes.position.count;
    const p=new Float32Array(n*3),normal=new Float32Array(n*3),uv=new Float32Array(n*2);let offset=0;
    for(const g of list){const count=g.attributes.position.count;p.set(g.attributes.position.array,offset*3);normal.set(g.attributes.normal.array,offset*3);if(g.attributes.uv)uv.set(g.attributes.uv.array,offset*2);offset+=count;g.dispose();}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(p,3));g.setAttribute('normal',new T.BufferAttribute(normal,3));g.setAttribute('uv',new T.BufferAttribute(uv,2));g.computeBoundingSphere();
    const m=new T.Mesh(g,mat);m.castShadow=!mat.transparent;m.receiveShadow=true;group.add(m);
  }batches.clear();

  let gateAmount=0,remembered=false,departure=0;
  function update(dt,time,state,camera){
    if(!!state.name!==remembered){remembered=!!state.name;updateBoard(remembered);}
    if(vanishingWing)vanishingWing.visible=!state.name;
    gateAmount=T.MathUtils.damp(gateAmount,state.admitted?1:0,2.2,dt);gates[0].rotation.y=gateAmount*Math.PI*.48;gates[1].rotation.y=-gateAmount*Math.PI*.48;
    const seconds=state.departed?50700:state.name?Math.min(50699,50400+time*.25):50399;
    hands[0].rotation.z=-((seconds/3600)%12)*Math.PI/6;hands[1].rotation.z=-(seconds/60%60)*Math.PI/30;hands[2].rotation.z=-(seconds%60)*Math.PI/30;
    for(const [id,g] of Object.entries(items)){g.visible=!state.held.includes(id)&&!state.memories.includes(id);if(id==='orb')g.rotation.y=time*.32;}
    for(let i=0;i<npcs.length;i++){
      const n=npcs[i];n.mark.rotation.y=time*.7;n.mark.position.y=2.2+Math.sin(time*1.7+i)*.04;n.head.rotation.z=Math.sin(time*.65+i)*.018;
      n.group.visible=!(state.name&&n.adult)&&(!state.departed||n.id==='elder');
      if(n.group.visible){const dx=camera.position.x-n.group.position.x,dz=camera.position.z-n.group.position.z;if(dx*dx+dz*dz<60)n.group.rotation.y=Math.atan2(dx,dz);}
      if(state.admitted&&['boy','woman','girl'].includes(n.id)){
        const idx=['boy','woman','girl'].indexOf(n.id);n.group.position.set(-1.4+idx*1.4,2.4,-24.5);n.target.position.set(n.group.position.x,3.6,n.group.position.z);
      }
    }
    if(state.name)train1.position.z-=dt*5;
    if(state.departed){departure+=dt;train2.position.z-=dt*Math.min(14,departure*.9);growth.visible=true;growth.scale.y=Math.min(1,departure/6);station.position.y=Math.max(0,departure-2)*.42;}
    for(let i=0;i<steam.length;i++){
      const phase=(time*.2+i/steam.length)%1,p=steam[i],source=i%2?train2:train1;
      p.position.set(source.position.x+phase*2,source.position.y+3.7+phase*7,source.position.z-5.35+phase*3);p.scale.setScalar(.5+phase*2.2);
    }
    motes.rotation.y=Math.sin(time*.04)*.01;
  }
  function floorHeight(x,z){if(z<=-10)return 2.4;if(z< -1.75&&Math.abs(x)<5.3)return Math.max(0,(-1.75-z)/8.25*2.4);return 0;}
  function canMove(x,z,state,r=.25){
    if(x< -16.8||x>16.8||z>24.3||z< -63)return false;
    for(const s of solids)if((!s.condition||s.condition(state))&&x>s.x1-r&&x<s.x2+r&&z>s.z1-r&&z<s.z2+r)return false;
    return true;
  }
  return {station,targets,npcs,items,train1,train2,growth,solids,update,canMove,floorHeight,materials};
}
