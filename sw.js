const V='v91-beta2',C='ft-'+V;const A=['./','index.html','FriendTracker.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','logo.png','apple-touch-icon.png','favicon.png','badge-96.png','favicon.ico','splash.jpg','award.mp3','qrcode.min.js','jsqr.min.js','worldmap.js?v=65','worldmap.js','worldmap-data.js','worldmap-adm1.js?v=50','worldmap-adm1.js'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>Promise.all(A.map(u=>fetch(u,{cache:'no-store'}).then(r=>r.ok&&c.put(u,r)).catch(()=>{})))))});
self.addEventListener('activate',e=>e.waitUntil((async()=>{const ks=await caches.keys();const upgraded=ks.some(k=>k!==C&&k.startsWith('ft-'));await Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)));await self.clients.claim();
 if(upgraded){const cs=await self.clients.matchAll({type:'window'});for(const c of cs){try{c.navigate(c.url)}catch(x){}}}})()));
const isHTML=r=>r.mode==='navigate'||(r.headers.get('accept')||'').includes('text/html')||/\/$|\.html$|sw\.js$|\.webmanifest$/.test(new URL(r.url).pathname);
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const same=new URL(r.url).origin===location.origin;
 /* ft-v49: same-origin scripts/data revalidate with the server (ETag, 304) instead of trusting the 10-minute HTTP cache, so HTML and worldmap.js can never come from different versions */
 const net=same&&isHTML(r)?fetch(r.url,{cache:'no-store',credentials:'same-origin'}):same?fetch(r,{cache:'no-cache'}):fetch(r);
 e.respondWith(net.then(res=>{if(res.ok&&same){const cl=res.clone();caches.open(C).then(c=>c.put(r,cl))}return res}).catch(()=>caches.match(r,{ignoreSearch:true}).then(x=>x||(r.mode==='navigate'?caches.match('index.html'):undefined))))});
self.addEventListener('message',e=>{if(e.data==='ft-version')e.source&&e.source.postMessage({type:'ft-version',v:V})});
self.addEventListener('notificationclick',e=>{e.notification.close();const d=e.notification.data||{};const q=new URLSearchParams();if(d.friendId)q.set('friend',d.friendId);if(d.itemId)q.set('item',d.itemId);q.set('tab',d.section||'tasks');
 const url=new URL('index.html#'+q.toString(),self.registration.scope).href;
 e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if(c.url.startsWith(self.registration.scope)){c.postMessage({type:'ft-open',section:d.section,friendId:d.friendId,itemId:d.itemId});return c.focus()}}return clients.openWindow(url)}))});
