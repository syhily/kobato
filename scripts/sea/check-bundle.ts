// Bundle sanity check for the SEA intermediates.
//
// All three bundles must be fully self-contained: every relative
// specifier and every non-builtin bare specifier must have been inlined
// by the vite build, and no `import.meta.env` may survive (vite-style
// env access is meaningless inside the binary). Leftovers would fail at
// runtime — the SEA's restricted require resolves nothing, and the
// embedded worker / materialized server have no node_modules next to
// them — so fail the build here instead. The scan also runs in reverse:
// any `__APP_*__`/`__SEA_*__` compile-time global left in a bundle whose
// define table does not cover it would be a ReferenceError at boot.

import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { pathToFileURL } from 'node:url'

import { seaServerBundlePath, seaSmokeWorkerBundlePath, seaWorkerBundlePath } from './paths.ts'

const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])

// The define table of vite.sea.config.ts — shared by all three SEA
// bundles (server / process-worker / smoke-worker). Keep in sync with the
// `define` block there.
const SEA_BUNDLE_DEFINED_GLOBALS = ['__SEA_APP_VERSION__']

// False-positive allowlist: these specifiers only appear inside STRING
// LITERALS (error messages shipped by upstream packages), never as real
// imports — verified against the vite-built server bundle, which contains
// the identical strings in production today:
//   @aws-sdk/signature-v4a    — @smithy/signature-v4's "please install …"
//                               SigV4a error text embeds
//                               `require('@aws-sdk/signature-v4a')`;
//   @aws-sdk/signature-v4-crt — @smithy/signature-v4's CRT error text
//                               embeds `require("@aws-sdk/signature-v4-crt")`
//                               ("register the package by calling […]").
//                               Only matches the scan once the bundle is
//                               minified onto single lines — still a
//                               string literal, verified in context.
//   ./MyComponent           — React's react.lazy error text embeds
//                             `import('./MyComponent')`.
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

// Compile-time globals the vite build substitutes into a bundle via
// `define` (`__SEA_APP_VERSION__` in vite.sea.config.ts; the `__APP_*__`
// set exists only in vite.config.ts). The reverse scan below fails on any
// `__APP_*__`/`__SEA_*__` identifier left in a bundle that its define
// table does not cover — a leftover would be a bare ReferenceError at
// runtime inside the binary (src/shared/config/version.ts consumes six
// `__APP_*__` globals the SEA build never defines).
const buildGlobalPattern = /\b__(?:APP|SEA)_[A-Z0-9_]*__\b/g

/**
 * Scan one bundle's text for leftovers that would fail at runtime inside
 * the binary. `definedGlobals` is the bundle's vite `define` table — an
 * `__APP_*__`/`__SEA_*__` identifier that survives the build and is NOT
 * in that table is an undefined-global ReferenceError waiting to happen.
 */
export function scanBundleText(text: string, definedGlobals: readonly string[]) {
  const errors: string[] = []

  if (text.includes('import.meta.env')) {
    errors.push('import.meta.env remains in the bundle')
  }

  const undefinedGlobals = new Set<string>()
  for (const line of executableLines(text)) {
    // Rolldown's runtime-external shim: `__require("bare")` is how a
    // failed/externalized CJS require survives into the bundle (a plain-
    // `require` scan cannot see it). Only node builtins may ride it —
    // anything else is a `Cannot find module` at runtime inside the
    // binary (the historical failure shape: a bundled package's require
    // of a sibling package surviving externalization).
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
