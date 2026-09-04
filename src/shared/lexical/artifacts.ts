// Server-filled artifact fields on the Lexical node datasets (plan
// docs/plans/inkling-editor-replacement.md, round R9a) — the host pipeline
// owns these slots: stripped from client input at canonicalize, recomputed
// server-side on save, never written back by the editor. The equivalence
// check (`equivalence.ts`) excludes them so a body differing only in
// server-computed artifacts is not "dirty".

/** Shiki-rendered HTML on `codeblock` nodes. */
export const CODEBLOCK_ARTIFACT_KEYS = ['highlightedHtml'] as const

/** KaTeX MathML/SVG on `math` and `math-inline` nodes. */
export const MATH_ARTIFACT_KEYS = ['mathml', 'svg'] as const

/**
 * Save-time meta snapshot on `music-player` nodes (alongside `playerId`).
 * R10's `defineCard` must read exactly these dataset keys.
 */
export const MUSIC_PLAYER_META_KEYS = ['name', 'artist', 'cover', 'audioUrl', 'lyric'] as const

/** Node type → dataset keys the server owns. */
export const SERVER_FILLED_NODE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  codeblock: CODEBLOCK_ARTIFACT_KEYS,
  math: MATH_ARTIFACT_KEYS,
  'math-inline': MATH_ARTIFACT_KEYS,
  'music-player': MUSIC_PLAYER_META_KEYS,
}
