Execute a Kobato release. The user provides a target version number as the argument (e.g., `/release 6.3.0`).

## Workflow

Follow these steps in order. Do NOT skip steps or combine them.

### Step 1: Validate preconditions

- Run `git branch --show-current` — must be on `develop`.
- Run `git status --porcelain` — working tree must be clean. If dirty, stop and tell the user to commit or stash.
- Run `node scripts/release.ts since-last` — note the last released tag.

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
- **Footer**: `**Full Changelog**: \`prev...current\``

### Step 4: Draft release notes

Based on the commit analysis and the established style, draft the release notes. Group related commits under thematic sub-headers. Expand terse commit messages into descriptive bullets — the reader should understand *what* changed and *why* without reading the code.

For commits that are purely internal (e.g., `refactor: move X to Y`), collapse related ones into a single bullet rather than listing each individually.

Show the draft to the user and ask for approval or edits. Wait for their response before proceeding.

### Step 5: Bump version

After the user approves the release notes, run:

```
node scripts/release.ts bump <version>
```

where `<version>` is the argument the user provided to `/release`.

Verify the commit was created:
- Run `git log -1 --format="%h %s"` — should show `build: release <version>`.
- Run `git diff HEAD~1 -- package.json` — version should be `<version>`.
- Run `git diff HEAD~1 -- docker-compose.yml` — image tag should be `<version>`.

### Step 6: Hand off to user

Tell the user:

> Release commit `build: release <version>` is ready on `develop`. Next steps:
>
> 1. Push and create a PR: `develop → main`
> 2. After CI passes and the PR is merged, checkout `main` and run `/release:tag`
> 3. After the release is published, sync `main` back to `develop` and run `/release:prepare-next`

---

## If the user runs `/release:tag`

This step runs on `main` after the release PR is merged.

1. Verify `git branch --show-current` is `main`.
2. Write the approved release notes to a temp file, e.g. `/tmp/kobato-release-notes.md`.
3. Run `node scripts/release.ts tag --notes-file /tmp/kobato-release-notes.md` — this creates the annotated git tag, pushes it, and creates the GitHub release with the notes.
4. Confirm the GitHub release URL.

## If the user runs `/release:prepare-next`

This step runs on `develop` after the release is published.

1. Verify `git branch --show-current` is `develop`.
2. Run `git merge main` — sync main back to develop.
3. Run `node scripts/release.ts prepare-next` — bumps patch version, sets `docker-compose.yml` to `latest`, commits.
4. Confirm the new development version.
