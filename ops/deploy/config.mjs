import { readFile, stat } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { isIP } from 'node:net';

export function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || match[1] in env) throw new Error('Invalid or duplicate deployment setting');
    let value = match[2].trim();
    if (/^["']/.test(value)) {
      if (value.at(-1) !== value[0]) throw new Error('Unclosed deployment setting');
      value = value.slice(1, -1);
    }
    if (/[\r\n\0]/.test(value) || value.includes('${')) throw new Error('Use literal values in deployment settings');
    env[match[1]] = value;
  }
  return env;
}

export function validateConfig(env) {
  env.TRACEFORGE_PROFILE ||= 'server';
  if (!['server','pi'].includes(env.TRACEFORGE_PROFILE)) throw new Error('Invalid deployment resource profile');
  if (env.TRACEFORGE_PROFILE==='pi' && env.TRACEFORGE_DATABASE_MODE==='external') throw new Error('Pi resource profile requires the managed database definition');
  const required = key => { if (!env[key]) throw new Error(`Missing ${key}`); return env[key]; };
  const integer = (key, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) => {
    const value = required(key);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum || Number(value) > maximum) throw new Error(`Invalid ${key}`);
  };
  for (const key of ['TRACEFORGE_PROJECT', 'TRACEFORGE_DOCKER_CONTEXT', 'MYSQL_DATABASE', 'MYSQL_USER']) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(required(key))) throw new Error(`Invalid ${key}`);
  }
  if (!/^[a-zA-Z0-9_]+$/.test(env.MYSQL_DATABASE)) throw new Error('Invalid MYSQL_DATABASE');
  if (!isAbsolute(required('TRACEFORGE_DATA_DIR')) || ['/', '/home', '/Users', '/srv', '/tmp'].includes(env.TRACEFORGE_DATA_DIR)) throw new Error('Use a dedicated absolute TRACEFORGE_DATA_DIR');
  if (/['"$`\\\r\n]/.test(env.TRACEFORGE_DATA_DIR)) throw new Error('Invalid storage path');
  env.TRACEFORGE_DATA_DIR = resolve(env.TRACEFORGE_DATA_DIR);
  if (['/', '/home', '/Users', '/srv', '/tmp'].includes(env.TRACEFORGE_DATA_DIR)) throw new Error('Use a dedicated absolute TRACEFORGE_DATA_DIR');
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(required('TRACEFORGE_IMAGE_NAMESPACE'))) throw new Error('Invalid TRACEFORGE_IMAGE_NAMESPACE');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(required('TRACEFORGE_VERSION'))) throw new Error('Invalid TRACEFORGE_VERSION');
  for (const [key, allowed] of [['TRACEFORGE_CHAIN_MODE', ['local', 'external']], ['TRACEFORGE_DATABASE_MODE', ['managed', 'external']], ['TRACEFORGE_BROADCAST_ENABLED', ['true', 'false']]]) {
    if (!allowed.includes(required(key))) throw new Error(`Invalid ${key}`);
  }
  if (env.TRACEFORGE_HTTP_BIND && !isIP(env.TRACEFORGE_HTTP_BIND)) throw new Error('Invalid TRACEFORGE_HTTP_BIND');
  for (const key of ['TRACEFORGE_RPC_URL', 'TRACEFORGE_SITE_ORIGIN']) {
    let url; try { url = new URL(required(key)); } catch { throw new Error(`Invalid ${key}`); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error(`Invalid ${key}`);
    if (key === 'TRACEFORGE_SITE_ORIGIN' && url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Non-local site requires HTTPS');
  }
  for (const url of (env.TRACEFORGE_RPC_FALLBACK_URLS || '').split(',').filter(Boolean)) {
    let parsed; try { parsed = new URL(url); } catch { throw new Error('Invalid TRACEFORGE_RPC_FALLBACK_URLS'); }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Invalid TRACEFORGE_RPC_FALLBACK_URLS');
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(required('TRACEFORGE_CONTRACT_ADDRESS'))) throw new Error('Invalid TRACEFORGE_CONTRACT_ADDRESS');
  if (!/^0x[0-9a-fA-F]{64}$/.test(required('TRACEFORGE_RUNTIME_BYTECODE_HASH'))) throw new Error('Invalid TRACEFORGE_RUNTIME_BYTECODE_HASH');
  if (!/^[a-zA-Z0-9_.:-]+$/.test(required('MYSQL_HOST'))) throw new Error('Invalid MYSQL_HOST');
  for (const key of ['MYSQL_PORT', 'TRACEFORGE_HTTP_PORT', 'TRACEFORGE_HTTPS_PORT']) integer(key, 1, 65535);
  for (const key of ['TRACEFORGE_CHAIN_ID', 'TRACEFORGE_UID', 'TRACEFORGE_GID', 'INDEXER_CHUNK_SIZE', 'TRACEFORGE_SYNC_INTERVAL_SECONDS', 'TRACEFORGE_BACKUP_RETENTION_DAYS']) integer(key);
  integer('TRACEFORGE_DEPLOYMENT_BLOCK', 0); integer('INDEXER_CONFIRMATIONS', 0);
  for (const key of ['MYSQL_PASSWORD_FILE', 'MYSQL_ROOT_PASSWORD_FILE', 'TRACEFORGE_SESSION_KEY_FILE', 'TRACEFORGE_BACKUP_KEY_FILE', 'TRACEFORGE_PROXY_KEY_FILE']) {
    if (!required(key) || required(key).includes('..')) throw new Error(`Invalid ${key}`);
    if (/['"$`\\\r\n]/.test(env[key])) throw new Error(`Invalid ${key}`);
    env[key] = resolve(env.TRACEFORGE_DATA_DIR, env[key]);
    if (!env[key].startsWith(env.TRACEFORGE_DATA_DIR+'/')) throw new Error('Keep deployment secrets under its private data directory');
  }
  if (env.TRACEFORGE_DATABASE_MODE === 'managed' && env.MYSQL_HOST !== 'db') throw new Error('Managed database must use MYSQL_HOST=db');
  if(env.TRACEFORGE_CHAIN_MODE==='local'){
    env.TRACEFORGE_CHAIN_DATA_DIR ||= resolve(env.TRACEFORGE_DATA_DIR,'chain');
    env.TRACEFORGE_CHAIN_DATA_DIR = resolve(env.TRACEFORGE_CHAIN_DATA_DIR);
    if(!env.TRACEFORGE_CHAIN_DATA_DIR.startsWith(env.TRACEFORGE_DATA_DIR+'/'))throw new Error('Managed chain requires a dedicated directory under its deployment data');
    env.TRACEFORGE_BESU_IMAGE ||= 'hyperledger/besu:26.9.0';
    if(!/^hyperledger\/besu:[a-zA-Z0-9_.-]+$/.test(env.TRACEFORGE_BESU_IMAGE))throw new Error('Invalid pinned Besu image');
    env.TRACEFORGE_BESU_STORAGE_FORMAT ||= 'BONSAI';
    if(!['BONSAI','FOREST'].includes(env.TRACEFORGE_BESU_STORAGE_FORMAT))throw new Error('Invalid Besu storage format');
  }
  return env;
}

export async function loadConfig(filename = process.env.TRACEFORGE_ENV_FILE || '.traceforge-deploy/deployment.env') {
  const path = resolve(filename);
  const info = await stat(path);
  if ((info.mode & 0o077) !== 0) throw new Error('Deployment configuration must be owner-only (chmod 600)');
  return { path, env: validateConfig(parseEnv(await readFile(path, 'utf8'))) };
}

export async function checkStorage(env) {
  for (const folder of [env.TRACEFORGE_DATA_DIR, resolve(env.TRACEFORGE_DATA_DIR, 'wallets')]) {
    const info = await stat(folder);
    if (!info.isDirectory() || (info.mode & 0o077)) throw new Error('Data and wallet directories must exist with owner-only access');
  }
  for (const key of ['MYSQL_PASSWORD_FILE', 'TRACEFORGE_SESSION_KEY_FILE', 'TRACEFORGE_BACKUP_KEY_FILE', 'TRACEFORGE_PROXY_KEY_FILE', ...(env.TRACEFORGE_DATABASE_MODE === 'managed' ? ['MYSQL_ROOT_PASSWORD_FILE'] : [])]) {
    const info = await stat(env[key]);
    if (!info.isFile() || (info.mode & 0o077)) throw new Error(`Owner-only secret file required: ${key}`);
    const value = (await readFile(env[key], 'utf8')).trim();
    if (!value || (key.includes('_KEY_FILE') && !/^[a-fA-F0-9]{64}$/.test(value))) throw new Error(`Invalid secret file: ${key}`);
  }
}
