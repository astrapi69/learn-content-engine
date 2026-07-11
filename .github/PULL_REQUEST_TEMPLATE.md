## Summary

<!-- What does this PR change, and why? -->

Closes #

## Checklist

- [ ] `make release-check` is green (lint + typecheck + test + build).
- [ ] Behavior/logic changes followed TDD: failing test first, then the fix
      (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
      (`feat:`, `fix:`, `docs:`, ...), one commit per logical change.
- [ ] `schema/*.json` is untouched - or the schema change is deliberate:
      byte baseline + generated types updated in the same commit, changelog
      entry added (see CONTRIBUTING, "Adding a new exercise type").
