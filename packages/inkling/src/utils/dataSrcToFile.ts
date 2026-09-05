export async function dataSrcToFile(src: string, fileName?: string): Promise<File | undefined> {
  if (!src.startsWith('data:')) {
    return
  }

  const mimeType = src.split(',')[0].split(':')[1].split(';')[0]

  let resolvedName = fileName
  if (!resolvedName) {
    let uuid: string
    try {
      uuid = window.crypto.randomUUID()
    } catch (e) {
      uuid = Array.from(window.crypto.getRandomValues(new Uint8Array(8)), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('')
    }
    const extension = mimeType.split('/')[1]
    resolvedName = `data-src-image-${uuid}.${extension}`
  }

  const blob = await fetch(src).then((it) => it.blob())
  const file = new File([blob], resolvedName, { type: mimeType, lastModified: Date.now() })

  return file
}
