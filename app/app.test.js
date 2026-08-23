import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer, buildSnapshot } from './server.mjs';

test('buildSnapshot returns a fully verifiable dashboard snapshot', () => {
  const snap = buildSnapshot(1_755_860_000_000);

  assert.equal(snap.schema, 'PiRC1-TransparencyDashboard/1');
  assert.ok(snap.price_floor.p_floor_marginal > 0);
  assert.equal(snap.pool_health.healthy, true);
  assert.equal(snap.escrow_lock_status.verifiable, true);
  assert.equal(snap.escrow_lock_status.state, 'SIGNING_AUTHORITY_REVOKED');
  assert.ok(snap.engagement.leaderboard.length >= 3);

  const scores = snap.engagement.leaderboard.map((r) => r.score);
  assert.deepEqual([...scores].sort((a, b) => b - a), scores);
});

test('server serves index and snapshot endpoints', async () => {
  const server = createAppServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  try {
    const html = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Pi Transparency Dashboard/);

    const api = await fetch(`http://127.0.0.1:${port}/api/snapshot`);
    assert.equal(api.status, 200);
    const snap = await api.json();
    assert.equal(snap.schema, 'PiRC1-TransparencyDashboard/1');

    const missing = await fetch(`http://127.0.0.1:${port}/nope`);
    assert.equal(missing.status, 404);

    const manifest = await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`);
    assert.equal(manifest.status, 200);
    assert.match(await manifest.text(), /Pi Transparency Dashboard/);

    const icon = await fetch(`http://127.0.0.1:${port}/assets/icon.svg`);
    assert.equal(icon.status, 200);
    assert.match(icon.headers.get('content-type'), /svg/);

    const brand = await fetch(`http://127.0.0.1:${port}/assets/brand/identity-original.jpeg`);
    assert.equal(brand.status, 200);
    assert.match(brand.headers.get('content-type'), /jpeg/);

    const traversal = await fetch(`http://127.0.0.1:${port}/assets/../server.mjs`);
    assert.equal(traversal.status, 404);
  } finally {
    server.close();
  }
});
