import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { userSession } from '@/server/domains/auth/primitives'
import { publicProc } from '@/server/http/orpc-base'
import { tryRenderRateLimit } from '@/server/infra/rate-limit'
import { getKatexRenderer, type KatexRenderer } from '@/server/infra/rendering/katex-renderer'

const MAX_RENDER_INPUT_LENGTH = 10_000

const math = publicProc
  .route({ method: 'POST', path: '/renders/math' })
  .input(z.object({ tex: z.string().max(MAX_RENDER_INPUT_LENGTH), display: z.boolean().optional() }))
  .output(z.object({ mathml: z.string(), error: z.string().nullable() }))
  .handler(async ({ input, context }) => {
    // KaTeX rendering is CPU-bound — a public endpoint is a DoS surface.
    // Admins (editing in the article editor) skip the throttle; anonymous
    // comment authors are rate-limited by IP.
    const isAdmin = userSession(context.session)?.role === 'admin'
    if (!isAdmin) {
      const limit = await tryRenderRateLimit(context.clientAddress)
      if (limit.exceeded) {
        throw new ORPCError('TOO_MANY_REQUESTS', { message: '渲染请求过于频繁，请稍后再试。' })
      }
    }

    if (input.tex.trim() === '') {
      return { mathml: '', error: null }
    }
    let renderer: KatexRenderer
    try {
      renderer = await getKatexRenderer()
    } catch (err) {
      return { mathml: '', error: err instanceof Error ? err.message : 'KaTeX 加载失败' }
    }
    try {
      const mathml = await renderer.render(input.tex, input.display ?? false)
      return { mathml, error: null }
    } catch (err) {
      return { mathml: '', error: err instanceof Error ? err.message : '公式渲染失败' }
    }
  })

export const rendersRouter = { math }
