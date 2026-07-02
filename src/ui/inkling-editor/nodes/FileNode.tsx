import { createCommand } from 'lexical'

import FileCardIcon from '@/ui/inkling-editor/assets/icons/inkling-card-type-file.svg?react'
import InklingCardWrapper from '@/ui/inkling-editor/components/InklingCardWrapper'
import { FileNode as BaseFileNode } from '@/ui/inkling-editor/nodes/base'
import FileNodeComponent from '@/ui/inkling-editor/nodes/FileNodeComponent'

export const INSERT_FILE_COMMAND = createCommand()

export class FileNode extends BaseFileNode {
  __triggerFileDialog = false
  __initialFile: File | undefined = undefined

  static kgMenu = [
    {
      label: 'File',
      desc: 'Upload a downloadable file',
      Icon: FileCardIcon,
      insertCommand: INSERT_FILE_COMMAND,
      insertParams: {
        triggerFileDialog: true,
      },
      matches: ['file'],
      priority: 15,
      shortcut: '/file',
    },
  ]

  static uploadType = 'file'

  // oxlint-disable-next-line typescript/no-explicit-any
  constructor(dataset: Record<string, any> = {}, key?: string) {
    super(dataset, key)

    const { triggerFileDialog, initialFile } = dataset

    // don't trigger the file dialog when rendering if we've already been given a url
    this.__triggerFileDialog = (!dataset.src && triggerFileDialog) || false
    this.__initialFile = initialFile || null
  }

  getIcon() {
    return FileCardIcon
  }

  set triggerFileDialog(shouldTrigger: boolean) {
    const writable = this.getWritable()
    writable.__triggerFileDialog = shouldTrigger
  }

  decorate() {
    return (
      <InklingCardWrapper nodeKey={this.getKey()}>
        <FileNodeComponent
          fileDesc={this.fileCaption}
          fileDescPlaceholder={'Enter a description'}
          fileName={this.fileName}
          fileSize={this.formattedFileSize}
          fileSrc={this.src}
          fileTitle={this.fileTitle}
          fileTitlePlaceholder={'Enter a title'}
          initialFile={this.__initialFile}
          nodeKey={this.getKey()}
          triggerFileDialog={this.__triggerFileDialog}
        />
      </InklingCardWrapper>
    )
  }
}

// oxlint-disable-next-line typescript/no-explicit-any
export const $createFileNode = (dataset: Record<string, any>) => {
  return new FileNode(dataset)
}

export function $isFileNode(node: unknown) {
  return node instanceof FileNode
}
