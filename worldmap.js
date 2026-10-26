/* Friend Tracker in-house world map (ft-v41). No external requests: draws the bundled Natural Earth data (worldmap-data.js, public domain) as SVG.
   API:
     const m = FTMap.create(el, {onPinTap(pin)})   build the map inside el
     m.addPin(lat, lng, label, {count, html, highlight}) -> pin  (pin.remove(), pin.el, pin.lat, pin.lng, pin.label)
     m.clearPins()   m.pins()   m.fitPins({padding, maxZoom})   m.setView(lat, lng, zoom)   m.zoomBy(factor)   m.reset()
     m.openPopup(pin)   m.closePopup()   m.highlight(['SE','FI'])   m.project(lat, lng) -> [x, y] in map units   m.getView()   m.destroy()
   Projection: Natural Earth I (same formula the data was pre-projected with). Zoom 1 = whole world fits the width; max zoom 12. */
(function(){
const R=Math.PI/180;
function proj(lat,lng,S){lat=Math.max(-90,Math.min(90,+lat));lng=+lng;if(lng>180||lng<-180)lng=((lng+540)%360)-180;const l=lng*R,p=lat*R,p2=p*p,p4=p2*p2;
 return [l*(0.8707-0.131979*p2+p4*(-0.013791+p4*(0.003971*p2-0.001529*p4)))*S,-p*(1.007226+p2*(0.015085+p4*(-0.044475+0.028874*p2-0.005916*p4)))*S]}
const NS='http://www.w3.org/2000/svg';
function create(el,opts){opts=opts||{};const W=self.FT_WORLD;if(!W)throw new Error('FT_WORLD data missing');const S=W.s,OX=W.w/2,OY=W.h/2;
 let home=null;const P=(lat,lng)=>{const q=proj(lat,lng,S);return [q[0]+OX,q[1]+OY]};
 el.classList.add('ftm');el.innerHTML='';
 const svg=document.createElementNS(NS,'svg');svg.setAttribute('class','ftm-svg');svg.setAttribute('role','img');svg.setAttribute('aria-label','World map');svg.setAttribute('preserveAspectRatio','xMidYMid meet');
 // sphere outline (λ = ±180) and graticule, sampled so curves stay smooth
 const line=pts=>'M'+pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join('L');
 const merid=(lng,a=-90,b=90)=>{const o=[];for(let t=a;t<=b;t+=2)o.push(P(t,lng));return o};
 const paral=lat=>{const o=[];for(let t=-180;t<=180;t+=3)o.push(P(lat,t));return o};
 const sphere=line(merid(-180).concat(merid(180).reverse()))+'Z';
 let grat='';for(let g=-150;g<=150;g+=30)grat+=line(merid(g,-80,80));for(let g=-60;g<=60;g+=30)grat+=line(paral(g));
 const eq=line(paral(0));
 svg.innerHTML=`<defs><linearGradient id="ftmSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b6ca8"/><stop offset=".5" stop-color="#1d5891"/><stop offset="1" stop-color="#2b6ca8"/></linearGradient><clipPath id="ftmClip"><path d="${sphere}"/></clipPath></defs>`+
  `<path class="ftm-sea" d="${sphere}" fill="url(#ftmSea)"/><g><path class="ftm-grat" d="${grat}"/><path class="ftm-eq" d="${eq}"/><g class="ftm-land">${W.c.map(c=>`<path data-iso="${c[0]}" d="${c[2]}"><title>${c[1].replace(/[<&]/g,'')}</title></path>`).join('')}</g>${self.FT_ADM1?`<g class="ftm-adm1" aria-hidden="true">${Object.entries(self.FT_ADM1).map(([cc,d])=>`<path data-iso="${cc}" d="${d}"/>`).join('')}</g>`:''}</g><path class="ftm-rim" d="${sphere}"/>`;
 svg.querySelector('.ftm-land').setAttribute('transform',`translate(${OX} ${OY})`);{const g2=svg.querySelector('.ftm-adm1');if(g2)g2.setAttribute('transform',`translate(${OX} ${OY})`)}
 const pinL=document.createElement('div');pinL.className='ftm-pins';
 const ui=document.createElement('div');ui.className='ftm-ui';ui.innerHTML='<button type="button" class="ftm-b" data-z="in" aria-label="Zoom in">+</button><button type="button" class="ftm-b" data-z="out" aria-label="Zoom out">−</button><button type="button" class="ftm-b" data-z="home" aria-label="Show whole world">⌂</button>';
 // no visible credit: Natural Earth data is public domain (see worldmap-LICENSE.txt)
 el.append(svg,pinL,ui);
 // view state: centre (cx,cy) in map units, zoom k
 let cw=1,ch=1,b=1,k=1,cx=OX,cy=OY,raf=0,rl=0,rt=0,vk=1,vcx=OX,vcy=OY,live=false,cmT=0,anim=0,lastPs='',lastAd='',lastZ3=null,popW=0,popH=0,pins=[],pop=null,popPin=null;const KMAX=opts.maxZoom||12,ZST=opts.zoomStep||2,PSMIN=opts.minPinScale||.66,CLR=opts.clusterRadius!=null?opts.clusterRadius:(self.FT_MAP_CLUSTER!=null?self.FT_MAP_CLUSTER:28);let clu=[],cluK=-1,cluN=-1;
 const kmin=()=>Math.max(.5,Math.min(1,(ch/b)/W.h)); // allow seeing the whole world in short boxes
 const measure=()=>{const r=el.getBoundingClientRect();rl=r.left;rt=r.top;cw=Math.max(1,r.width);ch=Math.max(1,r.height);b=cw/W.w};
// ft-v50: the SVG is twice the box size (a half-box margin on every side) and rasterised only when the view is committed;
// during a gesture or animation it is just moved/scaled with a CSS transform (GPU compositing, no re-raster).
const swr=document.createElement('div');swr.className='ftm-sw';swr.style.cssText='position:absolute;left:-50%;top:-50%;width:200%;height:200%;transform-origin:50% 50%;will-change:transform;contain:strict;pointer-events:none';svg.style.cssText+=';position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:auto';el.insertBefore(swr,svg);swr.appendChild(svg);
function commit(){cmT=0;vk=k;vcx=cx;vcy=cy;const vw=2*cw/(b*k),vh=2*ch/(b*k);svg.setAttribute('viewBox',`${(cx-vw/2).toFixed(5)} ${(cy-vh/2).toFixed(5)} ${vw.toFixed(5)} ${vh.toFixed(5)}`);swr.style.transform='';
 const ps=Math.max(PSMIN,Math.min(1,PSMIN+(1-PSMIN)*Math.log2(Math.max(1,k))/2)).toFixed(2);if(ps!==lastPs){lastPs=ps;el.style.setProperty('--ps',ps)}const ad=Math.min(.95,.6+.12*Math.log2(Math.max(1,k))).toFixed(2);if(ad!==lastAd){lastAd=ad;el.style.setProperty('--admo',ad)}const z3=k>=3;if(z3!==lastZ3){lastZ3=z3;el.classList.toggle('ftm-z3',z3)}if(pop){popW=pop.firstChild.offsetWidth;popH=pop.firstChild.offsetHeight}}
function placeSvg(){const s=k/vk,tx=(vcx-cx)*b*k,ty=(vcy-cy)*b*k;const off=Math.max(Math.abs(tx),Math.abs(ty))/Math.min(cw,ch);
 if(!live||s<.6||s>1.7||off>.45)commit();else{swr.style.transform=`translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${s.toFixed(4)})`;clearTimeout(cmT);cmT=0}}
 const clamp=()=>{k=Math.max(kmin(),Math.min(KMAX,k));const vw=cw/(b*k),vh=ch/(b*k);if(opts.freePan){/* ft-v48 (pin picker): free pan at any zoom: the centre may reach any point of the world, edges included */cx=Math.max(0,Math.min(W.w,cx));cy=Math.max(0,Math.min(W.h,cy))}else{cx=vw>=W.w?OX:Math.max(vw/2,Math.min(W.w-vw/2,cx));cy=vh>=W.h?OY:Math.max(vh/2,Math.min(W.h-vh/2,cy))}};
 const toScreen=(x,y)=>[(x-cx)*b*k+cw/2,(y-cy)*b*k+ch/2];
 function draw(){raf=0;clamp();placeSvg();
  if(cluK!==k||cluN!==pins.length)recluster();
  for(const c of clu){const [x,y]=toScreen(c.x,c.y),e=c.el;e.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;e.style.zIndex=String(Math.round(y)+2000);e.hidden=x<-40||y<-40||x>cw+40||y>ch+40}
  if(me){const [x,y]=toScreen(me.x,me.y);me.el.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;me.el.hidden=x<-60||y<-60||x>cw+60||y>ch+60}
  if(pop&&popPin){const [x,y]=toScreen(popPin.x,popPin.y);pop.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;const bx=pop.firstChild,w=popW,h=popH;const ph=40*(parseFloat(el.style.getPropertyValue('--ps'))||1)+12;pop.classList.toggle('below',y-ph-h<4&&y+16+h<=ch-4);const dx=Math.max(4-(x-w/2),Math.min(0,cw-4-(x+w/2)));bx.style.marginLeft=dx.toFixed(1)+'px'}
  el.dataset.zoom=k.toFixed(2);if(opts.onDraw)try{opts.onDraw()}catch(x){}}
 // ft-v44: classic push pin: glossy ball head with a highlight on a thin needle whose tip is the coordinate. Stable head colour per key.
 const COLS=opts.pinColors||['#e63946','#f4a300','#2a9d8f','#8e5bd6','#f3722c'];
 const hue=key=>{let h=0;for(const ch of String(key||''))h=(h*31+ch.codePointAt(0))>>>0;return COLS[h%COLS.length]};let gid=0;
 function pinSVG(col,count){const id='ftg'+(++gid);return `<svg class="ftm-push" viewBox="0 0 26 40" aria-hidden="true"><defs><radialGradient id="${id}" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".18" stop-color="${col}"/><stop offset="1" stop-color="${col}" stop-opacity="1"/></radialGradient></defs>`+
  `<ellipse class="ftm-sh" cx="15.5" cy="39.2" rx="3.2" ry="1.1"/><path class="ftm-ndl" d="M13 21 L13.55 39.6 L13 40 L12.45 39.6 Z"/>`+
  `<circle cx="13" cy="11" r="10.5" fill="${col}"/><circle cx="13" cy="11" r="10.5" fill="url(#${id})"/><circle class="ftm-rimc" cx="13" cy="11" r="10.5"/><ellipse class="ftm-hl" cx="9.6" cy="7.4" rx="3.4" ry="2.3" transform="rotate(-30 9.6 7.4)"/></svg>`+
  (count!=null?`<span class="ftm-cnt${count>99?' s':''}">${count}</span>`:'')}
 // clustering: pins whose screen positions are within CLR px merge into one pin with the summed count (recomputed per zoom)
 const cluL=[];
 function recluster(){cluK=k;cluN=pins.length;for(const c of clu)if(c.cl)c.el.remove();const Z=b*k;const S=pins.slice().sort((a,c)=>c.lat-a.lat);const out=[];
  for(const p of S){let best=null,bd=CLR;for(const c of out){const d=Math.hypot((c.x-p.x)*Z,(c.y-p.y)*Z);if(d<bd){bd=d;best=c}}if(best){best.m.push(p);const n=best.m.length;best.x=best.m.reduce((s,q)=>s+q.x,0)/n;best.y=best.m.reduce((s,q)=>s+q.y,0)/n}else out.push({x:p.x,y:p.y,m:[p]})}
  clu=out.map(c=>{if(c.m.length===1){c.m[0].el.hidden=false;return {x:c.m[0].x,y:c.m[0].y,el:c.m[0].el,m:c.m}}
   c.m.forEach(q=>q.el.hidden=true);const n=c.m.reduce((s,q)=>s+(q.count||1),0),big=c.m.slice().sort((a,q)=>(q.count||1)-(a.count||1))[0];
   const e=document.createElement('button');e.type='button';e.className='ftm-pin ftm-clu';const names=c.m.map(q=>q.label).join(', ');e.title=names;e.setAttribute('aria-label',`${names} (${n})`);e.innerHTML=pinSVG(hue(big.key),n);
   const cl={x:c.x,y:c.y,el:e,m:c.m,cl:true,label:names,count:n};e.addEventListener('click',ev=>{ev.stopPropagation();tapCluster(cl)});pinL.appendChild(e);return cl});
  if(popPin&&popPin.cl&&!clu.includes(popPin))closePopup()}
 function tapCluster(c){if(k<KMAX-1e-3){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const q of c.m){x0=Math.min(x0,q.x);y0=Math.min(y0,q.y);x1=Math.max(x1,q.x);y1=Math.max(y1,q.y)}
   const pad=60,kw=(cw-2*pad)/Math.max(1e-6,(x1-x0)*b),kh=(ch-2*pad)/Math.max(1e-6,(y1-y0)*b);closePopup();animTo(Math.min(KMAX,Math.max(k*2,Math.min(kw,kh))),(x0+x1)/2,(y0+y1)/2,320);return}
  // already at max zoom: one combined popup
  const box=document.createElement('div');box.className='ftm-multi';for(const q of c.m)if(q.html!=null){if(typeof q.html==='string'){const d=document.createElement('div');d.innerHTML=q.html;box.appendChild(d)}else box.appendChild(q.html)}
  openPopup({x:c.x,y:c.y,label:c.label,html:box,cl:true})}
 const req=()=>{if(!raf)raf=requestAnimationFrame(draw)};
function settle(){live=!!(g||anim);if(!live&&!cmT)cmT=setTimeout(()=>{cmT=0;if(!g&&!anim){commit();draw()}},120)}
function stopAnim(){if(anim){cancelAnimationFrame(anim);anim=0}}
// ft-v50: animated zoom (zoom buttons, double-tap, home, cluster tap): ~260 ms ease-out in log-zoom space around a focal point
function animTo(k1,x1,y1,ms){stopAnim();k1=Math.max(kmin(),Math.min(KMAX,k1));const k0=k,x0=cx,y0=cy,t0=performance.now();ms=ms||260;live=true;
 const st=t=>{let u=Math.min(1,(t-t0)/ms);u=1-Math.pow(1-u,3);k=Math.exp(Math.log(k0)+(Math.log(k1)-Math.log(k0))*u);cx=x0+(x1-x0)*u;cy=y0+(y1-y0)*u;draw();if(u<1)anim=requestAnimationFrame(st);else{anim=0;settle()}};anim=requestAnimationFrame(st)}
 function zoomAt(f,sx,sy,animate){const k0=k,k1=Math.max(kmin(),Math.min(KMAX,k*f));if(k1===k0)return;sx=sx==null?cw/2:sx;sy=sy==null?ch/2:sy;const mx=cx+(sx-cw/2)/(b*k0),my=cy+(sy-ch/2)/(b*k0),x1=mx-(sx-cw/2)/(b*k1),y1=my-(sy-ch/2)/(b*k1);
 if(animate)return animTo(k1,x1,y1);k=k1;cx=x1;cy=y1;live=true;req();settle()}
 // gestures: drag to pan, pinch / wheel / double-tap to zoom
 const pts=new Map();let vel=[],g=null,moved=false,lastTap=0,me=null;
 const onDown=e=>{if(e.target.closest('.ftm-ui,.ftm-pop'))return;stopAnim();measure();live=true;vel=[];el.setPointerCapture&&el.setPointerCapture(e.pointerId);pts.set(e.pointerId,[e.clientX,e.clientY]);moved=false;start()};
 function start(){const a=[...pts.values()];if(a.length===1)g={t:1,x:a[0][0],y:a[0][1],cx,cy};else if(a.length>=2){g={t:2,d:Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1])||1,k,mx:(a[0][0]+a[1][0])/2-rl,my:(a[0][1]+a[1][1])/2-rt,cx,cy}}}
 const onMove=e=>{if(!pts.has(e.pointerId))return;pts.set(e.pointerId,[e.clientX,e.clientY]);const a=[...pts.values()];if(!g)return;
  if(g.t===1&&a.length===1){const dx=a[0][0]-g.x,dy=a[0][1]-g.y;if(Math.abs(dx)+Math.abs(dy)>6)moved=true;if(moved){cx=g.cx-dx/(b*k);cy=g.cy-dy/(b*k);const t=performance.now();vel.push([t,cx,cy]);while(vel.length>1&&t-vel[0][0]>100)vel.shift();req()}}
  else if(g.t===2&&a.length>=2){moved=true;vel=[];const d=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1])||1,mx=(a[0][0]+a[1][0])/2-rl,my=(a[0][1]+a[1][1])/2-rt;
   const k1=Math.max(kmin(),Math.min(KMAX,g.k*d/g.d));const ux=g.cx+(g.mx-cw/2)/(b*g.k),uy=g.cy+(g.my-ch/2)/(b*g.k);k=k1;cx=ux-(mx-cw/2)/(b*k);cy=uy-(my-ch/2)/(b*k);req()}};
 const onUp=e=>{if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);if(pts.size)start();else{g=null;fling();
  if(!moved&&e.type==='pointerup'&&!e.target.closest('.ftm-pin')){const now=Date.now(),r=el.getBoundingClientRect();if(opts.onTap&&!e.target.closest('.ftm-me,.ftm-ui')&&now-lastTap>=320)opts.onTap(api.toLatLng(e.clientX,e.clientY));if(now-lastTap<320){zoomAt(ZST,e.clientX-r.left,e.clientY-r.top,true);lastTap=0}else{lastTap=now;closePopup()}}}};
 // ft-v50: fling inertia: release velocity (last 100 ms) decays exponentially (time constant 325 ms, like native scroll)
function fling(){const v=vel;vel=[];if(!moved||v.length<2||performance.now()-v[v.length-1][0]>60){settle();return}const a=v[0],z=v[v.length-1],dt=Math.max(8,z[0]-a[0]);let vx=(z[1]-a[1])/dt,vy=(z[2]-a[2])/dt;
 if(Math.hypot(vx,vy)*b*k<.12){settle();return}let t0=performance.now();live=true;const st=t=>{const d=t-t0;t0=t;const f=Math.exp(-d/325);cx+=vx*325*(1-f);cy+=vy*325*(1-f);vx*=f;vy*=f;const px=cx,py=cy;draw();if(cx!==px||cy!==py){vx=vy=0}if(Math.hypot(vx,vy)*b*k>.04)anim=requestAnimationFrame(st);else{anim=0;settle()}};anim=requestAnimationFrame(st)}
el.addEventListener('touchmove',e=>{if(e.cancelable)e.preventDefault()},{passive:false});
el.addEventListener('pointerdown',onDown);el.addEventListener('pointermove',onMove);el.addEventListener('pointerup',onUp);el.addEventListener('pointercancel',onUp);
 el.addEventListener('click',e=>{if(moved&&e.target.closest('.ftm-pin')){e.stopPropagation();e.preventDefault()}},true);
 el.addEventListener('wheel',e=>{e.preventDefault();const r=el.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*0.0022),e.clientX-r.left,e.clientY-r.top)},{passive:false});
 ui.addEventListener('click',e=>{const z=e.target.closest('[data-z]');if(!z)return;if(z.dataset.z==='in')zoomAt(ZST,null,null,true);else if(z.dataset.z==='out')zoomAt(1/ZST,null,null,true);else{measure();if(home){const q=P(home[0],home[1]);animTo(home[2],q[0],q[1],320)}else animTo(1,OX,OY,320)}});
 const ro=window.ResizeObserver?new ResizeObserver(()=>{measure();req()}):null;if(ro)ro.observe(el);
 function closePopup(){if(pop){pop.remove();pop=null;popPin=null}}
 function openPopup(p){closePopup();if(p.html==null)return;pop=document.createElement('div');pop.className='ftm-pop';pop.setAttribute('role','dialog');pop.setAttribute('aria-label',p.label||'Pin');
  const box=document.createElement('div');box.className='ftm-popc';if(typeof p.html==='string')box.innerHTML=p.html;else box.appendChild(p.html);
  const x=document.createElement('button');x.type='button';x.className='ftm-px';x.setAttribute('aria-label','Close');x.textContent='×';x.onclick=closePopup;box.appendChild(x);pop.append(box);el.appendChild(pop);popPin=p;popW=box.offsetWidth;popH=box.offsetHeight;draw()}
 const api={
  addPin(lat,lng,label,o){o=o||{};const [x,y]=P(lat,lng);const e=document.createElement('button');e.type='button';e.className='ftm-pin';e.setAttribute('aria-label',(label||'Pin')+(o.count?` (${o.count})`:''));e.title=label||'';
   const key=o.key||label;e.innerHTML=pinSVG(hue(key),o.count);const p={lat:+lat,lng:+lng,label:label||'',key,count:o.count,x,y,el:e,html:o.html==null?null:o.html,remove(){e.remove();pins=pins.filter(q=>q!==p);if(popPin===p)closePopup();cluN=-1;req()}};
   e.addEventListener('click',()=>{if(opts.onPinTap)opts.onPinTap(p);openPopup(p)});pinL.appendChild(e);pins.push(p);req();return p},
  clearPins(){closePopup();pins.forEach(p=>p.el.remove());clu.forEach(c=>{if(c.cl)c.el.remove()});clu=[];pins=[];cluN=-1},
  clusters:()=>clu.map(c=>({label:c.cl?c.label:c.m[0].label,count:c.cl?c.count:(c.m[0].count||1),members:c.m.length,el:c.el})),
  pins:()=>pins.slice(),
  project:(lat,lng)=>P(lat,lng),
  fitPins(o){o=o||{};const pad=o.padding==null?30:o.padding,mz=o.maxZoom||5;measure();if(!pins.length)return api.reset();let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const p of pins){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y)}
   const kw=(cw-2*pad)/Math.max(1e-6,(x1-x0)*b),kh=(ch-2*pad)/Math.max(1e-6,(y1-y0)*b);k=Math.min(mz,kw,kh);cx=(x0+x1)/2;cy=(y0+y1)/2;stopAnim();live=false;draw();return api},
  setView(lat,lng,z){measure();const [x,y]=P(lat,lng);cx=x;cy=y;if(z)k=z;stopAnim();live=false;draw();return api},
  maxZoom(){return KMAX},zoom(){return k},zoomBy(f){zoomAt(f);return api},
  setHome(lat,lng,z){home=lat==null?null:[lat,lng,z||1];return api},
  reset(){measure();k=1;cx=OX;cy=OY;stopAnim();live=false;draw();return api},
  getView:()=>({zoom:k,center:[cx,cy],size:[cw,ch]}),
  openPopup,closePopup,
  // ft-v47: screen → lat/lng (inverse of the projection by Newton steps), a separate "me" marker (never clustered)
  toLatLng(clientX,clientY){const r={left:rl,top:rt};measure();r.left=rl;r.top=rt;const X=cx+(clientX-r.left-cw/2)/(b*k),Y=cy+(clientY-r.top-ch/2)/(b*k);let la=-(Y-OY)/(W.h/2)*90,ln=(X-OX)/(W.w/2)*180;la=Math.max(-89.9,Math.min(89.9,la));ln=Math.max(-179.9,Math.min(179.9,ln));
   for(let it=0;it<30;it++){const [x0,y0]=P(la,ln),h=1e-4,[xa,ya]=P(la+h,ln),[xb,yb]=P(la,ln+h);const j11=(xa-x0)/h,j21=(ya-y0)/h,j12=(xb-x0)/h,j22=(yb-y0)/h,det=j11*j22-j12*j21;if(!det)break;const ex=X-x0,ey=Y-y0;const dla=(j22*ex-j12*ey)/det,dln=(-j21*ex+j11*ey)/det;la=Math.max(-89.99,Math.min(89.99,la+dla));ln=Math.max(-180,Math.min(180,ln+dln));if(Math.abs(dla)+Math.abs(dln)<1e-7)break}
   return {lat:+la.toFixed(5),lng:+ln.toFixed(5)}},
  setMe(lat,lng,label,o){o=o||{};if(me){me.el.remove();me=null}if(lat==null)return api;const [x,y]=P(lat,lng);const e=document.createElement('button');e.type='button';e.className='ftm-me';e.setAttribute('aria-label',label||'You');e.title=label||'You';
   e.innerHTML=`<span class="ftm-mel">${o.text||'You'}</span><span class="ftm-med"></span>`;me={x,y,lat:+lat,lng:+lng,el:e,label,html:o.html};e.addEventListener('click',ev=>{ev.stopPropagation();if(o.html!=null)openPopup({x,y,label,html:o.html})});pinL.appendChild(e);req();return api},
  toScreen(lat,lng){const [x,y]=P(lat,lng),[sx,sy]=toScreen(x,y);return [sx,sy]},
  getMe:()=>me&&{lat:me.lat,lng:me.lng,el:me.el,label:me.label},
  highlight(list){const s=new Set(list||[]);svg.querySelectorAll('.ftm-land path,.ftm-adm1 path').forEach(p=>p.classList.toggle('on',s.has(p.dataset.iso)))},
  invalidateSize(){measure();stopAnim();live=false;draw()},
  destroy(){if(ro)ro.disconnect();cancelAnimationFrame(raf);stopAnim();clearTimeout(cmT);el.innerHTML='';el.classList.remove('ftm')}};
 measure();draw();return api}
let loading=null;
/* ft-v49: optional US/Mexico state borders (worldmap-adm1.js); the map works without them */
let adm1L=null;const adm1=()=>self.FT_ADM1?Promise.resolve():adm1L=adm1L||new Promise(res=>{const s=document.createElement('script');s.src='worldmap-adm1.js?v=50';s.onload=s.onerror=()=>res();document.head.appendChild(s)});
function load(src){if(self.FT_WORLD)return adm1();return loading=loading||Promise.all([adm1(),new Promise((res,rej)=>{const s=document.createElement('script');s.src=src||'worldmap-data.js';s.onload=()=>self.FT_WORLD?res():rej(new Error('map data'));s.onerror=()=>{loading=null;rej(new Error('map data'))};document.head.appendChild(s)})]).then(()=>{})}
self.FTMap={V:'v50',create,load,project:(lat,lng)=>proj(lat,lng,(self.FT_WORLD&&self.FT_WORLD.s)||180)};
})();
