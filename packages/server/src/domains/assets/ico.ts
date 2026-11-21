const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const IHDR_TYPE = 0x49484452
const ICONDIR_HEADER_SIZE = 6
const ICONDIRENTRY_SIZE = 16
const MAX_ICON_SIZE = 256

function pngDimensions(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE) || png.readUInt32BE(12) !== IHDR_TYPE) {
    throw new Error('encodeIco: input is not a PNG buffer')
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

export function encodeIco(images: Buffer[]): Buffer {
  if (images.length === 0) {
    throw new Error('encodeIco: at least one image is required')
  }

  const dimensions = images.map(pngDimensions)
  for (const { width, height } of dimensions) {
    if (width > MAX_ICON_SIZE || height > MAX_ICON_SIZE) {
      throw new Error(`encodeIco: ${width}×${height} exceeds the ICO 256×256 limit`)
    }
  }

  const header = Buffer.alloc(ICONDIR_HEADER_SIZE)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const directory = Buffer.alloc(ICONDIRENTRY_SIZE * images.length)
  let offset = ICONDIR_HEADER_SIZE + directory.length
  images.forEach((png, index) => {
    const { width, height } = dimensions[index]!
    const base = index * ICONDIRENTRY_SIZE
    directory.writeUInt8(width % 256, base)
    directory.writeUInt8(height % 256, base + 1)
    directory.writeUInt8(0, base + 2)
    directory.writeUInt8(0, base + 3)
    directory.writeUInt16LE(1, base + 4)
    directory.writeUInt16LE(32, base + 6)
    directory.writeUInt32LE(png.length, base + 8)
    directory.writeUInt32LE(offset, base + 12)
    offset += png.length
  })

  return Buffer.concat([header, directory, ...images])
}
