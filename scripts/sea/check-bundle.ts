// Bundle sanity check for the SEA intermediates: every bundle must be fully
// self-contained (leftovers fail at runtime — no node_modules next to the
// binary). Also fails on any `__APP_*__`/`__SEA_*__` identifier the bundle's
// define table does not cover (a bare ReferenceError at boot).

import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { pathToFileURL } from 'node:url'

import { seaServerBundlePath, seaSmokeWorkerBundlePath, seaWorkerBundlePath } from './paths.ts'

const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])

// The vite.sea.config.ts `define` table, shared by all three bundles —
// keep in sync with the define block there; exported for the contract test.
export const SEA_BUNDLE_DEFINED_GLOBALS = [
  '__SEA_APP_VERSION__',
  // The six `__APP_*__` globals `@/shared/config/version` consumes.
  '__APP_NAME__',
  '__APP_VERSION__',
  '__APP_DESCRIPTION__',
  '__APP_AUTHOR_NAME__',
  '__APP_HOMEPAGE__',
  '__APP_REPOSITORY__',
]

// False-positive allowlist: these specifiers appear only inside string
// literals (error texts shipped by upstream packages), never as real imports.
const allowedExternalSpecifiers = new Set(['@aws-sdk/signature-v4a', '@aws-sdk/signature-v4-crt'])
const allowedRelativeSpecifiers = new Set(['./MyComponent'])

function isAllowedSpecifier(specifier: string) {
  return builtins.has(specifier) || specifier.startsWith('node:') || allowedExternalSpecifiers.has(specifier)
}

/** Comment and blank lines can legally contain require-like text. */
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

// Compile-time globals the vite build substitutes via `define`; the reverse
// scan fails on any `__APP_*__`/`__SEA_*__` identifier the define table
// does not cover — a leftover is a bare ReferenceError at runtime.
const buildGlobalPattern = /\b__(?:APP|SEA)_[A-Z0-9_]*__\b/g

/**
 * Scan one bundle's text for leftovers that would fail at runtime inside
 * the binary, including undefined build-time globals.
 */
export function scanBundleText(text: string, definedGlobals: readonly string[]) {
  const errors: string[] = []

  if (text.includes('import.meta.env')) {
    errors.push('import.meta.env remains in the bundle')
  }

  const undefinedGlobals = new Set<string>()
  for (const line of executableLines(text)) {
    // Rolldown's runtime-external shim `__require("bare")` — only node
    // builtins may ride it; anything else is a `Cannot find module` at runtime.
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
