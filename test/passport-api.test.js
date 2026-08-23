import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer, makeSamplePassport, issuePassport } from '../app/server.mjs';

async function withServer(fn) {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const post = async (base, path, body) => {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: r.status, json: await r.json() };
};

test('GET /api/sample-passport returns a verifiable passport', async () => {
  await withServer(async (base) => {
    const r = await (await fetch(base + '/api/sample-passport')).json();
    assert.equal(r.passport.type, 'AUREVIA-Evidence-Passport');
    const v = await post(base, '/api/verify-passport', { passport: r.passport });
    assert.equal(v.status, 200);
    assert.equal(v.json.ok, true, JSON.stringify(v.json));
    assert.equal(v.json.summary.proofs_total, 2);
  });
});

test('POST /api/passport-issue mints a valid passport for catalog actions only', async () => {
  await withServer(async (base) => {
    const ok = await post(base, '/api/passport-issue', {
      action_class: 'A',
      action_id: 'complete_transaction',
      weight: 100,
      subject: 'alice-demo'
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.passport.subject, 'alice-demo');

    const v = await post(base, '/api/verify-passport', { passport: ok.json.passport });
    assert.equal(v.json.ok, true);

    for (const bad of [
      { action_class: 'A', action_id: 'unknown_action', weight: 10 },
      { action_class: 'Z', action_id: 'daily_login', weight: 10 },
      { action_class: 'A', action_id: 'complete_transaction', weight: 99999 },
      { action_class: 'A', action_id: 'complete_transaction', weight: 1.5 },
      { action_class: 'A', action_id: 'complete_transaction', weight: 1, subject: 'bad tag!' }
    ]) {
      const res = await post(base, '/api/passport-issue', bad);
      assert.equal(res.status, 400, JSON.stringify(bad));
      assert.ok(res.json.error);
    }
  });
});

test('tampered passports are rejected by the live verifier', async () => {
  await withServer(async (base) => {
    const issued = await post(base, '/api/passport-issue', {
      action_class: 'C',
      action_id: 'daily_login',
      weight: 5
    });
    const forged = structuredClone(issued.json.passport);
    forged.evidence_root = 'e1:' + 'f'.repeat(64);
    const v = await post(base, '/api/verify-passport', { passport: forged });
    assert.equal(v.json.ok, false);
    assert.equal(v.json.code, 'EVIDENCE_ROOT');
  });
});

test('replay is caught across separate passport submissions', async () => {
  await withServer(async (base) => {
    const passport = makeSamplePassport();
    const first = await post(base, '/api/verify-passport', { passport });
    assert.equal(first.json.ok, true);
    const second = await post(base, '/api/verify-passport', { passport });
    assert.equal(second.json.ok, false);
    assert.equal(second.json.code, 'REPLAY_DETECTED');
  });
});

test('module-level issuers stay consistent with their exported helpers', () => {
  const viaHelper = issuePassport({ action_class: 'B', action_id: 'finish_kyc_flow', weight: 20 }, 12345);
  assert.equal(viaHelper.proofs.length, 1);
  assert.equal(typeof viaHelper.evidence_root, 'string');
  assert.throws(() => issuePassport({ action_class: 'A', action_id: 'nope', weight: 5 }));
});
