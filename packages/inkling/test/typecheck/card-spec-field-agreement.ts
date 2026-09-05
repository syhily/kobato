/**
 * Compile-time agreement pins for the card spec field vocabulary (CONTEXT.md:
 * "card spec" / "card declaration").
 *
 * The shim node types derive their `__*` maps — names AND value types — from
 * their declarations via `CardSpecFieldMap`, so a spec rename or retype is a
 * compile error at every consumer. A base node class cannot import its
 * declaration (the declaration imports the base), so the base's hand-written
 * `declare __*` fields are pinned HERE instead: every `__*` field a base
 * class declares beyond its dataset properties and the Lexical internals
 * must be named by the card declaration's spec. Rename a transient prop or
 * nested editor in a declaration and the stale base `declare` fails its pin
 * below.
 *
 * This file is included by the root tsconfig and is only type-checked — it
 * is never executed and contains no runtime assertions.
 */
/* oxlint-disable no-unused-vars -- the pin aliases are assertions: their
   value is being checked by tsc, never being referenced */
import type { DecoratorNode, EditorState, LexicalEditor } from 'lexical'

import type { CardSpecFieldMap, CardSpecFieldNames, TransientPropSpec } from '@/nodes/base/card-specs'
import type { HostCardSpec } from '@/nodes/cards/host-cards'

import { generateDecoratorNode } from '@/nodes/base/generate-decorator-node'
import { BaseAudioNode } from '@/nodes/base/nodes/audio/AudioNode'
import { BaseBookmarkNode } from '@/nodes/base/nodes/bookmark/BookmarkNode'
import { BaseCalloutNode } from '@/nodes/base/nodes/callout/CalloutNode'
import { BaseCodeBlockNode } from '@/nodes/base/nodes/codeblock/CodeBlockNode'
import { BaseFileNode } from '@/nodes/base/nodes/file/FileNode'
import { BaseFootnoteDefinitionNode } from '@/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'
import { BaseGalleryNode } from '@/nodes/base/nodes/gallery/GalleryNode'
import { BaseHeaderNode } from '@/nodes/base/nodes/header/HeaderNode'
import { BaseImageNode } from '@/nodes/base/nodes/image/ImageNode'
import { BaseToggleNode } from '@/nodes/base/nodes/toggle/ToggleNode'
import { BaseVideoNode } from '@/nodes/base/nodes/video/VideoNode'
import { audioDeclaration } from '@/nodes/cards/audio.declaration'
import { bookmarkDeclaration } from '@/nodes/cards/bookmark.declaration'
import { calloutDeclaration } from '@/nodes/cards/callout.declaration'
import { codeBlockDeclaration } from '@/nodes/cards/codeblock.declaration'
import { fileDeclaration } from '@/nodes/cards/file.declaration'
import { footnoteDefinitionDeclaration } from '@/nodes/cards/footnotedefinition.declaration'
import { galleryDeclaration } from '@/nodes/cards/gallery.declaration'
import { headerDeclaration } from '@/nodes/cards/header.declaration'
import { imageDeclaration } from '@/nodes/cards/image.declaration'
import { toggleDeclaration } from '@/nodes/cards/toggle.declaration'
import { videoDeclaration } from '@/nodes/cards/video.declaration'

type Expect<T extends true> = T
type Extends<A, B> = [A] extends [B] ? true : false
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

// the `__*` fields Lexical itself owns on every decorator node
type LexicalInternalFields = Extract<keyof DecoratorNode<unknown>, `__${string}`>

/**
 * The `__*` fields a base node class declares beyond its dataset properties
 * (`getPropertyDefaults` names them) and the Lexical internals — exactly the
 * vocabulary the card declaration's transient/nested-editor spec must own.
 */
type BaseSpecFields<TInstance, TDefaults extends Record<string, unknown>> = Exclude<
  Extract<keyof TInstance, `__${string}`>,
  `__${Extract<keyof TDefaults, string>}` | LexicalInternalFields
>

type BasePropertyDefaults<TClass extends { getPropertyDefaults(): Record<string, unknown> }> = ReturnType<
  TClass['getPropertyDefaults']
>

// the derivation itself: the audio declaration's spec yields exactly its two
// transient field names
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
// nullableNestedEditor carrier derives the nullable one
type _BookmarkEditorValue = Expect<
  Equal<CardSpecFieldMap<typeof bookmarkDeclaration>['__captionEditor'], LexicalEditor>
>
type _CalloutEditorValue = Expect<
  Equal<CardSpecFieldMap<typeof calloutDeclaration>['__calloutTextEditor'], LexicalEditor | null>
>
type _ToggleInitialState = Expect<
  Equal<CardSpecFieldMap<typeof toggleDeclaration>['__titleEditorInitialState'], EditorState | undefined>
>

// --- per-card pins: every base-declared `__*` field is spec-named -----------

type _Audio = Expect<
  Extends<
    BaseSpecFields<BaseAudioNode, BasePropertyDefaults<typeof BaseAudioNode>>,
    CardSpecFieldNames<typeof audioDeclaration>
  >
>
type _Bookmark = Expect<
  Extends<
    BaseSpecFields<BaseBookmarkNode, BasePropertyDefaults<typeof BaseBookmarkNode>>,
    CardSpecFieldNames<typeof bookmarkDeclaration>
  >
>
type _Callout = Expect<
  Extends<
    BaseSpecFields<BaseCalloutNode, BasePropertyDefaults<typeof BaseCalloutNode>>,
    CardSpecFieldNames<typeof calloutDeclaration>
  >
>
type _CodeBlock = Expect<
  Extends<
    BaseSpecFields<BaseCodeBlockNode, BasePropertyDefaults<typeof BaseCodeBlockNode>>,
    CardSpecFieldNames<typeof codeBlockDeclaration>
  >
>
type _File = Expect<
  Extends<
    BaseSpecFields<BaseFileNode, BasePropertyDefaults<typeof BaseFileNode>>,
    CardSpecFieldNames<typeof fileDeclaration>
  >
>
type _FootnoteDefinition = Expect<
  Extends<
    BaseSpecFields<BaseFootnoteDefinitionNode, BasePropertyDefaults<typeof BaseFootnoteDefinitionNode>>,
    CardSpecFieldNames<typeof footnoteDefinitionDeclaration>
  >
>
type _Gallery = Expect<
  Extends<
    BaseSpecFields<BaseGalleryNode, BasePropertyDefaults<typeof BaseGalleryNode>>,
    CardSpecFieldNames<typeof galleryDeclaration>
  >
>
type _Header = Expect<
  Extends<
    BaseSpecFields<BaseHeaderNode, BasePropertyDefaults<typeof BaseHeaderNode>>,
    CardSpecFieldNames<typeof headerDeclaration>
  >
>
type _Image = Expect<
  Extends<
    BaseSpecFields<BaseImageNode, BasePropertyDefaults<typeof BaseImageNode>>,
    CardSpecFieldNames<typeof imageDeclaration>
  >
>
type _Toggle = Expect<
  Extends<
    BaseSpecFields<BaseToggleNode, BasePropertyDefaults<typeof BaseToggleNode>>,
    CardSpecFieldNames<typeof toggleDeclaration>
  >
>
type _Video = Expect<
  Extends<
    BaseSpecFields<BaseVideoNode, BasePropertyDefaults<typeof BaseVideoNode>>,
    CardSpecFieldNames<typeof videoDeclaration>
  >
>

// --- the pins themselves work ------------------------------------------------

// @ts-expect-error - a `__*` field the spec does not name fails the pin
type _NegativeBase = Expect<Extends<'__staleField', CardSpecFieldNames<typeof audioDeclaration>>>

// @ts-expect-error - a value type that drifts from the spec's carrier fails the pin
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
