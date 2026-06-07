Execute a Kobato release. The user provides a target version number as the argument (e.g., `/release 6.3.0`).

The entire release lifecycle runs automatically: analyze commits, draft notes, bump version, push to develop, fast-forward merge to main, tag and create GitHub release, switch back to develop, prepare next cycle.

## Workflow

Follow these steps in order. Do NOT skip steps or combine them.

### Step 1: Validate preconditions

- Run `git branch --show-current` — must be on `develop`.
- Run `git status --porcelain` — working tree must be clean. If dirty, stop and tell the user to commit or stash.
- Run `node --experimental-strip-types scripts/release.ts since-last` — note the last released tag.

### Step 2: Analyze commits

Run `git log <last-tag>..HEAD --format="%h %s"` to get all commits since the last release.

If there are zero commits, tell the user there's nothing to release and stop.

### Step 3: Study the release notes style

Run `gh release view <last-tag>` to read the most recent release notes body. This is your primary style reference.

Also read the second-most-recent release for additional context: run `gh release view <tag-before-that>`.

Internalize these style rules:
- **Title**: `## Kobato X.Y.Z` (h2, with "Kobato" prefix)
- **Lead paragraph**: 1–2 sentences summarizing the release themes, with **bolded** feature names inline
- **Sections**: Use `###` headers with emoji prefixes — `### ✨ New Features`, `### 🛡️ Security Hardening`, `### 🏗️ Architecture & Refactoring`, `### 🔧 Build & Dependencies`, `### 🐛 Fixes`. Only include sections that have entries. Add extra sections (e.g., `### 🎨 UI Redesign`, `### 🎵 Music Player`) if a thematic grouping makes sense.
- **Sub-headers**: `**Bold Title Case**` to group related items within a section.
- **Bullets**: Each change is a single `-` bullet, concise and technical. Describe what changed and often why. Use sentence case.
- **Language**: English. Technical, precise, no first person.
- **Emojis**: Only as section header prefixes, never inline.
- **Footer**: `**Full Changelog**: [prev...current](https://github.com/syhily/kobato/compare/PREV...CURRENT)` — a clickable markdown link

### Step 4: Draft release notes

Based on the commit analysis and the established style, draft the release notes. Group related commits under thematic sub-headers. Expand terse commit messages into descriptive bullets — the reader should understand *what* changed and *why* without reading the code.

For commits that are purely internal (e.g., `refactor: move X to Y`), collapse related ones into a single bullet rather than listing each individually.

Show the draft to the user and ask for approval or edits. Wait for their response before proceeding.

### Step 5: Bump version

After the user approves the release notes, run:

```
node --experimental-strip-types scripts/release.ts bump <version>
```

where `<version>` is the argument the user provided to `/release`.

Verify the commit was created:
- Run `git log -1 --format="%h %s"` — should show `build: release <version>`.

### Step 6: Publish

Now execute the full publish sequence automatically:

1. `git push origin develop`
2. `git checkout main`
3. `git merge develop --ff-only` — fast-forward merge. If this fails (diverged histories), stop and tell the user to resolve manually.
4. `git push origin main`
5. Write the approved release notes to `/tmp/kobato-release-notes.md`
6. `node --experimental-strip-types scripts/release.ts tag --notes-file /tmp/kobato-release-notes.md` — creates git tag and GitHub release
7. `git checkout develop`
8. `git merge main --ff-only` — sync main back to develop
9. `node --experimental-strip-types scripts/release.ts prepare-next` — bumps to next patch version, sets docker-compose to `latest`
10. `git push origin develop`

After all steps complete, report the release URL and the new development version.

---

## If the user runs `/release:tag` only

Use this when the bump was done separately and the user only wants to tag + publish on main. Runs steps 5–10 from above starting from the current state (expects to be on main with the release commit already present).

## If the user runs `/release:prepare-next` only

Use this when the release is already published and the user only wants to prepare the next dev cycle on develop.

1. Verify on `develop`.
2. `git merge main --ff-only`
3. `node --experimental-strip-types scripts/release.ts prepare-next`
4. `git push origin develop`
