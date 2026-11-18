export type LrcLine = [time: number, text: string]

/** Parses LRC text into sorted `[seconds, text]` lines (multi-timestamp lines
 *  fan out; `<mm:ss.xx>` word-timing tags are stripped). Null, undefined, and
 *  empty input all parse to `[]`. */
export function parseLrc(lrcInput?: string | null): LrcLine[] {
  if (!lrcInput) {
    return []
  }

  const lrc_s = lrcInput.replace(/([^\]^\n])\[/g, (match, p1) => p1 + '\n[')
  const lyric = lrc_s.split('\n')
  const lrc: LrcLine[] = []

  for (let i = 0; i < lyric.length; i++) {
    const lrcTimes = lyric[i].match(/\[(\d{2}):(\d{2})(\.(\d{2,3}))?]/g)
    const lrcText = lyric[i]
      .replace(/.*\[(\d{2}):(\d{2})(\.(\d{2,3}))?]/g, '')
      .replace(/<(\d{2}):(\d{2})(\.(\d{2,3}))?>/g, '')
      .replace(/^\s+|\s+$/g, '')

    if (lrcTimes) {
      for (let j = 0; j < lrcTimes.length; j++) {
        const oneTime = /\[(\d{2}):(\d{2})(\.(\d{2,3}))?]/.exec(lrcTimes[j])
        if (!oneTime) {
          continue
        }
        const min2sec = Number(oneTime[1]) * 60
        const sec2sec = parseInt(oneTime[2], 10)
        const msec2sec = oneTime[4] ? parseInt(oneTime[4], 10) / (oneTime[4].length === 2 ? 100 : 1000) : 0
        lrc.push([min2sec + sec2sec + msec2sec, lrcText])
      }
    }
  }

  lrc.sort((a, b) => a[0] - b[0])
  return lrc
}
