# Changelog

All notable changes to palmi.

## [Unreleased]

### Added
- Initial project scaffold
- Supabase schema (12 tables), RLS policies (36), business-logic RPCs (5)
- Seeded 77-question human-curated fallback bank
- Expo mobile app: auth, onboarding, circle CRUD, chronological feed, photo upload, four-emoji reactions
- Question Curator Edge Function (Claude Haiku 4.5) with 7 quality gates
- pg_cron hourly schedule for timezone-aware question drops
- 24 passing tests (16 validator + 8 integration)
- Landing page HTML artifact (preview/)
- README, CONTRIBUTING, LICENSE, editor configs

### Still to ship
- Answer composer for daily questions
- Circle info/members screen
- Expo Push notifications (opt-in per circle)
- Agent 2: Recap Writer
- Agent 3: Moderator
- Production landing page deploy

---

Releases will follow [Semantic Versioning](https://semver.org/).
