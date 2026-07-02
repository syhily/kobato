import { ListPlugin } from '@lexical/react/LexicalListPlugin'

import AtLinkPlugin from '@/ui/inkling-editor/plugins/AtLinkPlugin'
import { AudioPlugin } from '@/ui/inkling-editor/plugins/AudioPlugin'
import { BookmarkPlugin } from '@/ui/inkling-editor/plugins/BookmarkPlugin'
import { ButtonPlugin } from '@/ui/inkling-editor/plugins/ButtonPlugin'
import { CalloutPlugin } from '@/ui/inkling-editor/plugins/CalloutPlugin'
import { CardMenuPlugin } from '@/ui/inkling-editor/plugins/CardMenuPlugin'
import EmEnDashPlugin from '@/ui/inkling-editor/plugins/EmEnDashPlugin'
import { EmojiPickerPlugin } from '@/ui/inkling-editor/plugins/EmojiPickerPlugin'
import { FilePlugin } from '@/ui/inkling-editor/plugins/FilePlugin'
import { GalleryPlugin } from '@/ui/inkling-editor/plugins/GalleryPlugin'
import { HeaderPlugin } from '@/ui/inkling-editor/plugins/HeaderPlugin'
import HorizontalRulePlugin from '@/ui/inkling-editor/plugins/HorizontalRulePlugin'
import HtmlPlugin from '@/ui/inkling-editor/plugins/HtmlPlugin'
import ImagePlugin from '@/ui/inkling-editor/plugins/ImagePlugin'
import InklingSelectorPlugin from '@/ui/inkling-editor/plugins/InklingSelectorPlugin'
import { InklingSnippetPlugin } from '@/ui/inkling-editor/plugins/InklingSnippetPlugin'
import { TogglePlugin } from '@/ui/inkling-editor/plugins/TogglePlugin'
import { VideoPlugin } from '@/ui/inkling-editor/plugins/VideoPlugin'

export const AllDefaultPlugins = () => {
  return (
    <>
      {/* Lexical Plugins */}
      <ListPlugin /> {/* adds indent/outdent/remove etc support */}
      {/* <TabIndentationPlugin /> tab/shift+tab triggers indent/outdent */}
      {/* Inkling Plugins */}
      <CardMenuPlugin />
      <InklingSnippetPlugin />
      <InklingSelectorPlugin /> {/* Gif selector */}
      <EmojiPickerPlugin />
      <AtLinkPlugin />
      {/* Card Plugins */}
      <AudioPlugin />
      <ImagePlugin />
      <GalleryPlugin />
      <VideoPlugin />
      <EmEnDashPlugin />
      <HorizontalRulePlugin />
      <CalloutPlugin />
      <HtmlPlugin />
      <FilePlugin />
      <ButtonPlugin />
      <TogglePlugin />
      <HeaderPlugin />
      <BookmarkPlugin />
    </>
  )
}

export default AllDefaultPlugins
