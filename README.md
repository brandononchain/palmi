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
│   │   └── 005_cron.sql          pg_cron schedules
│   │
│   └── functions/
│       └── curate-question/      Edge Function: the daily question agent
│           ├── index.ts          Claude Haiku 4.5 + 7 quality gates
│           ├── validator.test.ts 16 passing tests
│           └── integration.test.ts  8 passing tests
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

3. **Run the migrations** — Dashboard → SQL Editor, paste each file in order:
   ```
   supabase/migrations/001_schema.sql
   supabase/migrations/002_rls.sql
   supabase/migrations/003_rpcs.sql
   supabase/migrations/004_seed_questions.sql
   supabase/migrations/005_cron.sql
   ```
   After `005`, follow the comments at the bottom: set `app.edge_base_url` and `app.service_role_key`, then uncomment the `cron.schedule(...)` call.

4. **Create the storage bucket** — Dashboard → Storage → New bucket: name `post-photos`, public, 10 MB limit.

5. **Deploy the Edge Function**:
   ```bash
   cd supabase
   supabase login
   supabase link --project-ref <your-ref>
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy curate-question --no-verify-jwt
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

Every time you consider adding something, ask: *does this make the app louder?* If yes, the default answer is no. No badges. No unread counts. No "suggested for you." No streaks. No rankings.

### 2. Chronological, always

There will be pressure to rank. Ignore it. The moment palmi's feed is ranked, palmi is dead. Newest on top. Every time.

### 3. Warm, not cool

Tech brands run cold (blue, grey, sans-serif, neutral). palmi runs warm — off-white `#FAF9F6`, ink `#1A1A1A`, warm rose accent `#D65745`, Fraunces serif display, Inter body. No gradients, no shadows on surfaces, generous whitespace.

### 4. The friend graph is sacred

Memberships are the only relationship in the database. There is no "follow" table, no "friend request" table, no "recommendation" table. If the model doesn't exist in the schema, it can't be built in the product.

### 5. AI you feel, never see

- Agent 1 (built): **Question Curator** — writes the daily question
- Agent 2 (todo): **Recap Writer** — monthly summary of the circle's rhythm
- Agent 3 (todo): **Moderator** — pre-publication content safety

No AI-generated posts. No AI companions. No AI-suggested replies. Ever.

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

### Cost model

At 10,000 active circles, one question per day: ~$12/month. Trivial.

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

## Still to build

**Priority order if you're picking up from here:**

1. Answer composer screen for daily questions
2. Circle info/members screen
3. Expo Push notifications (off by default per brand; opt-in per-circle)
4. Agent 2: Recap Writer — monthly per-circle recap
5. Agent 3: Moderator — pre-publication safety classifier
6. Landing page + waitlist

---

## Testing

```bash
# TypeScript check on the app
npm run app:typecheck

# Unit + integration tests for the curator (no external deps)
npm run functions:test

# Live test against the real Anthropic API (~$0.05)
ANTHROPIC_API_KEY=sk-ant-... npm run functions:smoke
```

---

## Contributing

This is a founder repo in very early stage. Follow the design principles above. If a PR adds a notification, a badge, a streak, a recommendation, or any form of ranking to the feed, it will not be merged. Not because the code is bad — because the product would be.

---

## License

MIT. See `LICENSE`.

---

*Built quietly.*
