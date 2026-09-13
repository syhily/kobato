/**
 * Compile-time pins for the card spec field vocabulary (CONTEXT.md: "card
 * spec" / "card declaration").
 *
 * The spec arrays live in the base node modules, const-asserted so the
 * literal names and value types survive. Two derivations read them:
 * `CardSpecFieldMap` folds the map into the assembled class's instance type
 * (what the shims re-export), and `CardSpecFieldMapFor` self-types the base
 * class by interface merging — one source, both surfaces, so a spec rename
 * or retype is a compile error at every consumer. The pins below cover the
 * derivation itself and its arrival on a base class; there is no second
 * hand-written copy left to agree with.
 *
 * This file is included by the root tsconfig and is only type-checked — it
 * is never executed and contains no runtime assertions.
 */
import type { EditorState, LexicalEditor } from 'lexical'

import type { CardSpecFieldMap, CardSpecFieldNames, TransientPropSpec } from '@/inkling/nodes/base/card-specs'
import type { HostCardSpec } from '@/inkling/nodes/cards/host-cards'

import { generateDecoratorNode } from '@/inkling/nodes/base/generate-decorator-node'
import { BaseAudioNode } from '@/inkling/nodes/base/nodes/audio/AudioNode'
import { BaseCalloutNode } from '@/inkling/nodes/base/nodes/callout/CalloutNode'
import { BaseImageNode } from '@/inkling/nodes/base/nodes/image/ImageNode'
import { audioDeclaration } from '@/inkling/nodes/cards/audio.declaration'
import { bookmarkDeclaration } from '@/inkling/nodes/cards/bookmark.declaration'
import { calloutDeclaration } from '@/inkling/nodes/cards/callout.declaration'
import { toggleDeclaration } from '@/inkling/nodes/cards/toggle.declaration'

type Expect<T extends true> = T
type Extends<A, B> = [A] extends [B] ? true : false
type Equal<A, B> = (<T>(_: T) => T extends A ? 1 : 2) extends <T>(_: T) => T extends B ? 1 : 2 ? true : false

// the derivation itself: the audio spec yields exactly its two transient
// field names
type _DerivationSanity = Expect<
  Equal<CardSpecFieldNames<typeof audioDeclaration>, '__triggerFileDialog' | '__initialFile'>
>

// --- derived value types: the vocabulary the shims used to hand-write -------

type _AudioValues = Expect<
  Equal<CardSpecFieldMap<typeof audioDeclaration>, { __triggerFileDialog: boolean; __initialFile: File | undefined }>
>
type _BookmarkKeys = Expect<
  Equal<
    keyof CardSpecFieldMap<typeof bookmarkDeclaration>,
    '__createdWithUrl' | '__captionEditor' | '__captionEditorInitialState'
  >
>
// a plain nested-editor literal derives a non-null editor field; the
// `nullable: true` entry derives the nullable one
type _BookmarkEditorValue = Expect<
  Equal<CardSpecFieldMap<typeof bookmarkDeclaration>['__captionEditor'], LexicalEditor>
>
type _CalloutEditorValue = Expect<
  Equal<CardSpecFieldMap<typeof calloutDeclaration>['__calloutTextEditor'], LexicalEditor | null>
>
type _ToggleInitialState = Expect<
  Equal<CardSpecFieldMap<typeof toggleDeclaration>['__titleEditorInitialState'], EditorState | undefined>
>

// --- the base classes self-type the same vocabulary (interface merging) -----

type _AudioBaseField = Expect<Equal<BaseAudioNode['__triggerFileDialog'], boolean>>
type _AudioBaseAccessor = Expect<Equal<BaseAudioNode['triggerFileDialog'], boolean>>
type _ImageBaseAccessor = Expect<Equal<BaseImageNode['previewSrc'], string | null>>
type _CalloutBaseEditor = Expect<Equal<BaseCalloutNode['__calloutTextEditor'], LexicalEditor | null>>

// --- the pins themselves work ------------------------------------------------

// @ts-expect-error - a `__*` field the spec does not name fails the pin
type _NegativeBase = Expect<Extends<'__staleField', CardSpecFieldNames<typeof audioDeclaration>>>

// @ts-expect-error - a value type that drifts from the spec fails the pin
type _NegativeValue = Expect<Equal<CardSpecFieldMap<typeof audioDeclaration>['__triggerFileDialog'], string>>

// --- host cards: the same derivation over a `defineCard` spec ----------------

// a host spec const-asserts its spec arrays exactly like the built-in
// declarations, and `CardSpecFieldMap` derives its field vocabulary the same
// way — HostCardSpec carries the same transientProps/nestedEditors shape
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
