import sharp from 'sharp'

import { encodeIco } from '@/server/domains/assets/ico'

// Keep sharp statically imported — under SEA the bundler rewrites its platform loads.

// Caller (settings service) is responsible for uploading each buffer to S3.
export interface FaviconPack {
  faviconIco: Buffer
  appleTouchIcon: Buffer
  icon192: Buffer
  icon512: Buffer
}

export async function generateFaviconPack(sourceSvg: string): Promise<FaviconPack> {
  const svgBuffer = Buffer.from(sourceSvg, 'utf8')

  const [icon512, icon192, icon180, icon32, icon16] = await Promise.all([
    sharp(svgBuffer).resize(512, 512).png().toBuffer(),
    sharp(svgBuffer).resize(192, 192).png().toBuffer(),
    sharp(svgBuffer).resize(180, 180).png().toBuffer(),
    sharp(svgBuffer).resize(32, 32).png().toBuffer(),
    sharp(svgBuffer).resize(16, 16).png().toBuffer(),
  ])

  return {
    faviconIco: encodeIco([icon16, icon32]),
    appleTouchIcon: icon180,
    icon192,
    icon512,
  }
}
