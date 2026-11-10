/**
 * Compile-time pins for the card menu's construction-dataset vocabulary: a
 * declaration derives `insertParams`/`queryParams` from its base class and
 * spec arrays, `checkedCardDeclaration` applies the exact-key check, and
 * `defineCard` does the same for host cards.
 *
 * Type-checked only, never executed — the `defineCard` calls at module scope
 * would register cards if it ran.
 */
import type { ComponentType, SVGProps } from 'react'

import type { Equal, Expect, Extends } from '#/inkling/utils/type-pins'
import type { TransientPropSpec } from '@/inkling/nodes/base/card-specs'
import type { ResolvedMenuItem } from '@/inkling/nodes/cards/card-menu-build'
import type { HostCardSpec } from '@/inkling/nodes/cards/host-cards'

import { generateDecoratorNode } from '@/inkling/nodes/base/generate-decorator-node'
import { BaseAudioNode, audioTransientProps } from '@/inkling/nodes/base/nodes/audio/AudioNode'
import { BaseHeaderNode, headerNestedEditors } from '@/inkling/nodes/base/nodes/header/HeaderNode'
import { BaseImageNode, imageNestedEditors, imageTransientProps } from '@/inkling/nodes/base/nodes/image/ImageNode'
import { CARD_DECLARATIONS } from '@/inkling/nodes/cards'
import {
  checkedCardDeclaration,
  type CardDeclaration,
  type CardDeclarationMenuDataset,
  type CardMenuDataset,
  type CardMenuEntryCheck,
  type CardMenuQueryParamKey,
} from '@/inkling/nodes/cards/card-declaration'
import { defineCard } from '@/inkling/nodes/cards/host-cards'

type ImageDataset = CardMenuDataset<typeof BaseImageNode, typeof imageTransientProps, typeof imageNestedEditors>

// Derived vocabulary: the constructor's dataset, nothing more

type _ImageTransientValue = Expect<Equal<ImageDataset['triggerFileDialog'], boolean | undefined>>
type _ImageDatasetValue = Expect<Equal<ImageDataset['src'], string | undefined>>
// nested-editor keys are construction-dataset keys too
type _ImageNestedEditorValue = Expect<Equal<ImageDataset['captionEditor'], import('lexical').LexicalEditor | undefined>>
// the actual query-key alias: string-valued dataset keys, nothing else
type _ImageQueryKeys = Expect<
  Equal<CardMenuQueryParamKey<ImageDataset>, 'src' | 'caption' | 'title' | 'alt' | 'cardWidth' | 'href' | 'previewSrc'>
>
type _ImageQueryExcludes = Expect<
  Equal<Extract<CardMenuQueryParamKey<ImageDataset>, 'width' | 'triggerFileDialog' | 'captionEditor'>, never>
>
// the sentinel for an un-parameterized declaration: no query key is ever valid
type _NeverQueryKeys = Expect<Equal<CardMenuQueryParamKey<never>, never>>

type AudioDataset = CardMenuDataset<typeof BaseAudioNode, typeof audioTransientProps, readonly []>
type _AudioTransientValue = Expect<Equal<AudioDataset['triggerFileDialog'], boolean | undefined>>

// Durable family guard. These predicates walk the REAL `CARD_DECLARATIONS`
// family to close two escapes the declaration-site check misses: a broad spec
// array yields an open dataset (probe B), and `satisfies` alone misses a
// function-return typo when `checkedCardDeclaration` is omitted (probe C).
// Menu-less declarations are exempt.

type OpenMenuDeclaration<D> = D extends { menu: readonly unknown[] }
  ? string extends keyof CardDeclarationMenuDataset<D>
    ? D
    : never
  : never

type EntryInsertKeys<Entry> = Entry extends { insertParams?: infer InsertParams }
  ? InsertParams extends (...args: readonly unknown[]) => infer Result
    ? keyof Result
    : keyof InsertParams
  : never

type EntryQueryKeys<Entry> = Entry extends { queryParams?: infer QueryParams }
  ? QueryParams extends readonly (infer Key)[]
    ? Key
    : never
  : never

type BadInsertKeys<D> = D extends { menu: readonly (infer Entry)[] }
  ? Exclude<EntryInsertKeys<Entry>, keyof CardDeclarationMenuDataset<D>>
  : never

type BadQueryKeys<D> = D extends { menu: readonly (infer Entry)[] }
  ? Exclude<EntryQueryKeys<Entry>, CardMenuQueryParamKey<CardDeclarationMenuDataset<D>>>
  : never

type _NoOpenMenuDatasets = Expect<Equal<OpenMenuDeclaration<(typeof CARD_DECLARATIONS)[number]>, never>>
type _NoBadInsertKeys = Expect<Equal<BadInsertKeys<(typeof CARD_DECLARATIONS)[number]>, never>>
type _NoBadQueryKeys = Expect<Equal<BadQueryKeys<(typeof CARD_DECLARATIONS)[number]>, never>>

// Non-vacuous proof A: with the type arguments omitted, `DeclaredCardMenuDataset`
// resolves to `never`, so the error lands on the declaration itself.
const openFallbackProbe = {
  nodeType: 'openFallbackProbe',
  baseNode: BaseImageNode,
  toolbarLabel: 'open-fallback-probe',
  menu: [
    {
      label: 'Probe',
      labelKey: 'open.probe',
      icon: 'image',
      command: 'insert',
      // @ts-expect-error - an un-parameterized declaration has no usable insertParams
      insertParams: { srcTypo: '' },
    },
  ],
} satisfies CardDeclaration<'openFallbackProbe'>
void openFallbackProbe

// A query-only menu has no insertParams to mask the failure: the same
// un-parameterized default makes every query key invalid.
const queryOnlyFallbackProbe = {
  nodeType: 'queryOnlyFallbackProbe',
  baseNode: BaseImageNode,
  toolbarLabel: 'query-only-fallback-probe',
  menu: [
    {
      label: 'Probe',
      labelKey: 'queryOnly.probe',
      icon: 'image',
      command: 'insert',
      // @ts-expect-error - an un-parameterized query-only menu has no usable query keys
      queryParams: ['srcTypo'],
    },
  ],
} satisfies CardDeclaration<'queryOnlyFallbackProbe'>
void queryOnlyFallbackProbe

// CardMenuEntryCheck used directly (independent of defineCard)

type CheckedEntryMenu = CardMenuEntryCheck<
  [{ label: string; insertParams: { src: string }; queryParams: ['src'] }],
  { src: string }
>
const checkedEntryMenu: CheckedEntryMenu = [{ label: 'x', insertParams: { src: 'y' }, queryParams: ['src'] }]
void checkedEntryMenu
// @ts-expect-error - the helper rejects an unknown insertParams key
const checkedBadKey: CheckedEntryMenu = [{ label: 'x', insertParams: { srcTypo: 'y' }, queryParams: ['src'] }]
void checkedBadKey
// @ts-expect-error - the helper rejects a non-string query key
const checkedBadQuery: CheckedEntryMenu = [{ label: 'x', insertParams: { src: 'y' }, queryParams: ['srcTypo'] }]
void checkedBadQuery

type NoInsertMenu = CardMenuEntryCheck<[{ label: string }], { src: string }>
type _NoInsertKey = Expect<Equal<'insertParams' extends keyof NoInsertMenu[0] ? true : false, false>>
const noInsertEntry: NoInsertMenu = [{ label: 'x' }]
void noInsertEntry
// @ts-expect-error - an entry without insertParams does not acquire the property
const noInsertExtra: NoInsertMenu = [{ label: 'x', insertParams: {} }]
void noInsertExtra

// Non-vacuous proof B: a BROAD spec array still satisfies the declaration but
// yields an open dataset, which the family guard above reports.
declare const broadTransientProps: readonly TransientPropSpec[]
const broadArgsProbe = {
  nodeType: 'broadArgsProbe',
  baseNode: BaseImageNode,
  transientProps: broadTransientProps,
  toolbarLabel: 'broad-args-probe',
  menu: [{ label: 'Probe', labelKey: 'broad.probe', icon: 'image', command: 'insert' }],
} satisfies CardDeclaration<'broadArgsProbe', typeof BaseImageNode, typeof broadTransientProps, readonly []>
void broadArgsProbe

// @ts-expect-error - the guard reports the open dataset (proves it is not vacuous)
type _BroadArgsCaught = Expect<Equal<OpenMenuDeclaration<typeof broadArgsProbe>, never>>

// Non-vacuous proof C: a raw declaration that omits `checkedCardDeclaration`
// still compiles `satisfies`, but the family predicate reports the key.
const rawFnTypoProbe = {
  nodeType: 'header',
  baseNode: BaseHeaderNode,
  nestedEditors: headerNestedEditors,
  toolbarLabel: 'header',
  menu: [
    {
      label: 'Header',
      labelKey: 'header',
      icon: 'header',
      command: 'insert',
      insertParams: () => ({
        version: 2,
        versionTypo: 2,
      }),
    },
  ],
} satisfies CardDeclaration<'header', typeof BaseHeaderNode, readonly [], typeof headerNestedEditors>
void rawFnTypoProbe

type _RawFnTypoReported = Expect<Equal<BadInsertKeys<typeof rawFnTypoProbe>, 'versionTypo'>>
// @ts-expect-error - the family predicate rejects the omitted-wrapper typo
type _RawFnTypoCaught = Expect<Equal<BadInsertKeys<typeof rawFnTypoProbe>, never>>

// Non-vacuous proof D: the query predicate reports an unknown query key.
type SyntheticBadQueryDeclaration = {
  baseNode: typeof BaseImageNode
  transientProps: typeof imageTransientProps
  nestedEditors: typeof imageNestedEditors
  menu: [{ queryParams: ['srcTypo'] }]
}
// @ts-expect-error - the query predicate rejects the unknown key
type _SyntheticQueryCaught = Expect<Equal<BadQueryKeys<SyntheticBadQueryDeclaration>, never>>

// literal markdown unions survive the generic conversion (the fence payload
// table extracts them by `{ markdown: { kind: 'fence' } }`)
type FenceCardNodeType = Extract<(typeof CARD_DECLARATIONS)[number], { markdown: { kind: 'fence' } }>['nodeType']
type _FenceUnion = Expect<
  Equal<
    FenceCardNodeType,
    'audio' | 'bookmark' | 'button' | 'callout' | 'file' | 'gallery' | 'html' | 'toggle' | 'video'
  >
>

// Positive: a valid image menu entry compiles

const validImageDeclaration = checkedCardDeclaration({
  nodeType: 'image',
  baseNode: BaseImageNode,
  nestedEditors: imageNestedEditors,
  transientProps: imageTransientProps,
  toolbarLabel: 'image',
  menu: [
    {
      label: 'Image',
      labelKey: 'image',
      icon: 'image',
      command: 'insert',
      insertParams: { triggerFileDialog: true, src: 'https://example.com/a.png' },
      queryParams: ['src'],
    },
  ],
} satisfies CardDeclaration<'image', typeof BaseImageNode, typeof imageTransientProps, typeof imageNestedEditors>)
void validImageDeclaration

// Negative: declaration-site rejection of a bad key, value and query key

const invalidImageDeclaration = checkedCardDeclaration({
  nodeType: 'image',
  baseNode: BaseImageNode,
  nestedEditors: imageNestedEditors,
  transientProps: imageTransientProps,
  toolbarLabel: 'image',
  menu: [
    {
      label: 'Image',
      labelKey: 'image',
      icon: 'image',
      command: 'insert',
      insertParams: {
        // @ts-expect-error - a typo'd insertParams key is not a dataset key
        triggerFileDialogTypo: true,
      },
      // @ts-expect-error - a query param must name a string-valued dataset key
      queryParams: ['srcTypo'],
    },
    {
      label: 'Image',
      labelKey: 'image',
      icon: 'image',
      command: 'insert',
      insertParams: {
        // @ts-expect-error - the value type drifts from the dataset (boolean)
        triggerFileDialog: 'yes',
      },
    },
    {
      label: 'Image',
      labelKey: 'image',
      icon: 'image',
      command: 'insert',
      // @ts-expect-error - `width` is a number|null dataset field, not a string query key
      queryParams: ['width'],
    },
  ],
} satisfies CardDeclaration<'image', typeof BaseImageNode, typeof imageTransientProps, typeof imageNestedEditors>)
void invalidImageDeclaration

// Function-valued insertParams: the built-in Header path

const validHeaderDeclaration = checkedCardDeclaration({
  nodeType: 'header',
  baseNode: BaseHeaderNode,
  nestedEditors: headerNestedEditors,
  toolbarLabel: 'header',
  menu: [
    {
      label: 'Header',
      labelKey: 'header',
      icon: 'header',
      command: 'insert',
      insertParams: () => ({ version: 2 }),
    },
  ],
} satisfies CardDeclaration<'header', typeof BaseHeaderNode, readonly [], typeof headerNestedEditors>)
void validHeaderDeclaration

const invalidHeaderFnKeyDeclaration = checkedCardDeclaration({
  nodeType: 'header',
  baseNode: BaseHeaderNode,
  nestedEditors: headerNestedEditors,
  toolbarLabel: 'header',
  menu: [
    {
      label: 'Header',
      labelKey: 'header',
      icon: 'header',
      command: 'insert',
      // @ts-expect-error - the function form gets the exact-key check too
      insertParams: () => ({
        version: 2,
        versionTypo: 2,
      }),
    },
  ],
} satisfies CardDeclaration<'header', typeof BaseHeaderNode, readonly [], typeof headerNestedEditors>)
void invalidHeaderFnKeyDeclaration

const invalidHeaderFnValueDeclaration = checkedCardDeclaration({
  nodeType: 'header',
  baseNode: BaseHeaderNode,
  nestedEditors: headerNestedEditors,
  toolbarLabel: 'header',
  menu: [
    {
      label: 'Header',
      labelKey: 'header',
      icon: 'header',
      command: 'insert',
      // @ts-expect-error - the function form's values keep the dataset types
      insertParams: () => ({
        version: 'two',
      }),
    },
  ],
} satisfies CardDeclaration<'header', typeof BaseHeaderNode, readonly [], typeof headerNestedEditors>)
void invalidHeaderFnValueDeclaration

// Host cards: the same checking from B and the spec's own arrays

const HostIcon: ComponentType<SVGProps<SVGSVGElement>> = () => null

const hostMenuProbeTransientProps = [
  {
    name: 'triggerFileDialog',
    initial: (dataset: Record<string, unknown>): boolean => Boolean(dataset.triggerFileDialog),
  },
] as const satisfies readonly TransientPropSpec[]

const hostMenuProbeBaseNode = generateDecoratorNode({
  nodeType: 'hostMenuProbe',
  properties: [{ name: 'src', default: '' }] as const,
})

type HostMenuProbeDataset = CardMenuDataset<
  typeof hostMenuProbeBaseNode,
  typeof hostMenuProbeTransientProps,
  readonly []
>
type _HostDatasetKeys = Expect<Equal<keyof HostMenuProbeDataset, 'src' | 'triggerFileDialog'>>

function hostProbeSpec(nodeType: string) {
  return {
    nodeType,
    baseNode: hostMenuProbeBaseNode,
    // the spec arrays sit AFTER menu on purpose: the menu check must not depend
    // on declaration order
    transientProps: hostMenuProbeTransientProps,
    toolbarLabel: nodeType,
    render: () => null,
  }
}

// positives: object and function forms, plus a typed query param — no
// directives, these must compile
const hostMenuProbe = defineCard({
  ...hostProbeSpec('hostMenuProbe'),
  menu: [
    {
      label: 'Probe',
      labelKey: 'host.probe',
      icon: HostIcon,
      command: 'insert',
      insertParams: { src: 'https://example.com/a.png', triggerFileDialog: true },
      queryParams: ['src'],
    },
    {
      label: 'Probe',
      labelKey: 'host.probe.fn',
      icon: 'audio',
      command: 'insert',
      insertParams: () => ({ src: 'https://example.com/fn.png' }),
    },
  ],
})
void hostMenuProbe

// bare call: no arrays, no menu, no type arguments
const bareHost = defineCard({
  nodeType: 'bareHostProbe',
  baseNode: generateDecoratorNode({ nodeType: 'bareHostProbe' }),
  toolbarLabel: 'bare-host-probe',
  render: () => null,
})
void bareHost

// Host negatives (one call each: the error stays attributable)

const hostUnknownKey = defineCard({
  ...hostProbeSpec('hostUnknownKeyProbe'),
  menu: [
    {
      label: 'Probe',
      labelKey: 'host.probe.unknownKey',
      icon: 'audio',
      command: 'insert',
      // @ts-expect-error - an unknown insertParams key is rejected for hosts too
      insertParams: { srcTypo: '' },
    },
  ],
})
void hostUnknownKey

const hostWrongTransientValue = defineCard({
  ...hostProbeSpec('hostWrongTransientValueProbe'),
  // @ts-expect-error - a const-asserted host transient prop keeps its value type
  menu: [
    {
      label: 'Probe',
      labelKey: 'host.probe.wrongValue',
      icon: 'audio',
      command: 'insert',
      insertParams: { triggerFileDialog: 'yes' },
    },
  ],
})
void hostWrongTransientValue

const hostWrongBaseValue = defineCard({
  ...hostProbeSpec('hostWrongBaseValueProbe'),
  // @ts-expect-error - a base-class dataset property keeps its own value type
  menu: [
    {
      label: 'Probe',
      labelKey: 'host.probe.baseValue',
      icon: 'audio',
      command: 'insert',
      insertParams: { src: 123 },
    },
  ],
})
void hostWrongBaseValue

const hostNonStringQuery = defineCard({
  ...hostProbeSpec('hostNonStringQueryProbe'),
  menu: [
    {
      label: 'Probe',
      labelKey: 'host.probe.nonStringQuery',
      icon: 'audio',
      command: 'insert',
      // @ts-expect-error - query params are strings; a boolean transient key is not one
      queryParams: ['triggerFileDialog'],
    },
  ],
})
void hostNonStringQuery

const hostUnknownQueryKey = defineCard({
  ...hostProbeSpec('hostUnknownQueryKeyProbe'),
  menu: [
    {
      label: 'Probe',
      labelKey: 'host.probe.unknownQuery',
      icon: 'audio',
      command: 'insert',
      // @ts-expect-error - a direct call keeps the queryParams literal, so an unknown key is rejected
      queryParams: ['srcTypo'],
    },
  ],
})
void hostUnknownQueryKey

// a pre-widened queryParams array is the documented erasure boundary: the
// literal is already gone, so the call is accepted unchecked
const preWidenedQueryParams: readonly string[] = ['srcTypo']
const preWidenedHost = defineCard({
  ...hostProbeSpec('preWidenedHostProbe'),
  menu: [
    {
      label: 'Probe',
      labelKey: 'host.probe.preWidened',
      icon: 'audio',
      command: 'insert',
      queryParams: preWidenedQueryParams,
    },
  ],
})
void preWidenedHost

const hostFnUnknownKey = defineCard({
  ...hostProbeSpec('hostFnUnknownKeyProbe'),
  menu: [
    {
      label: 'Probe',
      labelKey: 'host.probe.fnUnknownKey',
      icon: 'audio',
      command: 'insert',
      // @ts-expect-error - the function form's return type gets the exact-key check too
      insertParams: () => ({ srcTypo: '' }),
    },
  ],
})
void hostFnUnknownKey

const hostFnWrongValue = defineCard({
  ...hostProbeSpec('hostFnWrongValueProbe'),
  // @ts-expect-error - the function form's values are checked like the object form's (the array-level error lands here)
  menu: [
    {
      label: 'Probe',
      labelKey: 'host.probe.fnWrongValue',
      icon: 'audio',
      command: 'insert',
      insertParams: () => ({ src: 123 }),
    },
  ],
})
void hostFnWrongValue

// `satisfies HostCardSpec` keeps the literal: defineCard still checks

const satisfiedHostSpec = {
  nodeType: 'satisfiedHostProbe',
  baseNode: hostMenuProbeBaseNode,
  transientProps: hostMenuProbeTransientProps,
  toolbarLabel: 'satisfied-host-probe',
  menu: [
    {
      label: 'Probe',
      labelKey: 'host.probe.satisfied',
      icon: 'audio',
      command: 'insert',
      insertParams: { srcTypo: '' },
    },
  ],
  render: () => null,
} satisfies HostCardSpec<'satisfiedHostProbe'>

// a valid `satisfies` spec is still accepted
const satisfiedValidHostSpec = {
  nodeType: 'satisfiedValidHostProbe',
  baseNode: hostMenuProbeBaseNode,
  transientProps: hostMenuProbeTransientProps,
  toolbarLabel: 'satisfied-valid-host-probe',
  menu: [
    {
      label: 'Probe',
      labelKey: 'host.probe.satisfiedValid',
      icon: 'audio',
      command: 'insert',
      insertParams: { src: 'https://example.com/ok.png' },
    },
  ],
  render: () => null,
} satisfies HostCardSpec<'satisfiedValidHostProbe'>
const satisfiedValidHost = defineCard(satisfiedValidHostSpec)
void satisfiedValidHost

// `satisfies HostCardSpec` contextually widens `queryParams` elements to
// `string`, so the key literal is unrecoverable. This is the documented
// compatibility boundary: valid legacy specs keep compiling, with query keys
// unchecked (an invalid key in an annotated spec is erased the same way). A
// DIRECT defineCard call keeps the literal and is checked (see below).
const satisfiedQuerySpec = {
  nodeType: 'satisfiedQueryProbe',
  baseNode: hostMenuProbeBaseNode,
  toolbarLabel: 'satisfied-query-probe',
  menu: [
    {
      label: 'Probe',
      labelKey: 'host.probe.satisfiedQuery',
      icon: 'audio',
      command: 'insert',
      queryParams: ['src'],
    },
  ],
  render: () => null,
} satisfies HostCardSpec<'satisfiedQueryProbe'>

const satisfiedQueryCard = defineCard(satisfiedQuerySpec)
void satisfiedQueryCard

// @ts-expect-error - `satisfies` preserves the literal menu shape, so defineCard's exact-key check still runs
defineCard(satisfiedHostSpec)

// Explicit WIDE annotation is the only escape boundary: the `HostCardSpec`
// annotation erases the menu literal's keys, so defineCard has nothing to
// check. It must stay explicit.

const wideHostSpec: HostCardSpec<'wideHostProbe'> = {
  nodeType: 'wideHostProbe',
  baseNode: hostMenuProbeBaseNode,
  toolbarLabel: 'wide-host-probe',
  menu: [
    {
      label: 'Probe',
      labelKey: 'host.probe.wide',
      icon: 'audio',
      command: 'insert',
      // both insert keys and query keys are erased by the wide annotation
      insertParams: { srcTypo: '' },
      queryParams: ['srcTypo'],
    },
  ],
  render: () => null,
}
const wideHostCard = defineCard(wideHostSpec)
void wideHostCard

// Dead menu item fields must not come back: neither buildCardMenu nor
// CardMenu reads name / icon / customContent / hidden / disabled, so a menu
// literal carrying them would silently do nothing.

type _DeadMenuFieldsStayOut = Expect<
  Equal<Extract<keyof ResolvedMenuItem, 'name' | 'icon' | 'customContent' | 'hidden' | 'disabled'>, never>
>
// the fields that ARE consumed stay available: dataTestId reaches the DOM,
// Icon is rendered, label drives the item text
type _LiveMenuFieldsStay = Expect<
  Extends<'dataTestId' | 'Icon' | 'label' | 'onRemove' | 'shortcut' | 'queryParams', keyof ResolvedMenuItem>
>
