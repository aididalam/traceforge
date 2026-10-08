// A mutating consensus test for an owned disposable network only.
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {deployment,execute} from './cli.mjs';
import {chainOperation} from './chain.mjs';
const d=await deployment(),address=process.env.ADDRESS?.toLowerCase();
assert.equal(process.env.TRACEFORGE_ACCEPTANCE,'true');
assert.ok(d.env.TRACEFORGE_PROJECT.endsWith('-test'));
assert.equal(d.env.TRACEFORGE_CHAIN_MODE,'local');
assert.match(address||'',/^0x[0-9a-f]{40}$/);
const bundle=JSON.parse(await readFile(resolve(d.env.TRACEFORGE_DATA_DIR,'join-network.json'),'utf8'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function rpc(method,params=[],node=1){
 const code=`const r=await fetch('http://validator${node}:8545',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:${JSON.stringify(method)},params:${JSON.stringify(params)}}),signal:AbortSignal.timeout(8000)});const j=await r.json();if(j.error||!r.ok)throw Error('RPC unavailable');console.log(JSON.stringify(j.result));`;
 return JSON.parse(await execute('docker',['--context',d.env.TRACEFORGE_DOCKER_CONTEXT,'run','--rm','--network',d.env.TRACEFORGE_CHAIN_NETWORK,d.env.TRACEFORGE_IMAGE_NAMESPACE+'/traceforge-api:'+d.env.TRACEFORGE_VERSION,'node','-e',code],{capture:true}));
}
async function until(fn){const end=Date.now()+120000;let error;while(Date.now()<end){try{return await fn();}catch(e){error=e;await pause(2000);}}throw error;}
assert.equal((await rpc('eth_getBlockByNumber',['0x0',false])).hash,bundle.genesisHash);
const validators=()=>rpc('qbft_getValidatorsByBlockNumber',['latest']);
assert.equal((await validators()).length,4);assert.ok(!(await validators()).includes(address));
let votesStarted=false,elected=false,metrics;
try{
 process.env.ADD='true';process.env.ADDRESS=address;
 for(let i=1;i<=2;i++){process.env.RPC='http://validator'+i+':8545';await chainOperation('validator-vote',d);votesStarted=true;}
 await pause(10000);
 assert.ok(!(await validators()).includes(address),'Two votes must not elect a fifth validator');
 process.env.RPC='http://validator3:8545';await chainOperation('validator-vote',d);
 await until(async()=>{const set=await validators();assert.equal(set.length,5);assert.ok(set.includes(address));});elected=true;
 metrics=await until(async()=>{const list=await rpc('qbft_getSignerMetrics');const signer=list.find(v=>v.address.toLowerCase()===address);assert.ok(signer&&BigInt(signer.proposedBlockCount)>0n);return signer;});
 await chainOperation('chain-check',d);
 console.log('Remote node was elected with three votes and actually proposed blocks; health supports five validators.');
}finally{
 // Only this explicitly guarded test address is removed. Leave the network's
 // four original identities active and clear pending test proposals.
 if(votesStarted){
  if((await validators()).includes(address)){
   process.env.ADD='false';for(let i=1;i<=3;i++){process.env.RPC='http://validator'+i+':8545';await chainOperation('validator-vote',d);}
   await until(async()=>assert.ok(!(await validators()).includes(address)));
  }
  for(let i=1;i<=3;i++)await rpc('qbft_discardValidatorVote',[address],i);
 }
}
const report={passed:true,verifiedAt:new Date().toISOString(),chainId:Number(d.env.TRACEFORGE_CHAIN_ID),genesisHash:bundle.genesisHash,remoteAddress:address,twoVotesRejected:true,threeVotesElected:elected,remoteSigner:metrics,removedAfterTest:!(await validators()).includes(address),validatorsAfterTest:(await validators()).length};
await writeFile(resolve(d.env.TRACEFORGE_DATA_DIR,'node-election-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(report));
