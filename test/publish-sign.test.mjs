import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ossSign } from '../src/publish.mjs';

test('the OSS signature matches the documented V1 string-to-sign', () => {
  const secret = 'test-secret';
  const got = ossSign({ secret, method: 'PUT', contentType: 'image/jpeg', date: 'Mon, 20 Oct 2026 00:00:00 GMT', resource: '/bucket/wall/1.jpg' });
  const canonical = ['PUT', '', 'image/jpeg', 'Mon, 20 Oct 2026 00:00:00 GMT', '/bucket/wall/1.jpg'].join('\n');
  const want = crypto.createHmac('sha1', secret).update(canonical).digest('base64');
  assert.equal(got, want);
});
