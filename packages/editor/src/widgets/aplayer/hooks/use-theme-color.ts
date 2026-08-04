import type { AudioInfo } from '@kobato/editor/widgets/aplayer/types'

import { defaultThemeColor } from '@kobato/editor/widgets/aplayer/constants'
import { getImageColor } from '@kobato/editor/widgets/aplayer/utils/get-image-color'
import { useEffect, useState } from 'react'

function shouldUseColorThief(song: AudioInfo | undefined, fallback = defaultThemeColor): boolean {
  if (song?.theme === 'auto' && song.cover) {
    return true
  }
  return fallback === 'auto' && Boolean(song?.cover)
}

export function useThemeColor(song: AudioInfo | undefined, fallback = defaultThemeColor): string {
  const [coverColorMap, setCoverColorMap] = useState<Record<string, string>>({})

  useEffect(() => {
    const coverUrl = song?.cover
    if (coverUrl && shouldUseColorThief(song, fallback)) {
      void getImageColor(coverUrl)
        .then((hex) => {
          setCoverColorMap((prev) => ({ ...prev, [coverUrl]: hex }))
        })
        .catch(() => {
          // ignore color extraction failures
        })
    }
  }, [song, fallback])

  if (!song) {
    return fallback
  }

  if (shouldUseColorThief(song, fallback)) {
    const cover = song?.cover
    if (cover) {
      return coverColorMap[cover] ?? (fallback === 'auto' ? defaultThemeColor : fallback)
    }
  }

  return song.theme ?? (fallback === 'auto' ? defaultThemeColor : fallback)
}
