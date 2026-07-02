import { $generateHtmlFromNodes } from '@lexical/html'
import { createCommand } from 'lexical'

import BookmarkCardIcon from '@/ui/inkling-editor/assets/icons/inkling-card-type-bookmark.svg?react'
import { cleanBasicHtml } from '@/ui/inkling-editor/html/clean-basic-html'
import { InklingCardWrapper, MINIMAL_NODES } from '@/ui/inkling-editor/index'
import { BookmarkNode as BaseBookmarkNode } from '@/ui/inkling-editor/nodes/base'
import { BookmarkNodeComponent } from '@/ui/inkling-editor/nodes/BookmarkNodeComponent'
import { populateNestedEditor, setupNestedEditor } from '@/ui/inkling-editor/utils/nested-editors'

export const INSERT_BOOKMARK_COMMAND = createCommand()

export class BookmarkNode extends BaseBookmarkNode {
  __captionEditor!: import('lexical').LexicalEditor | null
  __captionEditorInitialState!: import('lexical').EditorState | undefined
  __createdWithUrl

  static kgMenu = [
    {
      label: 'Bookmark',
      desc: 'Embed a link as a visual bookmark',
      Icon: BookmarkCardIcon,
      insertCommand: INSERT_BOOKMARK_COMMAND,
      matches: ['bookmark'],
      queryParams: ['url'],
      priority: 4,
      shortcut: '/bookmark [url]',
    },
  ]

  getIcon() {
    return BookmarkCardIcon
  }

  // oxlint-disable-next-line typescript/no-explicit-any
  constructor(dataset: Record<string, any> = {}, key?: string) {
    super(dataset, key)

    this.__createdWithUrl = !!dataset.url && !dataset.metadata

    // set up nested editor instances
    setupNestedEditor(this, '__captionEditor', { editor: dataset.captionEditor, nodes: MINIMAL_NODES })

    // populate nested editors on initial construction
    if (!dataset.captionEditor && dataset.caption) {
      populateNestedEditor(this, '__captionEditor', `${dataset.caption}`) // we serialize with no wrapper
    }
  }

  getDataset() {
    const dataset = super.getDataset()

    // client-side only data properties such as nested editors
    const self = this.getLatest()
    dataset.captionEditor = self.__captionEditor
    dataset.captionEditorInitialState = self.__captionEditorInitialState

    return dataset
  }

  exportJSON() {
    const json = super.exportJSON()

    // convert nested editor instances back into HTML because their content may not
    // be automatically updated when the nested editor changes
    if (this.__captionEditor) {
      this.__captionEditor.getEditorState().read(() => {
        const html = $generateHtmlFromNodes(this.__captionEditor!, null)
        const cleanedHtml = cleanBasicHtml(html)
        json.caption = cleanedHtml
      })
    }

    return json
  }

  decorate() {
    return (
      <InklingCardWrapper nodeKey={this.getKey()}>
        <BookmarkNodeComponent
          author={this.author}
          captionEditor={this.__captionEditor}
          captionEditorInitialState={this.__captionEditorInitialState}
          createdWithUrl={this.__createdWithUrl}
          description={this.description}
          icon={this.icon}
          nodeKey={this.getKey()}
          publisher={this.publisher}
          thumbnail={this.thumbnail}
          title={this.title}
          url={this.url}
        />
      </InklingCardWrapper>
    )
  }
}

// oxlint-disable-next-line typescript/no-explicit-any
export const $createBookmarkNode = (dataset: Record<string, any>) => {
  return new BookmarkNode(dataset)
}

export function $isBookmarkNode(node: unknown) {
  return node instanceof BookmarkNode
}
