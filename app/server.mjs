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
  '.svg': 'image/svg+xml'
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

      if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = await readFile(path.join(ROOT, 'index.html'));
        res.writeHead(200, { 'content-type': MIME['.html'] });
        res.end(html);
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
