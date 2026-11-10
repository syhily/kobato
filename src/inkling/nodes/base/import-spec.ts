import type { DOMConversionMap, LexicalNode } from 'lexical'

import type { DecoratorNodeProperty } from '@/inkling/nodes/base/card-specs'

import { readCaptionFromElement } from '@/inkling/nodes/base/utils/read-caption-from-element'

/**
 * The card declaration's DOM-import knowledge, from which the generated node
 * derives `importDOM`. Cards whose parsing is structural keep hand-written
 * parsers and leave the spec unset.
 */
export interface CardImportSpec {
  conversions: readonly ImportConversionSpec[]
}

/** One tag conversion; `guardClass`/`guardSelector` mirror the hand-written parsers' guards. */
export interface ImportConversionSpec {
  tag: string
  priority: 0 | 1 | 2 | 3 | 4
  guardClass?: string
  guardSelector?: string
  reads: readonly ImportReadSpec[]
}

/** One class-regex entry: the first whose `pattern` matches wins; capture group 1 is the raw value, optionally translated through `map`. */
export interface ImportClassMapEntry {
  pattern: RegExp
  map?: Record<string, string>
}

/**
 * One per-property read of a conversion, discriminated on `kind`. `attribute` /
 * `property` are `getAttribute` vs the element property — never substitute one
 * for the other, since `.src` absolutizes.
 */
interface ImportReadSpecBase {
  /** The card property the read writes; must name a key of the node's `properties` (enforced by `validateImportSpec`). */
  name: string
  /** `querySelector` locating the element to read from; reads the matched element itself when unset. */
  selector?: string
  /** Trim the extracted string before later steps. */
  trim?: boolean
  /** Value used when extraction yields null/undefined; the key is omitted when absent. */
  fallback?: unknown
  /** Post-process the extracted string; an `undefined` result omits the key. */
  parse?: (raw: string) => unknown
  /** `'falsy'` drops falsy results, both before `parse` and after it. */
  omit?: 'falsy'
  /** Abort the whole conversion when the extracted value is falsy. */
  required?: boolean
}

export type ImportReadSpec =
  | (ImportReadSpecBase & {
      kind: 'attribute'
      attribute: string
    })
  | (ImportReadSpecBase & {
      kind: 'property'
      property: string
    })
  | (ImportReadSpecBase & { kind: 'text' | 'html' | 'caption' })
  | (ImportReadSpecBase & {
      kind: 'classMap'
      classMap: readonly ImportClassMapEntry[]
    })
  | {
      /** The writes are actually named by `provides`. */
      name: string
      kind: 'composite'
      /** `querySelector` locating the element to read from; reads the matched element itself when unset. */
      selector?: string
      read: (element: Element) => Record<string, unknown>
      /** The payload keys the helper provides; each must name a card property. */
      provides: readonly string[]
    }

// The generated node constructors accept a plain payload record alongside their
// typed partial dataset, so this boundary constructs through that union member.
type ImportNodeClass = new (data: Record<string, unknown>) => LexicalNode

/**
 * Throws when an import-spec read names a property absent from the node's
 * `properties` (composite reads via `provides`), and re-checks the per-kind
 * required fields for untyped consumers.
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
 * Derives a Lexical `importDOM` conversion map from a card's import spec;
 * `nodeClass` is the class `importDOM` was invoked on, so assembled/wrapper
 * subclasses construct themselves.
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
 * Runs one conversion's reads against the matched element; returns `null` when
 * the conversion aborts (a `required` read came up falsy, or a composite read's
 * located element is missing). Pipeline per read (order matters): locate →
 * extract per kind → `required` → `fallback`/omit → `trim` → `omit: 'falsy'` →
 * `parse` → `omit: 'falsy'` again.
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

// Narrowed past the `composite` and `classMap` kinds, which the caller handles
// before extraction, so the switch stays exhaustive by construction
type ElementValueReadSpec = Exclude<ImportReadSpec, { kind: 'classMap' } | { kind: 'composite' }>

function extractValue(read: ElementValueReadSpec, element: Element): unknown {
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
