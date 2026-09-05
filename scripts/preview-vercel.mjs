import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {Readable} from 'node:stream';
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json','.txt':'text/plain','.xml':'application/xml'};
const lookup=path=>types[extname(path)];
const root=resolve('.vercel/output/static');
const {default:handler}=await import('../.vercel/output/functions/__server.func/index.mjs');
const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
const headers=Object.fromEntries(config.headers.flatMap(rule=>rule.headers.map(h=>[h.key,h.value])));
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost:4174');
    const path=resolve(root,'.'+decodeURIComponent(url.pathname));
    let response;
    if(path.startsWith(root+sep)&&(await stat(path).catch(()=>null))?.isFile()) {
      response=new Response(await readFile(path),{headers:{'content-type':lookup(path)||'application/octet-stream'}});
    } else {
      const request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'})});
      response=await handler.fetch(request,{waitUntil:promise=>promise.catch(console.error)});
    }
    res.writeHead(response.status,{...headers,...Object.fromEntries(response.headers)});
    if(response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
  } catch(error) {console.error(error);res.writeHead(500);res.end('Preview error');}
});
server.listen(4174,'127.0.0.1',()=>console.log('Vercel artifact preview http://localhost:4174'));
