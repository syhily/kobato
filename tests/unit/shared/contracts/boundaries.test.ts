import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Node-native replacement for ripgrep. GitHub's ubuntu-latest runner
// doesn't ship rg, so execFileSync('rg', …) fails in CI.
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

  it('public stylesheet imports tailwind.css', () => {
    const globals = readFileSync('src/styles/public.css', 'utf8')
    expect(globals).toMatch(/@import\s+['"]\.\/tailwind\.css['"]/)
  })

  it('keeps optional vendor CSS out of the root stylesheet', () => {
    const source = readFileSync('src/styles/public.css', 'utf8')

    expect(source).not.toContain('bootstrap/dist/css/bootstrap.css')
    expect(source).not.toContain('bootstrap/dist/css/bootstrap-reboot.css')
    expect(source).not.toContain('bootstrap/dist/css/bootstrap-utilities.css')
    expect(source).not.toContain('aplayer-ts/src/css/base.css')
    expect(source).not.toContain('medium-zoom/dist/style.css')
    expect(source).not.toContain('tippy.js')
  })

  it('keeps the Bootstrap npm dep fully retired from the public bundle', () => {
    const globals = readFileSync('src/styles/public.css', 'utf8')

    // Match real CSS/JS import statements only — comments documenting
    // retired paths must not trip these.
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
    expect(existsSync('src/ui/primitives/buttons.css')).toBe(false)
    expect(existsSync('src/styles/bootstrap-compat.css')).toBe(false)
    expect(existsSync('src/styles/components.css')).toBe(false)

    const globals = readFileSync('src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*buttons\.css['"]/)
    expect(globals).not.toMatch(/@import\s+['"][^'"]*bootstrap-compat\.css['"]/)
    expect(globals).not.toMatch(/@import\s+['"][^'"]*components\.css['"]/)

    // Button recipe lives in the shared CVA; pin variant/size/shape sets.
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

    const themeCss = readFileSync('src/styles/theme.css', 'utf8')
    expect(themeCss).toMatch(/--spacing-icon-inset:\s*28%;/)
  })

  it('keeps the legacy cards + lists partials fully retired', () => {
    expect(existsSync('src/ui/primitives/cards.css')).toBe(false)
    expect(existsSync('src/ui/primitives/lists.css')).toBe(false)

    const globals = readFileSync('src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*cards\.css['"]/)
    expect(globals).not.toMatch(/@import\s+['"][^'"]*lists\.css['"]/)

    const tokensCss = readFileSync('src/styles/tokens.css', 'utf8')
    expect(tokensCss).toMatch(/--ink-5:\s*#eaecf3;/)
    const themeCss = readFileSync('src/styles/theme.css', 'utf8')
    expect(themeCss).toMatch(/--color-ink-5:\s*var\(--ink-5\);/)

    // Scan every source file for residual className tokens that would
    // only resolve through the deleted partials. Strip comments first
    // so the assertion fires on real markup.
    const offenders: string[] = []
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
    const ambiguousClassTokens = ['media', 'overlay', 'text-muted']
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
      // Inkling editor styles ported from Ghost Koenig contain legitimate
      // CSS values (e.g. `display: list-item`) that happen to match banned
      // class tokens from the retired cards/lists partials. Skip them.
      if (file.includes('src/styles/inkling/')) continue
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
    expect(existsSync('src/ui/primitives/navigation.css')).toBe(false)

    const globals = readFileSync('src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*navigation\.css['"]/)

    const tokens = readFileSync('src/styles/tokens.css', 'utf8')
    expect(tokens).toMatch(/--z-aside-drawer:\s*1020;/)

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
    expect(existsSync('src/ui/primitives/popup.css')).toBe(false)

    const globals = readFileSync('src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/popup\.css/)

    const offenders: string[] = []
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx', '-g', '*.css')) {
      const source = readFileSync(file, 'utf8')
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      if (/\bnice-popup(?:-[a-z]+)*\b/.test(stripped)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the legacy media partial fully retired', () => {
    expect(existsSync('src/ui/primitives/media.css')).toBe(false)

    const globals = readFileSync('src/styles/public.css', 'utf8')
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
    expect(existsSync('src/ui/primitives/forms.css')).toBe(false)

    const globals = readFileSync('src/styles/public.css', 'utf8')
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
    expect(existsSync('src/ui/sidebar/sidebar.css')).toBe(false)

    const globals = readFileSync('src/styles/public.css', 'utf8')
    expect(globals).not.toMatch(/@import\s+['"][^'"]*sidebar\.css['"]/)
    expect(globals).not.toMatch(/\.widget-title:before\b/)
    expect(globals).not.toMatch(/\.tagcloud\s*>\s*a:before\b/)
    expect(globals).not.toMatch(/@layer\s+components\s*\{/)
    expect(globals).not.toMatch(/\.screen-reader-text\b/)

    const sidebarSource = readFileSync('src/ui/public/Sidebar.tsx', 'utf8')
    expect(sidebarSource).toMatch(/before:content-\['']/)
    expect(sidebarSource).toMatch(/before:content-\['#']/)

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
        // `import type` is compile-time only; runtime imports are banned.
        if (trimmed.startsWith('import type ') || trimmed.startsWith('import type{')) {
          return false
        }
        return trimmed.includes('@/server/') || /\.server(?:["']|$)/.test(trimmed)
      })
    })

    expect(offenders).toEqual([])
  })

  it('keeps the static `@/blog.config` import out of the codebase entirely', () => {
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

    expect(source).toContain('SECTION_CONTEXTS_ANY')
    expect(source).toContain("makeCtx<SiteIdentitySettings>('siteIdentityContext')")
    expect(source).toContain("makeCtx<CacheSettings>('cacheContext')")
    expect(source).toContain("makeCtx<RateLimitSettings>('rateLimitContext')")
    expect((source.match(/makeCtx</g) ?? []).length).toBeGreaterThanOrEqual(12)
    expect(source).not.toContain('BlogSettingsBundleContext')
  })

  it('routes every settings form through the unified react-hook-form wrapper', () => {
    const source = readFileSync('src/ui/admin/settings/shell/useSettingsCard.tsx', 'utf8')

    expect(source).toContain('useForm<TState>')
    expect(source).toContain('safeParseAsync')
    expect(source).not.toContain('submittedDraftRef')
    expect(source).not.toContain('setSnapshot(')

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
      // Direct `useForm` import means the form bypasses the wrapper.
      expect(formSource).not.toMatch(/import\s*\{[^}]*\buseForm\b[^}]*\}\s*from\s*['"]react-hook-form['"]/)
      // `MailForm` may import `useFetcher` for the test-mail button;
      // every other form must not import `useRevalidator` directly.
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
      {
        key: 'vite.config.ts -> ./src/server/infra/route-warmup',
        file: 'vite.config.ts',
        specifier: './src/server/infra/route-warmup',
      },
      {
        key: 'vite.config.ts -> ./src/server/infra/image/worker-entry-plugin',
        file: 'vite.config.ts',
        specifier: './src/server/infra/image/worker-entry-plugin',
      },
      {
        key: 'dev.ts -> ./dev-server-ref',
        file: 'src/server/infra/hono/dev.ts',
        specifier: './dev-server-ref',
      },
      {
        key: 'process-worker.ts -> ../../../shared/utils/thumbhash.ts',
        file: 'src/server/infra/image/process-worker.ts',
        specifier: '../../../shared/utils/thumbhash.ts',
      },
      {
        // Config-graph file: `@/` aliases are not resolved while Vite loads
        // vite.config.ts, so this must stay relative (see process-worker above).
        key: 'route-warmup.ts -> ../../shared/constants/route-warmup',
        file: 'src/server/infra/route-warmup.ts',
        specifier: '../../shared/constants/route-warmup',
      },
      {
        // Config-graph file (loaded by vite.config.ts): same alias caveat
        // as above. `unsafeCast` is needed because the Vite dev-server types
        // are structurally compatible but not declared as our domain type.
        key: 'dev.ts -> ../../../shared/utils/unsafe-cast',
        file: 'src/server/infra/hono/dev.ts',
        specifier: '../../../shared/utils/unsafe-cast',
      },
      {
        // Config-graph file (loaded by vite.config.ts): same alias caveat.
        // `unsafeCast` is used on the parsed route manifest / Vite internals.
        key: 'route-warmup.ts -> ../../shared/utils/unsafe-cast',
        file: 'src/server/infra/route-warmup.ts',
        specifier: '../../shared/utils/unsafe-cast',
      },
      {
        key: 'LazyCommentBodyEditor.tsx -> ./CommentBodyEditor',
        file: 'src/ui/public/comments/LazyCommentBodyEditor.tsx',
        specifier: './CommentBodyEditor',
      },
      {
        // Vendored cn-font-split: Vite `?url` import of the wasm binary.
        key: 'slice.ts -> ./vendor/wasm-split',
        file: 'src/server/domains/fonts/slice.ts',
        specifier: './vendor/wasm-split',
      },
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
  })

  it('keeps DOM/script islands out of the tree (React only)', () => {
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
    const globals = readFileSync('src/styles/public.css', 'utf8')
    const root = readFileSync('src/root.tsx', 'utf8')

    expect(files('src/assets/fonts', '-g', '*.ttf', '-g', '*.woff2', '-g', '*.css')).toEqual([])

    expect(globals).not.toContain('opposans.css')
    expect(globals).not.toContain('opposerif.css')
    expect(globals).not.toContain('iosevka.css')

    expect(root).not.toContain("from '@/assets/fonts/")
    expect(root).not.toContain("import '@/assets/fonts/")
    expect(root).not.toContain('.ttf')

    // Browser web fonts now flow through self-hosted packages resolved from
    // the root loader's `fonts` field (resolved family + href per slot),
    // not from external CSS URLs. Assert the new contract holds.
    expect(root).toContain('rel="stylesheet" href={f.href}')
  })

  it('keeps admin Tailwind layouts on flex/grid gap instead of space utilities', () => {
    const offenders = files('src/ui/admin', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /space-[xy]-/.test(source)
    })

    expect(offenders).toEqual([])
  })

  it('keeps screen-reader helpers visually hidden instead of display-none', () => {
    const source = readFileSync('src/styles/public.css', 'utf8')

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
          !file.startsWith('src/routes/admin/') &&
          !file.startsWith('src/ui/public/aplayer/'),
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
    const offenders: string[] = []
    for (const file of files('src/ui', '-g', '*.tsx')) {
      const source = readFileSync(file, 'utf8')
      if (source.includes('className={`')) {
        offenders.push(file)
      }
    }

    expect(offenders).toEqual([])
  })

  it('keeps the wp-decoy status text mirrored between server and ErrorView', () => {
    const server = readFileSync('src/server/http/middlewares/wp-decoy.ts', 'utf8')
    const ui = readFileSync('src/ui/public/chrome/ErrorView.tsx', 'utf8')

    expect(server).toContain("export const NOT_WORDPRESS_STATUS_TEXT = 'Not WordPress'")
    expect(ui).toContain("const NOT_WORDPRESS_STATUS_TEXT = 'Not WordPress'")
  })

  it('keeps solution math scrollable instead of clipping long formulas', () => {
    const publicCss = readFileSync('src/styles/public.css', 'utf8')
    const tailwindCss = readFileSync('src/styles/tailwind.css', 'utf8')
    const contentCss = readFileSync('src/styles/content.css', 'utf8')

    expect(publicCss).not.toMatch(/\.post-content \.solution\s*\{[^}]*overflow:\s*hidden/s)
    expect(tailwindCss).not.toMatch(/\.post-content \.solution\s*\{[^}]*overflow:\s*hidden/s)
    expect(contentCss).toMatch(/\.math-display\b/)
    expect(contentCss).toContain('overflow-x: auto')
  })

  it('routes post / comment typography through hand-written content.css', () => {
    const publicCss = readFileSync('src/styles/public.css', 'utf8')
    const tailwindCss = readFileSync('src/styles/tailwind.css', 'utf8')
    const contentCss = readFileSync('src/styles/content.css', 'utf8')
    const commentItem = readFileSync('src/ui/public/comments/comment-item/helpers.ts', 'utf8')

    expect(publicCss).not.toMatch(/^\s*\.post-content\s*\{/m)
    expect(publicCss).not.toMatch(/^\s*\.comment-content\s*\{/m)
    expect(publicCss).not.toMatch(/@import\s+['"][^'"]*ui\/post\/post\.css['"]/)
    expect(existsSync('src/ui/post/post.css')).toBe(false)

    // @tailwindcss/typography is fully removed — replaced by content.css
    expect(tailwindCss).not.toContain("@plugin '@tailwindcss/typography'")
    expect(tailwindCss).toContain("@import './content.css'")

    // content.css defines both scopes with explicit (non-:where) selectors
    expect(contentCss).toMatch(/\.post-content\s*\{/)
    expect(contentCss).toMatch(/\.comment-content\s*\{/)

    // Colours are driven by project tokens, not --tw-prose-* slots
    expect(contentCss).toMatch(/var\(--ink-2\)/)
    expect(contentCss).toMatch(/var\(--brand\)/)

    // No stale prose/prose-blog classes leak into consumer components
    expect(commentItem).toMatch(/cn\(\s*'comment-content'\s*,/)
    expect(commentItem).not.toMatch(/prose/)
  })

  it('inlines the post-content / comment-content literals at the only two call-site shapes', () => {
    const detailChrome = readFileSync('src/ui/public/post/DetailBodyChrome.tsx', 'utf8')
    const commentItem = readFileSync('src/ui/public/comments/comment-item/helpers.ts', 'utf8')

    expect(detailChrome).toMatch(/className="post-content"/)
    expect(commentItem).toMatch(/cn\(\s*'comment-content'\s*,/)

    expect(existsSync('src/ui/lib/wp-compat.ts')).toBe(false)
    const offenders = files('src', '-g', '*.ts', '-g', '*.tsx').filter((file) => {
      const source = readFileSync(file, 'utf8')
      return source.includes("from '@/ui/lib/wp-compat'")
    })
    expect(offenders).toEqual([])
  })

  it('drives popup outside-click detection via data-popup-id, not className', () => {
    const popup = readFileSync('src/ui/public/widgets/Popup.tsx', 'utf8')
    expect(popup).toMatch(/popupId\?:\s*string/)
    expect(popup).toMatch(/data-popup-id=\{popupId\}/)
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
    // iOS Safari snapshots fixed-position layers into the compositor.
    // A display toggle invalidates the layer mid-frame, leaving a ghost
    // during inertial scroll. Opacity + pointer-events avoids that.
    const scrollTop = readFileSync('src/ui/public/chrome/ScrollTopButton.tsx', 'utf8')
    expect(scrollTop).toMatch(/\btransform-gpu\b/)
    expect(scrollTop).toMatch(/\bopacity-0\b/)
    expect(scrollTop).toMatch(/\bopacity-100\b/)
    expect(scrollTop).toMatch(/\bpointer-events-none\b/)
    expect(scrollTop).not.toMatch(/show\s*\?\s*'block'\s*:\s*'hidden'/)
    expect(scrollTop).not.toMatch(/show\s*\?\s*'hidden'\s*:\s*'block'/)

    const baseLayout = readFileSync('src/ui/public/chrome/BaseLayout.tsx', 'utf8')
    expect(baseLayout).toMatch(/\btransform-gpu\b/)
  })

  it('centralises all process.env access in src/server/infra/env.ts and src/server/infra/hono/dev.ts', () => {
    const offenders: string[] = []
    for (const file of files('src', '-g', '*.ts', '-g', '*.tsx')) {
      if (file.endsWith('.d.ts')) {
        continue
      }
      if (file === 'src/server/infra/env.ts' || file === 'src/server/infra/hono/dev.ts') {
        continue
      }
      const source = readFileSync(file, 'utf8')
      if (/\bprocess\.env\b/.test(source)) {
        offenders.push(file)
      }
    }

    expect(offenders).toEqual([])
  })
})
