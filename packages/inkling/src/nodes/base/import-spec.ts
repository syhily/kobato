import type { DOMConversionMap, LexicalNode } from 'lexical'

import type { DecoratorNodeProperty } from '@/nodes/base/card-specs'

import { readCaptionFromElement } from '@/nodes/base/utils/read-caption-from-element'

/**
 * The card declaration's DOM-import knowledge (CONTEXT.md: "import spec") —
 * declarative conversion entries (tag, priority, guard, per-property reads)
 * defined beside the card's `properties` in its base node module, from which
 * the generated node machinery (`@/nodes/base/generate-decorator-node`)
 * derives `importDOM`. Cards whose parsing is structural (collection
 * payloads, sibling walking, DOM mutation, derived payloads) keep
 * hand-written parsers and leave the spec unset.
 *
 * The vocabulary replaces the per-card `<card>-parser.ts` modules whose
 * conversions were flat attribute/text reads; every entry below reproduces
 * one of those reads verbatim, so node state after HTML import is identical
 * to the hand-written parsers'.
 */
export interface CardImportSpec {
  conversions: readonly ImportConversionSpec[]
}

/**
 * One tag conversion. `guardClass` reproduces the parsers'
 * `classList.contains('inkling-<card>-card')` guards; `guardSelector`
 * reproduces image's `figure` → `querySelector('img')` guard. The tag key
 * already implies the tag check (Lexical dispatches conversions by
 * `nodeName`), so the parsers' redundant `tagName ===` re-checks are dropped.
 */
export interface ImportConversionSpec {
  tag: string
  priority: 0 | 1 | 2 | 3 | 4
  guardClass?: string
  guardSelector?: string
  reads: readonly ImportReadSpec[]
}

/**
 * One ordered class-regex entry of a `classMap` read. The first entry whose
 * `pattern` matches the element's `className` wins; capture group 1 is the
 * raw value, optionally translated through `map` (image's
 * `FillWidth → full` / `OutsetCenter → wide`). An unmapped capture falls
 * through to the next entry.
 */
export interface ImportClassMapEntry {
  pattern: RegExp
  map?: Record<string, string>
}

/**
 * One per-property read of a conversion, by kind:
 *
 * - `attribute`: `getAttribute(attribute)` of the located element (button's
 *   `href`, file's `src`, video's `data-*` thumbnails).
 * - `property`: element property read (`property` names it) — audio/video
 *   `.src`/`.loop`/`.width`. Never substitute `getAttribute`: `.src`
 *   absolutizes.
 * - `text` / `html`: `textContent` / `innerHTML` of the located element,
 *   with optional `trim`.
 * - `caption`: `readCaptionFromElement` of the element (keeps its
 *   cleanBasicHtml join semantics; the util stays shared with the surviving
 *   gallery/codeblock parsers).
 * - `classMap`: ordered `classMap` entries matched against the element's
 *   `className`; `fallback` is the no-match default (video's `'regular'`),
 *   otherwise the key is omitted on no match (button/callout/image).
 * - `composite`: a named helper (`read`) whose result is merged into the
 *   payload under its `provides` keys (image's
 *   `readImageAttributesFromElement`, single-sourced in
 *   `@/nodes/base/utils/read-image-attributes-from-element`). A missing
 *   located element aborts the conversion, mirroring image's
 *   `if (!img) return null`.
 *
 * `parse` is a per-card hand-written lambda (file's `sizeToBytes`, audio's
 * and video's deliberately separate duration parses); returning `undefined`
 * omits the key.
 *
 * The union is discriminated on `kind`: the fields a kind requires exist on
 * its member, so the pipeline reads them without assertions.
 * `validateImportSpec` re-checks them at class-creation time for untyped
 * consumers.
 */
interface ImportReadSpecBase {
  /** The card property the read writes; must name a key of the node's `properties` (enforced by `validateImportSpec`). Ignored for `kind: 'composite'`, whose writes are named by `provides` instead. */
  name: string
  /** `querySelector` locating the element to read from; reads from the matched element itself when unset. */
  selector?: string
  /** Trim the extracted string before later steps. */
  trim?: boolean
  /** Value used when extraction yields null/undefined (missing element or attribute); the key is omitted when no fallback is declared. */
  fallback?: unknown
  /** Post-process the extracted string; an `undefined` result omits the key. */
  parse?: (raw: string) => unknown
  /** `'falsy'` drops falsy results — applied both before `parse` (mirroring the parsers' `if (text)` guards) and after it. */
  omit?: 'falsy'
  /** Abort the whole conversion (return `null`) when the extracted value is falsy — mirrors video's `if (!videoSrc) return null`. */
  required?: boolean
}

export type ImportReadSpec =
  | (ImportReadSpecBase & {
      kind: 'attribute'
      /** The attribute name (e.g. `href`, `data-inkling-thumbnail`). */
      attribute: string
    })
  | (ImportReadSpecBase & {
      kind: 'property'
      /** The element property name (e.g. `src`, `loop`). */
      property: string
    })
  | (ImportReadSpecBase & { kind: 'text' | 'html' | 'caption' })
  | (ImportReadSpecBase & {
      kind: 'classMap'
      /** The ordered class-regex entries. */
      classMap: readonly ImportClassMapEntry[]
    })
  | {
      /** Kept for parity with the other kinds; the writes are named by `provides` instead. */
      name: string
      kind: 'composite'
      /** `querySelector` locating the element to read from; reads from the matched element itself when unset. */
      selector?: string
      /** The helper producing the partial payload; narrows the located element itself. */
      read: (element: Element) => Record<string, unknown>
      /** The payload keys the helper provides; each must name a card property. */
      provides: readonly string[]
    }

// The generated node constructors accept a plain payload record alongside
// their typed partial dataset (see the constructor in
// generate-decorator-node.ts) — the payload built here is such a record, so
// the boundary constructs through that member of the union.
type ImportNodeClass = new (data: Record<string, unknown>) => LexicalNode

/**
 * Throws when an import-spec read names a property absent from the node's
 * `properties` — the structural agreement check between the field list and
 * the reads, run at class-creation time. Composite reads are checked through
 * their `provides` list. Also re-checks the per-kind required fields the
 * `ImportReadSpec` union declares, so untyped consumers fail loudly here
 * instead of degrading silently at import time.
 */
export function validateImportSpec(
  spec: CardImportSpec,
  properties: readonly DecoratorNodeProperty[],
  nodeType?: string,
) {
  const propertyNames = new Set(properties.map((prop) => prop.name))

  spec.conversions.forEach((conversion) => {
    conversion.reads.forEach((read) => {
      if (
        (read.kind === 'attribute' && !read.attribute) ||
        (read.kind === 'property' && !read.property) ||
        (read.kind === 'classMap' && (!read.classMap || read.classMap.length === 0)) ||
        (read.kind === 'composite' && (!read.read || !read.provides || read.provides.length === 0))
      ) {
        throw new Error(
          `[generateDecoratorNode] ${nodeType ? `${nodeType}: ` : ''}importSpec read "${read.name}" (tag "${conversion.tag}") is missing the fields its "${read.kind}" kind requires`,
        )
      }

      const names = read.kind === 'composite' ? read.provides : [read.name]
      names.forEach((name) => {
        if (!propertyNames.has(name)) {
          throw new Error(
            `[generateDecoratorNode] ${nodeType ? `${nodeType}: ` : ''}importSpec read "${name}" (tag "${conversion.tag}") does not match a property`,
          )
        }
      })
    })
  })
}

/**
 * Derives a Lexical `importDOM` conversion map from a card's import spec.
 * `nodeClass` is the class the static `importDOM` was invoked on (Lexical
 * calls it with the registered class), so assembled/wrapper subclasses keep
 * constructing themselves and nested editors keep populating on paste.
 */
export function buildImportConversions(spec: CardImportSpec, nodeClass: ImportNodeClass): DOMConversionMap {
  const map: Record<string, DOMConversionMap[string]> = {}

  spec.conversions.forEach((conversion) => {
    map[conversion.tag] = (nodeElem: HTMLElement) => {
      if (conversion.guardClass && !nodeElem.classList.contains(conversion.guardClass)) {
        return null
      }
      if (conversion.guardSelector && !nodeElem.querySelector(conversion.guardSelector)) {
        return null
      }

      return {
        conversion(domNode: HTMLElement) {
          const payload = readImportPayload(conversion, domNode)
          if (payload === null) {
            return null
          }
          return { node: new nodeClass(payload) }
        },
        priority: conversion.priority,
      }
    }
  })

  return map
}

/**
 * Runs one conversion's reads against the matched element. Returns `null`
 * when the conversion aborts (a `required` read came up falsy, or a
 * composite read's located element is missing).
 *
 * Pipeline per read: locate (`selector` ? `querySelector` : self) → extract
 * per kind → `required` aborts on a falsy value → null/undefined yields
 * `fallback` when declared, else the key is omitted → `trim` → `omit:
 * 'falsy'` drops a falsy raw value (the parsers' `if (text)` guards) →
 * `parse` (`undefined` result omits) → `omit: 'falsy'` drops a falsy result
 * → `payload[name] = value`.
 */
function readImportPayload(conversion: ImportConversionSpec, domNode: HTMLElement): Record<string, unknown> | null {
  const payload: Record<string, unknown> = {}

  for (const read of conversion.reads) {
    if (read.kind === 'composite') {
      const element = read.selector ? domNode.querySelector(read.selector) : domNode
      if (!element) {
        return null
      }
      const provided = read.read(element)
      read.provides.forEach((key) => {
        if (key in provided) {
          payload[key] = provided[key]
        }
      })
      continue
    }

    let value: unknown
    if (read.kind === 'classMap') {
      value = matchClassMap(read, domNode)
    } else {
      const element = read.selector ? domNode.querySelector(read.selector) : domNode
      value = element === null ? null : extractValue(read, element)
    }

    if (read.required && !value) {
      return null
    }

    if (value === null || value === undefined) {
      if ('fallback' in read) {
        value = read.fallback
      } else {
        continue
      }
    }

    if (read.trim && typeof value === 'string') {
      value = value.trim()
    }

    if (read.omit === 'falsy' && !value) {
      continue
    }

    if (read.parse && typeof value === 'string') {
      value = read.parse(value)
      if (value === undefined) {
        continue
      }
    }

    if (read.omit === 'falsy' && !value) {
      continue
    }

    payload[read.name] = value
  }

  return payload
}

function extractValue(read: ImportReadSpec, element: Element): unknown {
  switch (read.kind) {
    case 'attribute':
      return element.getAttribute(read.attribute)
    case 'property':
      return Reflect.get(element, read.property)
    case 'text':
      return element.textContent
    case 'html':
      return element.innerHTML
    case 'caption':
      return readCaptionFromElement(element)
    default:
      return null
  }
}

function matchClassMap(read: Extract<ImportReadSpec, { kind: 'classMap' }>, domNode: HTMLElement): string | null {
  for (const entry of read.classMap) {
    const match = domNode.className.match(entry.pattern)
    if (match) {
      const raw = match[1]
      const mapped = entry.map ? entry.map[raw] : raw
      if (mapped !== undefined) {
        return mapped
      }
    }
  }
  return null
}
