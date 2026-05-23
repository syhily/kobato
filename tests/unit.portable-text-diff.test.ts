import { describe, expect, it } from 'vitest'

import type { Block, PortableTextBody, TextBlock } from '@/shared/pt/schema'

import { diffBodies, inlineCharDiff } from '@/ui/admin/editor/portable-text-diff'

// `diffBodies` and `inlineCharDiff` are the workhorses behind both
// the conflict resolver (DraftConflictDialog) and the revision
// history drawer. Pin their behaviour as plain-function contracts so
// the renderers above them can iterate on layout without breaking
// the diff semantics by accident.

function p(_key: string, text: string): TextBlock {
  return {
    _type: 'block',
    _key,
    style: 'normal',
    children: [{ _type: 'span', _key: `${_key}-s`, text }],
  }
}

describe('diffBodies', () => {
  it('returns "unchanged" entries for blocks present unchanged on both sides', () => {
    const left: PortableTextBody = [p('a', 'hello'), p('b', 'world')]
    const right: PortableTextBody = [p('a', 'hello'), p('b', 'world')]
    const diff = diffBodies(left, right)
    expect(diff).toHaveLength(2)
    expect(diff.every((entry) => entry.status === 'unchanged')).toBe(true)
  })

  it('flags blocks with the same _key but different content as "changed"', () => {
    const left: PortableTextBody = [p('a', 'hello local')]
    const right: PortableTextBody = [p('a', 'hello server')]
    const [entry] = diffBodies(left, right)
    expect(entry.status).toBe('changed')
    expect(entry.key).toBe('a')
    expect(entry.leftBlock).not.toBeNull()
    expect(entry.rightBlock).not.toBeNull()
  })

  it('flags _keys present only on the left as "leftOnly"', () => {
    const left: PortableTextBody = [p('a', 'shared'), p('b', 'local-only')]
    const right: PortableTextBody = [p('a', 'shared')]
    const diff = diffBodies(left, right)
    expect(diff.map((e) => e.status)).toEqual(['unchanged', 'leftOnly'])
    const [, leftOnly] = diff
    expect(leftOnly.rightBlock).toBeNull()
    expect(leftOnly.leftBlock).not.toBeNull()
  })

  it('flags _keys present only on the right as "rightOnly" at their actual position', () => {
    const left: PortableTextBody = [p('a', 'shared')]
    const right: PortableTextBody = [p('a', 'shared'), p('b', 'server-only')]
    const diff = diffBodies(left, right)
    expect(diff.map((e) => e.status)).toEqual(['unchanged', 'rightOnly'])
    const [, rightOnly] = diff
    expect(rightOnly.leftBlock).toBeNull()
    expect(rightOnly.rightBlock).not.toBeNull()
  })

  it('places a block inserted in the middle as a single rightOnly entry between the unchanged anchors', () => {
    // Regression: previously the LCS-by-key alignment was a
    // simple per-key map, so an inserted block in the middle
    // pushed every later block off-by-one and they all rendered
    // as changed/added. The LCS pass keeps the surrounding
    // blocks as `unchanged` and emits the insertion in place.
    const left: PortableTextBody = [p('a', 'A'), p('b', 'B'), p('c', 'C')]
    const right: PortableTextBody = [p('a', 'A'), p('inserted', 'NEW'), p('b', 'B'), p('c', 'C')]
    const diff = diffBodies(left, right)
    expect(diff.map((e) => e.status)).toEqual(['unchanged', 'rightOnly', 'unchanged', 'unchanged'])
    expect(diff.map((e) => e.key)).toEqual(['a', 'inserted', 'b', 'c'])
  })

  it('places a block deleted from the middle as a single leftOnly entry in position', () => {
    const left: PortableTextBody = [p('a', 'A'), p('b', 'B'), p('c', 'C')]
    const right: PortableTextBody = [p('a', 'A'), p('c', 'C')]
    const diff = diffBodies(left, right)
    expect(diff.map((e) => e.status)).toEqual(['unchanged', 'leftOnly', 'unchanged'])
    expect(diff.map((e) => e.key)).toEqual(['a', 'b', 'c'])
  })

  it('anchors blocks by content fingerprint when the editor regenerated their _key', () => {
    // Tiptap can reissue `_key`s on save when a block round-trips
    // through PM. We anchor by content fingerprint so identical
    // text still aligns even with fresh keys, leaving only the
    // genuinely-inserted block as `rightOnly`.
    const left: PortableTextBody = [p('a', 'first'), p('b', 'second'), p('c', 'third')]
    const right: PortableTextBody = [p('a2', 'first'), p('inserted', 'NEW'), p('b2', 'second'), p('c2', 'third')]
    const diff = diffBodies(left, right)
    expect(diff.map((e) => e.status)).toEqual(['unchanged', 'rightOnly', 'unchanged', 'unchanged'])
  })

  it('treats a moved block as delete + insert rather than silently calling it unchanged', () => {
    // A real reorder (not a typo'd insert) should surface as
    // `leftOnly` at the old position and `rightOnly` at the new
    // one — the operator deserves to see both halves of the move
    // instead of having it disappear into "unchanged".
    const left: PortableTextBody = [p('a', 'A'), p('b', 'B'), p('c', 'C')]
    const right: PortableTextBody = [p('c', 'C'), p('a', 'A'), p('b', 'B')]
    const diff = diffBodies(left, right)
    // Either {a,b unchanged, c moved} or {b,c unchanged, a moved}
    // is acceptable — assert that *some* leftOnly + rightOnly
    // entry exists for the moved block, and that the unchanged
    // count equals the LCS length (2).
    expect(diff.filter((e) => e.status === 'unchanged')).toHaveLength(2)
    expect(diff.some((e) => e.status === 'leftOnly')).toBe(true)
    expect(diff.some((e) => e.status === 'rightOnly')).toBe(true)
  })

  it('treats custom-typed blocks (image/code/mermaid…) as full-block replacements', () => {
    // Custom blocks are diffed by JSON-string equality. The
    // renderer always shows them as a single replacement, never
    // char-level — verify the entry shape supports that.
    const left: PortableTextBody = [
      {
        _type: 'image',
        _key: 'img1',
        src: 'https://example.com/old.jpg',
        alt: 'old',
      },
    ]
    const right: PortableTextBody = [
      {
        _type: 'image',
        _key: 'img1',
        src: 'https://example.com/new.jpg',
        alt: 'new',
      },
    ]
    const [entry] = diffBodies(left, right)
    expect(entry.status).toBe('changed')
    expect((entry.leftBlock as Block)._type).toBe('image')
    expect((entry.rightBlock as Block)._type).toBe('image')
  })

  it('produces an empty list when both bodies are empty', () => {
    expect(diffBodies([], [])).toEqual([])
  })

  it('treats blocks that only differ by empty-array vs missing-array as unchanged', () => {
    // Regression: the editor's PT serializer omits `markDefs` /
    // `marks` when empty, but DB-stored bodies may carry an empty
    // array. Two such blocks render identically and must not flip
    // every block on the page to `changed`.
    const left: PortableTextBody = [
      {
        _type: 'block',
        _key: 'a',
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'span', _key: 'a-s', text: 'hello', marks: [] }],
      } as Block,
    ]
    const right: PortableTextBody = [
      {
        _type: 'block',
        _key: 'a',
        style: 'normal',
        children: [{ _type: 'span', _key: 'a-s', text: 'hello' }],
      } as Block,
    ]
    expect(diffBodies(left, right)[0].status).toBe('unchanged')
  })

  it('treats blocks that only differ by span / markDef / block _key as unchanged', () => {
    // The Tiptap → PT round-trip regenerates span and markDef keys
    // (`s-1`, `s-2`, …). Two structurally-equal blocks with fresh
    // keys must still anchor and render as `unchanged`.
    const left: PortableTextBody = [
      {
        _type: 'block',
        _key: 'old-block-key',
        style: 'normal',
        children: [
          { _type: 'span', _key: 'old-span-1', text: 'hello ' },
          { _type: 'span', _key: 'old-span-2', text: 'world', marks: ['old-link'] },
        ],
        markDefs: [{ _type: 'link', _key: 'old-link', href: 'https://example.com' }],
      } as Block,
    ]
    const right: PortableTextBody = [
      {
        _type: 'block',
        _key: 'new-block-key',
        style: 'normal',
        children: [
          { _type: 'span', _key: 's-1', text: 'hello ' },
          { _type: 'span', _key: 's-2', text: 'world', marks: ['new-link'] },
        ],
        markDefs: [{ _type: 'link', _key: 'new-link', href: 'https://example.com' }],
      } as Block,
    ]
    expect(diffBodies(left, right)[0].status).toBe('unchanged')
  })

  it('user scenario: left=[A,B,C,D,E] right=[A,C,D,E] with preserved keys → only B is leftOnly', () => {
    const left: PortableTextBody = [p('a', 'A'), p('b', 'B'), p('c', 'C'), p('d', 'D'), p('e', 'E')]
    const right: PortableTextBody = [p('a', 'A'), p('c', 'C'), p('d', 'D'), p('e', 'E')]
    const diff = diffBodies(left, right)
    expect(diff.map((e) => ({ status: e.status, key: e.leftBlock?._key ?? e.rightBlock?._key }))).toEqual([
      { status: 'unchanged', key: 'a' },
      { status: 'leftOnly', key: 'b' },
      { status: 'unchanged', key: 'c' },
      { status: 'unchanged', key: 'd' },
      { status: 'unchanged', key: 'e' },
    ])
  })

  it('places a deleted middle block as a single leftOnly even when every surviving block has a regenerated _key', () => {
    // Regression: the user reported "the deleted text AND every
    // block after it shows as deleted on the left, with the
    // matching after-blocks shown as added on the right". Root
    // cause: the editor's PT serializer can re-issue `_key`s on
    // save (Tiptap regenerates them when a structural reducer
    // touches the doc), so a key-based anchor pass would have
    // *every* surviving block on the right look like a brand new
    // block, cascading into one giant delete + insert. The LCS
    // pass must anchor on canonical content so the surviving
    // blocks still pair up.
    const left: PortableTextBody = [
      p('orig-a', 'paragraph A'),
      p('orig-b', 'paragraph B that gets deleted'),
      p('orig-c', 'paragraph C'),
      p('orig-d', 'paragraph D'),
      p('orig-e', 'paragraph E'),
    ]
    const right: PortableTextBody = [
      p('pm-1', 'paragraph A'),
      p('pm-2', 'paragraph C'),
      p('pm-3', 'paragraph D'),
      p('pm-4', 'paragraph E'),
    ]
    const diff = diffBodies(left, right)
    const statuses = diff.map((entry) => entry.status)
    expect(statuses.filter((s) => s === 'unchanged')).toHaveLength(4)
    expect(statuses.filter((s) => s === 'leftOnly')).toHaveLength(1)
    expect(statuses.filter((s) => s === 'rightOnly')).toHaveLength(0)
    expect(statuses.filter((s) => s === 'changed')).toHaveLength(0)
  })

  it('places an inserted middle block as a single rightOnly even when every surviving block has a regenerated _key', () => {
    const left: PortableTextBody = [p('orig-a', 'paragraph A'), p('orig-b', 'paragraph B'), p('orig-c', 'paragraph C')]
    const right: PortableTextBody = [
      p('pm-1', 'paragraph A'),
      p('pm-2', 'NEW paragraph in the middle'),
      p('pm-3', 'paragraph B'),
      p('pm-4', 'paragraph C'),
    ]
    const diff = diffBodies(left, right)
    const statuses = diff.map((entry) => entry.status)
    expect(statuses.filter((s) => s === 'unchanged')).toHaveLength(3)
    expect(statuses.filter((s) => s === 'rightOnly')).toHaveLength(1)
    expect(statuses.filter((s) => s === 'leftOnly')).toHaveLength(0)
    expect(statuses.filter((s) => s === 'changed')).toHaveLength(0)
  })

  it('still surfaces a real edit (different decorator) as changed even with regenerated keys', () => {
    const left: PortableTextBody = [
      {
        _type: 'block',
        _key: 'k1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: 'hello' }],
      } as Block,
    ]
    const right: PortableTextBody = [
      {
        _type: 'block',
        _key: 'k2',
        style: 'normal',
        children: [{ _type: 'span', _key: 's2', text: 'hello', marks: ['strong'] }],
      } as Block,
    ]
    expect(diffBodies(left, right)[0].status).toBe('changed')
  })
})

describe('inlineCharDiff', () => {
  it('returns a single op=0 part when both strings are identical', () => {
    const parts = inlineCharDiff('hello world', 'hello world')
    expect(parts).toEqual([{ op: 0, text: 'hello world' }])
  })

  it('emits insertion (op=1) for text the right side adds', () => {
    const parts = inlineCharDiff('hello', 'hello world')
    // Cleanup-semantic merges character runs into "word"-ish chunks.
    expect(parts.some((p) => p.op === 1 && p.text.includes('world'))).toBe(true)
    // No deletions — left was a strict prefix.
    expect(parts.every((p) => p.op !== -1)).toBe(true)
  })

  it('emits deletion (op=-1) for text only present on the left', () => {
    const parts = inlineCharDiff('hello world', 'hello')
    expect(parts.some((p) => p.op === -1 && p.text.includes('world'))).toBe(true)
    expect(parts.every((p) => p.op !== 1)).toBe(true)
  })

  it('mixes insertions and deletions when both sides changed', () => {
    const parts = inlineCharDiff('cat sits', 'dog runs')
    const ops = new Set(parts.map((p) => p.op))
    expect(ops.has(-1)).toBe(true)
    expect(ops.has(1)).toBe(true)
  })

  it('handles empty strings on either side', () => {
    expect(inlineCharDiff('', '')).toEqual([])
    const left = inlineCharDiff('hello', '')
    expect(left).toEqual([{ op: -1, text: 'hello' }])
    const right = inlineCharDiff('', 'hello')
    expect(right).toEqual([{ op: 1, text: 'hello' }])
  })

  it('handles CJK input without exploding into per-character runs', () => {
    // diff-match-patch's `cleanupSemantic` should fold individual
    // codepoints into meaningful chunks even outside ASCII so the
    // diff renderer doesn't show alphabet-soup highlights.
    const parts = inlineCharDiff('你好世界', '你好朋友')
    // First two CJK chars are unchanged; the last two should be a
    // single insert + delete pair, not four individual ops.
    expect(parts.some((p) => p.op === 0 && p.text.includes('你好'))).toBe(true)
    expect(parts.filter((p) => p.op === -1).length).toBeLessThanOrEqual(1)
    expect(parts.filter((p) => p.op === 1).length).toBeLessThanOrEqual(1)
  })
})
