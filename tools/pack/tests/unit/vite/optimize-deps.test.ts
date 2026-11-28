import { appOptimizeDeps } from '@kobato/pack/vite/optimize-deps'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function packageNameOf(entry: string): string {
  const parts = entry.split('/')
  return entry.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
}

function declared(appDir: string): Set<string> {
  const pkg = JSON.parse(readFileSync(`${appDir}/package.json`, 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])
}

describe('appOptimizeDeps', () => {
  const kobato = appOptimizeDeps('apps/kobato')
  const { include, exclude } = kobato

  it('keeps app-declared entries bare', () => {
    for (const entry of ['zod', 'jsdom', 'react/compiler-runtime']) {
      expect(include).toContain(entry)
    }
  })

  it('maps transitive entries through a dependency of the app that declares them', () => {
    for (const hint of [
      '@kobato/ui > cn',
      '@kobato/ui > pino',
      '@kobato/inkling > @lexical/clipboard',
      '@kobato/inkling > emoji-picker-react',
      '@kobato/inkling > emoji-picker-react/data',
      '@kobato/inkling > emoji-picker-react/data/emojis-en',
      '@kobato/inkling > emoji-picker-react/data/emojis-zh',
      '@kobato/inkling > emoji-picker-react/data/emojis-zh-hant',
      '@kobato/server > katex',
    ]) {
      expect(include).toContain(hint)
    }
  })

  it('pre-bundles the full shiki bundle through the shiki owner', () => {
    expect(include).toContain('@kobato/server > shiki/bundle/full')
  })

  it('keeps app-declared editor entries bare', () => {
    for (const entry of ['lexical', '@lexical/react/LexicalComposerContext']) {
      expect(include).toContain(entry)
    }
  })

  it('attributes every entry to a package the app can resolve, or omits it', () => {
    for (const appDir of ['apps/kobato', 'apps/sayaka']) {
      const appDeclared = declared(appDir)
      for (const entry of appOptimizeDeps(appDir).include) {
        const [owner, nested] = entry.includes(' > ') ? entry.split(' > ') : [undefined, entry]
        expect(appDeclared.has(owner ?? packageNameOf(nested!)), `${appDir}: ${entry}`).toBe(true)
      }
    }
  })

  it('omits what no dependency of the app declares: an app without the backend packages keeps nothing owned by them', () => {
    const sayaka = appOptimizeDeps('apps/sayaka')
    expect(sayaka.include.filter((entry) => /^(?:kobato|@kobato\/server|@kobato\/db) > /.test(entry))).toEqual([])
    expect(sayaka.include).not.toContain('@dnd-kit/core')
    expect(sayaka.include).not.toContain('react-hook-form')
    expect(sayaka.include).toContain('@kobato/inkling > @lexical/clipboard')
    expect(sayaka.include).toContain('@kobato/ui > cn')
    expect(sayaka.include).toContain('medium-zoom/dist/pure')
  })

  it('drops the entries no package declares from the kobato list too — neither is imported nor resolvable there', () => {
    expect(include).not.toContain('medium-zoom/dist/pure')
    expect(include).not.toContain('qrcode.react')
  })

  it('excludes the native modules', () => {
    expect(exclude).toEqual(['@duckdb/node-api', 'sharp', '@napi-rs/canvas'])
  })
})
