import { createCommand } from 'lexical'
import { describe, expect, it } from 'vitest'

import { generateDecoratorNode } from '@/nodes/base/generate-decorator-node'
import { CARD_DECLARATIONS } from '@/nodes/cards'
import { resolveAllCardFacts, resolveCardFacts } from '@/nodes/cards/card-facts'
import { registerHostCard } from '@/nodes/cards/host-card-registry'
import { defineCard } from '@/nodes/cards/host-cards'

// The merge policy's single home: the built-in declarations answer first,
// the host card registry (CONTEXT.md: "host card") is a fallback, never an
// override. Registered at module scope, mirroring the host's own
// module-top-level `defineCard` idiom.
const FACTS_PROBE_COMMAND = createCommand('FACTS_PROBE_COMMAND')

defineCard({
  nodeType: 'factsProbe',
  baseNode: generateDecoratorNode({ nodeType: 'factsProbe' }),
  menu: [{ label: 'Probe', labelKey: 'probe', icon: 'audio', command: FACTS_PROBE_COMMAND, matches: ['probe'] }],
  toolbarLabel: 'facts-probe',
  render: () => null,
})

describe('resolveCardFacts', () => {
  it('answers a built-in card from the declarations', () => {
    const facts = resolveCardFacts('audio')

    expect(facts?.source).toBe('builtin')
    if (facts?.source !== 'builtin') {
      return
    }
    expect(facts.nodeType).toBe('audio')
    expect(facts.declaration).toBe(CARD_DECLARATIONS.find((declaration) => declaration.nodeType === 'audio'))
  })

  it('falls back to the host registry for a host card', () => {
    const facts = resolveCardFacts('factsProbe')

    expect(facts?.source).toBe('host')
    if (facts?.source !== 'host') {
      return
    }
    expect(facts.host.nodeType).toBe('factsProbe')
    expect(facts.host.spec.menu?.[0]?.label).toBe('Probe')
    expect(facts.host.spec.toolbarLabel).toBe('facts-probe')
  })

  it('returns undefined for an unknown node type', () => {
    expect(resolveCardFacts('no-such-card')).toBeUndefined()
  })
})

describe('resolveAllCardFacts', () => {
  it('lists every built-in declaration in declaration order, then the host cards', () => {
    const facts = resolveAllCardFacts()

    expect(facts.slice(0, CARD_DECLARATIONS.length).map((entry) => entry.nodeType)).toEqual(
      CARD_DECLARATIONS.map((declaration) => declaration.nodeType),
    )
    expect(facts.slice(0, CARD_DECLARATIONS.length).every((entry) => entry.source === 'builtin')).toBe(true)
    expect(facts.at(-1)).toMatchObject({ source: 'host', nodeType: 'factsProbe' })
  })
})

describe('the no-override invariant', () => {
  it('keeps answering from the built-in declaration when a host record names the same type', () => {
    // defineCard refuses a colliding nodeType, so drive the registry directly
    // to probe what the resolver guarantees even if that guard is bypassed
    registerHostCard({
      nodeType: 'video',
      spec: {
        nodeType: 'video',
        baseNode: generateDecoratorNode({ nodeType: 'video' }),
        toolbarLabel: 'host-video',
        render: () => null,
      },
    })

    const facts = resolveCardFacts('video')
    expect(facts?.source).toBe('builtin')
    if (facts?.source !== 'builtin') {
      return
    }
    expect(facts.declaration.toolbarLabel).toBe('video')
  })
})
