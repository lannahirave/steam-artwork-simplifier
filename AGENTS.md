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

## Changelog

`CHANGELOG.md` (repo root) lists user-visible changes, newest first. The Studio's **Changelog**
button shows it in the app (`web/src/components/ChangelogDialog.tsx`, read through the
`virtual:changelog` module in `web/vite.config.ts` and parsed by `web/src/lib/changelog.ts`).

When a change is something users would notice, add it to `CHANGELOG.md` in the same commit:

- Put it under `## [x.y.z] - YYYY-MM-DD` for the version that commit bumps to (or under
  `## [Unreleased] - YYYY-MM-DD` if there is no bump), newest section first.
- Use only `### Added`, `### Changed`, `### Fixed` and `### Removed`, and one-line `- ` bullets with
  plain text, `code` and **bold** (no links, nested bullets or extra headings). The parser and
  `web/src/lib/changelog.test.ts` rely on this format.
- Write what the user can now do or see, in plain words. Leave out internal-only work (refactors,
  tests, CI, docs).
- A new top heading (or a changed date on it) turns the blue dot on the Changelog button back on for
  everyone until they open the changelog (`web/src/changelogStorage.ts`). Adding bullets to the
  existing top section does not.

## Commit cadence

For every completed part of a job, create a commit before starting the next part.

## Branches: `beta` and `main` (Artwork Studio and SteamCanvas)

Both repos in the workspace use the same two-branch flow:

| Repo | Folder | `main` (production) | `beta` (testing) |
|---|---|---|---|
| Steam Artwork Studio, `lannahirave/steam-artwork-simplifier` | `app/` | https://artworkstudio.lannahirave.com | https://artworkstudio-beta.lannahirave.com |
| SteamCanvas fork, `lannahirave/steamcanvas` | `steamcanvas/` | https://previewartwork.lannahirave.com | https://previewartwork-beta.lannahirave.com |
| Demo page (not a git repo) | `demo-site/` serves `deploy/` | https://demoartwork.lannahirave.com | https://demoartwork-beta.lannahirave.com |

- **Work on `beta`.** Commit new work to `beta` in both repos. Deploy only when the user asks:
  `npm run deploy:beta` in `web/` (Studio) or `steamcanvas/` (see `web/wrangler.toml` and
  `steamcanvas/wrangler.jsonc`). Production is `npm run deploy` in either folder.
- **The demo page has no branches.** `deploy/` (built by `bench/chatexport/run-chatexport.mjs`) is
  served by both demo sites. `npm run deploy:beta` in `demo-site/` runs `beta-worker.js`, which points
  the page's links at the beta Studio and beta SteamCanvas and blocks search engines; `npm run deploy`
  serves it as is. So a change to `deploy/` reaches production on the next production deploy: test it on
  beta first. Beta SteamCanvas reads the beta demo (`DEMO_ARTWORK_ORIGIN`).
- **`main` is production.** Promote `beta` to `main` only when the user asks, after both beta sites
  have been tested together.
- **The beta sites talk to each other.** Beta Studio opens the beta SteamCanvas preview
  (`PROFILE_PREVIEW_ORIGIN`), and beta SteamCanvas only accepts the beta Studio
  (`ARTWORK_STUDIO_ORIGIN`). Production pairs with production the same way. A change to the bridge
  between them has to land on `beta` in both repos before either goes to `main`.
- **Beta is not indexed.** `ROBOTS_NOINDEX = "true"` makes both beta sites serve a block-everything
  `robots.txt`. SteamCanvas beta builds also point their AGPL source links at the `beta` branch
  (`__SOURCE_REF__` in `steamcanvas/vite.config.ts`); production builds point at `main`.
- **SteamCanvas upstream.** `steamcanvas/` has two remotes: `origin` (the fork) and `upstream`
  (`dumbapplee/steamcanvas`). Merge `upstream/main` into the fork's `beta`, never straight into `main`,
  and keep the Artwork Studio integration working (the bridge, **Choose from Artwork Studio**, the
  session in the URL, the credits).
- Other branches in `app/` (`experimental-*`, `feat/*`, `security-hardening`, `archive-*`) are old work
  or experiments. `gh-pages` only redirects to the current domain; `netlify` is deprecated and still
  serves an old version (turning it into a redirect is on the roadmap). Do not deploy them.
- Do not push, merge into `main` or deploy unless the user says so.
