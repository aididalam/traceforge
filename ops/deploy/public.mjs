import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execute} from './cli.mjs';
export async function publicOperation(command,d){
 if(d.env.TRACEFORGE_NETWORK_KIND!=='public')throw Error('Public network configuration required');
 if(command==='public-wallets')return d.compose(['exec','-T','api','node','dist/wallet-status.js']);
 const action={'public-wallet':'wallet','public-deploy':'deploy','public-fund':'fund'}[command];
 if(!action)throw Error('Unknown public operation');
 if(action==='deploy'&&!/^0x0{40}$/.test(d.env.TRACEFORGE_CONTRACT_ADDRESS)){
  const saved=JSON.parse(await readFile(resolve(d.env.TRACEFORGE_DATA_DIR,'contract-deployment.json'),'utf8'));
  if(saved.address.toLowerCase()!==d.env.TRACEFORGE_CONTRACT_ADDRESS.toLowerCase())throw Error('Existing contract configuration retained');
 }
 const variables=['TRACEFORGE_NETWORK_KIND','TRACEFORGE_CHAIN_ID','TRACEFORGE_RPC_URL','TRACEFORGE_NATIVE_SYMBOL','TRACEFORGE_FEE_MODE','TRACEFORGE_MAX_FEE_GWEI','TRACEFORGE_MAX_TRANSACTION_FEE','TRACEFORGE_FEE_RETRY_SECONDS'];
 const result=JSON.parse(await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'run','--rm',
  '--name',d.env.TRACEFORGE_PROJECT+'-public-bootstrap','--user',d.env.TRACEFORGE_UID+':'+d.env.TRACEFORGE_GID,
  '--add-host','host.docker.internal:host-gateway','--mount',`type=bind,source=${d.env.TRACEFORGE_DATA_DIR},target=/data`,
  ...variables.flatMap(key=>['-e',key+'='+d.env[key]]),'-e','TRACEFORGE_PUBLIC_ACTION='+action,
  ...['ADDRESS','AMOUNT','FUNDING_ID'].flatMap(key=>['-e',key+'='+(process.env[key]||'')]),
  d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-contract-tools:'+d.env.TRACEFORGE_VERSION],{capture:true}));
 console.log(JSON.stringify(result));
 if(result.pending){console.log('Transaction awaiting finality. Repeat the same command and funding ID; the saved transaction will be reconciled.');return;}
 if(action==='deploy'){
  let text=await readFile(d.path,'utf8');
  for(const [key,value] of Object.entries({TRACEFORGE_CONTRACT_ADDRESS:result.address,TRACEFORGE_DEPLOYMENT_BLOCK:result.deploymentBlock,TRACEFORGE_RUNTIME_BYTECODE_HASH:result.runtimeHash})){
   const pattern=new RegExp('^'+key+'=.*$','m');text=pattern.test(text)?text.replace(pattern,key+'='+value):text+'\n'+key+'='+value;
  }
  await writeFile(d.path,text,{mode:0o600});console.log('Finalized public contract identity saved. Run make public-up.');
 }
}
