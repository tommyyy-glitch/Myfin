// Myfin offline cache — pure client-side, no server involved.
// Network-first for the app shell (so updates land immediately when online),
// cache fallback when offline. CDN assets (icons font, xlsx) are cache-first.
const CACHE='myfin-v1';
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html'])).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin===location.origin){
    e.respondWith(
      fetch(e.request).then(r=>{
        if(r&&r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}
        return r;
      }).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(m=>m||caches.match('./index.html',{ignoreSearch:true})))
    );
  }else if(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com/.test(url.host)){
    e.respondWith(
      caches.match(e.request).then(m=>m||fetch(e.request).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return r;}))
    );
  }
});
