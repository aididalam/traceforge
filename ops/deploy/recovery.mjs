import {spawn} from 'node:child_process';
import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {createWriteStream,createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,appendFile,open,stat,readdir,rm,cp} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {execute,deployment} from './cli.mjs';

const roles=['ui','api','erp-worker','indexer','public-sync','proxy'];
const header=Buffer.from('TFGB001');
const mysqlImage='mysql:8.4.11@sha256:6ea90827b1100f8f2ae306a539f86d2c264a26ed435a2a9f75551dd5c3aeb242';
async function fileHashes(root,names){
 const hashes={};
 async function visit(name){
  const info=await stat(resolve(root,name));
  if(info.isDirectory()){for(const child of await readdir(resolve(root,name)))await visit(name+'/'+child);}
  else if(info.isFile())hashes[name]=createHash('sha256').update(await readFile(resolve(root,name))).digest('hex');
 }
 for(const name of names)await visit(name);
 return hashes;
}
export async function authenticatedFile(source,key,destination){
 try{await decrypt(source,key,createWriteStream(destination,{mode:0o600,flags:'wx'}));}
 catch(error){await rm(destination,{force:true});throw error;}
}
function processResult(child){return new Promise((done,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?done():reject(Error('Recovery subprocess failed')));});}
export async function encryptedProcess(args,file,key){
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
 const child=spawn('docker',args,{stdio:['ignore','pipe','ignore']});
 const completed=processResult(child);const output=createWriteStream(file,{mode:0o600,flags:'wx'});
 output.write(Buffer.concat([header,nonce]));
 await Promise.all([pipeline(child.stdout,cipher,output),completed]);await appendFile(file,cipher.getAuthTag());
}
async function decrypt(file,key,destination){
 const length=(await stat(file)).size;if(length<35)throw Error('Invalid encrypted backup');
 const handle=await open(file,'r'),prefix=Buffer.alloc(19),tag=Buffer.alloc(16);
 try{await handle.read(prefix,0,19,0);await handle.read(tag,0,16,length-16);}finally{await handle.close();}
 if(!prefix.subarray(0,7).equals(header))throw Error('Unknown backup format');
 const cipher=createDecipheriv('aes-256-gcm',key,prefix.subarray(7));cipher.setAuthTag(tag);
 await pipeline(createReadStream(file,{start:19,end:length-17}),cipher,destination);
}
async function inventory(d){
 const code=`import {db} from './dist/db.js';const [tables]=await db.query('SHOW TABLES');const counts={};for(const row of tables){const name=Object.values(row)[0];if(!/^[a-zA-Z0-9_]+$/.test(name))throw Error();const [rows]=await db.query('SELECT COUNT(*) n FROM '+name);counts[name]=String(rows[0].n);}await db.end();console.log(JSON.stringify(counts));`;
 return JSON.parse(await d.compose(['run','--rm','--no-deps','-T','api','node','--input-type=module','-e',code],{capture:true}));
}
export async function backup(d){
 const folder=resolve(d.env.TRACEFORGE_DATA_DIR,'backups',new Date().toISOString().replaceAll(':','-'));
 await mkdir(folder,{recursive:true,mode:0o700});
 const key=Buffer.from((await readFile(d.env.TRACEFORGE_BACKUP_KEY_FILE,'utf8')).trim(),'hex');
 const active=(await d.compose(['ps','--status','running','--services'],{capture:true})).split('\n').filter(role=>roles.includes(role));
 const release=resolve(d.env.TRACEFORGE_DATA_DIR,'release');await mkdir(release,{recursive:true,mode:0o700});
 await cp(d.path,resolve(release,'deployment.env'));
 const archive=['wallets','secrets','caddy-data','caddy-config','release'];
 for(const name of ['contract-deployment.json','contract-attempt.json','contract-deployment-attempt.json','bootstrap-active.json','funding','network'])try{await stat(resolve(d.env.TRACEFORGE_DATA_DIR,name));archive.push(name);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(active.length)await d.compose(['stop',...active]);
 try{
  const counts=await inventory(d);
  const manifest={format:1,createdAt:new Date().toISOString(),project:d.env.TRACEFORGE_PROJECT,database:d.env.MYSQL_DATABASE,chainId:d.env.TRACEFORGE_CHAIN_ID,contract:d.env.TRACEFORGE_CONTRACT_ADDRESS,runtimeHash:d.env.TRACEFORGE_RUNTIME_BYTECODE_HASH,version:d.env.TRACEFORGE_VERSION,counts,fileHashes:await fileHashes(d.env.TRACEFORGE_DATA_DIR,archive)};
  const client=d.env.TRACEFORGE_DATABASE_MODE==='managed'?[...d.composeArgs,'exec','-T','db','sh','-c','export MYSQL_PWD="$(cat /run/secrets/db-password)"; exec mysqldump -h127.0.0.1 -u"$MYSQL_USER" --single-transaction --no-tablespaces --routines --events --triggers --set-gtid-purged=OFF --databases "$MYSQL_DATABASE"']:
   ['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'run','--rm','--network',d.env.TRACEFORGE_PROJECT+'_private','--mount',`type=bind,source=${d.env.MYSQL_PASSWORD_FILE},target=/run/password,readonly`,'-e','MYSQL_HOST='+d.env.MYSQL_HOST,'-e','MYSQL_PORT='+d.env.MYSQL_PORT,'-e','MYSQL_DATABASE='+d.env.MYSQL_DATABASE,'-e','MYSQL_USER='+d.env.MYSQL_USER,mysqlImage,'sh','-c','export MYSQL_PWD="$(cat /run/password)"; exec mysqldump -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"$MYSQL_USER" --single-transaction --no-tablespaces --routines --events --triggers --set-gtid-purged=OFF --databases "$MYSQL_DATABASE"'];
  await encryptedProcess(client,resolve(folder,'database.tfg'),key);
  await encryptedProcess(['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'run','--rm','--user','0:0','--mount',`type=bind,source=${d.env.TRACEFORGE_DATA_DIR},target=/data,readonly`,d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-api:'+d.env.TRACEFORGE_VERSION,'tar','czf','-','-C','/data',...archive],resolve(folder,'files.tfg'),key);
  await writeFile(resolve(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
  if(d.env.TRACEFORGE_BACKUP_DESTINATION){await mkdir(d.env.TRACEFORGE_BACKUP_DESTINATION,{recursive:true,mode:0o700});await cp(folder,resolve(d.env.TRACEFORGE_BACKUP_DESTINATION,basename(folder)),{recursive:true,errorOnExist:true,force:false});}
  const cutoff=Date.now()-Number(d.env.TRACEFORGE_BACKUP_RETENTION_DAYS)*86400000;
  for(const name of await readdir(dirnameBackup(folder))){
   if(!/^\d{4}-\d{2}-\d{2}T/.test(name))continue;const path=resolve(dirnameBackup(folder),name);
   if(path!==folder&&(await stat(path)).mtimeMs<cutoff)await rm(path,{recursive:true});
  }
  console.log('Encrypted application/database backup completed: '+folder);
  return folder;
 }finally{if(active.length)await d.compose(['start',...active]);}
}
function dirnameBackup(folder){return resolve(folder,'..');}
export async function restoreCheck(d,folder){
 if(!folder){const names=(await readdir(resolve(d.env.TRACEFORGE_DATA_DIR,'backups'))).filter(v=>/^\d{4}-\d{2}-\d{2}T/.test(v)).sort();folder=resolve(d.env.TRACEFORGE_DATA_DIR,'backups',names.at(-1)||'missing');}
 const manifest=JSON.parse(await readFile(resolve(folder,'manifest.json'),'utf8'));
 if(manifest.project!==d.env.TRACEFORGE_PROJECT||manifest.database!==d.env.MYSQL_DATABASE)throw Error('Backup deployment mismatch');
 if(String(manifest.chainId)!==d.env.TRACEFORGE_CHAIN_ID||manifest.contract.toLowerCase()!==d.env.TRACEFORGE_CONTRACT_ADDRESS.toLowerCase()||manifest.runtimeHash.toLowerCase()!==d.env.TRACEFORGE_RUNTIME_BYTECODE_HASH.toLowerCase())throw Error('Backup chain/contract mismatch');
 const key=Buffer.from((await readFile(d.env.TRACEFORGE_BACKUP_KEY_FILE,'utf8')).trim(),'hex');
 const suffix=randomBytes(6).toString('hex'),name=d.env.TRACEFORGE_PROJECT+'-restore-'+suffix,volume=name+'-data';
 const passwordFile=resolve(folder,'.restore-password-'+suffix);await writeFile(passwordFile,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
 const work=resolve(folder,'.restore-work-'+suffix);await mkdir(work,{mode:0o700});
 const dockerPrefix=['--context',d.env.TRACEFORGE_DOCKER_CONTEXT];
 try{
  await authenticatedFile(resolve(folder,'database.tfg'),key,resolve(work,'database.sql'));
  await authenticatedFile(resolve(folder,'files.tfg'),key,resolve(work,'files.tar.gz'));
  await execute('docker',[...dockerPrefix,'run','-d','--name',name,'--network','none','--memory','512m','--mount',`type=bind,source=${passwordFile},target=/run/password,readonly`,'--mount',`type=volume,source=${volume},target=/var/lib/mysql`,'-e','MYSQL_ROOT_PASSWORD_FILE=/run/password',mysqlImage,'--innodb-buffer-pool-size=128M','--max-connections=20'],{capture:true});
  const shell='export MYSQL_PWD="$(cat /run/password)"; exec mysql -h127.0.0.1 -uroot --batch --skip-column-names';
  // Initializing a fresh MySQL data directory on Pi storage can exceed one
  // minute. Wait for an authenticated TCP connection within a bounded startup
  // window, rather than failing while its temporary initialization server runs.
  let ready=false;const readyDeadline=Date.now()+180000;
  while(Date.now()<readyDeadline){try{await execute('docker',[...dockerPrefix,'exec',name,'sh','-c',shell+' --execute="SELECT 1"'],{capture:true});ready=true;break;}catch{await new Promise(done=>setTimeout(done,1000));}}
  if(!ready)throw Error('Restore database did not become ready');
  const child=spawn('docker',[...dockerPrefix,'exec','-i',name,'sh','-c',shell],{stdio:['pipe','ignore','ignore']});const completed=processResult(child);
  await Promise.all([pipeline(createReadStream(resolve(work,'database.sql')),child.stdin),completed]);
  const tables=Object.keys(manifest.counts).sort();if(!tables.every(t=>/^[a-zA-Z0-9_]+$/.test(t)))throw Error('Invalid backup table manifest');
  const sql=tables.map(t=>`SELECT '${t}',COUNT(*) FROM ${manifest.database}.${t}`).join(';')+';';
  const text=await execute('docker',[...dockerPrefix,'exec',name,'sh','-c',shell+' --execute="$1"','sh',sql],{capture:true});
  const restored=Object.fromEntries(text.split('\n').map(v=>v.split('\t')));
  for(const table of tables)if(restored[table]!==manifest.counts[table])throw Error('Restored database row counts differ');
  await mkdir(resolve(work,'files'),{mode:0o700});
  await execute('docker',[...dockerPrefix,'run','--rm','--user',d.env.TRACEFORGE_UID+':'+d.env.TRACEFORGE_GID,'--mount',`type=bind,source=${work},target=/restore`,d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-api:'+d.env.TRACEFORGE_VERSION,'tar','xzf','/restore/files.tar.gz','--no-same-owner','-C','/restore/files'],{capture:true});
  if(manifest.fileHashes){const restoredFiles=await fileHashes(resolve(work,'files'),[...(await readdir(resolve(work,'files')))]);for(const [file,hash]of Object.entries(manifest.fileHashes))if(restoredFiles[file]!==hash)throw Error('Restored wallet/configuration file differs');}
  console.log(`Isolated encrypted restore verified: ${tables.length} tables; wallet/configuration files restored and authenticated. Live data retained.`);
 }finally{
  await execute('docker',[...dockerPrefix,'rm','-f',name],{capture:true}).catch(()=>{});
  await execute('docker',[...dockerPrefix,'volume','rm',volume],{capture:true}).catch(()=>{});
  await rm(passwordFile,{force:true});
  await rm(work,{recursive:true,force:true});
 }
}
async function restoreEmpty(d,folder){
 if(process.env.TRACEFORGE_RESTORE_EMPTY!=='true'||!folder)throw Error('Restore requires BACKUP and TRACEFORGE_RESTORE_EMPTY=true');
 if(d.env.TRACEFORGE_DATABASE_MODE!=='managed')throw Error('External database restore uses its database administrator procedure');
 if(await d.compose(['ps','-a','-q'],{capture:true}))throw Error('Restore requires a stopped project with no existing containers');
 for(const directory of ['mysql','wallets'])if((await readdir(resolve(d.env.TRACEFORGE_DATA_DIR,directory))).length)throw Error('Restore requires empty database and wallet directories; retained data is never overwritten');
 await restoreCheck(d,folder);
 const key=Buffer.from((await readFile(d.env.TRACEFORGE_BACKUP_KEY_FILE,'utf8')).trim(),'hex');
 const work=resolve(folder,'.restore-target-'+randomBytes(6).toString('hex'));await mkdir(work,{mode:0o700});
 try{
  await authenticatedFile(resolve(folder,'database.tfg'),key,resolve(work,'database.sql'));
  await authenticatedFile(resolve(folder,'files.tfg'),key,resolve(work,'files.tar.gz'));
  await mkdir(resolve(work,'files'),{mode:0o700});
  await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'run','--rm','--user',d.env.TRACEFORGE_UID+':'+d.env.TRACEFORGE_GID,'--mount',`type=bind,source=${work},target=/restore`,d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-api:'+d.env.TRACEFORGE_VERSION,'tar','xzf','/restore/files.tar.gz','--no-same-owner','-C','/restore/files'],{capture:true});
  for(const file of await readdir(resolve(work,'files')))await cp(resolve(work,'files',file),resolve(d.env.TRACEFORGE_DATA_DIR,file),{recursive:true});
  await d.compose(['up','-d','--wait','db']);
  const child=spawn('docker',[...d.composeArgs,'exec','-T','db','sh','-c','export MYSQL_PWD="$(cat /run/secrets/db-root-password)"; exec mysql -h127.0.0.1 -uroot'],{stdio:['pipe','ignore','ignore']});
  await Promise.all([pipeline(createReadStream(resolve(work,'database.sql')),child.stdin),processResult(child)]);
  await d.compose(['up','-d','--wait','--wait-timeout','300']);
  console.log('Application database, wallet keys and configuration restored into empty storage; existing chain retained.');
 }finally{await rm(work,{recursive:true,force:true});}
}
export async function operations(command,d){
 if(command==='backup')return backup(d);
 if(command==='restore-check')return restoreCheck(d,process.env.BACKUP);
 if(command==='restore')return restoreEmpty(d,process.env.BACKUP);
 if(command==='deploy'){
  const version=process.env.VERSION;if(!version)throw Error('Set VERSION to the new published release');
  await backup(d);const target=await deployment({version});await target.compose(['pull','api','indexer','ui']);
  await target.compose(['stop',...roles]);
  await target.compose(['up','-d','--wait','--wait-timeout','300']);
  await writeFile(d.path,(await readFile(d.path,'utf8')).replace(/^TRACEFORGE_VERSION=.*$/m,'TRACEFORGE_VERSION='+version),{mode:0o600});
 }else if(command==='rollback'){
  if(process.env.TRACEFORGE_SCHEMA_COMPATIBLE!=='true')throw Error('Rollback requires verified schema compatibility');
  if(!process.env.VERSION)throw Error('Set VERSION to the previous release');
  const target=await deployment({version:process.env.VERSION});
  await target.compose(['up','-d','--wait','--wait-timeout','300','--no-deps',...roles]);
  await writeFile(d.path,(await readFile(d.path,'utf8')).replace(/^TRACEFORGE_VERSION=.*$/m,'TRACEFORGE_VERSION='+process.env.VERSION),{mode:0o600});
 }
}
