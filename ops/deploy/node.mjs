import {readFile,writeFile,mkdir,stat,chmod,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {parseEnv} from './config.mjs';
import {execute} from './cli.mjs';

export function validateBundle(bundle,chainId){
 if(!bundle||typeof bundle!=='object')throw Error('Invalid network bundle');
 if(bundle.format!==1||bundle.chainId!==chainId||typeof bundle.genesis!=='string')throw Error('Network bundle identity mismatch');
 if(createHash('sha256').update(bundle.genesis).digest('hex')!==bundle.genesisFileHash)throw Error('Genesis file checksum mismatch');
 const genesis=JSON.parse(bundle.genesis);
 if(Number(genesis.config?.chainId??genesis.config?.chainid)!==chainId||!genesis.config?.qbft)throw Error('Expected QBFT genesis');
 if(!/^0x[0-9a-fA-F]{64}$/.test(bundle.genesisHash))throw Error('Invalid genesis block identity');
 if(!Array.isArray(bundle.bootnodes)||!bundle.bootnodes.length||bundle.bootnodes.length>64||bundle.bootnodes.some(n=>{
  if(typeof n!=='string')return true;
  const match=n.match(/^enode:\/\/[0-9a-fA-F]{128}@(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]+):([0-9]{1,5})$/);
  return !match||Number(match[2])<1||Number(match[2])>65535;
 }))throw Error('Invalid bootstrap peers');
 return bundle;
}
export async function downloadNetworkBundle(env,fetchRequest=fetch){
 const url=new URL(env.TRACEFORGE_JOIN_BUNDLE_URL);
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||
    (url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('Use HTTPS for remote bootstrap');
 const tokenFile=resolve(env.TRACEFORGE_JOIN_TOKEN_FILE||'');
 const info=await stat(tokenFile);
 if(!info.isFile()||(info.mode&0o077))throw Error('Use a private node bootstrap token file');
 const token=(await readFile(tokenFile,'utf8')).trim();
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid node bootstrap token');
 const response=await fetchRequest(url,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok||!response.body)throw Error('Network bootstrap download failed');
 const chunks=[];let size=0;
 for await(const chunk of response.body){size+=chunk.length;if(size>4*1024*1024)throw Error('Network bundle exceeds size limit');chunks.push(chunk);}
 const bundle=validateBundle(JSON.parse(Buffer.concat(chunks).toString('utf8')),Number(env.TRACEFORGE_CHAIN_ID));
 if(env.TRACEFORGE_EXPECTED_GENESIS_HASH&&bundle.genesisHash.toLowerCase()!==env.TRACEFORGE_EXPECTED_GENESIS_HASH.toLowerCase())throw Error('Unexpected genesis block identity');
 return bundle;
}
export async function nodeOperation(command){
 const config=resolve(process.env.TRACEFORGE_ENV_FILE||'.traceforge-deploy/node.env');
 if((await stat(config)).mode&0o077)throw Error('Node configuration must be owner-only');
 const env=parseEnv(await readFile(config,'utf8'));
 env.TRACEFORGE_UID ||= String(process.getuid?.()??1000);env.TRACEFORGE_GID ||= String(process.getgid?.()??1000);
 if(!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(env.TRACEFORGE_PROJECT||''))throw Error('Invalid node project');
 for(const key of ['TRACEFORGE_UID','TRACEFORGE_GID','TRACEFORGE_CHAIN_ID','TRACEFORGE_NODE_P2P_PORT','TRACEFORGE_NODE_RPC_PORT']){
  if(!/^\d+$/.test(env[key]||'')||Number(env[key])<1||!Number.isSafeInteger(Number(env[key])))throw Error('Invalid numeric node setting');
 }
 for(const key of ['TRACEFORGE_NODE_P2P_PORT','TRACEFORGE_NODE_RPC_PORT'])if(Number(env[key])>65535)throw Error('Invalid node port');
 if(!env.TRACEFORGE_DATA_DIR?.startsWith('/')||/["'$`\\]/.test(env.TRACEFORGE_DATA_DIR))throw Error('Use a dedicated absolute node data directory');
 env.TRACEFORGE_DATA_DIR=resolve(env.TRACEFORGE_DATA_DIR);
 if(['/','/srv','/home','/Users','/tmp'].includes(env.TRACEFORGE_DATA_DIR))throw Error('Use a dedicated node data directory');
 if(!/^hyperledger\/besu:[a-zA-Z0-9_.-]+$/.test(env.TRACEFORGE_BESU_IMAGE||'')||!['BONSAI','FOREST'].includes(env.TRACEFORGE_BESU_STORAGE_FORMAT))throw Error('Pin the node image and storage format');
 for(const key of ['TRACEFORGE_P2P_BIND','TRACEFORGE_P2P_ADVERTISE_HOST'])if(isIP(env[key]||'')!==4)throw Error('Use a LAN/VPN IPv4 address for node P2P');
 if(['0.0.0.0','::','127.0.0.1','::1'].includes(env.TRACEFORGE_P2P_ADVERTISE_HOST))throw Error('Node must advertise a reachable IP');
 if(!/^[a-z0-9][a-z0-9_-]*$/.test(env.TRACEFORGE_IMAGE_NAMESPACE||'')||!/^\w[\w.-]{0,127}$/.test(env.TRACEFORGE_VERSION||''))throw Error('Invalid helper image');
 if(process.env.TRACEFORGE_HELPER_CONTAINER==='true')env.TRACEFORGE_DOCKER_CONTEXT='default';
 const context=env.TRACEFORGE_DOCKER_CONTEXT;
 if(!/^[\w.-]+$/.test(context||''))throw Error('Invalid Docker context');
 const endpoint=await execute('docker',['--context',context,'context','inspect','--format','{{.Endpoints.docker.Host}}'],{capture:true});
 if(!endpoint.startsWith('unix://'))throw Error('Run node commands on its Docker host');
 if(env.TRACEFORGE_EXPECTED_GENESIS_HASH&&!/^0x[0-9a-fA-F]{64}$/.test(env.TRACEFORGE_EXPECTED_GENESIS_HASH))throw Error('Invalid expected genesis block hash');
 if(command==='node-fetch'){
  const bundle=await downloadNetworkBundle(env);
  const file=resolve(env.TRACEFORGE_JOIN_BUNDLE_FILE);
  try{const existing=validateBundle(JSON.parse(await readFile(file,'utf8')),Number(env.TRACEFORGE_CHAIN_ID));if(existing.genesis!==bundle.genesis||existing.genesisHash.toLowerCase()!==bundle.genesisHash.toLowerCase())throw Error('Existing bundle retained; network cannot change');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  try{if((await readFile(resolve(env.TRACEFORGE_DATA_DIR,'shared/genesis.json'),'utf8'))!==bundle.genesis)throw Error('Existing node network cannot change');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(dirname(file),{recursive:true,mode:0o700});
  const temporary=file+'.tmp-'+randomBytes(6).toString('hex');
  await writeFile(temporary,JSON.stringify(bundle,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temporary,file);
  console.log('Network configuration downloaded and validated. Existing node keys and network retained.');return;
 }
 const bundle=validateBundle(JSON.parse(await readFile(resolve(env.TRACEFORGE_JOIN_BUNDLE_FILE),'utf8')),Number(env.TRACEFORGE_CHAIN_ID));
 if(env.TRACEFORGE_EXPECTED_GENESIS_HASH&&bundle.genesisHash.toLowerCase()!==env.TRACEFORGE_EXPECTED_GENESIS_HASH.toLowerCase())throw Error('Unexpected genesis block identity');
 const rendered=resolve(dirname(config),'node-compose.env');
 await writeFile(rendered,Object.entries(env).map(([k,v])=>`${k}='${v.replaceAll("'","'\\''")}'`).join('\n')+'\n',{mode:0o600});
 const args=['--context',context,'compose','--env-file',rendered,'-f','chain/docker/node.compose.yml'];
 const compose=argv=>execute('docker',[...args,...argv]);
 const data=env.TRACEFORGE_DATA_DIR;
 if(command==='node-init'){
  for(const path of [data,resolve(data,'data'),resolve(data,'shared')]){await mkdir(path,{recursive:true,mode:0o700});await chmod(path,0o700);}
  const genesisFile=resolve(data,'shared/genesis.json');
  try{if((await readFile(genesisFile,'utf8'))!==bundle.genesis)throw Error('Existing node genesis retained; cannot switch its network');}
  catch(error){if(error.code!=='ENOENT')throw error;await writeFile(genesisFile,bundle.genesis,{mode:0o644,flag:'wx'});}
  await writeFile(resolve(data,'shared/bootnodes.txt'),bundle.bootnodes.join('\n')+'\n',{mode:0o644});
  // Persist direct peers as well as discovery seeds. This also works through
  // Docker port forwarding when UDP discovery cannot complete its handshake.
  await writeFile(resolve(data,'data/static-nodes.json'),JSON.stringify(bundle.bootnodes)+'\n',{mode:0o600});
  const common=['--context',context,'run','--rm','--user',env.TRACEFORGE_UID+':'+env.TRACEFORGE_GID,'--mount',`type=bind,source=${data},target=/node`,env.TRACEFORGE_BESU_IMAGE,'--data-path=/node/data','public-key'];
  for(const [name,operation]of [['key.pub','export'],['address','export-address']]){
   try{await stat(resolve(data,'data',name));}catch(error){if(error.code!=='ENOENT')throw error;await execute('docker',[...common,operation,'--to=/node/data/'+name],{capture:true});}
  }
  await chmod(resolve(data,'data/key'),0o600);
  console.log('Node genesis/peers installed. Its own persistent key was generated or retained.');return;
 }
 if((await readFile(resolve(data,'shared/genesis.json'),'utf8'))!==bundle.genesis)throw Error('Node genesis differs from bundle');
 if(command==='node-up'){await compose(['up','-d']);return;}
 if(command==='node-down'){await compose(['down']);return;}
 if(command==='node-status'){await compose(['ps','-a']);return;}
 if(command==='node-info'){
  const publicKey=(await readFile(resolve(data,'data/key.pub'),'utf8')).trim().replace(/^0x/,'');
  const address=(await readFile(resolve(data,'data/address'),'utf8')).trim();
  if(!/^[a-fA-F0-9]{128}$/.test(publicKey)||!/^0x[a-fA-F0-9]{40}$/.test(address))throw Error('Invalid generated node identity');
  console.log(JSON.stringify({address,enode:`enode://${publicKey}@${env.TRACEFORGE_P2P_ADVERTISE_HOST}:${env.TRACEFORGE_NODE_P2P_PORT}`}));return;
 }
 if(command==='node-check'){
  const code=`async function rpc(method,params=[]){const r=await fetch('http://node:8545',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(8000)});const j=await r.json();if(j.error||!r.ok)throw Error('Node RPC unavailable');return j.result;}if(BigInt(await rpc('eth_chainId'))!==BigInt(${JSON.stringify(env.TRACEFORGE_CHAIN_ID)}))throw Error('Chain mismatch');if((await rpc('eth_getBlockByNumber',['0x0',false])).hash!==${JSON.stringify(bundle.genesisHash)})throw Error('Genesis block mismatch');if(BigInt(await rpc('net_peerCount'))<1n)throw Error('No peers');if(await rpc('eth_syncing')!==false)throw Error('Node is syncing');const before=BigInt(await rpc('eth_blockNumber'));await new Promise(r=>setTimeout(r,6000));const after=BigInt(await rpc('eth_blockNumber'));if(after<=before)throw Error('Node is not following new blocks');console.log(JSON.stringify({healthy:true,chainId:${Number(env.TRACEFORGE_CHAIN_ID)},block:after.toString(),peers:Number(BigInt(await rpc('net_peerCount'))),validators:(await rpc('qbft_getValidatorsByBlockNumber',['latest'])).length}));`;
  console.log(await execute('docker',['--context',context,'run','--rm','--network',env.TRACEFORGE_PROJECT+'_default',env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-ops:'+env.TRACEFORGE_VERSION,'--input-type=module','-e',code],{capture:true}));return;
 }
 throw Error('Unknown node command');
}
