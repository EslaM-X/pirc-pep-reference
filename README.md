<div align="center">

# 🛡️ pirc-pep-reference

### Programmable Engagement Proofs — PEP/1 Reference Implementation

**Deterministic. Signed. Replay-proof. Zero dependencies.**

[![CI](https://github.com/EslaM-X/pirc-pep-reference/actions/workflows/ci.yml/badge.svg)](https://github.com/EslaM-X/pirc-pep-reference/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-PiOS-teal.svg)](#-license--copyright)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](https://nodejs.org)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](#-zero-dependencies)
[![Tests](https://img.shields.io/badge/tests-38%2F38-brightgreen.svg)](#-run-it-yourself)
[![Attacks](https://img.shields.io/badge/adversarial%20suite-20%2F20%20rejected-red.svg)](https://github.com/EslaM-X/pirc-pep-reference#-adversarial-suite)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff69b4.svg)](#-contributing)
[![Made in Egypt](https://img.shields.io/badge/made%20in-Egypt-%F0%9F%87%AA%F0%9F%87%AC-orange.svg)](https://github.com/EslaM-X)

</div>

---

> [!IMPORTANT]
> This is an **independent, community-built reference implementation**.
> It is **not** an official Pi Network product, and it makes no claim of
> endorsement by Pi Network or the Pi Core Team.

Reference implementation of **Programmable Engagement Proofs (PEP/1)** — a
deterministic, independently verifiable primitive for signed engagement
reporting, built from the review discussion in
[PiRC1 PR #2](https://github.com/PiNetwork/PiRC/pull/2).

It implements exactly what was discussed there, nothing more:

> *"it would be beneficial to provide APIs that allow apps to report more
> fine-grained engagement metrics. Apps would authenticate themselves using
> their app-specific API key. Participating users would be KYC-verified and
> migrated to Mainnet, which helps eliminate Sybil attacks."*

---

## 📑 Table of Contents

- [Why this exists](#-why-this-exists)
- [Features](#-features)
- [Run it yourself](#-run-it-yourself)
- [Demo](#-demo)
- [Adversarial suite](#-adversarial-suite)
- [Cross-language verification](#-cross-language-verification)
- [Architecture](#-architecture)
- [Project map](#-project-map)
- [Usage](#-usage)
- [Roadmap](#-roadmap)
- [Security](#-security)
- [Contributing](#-contributing)
- [License & Copyright](#-license--copyright)

---

## 🎯 Why this exists

| Review requirement (PR #2) | Where it lives here |
|---|---|
| canonical serialization rules frozen | `src/canonical.js`, SPEC §2 |
| app-specific API keys + rotation | `key_id` registry, `REVOKED_KEY` path |
| KYC / Mainnet eligibility gating | signed `eligibility` block + launchpad-side registry cross-check |
| bounded weights (no utility inflation) | class ceilings enforced even over valid signatures |
| replay protection | per-app nonce store, recorded only on full pass |
| deterministic validation | fixed 9-step pipeline, byte-stable canonical form |
| reproducible evidence | `vectors/` are byte-for-byte reproducible — regenerated and diff-gated in CI |

## ✨ Features

| | Feature | Detail |
|:---:|---|---|
| 🔒 | **Ed25519 signatures** | RFC 8032 via Node stdlib `node:crypto` |
| 🧊 | **Frozen canonical JSON** | JCS-subset profile, integers only, byte-stable |
| 🔁 | **Replay protection** | per-app nonce store with **atomic test-and-set** (`claimIfAbsent`); burned only on full pass; durable fsynced file store with cross-process locking |
| ⚖️ | **Bounded weights** | class ceilings enforced *even over valid signatures* |
| 🪪 | **Registry-gated eligibility** | KYC/Mainnet flags checked server-side, never trusted from the payload |
| 🕵️ | **Privacy-preserving identities** | `pioneer_uid_hash` is a keyed HMAC-SHA256 tag (versioned `h1:`), NFC-normalized — rainbow-table-proof |
| 🎲 | **Deterministic key material** | optional seed → RFC 8032-fixed Ed25519 keys; committed vectors are **byte-for-byte reproducible** (CI-diffed) |
| 🔑 | **Key rotation & revocation** | `key_id` indirection, instant revocation path |
| 🧪 | **Adversarial suite** | 20 attacks, each rejected with its exact error code |
| 🌍 | **Cross-language verification** | every vector re-verified by an independent pure-Python Ed25519 verifier |
| 📦 | **Zero dependencies** | runtime uses Node.js stdlib only — no supply-chain surface |

---

## 🚀 Run it yourself

```bash
git clone https://github.com/EslaM-X/pirc-pep-reference.git
cd pirc-pep-reference

npm test          # unit + integration tests        → 38/38 ✔
npm run attacks   # adversarial suite               → 20/20 rejected ✔
npm run demo      # end-to-end walkthrough          → deterministic verdicts
```

Requires **Node ≥ 18**. Nothing else. No `npm install`.

For the independent Python verifier (standard library only):

```bash
npm run gen:vectors && python scripts/cross-verify.py
# CROSS-VERIFICATION OK (pure Python): 1 valid accepted, 20/20 attacks rejected
```

## 🎬 Demo

```
$ node src/cli.js demo
[1] backend signs a high-value engagement event (class A, weight 50)
[2] verifier checks it against the launchpad registry
  PASS  SCHEMA
  PASS  APP_KNOWN
  PASS  KEY_ACTIVE
  PASS  CANONICALIZATION
  PASS  SIGNATURE
  PASS  TIMESTAMP_FRESHNESS
  PASS  WEIGHT_BOUND
  PASS  ELIGIBILITY
  PASS  NONCE_REPLAY

VERDICT: PASS (deterministic)

[3] attacker replays the exact same payload
  VERDICT: REJECT [REPLAY_DETECTED]

[4] attacker mutates the weight after signing
  VERDICT: REJECT [INVALID_SIGNATURE]
```

## ⚔️ Adversarial suite

Every attack is a committed test vector with an expected rejection code:

| # | Attack | Rejected with |
|---|---|---|
| 01–02 | replay / nonce reuse | `REPLAY_DETECTED` |
| 03–05 | forged signature / weight & user mutation after signing | `INVALID_SIGNATURE` |
| 06–07 | stale timestamp / future timestamp | `TIMESTAMP_EXPIRED` / `TIMESTAMP_IN_FUTURE` |
| 08 | weight inflation beyond class ceiling | `WEIGHT_OVERFLOW` |
| 09 | unknown application | `UNKNOWN_APP` |
| 10 | revoked signing key | `REVOKED_KEY` |
| 11 | cross-app key forgery | `INVALID_SIGNATURE` |
| 12–14 | missing field / unknown field injection / unsupported version | `SCHEMA` |
| 15 | self-declared eligible user | `INELIGIBLE_USER` |
| 16 | unknown key claim | `UNKNOWN_KEY` |
| 17–18 | registry says kyc/mainnet = false despite signed claims | `INELIGIBLE_USER` |
| 19 | unregistered pioneer | `INELIGIBLE_USER` |
| 20 | app id set to an object-prototype property name | `UNKNOWN_APP` |

```
RESULT: 20/20 attacks rejected
```

## 🌍 Cross-language verification

Trust one implementation? No. Every vector produced by the Node pipeline is
re-verified by `scripts/cross-verify.py` — an independent, dependency-free
implementation of RFC 8032 Ed25519 and the verification pipeline, written
from scratch against the Python standard library only.

This catches the bugs that survive inside a single codebase: wrong curve
arithmetic, divergent canonicalization, endianness mistakes. CI runs both
verifiers on Linux and Windows, across Node 18/20/22 and Python 3.10/3.12.

---

## 🏗️ Architecture

```
                 ┌──────────────────────────────────────────────┐
   event.json ──►│  closed schema ─► canonical bytes (frozen)   │
                 │                        │                     │
                 │                        ▼                     │
                 │              "PiRC1-PEP-v1\n" + bytes        │
                 │                        │                     │
                 │                        ▼                     │
   backend key ─►│                  Ed25519 sign                │──► signed envelope
                 └──────────────────────────────────────────────┘

                 ┌──────────────────────────────────────────────┐
 signed envelope►│ 1 SCHEMA          6 TIMESTAMP_FRESHNESS       │
   registry    ─►│ 2 APP_KNOWN       7 WEIGHT_BOUND             │
   nonces      ─►│ 3 KEY_ACTIVE      8 ELIGIBILITY (registry!)  │
   now         ─►│ 4 CANONICALIZATION 9 NONCE_REPLAY            │
                 │ 5 SIGNATURE                                  │
                 └──────────────────────┬───────────────────────┘
                                        ▼
                            { ok, code, checks[] }
                             deterministic verdict
```

The 9 steps always run in this order. A failure short-circuits with its code;
a pass records the nonce exactly once.

## 🗺️ Project map

```
pirc-pep-reference/
├── src/
│   ├── constants.js     protocol parameters & error codes
│   ├── canonical.js     closed-profile JSON canonicalization (JCS subset)
│   ├── schema.js        closed-schema validator (normative)
│   ├── events.js        event construction + Ed25519 signing
│   ├── keys.js          key generation (RFC 8032 via node:crypto)
│   ├── registry.js      app/key registry + eligibility registry
│   ├── nonces.js        InMemory + file-backed nonce stores (atomic claimIfAbsent)
│   ├── verify.js        ★ the deterministic 9-step pipeline
│   ├── attacks.js       the adversarial suite
│   └── cli.js           keygen / init-reg / add-key / sign / verify / demo
├── schema/
│   └── engagement-event.schema.json   JSON Schema description
├── scripts/
│   ├── gen-vectors.mjs  regenerate all vectors byte-for-byte deterministically
│   ├── check-vectors.mjs re-check committed vectors
│   └── cross-verify.py  🐍 independent pure-Python RFC 8032 verifier
├── test/
│   ├── canonical.test.js      canonicalization properties
│   ├── verify.test.js         pipeline incl. registry gating
│   ├── trust-boundary.test.js what a lying issuer can & cannot do
│   ├── attacks.test.js        the full adversarial matrix
│   ├── hardening.test.js      atomicity, durability, reproducibility, pollution
│   └── cli.test.js            CLI end-to-end
├── vectors/
│   ├── valid/signed-event.json        the one true positive vector
│   ├── registry.json                  vector world state
│   └── attacks/*.json                 20 attack vectors + expected codes
├── .github/workflows/ci.yml           Node × OS matrix + Python cross-verify
├── SPEC.md             normative specification
├── SECURITY.md         threat model & explicit limitations
└── TRACEABILITY.md     PR #2 requirement ↔ code ↔ test ↔ attack mapping
```

## 💻 Usage

```bash
# backend side
node src/cli.js keygen    --out keys/dev.json
node src/cli.js init-reg  --out registry.json --app acme-app
node src/cli.js add-key   --registry registry.json --app acme-app --key-id k1 --pub keys/dev.json

# verifier side
node src/cli.js sign   --event event.json --key keys/dev.json --out signed.json
node src/cli.js verify --event signed.json --registry registry.json --nonces nonces.jsonl
```

Library API:

```js
import { newEvent, signEvent } from './src/events.js';
import { verifySignedEvent } from './src/verify.js';
import { InMemoryNonceStore } from './src/nonces.js';

const result = verifySignedEvent(signedEnvelope, {
  registry,              // launchpad-controlled: apps, keys, eligible users
  nonceStore,            // shared state across your verifier fleet
  now                    // injectable clock => fully testable
});
// => { ok, code, checks: [{ check, pass }, ...] }
```

## 📊 Transparency Layer (`v0.3`)

The ideas endorsed in the PiRC1 review — **dynamic `p_floor`**, **`x·y=k`
invariant tracking**, **escrow lock status**, and the **"Transparency
Dashboard"** concept — are implemented as pure, side-effect-free modules on
top of the PEP/1 trust layer:

| Module | Endorsed idea it implements |
|---|---|
| [`src/pfloor.js`](src/pfloor.js) | `p_floor = (R·Q)/(R+S)²` recomputed in real time from circulating supply; invariant health report that flags any liquidity extraction |
| [`src/engagement.js`](src/engagement.js) | PoA/PoU composite × Consistency Factor; per-project weight manifests clamped to protocol ceilings (weigh down, never up) |
| [`src/escrow.js`](src/escrow.js) | offline-verifiable `SIGNING_AUTHORITY_REVOKED` attestations under a dedicated signature domain, bound to the revoked key's fingerprint |
| [`src/dashboard.js`](src/dashboard.js) | one deterministic JSON snapshot fusing all four primitives for any "Transparency Dashboard" client |

```bash
npm run transparency   # end-to-end demo snapshot
npm run app            # live single-page Transparency Dashboard (localhost:8787)
```

### Pi SDK integration & UX highlights (`app/index.html`)

- **Official Pi SDK**: loads `pi-sdk.js`, `Pi.init({version:'2.0'})`, `Pi.authenticate(['username','payments'])` with graceful **preview mode** outside Pi Browser; a support payment flow (`Pi.createPayment`) demonstrates the U2A path.
- **Bilingual EN/العربية** with full RTL layout switch, persisted per user.
- Glassmorphism UI over an animated aurora · skeleton loaders · count-up numbers · reveal animations · toast notifications · medal ranks · HiDPI gradient-area canvas chart · `prefers-reduced-motion` respected · PWA manifest for standalone install.

## 🎨 Identity & assets

| Asset | File |
|---|---|
| Original brand artwork (verbatim, as supplied by the author) | [`app/assets/brand/identity-original.jpeg`](app/assets/brand/identity-original.jpeg) |
| Vector app icon / favicon / PWA maskable icon | [`app/assets/icon.svg`](app/assets/icon.svg) |

<p align="center">
  <img src="app/assets/brand/identity-original.jpeg" alt="Pi Transparency brand identity" width="320">
</p>

Palette is driven by CSS custom properties (`--a1 #8a63ff`, `--a2 #5aa7ff`, `--a3 #3ddc97`, `--gold #f5c451`) — re-theming the whole app to match any brand source is a one-block edit.

> Pi, Pi Network and the Pi logo are trademarks of the Pi Community Company. This project is community-built and unaffiliated.


**Scope discipline:** these modules describe AMM mathematics over
caller-supplied reserves and verify authenticity of claims. They do not price,
value, endorse or promote any asset, and they never fetch chain state — the
optional attestation `anchor` field is a reference verifiers may resolve
themselves.

## 🧭 Roadmap

| Phase | Version | Scope | Status |
|---|---|---|---|
| I | `v0.1.x` | reference implementation, vectors, adversarial suite, cross-language verification | ✅ shipped |
| II | `v0.2` | conformance harness for third-party implementers, more vectors, fuzzed schema edges | ✅ shipped |
| III | `v0.3` | Transparency Layer: dynamic p_floor, invariant tracking, escrow attestations, dashboard engine, engagement scoring | ✅ shipped |
| IV | `v0.4` | pluggable storage backends for nonce stores, observability hooks | 🔜 next |
| V | `v1.0` | frozen after external review & public feedback cycle | 🔒 gated on review |

> `v1.0` will be tagged **only after** external security review and community
> feedback — not before.

## 🛡️ Security

Threat model, adversary capabilities, and explicit limitations are documented
in [SECURITY.md](SECURITY.md). The normative wire format lives in
[SPEC.md](SPEC.md). Requirement-to-evidence traceability:
[TRACEABILITY.md](TRACEABILITY.md).

**Trust boundary, in one line:** a valid signature proves authenticity of a
claim — never its truthfulness. Truth comes from the launchpad-controlled
registry; ceilings cap how much damage even a lying issuer can do.

Report vulnerabilities responsibly — see SECURITY.md for contact guidance.
Please do not open public issues for undisclosed vulnerabilities.

## 🤝 Contributing

The `main` branch is **protected**: all changes arrive through pull requests
and must pass the full CI matrix (Node × OS tests, adversarial suite, vector
regeneration, Python cross-verification) before merging.

```bash
git checkout -b feat/your-feature
npm ci 2>/dev/null || npm install   # dev-only tooling if any
npm run ci                          # full local gate before opening a PR
```

Keep PRs focused. If you change behavior, add or update the matching attack
vector and test first.

## 📜 License & Copyright

Licensed under the **[PiOS License](LICENSE)** — the Pi Open Source license that
permits unrestricted development and use of derivative works **within the Pi
Network ecosystem**, keeping this reference implementation dedicated to the
platform it was built for.

> Pi, Pi Network and the Pi logo are trademarks of the Pi Community Company.
> This project is community-built and is not affiliated with, endorsed by, or
> maintained by the Pi Core Team.

Copyright © 2026 **EslaM-X** 🇪🇬 · All rights reserved where applicable by the
chosen license terms.

---

<div align="center">

**Built as evidence, not as advertising.**
*Clone it. Run the suite. Check every claim above.*

⭐ If this reference implementation helped you evaluate PEP/1, consider starring the repo.

</div>
