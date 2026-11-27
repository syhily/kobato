import { appOptimizeDeps } from '@kobato/pack/vite/optimize-deps'
import { describe, expect, it } from 'vitest'

describe('appOptimizeDeps', () => {
  const { include, exclude } = appOptimizeDeps('packages/web/admin')

  it('keeps app-declared entries bare', () => {
    for (const entry of ['zod', 'jsdom', 'react/compiler-runtime']) {
      expect(include).toContain(entry)
    }
  })

  it('maps transitive entries through their workspace owner', () => {
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

  it('maps entries the named app does not declare through their workspace owner', () => {
    const kobato = appOptimizeDeps('apps/kobato')
    expect(kobato.include).toContain('@kobato/web-admin > react-dom/server')
    expect(kobato.include).toContain('@kobato/web-admin > zod')
    expect(kobato.include).not.toContain('zod')
  })

  it('excludes the native modules', () => {
    expect(exclude).toEqual(['@duckdb/node-api', 'sharp', '@napi-rs/canvas'])
  })
})
