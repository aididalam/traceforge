import {mkdir,stat,writeFile,readFile,readdir,copyFile,chmod} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {execute} from './cli.mjs';
import {encryptedProcess} from './recovery.mjs';

function chainArgs(d){return ['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'compose','--env-file',d.rendered,'-f','chain/docker/deployment.compose.yml',...(d.env.TRACEFORGE_CHAIN_NETWORK_EXISTING==='true'?['-f','chain/docker/external-network.compose.yml']:[])];}
async function start(d){await execute('docker',[...chainArgs(d),'up','-d']);}
async function check(d){
 const urls=d.env.TRACEFORGE_CHAIN_MODE==='local'?[1,2,3,4].map(i=>`http://validator${i}:8545`):[d.env.TRACEFORGE_RPC_URL,...(d.env.TRACEFORGE_RPC_FALLBACK_URLS||'').split(',').filter(Boolean)];
 const code=`const urls=${JSON.stringify(urls)},expected=${Number(d.env.TRACEFORGE_CHAIN_ID)};async function rpc(url,method,params=[]){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(4000)});const j=await r.json();if(j.error||!('result'in j))throw Error();return j.result;}const online=[];for(const url of urls)try{if(BigInt(await rpc(url,'eth_chainId'))===BigInt(expected))online.push(url);}catch{}if(!online.length)throw Error('No live RPC');const url=online[0],validators=await rpc(url,'qbft_getValidatorsByBlockNumber',['latest']);if(validators.length!==4)throw Error('Validator set mismatch');const before=BigInt(await rpc(url,'eth_blockNumber'));await new Promise(r=>setTimeout(r,6000));const after=BigInt(await rpc(url,'eth_blockNumber'));if(after<=before)throw Error('Block production stalled');console.log(JSON.stringify({chainId:expected,validators:validators.length,reachableRpc:online.length,block:after.toString(),status:online.length===urls.length?'healthy':'degraded',maxLag:Number((await Promise.all(online.map(u=>rpc(u,'eth_blockNumber').then(BigInt)))).reduce((m,v)=>v<m?v:m,after)-after)*-1}));`;
 const network=d.env.TRACEFORGE_CHAIN_NETWORK||d.env.TRACEFORGE_PROJECT+'_private';
 return execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'run','--rm','--network',network,'--add-host','host.docker.internal:host-gateway',d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-api:'+d.env.TRACEFORGE_VERSION,'node','-e',code],{capture:true});
}
async function wait(d){let failure;for(let attempt=0;attempt<30;attempt++){try{const result=await check(d);const health=JSON.parse(result);if(d.env.TRACEFORGE_CHAIN_MODE==='local'&&(health.status!=='healthy'||health.maxLag>5))throw Error('Validators are still recovering');console.log(result);return;}catch(error){failure=error;await new Promise(done=>setTimeout(done,2000));}}throw failure;}
async function initialize(d){
 const directory=d.env.TRACEFORGE_CHAIN_DATA_DIR;
 await mkdir(directory,{recursive:true,mode:0o700});
 if((await readdir(directory)).length)throw Error('Existing chain directory retained; bootstrap requires an empty dedicated directory');
 const config={genesis:{config:{chainId:Number(d.env.TRACEFORGE_CHAIN_ID),berlinBlock:0,londonBlock:0,zeroBaseFee:true,qbft:{blockperiodseconds:2,epochlength:30000,requesttimeoutseconds:4,blockreward:'0'}},nonce:'0x0',timestamp:'0x58ee40ba',gasLimit:'0x1c9c380',difficulty:'0x1',mixHash:'0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365',coinbase:'0x0000000000000000000000000000000000000000',alloc:{}},blockchain:{nodes:{generate:true,count:4}}};
 await writeFile(resolve(directory,'generator.json'),JSON.stringify(config),{mode:0o600});
 await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'run','--rm','--user',d.env.TRACEFORGE_UID+':'+d.env.TRACEFORGE_GID,'--mount',`type=bind,source=${directory},target=/network`,d.env.TRACEFORGE_BESU_IMAGE,'operator','generate-blockchain-config','--config-file=/network/generator.json','--to=/network/generated','--private-key-file-name=key'],{capture:true});
 const keys=(await readdir(resolve(directory,'generated/keys'))).sort();if(keys.length!==4)throw Error('Four validator keys required');
 await mkdir(resolve(directory,'shared'),{mode:0o700});await copyFile(resolve(directory,'generated/genesis.json'),resolve(directory,'shared/genesis.json'));
 const bootnodes=[];
 for(let i=1;i<=4;i++){
  const target=resolve(directory,'validator'+i);await mkdir(target,{mode:0o700});
  for(const name of ['key','key.pub']){await copyFile(resolve(directory,'generated/keys',keys[i-1],name),resolve(target,name));await chmod(resolve(target,name),name==='key'?0o600:0o644);}
  const publicKey=(await readFile(resolve(target,'key.pub'),'utf8')).trim().replace(/^0x/,'');
  if(!/^[a-fA-F0-9]{128}$/.test(publicKey))throw Error('Invalid validator public key');
  bootnodes.push(`enode://${publicKey}@${d.env['VALIDATOR'+i+'_IP']||'172.28.91.'+(10+i)}:30303`);
 }
 await writeFile(resolve(directory,'shared/bootnodes.txt'),bootnodes.join('\n')+'\n',{mode:0o644});
 console.log('New validator identities/genesis prepared; start the chain and explicitly initialize its contract.');
}
export async function chainOperation(command,d){
 if(command==='chain-check'){const result=await check(d);console.log(result);return JSON.parse(result);}
 if(d.env.TRACEFORGE_CHAIN_MODE!=='local')throw Error('External validators use their own lifecycle; use their chain Compose project');
 if(command==='chain-init'){await initialize(d);return;}
 if(command==='chain-up'){await start(d);await wait(d);return;}
 if(command==='contract-init'){
  await wait(d);
  await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'run','--rm','--user',d.env.TRACEFORGE_UID+':'+d.env.TRACEFORGE_GID,'--network',d.env.TRACEFORGE_CHAIN_NETWORK,'--mount',`type=bind,source=${d.env.TRACEFORGE_DATA_DIR},target=/data`,'-e','TRACEFORGE_CHAIN_ID='+d.env.TRACEFORGE_CHAIN_ID,'-e','TRACEFORGE_RPC_URL='+d.env.TRACEFORGE_RPC_URL,d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-contract-tools:'+d.env.TRACEFORGE_VERSION],{capture:true});
  const record=JSON.parse(await readFile(resolve(d.env.TRACEFORGE_DATA_DIR,'contract-deployment.json'),'utf8'));
  let text=await readFile(d.path,'utf8');for(const [key,value]of Object.entries({TRACEFORGE_CONTRACT_ADDRESS:record.address,TRACEFORGE_DEPLOYMENT_BLOCK:record.deploymentBlock,TRACEFORGE_RUNTIME_BYTECODE_HASH:record.runtimeHash}))text=text.replace(new RegExp('^'+key+'=.*$','m'),key+'='+value);
  await writeFile(d.path,text,{mode:0o600});console.log('Contract identity recorded in deployment configuration.');return;
 }
 if(command==='chain-backup'||command==='chain-upgrade'){
  const directory=resolve(d.env.TRACEFORGE_DATA_DIR,'backups','chain-'+new Date().toISOString().replaceAll(':','-'));
  await mkdir(directory,{recursive:true,mode:0o700});const key=Buffer.from((await readFile(d.env.TRACEFORGE_BACKUP_KEY_FILE,'utf8')).trim(),'hex');
  if(command==='chain-upgrade')await execute('docker',[...chainArgs(d),'pull']);
  await wait(d);
  for(let i=1;i<=4;i++){
   await execute('docker',[...chainArgs(d),'stop','validator'+i]);
   try{await encryptedProcess(['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'run','--rm','--user','0:0','--mount',`type=bind,source=${d.env.TRACEFORGE_CHAIN_DATA_DIR},target=/chain,readonly`,d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-api:'+d.env.TRACEFORGE_VERSION,'tar','czf','-','-C','/chain','shared','validator'+i],resolve(directory,'validator'+i+'.tfg'),key);}
   finally{await execute('docker',[...chainArgs(d),'up','-d',...(command==='chain-upgrade'?['--force-recreate']:[]),'validator'+i]);await wait(d);}
  }
  console.log('Cold validator snapshots completed while retaining chain identity and block production.');return;
 }
 throw Error('Unknown chain operation');
}
