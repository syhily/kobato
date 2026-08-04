export function getImageColor(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve('#007a82')
        return
      }
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      ctx.drawImage(img, 0, 0)
      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        let r = 0
        let g = 0
        let b = 0
        let count = 0
        for (let i = 0; i < data.length; i += 16) {
          const ri = data[i]
          const gi = data[i + 1]
          const bi = data[i + 2]
          const ai = data[i + 3]
          if (ai < 128 || (ri > 240 && gi > 240 && bi > 240)) {
            continue
          }
          r += ri
          g += gi
          b += bi
          count++
        }
        if (count === 0) {
          resolve('#007a82')
          return
        }
        const toHex = (n: number) =>
          Math.round(n / count)
            .toString(16)
            .padStart(2, '0')
        resolve(`#${toHex(r)}${toHex(g)}${toHex(b)}`)
      } catch {
        resolve('#007a82')
      }
    }
    img.onerror = () => resolve('#007a82')
    img.src = imageUrl
  })
}
