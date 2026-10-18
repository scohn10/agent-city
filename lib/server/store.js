// Server-only: where signed-in users' cities are saved. Upstash Redis (Vercel Marketplace),
// or an in-memory map for local tests. Returns null when no store is configured.

import { Redis } from '@upstash/redis';

let redis = null;
const memory = new Map();

function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

function memoryOn() {
  return process.env.AGENTCITY_TEST_AUTH === '1' && (process.env.NODE_ENV !== 'production' || process.env.ALLOW_TEST_AUTH === '1');
}

export function storeEnabled() {
  return !!redisEnv() || memoryOn();
}

const key = uid => `agentcity:city:${uid}`;

export async function getCity(uid) {
  const env = redisEnv();
  if (env) {
    redis = redis || new Redis(env);
    return (await redis.get(key(uid))) || null;
  }
  if (memoryOn()) return memory.get(uid) || null;
  return null;
}

export async function putCity(uid, record) {
  const env = redisEnv();
  if (env) {
    redis = redis || new Redis(env);
    await redis.set(key(uid), record);
    return;
  }
  if (memoryOn()) memory.set(uid, record);
}
