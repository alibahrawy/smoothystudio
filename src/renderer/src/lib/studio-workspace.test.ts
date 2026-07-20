import { describe, expect, it } from 'vitest'
import {
  addCanvasOp,
  closeCanvasOp,
  defaultStudioDoc,
  foldLiveDoc,
  switchCanvasOp,
  type StudioDoc,
  type StudioWorkspace,
} from './studio'

const docWith = (text: string): StudioDoc => ({ ...defaultStudioDoc(), text })

function workspace(): StudioWorkspace {
  return { canvases: [{ id: 'c1', name: 'Canvas 1', doc: docWith('one') }], activeId: 'c1' }
}

describe('canvas workspace operations', () => {
  it('folds the live document back into the active canvas', () => {
    const ws = foldLiveDoc(workspace(), docWith('edited'))
    expect(ws.canvases[0].doc.text).toBe('edited')
  })

  it('keeps the previous canvas when adding a new one', () => {
    const { ws, doc } = addCanvasOp(workspace(), docWith('edited on one'), 'c2')
    expect(ws.canvases).toHaveLength(2)
    expect(ws.canvases[0].doc.text).toBe('edited on one')
    expect(ws.activeId).toBe('c2')
    // The new canvas starts blank, and the doc handed back is the blank one.
    expect(doc.text).toBe(defaultStudioDoc().text)
    expect(ws.canvases[1].doc).toBe(doc)
  })

  /** The reported bug: work done on a freshly created canvas vanished. */
  it('keeps work done on a new canvas when switching away and back', () => {
    const start = workspace()
    const added = addCanvasOp(start, start.canvases[0].doc, 'c2')

    // …the user designs on the new canvas…
    const editedOnTwo = docWith('made on canvas two')

    // …switches back to the first…
    const back = switchCanvasOp(added.ws, editedOnTwo, 'c1')!
    expect(back.doc.text).toBe('one')
    expect(back.ws.canvases.find((c) => c.id === 'c2')!.doc.text).toBe('made on canvas two')

    // …and returns. The work must still be there.
    const forward = switchCanvasOp(back.ws, back.doc, 'c2')!
    expect(forward.doc.text).toBe('made on canvas two')
  })

  it('survives several canvases created back to back', () => {
    let ws = workspace()
    let live = ws.canvases[0].doc
    for (const [id, text] of [['c2', 'two'], ['c3', 'three'], ['c4', 'four']] as const) {
      const r = addCanvasOp(ws, live, id)
      ws = r.ws
      live = docWith(text) // the user types something on each new canvas
    }
    ws = foldLiveDoc(ws, live)
    expect(ws.canvases.map((c) => c.doc.text)).toEqual(['one', 'two', 'three', 'four'])
  })

  it('ignores a switch to the canvas already open', () => {
    expect(switchCanvasOp(workspace(), docWith('x'), 'c1')).toBeNull()
  })

  it('refuses to close the last canvas', () => {
    expect(closeCanvasOp(workspace(), docWith('x'), 'c1')).toBeNull()
  })

  it('closing the active canvas falls through to a neighbour', () => {
    const { ws } = addCanvasOp(workspace(), docWith('one'), 'c2')
    const closed = closeCanvasOp(ws, docWith('two'), 'c2')!
    expect(closed.ws.canvases).toHaveLength(1)
    expect(closed.ws.activeId).toBe('c1')
    expect(closed.doc!.text).toBe('one')
  })

  it('closing a background canvas keeps the live document untouched', () => {
    const { ws } = addCanvasOp(workspace(), docWith('one'), 'c2')
    const closed = closeCanvasOp(ws, docWith('two in progress'), 'c1')!
    expect(closed.doc).toBeNull() // caller keeps its current doc
    expect(closed.ws.canvases.find((c) => c.id === 'c2')!.doc.text).toBe('two in progress')
  })
})

describe('workspace persistence', () => {
  it('rejects empty or malformed stored workspaces', async () => {
    const { parseWorkspace } = await import('./studio')
    expect(parseWorkspace(null)).toBeNull()
    expect(parseWorkspace({})).toBeNull()
    expect(parseWorkspace({ canvases: [] })).toBeNull()
  })

  it('fills fields a stored document predates, and repairs a stale activeId', async () => {
    const { parseWorkspace } = await import('./studio')
    // A canvas saved before the logo/border layers existed, pointing at a tab
    // that is no longer present.
    const ws = parseWorkspace({
      canvases: [{ id: 'a', name: 'Old', doc: { text: 'kept' } }],
      activeId: 'gone',
    })!
    expect(ws.canvases[0].doc.text).toBe('kept')
    expect(ws.canvases[0].doc.logo).toBeDefined()
    expect(ws.canvases[0].doc.border).toBeDefined()
    expect(ws.activeId).toBe('a')
  })

  it('reports the reason when a save fails instead of losing work quietly', async () => {
    const { saveStudioCanvases } = await import('./studio')
    const original = globalThis.window
    // Simulate the old failure: storage that throws on quota.
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} })
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { setItem: () => { throw new Error('QuotaExceededError') } },
    })
    const err = await saveStudioCanvases({ canvases: [], activeId: 'x' })
    expect(err).toContain('Quota')
    if (original) Object.defineProperty(globalThis, 'window', { configurable: true, value: original })
  })
})

describe('partial document merge', () => {
  it('keeps optional fields the defaults do not declare', async () => {
    const { mergeDoc, defaultStudioDoc } = await import('./studio')
    // `grade` and `fx` are optional, so a default document has neither. An
    // agent setting them must not have them silently dropped.
    const merged = mergeDoc(defaultStudioDoc(), {
      grade: { enabled: true, contrast: 130 },
      fx: { vignette: { enabled: true, amount: -50 } },
    })
    expect(merged.grade?.enabled).toBe(true)
    expect(merged.grade?.contrast).toBe(130)
    expect(merged.fx?.vignette?.enabled).toBe(true)
    expect(merged.fx?.vignette?.amount).toBe(-50)
  })

  it('still merges known objects one level deep', async () => {
    const { mergeDoc, defaultStudioDoc } = await import('./studio')
    const merged = mergeDoc(defaultStudioDoc(), { font: { size: 222 } })
    expect(merged.font.size).toBe(222)
    // Untouched sibling fields survive.
    expect(merged.font.family).toBe(defaultStudioDoc().font.family)
  })
})

describe('duplicate canvas', () => {
  it('copies the document and opens the copy next to the original', async () => {
    const { duplicateCanvasOp, addCanvasOp } = await import('./studio')
    const start = workspace()
    const { ws } = addCanvasOp(start, start.canvases[0].doc, 'c2')
    // Duplicate the FIRST canvas while the second is open.
    const dup = duplicateCanvasOp(ws, docWith('live on two'), 'c1', 'copy')!
    expect(dup.ws.canvases.map((c) => c.id)).toEqual(['c1', 'copy', 'c2'])
    expect(dup.ws.activeId).toBe('copy')
    expect(dup.doc.text).toBe('one')
    expect(dup.ws.canvases[0].name).toBe('Canvas 1')
    expect(dup.ws.canvases[1].name).toBe('Canvas 1 copy')
    // The open canvas's live edits were folded in, not lost.
    expect(dup.ws.canvases[2].doc.text).toBe('live on two')
  })

  it('deep-copies so editing the copy cannot change the original', async () => {
    const { duplicateCanvasOp } = await import('./studio')
    const dup = duplicateCanvasOp(workspace(), docWith('one'), 'c1', 'copy')!
    dup.doc.font.size = 999
    expect(dup.ws.canvases.find((c) => c.id === 'c1')!.doc.font.size).not.toBe(999)
  })

  it('returns null for a canvas that is not there', async () => {
    const { duplicateCanvasOp } = await import('./studio')
    expect(duplicateCanvasOp(workspace(), docWith('one'), 'nope')).toBeNull()
  })
})
