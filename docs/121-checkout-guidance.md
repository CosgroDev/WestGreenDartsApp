# 121 checkout guidance build

Branch: `build/121-checkout-guidance`.

The scoring screen centres a large remaining score, the current target, locked base and visit count. Suggested dart targets update from the persisted remaining score after every visit. Common odd checkouts use familiar routes, including 121 as T20 → T11 → D14.

All legal double-out finishes receive a valid route within the indicated dart allowance. Bogey scores receive a setup plan with a valid finish left for a later visit. The help section also handles a first-dart single instead of the recommended treble, using only the two darts left in that visit. These are suggestions: the player enters the total actually thrown.

Score entry has a large editable total, a touch keypad, delete and clear controls, an explicit zero/miss and bust, and a preview of the next remaining score or return to base. A would-be checkout asks the player to confirm a double or Bull; “No double” records a bust. Empty or out-of-range totals cannot be submitted.

The standard first-visit base lock, optional any-finish base lock, three-visit limit and completion at 170 remain. A bust uses the visit; an unfinished third visit returns to the locked base. Rules and history are expandable so they do not displace the primary controls. The setup page prioritises starting or resuming one of the five most recently started active games.

Scoring retains its entry until a successful response includes coherent reloaded state. Save errors offer Retry or Reload latest score. Retry retains its request UUID, including a checkout that completed the challenge before its response was lost. A stale revision with a known UUID uses the existing drill RPC's cache lookup; an invalid replay-only patch ensures it can never create a new visit. A new stale request is rejected, and reload retains the typed entry.

No new Supabase migration is required. This uses the existing audit migration's `wgd_drill_command`, revision and request-cache protections.

Verification includes all remaining scores 2–170 and dart allowances 1–3, invalid inputs, bogeys, miss routes, both base modes, busts, failed attempts and completion. The production browser harness runs the real Next server/actions and existing SQL against synthetic data in isolated PGlite, checking phone layout, keypad editing, save retry without duplicate turns, stale reload, double-out confirmation, resume, mode-specific progression and won-session retry. No production database is accessed.
