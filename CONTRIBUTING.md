# Contributing to palmi

Welcome. Before writing code, read this.

## The bar

palmi is a product of choices, and most choices are about what **not** to add. Every pull request is evaluated against the design principles in `README.md`. If you are unsure whether a feature belongs, it probably doesn't.

## Non-negotiable rules

These PRs will be closed without review:

1. **Anything that adds a notification.** Default off. Per-circle opt-in only.
2. **Anything that introduces ranking.** Chronological, newest on top, always.
3. **Anything that adds engagement metrics visible to users.** No follower counts, no view counts, no streak counters.
4. **Anything that uses AI to generate user-facing content in real-time.** The three approved AI agents are the Curator (daily questions), the Recap Writer (monthly summaries), and the Moderator (safety). Nothing else.
5. **Anything that adds a discovery surface.** No trending, no explore, no suggested circles.
6. **Anything that creates a follower graph.** Memberships are the only relationship primitive.

## Code style

- **TypeScript strict mode** with `noUncheckedIndexedAccess`. Every PR must pass `npm run app:typecheck`.
- **Prettier + EditorConfig.** Run `npm run format` before committing.
- **No new dependencies without discussion.** We're trying to keep the app tree lean.
- **SQL migrations are additive.** Never edit a migration that's been committed; write a new one.
- **RLS is mandatory.** Any new table gets RLS policies in the same migration it's defined in. Policies that rely on `auth.uid()` and `is_circle_member()` are the pattern.

## Commit conventions

Follow Conventional Commits:

```
feat(app): add circle info screen
fix(curator): handle timezone strings with slashes
docs(readme): clarify deploy steps
test(curator): cover rate-limit retry path
chore(deps): bump expo to 51.0.8
```

Keep commits atomic. One logical change per commit.

## Pull requests

- Branch from `main` as `brandon/short-description` or `your-name/short-description`.
- PR title in Conventional Commit format.
- PR description answers: *what changed, why, and what did I test*.
- Include screenshots for any UI change.
- For schema changes: include the relevant SQL and a note about backward compatibility.

## Testing expectations

- **Curator changes**: add or update tests in `validator.test.ts` or `integration.test.ts`. Both must pass.
- **Schema changes**: run the migrations against a fresh database and verify.
- **App changes**: run `npm run app:typecheck` and visually verify on a physical device (Expo Go is fine).
- **AI prompt changes**: run `npm run functions:smoke` against at least 10 generations, report the pass rate in the PR description.

## Asking for review

Tag the maintainer in the PR. For questions that don't need code, open a discussion, not an issue.

---

*Build quietly.*
