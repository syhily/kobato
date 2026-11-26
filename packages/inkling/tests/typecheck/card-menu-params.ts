import type { TransientPropSpec } from '@kobato/inkling-internal/nodes/base/card-specs'
import type { ResolvedMenuItem } from '@kobato/inkling-internal/nodes/cards/card-menu-build'
import type { HostCardSpec } from '@kobato/inkling-internal/nodes/cards/host-cards'
import type { Equal, Expect, Extends } from '@kobato/inkling/tests/utils/type-pins'
import type { ComponentType, SVGProps } from 'react'

import { generateDecoratorNode } from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { BaseAudioNode, audioTransientProps } from '@kobato/inkling-internal/nodes/base/nodes/audio/AudioNode'
import { BaseHeaderNode, headerNestedEditors } from '@kobato/inkling-internal/nodes/base/nodes/header/HeaderNode'
import {
  BaseImageNode,
  imageNestedEditors,
  imageTransientProps,
} from '@kobato/inkling-internal/nodes/base/nodes/image/ImageNode'
import { CARD_DECLARATIONS } from '@kobato/inkling-internal/nodes/cards'
import {
  checkedCardDeclaration,
  type CardDeclaration,
  type CardDeclarationMenuDataset,
  type CardMenuDataset,
  type CardMenuEntryCheck,
  type CardMenuQueryParamKey,
} from '@kobato/inkling-internal/nodes/cards/card-declaration'
import { defineCard } from '@kobato/inkling-internal/nodes/cards/host-cards'

type ImageDataset = CardMenuDataset<typeof BaseImageNode, typeof imageTransientProps, typeof imageNestedEditors>

type _ImageTransientValue = Expect<Equal<ImageDataset['triggerFileDialog'], boolean | undefined>>
type _ImageDatasetValue = Expect<Equal<ImageDataset['src'], string | undefined>>
type _ImageNestedEditorValue = Expect<Equal<ImageDataset['captionEditor'], import('lexical').LexicalEditor | undefined>>
type _ImageQueryKeys = Expect<
  Equal<CardMenuQueryParamKey<ImageDataset>, 'src' | 'caption' | 'title' | 'alt' | 'cardWidth' | 'href' | 'previewSrc'>
>
type _ImageQueryExcludes = Expect<
  Equal<Extract<CardMenuQueryParamKey<ImageDataset>, 'width' | 'triggerFileDialog' | 'captionEditor'>, never>
>
type _NeverQueryKeys = Expect<Equal<CardMenuQueryParamKey<never>, never>>

type AudioDataset = CardMenuDataset<typeof BaseAudioNode, typeof audioTransientProps, readonly []>
type _AudioTransientValue = Expect<Equal<AudioDataset['triggerFileDialog'], boolean | undefined>>

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

const _openFallbackProbe = {
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

const _queryOnlyFallbackProbe = {
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

type CheckedEntryMenu = CardMenuEntryCheck<
  [{ label: string; insertParams: { src: string }; queryParams: ['src'] }],
  { src: string }
>
const _checkedEntryMenu: CheckedEntryMenu = [{ label: 'x', insertParams: { src: 'y' }, queryParams: ['src'] }]

// @ts-expect-error - the helper rejects an unknown insertParams key
const _checkedBadKey: CheckedEntryMenu = [{ label: 'x', insertParams: { srcTypo: 'y' }, queryParams: ['src'] }]

// @ts-expect-error - the helper rejects a non-string query key
const _checkedBadQuery: CheckedEntryMenu = [{ label: 'x', insertParams: { src: 'y' }, queryParams: ['srcTypo'] }]

type NoInsertMenu = CardMenuEntryCheck<[{ label: string }], { src: string }>
type _NoInsertKey = Expect<Equal<'insertParams' extends keyof NoInsertMenu[0] ? true : false, false>>
const _noInsertEntry: NoInsertMenu = [{ label: 'x' }]

// @ts-expect-error - an entry without insertParams does not acquire the property
const _noInsertExtra: NoInsertMenu = [{ label: 'x', insertParams: {} }]

declare const broadTransientProps: readonly TransientPropSpec[]
const broadArgsProbe = {
  nodeType: 'broadArgsProbe',
  baseNode: BaseImageNode,
  transientProps: broadTransientProps,
  toolbarLabel: 'broad-args-probe',
  menu: [{ label: 'Probe', labelKey: 'broad.probe', icon: 'image', command: 'insert' }],
} satisfies CardDeclaration<'broadArgsProbe', typeof BaseImageNode, typeof broadTransientProps, readonly []>

// @ts-expect-error - the guard reports the open dataset (proves it is not vacuous)
type _BroadArgsCaught = Expect<Equal<OpenMenuDeclaration<typeof broadArgsProbe>, never>>

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

type _RawFnTypoReported = Expect<Equal<BadInsertKeys<typeof rawFnTypoProbe>, 'versionTypo'>>
// @ts-expect-error - the family predicate rejects the omitted-wrapper typo
type _RawFnTypoCaught = Expect<Equal<BadInsertKeys<typeof rawFnTypoProbe>, never>>

type SyntheticBadQueryDeclaration = {
  baseNode: typeof BaseImageNode
  transientProps: typeof imageTransientProps
  nestedEditors: typeof imageNestedEditors
  menu: [{ queryParams: ['srcTypo'] }]
}
// @ts-expect-error - the query predicate rejects the unknown key
type _SyntheticQueryCaught = Expect<Equal<BadQueryKeys<SyntheticBadQueryDeclaration>, never>>

type FenceCardNodeType = Extract<(typeof CARD_DECLARATIONS)[number], { markdown: { kind: 'fence' } }>['nodeType']
type _FenceUnion = Expect<
  Equal<
    FenceCardNodeType,
    'audio' | 'bookmark' | 'button' | 'callout' | 'file' | 'gallery' | 'html' | 'toggle' | 'video'
  >
>

const _validImageDeclaration = checkedCardDeclaration({
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

const _invalidImageDeclaration = checkedCardDeclaration({
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

const _validHeaderDeclaration = checkedCardDeclaration({
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

const _invalidHeaderFnKeyDeclaration = checkedCardDeclaration({
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

const _invalidHeaderFnValueDeclaration = checkedCardDeclaration({
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
    transientProps: hostMenuProbeTransientProps,
    toolbarLabel: nodeType,
    render: () => null,
  }
}

const _hostMenuProbe = defineCard({
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

const _bareHost = defineCard({
  nodeType: 'bareHostProbe',
  baseNode: generateDecoratorNode({ nodeType: 'bareHostProbe' }),
  toolbarLabel: 'bare-host-probe',
  render: () => null,
})

const _hostUnknownKey = defineCard({
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

const _hostWrongTransientValue = defineCard({
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

const _hostWrongBaseValue = defineCard({
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

const _hostNonStringQuery = defineCard({
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

const _hostUnknownQueryKey = defineCard({
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

const preWidenedQueryParams: readonly string[] = ['srcTypo']
const _preWidenedHost = defineCard({
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

const _hostFnUnknownKey = defineCard({
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

const _hostFnWrongValue = defineCard({
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
const _satisfiedValidHost = defineCard(satisfiedValidHostSpec)

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

const _satisfiedQueryCard = defineCard(satisfiedQuerySpec)

// @ts-expect-error - `satisfies` preserves the literal menu shape, so defineCard's exact-key check still runs
defineCard(satisfiedHostSpec)

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

      insertParams: { srcTypo: '' },
      queryParams: ['srcTypo'],
    },
  ],
  render: () => null,
}
const _wideHostCard = defineCard(wideHostSpec)

type _DeadMenuFieldsStayOut = Expect<
  Equal<Extract<keyof ResolvedMenuItem, 'name' | 'icon' | 'customContent' | 'hidden' | 'disabled'>, never>
>

type _LiveMenuFieldsStay = Expect<
  Extends<'dataTestId' | 'Icon' | 'label' | 'onRemove' | 'shortcut' | 'queryParams', keyof ResolvedMenuItem>
>
