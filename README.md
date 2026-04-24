# palmi

**a quiet place for your people**

Small circles of friends, posting freely, answering one question a day together. No followers, no algorithm, no noise.

This is the working repo. It's early. It's opinionated. It's not trying to be everything.

---

## What is this

Every social app you've used got louder over time. More notifications, more suggestions, more strangers. palmi is the opposite: **2 to 15 people per circle, chronological feed, invite-only, no follower graph, no discovery surface, no engagement metrics shown to users**.

The daily question is the ritual. Every day around 9am local time, each circle gets one question — written by an AI trained on a 77-question human-curated bank, validated against seven quality gates, and falling back to a hand-written question if anything feels off. No one ever sees a raw AI output that wasn't checked.

That's the product. Everything below is how we're building it.

---

## The thesis, in three bullets

1. **The follow graph is the disease, not the cure.** Every "calm social app" of the last decade (Path, Vero, BeReal, Dispo, Poparazzi) built on open follower graphs and died. palmi rebuilds the primitive: closed groups of 5–15, mutual-only, no public profiles.

2. **Ritual beats content.** Scrolling is the losing game; Instagram and TikTok already won it. palmi optimizes for one moment a day: the question drops, you answer, you see what your people said. The rest is optional.

3. **AI that you feel but never see.** No AI-generated posts. No AI companions. No AI-written replies. Just a quiet curator picking the day's question and a monthly recap writer summarizing the circle's rhythm. Invisible by design.

---

## Project layout

```
palmi/
├── app/                          Expo (React Native) + TypeScript
│   ├── app/                      Expo Router routes
│   │   ├── (auth)/               phone, verify
│   │   ├── (tabs)/               circles, settings
│   │   │   └── circles/
│   │   │       ├── index.tsx     circle list
│   │   │       ├── new.tsx       create circle
│   │   │       ├── join.tsx      join via code
│   │   │       └── [id]/         per-circle feed + compose
│   │   └── onboarding.tsx        display name capture
│   └── src/
│       ├── components/           Button, TextInput, Screen
│       ├── hooks/                useAuth (Zustand + Supabase)
│       ├── lib/                  supabase client, generated types
│       └── theme/                the entire design language in tokens.ts
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_schema.sql        12 tables, ~28 indexes
│   │   ├── 002_rls.sql           36 row-level security policies
│   │   ├── 003_rpcs.sql          5 business-logic functions
│   │   ├── 004_seed_questions.sql  77 human-written fallback questions
│   │   ├── 005_cron.sql          pg_cron schedules (curator + recap)
│   │   ├── 006–012_*.sql         moderation, rename, push, waitlist, analytics, admins
│   │   └── 013_llm_observability.sql  llm_calls table + llm_agent_hourly view
│   │
│   └── functions/
│       ├── _shared/
│       │   └── llm.ts            shared Anthropic client (retry, cost, observability)
│       ├── curate-question/      Edge Function: daily question agent
│       │   ├── index.ts          Claude Haiku 4.5 + 7 quality gates
│       │   ├── validator.test.ts 16 passing tests
│       │   └── integration.test.ts  8 passing tests
│       ├── moderate-content/     Edge Function: pre-publication safety classifier
│       │   ├── index.ts          6-category classifier, fail-open, insert-on-pass
│       │   ├── validator.test.ts
│       │   └── integration.test.ts
│       └── write-recap/          Edge Function: monthly recap writer
│           ├── index.ts          AI prose recap + template fallback
│           ├── validator.test.ts
│           └── integration.test.ts
│
├── apps/
│   └── web/                      Next.js 15 — landing page (palmi.app) + /admin dashboard
│
├── preview/                      HTML mockups you can open in a browser
└── README.md                     you are here
```

---

## Getting started

### Prerequisites

- **Node 18+** for the Expo app
- **Deno 1.40+** for testing the Edge Function
- **Supabase CLI** (`brew install supabase/tap/supabase`) for deployment
- **An Anthropic API key** for the question curator

### 60-minute deploy path

1. **Create the Supabase project** — dashboard.supabase.com, save the ref + keys.

2. **Enable extensions** — Dashboard → Database → Extensions: turn on `pg_cron` and `pg_net`.

3. **Run the migrations** — Dashboard → SQL Editor, paste each file in order (`001` through `013`). After `005`, follow the comments at the bottom: set `app.edge_base_url` and `app.service_role_key`, then uncomment the `cron.schedule(...)` calls.

4. **Create the storage bucket** — Dashboard → Storage → New bucket: name `post-photos`, public, 10 MB limit.

5. **Deploy the Edge Functions**:

   ```bash
   cd supabase
   supabase login
   supabase link --project-ref <your-ref>
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy curate-question --no-verify-jwt
   supabase functions deploy moderate-content --no-verify-jwt
   supabase functions deploy write-recap --no-verify-jwt
   ```

6. **Run the app**:
   ```bash
   cd app
   cp .env.example .env.local
   # fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
   npm install
   npx expo start
   ```
   Scan the QR with Expo Go on your phone.

---

## Design principles

These aren't style suggestions; they're how we make product decisions.

### 1. Silence is the feature

Every time you consider adding something, ask: _does this make the app louder?_ If yes, the default answer is no. No badges. No unread counts. No "suggested for you." No streaks. No rankings.

### 2. Chronological, always

There will be pressure to rank. Ignore it. The moment palmi's feed is ranked, palmi is dead. Newest on top. Every time.

### 3. Warm, not cool

Tech brands run cold (blue, grey, sans-serif, neutral). palmi runs warm — off-white `#FAF9F6`, ink `#1A1A1A`, warm rose accent `#D65745`, Fraunces serif display, Inter body. No gradients, no shadows on surfaces, generous whitespace.

### 4. The friend graph is sacred

Memberships are the only relationship in the database. There is no "follow" table, no "friend request" table, no "recommendation" table. If the model doesn't exist in the schema, it can't be built in the product.

### 5. AI you feel, never see

- Agent 1 ✓: **Question Curator** — writes the daily question
- Agent 2 ✓: **Recap Writer** — monthly summary of the circle's rhythm
- Agent 3 ✓: **Moderator** — pre-publication content safety

All three agents share a single `_shared/llm.ts` client with retry, timeout, cost accounting, and per-call observability to `public.llm_calls`. No AI-generated posts. No AI companions. No AI-suggested replies. Ever.

---

## What's built

### Database ✓

- 12 tables (profiles, circles, memberships, posts, reactions, daily_questions, question_answers, fallback_questions, moderation_events, recaps, push_tokens, notification_prefs)
- 36 RLS policies, verified with a two-user isolation test proving cross-circle reads and inserts are blocked, and that leaving a circle immediately revokes access
- 5 RPCs: `create_circle`, `join_circle`, `leave_circle`, `get_circle_feed`, `is_circle_member`
- 77 fallback questions seeded across six tags

### Mobile app ✓

- Phone OTP auth (Supabase Auth)
- Onboarding (display name + auto-captured timezone)
- Circle list, create, join, leave
- Chronological feed with photo + text posts
- Four preset emoji reactions with optimistic updates
- Photo upload to Supabase Storage
- Complete design system in one file (`src/theme/tokens.ts`)
- Zero TypeScript errors under strict mode

### Question Curator ✓

- Claude Haiku 4.5 via the Anthropic API
- 7 quality gates: JSON validity, length bounds, ending punctuation, forbidden words, tag normalization, timezone-aware drop targeting, duplicate prevention
- Human-curated fallback bank of 77 questions, rotated by least-recently-used
- Timezone-aware: each circle's question drops at 9am in the owner's local TZ
- 24/24 tests passing (16 validator + 8 integration)

### Content Moderator ✓

- Pre-publication safety classifier — called by the client before any post or answer is inserted
- Six categories: `nsfw`, `self_harm`, `targeted_harassment`, `csam`, `real_names_of_non_members`, `illegal_content`
- Verdicts: `pass` (insert with `moderation_status = 'ok'`), `hold` (insert with `moderation_status = 'held'`, author-only), `reject` (no insert)
- `csam` always rejects; all other flags hold; clean content passes
- Fail-open on any infra failure — content goes through, outage is logged
- Every run logged to `moderation_events` audit table
- Client-side session refresh before call eliminates 401 errors on returning users

### Recap Writer ✓

- Monthly AI prose recap of the prior month's circle activity
- Runs on the 1st of each month at 9am in the circle owner's timezone
- AI path: Claude Haiku 4.5 with warm, lowercase-friendly brand voice
- 7 quality gates: length (120–180 words / 500–1500 chars), forbidden phrases, no metrics, member name mention required
- Template fallback when AI fails — always produces a valid recap
- Per-circle idempotency: skips circles that already have a recap for the period

### Shared LLM Client ✓

- `supabase/functions/_shared/llm.ts` used by all three agents
- Exponential backoff retry on 429 / 5xx / network errors (configurable attempts + timeout)
- Per-call cost accounting: Claude Haiku 4.5 at $1/MTok input, $5/MTok output
- Every call logged to `public.llm_calls` with agent, model, status, duration, tokens, cost, circle_id
- `llm_agent_hourly` view for aggregate monitoring

### Cost model

At 10,000 active circles:

- Question curator (1 call/circle/day): ~$12/month
- Recap writer (1 call/circle/month): ~$0.50/month
- Moderator (per post — usage-dependent): ~$0.10 per 1,000 posts

Total at 10k circles + moderate usage: well under $20/month.

---

## Out of scope for v1

Explicit cuts. Write them down so you don't argue with yourself later.

- DMs, comments, stories, video, voice
- Discover feed, explore, trending, suggested circles
- Public profiles, verification, blue checks
- Likes counter visible to others
- Web client (mobile only for v1)
- Streaks (ever)
- Followers (ever)

---

## Landing page (`apps/web`)

`palmi.app` is a Next.js 15 app in `apps/web/`. The landing page is a straight port of `preview/index.html` with `next/font` serving Fraunces + Inter. Both waitlist forms (hero + CTA) hit a server action that inserts into `public.waitlist` via the anon key.

```bash
cp apps/web/.env.example apps/web/.env.local
# fill NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
# ADMIN_PASSWORD, ADMIN_SESSION_TOKEN (any strong random string)

cd apps/web && npm install
npm run web:dev   # from repo root
```

### Deploy to Vercel

1. `vercel link` (from `apps/web/`), select a new project.
2. **Root directory**: `apps/web`. Framework preset: Next.js.
3. Env vars (Project Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Production only — never expose)
   - `NEXT_PUBLIC_WAITLIST_COUNT` (`2847` for v1)
   - `ADMIN_PASSWORD` (shared password; rotate quarterly)
   - `ADMIN_SESSION_TOKEN` (any long random string; changing it invalidates all sessions)
4. Add the `palmi.app` domain (apex + `www`) in Vercel → Domains. Point your registrar's DNS to Vercel's nameservers or their A/ALIAS records.
5. Run migration 010 (waitlist) on the Supabase project so inserts land somewhere.

**Deployed URL**: _TBD — add after first deploy_

---

## Analytics — what's tracked and why

palmi runs **no third-party analytics**. No GA, no Mixpanel, no Segment, no PostHog cloud. Every number in the admin dashboard is a SQL view over tables you already see (`posts`, `reactions`, `daily_questions`, `question_answers`, `profiles`, `memberships`, `fallback_questions`). Nothing new is logged.

**What we look at:**

| Metric                                   | Why                                                  |
| ---------------------------------------- | ---------------------------------------------------- |
| DAU / WAU (30d / 12w)                    | Is the app being opened in any meaningful way?       |
| Retention cohorts by signup week         | Do people stick, or drop off after week 2?           |
| Overall median posts per circle per week | Are circles actually posting, or is it a ghost town? |
| % of daily questions with ≥1 answer      | Is the core ritual working?                          |
| Time to first post after circle creation | Is the onboarding → first-value gap too long?        |
| Reaction usage by kind                   | Which of the four emoji are pulling weight?          |
| Top fallback questions                   | What to clone when growing the bank                  |
| Waitlist signup count                    | Pre-launch demand                                    |

**What we explicitly don't log:**

- **No post bodies, answer bodies, photo contents, or question text in user activity views.** The only free-text the dashboard displays is the fallback question bank, which is shared, content-reviewed by us, and not PII.
- **No per-user activity rows anywhere in the UI.** The `user_activity` view exists only as a building block for aggregate counts; it's never displayed.
- **No per-circle breakdowns.** Median across circles only — you cannot single a circle out from the dashboard.
- **No feed-view tracking.** Scrolling the feed is not instrumented and never will be.
- **Small-N thresholds.** Time-to-first-post requires ≥5 eligible circles; posts-per-circle requires ≥3 circles per week. Below those, the view returns zero rows.

**Access:** views live in the `analytics` Postgres schema, granted only to `service_role`. The admin dashboard at `palmi.app/admin` is gated by a shared password + HttpOnly signed cookie. Not exposed to the mobile app.

If anything here starts to feel like surveillance in practice, yank it. The instrumentation exists to answer "is this working?" — not to track people.

---

## Still to build

**Priority order if you're picking up from here:**

1. Buy palmi.app domain and deploy `apps/web` to Vercel
2. Materialized-view-backed waitlist counter (replace hardcoded 2,847)
3. Push notification delivery (tokens + `009_push_triggers.sql` are in place; need APNs/FCM credentials set in Supabase secrets)
4. Stretch: Supabase-session auth for `/admin` once we have >1 admin
5. Stretch: reply threading on posts (schema has `reply_to_id`; UI not built)

---

## Testing

```bash
# TypeScript check on the app
npm run app:typecheck

# Unit + integration tests for all three agents (no external deps)
npm run functions:test

# Live smoke tests against the real Anthropic API (~$0.05 each)
ANTHROPIC_API_KEY=sk-ant-... npm run functions:smoke
```

---

## Contributing

This is a founder repo in very early stage. Follow the design principles above. If a PR adds a notification, a badge, a streak, a recommendation, or any form of ranking to the feed, it will not be merged. Not because the code is bad — because the product would be.

---

## License

MIT. See `LICENSE`.

---

_Built quietly._
