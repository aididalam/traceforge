// Mutating acceptance uses a dedicated test project and its own contract.
// Existing validators may be reused only with an explicitly pinned test contract.
// Credentials remain in memory; output contains only verification results.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {deployment,execute} from './cli.mjs';

const d=await deployment();
assert.equal(process.env.TRACEFORGE_ACCEPTANCE,'true','Explicit test opt-in required');
assert.ok(d.env.TRACEFORGE_PROJECT.endsWith('-test'),'Dedicated test project required');
if(d.env.TRACEFORGE_CHAIN_MODE==='external') {
 assert.equal(d.env.TRACEFORGE_NETWORK_KIND,'private','Acceptance must not spend public-network gas');
 assert.equal(process.env.TRACEFORGE_ACCEPTANCE_EXTERNAL_CONTRACT?.toLowerCase(),d.env.TRACEFORGE_CONTRACT_ADDRESS.toLowerCase(),'Explicit dedicated external test contract required');
 const code="const fs=require('fs');console.log(fs.readFileSync('/data/contract-deployment.json','utf8'));";
 const record=JSON.parse(await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'run','--rm','--mount',`type=bind,source=${d.env.TRACEFORGE_DATA_DIR},target=/data,readonly`,d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-api:'+d.env.TRACEFORGE_VERSION,'node','-e',code],{capture:true}));
 assert.equal(record.address.toLowerCase(),d.env.TRACEFORGE_CONTRACT_ADDRESS.toLowerCase());
 assert.equal(String(record.chainId),d.env.TRACEFORGE_CHAIN_ID);
 assert.equal(record.runtimeHash.toLowerCase(),d.env.TRACEFORGE_RUNTIME_BYTECODE_HASH.toLowerCase());
}else assert.equal(d.env.TRACEFORGE_CHAIN_MODE,'local');
const base=d.env.TRACEFORGE_SITE_ORIGIN;
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const id=randomUUID(),credentials={email:`deployment-${id}@traceforge.test`,password:randomUUID()+'Aa!'};
const pause=ms=>new Promise(done=>setTimeout(done,ms));
async function request(path,body,cookie,origin=base){
 const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:origin}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
 const data=await response.json();return {status:response.status,body:data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function internal(path,body,token){
 const code=`let text='';for await(const p of process.stdin)text+=p;const q=JSON.parse(text);const r=await fetch('http://127.0.0.1:3000'+q.path,{method:q.body?'POST':'GET',headers:{...(q.body?{'Content-Type':'application/json'}:{}),...(q.token?{Authorization:'Bearer '+q.token}:{})},...(q.body?{body:JSON.stringify(q.body)}:{}),signal:AbortSignal.timeout(60000)});console.log(JSON.stringify({status:r.status,body:await r.json()}));`;
 return new Promise((done,reject)=>{
  const child=spawn('docker',[...d.composeArgs,'exec','-T','api','node','--input-type=module','-e',code],{stdio:['pipe','pipe','pipe']});let output='';
  child.stdout.on('data',v=>output+=v);child.stderr.resume();child.on('error',reject);
  child.on('exit',code=>{if(code!==0)return reject(Error('Internal acceptance request failed'));try{done(JSON.parse(output));}catch{reject(Error('Invalid acceptance response'));}});
  child.stdin.end(JSON.stringify({path,body,token}));
 });
}
async function until(fn,timeout=120000){const end=Date.now()+timeout;let error;while(Date.now()<end){try{return await fn();}catch(e){error=e;await pause(1500);}}throw error;}
async function write(path,body,cookie){return until(async()=>{const result=await request(path,body,cookie);assert.equal(result.status,200);assert.equal(result.body.status,'CONFIRMED');return result.body;});}

const registration=await request('/operator/api/signup',{...credentials,name:'Deployment Operator',businessName:'Deployment Producer '+id.slice(0,8),businessType:'Independent maker',publicProfile:true});
assert.equal(registration.status,200);assert.equal(registration.body.created,true);
// Confirmed registrations become eligible after the indexer projects their
// organization. Wait for the actual eligibility row before authenticating.
async function projectedLogin(credentials){
 const code=`import {db} from './dist/db.js';const [rows]=await db.query('SELECT a.active,o.active AS organization_active FROM operator_accounts a JOIN organizations o ON o.organization_id=a.organization_id WHERE a.email=?',[process.argv[1]]);await db.end();console.log(JSON.stringify(Boolean(rows[0]?.active&&rows[0]?.organization_active)));`;
 await until(async()=>{const result=await d.compose(['exec','-T','api','node','--input-type=module','-e',code,credentials.email],{capture:true});assert.equal(JSON.parse(result),true);});
 const result=await request('/operator/api/login',credentials);
 assert.equal(result.status,200);assert.ok(result.cookie);return result;
}
const producer=await projectedLogin(credentials);
const shopCredentials={email:`shop-${id}@traceforge.test`,password:randomUUID()+'Aa!'};
const shopRegistration=await request('/operator/api/signup',{...shopCredentials,name:'Deployment Shop Operator',businessName:'Deployment Shop '+id.slice(0,8),businessType:'Repair and retail',publicProfile:true});
assert.equal(shopRegistration.status,200);assert.equal(shopRegistration.body.created,true);
const shop=await projectedLogin(shopCredentials);
const batch=await write('/operator/api/products/create',{name:'Deployment test batch',id:'BATCH-'+id,quantity:100,publish:true,fields:[{label:'Origin',value:'বাংলাদেশ'},{label:'Description',value:'Isolated Docker acceptance'}],idempotencyKey:randomUUID()},producer.cookie);
const single=await write('/operator/api/products/create',{name:'Deployment test item',id:'ITEM-'+id,publish:true,idempotencyKey:randomUUID()},producer.cookie);
const preview=await until(async()=>{const result=await request('/operator/api/receive/'+batch.shortCode,undefined,shop.cookie);assert.equal(result.status,200);assert.equal(result.body.quantity.availableQuantity,'100');return result.body;});
const source=preview.routes[0];
async function approvedReceipt(product,input){
 const requested=await request('/operator/api/products/'+product.trackingId+'/receive',input,shop.cookie);
 assert.equal(requested.status,202);assert.equal(requested.body.status,'WAITING_APPROVAL');assert.equal(requested.body.transactionHash,null);
 const decision=await request('/operator/api/receipt-requests/decisions',{requestIds:[requested.body.receiptRequestId],action:'approve',idempotencyKey:randomUUID()},producer.cookie);
 assert.equal(decision.status,202);assert.equal(decision.body.results[0].ok,true);
 await until(async()=>{const page=await request('/operator/api/receipt-requests?direction=outgoing',undefined,shop.cookie);assert.equal(page.body.requests.find(r=>r.id===requested.body.receiptRequestId)?.status,'CONFIRMED');});
 return requested.body;
}
const receipt=await approvedReceipt(batch,{sourceRouteId:source.id,quantity:20,version:source.version,confirmed:true,idempotencyKey:randomUUID()});
const singlePreview=await until(async()=>{const r=await request('/operator/api/receive/'+single.shortCode,undefined,shop.cookie);assert.equal(r.status,200);return r.body;});
await approvedReceipt(single,{version:singlePreview.version,confirmed:true,idempotencyKey:randomUUID()});
console.log('Independent signup, dynamic metadata and owner-approved single/batch receipts verified.');

await d.compose(['restart','ui']);
await until(async()=>assert.equal((await request('/operator/api/me',undefined,shop.cookie)).status,200));
console.log('Dashboard session survived UI restart.');
const browser=await import('../../ui/node_modules/@playwright/test/index.mjs');
const chromium=await browser.chromium.launch({headless:true});
try{
 const page=await chromium.newPage();
 page.setDefaultTimeout(45000);
 const [cookieName,cookieValue]=producer.cookie.split('=');
 await page.context().addCookies([{name:cookieName,value:cookieValue,url:base,httpOnly:true,sameSite:'Strict'}]);
 await page.goto(base+'/operator/products/'+batch.trackingId);
 console.log('Docker browser product opened.');
 await page.getByRole('heading',{name:'Product QR code'}).waitFor();
 await until(async()=>assert.equal(await page.getByRole('link',{name:'Open tracking link'}).getAttribute('href'),base+'/track/'+batch.trackingId));
 assert.equal((await page.request.get(base+'/favicon.svg')).status(),200);
 const canvas=await page.locator('.operator-qr canvas').evaluate(el=>{const c=el.getContext('2d');return {width:el.width,height:el.height,pixels:Array.from(c.getImageData(0,0,el.width,el.height).data)};});
 const {default:jsQR}=await import('../../ui/node_modules/jsqr/dist/jsQR.js');
 assert.equal(jsQR(Uint8ClampedArray.from(canvas.pixels),canvas.width,canvas.height)?.data,base+'/track/'+batch.trackingId);
 console.log('Browser dashboard, static assets and decoded QR URL verified.');
}finally{await chromium.close();}

// Login inside the private API container to provision a dedicated ERP key.
const login=await internal('/operator/v1/login',shopCredentials);assert.equal(login.status,200);
const key=await internal('/operator/v1/integration-keys',{name:'Docker acceptance',scopes:['products:read','products:remove','jobs:read'],expiresInDays:1},login.body.sessionToken);assert.equal(key.status,201);
async function erp(path,body){const r=await fetch(base+'/integration/v1'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key.body.secret,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});return {status:r.status,body:await r.json()};}
await d.compose(['stop','erp-worker']);
let stopped=true;
try{
 const checkout={idempotencyKey:'sale-'+id,reference:'DOCKER-ACCEPTANCE',operations:[{action:'remove',idempotencyKey:'batch-'+id,productCode:batch.shortCode,data:{routeId:receipt.receivedRouteId,quantity:2,confirmed:true}},{action:'remove',idempotencyKey:'single-'+id,productCode:single.shortCode,data:{confirmed:true}}]};
 const accepted=await erp('/jobs',checkout);assert.equal(accepted.status,202);
 assert.equal(accepted.body.counts.pending,2);
 await d.compose(['restart','db','api']);
 await until(async()=>assert.equal((await request('/operator/api/me',undefined,shop.cookie)).status,200));
 await d.compose(['start','erp-worker']);stopped=false;
 const completed=await until(async()=>{const r=await erp('/jobs/'+accepted.body.jobId);assert.equal(r.status,200);assert.equal(r.body.status,'COMPLETED');return r.body;});
 const duplicate=await erp('/jobs',checkout);assert.equal(duplicate.status,202);assert.equal(duplicate.body.jobId,completed.jobId);
 assert.deepEqual(duplicate.body.items.map(v=>v.operationId),completed.items.map(v=>v.operationId));
 const stock=await until(async()=>{const r=await request('/operator/api/products/'+batch.trackingId+'/history',undefined,shop.cookie);assert.equal(r.status,200);assert.equal(r.body.product.quantity.availableQuantity,'98');return r.body.product.quantity;});
 assert.equal(stock.initialQuantity,'100');
 await until(async()=>{const r=await request('/operator/api/products/'+single.trackingId+'/history',undefined,shop.cookie);assert.equal(r.status,200);assert.equal(r.body.product.closed,true);});
 console.log('Queued ERP checkout survived DB/API/worker interruption; duplicate sale kept stock at 98/100.');
}finally{if(stopped)await d.compose(['start','erp-worker']);}

// The browser image is identical in both runs; only its server environment changes.
const probe=d.env.TRACEFORGE_PROJECT+'-domain-'+id.slice(0,8),port=3182,image=d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-ui:'+d.env.TRACEFORGE_VERSION;
const imageId=await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'image','inspect',image,'--format','{{.Id}}'],{capture:true});
const probeBase='http://127.0.0.1:'+port;
const probeBrowser=await browser.chromium.launch({headless:true});
try{
 for(const origin of [probeBase,'http://localhost:'+port,'https://new.example.com']){
  await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'run','-d','--name',probe,'--network',d.env.TRACEFORGE_PROJECT+'_private','-p','127.0.0.1:'+port+':3100','-e','TRACEFORGE_SITE_ORIGIN='+origin,'-e','TRACEFORGE_SESSION_STORE=mysql','-e','TRACEFORGE_SESSION_KEY_FILE=/run/session-key','-e','MYSQL_HOST=db','-e','MYSQL_PORT='+d.env.MYSQL_PORT,'-e','MYSQL_DATABASE='+d.env.MYSQL_DATABASE,'-e','MYSQL_USER='+d.env.MYSQL_USER,'-e','MYSQL_PASSWORD_FILE=/run/password','-e','TRACEFORGE_OPERATOR_API_ORIGIN=http://api:3000','-e','TRACEFORGE_INTERNAL_API_ORIGIN=http://api:3000','--mount',`type=bind,source=${d.env.MYSQL_PASSWORD_FILE},target=/run/password,readonly`,'--mount',`type=bind,source=${d.env.TRACEFORGE_SESSION_KEY_FILE},target=/run/session-key,readonly`,image],{capture:true});
  await until(async()=>{const r=await fetch('http://127.0.0.1:'+port);assert.equal(r.status,200);assert.ok((await r.text()).includes(origin));});
  for(const [sent,status]of [[origin,401],['https://unapproved.example.com',403]]){
   const r=await fetch('http://127.0.0.1:'+port+'/operator/api/login',{method:'POST',headers:{Origin:sent,'Content-Type':'application/json'},body:JSON.stringify({email:'missing@traceforge.test',password:'SyntheticPassword123!'})});assert.equal(r.status,status);
  }
  if(origin.startsWith('http:')){
   const signedIn=await fetch(probeBase+'/operator/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(credentials)});assert.equal(signedIn.status,200);
   const [name,value]=signedIn.headers.get('set-cookie').split(';')[0].split('=');
   const page=await probeBrowser.newPage();await page.context().addCookies([{name,value,url:probeBase,httpOnly:true,sameSite:'Strict'}]);
   await page.goto(probeBase+'/operator/products/'+batch.trackingId);
   await page.getByRole('heading',{name:'Product QR code'}).waitFor();
   await until(async()=>assert.equal(await page.getByRole('link',{name:'Open tracking link'}).getAttribute('href'),origin+'/track/'+batch.trackingId));
   const qr=await page.locator('.operator-qr canvas').evaluate(el=>({width:el.width,height:el.height,pixels:Array.from(el.getContext('2d').getImageData(0,0,el.width,el.height).data)}));
   const {default:decode}=await import('../../ui/node_modules/jsqr/dist/jsQR.js');
   assert.equal(decode(Uint8ClampedArray.from(qr.pixels),qr.width,qr.height)?.data,origin+'/track/'+batch.trackingId);
   await page.close();
  }
  assert.equal(await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'inspect',probe,'--format','{{.Image}}'],{capture:true}),imageId);
  await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'rm','-f',probe],{capture:true});
 }
 console.log('Same Docker image served three runtime origins; browser QR followed the changed origin and login rejected unapproved origins.');
}finally{await probeBrowser.close();await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'rm','-f',probe],{capture:true}).catch(()=>{});}
console.log(JSON.stringify({passed:true,domainRebuildRequired:false,initialQuantity:100,availableQuantity:98,trackingId:batch.trackingId,shortCode:batch.shortCode}));
