import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,rename,cp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {deployment,execute} from './cli.mjs';
import {chainOperation} from './chain.mjs';
import {authenticatedFile} from './recovery.mjs';
const d=await deployment();
assert.equal(process.env.TRACEFORGE_ACCEPTANCE,'true');
assert.ok(d.env.TRACEFORGE_PROJECT.endsWith('-test'));
assert.equal(d.env.TRACEFORGE_CHAIN_MODE,'local');
const args=['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'compose','--env-file',d.rendered,'-f','chain/docker/deployment.compose.yml'];
const chain=argv=>execute('docker',[...args,...argv]);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=180000){const end=Date.now()+timeout;let error;while(Date.now()<end){try{return await fn();}catch(e){error=e;await pause(2000);}}throw error;}
async function readiness(){return Number(await d.compose(['exec','-T','api','node','-e',"const r=await fetch('http://127.0.0.1:3000/ready',{signal:AbortSignal.timeout(30000)});console.log(r.status)"],{capture:true}));}
try{
 await chain(['stop','validator1']);
 await until(async()=>assert.equal(await readiness(),200));
 await chainOperation('chain-check',d);
 await d.compose(['exec','-T','indexer','node','dist/monitor.js']);
 console.log('One-validator outage: verified RPC fallback and continuing projection passed.');
 await chain(['stop','validator2']);
 await until(async()=>assert.equal(await readiness(),503),90000);
 console.log('Two-validator outage: stalled-chain readiness reported unavailable.');
}finally{await chain(['start','validator1','validator2']);}
await until(async()=>{await chainOperation('chain-check',d);assert.equal(await readiness(),200);});
const snapshots=(await readdir(resolve(d.env.TRACEFORGE_DATA_DIR,'backups'))).filter(n=>n.startsWith('chain-')).sort();
assert.ok(snapshots.length,'Cold snapshot required');
const folder=resolve(d.env.TRACEFORGE_DATA_DIR,'backups',snapshots.at(-1));
const work=resolve(folder,'.node-restore-'+randomUUID());await mkdir(work,{mode:0o700});
const current=resolve(d.env.TRACEFORGE_CHAIN_DATA_DIR,'validator1'),retained=current+'.retained-'+Date.now();
let replaced=false;
try{
 const key=Buffer.from((await readFile(d.env.TRACEFORGE_BACKUP_KEY_FILE,'utf8')).trim(),'hex');
 await authenticatedFile(resolve(folder,'validator1.tfg'),key,resolve(work,'node.tar.gz'));
 await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'run','--rm','--user',d.env.TRACEFORGE_UID+':'+d.env.TRACEFORGE_GID,'--mount',`type=bind,source=${work},target=/restore`,d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-api:'+d.env.TRACEFORGE_VERSION,'tar','xzf','/restore/node.tar.gz','--no-same-owner','-C','/restore']);
 const hash=file=>readFile(file).then(v=>createHash('sha256').update(v).digest('hex'));
 for(const file of ['key','key.pub'])assert.equal(await hash(resolve(work,'validator1',file)),await hash(resolve(current,file)));
 assert.equal(await hash(resolve(work,'shared/genesis.json')),await hash(resolve(d.env.TRACEFORGE_CHAIN_DATA_DIR,'shared/genesis.json')));
 await chain(['stop','validator1']);
 await rename(current,retained);replaced=true;
 await cp(resolve(work,'validator1'),current,{recursive:true});
 await chain(['start','validator1']);
 await until(async()=>{const output=await execute('docker',[...args,'ps','validator1','--format','json'],{capture:true});const rows=output.split('\n').filter(Boolean).flatMap(v=>JSON.parse(v));assert.equal(rows[0].Health,'healthy');const health=await chainOperation('chain-check',d);assert.equal(health.reachableRpc,4);assert.ok(health.maxLag<=5);});
 console.log('Older cold snapshot restored with original validator identity and genesis; node caught up to healthy peers.');
}catch(error){
 if(replaced){await chain(['stop','validator1']);await rm(current,{recursive:true,force:true});await rename(retained,current);await chain(['start','validator1']);}
 throw error;
}finally{await rm(work,{recursive:true,force:true});}
console.log(JSON.stringify({passed:true,validatorFallback:true,quorumStallDetection:true,coldNodeRestore:true}));
