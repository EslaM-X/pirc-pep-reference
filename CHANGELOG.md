# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.13.0] - 2026-08-24

### Added — external-review hardening: precision, honesty, and interop evidence

This release converts a professional review's critique into normative
documentation, protocol-level distinctions, and cross-language proof. No
frozen-core semantics changed; everything is additive.

- **Binding classes (`EPOCH_BOUND` vs `LOCAL`)** — the portability/state-trust
  distinction is now explicit in the protocol layer:
  - `verifyPiProof` returns `binding` on every verdict; proofs carrying
    `registry_root` are `EPOCH_BOUND`, proofs without it are `LOCAL`
    (verifiable against whatever trusted registry copy the verifier supplies,
    with no epoch commitment).
  - New policy rule **`require_epoch_bound`** lets relying parties refuse
    LOCAL proofs; violations surface as `POLICY` with a named rule.
  - Passports aggregate honestly: summary `binding` is
    `EPOCH_BOUND` / `LOCAL` / `MIXED` (weakest-link semantics).
  - Dispute chain gains the question **`IS_THE_PROOF_EPOCH_BOUND`** (after
    `WHICH_EPOCH`) — answerable even in structural-only mode because binding
    is document-intrinsic.
  - CLI: `proof-export --epoch-bound` (refuses to emit LOCAL), and
    `passport-create --require-epoch-bound`; verify outputs now print the
    binding class.

### Added — canonicalization as a first-class profile

- **`docs/CANONICALIZATION.md`** — normative companion separating RFC 8785
  (JCS) from the **PiProof Canonical Profile v1**: non-negative safe integers
  only, NFC string normalization, raw-key sort with normalized serialization,
  hard rejection of NFC key collisions — with rationale for every deviation
  and an explicit "never describe this as JCS" implementation requirement.
- **15 canonical interop vectors** (`vectors/canonical/index.json`),
  including the raw-sort-vs-normalized-sort divergence case and the NFC key
  collision rejection. Verified byte-exact by two independent
  implementations:
  - Node self-check (`npm run gen:canonical`);
  - a from-scratch Python canonicalizer (`scripts/cross-canonical.py`,
    stdlib only) wired into CI across Python 3.10/3.12 × Linux/Windows.

### Changed — naming & claims discipline

- **Dispute Engine repositioned** everywhere (docblocks, README, dashboard
  EN/AR): it is a **deterministic evidence adjudication layer** — no judge
  quorum, no challenge periods, no arbitration market, no on-chain
  settlement, and never described as decentralized dispute resolution.
- **Trust Policy scope stated plainly** (`docs/POLICY_MODEL.md` + docblock):
  v1 is a flat narrowing-only checklist, not a policy language — no AND/OR,
  no nested predicates, no delegation; grammar evolution must preserve
  monotone-narrowing.
- **Pseudonymization ≠ anonymity** (SECURITY.md): keyed HMAC tags are
  non-invertible outside the issuer but NOT unlinkable; per-app uid secrets
  are load-bearing for cross-application privacy.
- **Nonce-store deployment matrix** (`docs/NONCE_STORES.md`): normative
  statement that FileNonceStore is shared-filesystem state — *not* distributed
  replay protection — plus Redis authority requirements (single strongly
  consistent logical authority; eventually-consistent backends unsupported;
  multi-region patterns that stay safe).

### Added — maturity honesty

- **`docs/MATURITY.md`** — the evidence register: what "reference
  implementation" and "security-engineering prototype" mean here (held, with
  evidence), what production readiness would require (12 missing-evidence
  rows: load at scale, multi-region ops, incident history, HSM, Byzantine
  registries, DR, migrations, external audit…), and language rules for
  presenting the project. Linked from the top of the README.

### Tests

- `test/binding.test.js` (7 tests) — LOCAL/EPOCH_BOUND verification paths,
  wrong-epoch fail-closed, policy enforcement both ways, passport aggregation
  incl. MIXED, dispute-chain question in full + structural modes, CLI flag
  enforcement end-to-end.
- Canonical vector suite: 15/15 byte-exact in Node, 15/15 agreement in
  independent Python. Full suite: **110 tests green**, attack suite 20/20.

## [0.12.0] - 2026-08-24

### Added — observability hooks and the transparency-log design draft (v1.0 review centerpiece)

- **`src/observability.js`** — opt-in metrics with strict rules: no global
  state (registries are created and passed explicitly, verdicts can never
  depend on whether observation is on), fail-open telemetry (recording
  never throws into the verification path), bounded memory (latency ring
  buffer capped at 10k samples). `timed()` helper wraps sync functions;
  snapshots are stable-keyed JSON (`AUREVIA-Metrics/1`) with rejection-code
  breakdowns and p50/p95/p99.
- **Wired end-to-end**: `verifySignedEvent`, `verifyPiProof` and
  `verifyPassport` accept an optional `metrics` registry; the demo server
  records proof/passport verifications, disputes and shares, exposing a
  read-only `GET /api/metrics`.
- **`docs/TRANSPARENCY_LOG_DESIGN.md`** — the signed registry transparency-
  log design draft that closes Open Question #1 *by design* (implementation
  deliberately deferred to post-review): append-only epoch entries over the
  existing canonical bytes, prev-hash chaining, m-of-n witness cosigning,
  five-step pure verification procedure reusing zero new cryptography,
  split-view detection, explicit migration path from today's
  `registry_root` binding, reserved `TL_*` error codes, privacy analysis,
  and five open questions for reviewers. Marked NON-NORMATIVE until the
  external v1.0 review concludes.

### Tests

- `test/observability.test.js` — snapshot shape & key ordering, percentile
  math, ring-buffer cap under 25k records, `timed()` outcome/THREW paths,
  fail-open recording against hostile inputs.
- App tests assert live `/api/metrics` counters after real verifications,
  disputes and shares.

## [0.11.0] - 2026-08-24

### Added — distributed nonce state, production-scale benchmark, the honest open-questions register

Closes two of the ten hardest open questions and documents all ten:

- **`RedisNonceStore` (`src/redis-nonces.js`)** — horizontally scalable
  replay protection with **zero dependencies**: a minimal RESP2 client
  written from scratch plus a worker-thread bridge that keeps the store's
  interface synchronous (Atomics.wait, same fail-closed pattern as
  FileNonceStore), so `verifySignedEvent`/`verifyPiProof` work unchanged
  across N load-balanced verifier instances. Atomic claims via Redis
  `SET NX`; optional TTL gives safe GC (claims only need to outlive the
  TIMESTAMP_FRESHNESS window). Fail-closed: unreachable server ⇒ throw,
  never allow. Only opaque nonce keys ever leave the process.
- **Reproducible throughput benchmark (`npm run bench`)** — production-
  scale evidence with numbers instead of adjectives: full 9-step pipeline
  at ~7,300 verified proofs/sec single-core sequential (p50 0.125ms,
  p99 0.43ms), ~5.5M InMemory claims/sec, durable FileNonceStore ~700/s.
  No mocks: every counted verification passed every step.
- **`docs/OPEN_QUESTIONS.md`** — the ten hardest questions raised about
  this project (registry authenticity protocol gap, distributed state,
  external audit, adoption, recency, breadth-vs-validation, forked vs
  authored repos, production evidence, agent-evidence depth, complexity
  growth) answered honestly: status, existing mitigations, and exactly
  what closes each one. Linked prominently from README.

### Tests

- `test/redis-nonces.test.js` — canonical RESP2 encoding; parser against
  byte-by-byte split chunks incl. CRLF inside bulk strings; dual-instance
  atomic claim semantics over a real socket; TTL forwarding; fail-closed
  construction. Uses a miniature RESP server running as a separate child
  process (`test/fixtures/mini-redis.mjs`) so the synchronous bridge is
  exercised exactly as in production — an in-process server would deadlock
  by construction.

## [0.10.0] - 2026-08-24

### Added — Killer-demo perfection: guided 60-second demo, issuer picker, short public links, installable CLI

- **Guided 60-second demo** — one button plays the full flagship scenario
  end-to-end with narrated steps: issue a `complete_transaction` proof
  (weight 100, issuer *Demo Marketplace*) → ✓ PROOF CREATED → independent
  verification ✓ VALID → tamper `weight: 100 → 100,000` ✗ INVALID → restore ✓
  VALID again → download `proof-passport.json` with the exact one-line
  verification command anyone can run.
- **Issuer picker** — the passport issue form now exposes all three demo
  issuers (`demo-app`, `marketplace-demo`, `demo-agent-service`), matching
  the cross-application story; the server already accepted `issuer`.
- **Short public verification links** — `POST /api/share` returns an
  ephemeral 12-hex id; `GET /p/<id>` 302-redirects to
  `/verify#p=<document>`. The share button prefers the short link and falls
  back to the pure fragment link on static deployments. The mapping is
  memory-only and capped (5,000 entries) by design: nothing about users is
  ever persisted.
- **Installable CLI** — package now exposes both `pep` and `piproof` bins;
  every document-consuming command (`proof-verify`, `passport-verify`,
  `dispute`) also accepts the file as a positional argument:
  `npx piproof passport-verify proof-passport.json --registry registry.json`.

### Tests

- `app/app.test.js`: share roundtrip (id format, 302 location decodes to the
  exact shared document, unknown id 404, malformed id 404, wrong type 400,
  invalid json 400).
- `test/cli.test.js`: end-to-end portable-proof flow — sign → `proof-export`
  → positional `proof-verify` → `passport-create` → positional
  `passport-verify` → `dispute` verdict VALID.

## [0.9.0] - 2026-08-24

### Added — AUREVIA Evidence Network: public verification, Dispute Mode, cross-application proofs, Agent Evidence

Completes the flagship arc on top of v0.8.0's Proof Passport:

- **Public verification page (`/verify`)** — open a `…/verify#p=<document>`
  link: no account, no trust in the holder, full checklist and a big
  PROOF VERIFIED / INVALID verdict. Static deployments honestly render the
  self-declared structural view plus the exact CLI command to reproduce.
- **Dispute Engine (`src/dispute.js`)** — replaces screenshots and
  scattered logs with one adjudicable chain: CLAIM → WHO ISSUED IT →
  WHAT WAS SIGNED (canonical fingerprints) → WHICH POLICY → WHICH EPOCH →
  WAS IT REPLAYED → IS THE KEY VALID → IS THE CLAIM WITHIN POLICY → FINAL
  VERDICT. Three honest outcomes only — **VALID / INVALID / UNVERIFIABLE**
  — and UNVERIFIABLE is never treated as a pass (no trusted registry ⇒ no
  adjudication). Available as CLI `dispute`, `POST /api/dispute`, and a
  dashboard section with report export.
- **Cross-application proofs** — the demo registry epoch now hosts three
  independent issuers (`demo-app`, `marketplace-demo`,
  `demo-agent-service`), each with its own key; sample passports are
  dual-issuer, proving App-A + App-B evidence verifies against one
  verifier state. `/api/passport-issue` accepts an `issuer` parameter.
- **Agent Evidence (AI accountability)** — when an agent completes a task,
  `demo-agent-service` signs it (`complete_task`, subject `agent-<id>`);
  policy verification turns it into a portable audit trail.
  `POST /api/agent-evidence` + dashboard card.
- **Killer-demo flow wired end-to-end**: Issue & Sign → verify → tamper →
  export → dispute report, each step feeding the next automatically.

### Tests

91 total (was 82): dispute unit suite (chain order, three-state honesty,
replay flagging, cross-issuer verdicts, junk handling) + API coverage for
`/verify`, agent evidence, dispute endpoint.

## [0.8.0] - 2026-08-24

### Added — AUREVIA Proof Passport: one portable evidence record

The killer use case: the holder — not the platform — carries the evidence.
*"Proofs you can carry. Evidence anyone can verify."*

- **`AUREVIA-Evidence-Passport/1`** (`src/passport.js`) — bundles 1–100
  PiProof envelopes under a single content-addressed `evidence_root`
  (`e1:` SHA-256 over the canonical proof array), optionally bound to a
  pseudonymous `subject` tag and a Trust Policy. Envelope validation runs
  before any cryptography; root recomputation happens before signature
  work; embedded proofs reuse the full PiProof checklist with per-proof
  labeled steps; replay detection propagates to the passport verdict;
  passport-stored policies narrow acceptance per holder.
- **CLI**: `passport-create --proof p1.json [--proof p2.json …]
  [--subject tag] [--policy p.json]` and `passport-verify` (full nested
  report, exit code reflects the verdict). Repeated flags are now
  collected into arrays in `parseArgs`.
- **Server endpoints**: `GET /api/sample-passport`,
  `POST /api/passport-issue` (catalog-validated demo issuer: class
  A/B/C action whitelist, weight bounds, subject pattern),
  `POST /api/verify-passport` (shares the live registry epoch + nonce
  store, so replays across submissions are caught).
- **Dashboard section "AUREVIA Proof Passport"** — Issue & Sign form,
  Download `.json`, Copy share link (`#p=<base64url>` fragment — no
  server-side storage, privacy-preserving), Open in Explorer, file
  import that auto-routes proofs vs passports by `type`, and a grouped
  verification report (summary header + top-level steps + per-proof
  checklists). Full EN/AR i18n.
- **Tests**: 82 total (was 69) — passport unit suite + HTTP API suite.

### Fixed

- Passport step labels render correctly in CLI output (top-level steps
  previously printed `undefined` labels).

### Documented

- Epoch-binding lesson captured by tests: minting a second proof mutates
  the registry, so earlier proofs must be minted after all eligibility
  changes — eligibility preparation is separated from minting in tests.

## [0.7.2] - 2026-08-24

### Fixed — blank page root cause + identity rename

- **Critical UI fix**: the dashboard rendered empty in real browsers — the
  i18n block referenced the `$` helper before its `const` initialization
  (TDZ ReferenceError killed the whole script; reveal-CSS then kept every
  card at `opacity:0`). Fixes: `$` defined first, cards are visible by
  default and only animate when JS is confirmed running (`html.js` gate),
  plus a fail-safe force-reveal timer.
- Hero line added under the header: *"Don't trust the app. Verify the
  proof."* with the full positioning sentence (EN/AR).
- Repository renamed to **EslaM-X/piproof** to match the product identity
  (PEP/1 = protocol, PiProof = ecosystem/product, AUREVIA = dashboard);
  all internal references updated; old URLs redirect automatically.

## [0.7.1] - 2026-08-24

- Static hosts (GitHub Pages) fall back to the deploy-time `snapshot.json`
  with a gold STATIC status dot instead of showing OFFLINE.

## [0.7.0] - 2026-08-24

### Added — PiProof: portable proofs + Trust Policy Engine + Proof Explorer

The three signature capabilities, deliberately nothing more:

- **Portable Verifiable Proofs (`PiProof/1`)** — `src/piproof.js`. A proof
  wraps exactly one signed PEP/1 event so any party can verify it against
  their own registry copy without trusting the issuer. Optional
  `registry_root` content-addresses the verifier's epoch; foreign-epoch
  proofs are rejected (`REGISTRY_ROOT`). Human-readable step checklist on
  every verification.
- **Trust Policy Engine** — `src/policy.js`. Deterministic, pure narrowing
  of acceptance after cryptographic validity: `issuer_allowlist`,
  `action_classes`, `min/max_weight`, `max_age_ms`, `require_kyc`,
  `require_mainnet`. Violations come back rule-by-rule.
- **CLI**: `pep proof-export` / `pep proof-verify [--policy policy.json]`
  print the full checklist and a `TRUSTED PROOF` / `INVALID PROOF` verdict.
- **AUREVIA Proof Explorer** — paste a proof, verify it live through the
  exact `src/verify.js` code path server-side; one-click **Tamper Lab**
  (weight ×1000 → `INVALID_SIGNATURE`; signature flip) plus live replay
  catching (persistent nonce store). "Why is this proof trusted?" explains
  every layer in EN/AR.
- **Public deployment path**: `npm run gen:snapshot`, GitHub Pages workflow
  (static dashboard), Dockerfile for any Node host (Fly/Railway/VPS).
- New endpoints `/api/sample-proof`, `/api/verify-proof`, `/snapshot.json`;
  app paths made relative (works under any base URL).

### Hardened — responding to external critique

- **Canonicalizer NFC key-collision rejection**: distinct raw keys that
  normalize to the same string now throw instead of silently merging.
  Unreachable under the closed PEP/1 schema (ASCII keys); fixed at the
  primitive level anyway. Committed vectors unchanged byte-for-byte.
- **CI supply chain**: all GitHub Actions pinned to full commit SHAs.
- **`docs/TRUST_BOUNDARIES.md`**: registry authenticity analysis with
  signed-epoch-root + transparency-log roadmap; nonce-store durability/
  distribution contract table; timestamp-vs-replay clarification;
  explicit non-audited status (also added to SECURITY.md).

### Tests

69/69 across Node 18/20/22 × Linux/Windows (was 61): 7 PiProof/policy/
canonicalization tests + endpoint tests for sample-proof, replay,
tampering, policy and malformed input.

### Explicitly deferred (scope discipline)

Privacy-preserving proofs (ZK), verifiable AI-agent claims, additional
language SDKs, browser extension, reputation scores, adoption counters —
each only after real use cases materialize. No feature creep before
product-market fit.

## [0.6.1] - 2026-08-24

### Changed — product rebrand: AUREVIA + positioning discipline

- The dashboard is now **AUREVIA** — *Trust. Verified. Transparent.* —
  cryptographic transparency infrastructure for decentralized ecosystems.
  Independent brand: navy-black / metallic-gold shield mark (no chain logo in
  the brand), engineering typography, expandable beyond a single ecosystem.
- Pi integration is explicitly positioned as an **ecosystem adapter**; the
  product spine stays Evidence → Verification → Transparency.
- Preview-mode messaging made precise: *"Pi environment unavailable —
  running in preview mode."*
- Claims normalized to **"Pi Browser-ready"**: Mainnet listing is stated as
  pending Developer Portal registration and live-environment testing, and
  nothing more.
- `app/assets/icon.svg` replaced with the AUREVIA cryptographic shield;
  original author artwork remains preserved verbatim at
  `app/assets/brand/identity-original.jpeg`.
- PWA manifest, package description and keywords updated to the AUREVIA
  identity.

## [0.6.0] - 2026-08-24

### Added — Pi SDK integration + full UX/UI overhaul

- **Official Pi SDK integration** (`app/index.html`): dynamic load of
  `pi-sdk.js`, `Pi.init({version:'2.0'})`, `Pi.authenticate(['username',
  'payments'])` rendering the signed-in Pioneer, and a `Pi.createPayment`
  support flow demonstrating the U2A path. Outside Pi Browser the app
  degrades to an honest **preview mode**.
- **Bilingual interface (English / العربية)** with a full RTL layout switch,
  persisted in localStorage — including localized numerals.
- **UX overhaul**: glassmorphism cards over an animated aurora background,
  skeleton loaders, count-up number animations, staggered card reveals,
  toast notification system, medal ranks on the leaderboard, HiDPI canvas
  chart with gradient area fill and glowing endpoint, keyboard focus rings
  and `prefers-reduced-motion` support, PWA manifest for standalone install.
- **Brand assets**: original author artwork preserved verbatim at
  `app/assets/brand/identity-original.jpeg`; vector icon at
  `app/assets/icon.svg` (favicon + maskable PWA icon); palette centralized
  in CSS custom properties for one-block re-theming.
- Server now serves `/assets/*` (with traversal guard) and
  `/manifest.webmanifest`; endpoint test coverage extended accordingly
  (CI total 61).

## [0.5.0] - 2026-08-23

### Added — Pi Transparency App

- **`app/`** — single-page Transparency Dashboard ready for Pi Browser-style
  environments: dynamic p_floor card with floor/spot ratio bar, x·y=k
  invariant chart, escrow lock status with per-check verification badges,
  and the PoA/PoU × Consistency Factor leaderboard. Zero build step, zero
  runtime dependencies.
- **`app/server.mjs`** — zero-dependency Node server exposing
  `GET /` (dashboard) and `GET /api/snapshot` (fresh snapshot assembled from
  the verified-event pipeline on every request). Run with `npm run app`.
- **`app/app.test.js`** — endpoint + snapshot integrity tests (CI total is now 61).

## [0.4.0] - 2026-08-23

### Changed — License

- **Relicensed from `(MIT OR Apache-2.0)` to the PiOS License**, the Pi Open
  Source license that permits development and use of derivative works solely
  within the Pi Network ecosystem. `LICENSE-MIT` and `LICENSE-APACHE` were
  removed; the canonical text now lives in `LICENSE`.
- Added the required trademark notice: *Pi, Pi Network and the Pi logo are
  trademarks of the Pi Community Company*, together with an explicit
  community-built / not-affiliated statement.
- Rationale: this repository is a Pi-ecosystem reference implementation and is
  being submitted to the official PiOS App & Library list; listing requires
  the unaltered PiOS license.

## [0.3.0] - 2026-08-23

Transparency Layer — implements the ideas endorsed in the PiRC1 review:
dynamic `p_floor`, `x·y=k` invariant tracking, verifiable escrow lock status,
and the "Transparency Dashboard" concept.

### Added

- **`src/pfloor.js`** — pure constant-product mathematics: real-time
  theoretical floor `p_floor = (R·Q)/(R+S)²` over circulating supply, average
  realized price of the hypothetical full dump, and an invariant health report
  that flags any decrease of `k` beyond a configurable tolerance (liquidity
  extraction detection).
- **`src/engagement.js`** — composite engagement scoring: Proof-of-Activity /
  Proof-of-Utility split by action class, per-project weight manifests
  clamped to protocol ceilings (projects may weigh down, never up), and a
  Consistency Factor that rewards sustained presence over end-window bursts.
  Inputs are restricted to `{event, verdict}` pairs whose verdict is a
  successful `verifySignedEvent` result.
- **`src/escrow.js`** — offline-verifiable escrow lock attestations: closed
  schema, dedicated signature domain (`PiRC1-ESCROW-v1`), binding to the
  revoked key's fingerprint, freshness window and replay guard. The optional
  `anchor` field carries an on-chain commitment; the module never fetches
  chain state.
- **`src/dashboard.js`** — deterministic Transparency Dashboard snapshot
  assembler fusing price floor, pool health, escrow lock status and the
  engagement leaderboard into one JSON document.
- `npm run transparency` — end-to-end demo; included in `npm run ci`.
- `test/transparency.test.js` — 21 tests covering all four modules.

### Not changed

- PEP/1 wire format, canonicalization rules and committed vectors are
  untouched; all pre-existing vectors verify byte-for-byte.

## [0.2.0] - 2026-08-23

Hardening release addressing the external review: concurrency-safe replay
protection, byte-for-byte reproducible vectors, keyed identity hashing, and
embedder-robustness guarantees.

### Changed — BREAKING

- **`pioneer_uid_hash` is now a versioned HMAC tag** (`h1:<43 base64url
  chars>` = HMAC-SHA256 over the NFC-normalized UID with a backend secret of
  ≥16 chars). Bare sha256 hex no longer passes schema validation. Registries
  may still *read* legacy `[0-9a-f]{64}` tags via `markEligible`.
  Migration: backends must provision `uidSecret` and re-hash.
- **Nonce stores must implement atomic `claimIfAbsent(key)`**; the previous
  non-atomic `has()`+`add()` pair is no longer used by the pipeline. Custom
  stores must migrate to the new interface (a DB unique constraint or Redis
  SETNX satisfies it).
- Canonical JSON now normalizes all strings to NFC before serialization and
  enforces a depth cap of 64. Events containing non-NFC string forms or
  nesting beyond the cap are rejected.

### Added

- Atomic replay protection: `InMemoryNonceStore.claimIfAbsent` (indivisible
  test-and-set) and `FileNonceStore.claimIfAbsent` (cross-process O_EXCL
  lockfile with stale-lock takeover → fresh re-read under lock → fsynced
  append). A claim that returned true survives hard restarts; torn trailing
  log lines and malformed entries fail closed and are counted
  (`corruptLines`); `compact()` rewrites via temp-file + atomic rename.
- Deterministic key material: `generateKeyPair({ seed })` derives Ed25519
  keys from a 32-byte seed via PKCS#8 DER; committed vectors now use fixed
  seeds and fixed nonces and are **byte-for-byte reproducible** across runs,
  enforced in CI with `git diff --exit-code -- vectors/`.
- Attack vector `20_prototype_key_app`: app id set to an inherited object-
  prototype property name — rejected with `UNKNOWN_APP` (suite now 20/20).
- New test suite `test/hardening.test.js` (13 tests): seeded-key RFC 8032
  equivalence, world reproducibility, double-claim exclusion, two-instance
  durable-store contention, crash reload, corrupt-log tolerance, prototype
  probes, depth-cap enforcement, NFC stability, malformed PEM degradation to
  `INVALID_SIGNATURE`, clock-rollback replay rejection.
- Python cross-verifier parity for NFC normalization and the canonicalization
  depth cap.

### Security

- Registry lookups and writes use own-property semantics throughout;
  `__proto__`/`constructor`/`prototype` writes are refused.
- UID hashing upgraded from unkeyed sha256 to keyed HMAC-SHA256 with version
  prefix — precomputation/rainbow-table attacks over the Pi UID space are no
  longer feasible; `h2:` rotation path documented in SECURITY.md.

## [0.1.0] - 2026-08-22

### Added

- Deterministic PEP/1 verification pipeline: fixed 9-step order — `SCHEMA`,
  `APP_KNOWN`, `KEY_ACTIVE`, `CANONICALIZATION`, `SIGNATURE`,
  `TIMESTAMP_FRESHNESS`, `WEIGHT_BOUND`, `ELIGIBILITY`, `NONCE_REPLAY`.
- Closed-profile JSON canonicalization (JCS subset, integers only,
  byte-stable output).
- Ed25519 signing via Node.js stdlib `node:crypto` (RFC 8032).
- App/key registry with key rotation and instant revocation
  (`REVOKED_KEY` path).
- KYC/Mainnet eligibility gating backed by a launchpad-side registry
  cross-check (`INELIGIBLE_USER`), never trusted from signed payloads alone.
- Bounded engagement-weight classes enforced even over valid signatures
  (`WEIGHT_OVERFLOW`).
- Per-application replay protection; nonces are burned only on full pass
  (`REPLAY_DETECTED`). Failed verification never burns the nonce.
- CLI: `keygen`, `init-reg`, `add-key`, `revoke-key`, `eligible`, `sign`,
  `verify`, `attacks`, `demo`.
- Adversarial suite: 19 attacks, each rejected with its exact error code
  (`19/19 rejected`).
- Independent pure-Python cross-verifier (`scripts/cross-verify.py`,
  RFC 8032, standard library only) re-verifying every committed vector.
- Reproducible conformance vectors (`vectors/`) regenerated and re-checked
  on every CI run.
- CI matrix: Node 18/20/22 × Ubuntu/Windows plus Python 3.10/3.12
  cross-verification on both operating systems.
- Documentation: `SPEC.md` (normative wire format), `SECURITY.md`
  (threat model and explicit limitations), `TRACEABILITY.md`
  (PR #2 requirement ↔ code ↔ test ↔ attack mapping).
- Dual licensing under `(MIT OR Apache-2.0)`.

[Unreleased]: https://github.com/EslaM-X/piproof/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/EslaM-X/piproof/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/EslaM-X/piproof/releases/tag/v0.1.0
