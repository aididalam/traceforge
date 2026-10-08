import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateBundle,downloadNetworkBundle} from './node.mjs';
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
const genesis=JSON.stringify({config:{chainId:9009,qbft:{blockperiodseconds:2}},extraData:'0x00'});
const bundle={format:1,chainId:9009,genesis,genesisFileHash:createHash('sha256').update(genesis).digest('hex'),genesisHash:'0x'+'a'.repeat(64),bootnodes:['enode://'+'b'.repeat(128)+'@192.168.0.1:30303']};
test('joining node rejects a different chain, altered genesis and malformed bootstrap peers',()=>{
 assert.equal(validateBundle(bundle,9009),bundle);
 for(const value of [{...bundle,chainId:9008},{...bundle,genesis:genesis+' '},{...bundle,genesisHash:'0x00'},{...bundle,bootnodes:[]},{...bundle,bootnodes:['enode://bad']}])assert.throws(()=>validateBundle(value,9009));
});
test('API download authenticates without query secrets, verifies identity, and refuses redirects and public HTTP',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'traceforge-node-fetch-')),tokenFile=join(directory,'token');
 const token='a'.repeat(64);let wrong=false,redirectHits=0;
 await writeFile(tokenFile,token,{mode:0o600});
 const server=createServer((request,response)=>{
  if(request.url==='/redirect'){response.writeHead(302,{Location:'/leak'});response.end();return;}
  if(request.url==='/leak')redirectHits++;
  if(request.headers.authorization!=='Bearer '+token){response.writeHead(401);response.end();return;}
  response.setHeader('Content-Type','application/json');response.end(JSON.stringify(wrong?{...bundle,chainId:9008}:bundle));
 });server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 const env={TRACEFORGE_JOIN_BUNDLE_URL:base+'/network/v1/bootstrap',TRACEFORGE_JOIN_TOKEN_FILE:tokenFile,TRACEFORGE_CHAIN_ID:'9009'};
 try{
  assert.deepEqual(await downloadNetworkBundle(env),bundle);
  await assert.rejects(downloadNetworkBundle({...env,TRACEFORGE_JOIN_BUNDLE_URL:'http://private.example/network/v1/bootstrap'}),/HTTPS/);
  await assert.rejects(downloadNetworkBundle({...env,TRACEFORGE_JOIN_BUNDLE_URL:base+'/network/v1/bootstrap?token=bad'}),/HTTPS/);
  await assert.rejects(downloadNetworkBundle({...env,TRACEFORGE_JOIN_BUNDLE_URL:base+'/redirect'}));assert.equal(redirectHits,0);
  await assert.rejects(downloadNetworkBundle({...env,TRACEFORGE_EXPECTED_GENESIS_HASH:'0x'+'f'.repeat(64)}),/Unexpected genesis/);
  wrong=true;await assert.rejects(downloadNetworkBundle(env),/identity mismatch/);wrong=false;
  await chmod(tokenFile,0o644);await assert.rejects(downloadNetworkBundle(env),/private/);
 }finally{server.close();server.closeAllConnections();await once(server,'close');await rm(directory,{recursive:true,force:true});}
});
