// Re-export from infra layer so existing callers don't break.
// New code should import directly from `@/server/infra/image/process`.
export {
  processImageBuffer,
  type ProcessImageInput,
  type ProcessImageResize,
  type ProcessedImage,
} from '@/server/infra/image/process'
