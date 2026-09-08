// Coordinates use the painting itself as the reference, not the browser window.
export const ART={
  overview:{file:'assets/illustrated/overview.webp'},
  empty:{file:'assets/illustrated/empty-overview.webp'},
  merchant:{file:'assets/illustrated/merchant.webp'},
  conductor:{file:'assets/illustrated/conductor.webp'},
  mother:{file:'assets/illustrated/mother.webp'},
  father:{file:'assets/illustrated/father.webp'},
  couple:{file:'assets/illustrated/couple.webp'},
  platform:{file:'assets/illustrated/platform.webp'},
  carriage:{file:'assets/illustrated/carriage.webp'}
};
export const REGIONS={
  mother:[[12.4,60],[15.7,60],[17.4,65],[19.3,64],[21.1,66.4],[22,73],[21.4,85],[20,90],[6.8,90],[7.7,81],[10.4,75],[10.7,65]],
  father:[[37,59],[41,59],[42.2,63.9],[44.7,63.4],[46.2,66],[47.2,73],[46.7,90],[41,91],[33.5,91],[34.7,79],[35.2,67]],
  couple:[[76,49],[79,49.6],[81.6,56],[82.5,88],[80,90.5],[68.2,90.5],[66.3,87],[66.4,79],[68.6,77],[69,61.5],[70.2,52.3],[73.4,51.8],[75,56]],
  merchant:[[84.4,44.3],[88,42],[86.4,36],[98.4,30.8],[100,31],[100,83],[83.7,79.5]],
  conductor:[[51.6,51.4],[54.5,51.2],[55.5,55],[55.9,61],[55.1,74],[51.4,74],[50.5,58.8]],
  doors:[[2,19],[7,17],[11.4,24],[12.5,55],[9.8,63],[2,67]],
  clock:[[48.8,5.8],[51.6,6.3],[53.2,10],[52.6,14.4],[50.4,17.2],[47.5,15.8],[46.6,11.2],[47.1,8]],
  gate:[[45,23],[53.5,22],[56,33],[56.4,46.5],[44.5,46.5],[44.5,31]],
  mother_bench:[[.8,70],[27.4,70],[27.8,88.6],[.8,89]],
  father_bench:[[30.5,70],[50.8,70],[50.8,90],[30.5,90]],
  lost_gallery:[[66.8,42],[82.5,42],[83,78],[67,78]],
  platform_boy:[[14.8,42.3],[17.5,42.2],[19.2,46.5],[20,51],[20.4,63],[19.6,73],[19.1,86],[20.3,89.4],[17.9,91],[14,91.2],[13.3,88],[13.1,73],[11.4,62],[12,54],[13.5,51],[13.3,47]],
  platform_girl:[[33.1,42],[35.9,41.7],[37.8,45.2],[38.7,51.3],[39,73.8],[36.5,77],[36.9,87.5],[35.9,89.6],[32,89.6],[31.5,86],[31.7,76],[29.2,74.5],[30.1,61],[30.9,52],[31.8,49.5],[32.2,43]],
  platform_woman:[[56.1,29],[59.7,29],[60.7,33],[60,38],[61.8,44],[63,64],[63.1,80],[60.3,83.5],[60.7,87.6],[58.5,89],[54.5,89],[46.1,87.8],[46,71],[51.3,68],[51.2,55],[51.5,47],[53,40],[53.1,33]],
  platform_elder:[[75.6,26.5],[79.8,27.3],[80.6,30.4],[79.4,35],[81.1,41],[82.2,42.2],[81.5,48],[81,59],[81,80],[80.4,86],[77.6,87],[75.8,85],[73.5,87],[72,86],[72.4,74],[72,64],[71.7,50],[70.2,45],[70.4,39],[72.1,35],[74.5,33.7]],
  train_door:[[89,12.5],[99.7,3],[100,83],[84.4,88],[82.8,84.2],[83.2,75],[87.2,66],[87.5,39],[88.5,18]],
  carriage_window:[[58,14],[86,14],[86,64],[58,64]]
};
export function regionBounds(points){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const x=Math.min(...xs),y=Math.min(...ys);return {x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y};}
export function pointInRegion(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))inside=!inside;}return inside;}
export function fitPainting(width,height){const ratio=16/9,w=Math.min(width,height*ratio);return {width:w,height:w/ratio};}
export function hitRegion(points,width,height){const b=regionBounds(points);if(width<=0||height<=0)return points;const w=Math.min(100,Math.max(b.w,44/width*100)),h=Math.min(100,Math.max(b.h,44/height*100));if(w===b.w&&h===b.h)return points;const left=Math.max(0,Math.min(100-w,b.x+b.w/2-w/2)),top=Math.max(0,Math.min(100-h,b.y+b.h/2-h/2));return [[left,top],[left+w,top],[left+w,top+h],[left,top+h]];}
const full=[0,0,100,100];
export function presentation(state,scenes){
  const scene=scenes[state.scene];let key=scene.art||'overview',frame=full;
  if(key==='overview'&&state.flags.first_train)key='empty';
  const id=state.node||'';
  if(/^wake/.test(id))key='mother';
  if(state.scene!=='platform'&&(/^elder_/.test(id)||['gate','hands','to_platform'].includes(id)))key='conductor';
  if(id==='first_departure')key=state.beat<1?'overview':state.beat<6?'mother':state.beat<10?'father':state.beat<14?'couple':'conductor';
  if(id==='after_first'||id==='lost_gallery')key='empty';
  if(['clock','board'].includes(id)){key=state.flags.first_train?'empty':'overview';frame=[30,0,40,40];}
  if(state.scene==='entrance'){key=state.flags.first_train?'empty':'overview';frame=[0,20,46,46];}
  if(id==='empty_bench'){key='empty';frame=[0,50,50,50];}
  if(id==='empty_father'){key='empty';frame=[24,50,50,50];}
  if(state.scene==='platform'&&id){
    const names={boy_platform:'platform_boy',girl_platform:'platform_girl',girl_platform_after:'platform_girl',girl_waiting:'platform_girl',woman_waiting:'platform_woman',woman_platform:'platform_woman',elder_platform:'platform_elder'};
    const region=REGIONS[names[id]];
    if(region){const b=regionBounds(region),size=64;frame=[Math.max(0,Math.min(100-size,b.x+b.w/2-size/2)),Math.max(0,Math.min(100-size,b.y+b.h/2-size/2)),size,size];}
  }
  if(state.scene==='carriage')key='carriage';
  return {key,frame,file:ART[key].file};
}
