import { getClientAddress } from '@kobato/api/client/client-address'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

export function getDirectRemoteAddress(c: { env: unknown }): string | undefined {
  const env = unsafeCast<Record<string, unknown> | undefined>(c.env)
  const incoming =
    unsafeCast<Record<string, unknown> | undefined>(env?.incoming) ??
    unsafeCast<Record<string, unknown> | undefined>(env?.server)?.incoming
  const socket = unsafeCast<Record<string, unknown> | undefined>(
    unsafeCast<Record<string, unknown> | undefined>(incoming)?.socket,
  )
  if (typeof socket?.remoteAddress === 'string') {
    return socket.remoteAddress
  }
  if (typeof socket?.remotePort === 'number') {
    return `port:${socket.remotePort}`
  }
  return undefined
}

export function isLoopbackAddress(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1') {
    return true
  }
  if (ip.startsWith('127.') && ip.split('.').length === 4) {
    return true
  }
  if (ip.startsWith('::ffff:127.')) {
    return true
  }
  return false
}

export function visitorAddress(
  request: Request,
  directPeer: string | undefined,
  trustedProxies: readonly string[],
): string | undefined {
  if (directPeer === undefined) {
    return undefined
  }
  return getClientAddress(request, directPeer, trustedProxies)
}
