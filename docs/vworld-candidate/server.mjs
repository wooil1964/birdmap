import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const SOURCE=resolve(ROOT,existsSync(resolve(ROOT,'index.html'))?'index.html':'source-snapshot.txt');
export const BASELINE_REF='8397053c753d590e9d2bfde9d02fc6f0265727b4';
const mime={'.html':'text/html; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
// Serve only the app's reviewed public runtime resources. Never expose the rest
// of a checkout, even when an ignored local file exists or Windows ignores case.
const PUBLIC_FILES=new Set([
 'index.html','weather_today.json','weather_week.json','weather_rules.json',
 'tide_today.json','tide_month.json','notices.json','birdmap-user-guide.png',
 'assets/birdmap-basemap.js','assets/birdmap-basemap-init.js',
 'assets/birdmap-basemap.css','assets/map-runtime-config.js'
]);
export function startServer(port=0,{root=ROOT,baselineRef=BASELINE_REF}={}){
 const base=realpathSync(resolve(root));
 const source=resolve(base,existsSync(resolve(base,'index.html'))?'index.html':'source-snapshot.txt');
 function readPublicFile(file){
  try{
   const real=realpathSync(file);
   if(!real.startsWith(base+sep)||!statSync(real).isFile())return null;
   return readFileSync(real);
  }catch{return null;}
 }
 const server=createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',"connect-src 'self'; form-action 'none'; frame-src 'none'; object-src 'none'");
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  if(!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(req.headers.host||'')){res.writeHead(403);res.end();return;}
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  // Inspect the raw path before URL normalization can erase traversal segments.
  let pathname;try{pathname=decodeURIComponent((req.url||'').split('?')[0]);}catch{res.writeHead(400);res.end();return;}
  if(!pathname.startsWith('/')||pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(part=>part.startsWith('.'))){res.writeHead(404);res.end();return;}
  if(pathname==='/baseline'){
   let text;
   try{
    const args=['-c','safe.directory='+base];
    const gitRoot=execFileSync('git',[...args,'rev-parse','--show-toplevel'],{cwd:base,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    if(realpathSync(gitRoot)!==base)throw new Error('Isolated fixture is not the repository root');
    text=execFileSync('git',[...args,'show',baselineRef+':index.html'],{cwd:base,encoding:'utf8',maxBuffer:8e6,stdio:['ignore','pipe','pipe']});
   }catch{
    const snapshot=readPublicFile(resolve(base,'baseline-snapshot.txt'));
    if(snapshot===null){res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});res.end('Baseline snapshot unavailable');return;}
    text=snapshot.toString('utf8');
   }
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(text);return;
  }
  const relative=pathname==='/'?'/index.html':pathname;
  if(!PUBLIC_FILES.has(relative.slice(1))){res.writeHead(404);res.end();return;}
  const file=relative==='/index.html'?source:resolve(base,'.'+relative);
  let body=readPublicFile(file);
  if(body===null){res.writeHead(404);res.end();return;}
  if(file===source)body=Buffer.from(body.toString('utf8').replace('<title>','<title>격리 시안 · '));
  res.writeHead(200,{'Content-Type':mime[relative==='/index.html'?'.html':extname(file)]||'text/plain; charset=utf-8'});res.end(body);
 });
 return new Promise(r=>server.listen(port,'127.0.0.1',()=>r(server)));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const s=await startServer(Number(process.env.PORT||8766));console.log('Isolated candidate: http://127.0.0.1:'+s.address().port+' ; operating forms and connections blocked');
}
