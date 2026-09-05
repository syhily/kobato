import { createCommand } from 'lexical'
import { describe, expect, it } from 'vitest'

import type { CardConfig, SnippetItem } from '@/context/InklingHostIntegrationContext'
import type { CardMenuSource, ResolveMenuLabel } from '@/nodes/cards/card-menu-build'

import { getCardMenu } from '#/utils/card-menu'
import { buildCardMenu } from '@/nodes/cards/card-menu-build'

const Icon = () => null
type NodeEntries = Array<[string, CardMenuSource]>

// fixture menu items carry real commands — insertCommand is typed
// LexicalCommand<unknown>, so bare string placeholders no longer compile
const INSERT_CARD_ONE = createCommand('insert_card_one')
const INSERT_CARD_TWO = createCommand('insert_card_two')
const INSERT_CARD_THREE = createCommand('insert_card_three')
const INSERT_IMAGE = createCommand('insert_image')

describe('buildCardMenu', function () {
  it('adds to Primary section by default', async function () {
    const nodes: NodeEntries = [
      [
        'one',
        {
          cardMenu: {
            label: 'One',
            desc: 'Card test one',
            Icon,
            insertCommand: INSERT_CARD_ONE,
          },
        },
      ],
      [
        'two',
        {
          cardMenu: {
            label: 'Two',
            desc: 'Card test two',
            Icon,
            insertCommand: INSERT_CARD_TWO,
          },
        },
      ],
    ]

    const cardMenu = buildCardMenu(nodes)

    expect(cardMenu.sections).deep.equal([
      {
        label: 'Primary',
        items: [
          {
            label: 'One',
            desc: 'Card test one',
            Icon,
            insertCommand: INSERT_CARD_ONE,
            nodeType: 'one',
          },
          {
            label: 'Two',
            desc: 'Card test two',
            Icon,
            insertCommand: INSERT_CARD_TWO,
            nodeType: 'two',
          },
        ],
      },
    ])

    expect(cardMenu.maxItemIndex).to.equal(1)
  })

  it('can add cards to other headers', async function () {
    const nodes: NodeEntries = [
      [
        'one',
        {
          cardMenu: {
            label: 'One',
            desc: 'Card test one',
            Icon,
            insertCommand: INSERT_CARD_ONE,
          },
        },
      ],
      [
        'two',
        {
          cardMenu: {
            label: 'Two',
            desc: 'Card test two',
            section: 'Secondary',
            Icon,
            insertCommand: INSERT_CARD_TWO,
          },
        },
      ],
    ]

    const cardMenu = buildCardMenu(nodes)

    expect(cardMenu.sections).deep.equal([
      {
        label: 'Primary',
        items: [
          {
            label: 'One',
            desc: 'Card test one',
            Icon,
            insertCommand: INSERT_CARD_ONE,
            nodeType: 'one',
          },
        ],
      },
      {
        label: 'Secondary',
        items: [
          {
            label: 'Two',
            desc: 'Card test two',
            Icon,
            insertCommand: INSERT_CARD_TWO,
            nodeType: 'two',
            section: 'Secondary',
          },
        ],
      },
    ])

    expect(cardMenu.maxItemIndex).to.equal(1)
  })

  it('can add multiple items for a single card', async function () {
    const nodes: NodeEntries = [
      [
        'one',
        {
          cardMenu: [
            {
              label: 'One',
              desc: 'Card test one',
              Icon,
              insertCommand: INSERT_CARD_ONE,
            },
            {
              label: 'Two',
              desc: 'Card test two',
              Icon,
              insertCommand: INSERT_CARD_TWO,
            },
          ],
        },
      ],
    ]

    const cardMenu = buildCardMenu(nodes)

    expect(cardMenu.sections).deep.equal([
      {
        label: 'Primary',
        items: [
          {
            label: 'One',
            desc: 'Card test one',
            Icon,
            insertCommand: INSERT_CARD_ONE,
            nodeType: 'one',
          },
          {
            label: 'Two',
            desc: 'Card test two',
            Icon,
            insertCommand: INSERT_CARD_TWO,
            nodeType: 'one',
          },
        ],
      },
    ])
  })

  it('returns a flat items list in render order derived from the sections', async function () {
    const nodes: NodeEntries = [
      [
        'one',
        {
          cardMenu: {
            label: 'One',
            desc: 'Card test one',
            Icon,
            insertCommand: INSERT_CARD_ONE,
          },
        },
      ],
      [
        'two',
        {
          cardMenu: {
            label: 'Two',
            desc: 'Card test two',
            section: 'Secondary',
            Icon,
            insertCommand: INSERT_CARD_TWO,
          },
        },
      ],
      [
        'three',
        {
          cardMenu: {
            label: 'Three',
            desc: 'Card test three',
            Icon,
            insertCommand: INSERT_CARD_THREE,
          },
        },
      ],
    ]

    const cardMenu = buildCardMenu(nodes)

    // Primary section first, then declaration order — the same order CardMenu
    // assigns data-inkling-cardmenu-idx
    expect(cardMenu.items.map((item) => item.label)).to.deep.equal(['One', 'Three', 'Two'])
    expect(cardMenu.maxItemIndex).to.equal(cardMenu.items.length - 1)
    // derived from the sections and sharing item identity, so the two views
    // can't drift
    expect(cardMenu.items).to.deep.equal(cardMenu.sections.flatMap((section) => section.items))
    expect(cardMenu.items[0]).toBe(cardMenu.sections[0].items[0])
    expect(cardMenu.items[2]).toBe(cardMenu.sections[1].items[0])
  })

  it('returns an empty items list when nothing matches', async function () {
    const cardMenu = buildCardMenu([], { query: 'unknown' })

    expect(cardMenu.sections).to.deep.equal([])
    expect(cardMenu.items).to.deep.equal([])
    expect(cardMenu.maxItemIndex).to.equal(-1)
  })

  it('hides items gated by isHidden against the host config', async function () {
    const nodes: NodeEntries = [
      [
        'one',
        {
          cardMenu: {
            label: 'One',
            desc: 'Card test one',
            Icon,
            insertCommand: INSERT_CARD_ONE,
            isHidden: ({ config }) => !config?.klipy,
          },
        },
      ],
      [
        'two',
        {
          cardMenu: {
            label: 'Two',
            desc: 'Card test two',
            Icon,
            insertCommand: INSERT_CARD_TWO,
          },
        },
      ],
    ]

    expect(buildCardMenu(nodes).items.map((item) => item.label)).to.deep.equal(['Two'])
    expect(
      buildCardMenu(nodes, { config: { klipy: { apiKey: 'key' } } }).items.map((item) => item.label),
    ).to.deep.equal(['One', 'Two'])
  })

  it('gates the image declaration’s library entry on the host imageLibrary config (plan C8)', async function () {
    // the declaration-derived image menu: 'Image' is ungated, 'GIF' is gated
    // on tenor/klipy, 'Image library' on imageLibrary
    const imageMenu = getCardMenu('image')
    expect(imageMenu?.map((item) => item.label)).to.deep.equal(['Image', 'GIF', 'Image library'])
    const nodes: NodeEntries = [['image', { cardMenu: imageMenu }]]

    // no library config → no menu entry, zero UI trace (the GIF entry is
    // hidden too — no provider keys either)
    expect(buildCardMenu(nodes).items.map((item) => item.label)).to.deep.equal(['Image'])

    const config: CardConfig = { imageLibrary: { search: () => Promise.resolve([]) } }
    expect(buildCardMenu(nodes, { config }).items.map((item) => item.label)).to.deep.equal(['Image', 'Image library'])
  })

  it('resolves function-valued insertParams to plain data', async function () {
    const nodes: NodeEntries = [
      [
        'one',
        {
          cardMenu: {
            label: 'One',
            desc: 'Card test one',
            Icon,
            insertCommand: INSERT_CARD_ONE,
            insertParams: () => ({ version: 2 }),
          },
        },
      ],
    ]

    const cardMenu = buildCardMenu(nodes)

    expect(cardMenu.sections[0].items[0].insertParams).to.deep.equal({ version: 2 })
  })

  it('sorts items within a section by priority', async function () {
    const nodes: NodeEntries = [
      [
        'one',
        {
          cardMenu: {
            label: 'One',
            Icon,
            insertCommand: INSERT_CARD_ONE,
            priority: 2,
          },
        },
      ],
      [
        'two',
        {
          cardMenu: {
            label: 'Two',
            Icon,
            insertCommand: INSERT_CARD_TWO,
          },
        },
      ],
      [
        'three',
        {
          cardMenu: {
            label: 'Three',
            Icon,
            insertCommand: INSERT_CARD_THREE,
            priority: 1,
          },
        },
      ],
    ]

    const cardMenu = buildCardMenu(nodes)

    // ascending priority, items without a priority last
    expect(cardMenu.items.map((item) => item.label)).to.deep.equal(['Three', 'One', 'Two'])
  })

  describe('filtering', function () {
    it('adds all items for blank query', async function () {
      const nodes: NodeEntries = [
        [
          'one',
          {
            cardMenu: {
              label: 'One',
              desc: 'Card test one',
              Icon,
              insertCommand: INSERT_CARD_ONE,
              matches: ['one'],
            },
          },
        ],
        [
          'two',
          {
            cardMenu: {
              label: 'Two',
              desc: 'Card test two',
              Icon,
              insertCommand: INSERT_CARD_TWO,
              matches: ['two'],
            },
          },
        ],
      ]

      const cardMenu = buildCardMenu(nodes, { query: '' })

      expect(cardMenu.sections).deep.equal([
        {
          label: 'Primary',
          items: [
            {
              label: 'One',
              desc: 'Card test one',
              Icon,
              insertCommand: INSERT_CARD_ONE,
              matches: ['one'],
              nodeType: 'one',
            },
            {
              label: 'Two',
              desc: 'Card test two',
              Icon,
              insertCommand: INSERT_CARD_TWO,
              matches: ['two'],
              nodeType: 'two',
            },
          ],
        },
      ])
    })

    it('matches start of strings', async function () {
      const nodes: NodeEntries = [
        [
          'one',
          {
            cardMenu: {
              label: 'One',
              desc: 'Card test one',
              Icon,
              insertCommand: INSERT_CARD_ONE,
              matches: ['one'],
            },
          },
        ],
        [
          'two',
          {
            cardMenu: {
              label: 'Two',
              desc: 'Card test two',
              Icon,
              insertCommand: INSERT_CARD_TWO,
              matches: ['two'],
            },
          },
        ],
      ]

      const cardMenu = buildCardMenu(nodes, { query: 't' })

      expect(cardMenu.sections).deep.equal([
        {
          label: 'Primary',
          items: [
            {
              label: 'Two',
              desc: 'Card test two',
              Icon,
              insertCommand: INSERT_CARD_TWO,
              matches: ['two'],
              nodeType: 'two',
            },
          ],
        },
      ])

      expect(cardMenu.maxItemIndex).to.equal(0)
    })

    it('can match against multiple strings', async function () {
      const nodes: NodeEntries = [
        [
          'one',
          {
            cardMenu: {
              label: 'One',
              desc: 'Card test one',
              Icon,
              insertCommand: INSERT_CARD_ONE,
              matches: ['one'],
            },
          },
        ],
        [
          'two',
          {
            cardMenu: {
              label: 'Two',
              desc: 'Card test two',
              Icon,
              insertCommand: INSERT_CARD_TWO,
              matches: ['two', 'multiple'],
            },
          },
        ],
      ]

      const cardMenu = buildCardMenu(nodes, { query: 'mul' })

      expect(cardMenu.sections).deep.equal([
        {
          label: 'Primary',
          items: [
            {
              label: 'Two',
              desc: 'Card test two',
              Icon,
              insertCommand: INSERT_CARD_TWO,
              matches: ['two', 'multiple'],
              nodeType: 'two',
            },
          ],
        },
      ])

      expect(cardMenu.maxItemIndex).to.equal(0)
    })

    it('filters all sections', async function () {
      const nodes: NodeEntries = [
        [
          'one',
          {
            cardMenu: {
              label: 'One',
              desc: 'Card test one',
              Icon,
              insertCommand: INSERT_CARD_ONE,
              matches: ['one'],
            },
          },
        ],
        [
          'two',
          {
            cardMenu: {
              label: 'Two',
              desc: 'Card test two',
              section: 'Secondary',
              Icon,
              insertCommand: INSERT_CARD_TWO,
              matches: ['two', 'multiple'],
            },
          },
        ],
      ]

      const cardMenu = buildCardMenu(nodes, { query: 'mul' })

      expect(cardMenu.sections).deep.equal([
        {
          label: 'Secondary',
          items: [
            {
              label: 'Two',
              desc: 'Card test two',
              Icon,
              insertCommand: INSERT_CARD_TWO,
              matches: ['two', 'multiple'],
              nodeType: 'two',
              section: 'Secondary',
            },
          ],
        },
      ])
    })

    it('returns empty menu with no matches', async function () {
      const nodes: NodeEntries = [
        [
          'one',
          {
            cardMenu: {
              label: 'One',
              desc: 'Card test one',
              Icon,
              insertCommand: INSERT_CARD_ONE,
              matches: ['one'],
            },
          },
        ],
        [
          'two',
          {
            cardMenu: {
              label: 'Two',
              desc: 'Card test two',
              section: 'Secondary',
              Icon,
              insertCommand: INSERT_CARD_TWO,
              matches: ['two', 'multiple'],
            },
          },
        ],
      ]

      const cardMenu = buildCardMenu(nodes, { query: 'unknown' })

      expect(cardMenu.sections).deep.equal([])
      expect(cardMenu.maxItemIndex).to.equal(-1)
    })

    it('is case-insensitive', async function () {
      const nodes: NodeEntries = [
        [
          'one',
          {
            cardMenu: {
              label: 'One',
              desc: 'Card test one',
              Icon,
              insertCommand: INSERT_CARD_ONE,
              matches: ['one'],
            },
          },
        ],
        [
          'two',
          {
            cardMenu: {
              label: 'Two',
              desc: 'Card test two',
              Icon,
              insertCommand: INSERT_CARD_TWO,
              matches: ['two'],
            },
          },
        ],
      ]

      const cardMenu = buildCardMenu(nodes, { query: 'Tw' })

      expect(cardMenu.sections).deep.equal([
        {
          label: 'Primary',
          items: [
            {
              label: 'Two',
              desc: 'Card test two',
              Icon,
              insertCommand: INSERT_CARD_TWO,
              matches: ['two'],
              nodeType: 'two',
            },
          ],
        },
      ])
    })

    it('can pass function to matches', async function () {
      const matchFn = (query: string, label: string) => label.includes(query)
      const nodes: NodeEntries = [
        [
          'one',
          {
            cardMenu: {
              label: 'One wow',
              desc: 'Card test one',
              Icon,
              insertCommand: INSERT_CARD_ONE,
              matches: matchFn,
            },
          },
        ],
        [
          'two',
          {
            cardMenu: {
              label: 'Two',
              desc: 'Card test two',
              Icon,
              insertCommand: INSERT_CARD_TWO,
              matches: matchFn,
            },
          },
        ],
      ]

      const cardMenu = buildCardMenu(nodes, { query: 'wow' })

      expect(cardMenu.sections).deep.equal([
        {
          label: 'Primary',
          items: [
            {
              label: 'One wow',
              desc: 'Card test one',
              Icon,
              insertCommand: INSERT_CARD_ONE,
              matches: matchFn,
              nodeType: 'one',
            },
          ],
        },
      ])
    })

    it('can filter snippets', async function () {
      const snippets: SnippetItem[] = [
        { name: 'One snippet', value: '<p>One</p>' },
        { name: 'Two snippet', value: '<p>Two</p>' },
      ]
      const cardMenu = buildCardMenu([], { query: 'snip', config: { snippets, deleteSnippet: () => {} } })

      expect(cardMenu.sections).toEqual([
        {
          label: 'Snippets',
          items: [
            {
              Icon: expect.any(Function),
              insertCommand: {
                type: 'INSERT_SNIPPET_COMMAND',
              },
              insertParams: {
                name: 'One snippet',
                value: '<p>One</p>',
              },
              label: 'One snippet',
              matches: expect.any(Function),
              onRemove: expect.any(Function),
              section: 'Snippets',
              type: 'snippet',
            },
            {
              Icon: expect.any(Function),
              insertCommand: {
                type: 'INSERT_SNIPPET_COMMAND',
              },
              insertParams: {
                name: 'Two snippet',
                value: '<p>Two</p>',
              },
              label: 'Two snippet',
              matches: expect.any(Function),
              onRemove: expect.any(Function),
              section: 'Snippets',
              type: 'snippet',
            },
          ],
        },
      ])
    })

    it(`doesn't show delete option if createSnippet is not defined`, async function () {
      const snippets: SnippetItem[] = [
        { name: 'One snippet', value: '<p>One</p>' },
        { name: 'Two snippet', value: '<p>Two</p>' },
      ]
      const cardMenu = buildCardMenu([], { query: 'snippets', config: { snippets } })
      expect(cardMenu.sections).toEqual([
        {
          label: 'Snippets',
          items: [
            {
              Icon: expect.any(Function),
              insertCommand: {
                type: 'INSERT_SNIPPET_COMMAND',
              },
              insertParams: {
                name: 'One snippet',
                value: '<p>One</p>',
              },
              label: 'One snippet',
              matches: expect.any(Function),
              section: 'Snippets',
              type: 'snippet',
            },
            {
              Icon: expect.any(Function),
              insertCommand: {
                type: 'INSERT_SNIPPET_COMMAND',
              },
              insertParams: {
                name: 'Two snippet',
                value: '<p>Two</p>',
              },
              label: 'Two snippet',
              matches: expect.any(Function),
              section: 'Snippets',
              type: 'snippet',
            },
          ],
        },
      ])
    })

    it('returns empty value if no snippet matches ', async function () {
      const snippets: SnippetItem[] = [
        { name: 'One snippet', value: '<p>One</p>' },
        { name: 'Two snippet', value: '<p>Two</p>' },
      ]
      const cardMenu = buildCardMenu([], { query: 'sniptr', config: { snippets } })
      expect(cardMenu.sections).deep.equal([])
    })

    it('shows all snippets when typing /snippets', async function () {
      const snippets: SnippetItem[] = [
        { name: 'Test1', value: '<p>Test 1</p>' },
        { name: 'Test2', value: '<p>Test 2</p>' },
      ]
      const cardMenu = buildCardMenu([], { query: 'snippets', config: { snippets, deleteSnippet: () => {} } })

      expect(cardMenu.sections).toEqual([
        {
          label: 'Snippets',
          items: [
            {
              Icon: expect.any(Function),
              insertCommand: {
                type: 'INSERT_SNIPPET_COMMAND',
              },
              insertParams: {
                name: 'Test1',
                value: '<p>Test 1</p>',
              },
              label: 'Test1',
              matches: expect.any(Function),
              onRemove: expect.any(Function),
              section: 'Snippets',
              type: 'snippet',
            },
            {
              Icon: expect.any(Function),
              insertCommand: {
                type: 'INSERT_SNIPPET_COMMAND',
              },
              insertParams: {
                name: 'Test2',
                value: '<p>Test 2</p>',
              },
              label: 'Test2',
              matches: expect.any(Function),
              onRemove: expect.any(Function),
              section: 'Snippets',
              type: 'snippet',
            },
          ],
        },
      ])
    })
  })

  // Label resolution: the resolver is
  // optional, so every test above also pins the default path — no resolver,
  // output byte-identical to the pre-C7 builder.
  describe('label resolution', function () {
    it('resolves label, desc, and the built-in section names through the resolver', async function () {
      const nodes: NodeEntries = [
        [
          'image',
          {
            cardMenu: {
              label: 'Image',
              labelKey: 'image',
              desc: 'Upload, or embed with /image [url]',
              Icon,
              insertCommand: INSERT_IMAGE,
            },
          },
        ],
      ]
      const snippets: SnippetItem[] = [{ name: 'One snippet', value: '<p>One</p>' }]
      const resolveLabel = (key: string, fallback: string) => `zh(${key})${fallback}`

      const cardMenu = buildCardMenu(nodes, { config: { snippets }, resolveLabel })

      expect(cardMenu.sections.map((section) => section.label)).to.deep.equal([
        'zh(menu.section.primary)Primary',
        'zh(menu.section.snippets)Snippets',
      ])
      const imageItem = cardMenu.sections[0].items[0]
      expect(imageItem.label).to.equal('zh(menu.image.label)Image')
      expect(imageItem.desc).to.equal('zh(menu.image.desc)Upload, or embed with /image [url]')
      // snippet names are host data — never resolved
      expect(cardMenu.sections[1].items[0].label).to.equal('One snippet')
    })

    it('keeps custom section names and matches arrays as declared', async function () {
      const nodes: NodeEntries = [
        [
          'one',
          {
            cardMenu: {
              label: 'One',
              labelKey: 'one',
              desc: 'Card test one',
              section: 'Embed',
              Icon,
              insertCommand: INSERT_CARD_ONE,
              matches: ['one'],
            },
          },
        ],
      ]
      const resolveLabel = (key: string, fallback: string) => `zh(${key})${fallback}`

      const cardMenu = buildCardMenu(nodes, { query: 'one', resolveLabel })

      // the array-form matches aliases matched the query as declared, the
      // resolved item keeps the declared array, and a custom section name
      // never goes through the resolver
      expect(cardMenu.sections).to.have.lengthOf(1)
      expect(cardMenu.sections[0].label).to.equal('Embed')
      expect(cardMenu.sections[0].items[0].matches).to.deep.equal(['one'])
      expect(cardMenu.sections[0].items[0].label).to.equal('zh(menu.one.label)One')
    })

    it('passes the RESOLVED label to function-form matches', async function () {
      const matchFn = (query: string, label: string) => label.includes(query)
      const nodes: NodeEntries = [
        [
          'one',
          {
            cardMenu: {
              label: 'One',
              labelKey: 'one',
              Icon,
              insertCommand: INSERT_CARD_ONE,
              matches: matchFn,
            },
          },
        ],
      ]
      const resolveLabel = (key: string, fallback: string) => (key === 'menu.one.label' ? '图片' : fallback)

      // the declared English label does not contain the query; the resolved
      // one does — proof the function received the resolved label
      expect(buildCardMenu(nodes, { query: '图片', resolveLabel }).items.map((item) => item.label)).to.deep.equal([
        '图片',
      ])
      expect(buildCardMenu(nodes, { query: 'One', resolveLabel }).items).to.deep.equal([])
    })

    it('falls back to the declared text when the resolver misses a key', async function () {
      const nodes: NodeEntries = [
        [
          'one',
          {
            cardMenu: {
              label: 'One',
              labelKey: 'one',
              desc: 'Card test one',
              Icon,
              insertCommand: INSERT_CARD_ONE,
            },
          },
        ],
      ]
      // a resolver without a fallback of its own (e.g. a partial table the
      // merge in resolveLabels didn't cover) returns undefined at runtime,
      // which ResolveMenuLabel's `string` return can't express — the cast
      // models that miss honestly, and buildCardMenu's `?? item.label` is
      // what leaves the declared text alone
      const resolveLabel = ((): string | undefined => undefined) as ResolveMenuLabel

      const cardMenu = buildCardMenu(nodes, { resolveLabel })

      expect(cardMenu.sections[0].items[0].label).to.equal('One')
      expect(cardMenu.sections[0].items[0].desc).to.equal('Card test one')
    })
  })
})
