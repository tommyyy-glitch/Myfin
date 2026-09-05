// Narrow local preview: serve only public app assets, never backups or repository contents.
import http from 'node:http';import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const allowed=new Set(['index.html','cloud-auth.js','cloud-ui.js','sw.js','manifest.webmanifest','icon-180.png','icon-512.png']);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://127.0.0.1').pathname.slice(1)||'index.html';
  if(!['GET','HEAD'].includes(req.method)||!allowed.has(name)){res.writeHead(404);res.end();return;}
  try{const data=fs.readFileSync(new URL(name,root));res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.webmanifest')?'application/manifest+json':name.endsWith('.png')?'image/png':'text/html; charset=utf-8');res.end(req.method==='HEAD'?undefined:data);}catch(_){res.writeHead(404);res.end();}
});
server.listen(8768,'127.0.0.1',()=>console.log('Myfin local login: http://127.0.0.1:8768/?cloud=login'));
