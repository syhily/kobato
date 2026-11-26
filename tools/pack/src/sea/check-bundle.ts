import { type SeaApp, seaServerBundlePath, seaSmokeWorkerBundlePath, seaWorkerBundlePath } from '@kobato/pack/sea/paths'
import { readAppPackage, seaAppDefines } from '@kobato/pack/vite/app-metadata'
import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { pathToFileURL } from 'node:url'

const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])

const APP_PACKAGE_DIRS: Record<SeaApp, string> = { kobato: 'apps/kobato', sayaka: 'apps/sayaka' }

export const ALLOWED_EXTERNAL_SPECIFIERS: Record<SeaApp, readonly string[]> = {
  kobato: ['@aws-sdk/signature-v4a', '@aws-sdk/signature-v4-crt'],
  sayaka: ['@napi-rs/canvas'],
}

export function seaBundleDefinedGlobals(app: SeaApp): string[] {
  return Object.keys(seaAppDefines(readAppPackage(APP_PACKAGE_DIRS[app])))
}

export const SEA_BUNDLE_DEFINED_GLOBALS = seaBundleDefinedGlobals('kobato')

const allowedRelativeSpecifiers = new Set(['./MyComponent'])

export const FORBIDDEN_BROWSER_TELEMETRY_MARKERS = ['@openobserve/'] as const

function isAllowedSpecifier(specifier: string, allowedExternalSpecifiers: readonly string[]) {
  return builtins.has(specifier) || specifier.startsWith('node:') || allowedExternalSpecifiers.includes(specifier)
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

export function scanBundleText(
  text: string,
  definedGlobals: readonly string[],
  allowedExternalSpecifiers: readonly string[] = ALLOWED_EXTERNAL_SPECIFIERS.kobato,
) {
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
      if (!isAllowedSpecifier(specifier, allowedExternalSpecifiers)) {
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
      if (!isAllowedSpecifier(specifier, allowedExternalSpecifiers)) {
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
      if (!isAllowedSpecifier(specifier, allowedExternalSpecifiers)) {
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
        if (!isAllowedSpecifier(specifier, allowedExternalSpecifiers)) {
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

interface CheckedBundle {
  app: SeaApp
  path: string
}

function checkedBundles(): CheckedBundle[] {
  return [
    ...[seaServerBundlePath('kobato'), seaWorkerBundlePath(), seaSmokeWorkerBundlePath()].map((path) => ({
      app: 'kobato' as const,
      path,
    })),
    { app: 'sayaka', path: seaServerBundlePath('sayaka') },
  ]
}

function checkBundle(bundle: CheckedBundle) {
  return scanBundleText(
    readFileSync(bundle.path, 'utf-8'),
    seaBundleDefinedGlobals(bundle.app),
    ALLOWED_EXTERNAL_SPECIFIERS[bundle.app],
  )
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let failed = false
  for (const bundle of checkedBundles()) {
    const errors = checkBundle(bundle)
    if (errors.length > 0) {
      failed = true
      console.error(`SEA bundle check failed for ${bundle.app} (${bundle.path}):`)
      for (const error of errors) {
        console.error(`- ${error}`)
      }
    }
  }

  if (failed) {
    process.exit(1)
  }
}
