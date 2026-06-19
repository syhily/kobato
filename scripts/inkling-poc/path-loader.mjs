import { readFileSync } from 'node:fs'

const ROOT = new URL('../..', import.meta.url)

const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

function resolveWithExtensions(url) {
  for (const ext of EXTENSIONS) {
    const candidate = new URL(`${url.pathname}${ext}`, url)
    try {
      readFileSync(candidate)
      return candidate
    } catch {
      // try next
    }
  }
  return url
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const mapped = new URL(specifier.replace(/^@\//, 'src/'), ROOT)
    const resolved = resolveWithExtensions(mapped)
    return nextResolve(resolved.href, context)
  }
  return nextResolve(specifier, context)
}
