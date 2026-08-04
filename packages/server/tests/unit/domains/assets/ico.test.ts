import { encodeIco } from '@kobato/server/domains/assets/ico'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#f00"/></svg>'

async function makePng(size: number): Promise<Buffer> {
  return sharp(Buffer.from(SVG, 'utf8')).resize(size, size).png().toBuffer()
}

describe('encodeIco', () => {
  it('writes a valid ICO container around PNG payloads', async () => {
    const icon16 = await makePng(16)
    const icon32 = await makePng(32)

    const ico = encodeIco([icon16, icon32])

    // ICONDIR header: reserved=0, type=1 (ICO), count=2.
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(2)

    // First directory entry: 16×16, 32bpp, points at the first PNG blob.
    const firstDataOffset = 6 + 16 * 2
    expect(ico.readUInt8(6)).toBe(16)
    expect(ico.readUInt8(7)).toBe(16)
    expect(ico.readUInt16LE(12)).toBe(32)
    expect(ico.readUInt32LE(14)).toBe(icon16.length)
    expect(ico.readUInt32LE(18)).toBe(firstDataOffset)

    // Second directory entry: 32×32, follows the first blob.
    expect(ico.readUInt8(22)).toBe(32)
    expect(ico.readUInt8(23)).toBe(32)
    expect(ico.readUInt32LE(30)).toBe(icon32.length)
    expect(ico.readUInt32LE(34)).toBe(firstDataOffset + icon16.length)

    // Payloads are the untouched PNG buffers, in order.
    expect(ico.subarray(firstDataOffset, firstDataOffset + icon16.length).equals(icon16)).toBe(true)
    expect(ico.subarray(firstDataOffset + icon16.length).equals(icon32)).toBe(true)
    expect(ico.length).toBe(firstDataOffset + icon16.length + icon32.length)
  })

  it('encodes 256 as a zero dimension byte', async () => {
    const icon256 = await makePng(256)

    const ico = encodeIco([icon256])

    expect(ico.readUInt8(6)).toBe(0)
    expect(ico.readUInt8(7)).toBe(0)
  })

  it('produces a payload that decodes as a valid PNG at the declared offset', async () => {
    const ico = encodeIco([await makePng(32)])

    // libvips cannot decode ICO containers (browsers can), so verify by
    // extracting the payload via the directory entry and decoding that.
    const payload = ico.subarray(ico.readUInt32LE(18))
    const metadata = await sharp(payload).metadata()
    expect(metadata.format).toBe('png')
    expect(metadata.width).toBe(32)
    expect(metadata.height).toBe(32)
  })

  it('rejects empty input', () => {
    expect(() => encodeIco([])).toThrow('at least one image')
  })

  it('rejects non-PNG buffers', () => {
    expect(() => encodeIco([Buffer.from('not a png')])).toThrow('not a PNG buffer')
  })
})
