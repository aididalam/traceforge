import {mkdir,stat,writeFile,readFile,readdir,copyFile,chmod,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {execute} from './cli.mjs';
import {encryptedProcess} from './recovery.mjs';

function chainArgs(d){return ['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'compose','--env-file',d.rendered,'-f','chain/docker/deployment.compose.yml',...(d.env.TRACEFORGE_CHAIN_NETWORK_EXISTING==='true'?['-f','chain/docker/external-network.compose.yml']:[]),...(d.env.TRACEFORGE_P2P_ENABLED==='true'?['-f','chain/docker/p2p.compose.yml']:[])];}
async function start(d){
 const running=(await execute('docker',[...chainArgs(d),'ps','--status','running','--services'],{capture:true})).split('\n').filter(Boolean);
 if(running.length>=3){for(let i=1;i<=4;i++){await execute('docker',[...chainArgs(d),'up','-d','--no-deps','validator'+i]);await wait(d);}}
 else await execute('docker',[...chainArgs(d),'up','-d']);
}
async function check(d){
 const urls=d.env.TRACEFORGE_CHAIN_MODE==='local'?[1,2,3,4].map(i=>`http://validator${i}:8545`):[d.env.TRACEFORGE_RPC_URL,...(d.env.TRACEFORGE_RPC_FALLBACK_URLS||'').split(',').filter(Boolean)];
 const publicNetwork=d.env.TRACEFORGE_NETWORK_KIND==='public';
 const code=`const urls=${JSON.stringify(urls)},expected=${Number(d.env.TRACEFORGE_CHAIN_ID)};async function rpc(url,method,params=[]){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(8000)});const j=await r.json();if(!r.ok||j.error||!('result'in j))throw Error();return j.result;}const online=[];for(const url of urls)try{if(BigInt(await rpc(url,'eth_chainId'))===BigInt(expected))online.push(url);}catch{}if(!online.length)throw Error('No live RPC');const url=online[0];${publicNetwork?`const finalized=await rpc(url,'eth_getBlockByNumber',['finalized',false]);if(!finalized?.hash)throw Error('Finality unavailable');await rpc(url,'eth_getLogs',[{address:${JSON.stringify(d.env.TRACEFORGE_CONTRACT_ADDRESS)},fromBlock:finalized.number,toBlock:finalized.number}]);`:`const validators=await rpc(url,'qbft_getValidatorsByBlockNumber',['latest']);if(validators.length<${Number(d.env.TRACEFORGE_MIN_VALIDATORS)})throw Error('Validator set below configured minimum');`}const before=BigInt(await rpc(url,'eth_blockNumber'));await new Promise(r=>setTimeout(r,${publicNetwork?15000:6000}));const after=BigInt(await rpc(url,'eth_blockNumber'));if(after<=before){${publicNetwork?"const latest=await rpc(url,'eth_getBlockByNumber',['latest',false]);if(Date.now()/1000-Number(BigInt(latest.timestamp))>180)throw Error('Block production stalled');":"throw Error('Block production stalled');"}}console.log(JSON.stringify({chainId:expected,${publicNetwork?"networkKind:'public',finalizedBlock:BigInt(finalized.number).toString(),":"validators:validators.length,"}reachableRpc:online.length,block:after.toString(),status:online.length===urls.length?'healthy':'degraded',maxLag:Number((await Promise.all(online.map(u=>rpc(u,'eth_blockNumber').then(BigInt)))).reduce((m,v)=>v<m?v:m,after)-after)*-1}));`;
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
  // Local nodes bootstrap through the bridge; exported peers use host addresses.
  bootnodes.push(`enode://${publicKey}@${d.env['VALIDATOR'+i+'_IP']||'172.28.91.'+(10+i)}:${d.env['VALIDATOR'+i+'_P2P_PORT']||30303}`);
 }
 await writeFile(resolve(directory,'shared/bootnodes.txt'),bootnodes.join('\n')+'\n',{mode:0o644});
 console.log('New validator identities/genesis prepared; start the chain and explicitly initialize its contract.');
}
export async function chainOperation(command,d){
 if(d.env.TRACEFORGE_NETWORK_KIND==='public'&&command!=='chain-check')throw Error('Public networks use public setup/deployment commands');
 if(command==='validator-vote'||command==='validator-status')return validatorOperation(command,d);
 if(command==='chain-export')return exportNetwork(d);
 if(command==='chain-check'){const result=await check(d);console.log(result);return JSON.parse(result);}
 if(d.env.TRACEFORGE_CHAIN_MODE!=='local'&&command!=='contract-init')throw Error('External validators use their own lifecycle; use their chain Compose project');
 if(command==='chain-init'){await initialize(d);return;}
 if(command==='chain-up'){await refreshBootnodes(d);await start(d);await wait(d);return;}
 if(command==='contract-init'){
  const network=d.env.TRACEFORGE_CHAIN_NETWORK||'bridge';
  await wait({...d,env:{...d.env,TRACEFORGE_CHAIN_NETWORK:network}});
  await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'run','--rm','--user',d.env.TRACEFORGE_UID+':'+d.env.TRACEFORGE_GID,'--network',network,'--add-host','host.docker.internal:host-gateway','--mount',`type=bind,source=${d.env.TRACEFORGE_DATA_DIR},target=/data`,'-e','TRACEFORGE_CHAIN_ID='+d.env.TRACEFORGE_CHAIN_ID,'-e','TRACEFORGE_RPC_URL='+d.env.TRACEFORGE_RPC_URL,d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-contract-tools:'+d.env.TRACEFORGE_VERSION],{capture:true});
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

async function validatorOperation(command,d){
 const url=process.env.RPC||d.env.TRACEFORGE_RPC_URL;
 const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('Invalid validator RPC');
 const address=process.env.ADDRESS,add=process.env.ADD;
 if(command==='validator-vote'&&(!/^0x[0-9a-fA-F]{40}$/.test(address||'')||!['true','false'].includes(add)))throw Error('Set ADDRESS and ADD=true or false explicitly');
 const code=`const url=${JSON.stringify(url)};async function rpc(method,params=[]){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(8000)});const j=await r.json();if(!r.ok||j.error)throw Error('Validator RPC unavailable');return j.result;}if(BigInt(await rpc('eth_chainId'))!==BigInt(${JSON.stringify(d.env.TRACEFORGE_CHAIN_ID)}))throw Error('Chain mismatch');const {keccak256}=await import('viem');const code=await rpc('eth_getCode',[${JSON.stringify(d.env.TRACEFORGE_CONTRACT_ADDRESS)},'latest']);if(keccak256(code)!==${JSON.stringify(d.env.TRACEFORGE_RUNTIME_BYTECODE_HASH.toLowerCase())})throw Error('Contract mismatch');const validators=await rpc('qbft_getValidatorsByBlockNumber',['latest']);${command==='validator-vote'?`const accepted=await rpc('qbft_proposeValidatorVote',[${JSON.stringify(address)},${add}]);if(accepted!==true)throw Error('Vote rejected');console.log(JSON.stringify({proposalRecorded:true,address:${JSON.stringify(address)},add:${add},currentValidators:validators.length}));`:`console.log(JSON.stringify({validators,count:validators.length}));`}`;
 const result=await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'run','--rm','--network',d.env.TRACEFORGE_CHAIN_NETWORK||d.env.TRACEFORGE_PROJECT+'_private',d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-api:'+d.env.TRACEFORGE_VERSION,'node','--input-type=module','-e',code],{capture:true});
 console.log(result);return JSON.parse(result);
}

async function exportNetwork(d){
 if(d.env.TRACEFORGE_CHAIN_MODE!=='local'||d.env.TRACEFORGE_P2P_ENABLED!=='true')throw Error('Configure reachable private P2P before exporting the managed chain');
 const genesis=await readFile(resolve(d.env.TRACEFORGE_CHAIN_DATA_DIR,'shared/genesis.json'),'utf8');
 const bootnodes=[];
 for(let i=1;i<=4;i++){
  const key=(await readFile(resolve(d.env.TRACEFORGE_CHAIN_DATA_DIR,'validator'+i,'key.pub'),'utf8')).trim().replace(/^0x/,'');
  if(!/^[0-9a-fA-F]{128}$/.test(key))throw Error('Invalid node public key');
  bootnodes.push(`enode://${key}@${d.env['VALIDATOR'+i+'_ADVERTISE_HOST']}:${d.env['VALIDATOR'+i+'_P2P_PORT']}`);
 }
 const code=`const r=await fetch(${JSON.stringify(d.env.TRACEFORGE_RPC_URL)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBlockByNumber',params:['0x0',false]})});const j=await r.json();if(!j.result?.hash)throw Error();console.log(j.result.hash);`;
 const genesisHash=await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'run','--rm','--network',d.env.TRACEFORGE_CHAIN_NETWORK,d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-api:'+d.env.TRACEFORGE_VERSION,'node','-e',code],{capture:true});
 const bundle={format:1,chainId:Number(d.env.TRACEFORGE_CHAIN_ID),genesis,genesisFileHash:createHash('sha256').update(genesis).digest('hex'),genesisHash,bootnodes,besuImage:d.env.TRACEFORGE_BESU_IMAGE};
 const file=resolve(d.env.TRACEFORGE_DATA_DIR,'join-network.json');await writeFile(file,JSON.stringify(bundle,null,2)+'\n',{mode:0o644});
 const published=resolve(d.env.TRACEFORGE_DATA_DIR,'network');await mkdir(published,{recursive:true,mode:0o700});
 const temporary=resolve(published,'.join-network-'+randomBytes(6).toString('hex'));
 await writeFile(temporary,JSON.stringify(bundle,null,2)+'\n',{mode:0o644,flag:'wx'});
 await rename(temporary,resolve(published,'join-network.json'));
 console.log('Public network bundle exported (no private keys): '+file);
}

async function refreshBootnodes(d){
 const peers=[];
 for(let i=1;i<=4;i++){
  const key=(await readFile(resolve(d.env.TRACEFORGE_CHAIN_DATA_DIR,'validator'+i,'key.pub'),'utf8')).trim().replace(/^0x/,'');
  if(!/^[a-fA-F0-9]{128}$/.test(key))throw Error('Invalid node public key');
  peers.push(`enode://${key}@${d.env['VALIDATOR'+i+'_IP']||'172.28.91.'+(10+i)}:${d.env['VALIDATOR'+i+'_P2P_PORT']||30303}`);
 }
 await writeFile(resolve(d.env.TRACEFORGE_CHAIN_DATA_DIR,'shared/bootnodes.txt'),peers.join('\n')+'\n',{mode:0o644});
}
