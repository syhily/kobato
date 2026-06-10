import sharp from 'sharp'

import { DomainError } from '@/server/infra/http/errors'
import { rgbaToThumbHash } from '@/shared/utils/thumbhash'

const THUMBHASH_MAX_DIMENSION = 100

export interface ProcessImageResize {
  width: number
  height: number
  fit?: 'cover' | 'contain' | 'inside' | 'outside' | 'fill'
}

export interface ProcessImageInput {
  buffer: Buffer
  jpegQuality: number
  resize?: ProcessImageResize
}

export interface ProcessedImage {
  buffer: Buffer
  width: number
  height: number
  byteSize: number
  thumbhash: string
}

const MAX_INPUT_PIXELS = 16384 * 16384

export async function processImageBuffer(input: ProcessImageInput): Promise<ProcessedImage> {
  let pipeline: sharp.Sharp
  try {
    pipeline = sharp(input.buffer, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true,
    }).rotate()
  } catch (error) {
    throw new DomainError('BAD_REQUEST', '无法解析图片数据', [
      { message: error instanceof Error ? error.message : String(error) },
    ])
  }

  let normalisedBuffer: Buffer
  try {
    let staged = pipeline.clone()
    if (input.resize !== undefined) {
      staged = staged.resize({
        width: input.resize.width,
        height: input.resize.height,
        fit: input.resize.fit ?? 'cover',
        withoutEnlargement: false,
      })
    }
    normalisedBuffer = await staged.jpeg({ quality: input.jpegQuality, mozjpeg: true, progressive: true }).toBuffer()
  } catch (error) {
    throw new DomainError('BAD_REQUEST', '图片重新编码失败', [
      { message: error instanceof Error ? error.message : String(error) },
    ])
  }

  const normalisedMeta = await sharp(normalisedBuffer, { failOn: 'error' }).metadata()
  const width = normalisedMeta.width
  const height = normalisedMeta.height
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new DomainError('BAD_REQUEST', '图片尺寸无效')
  }

  const thumbhash = await computeThumbhash(normalisedBuffer, width, height)

  return {
    buffer: normalisedBuffer,
    width,
    height,
    byteSize: normalisedBuffer.byteLength,
    thumbhash,
  }
}

async function computeThumbhash(imageBuffer: Buffer, sourceWidth: number, sourceHeight: number): Promise<string> {
  const { width, height } = fitInside(sourceWidth, sourceHeight, THUMBHASH_MAX_DIMENSION, THUMBHASH_MAX_DIMENSION)

  const { data, info } = await sharp(imageBuffer, { failOn: 'error' })
    .resize({
      width,
      height,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const hash = rgbaToThumbHash(info.width, info.height, data)
  return Buffer.from(hash).toString('base64')
}

function fitInside(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))
  return { width: targetWidth, height: targetHeight }
}
