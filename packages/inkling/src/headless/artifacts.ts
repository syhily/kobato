export const CODEBLOCK_ARTIFACT_KEYS = ['highlightedHtml'] as const

export const MATH_ARTIFACT_KEYS = ['mathml', 'svg'] as const

export const MUSIC_PLAYER_META_KEYS = ['name', 'artist', 'cover', 'audioUrl', 'lyric'] as const

export const SERVER_FILLED_NODE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  codeblock: CODEBLOCK_ARTIFACT_KEYS,
  math: MATH_ARTIFACT_KEYS,
  'math-inline': MATH_ARTIFACT_KEYS,
  'music-player': MUSIC_PLAYER_META_KEYS,
}
