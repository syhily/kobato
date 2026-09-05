import type { BookmarkEmbedOptions, BookmarkEmbedResponse, SnippetItem } from '@/index'

import { fetchEmbed } from '../../demo/utils/fetchEmbed'
import { useSnippets } from '../../demo/utils/useSnippets'

type IsExact<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false
type Assert<Condition extends true> = Condition

export type DemoSnippetsUsePublicItems = Assert<IsExact<ReturnType<typeof useSnippets>['snippets'], SnippetItem[]>>
export type DemoEmbedAcceptsPublicOptions = Assert<
  BookmarkEmbedOptions extends Parameters<typeof fetchEmbed>[1] ? true : false
>
export type DemoEmbedIncludesPublicResponse = Assert<
  BookmarkEmbedResponse extends NonNullable<Awaited<ReturnType<typeof fetchEmbed>>> ? true : false
>
