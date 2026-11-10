import { defineCard, type DecoratorNodeProperty, generateDecoratorNode } from '@/inkling'

const musicPlayerProperties = [{ name: 'src', default: '' }] as const satisfies readonly DecoratorNodeProperty[]

// Host-side base node built through the same generateDecoratorNode entry the built-in cards use; a stub
// defaultRenderFn keeps the exportDOM contract honest without vendoring a renderer.
const BaseMusicPlayerNode = generateDecoratorNode({
  nodeType: 'musicPlayer',
  properties: musicPlayerProperties,
  defaultRenderFn: (_, context) => {
    const document = context.createDocument()

    const element = document.createElement('div')
    element.className = 'inkling-music-player-card'
    return { element, type: 'outer' as const }
  },
})

function MusicPlayerCard() {
  return (
    <div className="border-grey-200 bg-grey-50 text-grey-600 dark:border-grey-800 dark:bg-grey-900 dark:text-grey-300 flex h-24 items-center justify-center rounded-md border font-sans text-sm">
      Music player
    </div>
  )
}

// Host card (CONTEXT.md: "host card") via the public seam: one defineCard call registers the node class, slash
// menu entry, insert command, decorate render, and toolbar label. Must run before the composer mounts.
export const musicPlayer = defineCard({
  nodeType: 'musicPlayer',
  baseNode: BaseMusicPlayerNode,
  insert: {},
  menu: [{ label: 'Music', labelKey: 'music', icon: 'audio', command: 'insert', matches: ['music'] }],
  toolbarLabel: 'music-player',
  render: () => <MusicPlayerCard />,
})
