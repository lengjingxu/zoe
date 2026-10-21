import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';

// The wall is two halves. The index (which picture, when, about what) lives on the Worker.
// The picture itself lives on Aliyun OSS, because the TV's network cannot reach Cloudflare and
// OSS is what it can. The Worker signs the OSS URL the browser and the TV fetch.

const TOO_BIG = 24_000_000;

export function resolveToken(publish) {
  if (publish.token) return publish.token;
  const name = publish.token_env || 'ZOE_PUBLISH_TOKEN';
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;
  throw new Error('no publish token: set ' + name + ' or publish.token in ~/.zoe/config.json');
}

export function keyFor(at) {
  const n = Number(at);
  if (!Number.isFinite(n) || n <= 0) throw new Error('publish: bad timestamp ' + at);
  return Math.trunc(n) + '.jpg';
}

function ossCreds(publish) {
  const id = publish.oss_key_id || process.env[publish.oss_key_id_env || 'ZOE_OSS_KEY_ID'];
  const secret = publish.oss_key_secret || process.env[publish.oss_key_secret_env || 'ZOE_OSS_KEY_SECRET'];
  if (!id || !secret) throw new Error('no OSS credentials: set publish.oss_key_id and publish.oss_key_secret in ~/.zoe/config.json');
  return { id, secret };
}

// OSS V1 signature: Authorization: OSS id:base64(hmac-sha1(secret, verb+content-md5+content-type+date+resource))
export function ossSign({ secret, method, contentType, date, resource }) {
  const canonical = [method, '', contentType, date, resource].join('\n');
  return crypto.createHmac('sha1', secret).update(canonical).digest('base64');
}

function putObject({ host, resource, body, contentType, id, secret }) {
  const date = new Date().toUTCString();
  const signature = ossSign({ secret, method: 'PUT', contentType, date, resource });
  return new Promise((resolve, reject) => {
    const req = https.request({
      host, method: 'PUT', path: '/' + resource.split('/').slice(2).join('/'),
      headers: {
        'content-type': contentType,
        'content-length': body.length,
        date,
        authorization: 'OSS ' + id + ':' + signature
      }
    }, (res) => {
      res.resume();
      res.on('end', () => res.statusCode >= 200 && res.statusCode < 300
        ? resolve()
        : reject(new Error('publish: OSS answered ' + res.statusCode + ' for ' + resource)));
    });
    req.on('error', reject);
    req.end(body);
  });
}

export function payload({ at, topic, caption, scene, model, fresh }) {
  return {
    key: keyFor(at),
    meta: {
      at: Math.trunc(Number(at)),
      topic: String(topic || '').slice(0, 300),
      // What the wall shows. topic stays the internal record of the hour; caption is written for
      // a reader who only sees the picture.
      caption: String(caption || '').slice(0, 400),
      scene: scene || null,
      model: model || null,
      fresh: !!fresh
    }
  };
}

export async function push({ url, token, image, at, topic, caption, scene, model, fresh, publish }) {
  if (!url) throw new Error('publish: publish.url is not set in ~/.zoe/config.json');
  const bucket = publish.oss_bucket;
  const endpoint = publish.oss_endpoint;
  if (!bucket || !endpoint) throw new Error('publish: publish.oss_bucket and publish.oss_endpoint are not set');
  const { id, secret } = ossCreds(publish);
  const key = keyFor(at);
  const body = fs.readFileSync(image);
  if (body.length > TOO_BIG) throw new Error('publish: ' + path.basename(image) + ' is over the 24 MB the wall takes');
  await putObject({ host: bucket + '.' + endpoint, resource: '/' + bucket + '/wall/' + key, body, contentType: 'image/jpeg', id, secret });
  const res = await fetch(url.replace(/\/+$/, '') + '/api/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-push-token': token },
    body: JSON.stringify(payload({ at, topic, caption, scene, model, fresh }))
  });
  let out = null;
  try { out = await res.json(); } catch (e) {
    throw new Error('publish: ' + url + ' answered ' + res.status + ' with no JSON');
  }
  if (!res.ok || !out.ok) throw new Error('publish: ' + url + ' refused ' + key + ': ' + (out.error || res.status));
  await writeIndex({ url, token, bucket, endpoint, id, secret });
  return out;
}

// The TV reads this file straight from OSS, because its network cannot reach the Worker.
// One small JSON, public through the same signed mechanism the pictures use.
async function writeIndex({ url, token, bucket, endpoint, id, secret }) {
  const res = await fetch(url.replace(/\/+$/, '') + '/api/list', { headers: { 'x-push-token': token } });
  if (!res.ok) throw new Error('publish: could not read the index back to mirror it');
  const list = JSON.parse(await res.text());
  // Each entry carries a signed address the TV fetches directly. The signature lasts a year,
  // which is how long a picture stays on the wall before the next one replaces it.
  const year = 365 * 24 * 3600;
  for (const item of list.items || []) item.url = signGet({ bucket, endpoint, id, secret, objectKey: 'wall/' + item.key, seconds: year });
  const index = Buffer.from(JSON.stringify(list));
  await putObject({ host: bucket + '.' + endpoint, resource: '/' + bucket + '/wall/index.json', body: index, contentType: 'application/json', id, secret });
}

function signGet({ bucket, endpoint, id, secret, objectKey, seconds }) {
  const expires = Math.floor(Date.now() / 1000) + seconds;
  const resource = '/' + bucket + '/' + objectKey;
  const canonical = ['GET', '', '', String(expires), resource].join('\n');
  const signature = crypto.createHmac('sha1', secret).update(canonical).digest('base64');
  return 'https://' + bucket + '.' + endpoint + '/' + objectKey
    + '?OSSAccessKeyId=' + encodeURIComponent(id) + '&Expires=' + expires + '&Signature=' + encodeURIComponent(signature);
}
