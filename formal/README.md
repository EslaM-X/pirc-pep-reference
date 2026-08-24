# formal/ — Machine-Checkable Fragment

## What lives here

| File | Purpose |
|---|---|
| `piproof_gates.tla` | TLA+ model of the G1–G9 pipeline: two verifiers racing one shared nonce authority; the stateful heart (snapshot eligibility + atomic test-and-set) with INV-04/INV-05 as TLC invariants |
| `piproof_gates.cfg` | TLC configuration (2 verifiers, four invariants) |

## Status — read before quoting

This model is **hand-checked, not yet machine-run**: no TLC/Java toolchain is
wired into CI yet. It is delivered as the concrete starting point for
MATURITY.md row #14 (mechanized verification), with the invariants written so
that running them is a one-command exercise:

```
java -cp tla2tools.jar tlc2.TLC -config piproof_gates.cfg piproof_gates.tla
# expected: "Model checking completed" with 4/4 invariants satisfied
```

Modeling decisions are documented in the module header. Deliberate scope:
pure gates G1–G7 are abstracted to always-pass steps because their failure
semantics are exhaustively pinned by the interop vectors and fuzz suites;
the model exists to explore *concurrency and state* interactions, which is
where vector suites are structurally blind.

## Roadmap

1. Wire a TLC run into CI (setup-java + tla2tools download) — makes #14
   "held" rather than "drafted".
2. Extend the model with the freshness window as an explicit clock variable
   and re-check INV-09.
3. Add a PlusCal refinement mapping against `src/verify.js` gate order so
   the code and the model can be diffed mechanically.
