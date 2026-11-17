// Host-card slash-menu alias table (`matches`).
//
// inkling's matcher (`card-menu-build.ts`) lowercases the query and
// prefix-matches with `startsWith` — entries are NOT lowercased, so English
// aliases MUST be lowercase; CJK aliases match as written. Built-in cards
// (including the stock image card) never read host `matches`, so their search
// stays unlocalized (accepted); the `image` entry here only serves menu entries
// the host appends after the KobatoImageNode same-type replacement.

export const inklingHostCardMatches = {
  solution: ['solution', 'hint', 'answer', '解答', '题解', '提示'],
  twoColumn: ['columns', 'column', 'split', 'two', '分栏', '双栏', '两栏'],
  musicPlayer: ['music', 'audio', 'song', '音乐', '播放器'],
  image: ['image', 'img', 'picture', '图片', '图'],
} as const satisfies Record<string, readonly string[]>
