import type { Meta, StoryObj } from '@storybook/react'

import AudioCardIcon from '@/assets/icons/inkling-card-type-audio.svg?react'
import BookmarkCardIcon from '@/assets/icons/inkling-card-type-bookmark.svg?react'
import ButtonCardIcon from '@/assets/icons/inkling-card-type-button.svg?react'
import CalloutCardIcon from '@/assets/icons/inkling-card-type-callout.svg?react'
import DividerCardIcon from '@/assets/icons/inkling-card-type-divider.svg?react'
import FileCardIcon from '@/assets/icons/inkling-card-type-file.svg?react'
import GalleryCardIcon from '@/assets/icons/inkling-card-type-gallery.svg?react'
import GifCardIcon from '@/assets/icons/inkling-card-type-gif.svg?react'
import HeaderCardIcon from '@/assets/icons/inkling-card-type-header.svg?react'
import HtmlCardIcon from '@/assets/icons/inkling-card-type-html.svg?react'
import ImageCardIcon from '@/assets/icons/inkling-card-type-image.svg?react'
import ToggleCardIcon from '@/assets/icons/inkling-card-type-toggle.svg?react'
import VideoCardIcon from '@/assets/icons/inkling-card-type-video.svg?react'
import { CardMenu, CardMenuItem, CardMenuSection, CardSnippetItem } from '@/components/ui/CardMenu'

const meta = {
  title: 'Components/Card menu',
  component: CardMenu,
  subcomponents: { CardMenuSection, CardMenuItem, CardSnippetItem },
} satisfies Meta<typeof CardMenu>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    sections: [
      {
        label: 'Primary',
        items: [
          { label: 'Image', desc: 'Upload, or embed with /image [url]', Icon: ImageCardIcon },
          { label: 'HTML', desc: 'Insert a raw HTML card', Icon: HtmlCardIcon },
          { label: 'Gallery', desc: 'Create an image gallery', Icon: GalleryCardIcon },
          { label: 'Divider', desc: 'Insert a dividing line', Icon: DividerCardIcon },
          { label: 'Bookmark', desc: 'Embed a link as a visual bookmark', Icon: BookmarkCardIcon },
          { label: 'Button', desc: 'Add a button to your post', Icon: ButtonCardIcon },
          { label: 'Callout', desc: 'Info boxes that stand out', Icon: CalloutCardIcon },
          { label: 'GIF', desc: 'Search and embed gifs', Icon: GifCardIcon },
          { label: 'Toggle', desc: 'Add collapsible content', Icon: ToggleCardIcon },
          { label: 'Video', desc: 'Upload and play a video', Icon: VideoCardIcon },
          { label: 'Audio', desc: 'Upload and play an audio file', Icon: AudioCardIcon },
          { label: 'File', desc: 'Upload a downloadable file', Icon: FileCardIcon },
          { label: 'Header', desc: 'Add a bold section header', Icon: HeaderCardIcon },
        ],
      },
      {
        label: 'Snippets',
        items: [
          { type: 'snippet', label: 'Snippet one' },
          { type: 'snippet', label: 'Snippet two' },
        ],
      },
    ],
  },
}
