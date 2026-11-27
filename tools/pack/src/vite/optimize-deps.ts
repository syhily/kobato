import type { UserConfig } from 'vite'

import { repoRoot } from '@kobato/pack/sea/paths'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const workspacePackageSchema = z.object({
  name: z.string(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
})

const WORKSPACE_PACKAGE_DIRS = [
  'packages/web/admin',
  'packages/api',
  'packages/db',
  'packages/web/kit',
  'packages/web/ui',
  'packages/server',
  'packages/shared/utils',
  'packages/shared/auth',
  'packages/shared/catalog',
  'packages/shared/distribution',
  'packages/shared/i18n',
  'packages/shared/settings',
  'packages/shared/assets',
  'packages/shared/sanitize',
  'packages/inkling',
]

const OPTIMIZE_INCLUDE_ENTRIES = [
  'react/compiler-runtime',
  'lucide-react',
  'date-fns',
  'date-fns/locale',
  '@date-fns/tz',
  '@base-ui/react/alert-dialog',
  '@base-ui/react/avatar',
  '@base-ui/react/checkbox',
  '@base-ui/react/combobox',
  '@base-ui/react/dialog',
  '@base-ui/react/menu',
  '@base-ui/react/popover',
  '@base-ui/react/radio',
  '@base-ui/react/radio-group',
  '@base-ui/react/select',
  '@base-ui/react/separator',
  '@base-ui/react/switch',
  '@base-ui/react/tabs',
  '@base-ui/react/tooltip',
  '@base-ui/react/use-render',
  '@dnd-kit/core',
  '@dnd-kit/modifiers',
  '@dnd-kit/sortable',
  '@dnd-kit/utilities',
  '@number-flow/react',
  '@orpc/client',
  '@orpc/client/fetch',
  '@orpc/react-query',
  '@simplewebauthn/browser',
  '@tanstack/react-query',
  'cn',
  'cn/config',
  'diff-match-patch',
  'dompurify',
  'idb',
  'medium-zoom/dist/pure',
  'motion/react',
  'qrcode.react',
  'react-day-picker',
  'react-hook-form',
  'sonner',
  'zod',
  'lexical',
  '@lexical/clipboard',
  '@lexical/headless',
  '@lexical/html',
  '@lexical/link',
  '@lexical/list',
  '@lexical/markdown',
  '@lexical/react/LexicalCollaborationContext',
  '@lexical/react/LexicalCollaborationPlugin',
  '@lexical/react/LexicalComposer',
  '@lexical/react/LexicalComposerContext',
  '@lexical/react/LexicalContentEditable',
  '@lexical/react/LexicalExtensionComposer',
  '@lexical/react/LexicalHistoryPlugin',
  '@lexical/react/LexicalLinkPlugin',
  '@lexical/react/LexicalListPlugin',
  '@lexical/react/LexicalMarkdownShortcutPlugin',
  '@lexical/react/LexicalNestedComposer',
  '@lexical/react/LexicalOnChangePlugin',
  '@lexical/react/LexicalRichTextPlugin',
  '@lexical/react/LexicalTypeaheadMenuPlugin',
  '@lexical/react/ReactExtension',
  '@lexical/rich-text',
  '@lexical/selection',
  '@lexical/table',
  '@lexical/text',
  '@lexical/utils',
  '@uiw/react-codemirror',
  '@uiw/codemirror-extensions-basic-setup',
  '@codemirror/autocomplete',
  '@codemirror/commands',
  '@codemirror/lang-css',
  '@codemirror/lang-html',
  '@codemirror/lang-javascript',
  '@codemirror/language',
  '@codemirror/view',
  '@lezer/highlight',
  'emoji-picker-react',
  'emoji-picker-react/data',
  'emoji-picker-react/data/emojis-en',
  'emoji-picker-react/data/emojis-zh',
  'emoji-picker-react/data/emojis-zh-hant',
  'react-colorful',
  'fast-average-color',
  'markdown-it',
  'markdown-it-footnote',
  'markdown-it-lazy-headers',
  'markdown-it-mark',
  'markdown-it-sub',
  'markdown-it-sup',
  'yjs',
  'y-websocket',
  'pino',
  'jsdom',
  '@hono/node-server',
  '@maxmind/geoip2-node',
  '@orpc/server',
  '@simplewebauthn/server',
  '@shikijs/transformers',
  'bcryptjs',
  'drizzle-orm',
  'drizzle-orm/node-sqlite',
  'drizzle-orm/sqlite-core',
  'katex',
  'katex/contrib/mhchem',
  'nodemailer',
  'pinyin-pro',
  'react-dom/server',
  'shiki/bundle/full',
]

const OPTIMIZE_EXCLUDE = ['@duckdb/node-api', 'sharp', '@napi-rs/canvas']

function packageNameOf(entry: string): string {
  const parts = entry.split('/')
  return entry.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]!
}

function depOwnerMap(appDeclared: ReadonlySet<string>): Map<string, string> {
  const manifests = WORKSPACE_PACKAGE_DIRS.map((dir) =>
    workspacePackageSchema.parse(JSON.parse(readFileSync(resolve(repoRoot, dir, 'package.json'), 'utf-8'))),
  )
  const depOwner = new Map<string, string>()
  for (const appDeclaredOnly of [true, false]) {
    for (const manifest of manifests) {
      if (appDeclared.has(manifest.name) !== appDeclaredOnly) {
        continue
      }
      for (const dep of [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]) {
        if (!depOwner.has(dep)) {
          depOwner.set(dep, manifest.name)
        }
      }
    }
  }
  return depOwner
}

export function appOptimizeDeps(appDir: string): NonNullable<UserConfig['optimizeDeps']> {
  const pkg = workspacePackageSchema.parse(JSON.parse(readFileSync(resolve(repoRoot, appDir, 'package.json'), 'utf-8')))
  const appDeclared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])
  const depOwner = depOwnerMap(appDeclared)
  return {
    include: OPTIMIZE_INCLUDE_ENTRIES.map((entry) => {
      const name = packageNameOf(entry)
      if (appDeclared.has(name)) {
        return entry
      }
      const owner = depOwner.get(name)
      return owner ? `${owner} > ${entry}` : entry
    }),
    exclude: [...OPTIMIZE_EXCLUDE],
  }
}
