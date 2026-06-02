import { useEffect, useState } from 'react'

import { defaultThemeColor } from '@/ui/public/aplayer/constants'
import type { AudioInfo } from '@/ui/public/aplayer/types'
import { getImageColor } from '@/ui/public/aplayer/utils/get-image-color'

function shouldUseColorThief(song: AudioInfo | undefined, fallback = defaultThemeColor): boolean {
  if (song?.theme === 'auto' && song.cover) {
    return true
  }
  return fallback === 'auto' && Boolean(song?.cover)
}

export function useThemeColor(song: AudioInfo | undefined, fallback = defaultThemeColor): string {
  const [coverColorMap, setCoverColorMap] = useState<Record<string, string>>({})

  useEffect(() => {
    if (shouldUseColorThief(song, fallback)) {
      const coverUrl = song!.cover!
      void getImageColor(coverUrl).then((hex) => {
        setCoverColorMap((prev) => ({ ...prev, [coverUrl]: hex }))
      }).catch(() => {
        // ignore color extraction failures
      })
    }
  }, [song, fallback])

  if (!song) {
    return fallback
  }

  if (shouldUseColorThief(song, fallback)) {
    return coverColorMap[song.cover!] ?? (fallback === 'auto' ? defaultThemeColor : fallback)
  }

  return song.theme ?? (fallback === 'auto' ? defaultThemeColor : fallback)
}
