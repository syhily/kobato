import { DEFAULT_REQUEST_TIMEOUT_MS } from '@kobato/api/client/request-timeout'
import { isValidTrustedProxyEntry } from '@kobato/auth/trusted-proxy'
import { z } from 'zod'

const DEV_KOBATO_RPC_URL = 'http://127.0.0.1:4321/rpc'

const envSchema = z.object({
  SAYAKA_HOST: z.string().min(1).default('0.0.0.0'),
  SAYAKA_PORT: z.coerce.number().int().min(1).max(65535).default(4322),
  SAYAKA_KOBATO_RPC_URL: z.string().min(1).optional(),
  SAYAKA_KOBATO_TIMEOUT_MS: z.coerce.number().int().min(1).default(DEFAULT_REQUEST_TIMEOUT_MS),
  SAYAKA_TRUSTED_PROXIES: z.string().optional(),
})

export interface SayakaConfig {
  host: string
  port: number
  kobatoRpcUrl: string
  kobatoOrigin: string
  kobatoTimeoutMs: number
  trustedProxies: string[]
}

function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n')
}

export function parseSayakaConfig(env: Record<string, string | undefined>, isDev: boolean): SayakaConfig {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Invalid sayaka configuration:\n${formatIssues(parsed.error.issues)}`)
  }

  const rpcUrl = parsed.data.SAYAKA_KOBATO_RPC_URL ?? (isDev ? DEV_KOBATO_RPC_URL : undefined)
  if (rpcUrl === undefined) {
    throw new Error(
      'SAYAKA_KOBATO_RPC_URL is required in a production build: set it to the full RPC URL of the kobato backend, ' +
        `e.g. ${DEV_KOBATO_RPC_URL}`,
    )
  }
  const rpc = URL.parse(rpcUrl)
  if (rpc === null || (rpc.protocol !== 'http:' && rpc.protocol !== 'https:')) {
    throw new Error(`SAYAKA_KOBATO_RPC_URL must be a valid http(s) URL, got: ${rpcUrl}`)
  }

  const trustedProxies = (parsed.data.SAYAKA_TRUSTED_PROXIES ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  const invalid = trustedProxies.filter((entry) => !isValidTrustedProxyEntry(entry))
  if (invalid.length > 0) {
    throw new Error(
      `SAYAKA_TRUSTED_PROXIES entries must be IP addresses or IPv4 CIDRs (e.g. 172.18.0.0/16): ${invalid.join(', ')}`,
    )
  }
  if (trustedProxies.includes('0.0.0.0/0')) {
    throw new Error('SAYAKA_TRUSTED_PROXIES must not contain 0.0.0.0/0 — that would trust proxy headers from any peer')
  }

  return {
    host: parsed.data.SAYAKA_HOST,
    port: parsed.data.SAYAKA_PORT,
    kobatoRpcUrl: rpcUrl,
    kobatoOrigin: rpc.origin,
    kobatoTimeoutMs: parsed.data.SAYAKA_KOBATO_TIMEOUT_MS,
    trustedProxies,
  }
}

export const sayakaConfig = parseSayakaConfig(process.env, import.meta.env.DEV)
