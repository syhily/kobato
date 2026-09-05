import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5'
import sanitizeHtml from 'sanitize-html'

import type { SanitizeStrategyConfig } from '@/ui/lib/sanitize-html-config'

// Server/SSR engine for `sanitizeHtmlString`; the `sanitize-html-engine-alias`
// vite plugin swaps this module for the browser engine in the client bundle.
//
// Hydration compares the SSR'd `__html` string against what the client render
// computes, so this engine must be BYTE-identical to the browser engine
// (DOMPurify over a real DOM). sanitize-html alone diverges on four points;
// the parse5 round-trip below normalizes all of them to browser semantics:
//
// 1. Void elements — sanitize-html emits `<img />`, browsers serialize `<img>`.
//    parse5's serializer follows the HTML spec, matching `innerHTML` bytes.
// 2. Valueless attributes — sanitize-html emits bare `data-footnotes`,
//    browsers always serialize `data-footnotes=""`.
// 3. Attribute value trimming — DOMPurify trims every attribute value except
//    `value` (purify.js: `name === 'value' ? initValue : stringTrim(...)`);
//    e.g. a music card's `data-lrc` keeps its trailing newline here otherwise.
// 4. SAFE_FOR_XML value check (DOMPurify default) — an attribute whose value
//    carries a comment/CDATA/raw-text closer (`-->`, `]]>`, `</title>`, …) is
//    dropped outright; e.g. a code card whose `data-code` samples a full HTML
//    document loses the attribute on the client.
//
// The style declaration rebuild mirrors the browser engine's hook exactly
// (`prop: value` join, drop empties, remove the attribute when nothing
// survives); sanitize-html's allowedStyles keeps the original declaration
// text (`text-align:right`) which would otherwise mismatch.

// Mirrors DOMPurify's SAFE_FOR_XML regex.
const UNSAFE_XML_ATTR_VALUE = /((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i

type Fragment = DefaultTreeAdapterMap['documentFragment']
type ChildNode = DefaultTreeAdapterMap['childNode']

function normalizeStyleAttribute(value: string): string {
  return value
    .split(';')
    .map((declaration) => {
      const separator = declaration.indexOf(':')
      if (separator <= 0) {
        return ''
      }
      const property = declaration.slice(0, separator).trim().toLowerCase()
      const propertyValue = declaration.slice(separator + 1).trim()
      if (propertyValue === '') {
        return ''
      }
      return `${property}: ${propertyValue}`
    })
    .filter((declaration) => declaration !== '')
    .join('; ')
}

function normalizeNode(node: Fragment | ChildNode): void {
  if ('attrs' in node) {
    for (let idx = node.attrs.length - 1; idx >= 0; idx--) {
      const attr = node.attrs[idx]
      if (attr.name === 'style') {
        const rebuilt = normalizeStyleAttribute(attr.value)
        if (rebuilt === '') {
          node.attrs.splice(idx, 1)
          continue
        }
        attr.value = rebuilt
      } else if (attr.name !== 'value') {
        attr.value = attr.value.trim()
      }
      if (UNSAFE_XML_ATTR_VALUE.test(attr.value)) {
        node.attrs.splice(idx, 1)
      }
    }
  }
  if ('childNodes' in node) {
    for (const child of node.childNodes) {
      normalizeNode(child)
    }
  }
}

function toBrowserBytes(html: string): string {
  const fragment = parseFragment(html)
  normalizeNode(fragment)
  return serialize(fragment)
}

// sanitize-html matches allowed attributes with indexOf / string globs — a
// RegExp entry never matches. Translate the /^data-.*$/ hook into the engine's
// native glob form so it works like DOMPurify's ALLOW_DATA_ATTR; any other
// pattern is a config bug (it would silently strip the attribute).
function translateAttribute(attr: string | RegExp): string {
  if (attr instanceof RegExp) {
    if (attr.source === '^data-.*$') {
      return 'data-*'
    }
    throw new Error(`sanitize-html engine cannot express the attribute pattern ${attr.source}`)
  }
  return attr
}

export function sanitizeHtmlEngine(html: string, config: SanitizeStrategyConfig): string {
  return toBrowserBytes(
    sanitizeHtml(html, {
      allowedTags: [...config.tags],
      allowedAttributes: {
        '*': config.attributes.map(translateAttribute),
      },
      allowedSchemes: [...config.schemes],
      ...(config.styles === undefined
        ? {}
        : {
            allowedStyles: {
              '*': Object.fromEntries(
                Object.entries(config.styles).map(([property, patterns]) => [property, [...patterns]]),
              ),
            },
          }),
    }),
  )
}
