------------------------------- MODULE piproof_gates -------------------------------
(***********************************************************************************)
(* PiProof G1–G9 verification pipeline as a step-indexed state machine —           *)
(* the machine-checkable fragment of docs/FORMAL_MODEL.md.                         *)
(*                                                                                 *)
(* WHAT IS MODED AND WHY                                                           *)
(* Two verifiers race ONE event against ONE shared durable nonce authority.        *)
(* Gates G1–G7 are pure functions of the document (their failure semantics are     *)
(* exhaustively pinned by the vector and fuzz suites), so they are modeled as      *)
(* always-pass steps. The STATEFUL heart is what needs a model checker:            *)
(*   • G8 — registry snapshot eligibility (environment choice per verifier)         *)
(*   • G9 — atomic test-and-set on the shared burned flag                           *)
(* TLC explores every interleaving of the two pipelines.                            *)
(*                                                                                 *)
(* INVARIANTS CHECKED                                                              *)
(*   TypeOK            — state stays well-formed                                   *)
(*   AtMostOneAccept   — INV-04: two racing verifiers cannot both reach ACCEPT      *)
(*   AcceptImpliesBurn — acceptance happened exactly through a G9 win               *)
(*   BurnOnlyOnPass    — INV-05: nothing burns the nonce except an acceptor         *)
(*                                                                                 *)
(* RUN (external tooling — Java + tla2tools.jar):                                  *)
(*   java -cp tla2tools.jar tlc2.TLC -config piproof_gates.cfg piproof_gates.tla   *)
(* Expected: "Model checking completed. Found 0 states at level..." with all       *)
(* four invariants reported as satisfied.                                          *)
(***********************************************************************************)
EXTENDS Naturals

CONSTANT Verifiers    \* model value: {v1, v2} — see piproof_gates.cfg

VARIABLES
    pc,        \* per-verifier program counter: gate index 1..9 while running,
               \* ACCEPTED, or -(gate index) after a rejection at that gate
    burned,    \* shared durable nonce state: TRUE once claimed
    eligSeen   \* per-verifier registry-snapshot verdict at G8 (env choice)

Gates == 1..9
ACCEPTED == 10
REJ(g) == -g
TerminalPCs == {REJ(g) : g \in Gates} \cup {ACCEPTED}
AllPCs == Gates \cup TerminalPCs

TypeOK ==
    /\ pc \in [Verifiers -> AllPCs]
    /\ burned \in BOOLEAN
    /\ eligSeen \in [Verifiers -> BOOLEAN]

Init ==
    /\ pc = [v \in Verifiers |-> 1]
    /\ burned = FALSE
    /\ eligSeen = [v \in Verifiers |-> FALSE]

(* Gates G1–G7: pure checks pass (purity enforced by vectors/fuzzing). *)
PassPure(v) ==
    /\ pc[v] \in 1..7
    /\ pc' = [pc EXCEPT ![v] = pc[v] + 1]
    /\ UNCHANGED <<burned, eligSeen>>

(* G8: the environment commits to whether v's snapshot shows eligibility. *)
DecideElig(v) ==
    /\ pc[v] = 8
    /\ \E b \in BOOLEAN : eligSeen' = [eligSeen EXCEPT ![v] = b]
    /\ UNCHANGED <<pc, burned>>

PassG8(v) ==
    /\ pc[v] = 8
    /\ eligSeen[v]
    /\ pc' = [pc EXCEPT ![v] = 9]
    /\ UNCHANGED <<burned, eligSeen>>

FailG8(v) ==
    /\ pc[v] = 8
    /\ ~eligSeen[v]
    /\ pc' = [pc EXCEPT ![v] = REJ(8)]
    /\ UNCHANGED <<burned, eligSeen>>

(* G9: atomic test-and-set — winner flips burned and ACCEPTS atomically;
   any later contender observes burned and rejects. *)
WinClaim(v) ==
    /\ pc[v] = 9
    /\ ~burned
    /\ burned' = TRUE
    /\ pc' = [pc EXCEPT ![v] = ACCEPTED]
    /\ UNCHANGED eligSeen

LoseClaim(v) ==
    /\ pc[v] = 9
    /\ burned
    /\ pc' = [pc EXCEPT ![v] = REJ(9)]
    /\ UNCHANGED <<burned, eligSeen>>

Next ==
    \E v \in Verifiers :
        \/ PassPure(v)
        \/ DecideElig(v)
        \/ PassG8(v)
        \/ FailG8(v)
        \/ WinClaim(v)
        \/ LoseClaim(v)

Spec == Init /\ [][Next]_<<pc, burned, eligSeen>>

IsAccept(v) == pc[v] = ACCEPTED

(* INV-04 *)
AtMostOneAccept ==
    \A v1 \in Verifiers :
        \A v2 \in Verifiers :
            (v1 # v2 /\ IsAccept(v1)) => ~IsAccept(v2)

(* acceptance can only be reached through the winning claim *)
AcceptImpliesBurn ==
    \A v \in Verifiers : IsAccept(v) => burned

(* INV-05 *)
BurnOnlyOnPass ==
    burned => (\E v \in Verifiers : IsAccept(v))

=============================================================================
