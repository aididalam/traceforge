import {mkdir, readFile, writeFile, stat, readdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadConfig, checkStorage} from './config.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
process.chdir(root);
export function execute(command,args,options={}) {
 return new Promise((done,reject)=>{
  const child=spawn(command,args,{stdio:options.capture?['ignore','pipe','pipe']:'inherit',...options});
  let output='',error='';if(options.capture){child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>error+=v);}
  child.on('error',reject);child.on('exit',code=>code===0?done(output.trim()):reject(Error(`${command} failed (${code})${options.capture?': '+error.trim():''}`)));
 });
}
export async function deployment(options={}){
 const {path,env}=await loadConfig();
 if(options.version){if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(options.version))throw Error('Invalid release version');env.TRACEFORGE_VERSION=options.version;}
 if(process.env.TRACEFORGE_HELPER_CONTAINER==='true')env.TRACEFORGE_DOCKER_CONTEXT='default';
 if(env.TRACEFORGE_CHAIN_MODE==='local')env.TRACEFORGE_CHAIN_NETWORK ||= env.TRACEFORGE_PROJECT+'-chain';
 env.TRACEFORGE_SITE_ADDRESS=new URL(env.TRACEFORGE_SITE_ORIGIN).protocol==='http:'?'http://'+new URL(env.TRACEFORGE_SITE_ORIGIN).hostname:new URL(env.TRACEFORGE_SITE_ORIGIN).hostname;
 const rendered=resolve(dirname(path),'compose.env');
 await writeFile(rendered,Object.entries(env).map(([k,v])=>`${k}='${v.replaceAll("'", "'\\''")}'`).join('\n')+'\n',{mode:0o600});
 const docker=args=>execute('docker',['--context',env.TRACEFORGE_DOCKER_CONTEXT,...args]);
 const files=['-f','deploy/compose.yml',...(env.TRACEFORGE_DATABASE_MODE==='managed'?['-f','deploy/compose.mysql.yml']:[]),...(env.TRACEFORGE_PROFILE==='pi'?['-f','deploy/compose.pi.yml']:[]),...(env.TRACEFORGE_CHAIN_NETWORK?['-f','deploy/compose.chain-network.yml']:[])];
 const composeArgs=['--context',env.TRACEFORGE_DOCKER_CONTEXT,'compose','--env-file',rendered,...files];
 const compose=(args,options)=>execute('docker',[...composeArgs,...args],options);
 return {path,env,rendered,docker,compose,composeArgs};
}
async function initialize(env){
 await mkdir(env.TRACEFORGE_DATA_DIR,{recursive:true,mode:0o700});
 for(const name of ['wallets','secrets','backups','mysql','caddy-data','caddy-config'])await mkdir(resolve(env.TRACEFORGE_DATA_DIR,name),{recursive:true,mode:0o700});
 for(const key of ['MYSQL_PASSWORD_FILE','MYSQL_ROOT_PASSWORD_FILE','TRACEFORGE_SESSION_KEY_FILE','TRACEFORGE_BACKUP_KEY_FILE','TRACEFORGE_PROXY_KEY_FILE']){
  try{await stat(env[key]);}catch(error){
   if(error.code!=='ENOENT')throw error;
   if(key.startsWith('MYSQL_')&&(env.TRACEFORGE_DATABASE_MODE==='external'||(await readdir(resolve(env.TRACEFORGE_DATA_DIR,'mysql'))).length))throw Error('Existing database requires its original credential file');
   await writeFile(env[key],randomBytes(32).toString('hex')+'\n',{mode:0o600,flag:'wx'});
  }
 }
 console.log('Persistent directories initialized; existing files were retained. Keep the backup key separately recoverable.');
}
async function doctor(d){
 await checkStorage(d.env);
 const endpoint=await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'context','inspect','--format','{{.Endpoints.docker.Host}}'],{capture:true});
 if(!endpoint.startsWith('unix://'))throw Error('Run deployment commands on the Docker host; local files cannot be bound through a remote context');
 const info=await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'info','--format','{{.Name}} {{.Architecture}}'],{capture:true});
 console.log(`Docker target: ${d.env.TRACEFORGE_DOCKER_CONTEXT} (${info})`);
 if(d.env.TRACEFORGE_PROFILE==='pi'&&(await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'info','--format','{{.MemoryLimit}}'],{capture:true}))!=='true')throw Error('Pi profile requires enabled kernel memory cgroups');
 await d.compose(['config','--quiet']);
 console.log('Deployment configuration, private storage and Compose definition verified.');
}
export async function main(){
 const command=process.argv[2]||'help';
 if(command==='help'){console.log('Commands: init, doctor, build, up, down, status, logs, check, migrate, backup, restore-check, restore, deploy, rollback\nSet TRACEFORGE_ENV_FILE to an owner-only deployment configuration.');return;}
 const d=await deployment();
 if(command.startsWith('chain-')||command==='contract-init'){const {chainOperation}=await import('./chain.mjs');await chainOperation(command,d);return;}
 if(command==='init'){await initialize(d.env);return;}
 if(command==='doctor'){await doctor(d);return;}
 if(['build','up','deploy','rollback','migrate'].includes(command))await doctor(d);
 if(command==='build')await d.compose(['build','api','indexer','ui']);
 else if(command==='up')await d.compose(['up','-d','--wait','--wait-timeout','300']);
 else if(command==='down')await d.compose(['down']);
 else if(command==='status')await d.compose(['ps','-a']);
 else if(command==='logs')await d.compose(['logs','--tail','80',...(process.argv[3]?[process.argv[3]]:[])]);
 else if(command==='migrate'){
  if(d.env.TRACEFORGE_DATABASE_MODE==='managed')await d.compose(['up','-d','--wait','db']);
  await d.compose(['run','--rm','indexer-migrate']);await d.compose(['run','--rm','api-migrate']);
 }else if(command==='check'){
  const rows=(await d.compose(['ps','--format','json'],{capture:true})).split('\n').filter(Boolean).flatMap(line=>JSON.parse(line));
  for(const service of ['db','ui','proxy'].filter(s=>s!=='db'||d.env.TRACEFORGE_DATABASE_MODE==='managed')){
   if(!rows.some(row=>row.Service===service&&row.State==='running'&&row.Health==='healthy'))throw Error('Deployment service is unavailable');
  }
  await d.compose(['exec','-T','api','node','scripts/container-health.mjs','api']);
  await d.compose(['exec','-T','indexer','node','dist/monitor.js']);
  for(const role of ['erp-worker','public-sync'])await d.compose(['exec','-T',role,'node','scripts/container-health.mjs',role]);
  const {chainOperation}=await import('./chain.mjs');await chainOperation('chain-check',d);
  await d.compose(['ps']);
 }else if(['backup','restore-check','restore','deploy','rollback'].includes(command)){
  const {operations}=await import('./recovery.mjs');await operations(command,d);
 }else throw Error('Unknown deployment command');
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Deployment command failed. Inspect secret-free service diagnostics and configuration.');process.exitCode=1;});
