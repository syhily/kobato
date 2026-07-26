import sharp from 'sharp'
import { encode as encodeIco } from 'sharp-ico'

// Statically imported and bundled; under SEA the bundler plugin redirects
// the packages' own platform loads to `nativeRequire` (see
// `scripts/sea/redirect-native-requires.ts`).

// Caller (settings service) is responsible for uploading each buffer to
// S3. Returning raw Buffers (not base64) avoids a redundant
// decode→encode round-trip and keeps the surface honest about size.
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
