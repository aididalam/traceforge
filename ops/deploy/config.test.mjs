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
});
test('rejects ambiguous configuration, shell expansion and unsafe deployment destinations', () => {
  for (const bad of ['A=1\nA=2', 'invalid text', 'A="broken', 'A=${HOME}']) assert.throws(() => parseEnv(bad));
  for (const [key, value] of [['TRACEFORGE_DATA_DIR','/'],['TRACEFORGE_PROJECT','bad;command'],['TRACEFORGE_SITE_ORIGIN','http://public.example'],['TRACEFORGE_RPC_URL','http://user:password@rpc.example'],['MYSQL_HOST','localhost'],['TRACEFORGE_CHAIN_ID','0'],['TRACEFORGE_CONTRACT_ADDRESS','0x123']]) {
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
