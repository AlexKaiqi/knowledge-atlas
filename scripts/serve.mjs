import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from './lib.mjs';
const port=Number(process.env.PORT||8080);
const dist=path.join(root,'dist');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=path.join(dist,pathname);
  try { const st=await fs.stat(file); if(st.isDirectory()) file=path.join(file,'index.html'); }
  catch { if(!path.extname(file)) file=path.join(file,'index.html'); }
  if(!file.startsWith(dist)){res.writeHead(403);res.end('Forbidden');return;}
  try{const data=await fs.readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,()=>console.log(`Knowledge Atlas: http://localhost:${port}`));
