// HTTP acceptance for an explicitly selected, disposable local deployment.
// Tokens remain in memory; only public verification results are written.
import assert from 'node:assert/strict';
import {readFile, writeFile, rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {deployment} from './cli.mjs';
import {downloadNetworkBundle} from './node.mjs';

const d = await deployment();
assert.equal(process.env.TRACEFORGE_ACCEPTANCE, 'true');
assert.ok(d.env.TRACEFORGE_PROJECT.endsWith('-test'));
assert.equal(d.env.TRACEFORGE_CHAIN_MODE, 'local');
assert.equal(d.env.TRACEFORGE_NETWORK_BOOTSTRAP_ENABLED, 'true');
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(d.env.TRACEFORGE_SITE_ORIGIN).hostname));
const tokenFile = d.env.TRACEFORGE_NETWORK_BOOTSTRAP_TOKEN_FILE;
const tokenText = await readFile(tokenFile, 'utf8'), token = tokenText.trim();
const file = resolve(d.env.TRACEFORGE_DATA_DIR, 'network/join-network.json');
const original = await readFile(file, 'utf8'), expected = JSON.parse(original);
const url = d.env.TRACEFORGE_SITE_ORIGIN + '/network/v1/bootstrap';
async function request(value) {
  return fetch(url, {headers: value ? {Authorization: 'Bearer ' + value} : {}, signal: AbortSignal.timeout(30000)});
}
async function waitStatus(value, expectedStatus) {
  const deadline = Date.now() + 15000;
  do {
    const response = await request(value);
    if (response.status === expectedStatus) return response;
    await response.arrayBuffer();
    await new Promise(done => setTimeout(done, 250));
  } while (Date.now() < deadline);
  throw Error('Expected bootstrap status did not become visible');
}
async function publish(text) {
  const temporary = file + '.acceptance-' + randomBytes(6).toString('hex');
  await writeFile(temporary, text, {mode: 0o644, flag: 'wx'});
  await rename(temporary, file);
}
assert.equal((await request()).status, 401);
assert.equal((await request(randomBytes(32).toString('hex'))).status, 401);
const response = await request(token);
assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
assert.deepEqual(await response.json(), expected);
const downloaded = await downloadNetworkBundle({TRACEFORGE_JOIN_BUNDLE_URL: url,
  TRACEFORGE_JOIN_TOKEN_FILE: tokenFile, TRACEFORGE_CHAIN_ID: d.env.TRACEFORGE_CHAIN_ID,
  TRACEFORGE_EXPECTED_GENESIS_HASH: expected.genesisHash});
assert.deepEqual(downloaded, expected);
for (const path of ['/integration/v1/me', '/operator/api/me']) {
  const denied = await fetch(d.env.TRACEFORGE_SITE_ORIGIN + path, {
    headers: {Authorization: 'Bearer ' + token}, signal: AbortSignal.timeout(15000)});
  assert.equal(denied.status, 401, 'Bootstrap token must not grant business or ERP access');
}
try {
  await publish(JSON.stringify({...expected, genesisHash: '0x' + '1'.repeat(64)}));
  const mismatch = await waitStatus(token, 503);
  assert.ok(!(await mismatch.text()).includes(d.env.TRACEFORGE_DATA_DIR));
} finally {await publish(original);}
await waitStatus(token, 200);
try {
  const replacement = randomBytes(32).toString('hex');
  await writeFile(tokenFile, replacement + '\n');
  await waitStatus(token, 401);
  await waitStatus(replacement, 200);
} finally {await writeFile(tokenFile, tokenText);}
await waitStatus(token, 200);
const report = {passed: true, verifiedAt: new Date().toISOString(), endpoint: '/network/v1/bootstrap',
  chainId: expected.chainId, genesisHash: expected.genesisHash, originalGenesisReturned: true,
  anonymousRejected: true, wrongTokenRejected: true, wrongGenesisRejected: true,
  tokenRotationPassed: true, nodeDownloadValidated: true, businessAndErpAccessRejected: true, privateKeysExposed: false};
await writeFile(resolve(d.env.TRACEFORGE_DATA_DIR, 'network-bootstrap-report.json'), JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
console.log(JSON.stringify(report));
