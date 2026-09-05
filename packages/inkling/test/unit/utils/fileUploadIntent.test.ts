import { createHeadlessEditor } from '@lexical/headless'
import { $getNodeByKey, $getRoot, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import { FileNode, $createFileNode, type FileNode as FileNodeType } from '@/nodes/FileNode'
import { fileUploadIntent } from '@/nodes/upload-intent'

describe('fileUploadIntent', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: [FileNode], onError: () => {} })
  })

  async function createFileNodeInEditor(): Promise<string> {
    let nodeKey = ''
    await updateEditor(editor, () => {
      const fileNode = $createFileNode({
        src: '/existing.pdf',
        fileName: 'existing.pdf',
        fileSize: 12,
        fileTitle: 'existing',
      })
      $getRoot().append(fileNode)
      nodeKey = fileNode.getKey()
    })
    return nodeKey
  }

  function readFileFields(nodeKey: string): Pick<FileNodeType, 'src' | 'fileName' | 'fileSize' | 'fileTitle'> {
    return editor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey) as FileNodeType | null
      return {
        src: node?.src ?? '',
        fileName: node?.fileName ?? '',
        fileSize: node?.fileSize ?? 0,
        fileTitle: node?.fileTitle ?? '',
      }
    })
  }

  it('does nothing when files is null', async () => {
    const upload = vi.fn()
    const nodeKey = await createFileNodeInEditor()

    await fileUploadIntent({ files: null, nodeKey, editor, upload })

    expect(upload).not.toHaveBeenCalled()
    expect(readFileFields(nodeKey).src).toBe('/existing.pdf')
  })

  it('leaves the node untouched when the upload resolves to nothing', async () => {
    const upload = vi.fn().mockResolvedValue(undefined)
    const nodeKey = await createFileNodeInEditor()
    const file = new File(['file-body'], 'report.pdf', { type: 'application/pdf' })

    await fileUploadIntent({ files: [file], nodeKey, editor, upload })

    expect(upload).toHaveBeenCalledExactlyOnceWith([file])
    expect(readFileFields(nodeKey)).toEqual({
      src: '/existing.pdf',
      fileName: 'existing.pdf',
      fileSize: 12,
      fileTitle: 'existing',
    })
  })

  it('leaves the node untouched when the upload result has no first item', async () => {
    const upload = vi.fn().mockResolvedValue([])
    const nodeKey = await createFileNodeInEditor()
    const file = new File(['file-body'], 'report.pdf', { type: 'application/pdf' })

    await fileUploadIntent({ files: [file], nodeKey, editor, upload })

    expect(upload).toHaveBeenCalledExactlyOnceWith([file])
    expect(readFileFields(nodeKey).src).toBe('/existing.pdf')
  })

  it('patches the file metadata onto the node when the upload succeeds', async () => {
    const upload = vi.fn().mockResolvedValue([{ url: 'https://example.com/report.pdf' }])
    const nodeKey = await createFileNodeInEditor()
    const file = new File(['file-body'], 'report.pdf', { type: 'application/pdf' })

    await fileUploadIntent({ files: [file], nodeKey, editor, upload })

    expect(readFileFields(nodeKey)).toEqual({
      src: 'https://example.com/report.pdf',
      fileName: 'report.pdf',
      fileSize: 9,
      fileTitle: 'report',
    })
  })

  it('writes an empty src when the result item has no url', async () => {
    const upload = vi.fn().mockResolvedValue([{}])
    const nodeKey = await createFileNodeInEditor()
    const file = new File(['file-body'], 'report.pdf', { type: 'application/pdf' })

    await fileUploadIntent({ files: [file], nodeKey, editor, upload })

    expect(readFileFields(nodeKey)).toEqual({
      src: '',
      fileName: 'report.pdf',
      fileSize: 9,
      fileTitle: 'report',
    })
  })
})
