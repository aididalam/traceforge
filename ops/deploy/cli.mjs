import {mkdir, readFile, writeFile, stat, readdir, chmod} from 'node:fs/promises';
import {resolve, dirname,basename} from 'node:path';
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
 const rendered=resolve(dirname(path),basename(path)+'.compose.env');
 await writeFile(rendered,Object.entries(env).map(([k,v])=>`${k}='${v.replaceAll("'", "'\\''")}'`).join('\n')+'\n',{mode:0o600});
 await chmod(rendered,0o600);
 const docker=args=>execute('docker',['--context',env.TRACEFORGE_DOCKER_CONTEXT,...args]);
 const files=['-f','deploy/compose.yml',...(env.TRACEFORGE_DATABASE_MODE==='managed'?['-f','deploy/compose.mysql.yml']:[]),...(env.TRACEFORGE_PROFILE==='pi'?['-f','deploy/compose.pi.yml']:[]),...(env.TRACEFORGE_CHAIN_NETWORK?['-f','deploy/compose.chain-network.yml']:[]),...(env.TRACEFORGE_NETWORK_BOOTSTRAP_ENABLED==='true'?['-f','deploy/compose.network-bootstrap.yml']:[])];
 const composeArgs=['--context',env.TRACEFORGE_DOCKER_CONTEXT,'compose','--env-file',rendered,...files];
 const compose=(args,options)=>execute('docker',[...composeArgs,...args],options);
 return {path,env,rendered,docker,compose,composeArgs};
}
async function initialize(env){
 await mkdir(env.TRACEFORGE_DATA_DIR,{recursive:true,mode:0o700});
 await chmod(env.TRACEFORGE_DATA_DIR,0o700);
 for(const name of ['wallets','secrets','backups','mysql','caddy-data','caddy-config','network'])await mkdir(resolve(env.TRACEFORGE_DATA_DIR,name),{recursive:true,mode:0o700});
 for(const name of ['wallets','secrets','backups','caddy-data','caddy-config','network'])await chmod(resolve(env.TRACEFORGE_DATA_DIR,name),0o700);
 for(const key of ['MYSQL_PASSWORD_FILE','MYSQL_ROOT_PASSWORD_FILE','TRACEFORGE_SESSION_KEY_FILE','TRACEFORGE_BACKUP_KEY_FILE','TRACEFORGE_PROXY_KEY_FILE','TRACEFORGE_NETWORK_BOOTSTRAP_TOKEN_FILE']){
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
async function prepareImages(d,action){
 const endpoint=await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'context','inspect','--format','{{.Endpoints.docker.Host}}'],{capture:true});
 if(!endpoint.startsWith('unix://'))throw Error('Run image commands on the Docker host');
 if(action==='build'){
  if(process.env.TRACEFORGE_HELPER_CONTAINER!=='true')await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'build','-t',d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-ops:'+d.env.TRACEFORGE_VERSION,'-f','deploy/Dockerfile.ops','.']);
  await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'build','-t',d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-contract-tools:'+d.env.TRACEFORGE_VERSION,'contracts']);
  await d.compose(['build','api','indexer','ui']);
 }else for(const component of ['ops','contract-tools','api','indexer','ui'])await d.docker(['pull',d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-'+component+':'+d.env.TRACEFORGE_VERSION]);
}
export async function main(){
 let command=process.argv[2]||'help';
 if(command==='help'){console.log('Commands: setup, images, init, doctor, build, pull, up, down, status, logs, check, migrate, backup, restore-check, restore, deploy, rollback\nsetup prepares images, initializes private storage/secrets and runs doctor in order.\nPrivate chain: chain-init, chain-up, contract-init, chain-check, chain-export, validator-vote, validator-status\nPublic EVM: public-setup, public-wallet, public-deploy, public-up, public-check, public-down, public-status, public-wallets, public-fund\nJoining host: node-fetch, node-init, node-up, node-check, node-info, node-status, node-down\nSet TRACEFORGE_ENV_FILE to an owner-only deployment configuration. Public commands default to .traceforge-deploy/public.env.');return;}
 if(command.startsWith('node-')){const {nodeOperation}=await import('./node.mjs');await nodeOperation(command);return;}
 const publicCommand=command.startsWith('public-');
 if(publicCommand)process.env.TRACEFORGE_ENV_FILE ||= '.traceforge-deploy/public.env';
 const d=await deployment();
 if(publicCommand){
  if(d.env.TRACEFORGE_NETWORK_KIND!=='public')throw Error('Public commands require TRACEFORGE_NETWORK_KIND=public');
  if(['public-wallet','public-deploy','public-fund','public-wallets'].includes(command)){
   await doctor(d);const {publicOperation}=await import('./public.mjs');await publicOperation(command,d);return;
  }
  command=command.slice(7);
 }
 if(command.startsWith('chain-')||command.startsWith('validator-')||command==='contract-init'){const {chainOperation}=await import('./chain.mjs');await chainOperation(command,d);return;}
 if(command==='setup'){
  await prepareImages(d,d.env.TRACEFORGE_IMAGE_MODE);
  await initialize(d.env);
  await doctor(d);
  if(publicCommand){const {publicOperation}=await import('./public.mjs');await publicOperation('public-wallet',d);}
  console.log(publicCommand?'Public setup complete. Fund the displayed wallet, then run public-deploy and public-up.':'Setup complete. Follow the fresh-chain bootstrap or existing-chain startup steps.');return;
 }
 if(command==='init'){await initialize(d.env);return;}
 if(command==='doctor'){await doctor(d);return;}
 if(['up','deploy','rollback'].includes(command)&&(/^0x0{40}$/.test(d.env.TRACEFORGE_CONTRACT_ADDRESS)||/^0x0{64}$/.test(d.env.TRACEFORGE_RUNTIME_BYTECODE_HASH)))throw Error('Contract bootstrap pending; run '+(d.env.TRACEFORGE_NETWORK_KIND==='public'?'public-deploy':'contract-init')+' before application startup');
 if(['up','deploy','rollback','migrate'].includes(command))await doctor(d);
 if(['images','build','pull'].includes(command)){
  await prepareImages(d,command==='images'?d.env.TRACEFORGE_IMAGE_MODE:command);
 }
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
