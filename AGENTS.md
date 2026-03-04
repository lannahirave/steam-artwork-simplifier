# Internal Memo (Codex)

## Version bump on commits

When creating a commit that includes changes under `web/`, bump the web app version first so the header message (`Steam Artwork Studio Vx.y.z`) changes with the commit.

Use:

```bash
cd web
npm version patch --no-git-tag-version
```

Then include both files in the same commit:

- `web/package.json`
- `web/package-lock.json`

## Commit cadence

For every completed part of a job, create a commit before starting the next part.
