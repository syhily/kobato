import type { DecoratorNodeProperty } from '@kobato/inkling-internal/nodes/base/card-specs'
import type { DOMConversionMap, LexicalNode } from 'lexical'

import { readCaptionFromElement } from '@kobato/inkling-internal/nodes/base/utils/read-caption-from-element'

export interface CardImportSpec {
  conversions: readonly ImportConversionSpec[]
}

export interface ImportConversionSpec {
  tag: string
  priority: 0 | 1 | 2 | 3 | 4
  guardClass?: string
  guardSelector?: string
  reads: readonly ImportReadSpec[]
}

export interface ImportClassMapEntry {
  pattern: RegExp
  map?: Record<string, string>
}

interface ImportReadSpecBase {
  name: string
  selector?: string
  trim?: boolean
  fallback?: unknown
  parse?: (raw: string) => unknown
  omit?: 'falsy'
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
      name: string
      kind: 'composite'
      selector?: string
      read: (element: Element) => Record<string, unknown>
      provides: readonly string[]
    }

type ImportNodeClass = new (data: Record<string, unknown>) => LexicalNode

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
