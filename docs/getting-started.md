# Getting Started

1) Install deps (Node 18+):
```bash
npm install
```

2) Configure env:
- Copy `.env.example` to `.env.local`.
- Fill Supabase URL/keys.
- Create a PIN hash: `echo -n "wgd-salt:1234" | sha256sum` and paste into `PIN_HASH`.

3) Run dev server:
```bash
npm run dev
```
Visit http://localhost:3000.

4) Apply database schema:
- Run the SQL in `supabase/schema.sql` in your Supabase project (SQL editor or `supabase db push`).
- Apply row-level policies and the PIN RPC sketch in `supabase/policies.sql` (adjust JWT claim names and the `auth_pin` function).
- Add an initial team row and PIN hash entry (or use the env-based stub until RPC is wired).

Next steps are tracked in `docs/milestones.md`.
