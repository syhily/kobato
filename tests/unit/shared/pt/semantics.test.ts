import { describe, expect, it } from 'vitest'

import type { Block } from '@/shared/pt/schema'

import { portableTextBlockSemanticFingerprint } from '@/shared/pt/semantics'

const text = (
  text: string,
  marks: string[] = [],
  markDefs: { _type: string; _key: string; href?: string }[] = [],
): Block =>
  ({
    _type: 'block',
    _key: `k-${text}`,
    style: 'normal',
    children: [{ _type: 'span', _key: `s-${text}`, text, marks }],
    markDefs,
  }) as Block

describe('shared/pt/semantics — portableTextBlockSemanticFingerprint', () => {
  it('is stable regardless of _key values', () => {
    const a = {
      _type: 'block',
      _key: 'aaa',
      style: 'normal',
      children: [{ _type: 'span', _key: 's1', text: 'hi' }],
    } as Block
    const b = {
      _type: 'block',
      _key: 'bbb',
      style: 'normal',
      children: [{ _type: 'span', _key: 's2', text: 'hi' }],
    } as Block
    expect(portableTextBlockSemanticFingerprint(a)).toBe(portableTextBlockSemanticFingerprint(b))
  })

  it('ignores prerender artifacts (highlightedHtml, mathml, svg)', () => {
    const base = {
      _type: 'code',
      _key: 'k1',
      code: 'print(1)',
      language: 'python',
    } as Block
    const withArtifact = { ...base, highlightedHtml: '<pre>print(1)</pre>' } as Block
    expect(portableTextBlockSemanticFingerprint(base)).toBe(portableTextBlockSemanticFingerprint(withArtifact))
  })

  it('changes when text content changes', () => {
    expect(portableTextBlockSemanticFingerprint(text('hello'))).not.toBe(
      portableTextBlockSemanticFingerprint(text('world')),
    )
  })

  it('resolves decorator marks into a stable {decorator} shape', () => {
    const asDecorator = text('hi', ['strong'])
    expect(portableTextBlockSemanticFingerprint(asDecorator)).toContain('"decorator":"strong"')
  })

  it('resolves unknown mark references into {unresolved}', () => {
    const asMarkRef = text('hi', ['missing-key'])
    expect(portableTextBlockSemanticFingerprint(asMarkRef)).toContain('"unresolved":"missing-key"')
  })

  it('emits a type-keyed object fingerprint for leaf blocks like horizontalRule', () => {
    const empty = { _type: 'horizontalRule', _key: 'k' } as Block
    expect(portableTextBlockSemanticFingerprint(empty)).toBe('{"_type":"horizontalRule"}')
  })

  it('returns a deterministic order-insensitive object fingerprint', () => {
    const a = {
      _type: 'block',
      _key: 'k',
      style: 'normal',
      children: [{ _type: 'span', _key: 's', text: 'x', marks: ['em'] }],
    } as Block
    const b = {
      _type: 'block',
      _key: 'k',
      children: [{ _type: 'span', _key: 's', text: 'x', marks: ['em'] }],
      style: 'normal',
    } as Block
    expect(portableTextBlockSemanticFingerprint(a)).toBe(portableTextBlockSemanticFingerprint(b))
  })
})
