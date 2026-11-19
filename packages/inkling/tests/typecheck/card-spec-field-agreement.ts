import type {
  CardSpecFieldMap,
  CardSpecFieldNames,
  TransientPropSpec,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import type { HostCardSpec } from '@kobato/inkling-internal/nodes/cards/host-cards'
import type { Expect, Equal, Extends } from '@kobato/inkling/tests/utils/type-pins'
import type { EditorState, LexicalEditor } from 'lexical'

import { generateDecoratorNode } from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { BaseAudioNode } from '@kobato/inkling-internal/nodes/base/nodes/audio/AudioNode'
import { BaseCalloutNode } from '@kobato/inkling-internal/nodes/base/nodes/callout/CalloutNode'
import { BaseImageNode } from '@kobato/inkling-internal/nodes/base/nodes/image/ImageNode'
import { audioDeclaration } from '@kobato/inkling-internal/nodes/cards/audio.declaration'
import { bookmarkDeclaration } from '@kobato/inkling-internal/nodes/cards/bookmark.declaration'
import { calloutDeclaration } from '@kobato/inkling-internal/nodes/cards/callout.declaration'
import { toggleDeclaration } from '@kobato/inkling-internal/nodes/cards/toggle.declaration'

type _DerivationSanity = Expect<
  Equal<CardSpecFieldNames<typeof audioDeclaration>, '__triggerFileDialog' | '__initialFile'>
>

type _AudioValues = Expect<
  Equal<CardSpecFieldMap<typeof audioDeclaration>, { __triggerFileDialog: boolean; __initialFile: File | undefined }>
>
type _BookmarkKeys = Expect<
  Equal<
    keyof CardSpecFieldMap<typeof bookmarkDeclaration>,
    '__createdWithUrl' | '__captionEditor' | '__captionEditorInitialState'
  >
>

type _BookmarkEditorValue = Expect<
  Equal<CardSpecFieldMap<typeof bookmarkDeclaration>['__captionEditor'], LexicalEditor>
>
type _CalloutEditorValue = Expect<
  Equal<CardSpecFieldMap<typeof calloutDeclaration>['__calloutTextEditor'], LexicalEditor | null>
>
type _ToggleInitialState = Expect<
  Equal<CardSpecFieldMap<typeof toggleDeclaration>['__titleEditorInitialState'], EditorState | undefined>
>

type _AudioBaseField = Expect<Equal<BaseAudioNode['__triggerFileDialog'], boolean>>
type _AudioBaseAccessor = Expect<Equal<BaseAudioNode['triggerFileDialog'], boolean>>
type _ImageBaseAccessor = Expect<Equal<BaseImageNode['previewSrc'], string | null>>
type _CalloutBaseEditor = Expect<Equal<BaseCalloutNode['__calloutTextEditor'], LexicalEditor | null>>

// @ts-expect-error - a `__*` field the spec does not name fails the pin
type _NegativeBase = Expect<Extends<'__staleField', CardSpecFieldNames<typeof audioDeclaration>>>

// @ts-expect-error - a value type that drifts from the spec fails the pin
type _NegativeValue = Expect<Equal<CardSpecFieldMap<typeof audioDeclaration>['__triggerFileDialog'], string>>

const hostSpec = {
  nodeType: 'hostProbe',
  baseNode: generateDecoratorNode({ nodeType: 'hostProbe' }),
  transientProps: [
    { name: 'initialFile', initial: (dataset): File | undefined => dataset.initialFile as File | undefined },
  ] as const satisfies readonly TransientPropSpec[],
  toolbarLabel: 'host-probe',
  render: () => null,
} satisfies HostCardSpec<'hostProbe'>

type _HostSpecNames = Expect<Equal<CardSpecFieldNames<typeof hostSpec>, '__initialFile'>>
declare const hostSpecFields: CardSpecFieldMap<typeof hostSpec>
hostSpecFields.__initialFile = undefined
