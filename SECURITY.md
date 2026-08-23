# Security Policy & Threat Model

## Scope

This repository is a reference implementation of the PEP/1 engagement-event
primitive only. It does not implement token allocation, on-chain contracts, or
oracle aggregation. It is intended as auditable building material for the
engagement-reporting layer discussed in PiRC1 PR #2.

## Threat model

| Adversary | Capability | Mitigation |
|---|---|---|
| Bot farm / Sybil | submits fake engagement events | events without a valid backend signature fail at SIGNATURE; ineligible pioneers fail at ELIGIBILITY (registry-gated KYC/Mainnet) |
| Malicious user | edits weight/action/pioneer fields after capture | any mutation invalidates SIGNATURE (canonical bytes bound) |
| Replay attacker | resubmits captured valid payloads | nonce claimed via **atomic test-and-set** (`claimIfAbsent`): check-and-record is indivisible in memory and lock-protected across processes for `FileNonceStore`; duplicates rejected with REPLAY_DETECTED |
| Stale-data attacker | delays old payloads beyond usefulness | ±5 min timestamp window |
| Compromised/misbehaving backend | signs inflated weights | WEIGHT_BOUND caps per class even for valid signatures; revocation path for compromised keys via key_id rotation |
| Cross-app forgery | uses another app's legitimately-signed payload | APP_KNOWN+KEY_ACTIVE resolve under the claimed app_id; foreign signatures fail |
| Registry tampering | modifies registry.json in transit | out of scope here: production registries MUST be content-addressed and served from launchpad-controlled infrastructure |
| Prototype-pollution embedder | feeds registry objects whose prototype chains carry hostile properties | all registry lookups/writes use own-property semantics (`Object.hasOwn`); inherited names like `constructor` can never resolve as apps, keys, or users (vector 20) |
| Resource-exhaustion signer | submits pathologically deep/oversized structures | closed schema rejects unknown/oversized fields before any recursion; canonicalizer enforces a depth cap (64) as defense-in-depth |
| Unicode-confusion forger | submits NFD/NFC look-alike variants to split identity hashes or signatures | canonicalizer normalizes every string to NFC before hashing/signing; UID HMACs are computed over NFC-normalized identifiers |
| Log corrupter / crash | truncates or garbles the durable nonce log mid-write | torn trailing lines and malformed entries are skipped and counted (`corruptLines`), never trusted, never fatal; `compact()` rewrites via temp-file + atomic rename |

### Identity hashing model

`pioneer_uid_hash` values are **keyed** HMAC-SHA256 tags: `h1:HMAC(secret,
NFC(uid))`, base64url-encoded with an explicit version prefix. The backend
secret MUST be at least 16 chars and kept outside event payloads. Keyed hashing
prevents rainbow-table precomputation over the Pi UID space; the version prefix
allows future rotation to `h2:` without ambiguity. Legacy bare-sha256 tags
(`[0-9a-f]{64}`) remain readable by `markEligible` but SHOULD NOT be issued.

### Nonce-store guarantees

- `InMemoryNonceStore.claimIfAbsent` is indivisible within a process
  (synchronous test-and-set on one event-loop turn).
- `FileNonceStore.claimIfAbsent` is atomic **across processes**: exclusive
  O_EXCL lockfile (with stale-lock takeover) → fresh re-read of the log →
  append → `fsyncSync` → unlock. A claim that returned true survives hard
  restarts; a crash mid-append leaves at most one torn line that fails closed.
- Explicit non-goals: no network replication, no TTL/GC beyond `compact()`,
  no sharding. Horizontally scaled fleets still need a shared store (DB unique
  constraint / Redis SETNX); `FileNonceStore` narrows the gap from "demo" to
  "single-host production-grade".

## Explicit limitations (v1)

### Trust boundary: authenticity is not truthfulness

PEP proves **who claimed** an event and that the claim was not altered in
transit or replayed. It does **not** prove the event happened.

```
backend signs "user X completed action A"   →  signature VALID
did action A actually happen?               →  OUT OF SCOPE (issuer trust)
```

A legitimate-but-misbehaving backend can sign false claims that fall inside its
class ceilings; this reference implementation accepts them **by design**, and a
dedicated test (`test/trust-boundary.test.js`) documents exactly that. What the
protocol guarantees even against a lying issuer:

- blast radius is capped by class ceilings (`A≤100`, `B≤10`, `C≤1`) — inflation
  beyond protocol bounds fails with `WEIGHT_OVERFLOW` even under valid
  signatures;
- claims are attributable and non-repudiable (Ed25519 under a registered,
  revocable `key_id`);
- every accepted lie is auditable evidence for slashing/delisting decisions by
  the launchpad.

Truthfulness enforcement (staking/slashing, TEE attestation, multi-party
attestation, on-chain activity proofs) is deliberately out of scope for PEP/1
and belongs to the launchpad governance layer above it.

### Other v1 limitations

- A verifier fleet spanning multiple hosts MUST still share nonce state
  externally (DB unique constraint or Redis SETNX); `FileNonceStore` covers a
  single host with real cross-process locking and crash durability.
- The registry is a **point-in-time snapshot**: revocations and eligibility
  flips take effect when verifiers load the updated registry, not
  instantaneously fleet-wide.
- Timestamps rely on synchronized clocks (NTP); skew window is configurable.
- The eligibility registry is a plain map in this reference. Production SHOULD
  derive it from Pi's KYC/Mainnet migration records.
- No confidentiality: envelopes are public data by design. Never place raw Pi
  UIDs inside events; only `h1:` HMAC tags.

## Reporting

Open a GitHub security advisory rather than a public issue.

## Verification instructions

Every claim above is executable:

```
node --test
node src/cli.js attacks
```

CI runs both on Node 18/20/22 across Linux and Windows.

## Audit status (added v0.7.0)

This is a security-conscious reference implementation — it has **not**
received an external audit and must not be presented as one. "20/20 attacks
rejected" means twenty named adversarial scenarios pass in CI; it does not
mean twenty vulnerabilities were found, nor that the attack space is bounded.
A v1.0 tag remains blocked on external review (see issue #2).

Full boundary analysis — registry authenticity, distributed nonce
requirements, timestamp-vs-replay semantics, supply-chain posture — now
lives in [docs/TRUST_BOUNDARIES.md](docs/TRUST_BOUNDARIES.md).