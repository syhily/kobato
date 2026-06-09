import { useCallback } from 'react'

/**
 * Extract a dominant color from an image URL using a canvas.
 * Returns a hex color string or null if extraction fails.
 */
export function useDominantColor() {
  return useCallback((imageUrl: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(null)
            return
          }
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
          resolve(hex)
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = imageUrl
    })
  }, [])
}
