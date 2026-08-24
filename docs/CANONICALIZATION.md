# PiProof Canonical Profile v1

**Status:** normative companion to [SPEC.md](../SPEC.md). This document does
not change the wire format; it makes an existing design decision explicit and
interoperable.

## The relationship in one sentence

PiProof uses a **protocol-specific canonicalization profile** that is *inspired
by* RFC 8785 (JCS) but is **not** a conforming JCS implementation, and must
never be described as one.

| Aspect | RFC 8785 JCS | PiProof Canonical Profile v1 |
|---|---|---|
| Numbers | IEEE-754 doubles, ECMAScript serialization | **non-negative safe integers only** (`0 … 2^53−1`); everything else is a hard error |
| Strings | Unicode characters, no normalization mandated beyond JSON | **NFC-normalized** before serialization |
| Object keys | sorted by UTF-16 code units of the raw key | sorted by UTF-16 code units of the **raw** key; **serialization uses the NFC-normalized key** |
| NFC key collisions | unspecified | **hard error** — two distinct raw keys folding to the same NFC key are rejected (`normalized key collision under NFC`) |
| Input model | assumes parsed JSON values | assumes parsed JSON values produced by a parser with **duplicate-key rejection or last-wins semantics documented by the platform** |

### Why each deviation exists

1. **Safe non-negative integers only.** PEP/1 fields (`weight`, `timestamp`,
   `version`, `created_at`) are conceptually integers. ECMAScript number
   serialization (the hardest part of implementing JCS correctly) exists to
   round-trip arbitrary doubles; the protocol never needs them. Deleting the
   problem deletes the entire JCS ES6-number algorithm — and every
   cross-language rounding hazard with it.
2. **NFC string normalization.** Evidence payloads carry human-origin strings
   (`action_id`, `subject`). Two byte-different but visually identical strings
   must produce one signature, not two.
3. **Raw-sort, normalized-serialize.** Sorting happens on raw keys so the
   transformation pipeline is parse-order-independent; serialization emits the
   normalized key so signatures bind what humans see. The combination has one
   observable consequence — see §Divergence example — which the vectors pin
   down byte-for-byte.
4. **Collision rejection.** `"e\u0301"` and `"\u00e9"` are different raw keys
   but one NFC key. Silent merging would let two distinct documents share one
   canonical form; the profile refuses instead of guessing.

### Divergence example (pinned by vector `canon-012`)

Input keys: `U+212B` (ANGSTROM SIGN) and `U+FB03` (FF LIGATURE).

- Raw UTF-16 order: `U+212B < U+FB03` → emission order is **Å-sign first**.
- If sorting happened on NFC-normalized keys instead (`U+00C5 "Å"` vs
  `"ffi"`), the order would flip.

Both orders are defensible designs; this profile chose raw-sort and froze it
in an interop vector precisely so implementations cannot disagree silently.

## Interop vectors

`vectors/canonical/index.json` contains 15 vectors covering integer bounds,
rejections (negative/float/exponent/unsafe), NFC equivalence, astral
characters, minimal escaping, key ordering, the divergence case above, NFC
collisions, nesting and empty containers.

Each vector provides the **raw JSON text** as input; an implementation must
parse it, canonicalize it, and either reproduce `expected.canonical`
byte-for-byte (UTF-8) or reject with an error for `expected.error` cases.

Two independent implementations already agree on all vectors:

- Node (`src/canonical.js`) — checked by `npm run gen:canonical`;
- Python stdlib (`scripts/cross-canonical.py`) — checked in CI across
  Python 3.10/3.12 on Linux and Windows.

Adding a third-language implementation is deliberately boring: implement the
table above, run the vectors, match all 15.

## Implementation requirements (normative)

An implementation is *PiProof Canonical Profile v1 conformant* if and only if:

1. it rejects any parsed number outside `[0, 2^53−1]` ∪ ℤ;
2. it NFC-normalizes every string value and every object key before output;
3. it emits object keys sorted by raw-key UTF-16 code-unit order;
4. it rejects documents where two raw keys NFC-fold to the same key;
5. it reproduces every vector in `vectors/canonical/index.json` exactly;
6. it describes itself as "PiProof Canonical Profile v1", never as "JCS".
