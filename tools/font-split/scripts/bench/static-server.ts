import { assertUsableCertificate, createLocalhostCertificate } from '@kobato/font-split/scripts/bench/tls-certificate'
import { createServer as createHttpServer, type Server } from 'node:http'
import { createSecureServer, type Http2SecureServer } from 'node:http2'

export interface StaticRoute {
  body: Buffer
  type: string
}

export interface StaticServer {
  h1Origin: string
  h2Origin: string
  close(): Promise<void>
}

const IMMUTABLE = 'public, max-age=31536000, immutable'
const HOST = '127.0.0.1'

function listener(server: Server | Http2SecureServer): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, HOST, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('the static server did not report a TCP port'))
        return
      }
      resolve(`${address.address}:${address.port}`)
    })
  })
}

function serve(
  routes: ReadonlyMap<string, StaticRoute>,
  dynamic: ((url: string) => StaticRoute | null) | undefined,
  req: { url?: string },
  res: { writeHead(status: number, headers: Record<string, string>): unknown; end(body: Buffer): unknown },
): void {
  const url = (req.url ?? '').split('?')[0]!
  const route = routes.get(url) ?? dynamic?.(url) ?? null
  if (route === null) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end(Buffer.from('not found'))
    return
  }
  res.writeHead(200, { 'content-type': route.type, 'cache-control': IMMUTABLE })
  res.end(route.body)
}

export function startStaticServer(
  routes: ReadonlyMap<string, StaticRoute>,
  dynamic?: (url: string) => StaticRoute | null,
): Promise<StaticServer> {
  const h1 = createHttpServer((req, res) => serve(routes, dynamic, req, res))
  const material = createLocalhostCertificate()
  assertUsableCertificate(material)
  const h2 = createSecureServer(material, (req, res) => serve(routes, dynamic, req, res))
  return Promise.all([listener(h1), listener(h2)]).then(([h1Address, h2Address]) => ({
    h1Origin: `http://${h1Address}`,
    h2Origin: `https://${h2Address}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        h2.close(() => h1.close((error) => (error === undefined ? resolve() : reject(error))))
      }),
  }))
}
