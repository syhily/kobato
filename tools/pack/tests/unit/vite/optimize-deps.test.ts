import { appOptimizeDeps } from '@kobato/pack/vite/optimize-deps'
import { describe, expect, it } from 'vitest'

describe('appOptimizeDeps', () => {
  const { include, exclude } = appOptimizeDeps()

  it('keeps app-declared entries bare', () => {
    for (const entry of ['zod', 'jsdom', 'react/compiler-runtime']) {
      expect(include).toContain(entry)
    }
  })

  it('maps transitive entries through their workspace owner', () => {
    for (const hint of [
      '@kobato/ui > cn',
      '@kobato/ui > pino',
      '@kobato/web-public > motion/react',
      '@kobato/web-admin > lexical',
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

  it('excludes the native modules', () => {
    expect(exclude).toEqual(['@duckdb/node-api', 'sharp', '@napi-rs/canvas'])
  })
})
