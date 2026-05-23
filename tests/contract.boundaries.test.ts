import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Node-native replacement for the previous `rg --files` shell-out. GitHub's
// `ubuntu-latest` runner does not ship ripgrep, so `execFileSync('rg', …)`
// fails in CI. The argv shape mirrors the original call sites:
//
//   files(path1, path2, …, '-g', '*.ts', '-g', '*.tsx', …)
//
// Positive globs are restricted to the `*.<ext>` shape every existing call
// site uses; if no globs are passed, every file under the given paths is
// returned. Each path argument may be a file or a directory.
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.cache',
  '.turbo',
  'coverage',
  'build',
  'dist',
  '.next',
  '.react-router',
  '.source',
  '.vite',
  '.vite-hooks',
  '.idea',
  '.history',
  'tmp',
])

function walk(root: string, out: string[]): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) {
      continue
    }
    const full = `${root}/${entry.name}`
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
}

function files(...args: string[]): string[] {
  const paths: string[] = []
  const extensions: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-g') {
      const glob = args[++i]
      if (glob !== undefined && glob.startsWith('*.')) {
        extensions.push(glob.slice(1))
      }
      continue
    }
    paths.push(args[i])
  }
  if (paths.length === 0) {
    return []
  }
  const existing = paths.filter((path) => existsSync(path))
  if (existing.length === 0) {
    return []
  }

  const collected: string[] = []
  for (const path of existing) {
    if (statSync(path).isDirectory()) {
      walk(path, collected)
    } else {
      collected.push(path)
    }
  }
  if (extensions.length === 0) {
    return collected
  }
  return collected.filter((file) => {
    const dot = file.lastIndexOf('.')
    return dot !== -1 && extensions.includes(file.slice(dot))
  })
}

describe('contract: module and bundle boundaries', () => {
  it('keeps value imports from @/server out of shared modules', () => {
    const offenders = files('src/shared', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return source.split('\n').some((line) => {
        const trimmed = line.trim()
        return trimmed.startsWith('import') && !trimmed.startsWith('import type') && trimmed.includes('@/server/')
      })
    })

    expect(offenders).toEqual([])
  })

  it('public stylesheet declares the cascade layer order so utilities beat preflight without `!important`', () => {
    // Stage 11 (P2) stripped the historical "fight reset.css with `!`"
    // pattern from every cn() chain on the public site. The promise
    // is that Tailwind utilities land in `@layer utilities` (top of
    // the user-declared layer order), Preflight lands in `@layer
    // base` (bottom of the same order), and per the W3C cascade-
    // layers spec a layered NORMAL `@layer utilities` rule beats a
    // layered NORMAL `@layer base` rule regardless of selector
    // specificity. So ordinary utilities like `pl-5` automatically
    // outrank Preflight's `<ul> { padding-inline-start: 40px }`
    // inheritance reset and don't need `!important` to win.
    //
    // The single load-bearing invariant is the `@layer base,
    // components, utilities;` declaration at the TOP of `public.css`
    // — without it Tailwind would still have its OWN internal layer
    // order but author CSS could land un-layered and beat utilities.
    // Pin the declaration here so a refactor can't silently drop it.
    //
    // Public CSS must also stay free of un-layered author rules
    // (rules outside of `@layer …` and outside of an `@import`).
    // The only un-layered block we tolerate is the medium-zoom
    // `z-index` shim (the medium-zoom NPM package emits its own
    // styles in `@layer base`-equivalent territory and the overlay
    // needs to sit above the rest of the page). Anything else
    // un-layered would risk shadowing Tailwind utilities and
    // resurrect the `!important` fight.
    const globals = readFileSync('src/assets/styles/public.css', 'utf8')
    expect(globals).toMatch(/^\s*@layer\s+base\s*,\s*components\s*,\s*utilities\s*;/m)
    // The Tailwind import must still be present — it's the source
    // of `@layer utilities` and Preflight `@layer base`.
    expect(globals).toMatch(/@import\s+['"]\.\/tailwind\.css['"]/)
  })

  it('keeps optional vendor CSS out of the root stylesheet', () => {
    const source = readFileSync('src/assets/styles/public.css', 'utf8')

    expect(source).not.toContain('bootstrap/dist/css/bootstrap.css')
    expect(source).not.toContain('bootstrap/dist/css/bootstrap-reboot.css')
    expect(source).not.toContain('bootstrap/dist/css/bootstrap-utilities.css')
    expect(source).not.toContain('aplayer-ts/src/css/base.css')
    expect(source).not.toContain('medium-zoom/dist/style.css')
    expect(source).not.toContain('tippy.js')
  })

  it('keeps the Bootstrap npm dep fully retired from the public bundle', () => {
    // The public bundle must not pull anything from `bootstrap/dist/`
    // (the grid was the last surface to retire — its 4011-line
    // `bootstrap-grid.css` is now expressed as Tailwind utility
    // chains directly on the JSX, e.g. `.container` →
    // `mx-auto w-full px-3 sm:max-w-sm …`). The
    // Bootstrap utility ladder (`d-flex`, `me-2`, `text-center`,
    // `sticky-top`, …) and its `_legacy-utilities.css` shim must
    // also stay un-imported.
    const globals = readFileSync('src/assets/styles/public.css', 'utf8')

    // Match real CSS/JS import statements only — comments mentioning
    // `bootstrap/dist/css/bootstrap-grid.css` (the historical retired
    // path documented in the file's header) must not trip these.
    expect(globals).not.toMatch(/^\s*@import\s+['"]bootstrap/m)
    expect(globals).not.toMatch(/^\s*import\s.*from\s+['"]bootstrap/m)
    expect(globals).not.toContain('_legacy-utilities')
    expect(globals).not.toMatch(/bootstrap[^.]*utilities\.css/i)
    expect(
      files('src/assets/styles', '-g', '*.css').filter((file) =>
        /bootstrap.*utilities|utilities.*bootstrap|legacy-utilities/.test(file),
      ),
    ).toEqual([])
  })

  it('keeps the legacy buttons + bootstrap-compat partials AND the temporary components.css shim fully retired', () => {
    // The `.btn` family (the bespoke variant ladder in `buttons.css` +
    // the residual Bootstrap `.btn` reset in `bootstrap-compat.css` +
    // the temporary un-layered shim at `components.css` that briefly
    // consumer is now inlined into a Tailwind utility chain backed by
    // the shared `buttonVariants` CVA in `@/ui/components/button.tsx`. This
    // contract guards every step of that retirement so a future
    // refactor can't silently re-introduce the legacy partials.
    expect(existsSync('src/ui/primitives/buttons.css')).toBe(false)
    expect(existsSync('src/assets/styles/bootstrap-compat.css')).toBe(false)
    expect(existsSync('src/assets/styles/components.css')).toBe(false)

    const globals = readFileSync('src/assets/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*buttons\.css['"]/)
    expect(globals).not.toMatch(/@import\s+['"][^'"]*bootstrap-compat\.css['"]/)
    expect(globals).not.toMatch(/@import\s+['"][^'"]*components\.css['"]/)

    // Stage 11 collapsed the previous string-constant family
    // (`btnBase`, `btnPrimary`, `btnSocial`, …) into a single CVA
    // recipe (`publicButtonVariants`). The legacy constants are
    // intentionally NOT re-exported any more — every call site
    // spreads `{ variant, size, shape }` over the recipe — so the
    // The public-button recipe was unified into the shared
    // `buttonVariants` CVA in `@/ui/components/button.tsx` (serves
    // both admin and public contexts). Pinning the variant/size/shape
    // sets here so a future refactor cannot silently drop, say, the
    // `dark + iconSm + circle` social-rail combo.
    expect(existsSync('src/ui/primitives/btn.ts')).toBe(false)
    const btn = readFileSync('src/ui/components/button.tsx', 'utf8')
    expect(btn).toMatch(/export \{ Button, buttonVariants \}/)
    expect(btn).toMatch(/export interface ButtonProps\b/)
    for (const variant of [
      'default',
      'destructive',
      'destructive-soft',
      'outline',
      'secondary',
      'ghost',
      'link',
      'light',
      'dark',
    ]) {
      expect(btn).toMatch(new RegExp(`${variant}['"]?\\s*:`))
    }
    for (const size of ['default', 'sm', 'lg', 'icon', 'iconSm', 'iconMd', 'iconLg']) {
      expect(btn).toMatch(new RegExp(`\\b${size}:`))
    }
    for (const shape of ['default', 'circle', 'pill', 'block']) {
      expect(btn).toMatch(new RegExp(`\\b${shape}:`))
    }

    // Source-of-truth for the `28%` icon-inset magic number — every
    // icon-button consumer reads it through `m-icon-inset`.
    const tailwindCss = readFileSync('src/assets/styles/tailwind.css', 'utf8')
    expect(tailwindCss).toMatch(/--spacing-icon-inset:\s*28%;/)
  })

  it('keeps the legacy cards + lists partials fully retired', () => {
    // `cards.css` and `lists.css` are gone. Every `.block` /
    // `.list-*` / `.media` / `.overlay` / `.list-nice-overlay` /
    // `.list-bookmarks` / `.list-grid` / `.text-muted` /
    // `.list-title.h5/.h6` / `.list-grouped` rule was inlined into
    // the matching JSX as a Tailwind utility chain (stages 6e-6k).
    // The dark-overlay metadata colour `#eaecf3` that used to live
    // in lists.css's `.list-nice-overlay .text-muted:not(i)`
    // override is now a first-class semantic token (`--ink-5`
    // raw hex + `--color-ink-5` `@theme` alias); PostSquare
    // reads it as `text-ink-5`. Re-introducing either partial would
    // silently shadow the inlined chains because the legacy
    // partials would have to come back un-layered (un-layered beats
    // `@layer utilities` per the W3C cascade-layers spec, lesson 2);
    // this contract makes the regression visible at PR time instead.
    expect(existsSync('src/ui/primitives/cards.css')).toBe(false)
    expect(existsSync('src/ui/primitives/lists.css')).toBe(false)

    const globals = readFileSync('src/assets/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*cards\.css['"]/)
    expect(globals).not.toMatch(/@import\s+['"][^'"]*lists\.css['"]/)

    // The `--color-ink-5` token lives in `tailwind.css`
    // (theme alias) backed by `--ink-5` (`#eaecf3`) in the
    // semantic `:root` block. Both must stay registered because
    // PostSquare reads the alias as `text-ink-5`.
    const tailwindCss = readFileSync('src/assets/styles/tailwind.css', 'utf8')
    expect(tailwindCss).toMatch(/--ink-5:\s*#eaecf3;/)
    expect(tailwindCss).toMatch(/--color-ink-5:\s*var\(--ink-5\);/)

    // Scan every public source file for residual className tokens
    // that would only resolve through the deleted partials. We strip
    // line and block comments first so the assertion fires on real
    // markup, not on documentation that legitimately references the
    // retired classes (e.g. `public.css` retired-partials index).
    //
    // The boundary character class `[^A-Za-z0-9_:-]` is intentionally
    // strict: `\b` would treat `:` as a word boundary, so the bare
    // `block` rule would mis-fire on the Tailwind `block` /
    // `md:block` utility chain. Same for `overlay` (the
    // legitimate `replying-to-overlay` and `aside-overlay` chrome
    // classes) and `text-muted` (shadcn's `text-muted-foreground`).
    // Each banned token must be flanked on both sides by something
    // that cannot appear inside a className identifier (`-`, `:`, or
    // alphanumeric) — i.e. a quote, whitespace, `=`, etc.
    const offenders: string[] = []
    // `cards.css` `.block` card-layout helper coming back. After
    // utility writes the same className literal, so a "no bare
    // `block`" check would mis-fire on every `<div className=
    // "block">` in the codebase. The check is removed; the
    // surviving `existsSync('src/ui/primitives/cards.css') ===
    // false` + the `@import './cards.css'` absence assertions
    // above already pin the partial as fully retired, and the
    // `bannedClassTokens` list catches every NON-Tailwind
    // remnant (the cards.css `.block` helper had no peer in
    // Tailwind, so its return would still surface through some
    // companion class like `list-content` / `list-grouped`).
    const bannedClassTokens = [
      'list-item',
      'list-content',
      'list-body',
      'list-title',
      'list-grouped',
      'list-bookmarks',
      'list-nice-overlay',
      'list-grid',
      'list-desc',
      'list-meta',
      'list-footer',
      'list-subtitle',
      'list-gogogo',
      'h-1x',
      'h-2x',
      'h-3x',
      'data-null',
    ]
    // `media`, `overlay`, and `text-muted` are common substrings that
    // legitimately appear in variable names (`media`), other chrome
    // classes (`replying-to-overlay`, `aside-overlay`), or shadcn
    // utility tokens (`text-muted-foreground`, `text-muted-
    // foreground`). We only ban each as a standalone className token.
    const ambiguousClassTokens = ['media', 'overlay', 'text-muted']
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      const hit = bannedClassTokens.find((token) =>
        new RegExp(`(?<![A-Za-z0-9_-])${token}(?![A-Za-z0-9_-])`).test(stripped),
      )
      if (hit !== undefined) {
        offenders.push(`${file} (${hit})`)
        continue
      }
      const ambiguous = ambiguousClassTokens.find((token) =>
        new RegExp(
          `class(?:Name)?\\s*=\\s*["'\`][^"'\`]*(?<![A-Za-z0-9_:-])${token}(?![A-Za-z0-9_:-])[^"'\`]*["'\`]`,
        ).test(stripped),
      )
      if (ambiguous !== undefined) {
        offenders.push(`${file} (${ambiguous} className)`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the legacy navigation partial fully retired', () => {
    // `src/ui/primitives/navigation.css` is gone. The whole public
    // chrome state machine is now React-driven — `<header>` carries
    // `data-state="open" | "closed"` and Tailwind v4's
    // `max-lg:data-[state=open]:` / `group-data-[state=open]/
    // aside:` named-group variants paint the mobile drawer (Header.tsx,
    // `.navbar-brand`, `.mobile-brand`, `.menu-toggler`, `.site-menu`,
    // `.site-submenu`, `.button-social`, `.content-wrapper`, `.sidebar`
    // — the public `<aside>` rail; `.sidebar` as a Tailwind theme
    // token / shadcn semantic colour like `bg-sidebar` is NOT
    // banned —, `.site-layout`, `.site-main`) is inlined into JSX as
    // a Tailwind utility chain. The single shared social-button
    // wrapper now lives in `@/ui/primitives/btn.ts` as the
    // `publicButtonVariants({ variant: 'dark', size: 'iconSm',
    // shape: 'circle' })` combo (covered by the buttons describe
    // above). Re-introducing the
    // partial would silently shadow the inlined chains because the
    // legacy partial would have to come back un-layered, and
    // un-layered normal declarations beat `@layer utilities` per the
    // W3C cascade-layers spec; this contract makes the regression
    // visible at PR time instead. The new `--z-aside-drawer: 1020`
    // raw token (`_tokens.css`) backs the drawer's stacking
    // context — Tailwind v4 has no `--z-*` theme namespace, so
    // Header.tsx reaches it via the arbitrary-value reference
    // `z-(--z-aside-drawer)`; this contract pins the token so a
    // future cleanup can't drop it without replacing the consumer.
    expect(existsSync('src/ui/primitives/navigation.css')).toBe(false)

    const globals = readFileSync('src/assets/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*navigation\.css['"]/)

    // The drawer-stacking token is the public chrome's only
    // first-class consumer; pin it so the consumer (Header.tsx
    // `asideShellClass`) keeps resolving.
    const tokens = readFileSync('src/assets/styles/tailwind.css', 'utf8')
    expect(tokens).toMatch(/--z-aside-drawer:\s*1020;/)

    // Scan every public source file for residual className tokens
    // that would only resolve through the deleted partial. Strip
    // line and block comments first so the assertion fires on real
    // markup, not the documentation that legitimately references
    // the retired classes (e.g. `public.css` retired-partials
    // index, `reset.css` cap-comment block).
    const offenders: string[] = []
    const bannedClassTokens = [
      'site-aside',
      'aside-inner',
      'navbar-brand',
      'mobile-brand',
      'menu-toggler',
      'site-menu',
      'site-submenu',
      'button-social',
      'content-wrapper',
      'site-layout',
      'site-main',
    ]
    // `sidebar` is a special case: shadcn's design-system semantic
    // colour group ships `bg-sidebar`, `text-sidebar-foreground`,
    // `border-sidebar-border` etc., which would all fire under a
    // bare `(?<![A-Za-z0-9_-])sidebar(?![A-Za-z0-9_-])` className
    // scan because the `` prefix and the trailing `-foreground`
    // sit OUTSIDE the className-token pattern. We instead ban the
    // exact bare `sidebar` className word — a literal `className="
    // sidebar"` or whitespace-flanked occurrence inside any class
    // attribute (matching the legacy `<aside className="sidebar
    // `search-sidebar` (search compound) are unaffected because the
    // boundary class fires on `-`/`_`/alphanumerics flanking
    // `sidebar`. (`sidebar-inner` retired with the `sidebar.css`
    // marker; the per-partial sidebar contract below pins its
    // utility-chain replacement.)
    const bareSidebar = /class(?:Name)?\s*=\s*["'`][^"'`]*(?:^|\s)sidebar(?:\s|$)[^"'`]*["'`]/
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      if (bareSidebar.test(stripped)) {
        offenders.push(`${file} (bare 'sidebar' className)`)
        continue
      }
      const hit = bannedClassTokens.find((token) =>
        new RegExp(`(?<![A-Za-z0-9_-])${token}(?![A-Za-z0-9_-])`).test(stripped),
      )
      if (hit !== undefined) {
        offenders.push(`${file} (${hit})`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the legacy popup partial fully retired', () => {
    // The `popup.css` partial is gone: every dimension, color,
    // shadow, transition and close-button cursor cue is now expressed
    // as Tailwind utilities backed by the popup-token block in
    // `tailwind.css`. No JSX (or any non-comment source) writes a
    // `nice-popup` / `nice-popup-close` / `nice-popup-content`
    // className. Re-introducing the partial would silently shadow the
    // inlined utility chains because un-layered partials beat every
    // `@layer utilities` rule per the W3C cascade-layers spec; this
    // contract makes the regression visible at PR time instead.
    expect(existsSync('src/ui/primitives/popup.css')).toBe(false)

    const globals = readFileSync('src/assets/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/popup\.css/)

    const offenders: string[] = []
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      // Strip line comments and block comments before scanning so the
      // assertion fires only on real code. Block comments span lines,
      // so do them first; then collapse `//` line comments.
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      if (/\bnice-popup(?:-[a-z]+)*\b/.test(stripped)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the legacy media partial fully retired', () => {
    // `media.css` is gone. The base `.media` wrapper rule moved to
    // `lists.css` (where the existing `.list-grid .media` /
    // `.list-nice-overlay .media` descendants already live); every
    // variant flavour (`.media-overlay`, `.media-content`,
    // `.media-3x*`, `.media-36x17`, `.overlay-top`) and the
    // `.nav-links` / `.page-numbers` pagination chrome was inlined
    // into JSX as Tailwind utility chains. Re-introducing any of those
    // classnames would silently shadow the inlined chains because the
    // legacy partial would have to come back un-layered (un-layered
    // beats `@layer utilities` per the W3C cascade-layers spec); this
    // contract makes the regression visible at PR time instead.
    expect(existsSync('src/ui/primitives/media.css')).toBe(false)

    const globals = readFileSync('src/assets/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*media\.css['"]/)

    const offenders: string[] = []
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      if (
        /\bmedia-(?:overlay|content|3x[12]|36x17)\b/.test(stripped) ||
        /\boverlay-top\b/.test(stripped) ||
        /\bnav-links\b/.test(stripped) ||
        /\bpage-numbers\b/.test(stripped)
      ) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the legacy forms partial fully retired', () => {
    // `forms.css` is gone. Its sole remaining rule (`.flex-avatar` and
    // its `<img>` descendant — the `.form-control*` family had already
    // into the two avatar wrappers under `@/ui/public/comments/`:
    //
    //   - `CommentItem.tsx` 的 thread-row avatar wrapper
    //   - `CommentReplyForm.tsx` 的 form-level avatar wrapper
    //
    // Both wrappers now carry the utility chain
    //   relative flex shrink-0 items-center
    //   justify-center rounded-full leading-none
    //   font-semibold whitespace-nowrap
    // and the inner `<img>` carries `w-full rounded-full`
    // (replacing the descendant rule `.flex-avatar img { border-radius:
    // inherit; width: 100% }`). Re-introducing the partial would
    // silently shadow the inlined chains because the legacy partial
    // would have to come back un-layered, and un-layered普通 declarations
    // beat `@layer utilities` per the W3C cascade-layers spec; this
    // contract makes the regression visible at PR time instead.
    expect(existsSync('src/ui/primitives/forms.css')).toBe(false)

    const globals = readFileSync('src/assets/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*forms\.css['"]/)

    const offenders: string[] = []
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      if (/\bflex-avatar\b/.test(stripped)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the legacy sidebar partial fully retired', () => {
    // `src/ui/sidebar/sidebar.css` is gone. Every widget body, every
    // tag-cloud chip, the search-form chrome, the like-count chips
    // and the fixed-widget rail are now expressed as named `cn()`
    // utility chains on their consuming components:
    //
    //   - `Sidebar.tsx` owns `sidebarInnerClass`, `widgetClass`,
    //     `widgetTitleClass`, `widgetListClass`, `widgetListItemClass`,
    //     `widgetEntryLinkClass`, `widgetCommentLinkClass`,
    //     `commentAuthorLinkClass`, `tagcloudClass`, `tagcloudLinkClass`.
    //   - `Search.tsx` owns `sidebarSearchInputClass`.
    //   - `PostListViews.tsx` owns `listLikeClass`, `listLikeSquareClass`,
    //     `likeCountClass`.
    //   - `BaseLayout.tsx` carries the inline `fixed right-5
    //     bottom-5 z-9999 transform-gpu` chain on the floating
    //     widget rail `<ul>`.
    //   - `ScrollTopButton.tsx` carries the inline opacity /
    //     `pointer-events-none` toggle (NOT a `display` swap — see
    //     the file's own write-up on the iOS-Safari rendering ghost)
    //     on its `<li>`, plus `transform-gpu` for GPU-layer
    //     promotion.
    //
    // The two `:before` decorations that used to be the lone
    // exceptions — `.widget-title:before` (the 30×2px brand bar
    // above each widget heading) and `.tagcloud > a:before` (the
    // `'#'` prefix on each tag chip) — have been folded back into
    // the consumer through Tailwind v4's `before:` variant chain
    // (`widgetTitleClass` and `tagcloudLinkClass` in `Sidebar.tsx`).
    // `public.css`'s `@layer components` block is therefore empty
    // and gone; the only surviving rule in `public.css` is the
    // `.medium-zoom-overlay` z-index pin for the third-party
    // medium-zoom widget. The legacy `.screen-reader-text` a11y
    // helper has been retired in favour of Tailwind's built-in
    // `sr-only` utility (see `Pagination.tsx`). Re-introducing the
    // sidebar partial would silently shadow every inlined chain
    // because the legacy partial would have to come back un-layered
    // (un-layered普通 declarations beat `@layer utilities` per the
    // W3C cascade-layers spec); this contract makes the regression
    // visible at PR time instead.
    expect(existsSync('src/ui/sidebar/sidebar.css')).toBe(false)

    const globals = readFileSync('src/assets/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*sidebar\.css['"]/)

    // The previously-pinned `:before` exceptions are now banned
    // from `public.css` — they belong to `Sidebar.tsx`'s
    // `widgetTitleClass` / `tagcloudLinkClass` `before:` chains
    // and must not silently regrow a CSS twin (which would
    // double-paint the decoration). The `@layer components` block
    // that used to host them is fully retired.
    expect(globals).not.toMatch(/\.widget-title:before\b/)
    expect(globals).not.toMatch(/\.tagcloud\s*>\s*a:before\b/)
    expect(globals).not.toMatch(/@layer\s+components\s*\{/)
    expect(globals).not.toMatch(/\.screen-reader-text\b/)

    // Pin the two `before:` chains on `Sidebar.tsx` so a future
    // cleanup can't drop them without realising it deletes the
    // bar/`#` decorations entirely. The matchers are intentionally
    // anchored on the literal `content: …` payloads (the value that
    // actually paints the decoration) rather than on the full chain.
    const sidebarSource = readFileSync('src/ui/public/Sidebar.tsx', 'utf8')
    expect(sidebarSource).toMatch(/before:content-\['']/)
    expect(sidebarSource).toMatch(/before:content-\['#']/)

    // No `.css` partial under `src/` may redefine the inlined
    // selectors. (`.like-count` is a special case — `post.css`'s
    // sidebar-scoped `.list-like .like-count` and `.list-like-square
    // .like-count` rules retired here. We pin the bare-`.list-like`
    // and `.list-like-square` parents instead.)
    const partialOffenders: string[] = []
    const bannedSelectors = [
      /\.sidebar-inner\s*\{/,
      /\.widget\s*\{/,
      /\.widget-title\s*\{/,
      /\.widget-search\b/,
      /\.widget-recent-(?:entries|comments)\b/,
      /\.tagcloud\s*\{/,
      /\.tagcloud\s+a\b/,
      /\.list-like(?:-square)?\s*\{/,
      /\.list-like(?:-square)?\s+\.like-count\b/,
      /\.site-fixed-widget\b/,
      /\.search-field\b/,
    ]
    for (const file of files('src', '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '')
      const hit = bannedSelectors.find((re) => re.test(stripped))
      if (hit !== undefined) {
        partialOffenders.push(`${file} (${hit})`)
      }
    }
    expect(partialOffenders).toEqual([])
  })
  it('keeps client utilities independent from UI component modules', () => {
    const offenders = files('src/client', 'src/shared', '-g', '*.ts').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return source.includes('@/ui/')
    })

    expect(offenders).toEqual([])
  })

  it('keeps UI and client modules from importing server/runtime data modules', () => {
    const offenders = files('src/ui', 'src/client', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return source.split('\n').some((line) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('import')) {
          return false
        }
        // `import type` lines erase at compile time and never reach the
        // client bundle — they only flow type signatures (e.g. the oRPC
        // `ApiRouter` type that the client.ts pulls to type the
        // `createORPCClient<ApiRouter>` call site). Runtime imports of
        // `@/server/**` are still banned.
        if (trimmed.startsWith('import type ') || trimmed.startsWith('import type{')) {
          return false
        }
        return trimmed.includes('@/server/') || /\.server(?:["']|$)/.test(trimmed)
      })
    })

    expect(offenders).toEqual([])
  })

  it('keeps the static `@/blog.config` import out of the codebase entirely', () => {
    // The static config tree (`src/blog.config.ts`, `DEFAULT_SETTINGS`,
    // `BlogConstants`) was deleted alongside the install-flow refactor.
    // Every consumer now reaches the live values through
    // `requireBlogSettingsSection()` (server) or the per-section
    // hooks like `useFooterSettings()` (UI).
    const offenders = files('src', 'tests', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /from\s+["']@\/blog\.config["']/.test(source)
    })
    expect(offenders).toEqual([])
  })

  it('keeps the retired blog-config snapshot shim out of the codebase', () => {
    expect(existsSync('src/shared/blog-config-snapshot.ts')).toBe(false)

    const offenders = files('src', 'tests', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /from\s+["']@\/shared\/blog-config-snapshot["']/.test(source)
    })

    expect(offenders).toEqual([])
  })

  it('keeps blog settings provider split by section context', () => {
    const source = readFileSync('src/shared/lib/blog-config-context.tsx', 'utf8')

    // The contexts file now derives one context per `BUNDLE_KEYS`
    // entry through a `makeContext('<key>')` factory instead of 12
    // hand-written `createContext` calls. The split is still
    // per-section — we just generate the surface from the canonical
    // listing in `@/shared/config/settings`. Assert the derivation is in
    // place by checking the registry entries (one per section,
    // including the new `rateLimit` slot) and the absence of any
    // monolithic bundle context.
    expect(source).toContain('SECTION_CONTEXTS')
    expect(source).toContain("makeContext('siteIdentity')")
    expect(source).toContain("makeContext('cache')")
    expect(source).toContain("makeContext('rateLimit')")
    expect((source.match(/makeContext\(/g) ?? []).length).toBeGreaterThanOrEqual(12)
    expect(source).not.toContain('BlogSettingsBundleContext')
  })

  it('routes every settings form through the unified react-hook-form wrapper', () => {
    // All settings forms go through `useSettingsCard` which owns the
    // react-hook-form lifecycle (dirty tracking, zod validation, save,
    // revert). Guard against accidental re-introduction of hand-rolled
    // `useState<TState>` + `setSnapshot(draft)` patterns.
    const source = readFileSync('src/ui/admin/settings/shell/useSettingsCard.tsx', 'utf8')

    expect(source).toContain('useForm<TState>')
    expect(source).toContain('zodResolver(schema as never)')
    expect(source).not.toContain('submittedDraftRef')
    expect(source).not.toContain('setSnapshot(')

    // Every settings form delegates to `useSettingsCard`; none of them
    // imports `useForm` directly (which would bypass the shared dirty /
    // status / save / revert pipeline). `GeneralForm` may still import
    // `useFieldArray` to drive its `keywords` array, but `useForm`
    // itself only lives in the hook.
    const formFiles = [
      'src/ui/admin/settings/AssetsForm.tsx',
      'src/ui/admin/settings/CommentsForm.tsx',
      'src/ui/admin/settings/ContentForm.tsx',

      'src/ui/admin/settings/GeneralForm.tsx',
      'src/ui/admin/settings/MailForm.tsx',
      'src/ui/admin/settings/SearchForm.tsx',
      'src/ui/admin/settings/SeoForm.tsx',
      'src/ui/admin/settings/SidebarForm.tsx',
    ]
    for (const file of formFiles) {
      const formSource = readFileSync(file, 'utf8')
      expect(formSource).toMatch(/useSettingsCard/)
      // Direct `import { useForm } from 'react-hook-form'` would mean
      // the form is duplicating the wrapper's lifecycle.
      // `useFieldArray` is allowed (consumed via the wrapper's `form.control`).
      expect(formSource).not.toMatch(/import\s*\{[^}]*\buseForm\b[^}]*\}\s*from\s*['"]react-hook-form['"]/)
      // The wrapper's exit point: `useRevalidator` belongs to
      // `useSettingsFetcher`, which is reached through the wrapper.
      // `MailForm` is allowed to import `useFetcher` from `react-router`
      // for the secondary "send test mail" button — that channel is
      // independent of the section-update channel and shouldn't be
      // routed through `useSettingsFetcher`.
      expect(formSource).not.toMatch(/import\s*\{[^}]*\buseRevalidator\b[^}]*\}\s*from\s*['"]react-router['"]/)
    }
  })

  it('keeps non-type catalog imports out of UI components', () => {
    const offenders = files('src/ui', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return source.split('\n').some((line) => {
        const trimmed = line.trim()
        return (
          trimmed.startsWith('import') &&
          !trimmed.startsWith('import type') &&
          trimmed.includes('"@/shared/types/catalog"')
        )
      })
    })

    expect(offenders).toEqual([])
  })

  it('keeps Luxon out of client-facing chrome and date formatter paths', () => {
    const clientFacing = [
      ...files('src/ui', '-g', '*.ts', '-g', '*.tsx'),
      'src/shared/utils/formatter.ts',
      'src/server/http/loaders/sidebar.ts',
      'src/routes/public/home.tsx',
    ]
    const offenders = clientFacing.filter((file) => readFileSync(file, 'utf8').includes('luxon'))

    expect(offenders).toEqual([])
  })

  it('keeps source relative imports inside the documented allowlist', () => {
    const explicitAllowed = [
      {
        key: 'vite.config.ts -> ./src/server/infra/hono/dev.ts',
        file: 'vite.config.ts',
        specifier: './src/server/infra/hono/dev.ts',
      },
      // (routes.ts no longer imports api-actions since all API routes moved to Hono)
    ] as const
    const explicitAllowedHits = new Set<string>()

    const allowed = (file: string, specifier: string): boolean => {
      if (specifier.startsWith('./+types/')) {
        return true
      }

      const explicit = explicitAllowed.find((entry) => entry.file === file && entry.specifier === specifier)
      if (explicit) {
        explicitAllowedHits.add(explicit.key)
        return true
      }
      return false
    }

    const offenders: string[] = []
    const importRe = /from\s+["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g
    for (const file of files('src', 'vite.config.ts', 'react-router.config.ts', '-g', '*.ts', '-g', '*.tsx')) {
      const source = readFileSync(file, 'utf8')
      let match: RegExpExecArray | null
      while ((match = importRe.exec(source)) !== null) {
        const specifier = match[1] ?? match[2]
        if (!allowed(file, specifier)) {
          offenders.push(`${file}: ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
    expect(explicitAllowed.map((entry) => entry.key).filter((key) => !explicitAllowedHits.has(key))).toEqual([])
  })

  it('keeps src/routes.ts project imports relative because aliases are unavailable there', () => {
    const source = readFileSync('src/routes.ts', 'utf8')
    const importSpecifiers = [...source.matchAll(/(?:from\s+|import\(\s*)["']([^"']+)["']/g)].map((match) => match[1])
    const aliasedProjectImports = importSpecifiers.filter(
      (specifier) => specifier.startsWith('@/') || specifier.startsWith('~/'),
    )

    expect(aliasedProjectImports).toEqual([])
    // routes.ts no longer imports api-actions since all API routes moved to Hono
  })

  it('keeps DOM/script islands out of the tree (React only)', () => {
    // Public interactivity now lives in React hooks/components. Guard the
    // regression by asserting the legacy vanilla script tree stays empty.
    const legacy = files('src/assets/scripts', '-g', '*.ts')
    expect(legacy).toEqual([])
  })

  it('documents React islands instead of the removed src/assets/scripts tree', () => {
    const agents = readFileSync('AGENTS.md', 'utf8')
    expect(agents).toContain('`src/assets/scripts` is intentionally absent')
    expect(agents).not.toContain('src/assets/scripts/**/*.ts')
    expect(agents).not.toContain('Do not remove existing browser scripts')
  })

  it('keeps domain Zod schemas out of db/types', () => {
    const source = readFileSync('src/server/infra/db/types.ts', 'utf8')
    expect(source).not.toContain('db/types/auth')
    expect(source).not.toContain('db/types/comment')
  })

  it('keeps fonts off the repo and out of every CSS bundle (everything flows through blog.fonts admin settings)', () => {
    const globals = readFileSync('src/assets/styles/public.css', 'utf8')
    const root = readFileSync('src/root.tsx', 'utf8')

    // The repo must not ship any TTF/WOFF2 binary or pre-baked font CSS.
    // Fonts live entirely on the configured CDN, referenced at runtime by
    // the admin-editable URLs in `blog.fonts`.
    expect(files('src/assets/fonts', '-g', '*.ttf', '-g', '*.woff2', '-g', '*.css')).toEqual([])

    // No local CSS reference any of the historical chunk filenames.
    expect(globals).not.toContain('opposans.css')
    expect(globals).not.toContain('opposerif.css')
    expect(globals).not.toContain('iosevka.css')

    // Root must not statically import any `.ttf` (the removed
    // `vite-plugin-font` rewrite path) — every font stylesheet now
    // arrives as a runtime `<link>` driven off `useFontsSettings()`.
    expect(root).not.toContain("from '@/assets/fonts/")
    expect(root).not.toContain("import '@/assets/fonts/")
    expect(root).not.toContain('.ttf')

    // Root reads `globalCss` from the loader bundle and emits `<link>`s
    // for each entry. Anchor the contract on the array access so a
    // future refactor that drops the per-section read jumps out here.
    expect(root).toContain('blogSettings?.fonts?.globalCss')
    expect(root).toContain('<link key={url} rel="stylesheet" href={url} />')
  })

  it('keeps admin Tailwind layouts on flex/grid gap instead of space utilities', () => {
    const offenders = files('src/ui/admin', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /space-[xy]-/.test(source)
    })

    expect(offenders).toEqual([])
  })

  it('keeps screen-reader helpers visually hidden instead of display-none', () => {
    // The legacy `.screen-reader-text` helper has been retired —
    // every consumer now uses Tailwind's built-in `sr-only` utility,
    // whose recipe (`clip-path: inset(50%); position: absolute; …`)
    // is shipped by the framework. `display: none` would hide the
    // helper from screen readers too — the assertion below explicitly
    // bans any user-authored partial from re-overriding `sr-only`
    // with that anti-pattern, and pins that the retired class is not
    // resurrected in `public.css`.
    const source = readFileSync('src/assets/styles/public.css', 'utf8')

    expect(source).not.toMatch(/\.screen-reader-text\b/)
    expect(source).not.toMatch(/\.sr-only\s*\{[^}]*display:\s*none/s)
  })

  it('does not pass hex design tokens through rgba(var(...))', () => {
    const offenders = files('src/assets/styles', '-g', '*.css').filter((file) =>
      /rgba\(\s*var\(--/.test(readFileSync(file, 'utf8')),
    )

    expect(offenders).toEqual([])
  })

  it('keeps raw arbitrary colors out of non-admin Tailwind surfaces', () => {
    const offenders = files('src/ui', 'src/routes', '-g', '*.ts', '-g', '*.tsx')
      .filter(
        (file) =>
          !file.startsWith('src/ui/admin/') &&
          !file.startsWith('src/routes/auth/') &&
          !file.startsWith('src/routes/admin/'),
      )
      .filter((file) => /(?:bg|text|border)-\[#/.test(readFileSync(file, 'utf8')))

    expect(offenders).toEqual([])
  })

  it('keeps Base UI select and dropdown items inside group wrappers', () => {
    const select = readFileSync('src/ui/components/select.tsx', 'utf8')
    const dropdown = readFileSync('src/ui/components/dropdown-menu.tsx', 'utf8')

    expect(select).toContain('<SelectGroup>{children}</SelectGroup>')
    expect(dropdown).toContain('<DropdownMenuGroup>{children}</DropdownMenuGroup>')
  })

  it('sizes Button icons through data-icon instead of hand-written size classes', () => {
    const button = readFileSync('src/ui/components/button.tsx', 'utf8')
    const offenders: string[] = []

    expect(button).toContain('[&_[data-icon]]')

    for (const file of files('src/ui/admin', '-g', '*.tsx')) {
      const source = readFileSync(file, 'utf8')
      for (const chunk of source.split(/<Button\b/).slice(1)) {
        const end = chunk.indexOf('</Button>')
        if (end === -1) {
          continue
        }
        const block = chunk.slice(0, end)
        if (/<[A-Z][A-Za-z0-9]*Icon\b[^>]*className=["'][^"']*size-/.test(block)) {
          offenders.push(file)
          break
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('forbids template-literal `className=` strings under src/ui in favour of cn()', () => {
    // Hand-rolled `className={`a ${x ? 'b' : ''}`}` patterns silently
    // produce stray spaces, miss the dedupe `tailwind-merge` provides,
    // and bypass the `cn()` prefix audit. `cn()` (`@/ui/lib/cn`)
    // handles all three. The matcher excludes `${ctx.placement}` style
    // *interpolated suffixes* in tooltip placement keys etc., which
    // legitimately read better as a single template — those callers
    // wrap the placement substitution in `cn()` (see Tooltip.tsx) so
    // the *outer* attribute itself is no longer a bare template.
    const offenders: string[] = []
    for (const file of files('src/ui', '-g', '*.tsx')) {
      const source = readFileSync(file, 'utf8')
      // Match `className={` immediately followed by a backtick. Any
      // call site that wraps the template in `cn(`…`)` already starts
      // with `className={cn(` and is exempt.
      if (source.includes('className={`')) {
        offenders.push(file)
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps the wp-decoy status text mirrored between server and ErrorView', () => {
    // `src/ui/public/chrome/ErrorView.tsx` lives under `src/ui/` so it may not
    // import from `src/server/`. The literal `'Not WordPress'` is
    // duplicated so the UI module stays boundary-clean; this test makes
    // sure the two copies agree.
    const server = readFileSync('src/server/http/middlewares/wp-decoy.ts', 'utf8')
    const ui = readFileSync('src/ui/public/chrome/ErrorView.tsx', 'utf8')

    expect(server).toContain("export const NOT_WORDPRESS_STATUS_TEXT = 'Not WordPress'")
    expect(ui).toContain("const NOT_WORDPRESS_STATUS_TEXT = 'Not WordPress'")
  })

  it('keeps solution math scrollable instead of clipping long formulas', () => {
    // Display math overflow lives in the `@utility prose-blog` tree in
    // `tailwind.css`, so the brand typography utility owns the whole
    // post-content surface in one place. The MDX `<Solution>` clip-on-hidden
    // rule must never come back in either file.
    const publicCss = readFileSync('src/assets/styles/public.css', 'utf8')
    const tailwindCss = readFileSync('src/assets/styles/tailwind.css', 'utf8')

    expect(publicCss).not.toMatch(/\.post-content \.solution\s*{[^}]*overflow:\s*hidden/s)
    expect(tailwindCss).not.toMatch(/\.post-content \.solution\s*{[^}]*overflow:\s*hidden/s)
    expect(tailwindCss).toContain(':where(.math-display)')
    expect(tailwindCss).toContain('overflow-x: auto')
  })

  it('routes post / comment typography through @tailwindcss/typography', () => {
    // The legacy giant `.post-content { … }` / `.comment-content { … }`
    // declarations in `public.css` are gone — typography is now
    // expressed as a `@utility prose-blog` block consumed by the JSX
    // carriers (`PostDetailBody`, `PageDetailBody`,
    // `CommentItem.commentContentClass`) via the `prose prose-blog`
    // class chain. The standalone `src/ui/post/post.css` partial was
    // folded back into `public.css`, so the only post-content CSS
    // partial is the inline block right after `@utility prose-blog`.
    // This contract makes both invariants visible at PR time.
    const publicCss = readFileSync('src/assets/styles/public.css', 'utf8')
    const tailwindCss = readFileSync('src/assets/styles/tailwind.css', 'utf8')
    const commentItem = readFileSync('src/ui/public/comments/comment-item/helpers.ts', 'utf8')

    expect(publicCss).not.toMatch(/^\s*\.post-content\s*\{/m)
    expect(publicCss).not.toMatch(/^\s*\.comment-content\s*\{/m)
    // The `@utility prose-blog { … }` block lives in `tailwind.css`
    // (which `public.css` `@import`s at the bottom) and now owns every
    // `.post-content` / `.comment-content` descendant rule via nested
    // `&.post-content :where(…)` / `&.comment-content :where(…)`
    // compounds. Pin the location so a future cleanup can't silently
    // smear the utility back into `public.css`.
    expect(tailwindCss).toMatch(/@utility\s+prose-blog\s*\{/)
    expect(tailwindCss).toMatch(/&\.post-content\s*\{/)
    expect(tailwindCss).toMatch(/&\.comment-content\s*\{/)
    // The standalone `src/ui/post/post.css` partial is gone; everything
    // it owned now lives directly in `public.css`.
    expect(publicCss).not.toMatch(/@import\s+['"][^'"]*ui\/post\/post\.css['"]/)
    expect(existsSync('src/ui/post/post.css')).toBe(false)

    expect(tailwindCss).toContain("@plugin '@tailwindcss/typography'")
    expect(tailwindCss).toMatch(/--code-bg:\s*rgb\(253,\s*246,\s*227\);/)

    // P7 (Stage 11) collapsed the previously hand-maintained 16+16
    // light/invert prose-colour ladders into a shared
    // `--prose-blog-*` slot table. Each `--tw-prose-*` light var
    // and its `--tw-prose-invert-*` partner now both read from the
    // same `--prose-blog-<slot>` source; the public site renders
    // light prose only, so the invert ladder mirrors light by
    // default and an `&.dark` override (or specifically the invert
    // vars) re-enters here if a dark surface ever lands. Pin the
    // shared ladder + the light/invert fan-out so a regression
    // can't re-introduce a hand-maintained twin.
    for (const slot of [
      'body',
      'headings',
      'lead',
      'links',
      'bold',
      'counters',
      'bullets',
      'hr',
      'quotes',
      'quote-borders',
      'captions',
      'code',
      'pre-code',
      'pre-bg',
      'th-borders',
      'td-borders',
    ]) {
      expect(tailwindCss).toMatch(new RegExp(`--prose-blog-${slot}\\s*:`))
      expect(tailwindCss).toMatch(new RegExp(`--tw-prose-${slot}\\s*:\\s*var\\(--prose-blog-${slot}\\)`))
      expect(tailwindCss).toMatch(new RegExp(`--tw-prose-invert-${slot}\\s*:\\s*var\\(--prose-blog-${slot}\\)`))
    }

    // Comment HTML is rendered via `dangerouslySetInnerHTML`, so the
    // `prose prose-sm prose-blog max-w-none` chain on the wrapper
    // `<div class="comment-content …">` is what drives the comment
    // typography cascade. Pin the literal so a refactor that drops the
    // chain is caught at PR time (matches the same-line guarantee that
    // the post / page carriers carry the `prose prose-lg` variant).
    expect(commentItem).toMatch(/cn\(\s*'comment-content'\s*,\s*'prose-blog prose prose-sm max-w-none'/)
  })

  it('inlines the post-content / comment-content literals at the only two call-site shapes', () => {
    // The two `comment-content` / `post-content` literals are the
    // only WordPress-compatibility class-name markers that survived
    // the Stage 11 cleanup, because `@utility prose-blog
    // { &.post-content {…} &.comment-content {…} }` in `tailwind.css`
    // uses them as compound selectors to fine-tune typography on
    // rendered MDX bodies and comment-body MDX trees. Everything
    // else — the previous `wp-compat.ts` registry, every per-class
    // marker shipped on `<header>`, `<aside>`, comment list rows,
    // tag-cloud chips, popup containers, etc. — has been deleted.
    //
    // Pin four invariants so a future refactor either (a) keeps the
    // two surviving literals at their two call-site shapes or
    // (b) deletes them entirely along with the matching `tailwind.
    // css` nested compounds:
    //
    //   1. The compounds `&.post-content` and `&.comment-content`
    //      still live inside `@utility prose-blog` in `tailwind.css`.
    //   2. The detail-body call sites (`PostDetailBody`,
    //      `PageDetailBody`) construct their wrapper `className`
    //      through `cn('post-content', …)`.
    //   3. The comment row (`CommentItem`) constructs its wrapper
    //      `className` through `cn('comment-content', …)`.
    //   4. The historical `src/ui/lib/wp-compat.ts` registry stays
    //      deleted — no file re-introduces it or re-imports it.
    const tailwindCss = readFileSync('src/assets/styles/tailwind.css', 'utf8')
    expect(tailwindCss).toMatch(/&\.post-content\s*\{/)
    expect(tailwindCss).toMatch(/&\.comment-content\s*\{/)

    const detailChrome = readFileSync('src/ui/public/post/DetailBodyChrome.tsx', 'utf8')
    const commentItem = readFileSync('src/ui/public/comments/comment-item/helpers.ts', 'utf8')

    // post-content class is inlined in DetailBodyChrome; Post/Page DetailBody are thin wrappers.
    expect(detailChrome).toMatch(/cn\(\s*'post-content'\s*,/)
    expect(commentItem).toMatch(/cn\(\s*'comment-content'\s*,/)

    // The registry stays deleted. A regression that re-adds it or
    // re-imports from `@/ui/lib/wp-compat` anywhere under `src/`
    // lands here at PR time.
    expect(existsSync('src/ui/lib/wp-compat.ts')).toBe(false)
    const offenders = files('src', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return source.includes("from '@/ui/lib/wp-compat'")
    })
    expect(offenders).toEqual([])
  })

  it('drives popup outside-click detection via data-popup-id, not className', () => {
    // P9 (Stage 11) replaced the WP-compat `qr-dialog-popup` and
    // `global-search-popup` literals (used as `document.querySelector
    // ('.…')` hooks for outside-click detection) with a `data-popup-
    // id` attribute on the `<Popup>` outer container. Pin three
    // invariants:
    //
    //   1. `<Popup>` accepts a `popupId` prop and forwards it as
    //      `data-popup-id` (the new contract).
    //   2. The two consumers (`QRDialog`, header `Search`) pass a
    //      stable `popupId` and use the matching
    //      `[data-popup-id="…"]` selector for the `document` click
    //      test. They must NOT re-introduce the legacy class hooks
    //      (`.qr-dialog-popup`, `.global-search-popup`).
    const popup = readFileSync('src/ui/public/widgets/Popup.tsx', 'utf8')
    expect(popup).toMatch(/popupId\?:\s*string/)
    expect(popup).toMatch(/data-popup-id=\{popupId\}/)
    // The legacy `className?: string` prop has been removed from the
    // `<Popup>` API; consumers can no longer leak a class hook into
    // the portalised container.
    expect(popup).not.toMatch(/^\s*className\?:\s*string/m)

    const qr = readFileSync('src/ui/public/widgets/QRDialog.tsx', 'utf8')
    expect(qr).toMatch(/popupId=\{QR_POPUP_ID\}/)
    expect(qr).toMatch(/\[data-popup-id="\$\{QR_POPUP_ID\}"\]/)
    expect(qr).not.toMatch(/'\.qr-dialog-popup'/)
    expect(qr).not.toMatch(/'qr-dialog-popup'/)

    const search = readFileSync('src/ui/public/Search.tsx', 'utf8')
    expect(search).toMatch(/popupId=\{SEARCH_POPUP_ID\}/)
    expect(search).toMatch(/\[data-popup-id="\$\{SEARCH_POPUP_ID\}"\]/)
    expect(search).not.toMatch(/'\.global-search-popup'/)
    expect(search).not.toMatch(/'global-search-popup'/)
  })

  it('routes icon-button content through @/ui/components/icon-button-content', () => {
    // P4 (Stage 11) extracted the repeated `<span className="absolute
    // top-0 flex size-full items-center justify-center">…</span>`
    // wrapper into `<IconButtonContent>`. The wrapper is the
    // text-baseline-drift-proof centring rule for every icon-only
    // public button (see the component for the rationale).
    //
    // Pin two invariants:
    //
    //   1. The component file exists and exports `IconButtonContent`.
    //   2. No other file in `src/` re-introduces the literal centring
    //      chain — every consumer must go through the component.
    expect(existsSync('src/ui/components/icon-button-content.tsx')).toBe(true)
    const component = readFileSync('src/ui/components/icon-button-content.tsx', 'utf8')
    expect(component).toMatch(/export\s+function\s+IconButtonContent\b/)
    expect(component).toMatch(/absolute top-0 flex size-full items-center justify-center/)

    const offenders = files('src', '-g', '*.ts', '-g', '*.tsx')
      .filter((file) => file !== 'src/ui/components/icon-button-content.tsx')
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return source.includes('absolute top-0 flex size-full items-center justify-center')
      })
    expect(offenders).toEqual([])
  })

  it('keeps ScrollTopButton on the GPU-layer / opacity toggle (mobile rendering-ghost fix)', () => {
    // iOS Safari and Chromium-on-iOS snapshot `position: fixed`
    // descendants into the compositor and re-blend them on every
    // scroll tick. A `display: none ↔ block` toggle invalidates the
    // layer's box geometry mid-frame, leaving stale tiles behind as
    // a "rendering ghost" — 100% reproducible during inertial scroll
    // / URL-bar collapse.
    //
    // Pin two invariants so a future refactor can't accidentally
    // regress to the `display`-toggle shape:
    //
    //   1. The visibility flip MUST go through `opacity-0 /
    //      opacity-100` (and `pointer-events-none` for input
    //      blocking), NOT through `hidden / block`.
    //   2. Both the floating widget rail (`<ul>` in `BaseLayout.tsx`)
    //      AND the back-to-top `<li>` (`ScrollTopButton.tsx`) must
    //      carry `transform-gpu` so iOS Safari keeps them on the
    //      GPU compositor across URL-bar resizes.
    const scrollTop = readFileSync('src/ui/public/chrome/ScrollTopButton.tsx', 'utf8')
    expect(scrollTop).toMatch(/\btransform-gpu\b/)
    expect(scrollTop).toMatch(/\bopacity-0\b/)
    expect(scrollTop).toMatch(/\bopacity-100\b/)
    expect(scrollTop).toMatch(/\bpointer-events-none\b/)
    // The rendered className for the host `<li>` must NOT route
    // visibility through `display` swaps. Allow `hidden` to appear
    // freely in comments / strings unrelated to className, but ban
    // the literal `'block' : 'hidden'` (or vice-versa) ternary
    // shapes that the previous implementation used.
    expect(scrollTop).not.toMatch(/show\s*\?\s*'block'\s*:\s*'hidden'/)
    expect(scrollTop).not.toMatch(/show\s*\?\s*'hidden'\s*:\s*'block'/)

    const baseLayout = readFileSync('src/ui/public/chrome/BaseLayout.tsx', 'utf8')
    expect(baseLayout).toMatch(/\btransform-gpu\b/)
  })

  it('mirrors every .dark .aplayer rule under the prefers-color-scheme media-query block', () => {
    // The APlayer reskin is keyed on `.dark .aplayer*`. Noscript visitors
    // on a dark-OS preference have no `.dark` class on `<html>`, so the
    // class-only selectors would leave them with the library's stock light
    // palette painted on a dark page. Every selector occurrence in the
    // class-based block must therefore be mirrored under
    // `@media (prefers-color-scheme: dark) { :root:not(.light, .dark) … }`
    // so the system-preference branch fires the same overrides. Counts
    // here are selector occurrences (across `,`-joined selector lists),
    // not rule blocks.
    const aplayer = readFileSync('src/assets/styles/aplayer.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const darkRuleCount = (aplayer.match(/\.dark\s+\.aplayer/g) ?? []).length
    const mediaRuleCount = (aplayer.match(/:root:not\(\.light,\s*\.dark\)\s+\.aplayer/g) ?? []).length

    expect(darkRuleCount).toBeGreaterThan(0)
    expect(mediaRuleCount).toBe(darkRuleCount)
    expect(aplayer).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/)
  })
})
