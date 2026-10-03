// Myfin offline cache — pure client-side, no server involved.
// Network-first for the app shell (so updates land immediately when online),
// cache fallback when offline. CDN assets (icons font, xlsx) are cache-first.
const CACHE='myfin-v49';
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./cloud-auth.js','./cloud-ui.js','./browser-chrome.js','./assets/wallet-icons/ibkr.jpg','./assets/wallet-icons/payme.jpg','./assets/wallet-icons/alipay-hk.jpg','./assets/wallet-icons/alipay.jpg','./assets/wallet-icons/wechat.jpg','./assets/wallet-icons/mexc.jpg','./assets/wallet-icons/futu.jpg','./assets/wallet-icons/octopus.jpg','./assets/wallet-icons/metamask.jpg','./assets/wallet-icons/app-store.png','./assets/wallet-icons/mpfa.svg','./assets/wallet-icons/lisboa.png','./assets/wallet-icons/polymarket.png','./assets/wallet-icons/hkd.jpg','./assets/wallet-icons/hsbc-red.png','./assets/wallet-icons/hang-seng-cityu.jpg','./assets/wallet-icons/hsbc-logo.svg','./assets/wallet-icons/longbridge.png','./assets/wallet-icons/natural8.jpg','./assets/wallet-icons/forthright.jpg','./assets/wallet-icons/jpy.svg','./assets/wallet-icons/cny-card.svg','./assets/wallet-icons/coin-jar.svg','./assets/wallet-icons/government.svg','./assets/wallet-icons/poker.svg','./assets/wallet-icons/hair.svg','./assets/wallet-icons/project.svg','./assets/wallet-icons/bank-card.svg','./assets/wallet-icons/credit-card.svg','./assets/wallet-icons/cash.svg','./assets/wallet-icons/investment.svg','./assets/wallet-icons/digital-wallet.svg','./assets/wallet-icons/wallet.svg','./assets/holding-icons/google.png','./assets/holding-icons/amazon.png','./assets/holding-icons/nvidia.svg','./assets/holding-icons/vanguard.png','./assets/holding-icons/invesco.png','./assets/holding-icons/bitcoin.svg','./assets/holding-icons/ethereum.png','./assets/holding-icons/bnb.png'])).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('myfin-')&&k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin===location.origin){
    // Avoid GitHub Pages/browser HTTP cache serving a stale app shell inside the PWA.
    const appShell=/\/$|\/index\.html$/i.test(url.pathname);
    const req=appShell?new Request(e.request,{cache:'no-store'}):e.request;
    e.respondWith(
      fetch(req).then(r=>{
        if(r&&r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}
        return r;
      }).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(m=>m||(appShell?caches.match('./index.html',{ignoreSearch:true}):Response.error())))
    );
  }else if(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com/.test(url.host)){
    e.respondWith(
      caches.match(e.request).then(m=>m||fetch(e.request).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return r;}))
    );
  }
});

self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){if('focus' in c)return c.focus();}
    if(clients.openWindow)return clients.openWindow('./');
  }));
});
