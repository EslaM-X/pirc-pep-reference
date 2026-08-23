# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/EslaM-X/pirc-pep-reference/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/EslaM-X/pirc-pep-reference/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/EslaM-X/pirc-pep-reference/releases/tag/v0.1.0
