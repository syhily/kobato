import { OpenAPIGenerator } from '@orpc/openapi'

import { apiRouter } from '@/server/http/api-router'

// Dev-only OpenAPI document generated from the live oRPC router.
// Mounted at `/openapi.json` + Swagger UI at `/docs` (see
// `src/server.ts`). The router is the single source of truth; this
// helper is a thin facade over `@orpc/openapi`'s generator.
const generator = new OpenAPIGenerator()

export async function buildOpenApiDocument() {
  return generator.generate(apiRouter, {
    info: {
      title: 'Kobato API',
      version: '1.0.0',
      description: 'Internal API for the Kobato blog platform.',
    },
    servers: [{ url: '/rpc', description: 'oRPC RPC endpoint' }],
  })
}
