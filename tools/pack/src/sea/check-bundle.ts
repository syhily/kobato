import { seaServerBundlePath, seaSmokeWorkerBundlePath, seaWorkerBundlePath } from '@kobato/pack/sea/paths.ts'
import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { pathToFileURL } from 'node:url'

const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])

export const SEA_BUNDLE_DEFINED_GLOBALS = [
  '__SEA_APP_VERSION__',
  '__APP_NAME__',
  '__APP_VERSION__',
  '__APP_DESCRIPTION__',
  '__APP_AUTHOR_NAME__',
  '__APP_HOMEPAGE__',
  '__APP_REPOSITORY__',
]

const allowedExternalSpecifiers = new Set(['@aws-sdk/signature-v4a', '@aws-sdk/signature-v4-crt'])
const allowedRelativeSpecifiers = new Set(['./MyComponent'])

export const FORBIDDEN_BROWSER_TELEMETRY_MARKERS = ['@openobserve/'] as const

function isAllowedSpecifier(specifier: string) {
  return builtins.has(specifier) || specifier.startsWith('node:') || allowedExternalSpecifiers.has(specifier)
}

function executableLines(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (line.length === 0) {
        return false
      }
      if (line.startsWith('*') || line.startsWith('//') || line.startsWith('/*')) {
        return false
      }
      return true
    })
}

const buildGlobalPattern = /\b__(?:APP|SEA)_[A-Z0-9_]*__\b/g

export function scanBundleText(text: string, definedGlobals: readonly string[]) {
  const errors: string[] = []

  if (text.includes('import.meta.env')) {
    errors.push('import.meta.env remains in the bundle')
  }

  for (const marker of FORBIDDEN_BROWSER_TELEMETRY_MARKERS) {
    if (text.includes(marker)) {
      errors.push(`browser-only RUM SDK remains in a server bundle: ${marker}`)
    }
  }

  const undefinedGlobals = new Set<string>()
  for (const line of executableLines(text)) {
    for (const match of line.matchAll(/__require\(\s*["']([^"']+)["']\s*\)/g)) {
      const specifier = match[1]
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        errors.push(`relative runtime require remains: ${specifier}`)
        continue
      }
      if (!isAllowedSpecifier(specifier)) {
        errors.push(`external runtime require remains: ${specifier}`)
      }
    }

    for (const match of line.matchAll(/(?<![.\w])require\(\s*["']([^"']+)["']\s*\)/g)) {
      const specifier = match[1]
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        if (allowedRelativeSpecifiers.has(specifier)) {
          continue
        }
        errors.push(`relative require remains: ${specifier}`)
        continue
      }
      if (!isAllowedSpecifier(specifier)) {
        errors.push(`external require remains: ${specifier}`)
      }
    }

    for (const match of line.matchAll(/(?<![.\w])import\(\s*["']([^"']+)["']\s*\)/g)) {
      const specifier = match[1]
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        if (allowedRelativeSpecifiers.has(specifier)) {
          continue
        }
        errors.push(`relative dynamic import remains: ${specifier}`)
        continue
      }
      if (!isAllowedSpecifier(specifier)) {
        errors.push(`external dynamic import remains: ${specifier}`)
      }
    }

    if (line.startsWith('import ')) {
      for (const match of line.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
        const specifier = match[1]
        if (specifier.startsWith('.') || specifier.startsWith('/')) {
          errors.push(`relative import remains: ${specifier}`)
          continue
        }
        if (!isAllowedSpecifier(specifier)) {
          errors.push(`external import remains: ${specifier}`)
        }
      }
    }

    for (const match of line.matchAll(buildGlobalPattern)) {
      const identifier = match[0]
      if (!definedGlobals.includes(identifier)) {
        undefinedGlobals.add(identifier)
      }
    }
  }

  for (const identifier of undefinedGlobals) {
    errors.push(`undefined build-time global remains: ${identifier} (not in the bundle's define table)`)
  }

  return errors
}

function checkBundle(bundlePath: string) {
  return scanBundleText(readFileSync(bundlePath, 'utf-8'), SEA_BUNDLE_DEFINED_GLOBALS)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let failed = false
  for (const bundlePath of [seaServerBundlePath(), seaWorkerBundlePath(), seaSmokeWorkerBundlePath()]) {
    const errors = checkBundle(bundlePath)
    if (errors.length > 0) {
      failed = true
      console.error(`SEA bundle check failed for ${bundlePath}:`)
      for (const error of errors) {
        console.error(`- ${error}`)
      }
    }
  }

  if (failed) {
    process.exit(1)
  }
}
