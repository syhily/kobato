import { useCallback } from 'react'

// Per-URL cache — repeated track switches skip re-downloading the cover.
const colorCache = new Map<string, string | null>()

/** Extract a dominant color from an image URL via canvas, or null on
 *  failure; results cached per URL. */
export function useDominantColor() {
  return useCallback((imageUrl: string): Promise<string | null> => {
    const cached = colorCache.get(imageUrl)
    if (cached !== undefined) {
      return Promise.resolve(cached)
    }

    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            colorCache.set(imageUrl, null)
            resolve(null)
            return
          }
          // Sample at 64×64 — no need to process full-resolution data.
          canvas.width = 64
          canvas.height = 64
          ctx.drawImage(img, 0, 0, 64, 64)
          const imageData = ctx.getImageData(0, 0, 64, 64)
          const data = imageData.data
          let r = 0
          let g = 0
          let b = 0
          let count = 0
          for (let i = 0; i < data.length; i += 16) {
            const ri = data[i]
            const gi = data[i + 1]
            const bi = data[i + 2]
            const ai = data[i + 3]
            if (ai < 128) {
              continue
            }
            // Skip near-white and near-black pixels
            if (ri > 240 && gi > 240 && bi > 240) {
              continue
            }
            if (ri < 15 && gi < 15 && bi < 15) {
              continue
            }
            r += ri
            g += gi
            b += bi
            count++
          }
          if (count === 0) {
            colorCache.set(imageUrl, null)
            resolve(null)
            return
          }
          const hex = `#${Math.round(r / count)
            .toString(16)
            .padStart(2, '0')}${Math.round(g / count)
            .toString(16)
            .padStart(2, '0')}${Math.round(b / count)
            .toString(16)
            .padStart(2, '0')}`
          colorCache.set(imageUrl, hex)
          resolve(hex)
        } catch {
          colorCache.set(imageUrl, null)
          resolve(null)
        }
      }
      img.onerror = () => {
        colorCache.set(imageUrl, null)
        resolve(null)
      }
      img.src = imageUrl
    })
  }, [])
}
