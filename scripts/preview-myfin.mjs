// Narrow local preview: serve only public app assets, never backups or repository contents.
import http from 'node:http';import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const walletAssets=["assets/wallet-icons/ibkr.jpg", "assets/wallet-icons/payme.jpg", "assets/wallet-icons/alipay-hk.jpg", "assets/wallet-icons/alipay.jpg", "assets/wallet-icons/wechat.jpg", "assets/wallet-icons/mexc.jpg", "assets/wallet-icons/futu.jpg", "assets/wallet-icons/octopus.jpg", "assets/wallet-icons/metamask.jpg", "assets/wallet-icons/app-store.png", "assets/wallet-icons/mpfa.svg", "assets/wallet-icons/lisboa.png", "assets/wallet-icons/polymarket.png", "assets/wallet-icons/hkd.jpg"];
const allowed=new Set([...walletAssets,'index.html','cloud-auth.js','cloud-ui.js','browser-chrome.js','sw.js','manifest.webmanifest','icon-180.png','icon-512.png']);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://127.0.0.1').pathname.slice(1)||'index.html';
  if(!['GET','HEAD'].includes(req.method)||!allowed.has(name)){res.writeHead(404);res.end();return;}
  try{const data=fs.readFileSync(new URL(name,root));res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.webmanifest')?'application/manifest+json':name.endsWith('.jpg')?'image/jpeg':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':'text/html; charset=utf-8');res.end(req.method==='HEAD'?undefined:data);}catch(_){res.writeHead(404);res.end();}
});
server.listen(8768,'127.0.0.1',()=>console.log('Myfin local login: http://127.0.0.1:8768/?cloud=login'));
