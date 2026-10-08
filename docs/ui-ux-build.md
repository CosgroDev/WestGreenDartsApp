# UI / UX build

Implemented against [the audit and agreed scope](ui-ux-audit.md), including West Green-only checkout guidance, device theme choice and completion-based match-night visibility.

## Navigation and appearance

The four primary destinations are **Home, Fixtures, Practice and Stats**. Settings contains Appearance, team management and device locking. Roster and season administration remain available through Settings; browsing a historical season does not change the team's default season.

Home prioritises the current match night, resuming scoring, the next fixture and the latest result. Detailed charts, leaderboards, honours and league information live in Stats. Player entries open profiles with linked match history and practice records.

Dark remains the default. **Settings → Appearance → Dark / Light** saves the choice in the current browser and restores it before the page paints. Open tabs receive preference changes. Both themes share the green and gold identity, calmer surfaces, consistent controls and chart colours. The layout uses available desktop space while retaining phone navigation and a focused scoring view.

Keyboard focus, labelled controls, a skip link, reduced-motion handling and navigation state are included. Long player names, form fields and rows can wrap without forcing the page wider than the viewport.

## Match nights

Home and Fixtures use the same London calendar-date and completion rules:

- Future unfinished fixture: **Next game**.
- Fixture dated today: **Tonight’s game**, even after the scheduled start time.
- Earlier unfinished fixture: **Current game · Unfinished**; today's fixture takes priority when both exist.
- Completed fixture: show its result and promote the next fixture.

A fixture finishes only when **six distinct matches** are complete. A normal match requires two completed legs; historical single-row draws remain supported. Deleted rows are excluded. Six completed first legs do not complete a fixture. Reopening or deleting a leg makes the fixture unfinished again. Progress is displayed as “4 of 6 matches complete”, and unfinished matches do not appear as draws.

Fixture detail places resume/start scoring before analytics and displays a stable six-position lineup. Deleting a match releases its position without renumbering neighbouring matches. A replacement uses the first available position; its second leg inherits the same position. Creating a match opens scoring immediately.

Checkout guidance remains exclusively for the **West Green player**, including during the opponent's turn, with the owner made explicit. Match completion offers the next match or fixture result, and scoring correction remains available with confirmation where a finished result would be reopened. Match and team AI reviews require completed matches rather than partial results.

## Practice and recovery

Practice presents saved sessions before game creation, with consistent resume and result discovery for X01, 121 Challenge, Doubles Switch and Random Checkout. Killer is labelled as saved on this device only.

X01 explains its fixed leg count and supports an explicit solo mode or two players. Ending X01 early keeps recorded play and labels the session “Ended early”; unfinished legs do not become completed results. Its Undo control can reverse the latest checkout, including from an empty next leg, or reopen an early-ended session.

Doubles controls identify Miss and dart-hit outcomes clearly. “Finish round & results” waits until each player has received the same number of visits. “End now” explains that visits may be unequal. Both choices retain recorded attempts. 121 distinguishes winning the challenge from ending it early; Random Checkout ends an open-ended drill while keeping its attempts.

For 121, Random Checkout and Doubles, server-backed history restores the state before the latest saved action. Undo can reverse that attempt or visit, the final completion, or a manual end. These controls act on the latest action; they are not an arbitrary history editor. Saved-session lists label abandoned or cancelled sessions as ended early.

Pending states prevent ordinary duplicate submission. Creation forms retain their entries on errors, and fixture/match creation keeps a request token across uncertain responses. Retries return the existing saved record; changing the payload for an already-saved request produces a clear review message instead of claiming that the changed entries were saved.

PIN entry accepts ordinary keyboard input and preserves valid local destinations and their query parameters through unlocking. Settings can lock a shared device without removing saved matches or sessions. Data-loading failures are presented as failures with retry paths rather than as invented results.

## Database changes required before deployment

The application now relies on the following **two new migrations**. Apply them through the project's Supabase deployment workflow, in chronological order, **before deploying this application branch**:

1. [`20261008193846_practice_lifecycle_recovery.sql`](../supabase/migrations/20261008193846_practice_lifecycle_recovery.sql): explicit X01 solo mode, Doubles round-ending state and server-only drill history/commands for undo, reopening and lifecycle recovery.
2. [`20261008193903_fixture_lineup_positions.sql`](../supabase/migrations/20261008193903_fixture_lineup_positions.sql): persistent match positions, position inheritance for new legs, atomic fixture/match creation and deletion, and atomic team-default season selection.

These migrations assume the repository's earlier schema and migrations have already been applied. The fixture migration backfills positions for existing active matches; it does not delete or rewrite their scores. Empty-fixture deletion is blocked while active matches exist. Match deletion updates its scoring events and match rows in one transaction. A failed deletion rolls back both changes.

Creation and season changes validate team ownership. The new callable database functions are restricted to the service role; application actions use the existing signed-session server client. The drill-history table has RLS enabled and no anonymous/authenticated direct access. No new service credential is placed in browser code.

No production database migration or application deployment was performed as part of this local build. Retain the new columns and recorded history if reverting the application version; do not drop them merely to undo the visual changes.

## Validation

Completed locally on 8 October 2026:

| Check | Result |
| --- | --- |
| Production build, TypeScript and ESLint | Passed |
| Jest | 24 suites, **164 tests passed** |
| Original scoring database checks | Passed |
| Fixture transactions, slot recovery and retry handling | Passed |
| Practice lifecycle, completion correction and retry handling | Passed |
| Cached league review invalidation and rollback | Passed |
| Route/responsive checks | **78 captures passed** across Dark/Light, phone, landscape and desktop |
| Completed/ended practice results and Play again navigation | **16 captures passed** across four modes, Dark/Light and both phone widths |
| User journeys | **20 passed**, plus the setup group aggregate; SQL persistence checked after browser actions |

The 94 screen captures have no horizontal document overflow, error screens or JavaScript page errors. The 121 numeric, save, undo and pause controls remain at least 44px high, including 320 × 568. All 22 distinct opaque enabled control colour pairs in the route evidence meet 4.5:1 contrast; this is a targeted contrast check rather than a complete accessibility certification.

The journeys include theme restoration before React loads, independent device preferences, keyboard PIN entry with full destination/query preservation, device locking, season browsing, profile history return, saved practice filters, all four setup/resume flows, lost-response score/creation retry, latest-action undo, early endings and result correction, West Green-only league guidance, five-versus-six match completion, reopened fixtures, stable replacement slots, local Killer save/undo, roster duplicate feedback and read-error recovery.

The final 121 exit correction uses guarded browser navigation to leave its fixed scoring viewport reliably. Result navigation and all practice setup/resume journeys were rerun against the final production build after this correction.

The fixture-specific checks cover six-match completion, historical draws, deleted/reopened legs, UK midnight and daylight saving, UK date-entry conversion, stable slot replacement, team isolation, transaction rollback, retry handling and current-season selection. The database scripts use isolated synthetic PGlite data.

Evidence: [route checks](ui-ux-build/evidence/browser-checks.json), [result checks](ui-ux-build/evidence/result-checks.json) and [persisted user journeys](ui-ux-build/evidence/journey-checks.json).

Screenshots: [Home Dark](ui-ux-build/evidence/home-dark-390.png), [Home Light](ui-ux-build/evidence/home-light-390.png), [fixture lineup](ui-ux-build/evidence/fixture-live-light-390.png), [league scoring](ui-ux-build/evidence/league-scoring-dark-390.png), [saved practice](ui-ux-build/evidence/practice-light-390.png), [player Stats](ui-ux-build/evidence/stats-players-light-390.png) and [121 results](ui-ux-build/evidence/results-121-light-390.png).

Repeatable checks are registered in `package.json`: `test`, `test:database`, `test:fixtures`, `test:practice-lifecycle`, `test:league-reviews` and `test:ui`. The [UI/UX workflow](../.github/workflows/verify-ui-ux.yml) builds against an isolated local adapter and runs the full browser matrix, results and journeys on this branch and pull requests to main. Playwright is installed separately by that workflow. The browser harness generates local-only credentials and blocks remote service calls; it does not need production environment variables.

The local checks use Chromium and synthetic PGlite records. London midnight and daylight-saving boundaries are covered by automated date tests; screenshots do not establish behaviour across a real overnight match. Database rollback and retry cases use simulated failures rather than production outages. No production team data, production migrations, physical devices, native screen reader sessions, or Safari/Firefox runs are part of this evidence. Live external AI generation and league-provider availability have not been verified with production credentials.
