#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { formatAttackReport, runAttackSuite, makeWorld } from './attacks.js';
import { hashUid, newEvent, signEvent } from './events.js';
import { generateKeyPair } from './keys.js';
import { InMemoryNonceStore, FileNonceStore } from './nonces.js';
import { verifyPiProof, toPiProof } from './piproof.js';
import { createRegistry, registerApp, registerKey, revokeKey, markEligible } from './registry.js';
import { verifySignedEvent } from './verify.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function printChecks(checks) {
  for (const c of checks) {
    const mark = c.pass ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    console.log(`  ${mark}  ${c.check}`);
  }
}

function printVerifyResult(result) {
  printChecks(result.checks);
  console.log('');
  if (result.ok) {
    console.log(`${BOLD}${GREEN}VERDICT: PASS (deterministic)${RESET}`);
  } else {
    console.log(`${BOLD}${RED}VERDICT: REJECT [${result.code}]${RESET}`);
  }
}

function printProofResult(result) {
  for (const s of result.steps) {
    const mark = s.pass ? `${GREEN} ✓ ${RESET}` : `${RED} ✗ ${RESET}`;
    console.log(` ${mark} ${s.label}${s.detail ? `  ${DIM}(${s.detail})${RESET}` : ''}`);
  }
  if (result.policy && result.policy.violations.length > 0) {
    console.log(`${RED}Policy violations:${RESET}`);
    for (const v of result.policy.violations) {
      console.log(`   ${RED}·${RESET} ${v.rule}: ${v.detail}`);
    }
  }
  console.log('');
  if (result.ok) {
    console.log(`${BOLD}${GREEN}VERDICT: TRUSTED PROOF — don't trust the app, verify the proof.${RESET}`);
  } else {
    console.log(`${BOLD}${RED}VERDICT: INVALID PROOF [${result.code}]${RESET}`);
  }
}

const HELP = `pep - Programmable Engagement Proofs reference implementation

Usage:
  node src/cli.js <command> [options]

Commands:
  keygen       --out keys/demo.json
  init-reg     --out registry.json --app demo-app
  add-key      --registry registry.json --app demo-app --key-id k-2026 --pub keys/demo.json
  revoke-key   --registry registry.json --app demo-app --key-id k-2026
  eligible     --registry registry.json --uid-hash <h1:hmac-tag>
  sign         --event event.json --key keys/demo.json [--out signed.json]
  verify       --event signed.json --registry registry.json [--nonces nonces.jsonl] [--now <unix-ms>]
  proof-export --event signed.json [--registry registry.json] [--out proof.json]
  proof-verify --proof proof.json --registry registry.json [--policy policy.json]
               [--nonces nonces.jsonl] [--now <unix-ms>]
  attacks      run the full adversarial suite
  demo         end-to-end walkthrough

PiProof: a portable envelope around one signed PEP/1 event. Any party holding
the proof + the verifier's own registry copy can independently confirm every
claim without trusting the issuing application.
`;

function cmdKeygen(flags) {
  const out = flags.out ?? 'keys/keypair.json';
  const opts = flags.seed ? { seed: String(flags.seed) } : {};
  writeJson(out, generateKeyPair(opts));
  console.log(`keypair written to ${out}${flags.seed ? ' (from provided seed)' : ''}`);
}

function cmdInitReg(flags) {
  const out = flags.out ?? 'registry.json';
  const registry = createRegistry();
  for (const app of String(flags.app ?? 'demo-app').split(',')) {
    registerApp(registry, app.trim());
  }
  writeJson(out, registry);
  console.log(`registry written to ${out}`);
}

function cmdAddKey(flags) {
  const registryFile = flags.registry ?? 'registry.json';
  const registry = readJson(registryFile);
  const keypair = readJson(flags.pub);
  registerKey(registry, flags.app, flags['key-id'], keypair.public_key_pem);
  writeJson(registryFile, registry);
  console.log(`key ${flags['key-id']} registered for app ${flags.app}`);
}

function cmdRevokeKey(flags) {
  const registryFile = flags.registry ?? 'registry.json';
  const registry = readJson(registryFile);
  revokeKey(registry, flags.app, flags['key-id']);
  writeJson(registryFile, registry);
  console.log(`key ${flags['key-id']} revoked for app ${flags.app}`);
}

function cmdEligible(flags) {
  const registryFile = flags.registry ?? 'registry.json';
  const registry = readJson(registryFile);
  markEligible(registry, flags['uid-hash']);
  writeJson(registryFile, registry);
  console.log(`user marked eligible`);
}

function cmdSign(flags) {
  const event = readJson(flags.event);
  const keypair = readJson(flags.key);
  const signed = signEvent(event, keypair.private_key_pem);
  if (flags.out) writeJson(flags.out, signed);
  else console.log(JSON.stringify(signed, null, 2));
  if (flags.out) console.log(`signed event written to ${flags.out}`);
}

function cmdVerify(flags) {
  const event = readJson(flags.event);
  const registry = readJson(flags.registry);
  const nonceStore = flags.nonces
    ? new FileNonceStore(flags.nonces)
    : new InMemoryNonceStore();
  const now = flags.now ? Number(flags.now) : Date.now();
  const result = verifySignedEvent(event, { registry, nonceStore, now });
  printVerifyResult(result);
  process.exitCode = result.ok ? 0 : 1;
}

function cmdDemo() {
  const world = makeWorld();
  console.log(`${BOLD}PiRC1-PEP Reference Demo${RESET}\n`);

  console.log(`${DIM}[1] backend signs a high-value engagement event (class A, weight 50)${RESET}`);
  const event = newEvent({
    app_id: 'demo-app',
    key_id: 'k-2026-active',
    action_class: 'A',
    action_id: 'complete_transaction',
    weight: 50,
    pioneer_uid: 'alice',
    uidSecret: world.uidSecret,
    now: Date.now()
  });
  const signed = signEvent(event, world.currentKey.private_key_pem);

  const store = new InMemoryNonceStore();
  console.log(`${DIM}[2] verifier checks it against the launchpad registry${RESET}`);
  printVerifyResult(verifySignedEvent(signed, { registry: world.registry, nonceStore: store }));

  console.log('');
  console.log(`${DIM}[3] attacker replays the exact same payload${RESET}`);
  const r2 = verifySignedEvent(signed, { registry: world.registry, nonceStore: store });
  console.log(`  ${BOLD}${RED}VERDICT: REJECT [${r2.code}]${RESET}`);

  console.log('');
  console.log(`${DIM}[4] attacker mutates the weight after signing${RESET}`);
  const mutated = { ...signed, weight: signed.weight + 100 };
  const r3 = verifySignedEvent(mutated, { registry: world.registry, nonceStore: store });
  console.log(`  ${BOLD}${RED}VERDICT: REJECT [${r3.code}]${RESET}`);
}

function cmdProofExport(flags) {
  const event = readJson(flags.event);
  const registry = flags.registry ? readJson(flags.registry) : null;
  const proof = toPiProof(event, { registry });
  if (flags.out) writeJson(flags.out, proof);
  else console.log(JSON.stringify(proof, null, 2));
  if (flags.out) console.log(`PiProof written to ${flags.out}`);
}

function cmdProofVerify(flags) {
  const proof = readJson(flags.proof);
  const registry = readJson(flags.registry);
  const policy = flags.policy ? readJson(flags.policy) : null;
  const nonceStore = flags.nonces
    ? new FileNonceStore(flags.nonces)
    : new InMemoryNonceStore();
  const now = flags.now ? Number(flags.now) : Date.now();
  const result = verifyPiProof(proof, { registry, nonceStore, now, policy });
  printProofResult(result);
  process.exitCode = result.ok ? 0 : 1;
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  switch (command) {
    case 'keygen': return cmdKeygen(flags);
    case 'init-reg': return cmdInitReg(flags);
    case 'add-key': return cmdAddKey(flags);
    case 'revoke-key': return cmdRevokeKey(flags);
    case 'eligible': return cmdEligible(flags);
    case 'sign': return cmdSign(flags);
    case 'verify': return cmdVerify(flags);
    case 'proof-export': return cmdProofExport(flags);
    case 'proof-verify': return cmdProofVerify(flags);
    case 'attacks': {
      const results = runAttackSuite();
      console.log(formatAttackReport(results));
      process.exitCode = results.every((r) => r.rejected) ? 0 : 1;
      return;
    }
    case 'demo': return cmdDemo();
    default:
      console.log(HELP);
      process.exitCode = command ? 1 : 0;
  }
}

main();
