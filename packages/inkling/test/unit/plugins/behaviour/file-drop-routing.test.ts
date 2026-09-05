import { createEditor } from 'lexical'
import { describe, expect, it } from 'vitest'

import type { EditorCardNode } from '@/nodes/cards/editor-card-nodes'

import { ImageNode } from '@/nodes/ImageNode'
import { VideoNode } from '@/nodes/VideoNode'
import {
  claimDroppedFiles,
  getAcceptableMimeTypes,
  getEditorAcceptableMimeTypes,
} from '@/plugins/behaviour/file-drop-routing'

// The pure legs take hand-written card-node entries: `getEditorCardNodes`
// reads the card declarations (not class statics), so a fake node class could
// never register an `uploadType` — data literals are the honest fake. The
// editor-reading leg is exercised with real registered card nodes instead.
const imageEntry: [string, EditorCardNode] = ['image', { cardMenu: undefined, uploadType: 'image' }]
const videoEntry: [string, EditorCardNode] = ['video', { cardMenu: undefined, uploadType: 'video' }]
const bookmarkEntry: [string, EditorCardNode] = ['bookmark', { cardMenu: undefined }]

function file(name: string, type: string): File {
  return new File(['x'], name, { type })
}

describe('getAcceptableMimeTypes', () => {
  it('maps each upload-typed card to the mime list the host configures for its upload type', () => {
    const acceptable = getAcceptableMimeTypes([imageEntry, videoEntry], {
      image: { mimeTypes: ['image/png', 'image/jpeg'] },
      video: { mimeTypes: ['video/mp4'] },
    })

    expect(acceptable).toEqual({
      image: ['image/png', 'image/jpeg'],
      video: ['video/mp4'],
    })
  })

  it('gives an empty mime list to a card whose upload type has no host fileTypes entry', () => {
    const acceptable = getAcceptableMimeTypes([imageEntry, videoEntry], {
      image: { mimeTypes: ['image/png'] },
    })

    expect(acceptable).toEqual({ image: ['image/png'], video: [] })
  })

  it('gives every upload-typed card an empty mime list when the host configures no fileTypes at all', () => {
    expect(getAcceptableMimeTypes([imageEntry, videoEntry], undefined)).toEqual({ image: [], video: [] })
  })

  it('omits cards without an uploadType', () => {
    expect(getAcceptableMimeTypes([bookmarkEntry], undefined)).toEqual({})
  })
})

describe('getEditorAcceptableMimeTypes', () => {
  it('builds the map from the editor’s registered card nodes × the host config', () => {
    const editor = createEditor({ nodes: [ImageNode, VideoNode], onError: () => {} })

    const acceptable = getEditorAcceptableMimeTypes(editor, { image: { mimeTypes: ['image/png'] } })

    // video is registered and declares an uploadType, but the host configures
    // no video fileTypes — it claims nothing
    expect(acceptable).toEqual({ image: ['image/png'], video: [] })
  })

  it('returns an empty map for an editor with no card nodes', () => {
    const editor = createEditor({ onError: () => {} })

    expect(getEditorAcceptableMimeTypes(editor, { image: { mimeTypes: ['image/png'] } })).toEqual({})
  })
})

describe('claimDroppedFiles', () => {
  it('claims a file whose mime is in a card’s list for that card’s node type', () => {
    const png = file('photo.png', 'image/png')

    const claimed = claimDroppedFiles([png], { image: ['image/png'] })

    expect(claimed).toHaveLength(1)
    expect(claimed[0].type).toBe('image')
    expect(claimed[0].file).toBe(png)
  })

  it('claims nothing for a card with an empty mime list', () => {
    const claimed = claimDroppedFiles([file('clip.mp4', 'video/mp4')], { image: ['image/png'], video: [] })

    expect(claimed).toEqual([])
  })

  it('filters out a file whose mime matches no card', () => {
    const claimed = claimDroppedFiles([file('doc.pdf', 'application/pdf')], { image: ['image/png'] })

    expect(claimed).toEqual([])
  })

  it('preserves input order across multi-file drops', () => {
    const png = file('a.png', 'image/png')
    const mp4 = file('b.mp4', 'video/mp4')
    const jpeg = file('c.jpg', 'image/jpeg')

    const claimed = claimDroppedFiles([png, mp4, jpeg], {
      image: ['image/png', 'image/jpeg'],
      video: ['video/mp4'],
    })

    expect(claimed.map((c) => c.type)).toEqual(['image', 'video', 'image'])
    expect(claimed.map((c) => c.file)).toEqual([png, mp4, jpeg])
  })

  it('lets the first claimant win when two cards list the same mime', () => {
    const claimed = claimDroppedFiles([file('a.png', 'image/png')], {
      image: ['image/png'],
      video: ['image/png'],
    })

    expect(claimed.map((c) => c.type)).toEqual(['image'])
  })
})

describe('file-drop routing (the plugin’s composition)', () => {
  it('claims configured mimes for registered cards and drops everything else', () => {
    const editor = createEditor({ nodes: [ImageNode, VideoNode], onError: () => {} })
    const acceptable = getEditorAcceptableMimeTypes(editor, { image: { mimeTypes: ['image/png'] } })

    const png = file('photo.png', 'image/png')
    const claimed = claimDroppedFiles(
      [png, file('clip.mp4', 'video/mp4'), file('doc.pdf', 'application/pdf')],
      acceptable,
    )

    // video/mp4 falls through: registered but unconfigured claims nothing;
    // application/pdf is an unknown mime
    expect(claimed).toEqual([{ type: 'image', file: png }])
  })

  it('drops files whose only claimant is not registered in the editor', () => {
    const editor = createEditor({ nodes: [ImageNode], onError: () => {} })
    const acceptable = getEditorAcceptableMimeTypes(editor, {
      image: { mimeTypes: ['image/png'] },
      video: { mimeTypes: ['video/mp4'] },
    })

    expect(claimDroppedFiles([file('clip.mp4', 'video/mp4')], acceptable)).toEqual([])
  })
})
