import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, writeFile, chmod, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseEnv, validateConfig, loadConfig} from './config.mjs';
const example = await readFile(new URL('../../deploy/deployment.env.example', import.meta.url), 'utf8');
test('accepts documented configuration and resolves mounted secrets', () => {
  const config = validateConfig(parseEnv(example));
  assert.equal(config.MYSQL_PASSWORD_FILE, '/srv/traceforge/secrets/mysql-password');
  assert.equal(config.TRACEFORGE_IMAGE_MODE,'pull');
  assert.equal(config.TRACEFORGE_VERSION,'v0.1.0');
  assert.equal(config.TRACEFORGE_CHAIN_MODE,'local');
  assert.equal(config.TRACEFORGE_UID,String(process.getuid()));
  assert.equal(config.TRACEFORGE_NETWORK_BOOTSTRAP_ENABLED,'false');
  assert.equal(config.TRACEFORGE_NETWORK_BOOTSTRAP_TOKEN_FILE,'/srv/traceforge/secrets/network-bootstrap-token');
});
test('P2P requires a reachable advertised address and gives nodes different ports',()=>{
 const config={...parseEnv(example),TRACEFORGE_P2P_ENABLED:'true',TRACEFORGE_P2P_BIND:'192.168.0.10',TRACEFORGE_P2P_ADVERTISE_HOST:'192.168.0.10'};
 for(const address of ['', '127.0.0.1','0.0.0.0'])assert.throws(()=>validateConfig({...config,TRACEFORGE_P2P_ADVERTISE_HOST:address}));
 const checked=validateConfig(config);assert.equal(checked.VALIDATOR1_P2P_PORT,'30303');assert.equal(checked.VALIDATOR4_P2P_PORT,'30306');
 assert.throws(()=>validateConfig({...config,VALIDATOR2_P2P_PORT:'30303'}));
});
test('rejects ambiguous configuration, shell expansion and unsafe deployment destinations', () => {
  for (const bad of ['A=1\nA=2', 'invalid text', 'A="broken', 'A=${HOME}']) assert.throws(() => parseEnv(bad));
  for (const [key, value] of [['TRACEFORGE_DATA_DIR','/'],['TRACEFORGE_PROJECT','bad;command'],['TRACEFORGE_SITE_ORIGIN','http://public.example'],['TRACEFORGE_RPC_URL','http://user:password@rpc.example'],['MYSQL_HOST','localhost'],['TRACEFORGE_CHAIN_ID','0'],['TRACEFORGE_CONTRACT_ADDRESS','0x123'],['TRACEFORGE_NETWORK_BOOTSTRAP_ENABLED','yes'],['TRACEFORGE_NETWORK_BOOTSTRAP_TOKEN_FILE','/outside/secrets/token']]) {
    assert.throws(() => validateConfig({...parseEnv(example), [key]: value}));
  }
});
test('requires private configuration permissions and never echoes secret values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'traceforge-config-'));
  const file = join(directory, 'config.env');
  try {
    await writeFile(file, example, {mode:0o600}); assert.equal((await loadConfig(file)).env.TRACEFORGE_PROJECT, 'traceforge');
    await chmod(file, 0o644); await assert.rejects(loadConfig(file), /owner-only/);
  } finally {await rm(directory, {recursive:true, force:true});}
});
