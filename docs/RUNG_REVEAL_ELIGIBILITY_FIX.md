# Rung reveal eligibility repair

Repairs ENG-REVEAL-REQUEST-GUARD on the V3 base. `requestTrumpReveal` now consults `getRevealPermissions` before any mutation, retaining existing descriptive state/team errors. The shared permission explicitly requires a valid player and caller, current actor, TRICK_PLAYING, established lead suit, no cards in that suit, hidden rung and no pending/paused reveal. Socket.IO already derives identity from the room's socket map and calls this engine method; no client payload can bypass the new engine boundary.

`showTrumpCard` was reviewed: it requires trick play, pending request and caller identity. A legitimate request now establishes that sequence. Caller need not be current actor to show. Legal-card filtering still prioritizes following lead suit, includes a locked card only after reveal or when caller ordinary hand is empty, and requires the void revealer to use trump if held. No scoring, policy, locked-card or post-reveal rule changes.

Focused validation: 52 tests across RevealEligibility, ExpertKnowledge, NormalPlayRungReveal and CloseRungAceAndLastTurn pass. AI TypeScript check passes. Fourteen new focused cases cover invalid identity/caller, wrong turn, suit availability, missing lead, caller and teammate, reveal/pending/pause/phase states, legitimate request/show/trump use and locked-card boundaries. The old successful-bypass characterization now expects rejection and no mutation. Socket identity mapping was inspected at server.ts requestTrumpReveal handler; no separate network test is claimed.

The knowledge package's ENGINE_REVIEW and GM-REVEAL descriptions are pinned historical findings at the pre-fix commit; this document supersedes their outstanding-defect status for this branch. No canonical checkpoint changes.
