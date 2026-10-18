# Changesets

Every PR that changes a published package adds a changeset:

```bash
pnpm changeset
```

Pick the packages and the bump (patch / minor / major) and write a one-line,
user-facing summary. On merge to `main`, the release workflow opens a
"Version packages" PR that bumps versions and updates each package's
CHANGELOG; merging that PR publishes to npm.

The `@gantry/*` packages are versioned together (`fixed`); `ngx-gantry`
is versioned independently.
