West Green Darts — Product Requirements Document (Revised for Simple Multi-Device PIN App)

Document Version: 1.1
Last Updated: 2026-01-24
Author: West Green Darts Team
Status: Approved for Development (Revised)

1. Executive Summary

West Green Darts is a mobile-first web application for managing a single darts team’s seasons, fixtures, games, player profiles, and statistics. The app is accessed by the team via a shared PIN and must support multiple devices using the same shared data.

The solution must be simple to deploy and maintain, prioritizing reliability and ease of hosting.

2. Product Vision

Create a streamlined, mobile-optimized darts team management platform that enables the team to:

Manage seasons and fixtures

Score 501 games quickly during matches

Automatically calculate player and team statistics

View dashboards with filters and charts

Export data for external analysis

Access the same data from multiple phones/devices using a shared PIN

3. Target Users

Primary Users: West Green Darts players and team admins (~15 members)
Primary Contexts:

Live scoring during matches (mobile)

Reviewing results/stats after matches (mobile/desktop)

Planning fixtures across seasons (admin tasks)

4. Scope
4.1 In Scope (v1)

PIN-based team access (single shared team)

Player management (incl. optional photo)

Season + fixture management

Game management (501 double-out)

Live scoring with undo and finish guidance

Automatic stat tracking (player + team)

Dashboards and filters

Export (CSV + JSON minimum)

4.2 Out of Scope (v1)

Multi-team support

Individual logins per player

Messaging / chat

Tournament brackets

Hardware scoring integration

ML-based predictions (basic “prediction” fields can be stubbed or heuristic)

5. Core Features
5.1 Access Control (PIN-based Team Gate)

Shared PIN Entry: Single numeric PIN for the team

Session Persistence: Device remains signed-in (e.g., 30 days) unless user logs out / clears storage

No user registration: No per-user accounts required for v1

PIN Security:

PIN stored as a hash (server-side)

HTTPS enforced

Acceptance Criteria

App cannot access any protected screens without successful PIN entry.

After PIN success, user is not repeatedly prompted during normal usage.

5.2 Player Management

Player Profile Fields

Name (required, unique)

Photo/avatar (optional)

Darts equipment profile (optional):

Dart model/type

Stem length

Flight type/design

Registration date (auto)

Active/inactive status

Acceptance Criteria

Add/edit players from mobile

Mark players inactive (kept in history for stats)

Photo upload works on mobile

5.3 Season & Fixture Management

Season

Name format: “YY/YY” (e.g., “25/26”)

Multiple seasons supported

One season marked as “Current”

Fixtures

Fixture details:

Date/time (required)

Home/Away (required)

Opponent team name (required)

Venue (optional)

Notes (optional)

Fixtures visible in season overview

Fixture detail page shows games and results summary

Acceptance Criteria

Create/edit seasons and fixtures

Open fixture page and add games inside it

5.4 Game Management (501 Double-Out)

Game Setup (within a fixture)

Multiple games per fixture

Select West Green player (dropdown)

Enter opponent player name (free text)

Game format: 501 double-out

Store who starts (West Green starts vs opponent starts) for keep/break metrics

Live Scoring

Fast score entry (visit-based: 0–180)

Real-time remaining score calculation

Validation: cannot go below zero; bust rules apply

Undo: revert last entered visit

Finish Guidance:

When on a finish (2–170), show recommended route(s)

Complete leg when exactly zero achieved with valid double-out

Post-game summary screen

Acceptance Criteria

Can score a full leg end-to-end from mobile comfortably

Undo restores previous remaining score correctly

Finish suggestions appear at relevant remaining scores

5.5 Statistics Tracking

The app must calculate per-player and team-level statistics from recorded game events.

Player Statistics (v1)

Basics

Legs played

Legs won

3-dart average

First 9 average

Score Distribution (visit counts)

60+, 80+, 100+, 120+, 140+, 170+, 180s

Finishing

High finish

100+ finishes count

Best leg (fewest darts)

Worst leg (most darts)

Performance

Checkout % (success / attempts)

Keep % (legs won when starting)

Break % (legs won when not starting)

Prediction Fields (v1 approach)

“Checkout prediction”, “Keep prediction”, “Break prediction”

v1 may implement as a simple rolling-rate heuristic or display as “Not available” until enough data exists.

Team Statistics

Team legs won/lost (aggregate)

Team averages (aggregate)

Season-by-season totals

Fixture results overview

Acceptance Criteria

Stats update immediately after a leg completes

Filters on dashboards change the computed stats correctly

5.6 Dashboards & Analytics
Player Dashboard

Player overview with stats

Filters:

Season

Date range

Opponent

Home/Away

Charts (v1 minimal set):

3DA over time

Checkout % trend

Score distribution

Team Dashboard

Aggregate view across all players

Season comparison

Top performers (by 3DA, 180s, high finish, checkout %)

Acceptance Criteria

Dashboards work well on mobile

Charts render quickly with typical dataset sizes

5.7 Data Export

Export player stats (CSV)

Export team stats (CSV)

Export fixtures + results (CSV)

Export game-by-game event data (CSV + JSON)

Acceptance Criteria

Export runs from mobile and downloads a file

Export reflects current filter context where applicable

6. Mobile-First UX Requirements

Touch-optimized scoring UI

Large buttons and numeric keypad

Minimal text input during scoring

Responsive layout for portrait/landscape

7. Technical Requirements (Revised to “Simple + Multi-Device”)
7.1 Required Technology Stack

Frontend

Next.js (App Router)

Mobile-first UI styling (Tailwind or equivalent)

Hosting

Vercel for the web application

Backend

Supabase (Postgres + Storage)

Access Model

Shared team PIN gate

Session via secure cookie/token

7.2 Data Persistence & Multi-Device

All data stored centrally in Supabase:

Players, seasons, fixtures, games, scoring events

Must support concurrent access from multiple devices

Data must not be stored only on-device (device can be used, but server is source of truth)

7.3 Data Model Approach (Event-based Scoring)

To keep undo, stats, and concurrency simple:

Each scoring entry is stored as a scoring event (visit)

Remaining score and derived stats are calculated from events

Undo is implemented by removing the last event or writing an undo marker (implementation choice)

7.4 Backups & Recovery

Supabase managed backups are the baseline

Optional: scheduled export capability (monthly) for additional redundancy

7.5 Offline Capability (Phased)

v1 default: online-first (recommended for speed).
v1 optional (nice-to-have if time permits):

If connection drops, the scoring screen should not lose state

A later v1.x enhancement may add IndexedDB “outbox” syncing

(Offline full support remains a future enhancement unless explicitly prioritized.)

7.6 Performance

Page load: < 2 seconds on 4G (typical UK network conditions)

Score entry response: < 100ms perceived (UI updates instantly after entry)

Typical dataset scale: 15 players, multiple seasons, hundreds to low thousands of scoring events

7.7 Security

PIN stored hashed server-side

HTTPS only

Protect against common web vulnerabilities

Supabase RLS policies enforce team-only access (single team in v1)

8. User Flows (Updated)
8.1 Initial Access

Navigate to URL

PIN screen

On success, session created and dashboard displayed

8.2 Create Season & Fixtures

Seasons → Create season (“25/26”) → set as current

Add fixtures with date/opponent/home-away

Open fixture → add games

8.3 Live Scoring

Open fixture

Create/select game

Choose West Green player, enter opponent name, select starter

Enter visit scores, undo if needed

Finish guidance shown when on checkout

Complete leg, view summary

8.4 View Stats

Dashboard → Player or Team

Apply filters

Review charts + metrics

Export if needed

9. Milestones (Revised for Simplicity)

Phase 1: Foundation

Next.js app scaffold + navigation

PIN gate + session cookie

Supabase schema + basic CRUD for players

Phase 2: Seasons/Fixtures

Seasons + fixtures CRUD

Fixture detail page + game creation

Phase 3: Live Scoring

Scoring events model

Remaining score logic + validation + undo

Finish guidance (2–170 lookup)

Phase 4: Stats + Dashboards + Export

Player/team stat calculations

Dashboard views + charts

CSV/JSON exports

Phase 5: Polish

Mobile UX refinement

Performance checks

Optional offline resilience improvements

10. Appendix — Calculation Formulas (unchanged)

3 Darts Average = Total points scored ÷ Total visits × 3

First 9 Average = Sum of first 3 visits per leg ÷ Number of legs × 3

Checkout % = Successful checkouts ÷ Total checkout opportunities × 100

Keep % = Legs won when starting ÷ Total legs started × 100

Break % = Legs won when not starting ÷ Total legs not started × 100