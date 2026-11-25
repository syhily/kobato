import compiledScript from '@/route-warmup/compiled-script'
import { injectWarmupChunks } from '@/route-warmup/inject'

interface RouteWarmupScriptProps {
  chunks: string[]
  nonce?: string
}

export function RouteWarmupScript({ chunks, nonce }: RouteWarmupScriptProps) {
  if (import.meta.env.DEV) {
    return null
  }
  if (!compiledScript || chunks.length === 0) {
    return null
  }

  const html = injectWarmupChunks(compiledScript, chunks)
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: html }} />
}
