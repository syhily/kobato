export const inklingHostCardMatches = {
  solution: ['solution', 'hint', 'answer', '解答', '题解', '提示'],
  twoColumn: ['columns', 'column', 'split', 'two', '分栏', '双栏', '两栏'],
  musicPlayer: ['music', 'audio', 'song', '音乐', '播放器'],
  image: ['image', 'img', 'picture', '图片', '图'],
} as const satisfies Record<string, readonly string[]>
