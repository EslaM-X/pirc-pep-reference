import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { makeWorld, SUITE_UID_SECRET } from '../src/attacks.js';
import { hashUid, newEvent, signEvent } from '../src/events.js';
import { InMemoryNonceStore } from '../src/nonces.js';
import { verifySignedEvent } from '../src/verify.js';
import { markEligible, registerApp, registerKey } from '../src/registry.js';
import { generateKeyPair, randomNonce } from '../src/keys.js';
import { createRevocationAttestation } from '../src/escrow.js';
import { assembleSnapshot } from '../src/dashboard.js';
import { toPiProof, verifyPiProof } from '../src/piproof.js';

/**
 * Pi Transparency App — local preview server.
 *
 * Serves the single-page Transparency Dashboard and one JSON endpoint:
 *   GET /              → app/index.html
 *   GET /api/snapshot  → fresh deterministic snapshot assembled by src/dashboard.js
 *
 * The snapshot is regenerated per request from the same verified-event
 * pipeline used everywhere else in this repository. No chain access,
 * no external calls, no pricing data.
 */

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DAY = 86_400_000;

// Long-lived verifier state for the PiProof Explorer: the registry epoch and
// the nonce store persist for the whole server lifetime, so a replayed proof
// is rejected on its second submission, exactly like a real deployment.
const PROOF_WORLD = makeWorld();
markEligible(PROOF_WORLD.registry, hashUid('pioneer-alice', SUITE_UID_SECRET));
markEligible(PROOF_WORLD.registry, hashUid('pioneer-bob', SUITE_UID_SECRET));
const PROOF_NONCES = new InMemoryNonceStore();

export function makeSampleProof(now = Date.now()) {
  const event = newEvent({
    app_id: 'demo-app',
    key_id: 'k-2026-active',
    action_class: 'A',
    action_id: 'complete_transaction',
    weight: 50,
    pioneer_uid: 'x',
    uidSecret: SUITE_UID_SECRET,
    now
  });
  event.pioneer_uid_hash = hashUid('pioneer-alice', SUITE_UID_SECRET);
  const signed = signEvent(event, PROOF_WORLD.currentKey.private_key_pem);
  return toPiProof(signed, { registry: PROOF_WORLD.registry });
}

function buildWorld(now) {
  const world = makeWorld();

  const escrowOld = generateKeyPair({ seed: Buffer.alloc(32, 7) });
  const escrowController = generateKeyPair({ seed: Buffer.alloc(32, 9) });

  registerApp(world.registry, 'launchpad-escrow');
  registerKey(world.registry, 'launchpad-escrow', 'ctrl-v2', escrowController.public_key_pem);

  const attestation = createRevocationAttestation(
    {
      escrowId: 'tge-escrow-main',
      controllerKeyId: 'ctrl-v2',
      previousPublicKeyPem: escrowOld.public_key_pem,
      effectiveAt: now ?? Date.now(),
      anchor: 'demo-anchor:0000000000000000000000000000000000000000',
      nonce: randomNonce()
    },
    escrowController.private_key_pem
  );

  return { world, attestation };
}

function verifiedEntry(state, uidLabel, klass, actionId, t) {
  const hash = hashUid(uidLabel, SUITE_UID_SECRET);
  markEligible(state.world.registry, hash);
  const event = newEvent({
    app_id: 'demo-app',
    key_id: 'k-2026-active',
    action_class: klass,
    action_id: actionId,
    weight: 1,
    pioneer_uid: 'x',
    uidSecret: SUITE_UID_SECRET,
    now: t
  });
  event.pioneer_uid_hash = hash;
  const signed = signEvent(event, state.world.currentKey.private_key_pem);
  const verdict = verifySignedEvent(signed, {
    registry: state.world.registry,
    nonceStore: new InMemoryNonceStore(),
    now: t
  });
  if (!verdict.ok) throw new Error(`fixture event rejected: ${verdict.code}`);
  return { event: signed, verdict };
}

export function buildSnapshot(now = Date.now()) {
  const state = buildWorld(now);

  const entries = [
    verifiedEntry(state, 'pioneer-alice', 'A', 'complete_transaction', now - 6 * DAY),
    verifiedEntry(state, 'pioneer-alice', 'B', 'finish_kyc_flow', now - 4 * DAY),
    verifiedEntry(state, 'pioneer-alice', 'C', 'daily_login', now - 2 * DAY),
    verifiedEntry(state, 'pioneer-alice', 'C', 'daily_login', now - DAY),
    verifiedEntry(state, 'pioneer-bob', 'A', 'complete_transaction', now - DAY),
    verifiedEntry(state, 'pioneer-carol', 'C', 'daily_login', now - DAY),
    verifiedEntry(state, 'pioneer-dave', 'B', 'finish_kyc_flow', now - 3 * DAY)
  ];

  return assembleSnapshot({
    pool: {
      tokenReserve: 4_200_000,
      quoteReserve: 6_300_000,
      circulatingSupply: 12_500_000
    },
    invariantSnapshots: [
      { t: now - 14 * DAY, token_reserve: 3_900_000, quote_reserve: 5_850_000 },
      { t: now - 9 * DAY, token_reserve: 4_000_000, quote_reserve: 6_010_000 },
      { t: now - 5 * DAY, token_reserve: 4_100_000, quote_reserve: 6_150_000 },
      { t: now - 2 * DAY, token_reserve: 4_150_000, quote_reserve: 6_230_000 },
      { t: now, token_reserve: 4_200_000, quote_reserve: 6_300_000 }
    ],
    manifest: {
      complete_transaction: { class: 'A' },
      finish_kyc_flow: { class: 'B', multiplier: 0.8 },
      daily_login: { class: 'C' }
    },
    windowDays: 30,
    verifiedEntries: entries,
    attestation: state.attestation,
    registry: state.world.registry,
    now
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
};

export function createAppServer() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');

      if (url.pathname === '/api/snapshot') {
        const body = JSON.stringify(buildSnapshot());
        res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
        res.end(body);
        return;
      }

      if (url.pathname === '/api/sample-proof') {
        const proof = makeSampleProof();
        const body = JSON.stringify({ proof });
        res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
        res.end(body);
        return;
      }

      if (url.pathname === '/api/verify-proof' && req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 262_144) {
            res.writeHead(413, { 'content-type': MIME['.json'] });
            res.end('{"error":"proof too large"}');
            return;
          }
        }
        let parsed;
        try {
          parsed = JSON.parse(raw || '{}');
        } catch {
          res.writeHead(400, { 'content-type': MIME['.json'] });
          res.end('{"error":"invalid json"}');
          return;
        }
        const result = verifyPiProof(parsed.proof ?? null, {
          registry: PROOF_WORLD.registry,
          nonceStore: PROOF_NONCES,
          now: Date.now(),
          policy: parsed.policy ?? null
        });
        const body = JSON.stringify(result);
        res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
        res.end(body);
        return;
      }

      if (url.pathname === '/snapshot.json') {
        try {
          const snap = await readFile(path.join(ROOT, 'snapshot.json'));
          res.writeHead(200, { 'content-type': MIME['.json'] });
          res.end(snap);
        } catch {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end('{"error":"static snapshot not generated — run npm run gen:snapshot"}');
        }
        return;
      }

      if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = await readFile(path.join(ROOT, 'index.html'));
        res.writeHead(200, { 'content-type': MIME['.html'] });
        res.end(html);
        return;
      }

      if (url.pathname === '/manifest.webmanifest') {
        const mf = await readFile(path.join(ROOT, 'manifest.webmanifest'));
        res.writeHead(200, { 'content-type': MIME['.json'] });
        res.end(mf);
        return;
      }

      if (url.pathname.startsWith('/assets/')) {
        const rel = url.pathname.slice('/assets/'.length);

        if (!/^[\w./-]+$/.test(rel) || rel.includes('..')) {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end('{"error":"not found"}');
          return;
        }

        const asset = await readFile(path.join(ROOT, 'assets', rel));
        const ext = path.extname(rel).toLowerCase();
        res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
        res.end(asset);
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"error":"not found"}');
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const port = Number(process.env.PORT || 8787);
  createAppServer().listen(port, () => {
    console.log(`Pi Transparency App → http://localhost:${port}`);
  });
}
