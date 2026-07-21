import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
} from 'react'
import { canMoveLayer, hitTestDoc, layerPosition, setLayerPosition } from '../lib/studio-hit'
import { measureLayer, type LayerBox } from '../lib/studio-measure'
import { snapDrag, type SnapGuides } from '../lib/studio-snap'
import * as Popover from '@radix-ui/react-popover'
import {
  Download, Loader2, Save, Trash2, Check, Undo2, Redo2, Plus, X, Upload, Image as ImageIcon,
  Type, List, LayoutGrid, Columns3, RotateCcw, Search, ChevronDown, Shapes,
  Sticker, ImagePlus, Wand2, GripVertical, Copy, Eye, EyeOff, Italic, Square, BadgeCheck,
  FlipHorizontal, FlipVertical, Pipette, Link2, Sparkles,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppStore } from '../store'
import { Button } from '../components/ui/button'
import { Field } from '../components/ui/field'
import { Input } from '../components/ui/input'
import { ColorPicker } from '../components/ui/color-picker'
import { cn } from '../lib/cn'
/**
 * Background removal runs on device, in a utility process.
 *
 * It briefly went through the hosted endpoint, which was a mistake: that route
 * caps request bodies at a few megabytes and a full-resolution PNG data URL is
 * past the limit before it starts, so it failed with
 * `413 FUNCTION_PAYLOAD_TOO_LARGE`. Locally there is no size limit, no
 * per-image cost, the higher-accuracy model is used, and the photo never
 * leaves the machine.
 */
async function removeBackgroundLocally(
  sourceDataUrl: string,
  edgeSoftness: number,
  onProgress?: (p: { ratio: number; note?: string }) => void,
): Promise<string> {
  const res = await window.studioApi.removeBackground(
    { imageDataUrl: sourceDataUrl, edgeSoftness },
    onProgress,
  )
  if (!res.ok) throw new Error(res.error)
  return res.imageDataUrl
}
import {
  CANVAS_PRESETS, DEFAULT_FONTS, applyPreset, batchLines, defaultStudioDoc, docToPreset,
  effectiveLayerOrder, exportAllFiles, exportSuggestedName, loadCustomFonts, loadStudioCanvases,
  defaultColorGrade, GRADE_PRESETS,
  default3D, defaultBlinds, defaultMask, defaultColorReplace, defaultCrop, defaultDuotone, defaultEcho,
  defaultGaussianBlur, defaultMirror, defaultMosaic, defaultNoise, defaultRadialBlur,
  defaultRoughen, defaultTransform, defaultTurbulence, defaultVignette, defaultWave,
  fxOrder, normalizeFx,
  DECOR_KEYS, DECOR_DEFAULT_SHAPE, decorOrder, type DecorKey,
  type FxBlinds, type FxMirror, type FxRadialBlur, type FxWave, type LayerEffects, type WaveType,
  duplicateCanvasOp, loadStudioPresets, mergeDoc, newExtraBorder, newExtraIcon, newExtraImage, newExtraLogo, newExtraShape,
  newExtraText, preloadImage, registerFont, renderDocToPngBase64, renderStudioDoc,
  resetPrimaryLayer, saveCustomFonts, saveStudioCanvases, saveStudioPresets,
  type BorderStyle, type CustomFont, type EffectColorGrade,
  type EffectGlow, type EffectPattern, type EffectShadow,
  type EffectStroke, type ExtraBorderItem, type ExtraLogoItem,
  type ExtraIconItem, type ExtraImageItem, type ExtraShapeItem, type ExtraTextItem,
  type GradientDir, type HAlign, type LogoCorner, type LogoStyle,
  type MaterialType, type PrimaryLayer, type ShapeType, type StudioCanvas, type StudioDoc,
  type StudioMode, type StudioPreset,
} from '../lib/studio'
import { resizeDoc } from '../lib/studio-resize'

const selectCls =
  'h-8 w-full rounded-md border border-border bg-background px-2.5 text-base text-foreground outline-none transition-colors duration-120 ease-out focus:border-primary focus:ring-2 focus:ring-primary-soft disabled:opacity-50'

/** Eyedropper plumbing. The Color-change effect lives inside deeply nested
 *  layer cards, so arming the picker travels by context rather than through
 *  every card's props. */
interface EyedropperCtx {
  requestPick: (apply: (hex: string) => void) => void
  picking: boolean
  /** Every layer on the canvas, for the Mask effect's "clip to" picker. */
  maskTargets: Array<{ id: string; label: string }>
}
const EyedropperContext = createContext<EyedropperCtx>({
  requestPick: () => undefined,
  picking: false,
  maskTargets: [],
})
const useEyedropper = (): EyedropperCtx => useContext(EyedropperContext)

const MODES: Array<{ value: StudioMode; label: string; icon: React.ReactNode }> = [
  { value: 'single', label: 'Single', icon: <Type /> },
  { value: 'bullet', label: 'Bullets', icon: <List /> },
  { value: 'batch', label: 'Batch', icon: <LayoutGrid /> },
  { value: 'split', label: 'Split', icon: <Columns3 /> },
]

/**
 * Studio — the SmoothyStudio title designer (née BobbaStudio), ported from the
 * standalone Electron app. Four text modes (single / bullets / batch / split),
 * gradient & glass fills, letter/word/line spacing, decorative shapes, patterns,
 * canvas backgrounds, an icon/logo overlay, undo-redo, and transparent PNG export.
 */
export function Studio(): JSX.Element {
  // ── Multiple canvases — each an independent document with a tab ──
  const initialWs = useRef<ReturnType<typeof loadStudioCanvases>>()
  if (!initialWs.current) initialWs.current = loadStudioCanvases()
  const [canvases, setCanvases] = useState<StudioCanvas[]>(initialWs.current.canvases)
  const [activeId, setActiveId] = useState(initialWs.current.activeId)
  const [doc, setDoc] = useState<StudioDoc>(
    () => initialWs.current!.canvases.find((c) => c.id === initialWs.current!.activeId)!.doc,
  )
  const [presets, setPresets] = useState<StudioPreset[]>(() => loadStudioPresets())
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([])
  const [systemFonts, setSystemFonts] = useState<string[]>(DEFAULT_FONTS)
  const [exporting, setExporting] = useState(false)
  const [exportedTo, setExportedTo] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const selectedLayerIdRef = useRef<string | null>(null)
  selectedLayerIdRef.current = selectedLayerId

  // Eyedropper: an effect asks for a color, and the next click on the preview
  // samples it. The target lives in a ref so re-renders can't drop it.
  const [picking, setPicking] = useState(false)
  const pickTarget = useRef<((hex: string) => void) | null>(null)
  const requestPick = useCallback((apply: (hex: string) => void): void => {
    pickTarget.current = apply
    setPicking(true)
  }, [])
  const handlePickedColor = useCallback((hex: string): void => {
    pickTarget.current?.(hex)
    pickTarget.current = null
    setPicking(false)
  }, [])

  const [removingBg, setRemovingBg] = useState(false)
  const [bgRemoveProgress, setBgRemoveProgress] = useState<{ ratio: number; note?: string } | null>(null)
  const [bgRemoveError, setBgRemoveError] = useState<string | null>(null)

  // Forced-redraw nonce for async image/icon loads — bumping this re-renders the
  // canvas WITHOUT mutating doc identity (which would otherwise be seen as an
  // edit and corrupt the undo history).
  const [redrawNonce, forceRedraw] = useReducer((x: number) => x + 1, 0)

  // ── Undo / redo history (snapshot stack, 50 deep) ──
  // A push is scheduled whenever `doc` diverges from the snapshot at the stack
  // head. undo()/redo() set `doc` to the exact stored reference, so the effect
  // below sees `doc === stack[index]` and skips — no time-travel flag, no
  // phantom duplicate entry. A ref mirrors the live doc so undo/redo can flush a
  // pending (debounced) edit before navigating, and stay referentially stable.
  const history = useRef<{ stack: StudioDoc[]; index: number }>({ stack: [doc], index: 0 })
  const pushTimer = useRef<ReturnType<typeof setTimeout>>()
  const docRef = useRef(doc)
  docRef.current = doc
  const [, bumpHist] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    const h = history.current
    if (h.stack[h.index] === doc) return // undo/redo restore, or nothing changed
    clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      h.stack = h.stack.slice(0, h.index + 1)
      h.stack.push(doc)
      if (h.stack.length > 50) h.stack.shift()
      h.index = h.stack.length - 1
      bumpHist()
    }, 400)
    return () => clearTimeout(pushTimer.current)
  }, [doc])

  const flushPending = useCallback((): void => {
    const h = history.current
    clearTimeout(pushTimer.current)
    const cur = docRef.current
    if (h.stack[h.index] !== cur) {
      h.stack = h.stack.slice(0, h.index + 1)
      h.stack.push(cur)
      if (h.stack.length > 50) h.stack.shift()
      h.index = h.stack.length - 1
    }
  }, [])

  const undo = useCallback((): void => {
    flushPending()
    const h = history.current
    if (h.index <= 0) return
    h.index -= 1
    setDoc(h.stack[h.index])
    bumpHist()
  }, [flushPending])
  const redo = useCallback((): void => {
    const h = history.current
    if (h.index >= h.stack.length - 1) return
    h.index += 1
    setDoc(h.stack[h.index])
    bumpHist()
  }, [])
  const canUndo = history.current.index > 0
  const canRedo = history.current.index < history.current.stack.length - 1

  // Reveal the selected layer's card. `nearest` means clicking a card that is
  // already on screen does not scroll, so only a canvas pick actually moves the
  // panel.
  useEffect(() => {
    if (!selectedLayerId) return
    document
      .getElementById(LAYER_CARD_ID(selectedLayerId))
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedLayerId])

  // ── Fonts: curated + installed (Local Font Access) + custom uploads ──
  useEffect(() => {
    const stored = loadCustomFonts()
    setCustomFonts(stored)
    stored.forEach((f) => void registerFont(f))
    const q = (window as Window & { queryLocalFonts?: () => Promise<Array<{ family: string }>> })
      .queryLocalFonts
    if (q) {
      q.call(window)
        .then((list) => {
          const families = [...new Set(list.map((f) => f.family))]
          if (families.length) {
            setSystemFonts([...new Set([...DEFAULT_FONTS, ...families])].sort((a, b) => a.localeCompare(b)))
          }
        })
        .catch(() => undefined)
    }
  }, [])

  // Persist all canvases (the live doc folded into the active one) + preload
  // referenced images.
  // Surfaced in the header — losing a design silently is the one failure mode
  // this app must never have.
  const [saveError, setSaveError] = useState<string | null>(null)
  const skipFirstSave = useRef(true)
  useEffect(() => {
    // Skip the mount-time run — stringifying every canvas (embedded image data
    // URLs included) is main-thread work we shouldn't pay just for opening the
    // view when nothing changed yet.
    if (skipFirstSave.current) {
      skipFirstSave.current = false
      return
    }
    const t = setTimeout(() => {
      void saveStudioCanvases({
        canvases: canvases.map((c) => (c.id === activeId ? { ...c, doc } : c)),
        activeId,
      }).then(setSaveError)
    }, 400)
    return () => clearTimeout(t)
  }, [doc, canvases, activeId])
  useEffect(() => {
    if (doc.canvas.imageDataUrl) preloadImage(doc.canvas.imageDataUrl, forceRedraw)
    if (doc.icon.dataUrl) preloadImage(doc.icon.dataUrl, forceRedraw)
    if (doc.image.dataUrl) preloadImage(doc.image.dataUrl, forceRedraw)
    doc.extraIcons.forEach((it) => {
      if (it.dataUrl) preloadImage(it.dataUrl, forceRedraw)
    })
    ;(doc.extraImages ?? []).forEach((it) => {
      if (it.dataUrl) preloadImage(it.dataUrl, forceRedraw)
    })
    if (doc.logo?.dataUrl) preloadImage(doc.logo.dataUrl, forceRedraw)
    ;(doc.extraLogos ?? []).forEach((it) => {
      if (it.dataUrl) preloadImage(it.dataUrl, forceRedraw)
    })
  }, [
    doc.canvas.imageDataUrl,
    doc.icon.dataUrl,
    doc.image.dataUrl,
    doc.extraIcons,
    doc.extraImages,
    doc.logo?.dataUrl,
    doc.extraLogos,
    forceRedraw,
  ])

  // ── Canvas tab operations ──
  const resetHistoryTo = useCallback((d: StudioDoc): void => {
    clearTimeout(pushTimer.current)
    history.current = { stack: [d], index: 0 }
    bumpHist()
  }, [])

  const switchCanvas = useCallback(
    (id: string): void => {
      if (id === activeId) return
      const target = canvases.find((c) => c.id === id)
      if (!target) return
      // Fold the live doc into the canvas we're leaving, then load the target.
      setCanvases((cs) => cs.map((c) => (c.id === activeId ? { ...c, doc: docRef.current } : c)))
      setActiveId(id)
      setDoc(target.doc)
      resetHistoryTo(target.doc)
    },
    [activeId, canvases, resetHistoryTo],
  )

  const addCanvas = useCallback((): void => {
    const fresh = defaultStudioDoc()
    const next: StudioCanvas = {
      id: crypto.randomUUID(),
      name: `Canvas ${canvases.length + 1}`,
      doc: fresh,
    }
    setCanvases((cs) => [
      ...cs.map((c) => (c.id === activeId ? { ...c, doc: docRef.current } : c)),
      next,
    ])
    setActiveId(next.id)
    setDoc(fresh)
    resetHistoryTo(fresh)
  }, [activeId, canvases.length, resetHistoryTo])

  const closeCanvas = useCallback(
    (id: string): void => {
      if (canvases.length <= 1) return
      const idx = canvases.findIndex((c) => c.id === id)
      const remaining = canvases.filter((c) => c.id !== id)
      setCanvases(remaining)
      if (id === activeId) {
        const neighbor = remaining[Math.min(idx, remaining.length - 1)]
        setActiveId(neighbor.id)
        setDoc(neighbor.doc)
        resetHistoryTo(neighbor.doc)
      }
    },
    [activeId, canvases, resetHistoryTo],
  )

  /** Copy the open canvas — for "same thumbnail, slightly different". */
  const duplicateCanvas = useCallback(
    (sourceId: string): void => {
      const res = duplicateCanvasOp({ canvases, activeId }, docRef.current, sourceId)
      if (!res) return
      setCanvases(res.ws.canvases)
      setActiveId(res.ws.activeId)
      setDoc(res.doc)
      resetHistoryTo(res.doc)
    },
    [activeId, canvases, resetHistoryTo],
  )

  /**
   * Change the canvas size and re-lay-out the contents to suit — scaling type
   * and margins, keeping edge-flush things flush, and restacking a side-by-side
   * layout when the orientation flips.
   */
  const resizeCanvas = useCallback((width: number, height: number): void => {
    setDoc((d) => resizeDoc(d, width, height))
  }, [])

  const renameCanvas = useCallback((id: string, current: string): void => {
    const name = window.prompt('Canvas name', current)?.trim()
    if (!name) return
    setCanvases((cs) => cs.map((c) => (c.id === id ? { ...c, name } : c)))
  }, [])

  const patch = useCallback(
    <K extends keyof StudioDoc>(key: K, value: Partial<StudioDoc[K]>): void => {
      setDoc((d) => ({
        ...d,
        [key]:
          typeof d[key] === 'object' && d[key] !== null && !Array.isArray(d[key])
            ? { ...(d[key] as object), ...(value as object) }
            : value,
      }))
    },
    [],
  )

  // ── Export ──
  const exportSingle = async (): Promise<void> => {
    if (exporting) return
    setExporting(true)
    setExportedTo(null)
    setExportError(null)
    try {
      const dataBase64 = renderDocToPngBase64(doc)
      const suggestedName = exportSuggestedName(doc)
      if (window.studioApi?.savePng) {
        const res = await window.studioApi.savePng({ dataBase64, suggestedName })
        if (res && 'filePath' in res) setExportedTo(res.filePath)
        else if (res && 'error' in res) setExportError(`Couldn't save: ${res.error}`)
      } else {
        downloadFallback(`data:image/png;base64,${dataBase64}`, `${suggestedName}.png`)
        setExportedTo(`${suggestedName}.png`)
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }

  const exportAll = async (): Promise<void> => {
    if (exporting) return
    setExporting(true)
    setExportedTo(null)
    setExportError(null)
    try {
      const files = exportAllFiles(doc)
      if (!files.length) return
      if (window.studioApi?.exportBatch) {
        const res = await window.studioApi.exportBatch({ files })
        if (res) {
          setExportedTo(`${res.count} file${res.count === 1 ? '' : 's'} → ${res.folderPath}`)
          if (res.failed.length) setExportError(`${res.failed.length} file(s) failed to write`)
        }
      } else {
        files.forEach((f) => downloadFallback(`data:image/png;base64,${f.dataBase64}`, f.name))
        setExportedTo(`${files.length} files`)
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }

  // ── Presets ──
  const savePreset = (): void => {
    const name = window.prompt('Preset name')?.trim()
    if (!name) return
    const next = [
      ...presets.filter((p) => p.name !== name),
      docToPreset(doc, name, crypto.randomUUID()),
    ]
    setPresets(next)
    saveStudioPresets(next)
  }
  const deletePreset = (id: string): void => {
    const next = presets.filter((p) => p.id !== id)
    setPresets(next)
    saveStudioPresets(next)
  }

  // ── Font upload ──
  const uploadFont = async (): Promise<void> => {
    const file = await pickFile('.ttf,.otf,.woff,.woff2')
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    const name = file.name.replace(/\.(ttf|otf|woff2?|woff)$/i, '')
    const font: CustomFont = { name, dataUrl }
    await registerFont(font)
    const next = [...customFonts.filter((f) => f.name !== name), font]
    setCustomFonts(next)
    saveCustomFonts(next)
    patch('font', { family: name })
  }

  const uploadCanvasImage = async (): Promise<void> => {
    const file = await pickFile('image/*')
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    setDoc((d) => ({ ...d, canvas: { ...d.canvas, bg: 'image', imageDataUrl: dataUrl } }))
  }
  const uploadIcon = async (): Promise<void> => {
    const file = await pickFile('image/*,.svg')
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    setDoc((d) => ({ ...d, icon: { ...d.icon, enabled: true, dataUrl } }))
  }

  // ── Picture layer: upload, local high-accuracy background removal ──
  // ── Handoff from AI Photos ──
  // A generated image arrives as a data URL. It fills the primary picture layer
  // when that's still empty, otherwise it lands as an extra layer so an
  // existing composition is never silently overwritten.
  const setTab = useAppStore((s) => s.setTab)
  const setLiveDoc = useAppStore((s) => s.setLiveDoc)
  const pendingStudioImage = useAppStore((s) => s.pendingStudioImage)
  const clearPendingStudioImage = useAppStore((s) => s.clearPendingStudioImage)
  useEffect(() => {
    if (!pendingStudioImage) return
    setDoc((d) => {
      if (!d.image.dataUrl) {
        return {
          ...d,
          image: {
            ...d.image,
            enabled: true,
            dataUrl: pendingStudioImage,
            originalDataUrl: pendingStudioImage,
            bgRemoved: false,
          },
          layers: { ...d.layers, image: true },
          removedPrimaries: (d.removedPrimaries ?? []).filter((k) => k !== 'image'),
        }
      }
      return { ...d, extraImages: [...(d.extraImages ?? []), newExtraImage(pendingStudioImage)] }
    })
    clearPendingStudioImage()
  }, [pendingStudioImage, clearPendingStudioImage])

  // ── Handoff from the MCP server ──
  // Documents an agent rendered arrive here and open as new canvases, so the
  // agent's output is a starting point the user can finish rather than a file
  // dropped somewhere. Existing canvases are never touched.
  // Mirror the open document into the store so the MCP server can read what
  // the user is looking at, and edit it rather than only creating new canvases.
  useEffect(() => {
    const name = canvases.find((c) => c.id === activeId)?.name ?? 'Canvas'
    setLiveDoc({ name, doc })
  }, [doc, activeId, canvases, setLiveDoc])

  const pendingStudioDocs = useAppStore((s) => s.pendingStudioDocs)
  const takePendingStudioDocs = useAppStore((s) => s.takePendingStudioDocs)
  useEffect(() => {
    if (pendingStudioDocs.length === 0) return
    const queued = takePendingStudioDocs()
    if (queued.length === 0) return
    const added = queued.map((q) => ({
      id: crypto.randomUUID(),
      name: q.name,
      doc: mergeDoc(defaultStudioDoc(), q.doc),
    }))
    // Fold the open canvas first so the current design survives the switch.
    setCanvases((cs) => [
      ...cs.map((c) => (c.id === activeId ? { ...c, doc: docRef.current } : c)),
      ...added,
    ])
    const last = added[added.length - 1]
    setActiveId(last.id)
    setDoc(last.doc)
    resetHistoryTo(last.doc)
  }, [pendingStudioDocs, takePendingStudioDocs, activeId, resetHistoryTo])

  const uploadPictureImage = async (): Promise<void> => {
    const file = await pickFile('image/*')
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    setBgRemoveError(null)
    const size = await loadImageNaturalSize(dataUrl)
    const width = size ? Math.min(size.width, Math.max(200, doc.canvas.width * 0.5)) : 600
    setDoc((d) => ({
      ...d,
      image: { ...d.image, enabled: true, dataUrl, originalDataUrl: dataUrl, bgRemoved: false, width },
    }))
  }

  const removePictureBackground = async (): Promise<void> => {
    // Always run against the pristine upload — re-running with a different
    // quality/edge-softness on an already-cutout (transparent) image would
    // feed the matting model a bad input.
    const source = doc.image.originalDataUrl ?? doc.image.dataUrl
    if (!source || removingBg) return
    setRemovingBg(true)
    setBgRemoveError(null)
    setBgRemoveProgress({ ratio: 0 })
    try {
      const cutout = await removeBackgroundLocally(
        source,
        doc.image.bgRemovalEdgeSoftness,
        setBgRemoveProgress,
      )
      setDoc((d) => ({ ...d, image: { ...d.image, dataUrl: cutout, bgRemoved: true } }))
    } catch (e) {
      setBgRemoveError(e instanceof Error ? e.message : String(e))
    } finally {
      setRemovingBg(false)
      setBgRemoveProgress(null)
    }
  }

  const restorePictureOriginal = (): void => {
    setDoc((d) => ({
      ...d,
      image: { ...d.image, dataUrl: d.image.originalDataUrl ?? d.image.dataUrl, bgRemoved: false },
    }))
  }

  // ── Primary layers are deletable too ──
  // Deleting drops the card and the layer's contribution to the canvas; the
  // matching toolbar button then reads "Add …" and restores the kind at its
  // factory defaults, so delete-then-add gives a clean layer.
  const removedPrimaries = doc.removedPrimaries ?? []
  const removePrimary = (kind: PrimaryLayer): void => {
    setDoc((d) => ({
      ...d,
      removedPrimaries: [...new Set([...(d.removedPrimaries ?? []), kind])],
      layerOrder: effectiveLayerOrder(d).filter((e) => e !== kind),
    }))
    setSelectedLayerId((id) => (id === kind ? null : id))
  }
  const restorePrimary = (kind: PrimaryLayer): void => {
    setDoc((d) => {
      const reset = resetPrimaryLayer(d, kind)
      return {
        ...reset,
        labels: { ...d.labels, [kind]: undefined },
        layers: { ...d.layers, [kind]: true },
        removedPrimaries: (d.removedPrimaries ?? []).filter((k) => k !== kind),
        layerOrder: [kind, ...effectiveLayerOrder(d).filter((e) => e !== kind)],
      }
    })
  }

  // ── Extra layers: any number of standalone text/shape/icon items ──
  const addExtraText = (): void => {
    if (removedPrimaries.includes('text')) return restorePrimary('text')
    setDoc((d) => ({ ...d, extraTexts: [...d.extraTexts, newExtraText()] }))
  }
  const patchExtraText = (id: string, p: Partial<ExtraTextItem>): void => {
    setDoc((d) => ({ ...d, extraTexts: d.extraTexts.map((t) => (t.id === id ? { ...t, ...p } : t)) }))
  }
  const removeExtraText = (id: string): void => {
    setDoc((d) => ({ ...d, extraTexts: d.extraTexts.filter((t) => t.id !== id) }))
  }
  const duplicateExtraText = (id: string): void => {
    setDoc((d) => {
      const idx = d.extraTexts.findIndex((t) => t.id === id)
      if (idx < 0) return d
      const src = d.extraTexts[idx]
      const copy = { ...structuredClone(src), id: crypto.randomUUID(), x: src.x + 40, y: src.y + 40 }
      const arr = [...d.extraTexts]
      arr.splice(idx + 1, 0, copy)
      return { ...d, extraTexts: arr }
    })
  }

  const addExtraShape = (): void => {
    if (removedPrimaries.includes('shape')) return restorePrimary('shape')
    setDoc((d) => ({ ...d, extraShapes: [...d.extraShapes, newExtraShape()] }))
  }
  const patchExtraShape = (id: string, p: Partial<ExtraShapeItem>): void => {
    setDoc((d) => ({ ...d, extraShapes: d.extraShapes.map((s) => (s.id === id ? { ...s, ...p } : s)) }))
  }
  const removeExtraShape = (id: string): void => {
    setDoc((d) => ({ ...d, extraShapes: d.extraShapes.filter((s) => s.id !== id) }))
  }
  const duplicateExtraShape = (id: string): void => {
    setDoc((d) => {
      const idx = d.extraShapes.findIndex((s) => s.id === id)
      if (idx < 0) return d
      const src = d.extraShapes[idx]
      const copy = { ...structuredClone(src), id: crypto.randomUUID(), x: src.x + 40, y: src.y + 40 }
      const arr = [...d.extraShapes]
      arr.splice(idx + 1, 0, copy)
      return { ...d, extraShapes: arr }
    })
  }

  const addExtraIcon = async (): Promise<void> => {
    if (removedPrimaries.includes('icon')) return restorePrimary('icon')
    const file = await pickFile('image/*,.svg')
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    setDoc((d) => ({ ...d, extraIcons: [...d.extraIcons, { ...newExtraIcon(), dataUrl }] }))
  }
  const patchExtraIcon = (id: string, p: Partial<ExtraIconItem>): void => {
    setDoc((d) => ({ ...d, extraIcons: d.extraIcons.map((it) => (it.id === id ? { ...it, ...p } : it)) }))
  }
  const removeExtraIcon = (id: string): void => {
    setDoc((d) => ({ ...d, extraIcons: d.extraIcons.filter((it) => it.id !== id) }))
  }
  const duplicateExtraIcon = (id: string): void => {
    setDoc((d) => {
      const idx = d.extraIcons.findIndex((it) => it.id === id)
      if (idx < 0) return d
      const src = d.extraIcons[idx]
      const copy = { ...structuredClone(src), id: crypto.randomUUID(), x: src.x + 40, y: src.y + 40 }
      const arr = [...d.extraIcons]
      arr.splice(idx + 1, 0, copy)
      return { ...d, extraIcons: arr }
    })
  }
  const replaceExtraIcon = async (id: string): Promise<void> => {
    const file = await pickFile('image/*,.svg')
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    patchExtraIcon(id, { dataUrl })
  }

  // ── Duplicate a primary item → spawns an independent extra copy of the same
  // kind. At the default center alignment the extra's canvas-center + x/y anchor
  // lines up with the primary's, so the copy appears right beside it (+40/+40).
  const currentPrimaryText = (d: StudioDoc): string => {
    if (d.mode === 'batch') {
      const lines = batchLines(d)
      return lines[d.selectedBatchIndex] ?? lines[0] ?? d.text
    }
    if (d.mode === 'bullet') return d.bullets.filter((b) => b.trim()).join('\n')
    if (d.mode === 'split') return [d.split.left, d.split.center, d.split.right].filter((s) => s.trim()).join('  ')
    return d.text
  }
  const duplicatePrimaryText = (): void => {
    setDoc((d) => {
      const copy: ExtraTextItem = {
        id: crypto.randomUUID(),
        enabled: true,
        text: currentPrimaryText(d),
        x: d.align.offsetX + 40,
        y: d.align.offsetY + 40,
        fontFamily: d.font.family,
        fontWeight: d.font.weight,
        italic: d.font.italic,
        size: d.font.size,
        color: d.material.type === 'gradient' ? d.material.gradientColor1 : d.font.color,
        align: d.align.h,
        opacity: 100,
        stroke: structuredClone(d.stroke),
        shadow: structuredClone(d.shadow),
        glow: structuredClone(d.glow),
      }
      return { ...d, extraTexts: [...d.extraTexts, copy] }
    })
  }
  const duplicatePrimaryShape = (): void => {
    setDoc((d) => {
      const copy: ExtraShapeItem = {
        ...structuredClone(d.shape),
        id: crypto.randomUUID(),
        enabled: true,
        x: d.shape.x + 40,
        y: d.shape.y + 40,
      }
      return { ...d, extraShapes: [...d.extraShapes, copy] }
    })
  }
  const duplicatePrimaryIcon = (): void => {
    setDoc((d) => {
      if (!d.icon.dataUrl) return d
      const copy: ExtraIconItem = {
        id: crypto.randomUUID(),
        enabled: true,
        dataUrl: d.icon.dataUrl,
        x: 40,
        y: 40,
        // primary icon size is a % of the font size; extras are absolute px.
        size: Math.round((d.icon.size / 100) * d.font.size),
        opacity: 100,
        tint: d.icon.tint,
        stroke: structuredClone(d.icon.stroke),
        shadow: structuredClone(d.icon.shadow),
        glow: structuredClone(d.icon.glow),
      }
      return { ...d, extraIcons: [...d.extraIcons, copy] }
    })
  }

  // ── Extra pictures ──
  const addExtraImage = async (): Promise<void> => {
    if (removedPrimaries.includes('image')) return restorePrimary('image')
    const file = await pickFile('image/*')
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    setDoc((d) => ({ ...d, extraImages: [...(d.extraImages ?? []), newExtraImage(dataUrl)] }))
  }
  const patchExtraImage = (id: string, p: Partial<ExtraImageItem>): void => {
    setDoc((d) => ({ ...d, extraImages: d.extraImages.map((it) => (it.id === id ? { ...it, ...p } : it)) }))
  }
  const removeExtraImage = (id: string): void => {
    setDoc((d) => ({ ...d, extraImages: d.extraImages.filter((it) => it.id !== id) }))
  }
  const duplicateExtraImage = (id: string): void => {
    setDoc((d) => {
      const list = d.extraImages ?? []
      const idx = list.findIndex((it) => it.id === id)
      if (idx < 0) return d
      const src = list[idx]
      const copy = { ...structuredClone(src), id: crypto.randomUUID(), x: src.x + 40, y: src.y + 40 }
      const arr = [...list]
      arr.splice(idx + 1, 0, copy)
      return { ...d, extraImages: arr }
    })
  }
  const duplicatePrimaryImage = (): void => {
    setDoc((d) => {
      if (!d.image.dataUrl) return d
      const copy: ExtraImageItem = {
        ...structuredClone(d.image),
        id: crypto.randomUUID(),
        enabled: true,
        x: d.image.x + 40,
        y: d.image.y + 40,
      }
      return { ...d, extraImages: [...(d.extraImages ?? []), copy] }
    })
  }

  // ── Borders: the primary frame plus any number of nested extra frames ──
  const addExtraBorder = (): void => {
    if (removedPrimaries.includes('border')) return restorePrimary('border')
    setDoc((d) => {
      // Nest the new frame inside the innermost existing one.
      const innermost = [d.border, ...(d.extraBorders ?? [])].reduce((a, b) =>
        a.inset + a.thickness >= b.inset + b.thickness ? a : b,
      )
      return { ...d, extraBorders: [...(d.extraBorders ?? []), newExtraBorder(innermost)] }
    })
  }
  const patchExtraBorder = (id: string, p: Partial<ExtraBorderItem>): void => {
    setDoc((d) => ({
      ...d,
      extraBorders: (d.extraBorders ?? []).map((b) => (b.id === id ? { ...b, ...p } : b)),
    }))
  }
  const removeExtraBorder = (id: string): void => {
    setDoc((d) => ({ ...d, extraBorders: (d.extraBorders ?? []).filter((b) => b.id !== id) }))
  }
  const duplicateExtraBorder = (id: string): void => {
    setDoc((d) => {
      const list = d.extraBorders ?? []
      const idx = list.findIndex((b) => b.id === id)
      if (idx < 0) return d
      const arr = [...list]
      arr.splice(idx + 1, 0, newExtraBorder(list[idx]))
      return { ...d, extraBorders: arr }
    })
  }
  const duplicatePrimaryBorder = (): void => {
    setDoc((d) => ({ ...d, extraBorders: [...(d.extraBorders ?? []), newExtraBorder(d.border)] }))
  }

  // ── Logos: a corner watermark, image or typed wordmark ──
  const uploadLogoImage = async (apply: (dataUrl: string) => void): Promise<void> => {
    const file = await pickFile('image/*,.svg')
    if (!file) return
    apply(await fileToDataUrl(file))
  }
  const addExtraLogo = (): void => {
    if (removedPrimaries.includes('logo')) return restorePrimary('logo')
    setDoc((d) => ({ ...d, extraLogos: [...(d.extraLogos ?? []), newExtraLogo(d.logo)] }))
  }
  const patchExtraLogo = (id: string, p: Partial<ExtraLogoItem>): void => {
    setDoc((d) => ({
      ...d,
      extraLogos: (d.extraLogos ?? []).map((l) => (l.id === id ? { ...l, ...p } : l)),
    }))
  }
  const removeExtraLogo = (id: string): void => {
    setDoc((d) => ({ ...d, extraLogos: (d.extraLogos ?? []).filter((l) => l.id !== id) }))
  }
  const duplicateExtraLogo = (id: string): void => {
    setDoc((d) => {
      const list = d.extraLogos ?? []
      const idx = list.findIndex((l) => l.id === id)
      if (idx < 0) return d
      const arr = [...list]
      arr.splice(idx + 1, 0, newExtraLogo(list[idx]))
      return { ...d, extraLogos: arr }
    })
  }
  const duplicatePrimaryLogo = (): void => {
    setDoc((d) => ({ ...d, extraLogos: [...(d.extraLogos ?? []), newExtraLogo(d.logo)] }))
  }

  // Drag-drop onto the canvas: SVG → icon, other image → background.
  const onCanvasDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
      setDoc((d) => ({ ...d, icon: { ...d.icon, enabled: true, dataUrl } }))
    } else if (file.type.startsWith('image/')) {
      setDoc((d) => ({ ...d, canvas: { ...d.canvas, bg: 'image', imageDataUrl: dataUrl } }))
    }
  }

  // The unified z-order: primaries + every extra (duplicated) item. Reorder
  // ops operate on this so a duplicated shape/text/icon/picture can be moved
  // anywhere in the stack, including past its primary and other kinds.
  const moveLayerById = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const order = effectiveLayerOrder(docRef.current)
      const idx = order.indexOf(id)
      if (idx === -1) return
      const nextIndex = direction === 'up' ? idx - 1 : idx + 1
      if (nextIndex < 0 || nextIndex >= order.length) return
      patch('layerOrder', arrayMove(order, idx, nextIndex))
    },
    [patch],
  )

  // Keyboard: Cmd/Ctrl+Z undo/redo, and ArrowUp/Down to reorder the selected
  // layer. Skip while focus is inside a text field so native field editing works.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
      if (inField) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      const sel = selectedLayerIdRef.current
      if (sel && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        moveLayerById(sel, e.key === 'ArrowUp' ? 'up' : 'down')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, moveLayerById])

  // Drag-to-reorder the layer cards — a small activation distance avoids
  // hijacking clicks on buttons/sliders inside the card as accidental drags.
  const layerDragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )
  const handleLayerDragEnd = useCallback(
    (event: DragEndEvent): void => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const order = effectiveLayerOrder(docRef.current)
      const oldIndex = order.indexOf(String(active.id))
      const newIndex = order.indexOf(String(over.id))
      if (oldIndex === -1 || newIndex === -1) return
      patch('layerOrder', arrayMove(order, oldIndex, newIndex))
    },
    [patch],
  )

  const isBatchOrBullet = doc.mode === 'batch' || doc.mode === 'bullet'
  const layerEntries = effectiveLayerOrder(doc)

  /** Every layer on the canvas, for the Mask effect's "clip to" picker. */
  const maskTargets = useMemo(
    () =>
      layerEntries.map((id) => {
        const primaryLabel: Record<string, string> = {
          text: doc.labels?.text ?? 'Text',
          image: doc.labels?.image ?? 'Picture',
          shape: doc.labels?.shape ?? 'Shape',
          icon: doc.labels?.icon ?? 'Icon',
          border: doc.labels?.border ?? 'Border',
          logo: doc.labels?.logo ?? 'Logo',
        }
        if (primaryLabel[id]) return { id, label: primaryLabel[id] }
        const extra =
          doc.extraTexts.find((e) => e.id === id) ??
          doc.extraShapes.find((e) => e.id === id) ??
          doc.extraIcons.find((e) => e.id === id) ??
          (doc.extraImages ?? []).find((e) => e.id === id) ??
          (doc.extraBorders ?? []).find((e) => e.id === id) ??
          (doc.extraLogos ?? []).find((e) => e.id === id)
        return { id, label: extra?.name ?? 'Layer' }
      }),
    [layerEntries, doc],
  )

  const pickCtx = useMemo(
    () => ({ requestPick, picking, maskTargets }),
    [requestPick, picking, maskTargets],
  )

  return (
    <EyedropperContext.Provider value={pickCtx}>
    <div className="flex h-full min-h-0 gap-6">
      {/* ── Controls ─────────────────────────────────────── */}
      <div className="flex w-80 shrink-0 flex-col">
        <header className="mb-3 flex items-center justify-between gap-2">
          {/* The title bar already says SmoothyStudio, so this panel only needs
              to surface a save failure — never let one pass silently. */}
          <div className="min-w-0">
            {saveError ? (
              <p className="truncate text-sm text-destructive" title={saveError}>
                Not saving: {saveError}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)">
              <Undo2 />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (⌘⇧Z)">
              <Redo2 />
            </Button>
          </div>
        </header>

        {/* Add layer — any number of standalone text/shape/icon/picture items.
            When a primary kind has been deleted, its button restores it. */}
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          <Button variant="secondary" size="sm" onClick={addExtraText} title="Add a text layer">
            <Type /> Text
          </Button>
          <Button variant="secondary" size="sm" onClick={addExtraShape} title="Add a shape layer">
            <Shapes /> Shape
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void addExtraIcon()} title="Add an icon / logo layer">
            <Sticker /> Icon
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void addExtraImage()} title="Add a picture layer">
            <ImagePlus /> Photo
          </Button>
          <Button variant="secondary" size="sm" onClick={addExtraBorder} title="Add a border frame">
            <Square /> Border
          </Button>
          <Button variant="secondary" size="sm" onClick={addExtraLogo} title="Add a corner logo / watermark">
            <BadgeCheck /> Logo
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden pb-8 pr-1">
          {/* Dynamic Layer Cards — every primary AND every duplicated (extra)
              item, in one reorderable z-stack. Draggable via dnd-kit (grip
              handle in each card's header), with up/down buttons as fallback. */}
          <DndContext
            sensors={layerDragSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleLayerDragEnd}
          >
          <SortableContext items={layerEntries} strategy={verticalListSortingStrategy}>
          {layerEntries.map((layerType) => {
            const selectHandlers = {
              isSelected: selectedLayerId === layerType,
              onSelect: () => setSelectedLayerId((id) => (id === layerType ? null : layerType)),
            }

            if (layerType === 'text') {
              return (
                <ItemCard
                  key="text"
                  sortableId={layerType}
                  title={doc.labels?.text ?? 'Text'}
                  icon={<Type />}
                  enabled={doc.layers.text}
                  onToggle={(on) => patch('layers', { text: on })}
                  onDuplicate={duplicatePrimaryText}
                  onDelete={() => removePrimary('text')}
                  onRename={(name) => setDoc((d) => ({ ...d, labels: { ...d.labels, text: name } }))}
                  {...selectHandlers}
                >
                  <Segmented
                    value={doc.mode}
                    onChange={(v) => patch('mode', v as never)}
                    options={MODES.map((m) => ({ value: m.value, label: m.label }))}
                  />
                  <ModeInput doc={doc} setDoc={setDoc} />
                  <Field label="Family">
                    <div className="flex gap-1.5">
                      <FontPicker
                        value={doc.font.family}
                        customFonts={customFonts}
                        systemFonts={systemFonts}
                        onChange={(family) => patch('font', { family })}
                      />
                      <Button variant="secondary" size="icon-md" onClick={uploadFont} title="Upload font" aria-label="Upload font">
                        <Upload />
                      </Button>
                    </div>
                  </Field>
                  <Field label="Weight" htmlFor="studio-weight">
                    <div className="flex gap-1.5">
                      <select
                        id="studio-weight"
                        className={selectCls}
                        value={doc.font.weight}
                        onChange={(e) => patch('font', { weight: Number(e.target.value) as StudioDoc['font']['weight'] })}
                      >
                        <option value={400}>Regular</option>
                        <option value={500}>Medium</option>
                        <option value={600}>Semibold</option>
                        <option value={700}>Bold</option>
                      </select>
                      <IconToggle
                        pressed={doc.font.italic}
                        onPressedChange={(on) => patch('font', { italic: on })}
                        label="Italic"
                      >
                        <Italic />
                      </IconToggle>
                    </div>
                  </Field>
                  <ValueField label="Size" value={doc.font.size} min={10} max={600} onChange={(v) => patch('font', { size: v })} unit="px" />
                  <Field label="Fill">
                    <Segmented
                      value={doc.material.type}
                      onChange={(v) => patch('material', { type: v as MaterialType })}
                      options={[
                        { value: 'solid', label: 'Solid' },
                        { value: 'gradient', label: 'Gradient' },
                        { value: 'glass', label: 'Glass' },
                      ]}
                    />
                  </Field>
                  {doc.material.type === 'solid' || doc.material.type === 'glass' ? (
                    <Field label="Color">
                      <ColorPicker value={doc.font.color} onChange={(c) => patch('font', { color: c })} />
                    </Field>
                  ) : null}
                  {doc.material.type === 'glass' ? (
                    <ValueField label="Glass opacity" value={doc.material.glassOpacity} min={5} max={80} onChange={(v) => patch('material', { glassOpacity: v })} unit="%" />
                  ) : null}
                  {doc.material.type === 'gradient' ? (
                    <>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <Field label="Color 1">
                          <ColorPicker value={doc.material.gradientColor1} onChange={(c) => patch('material', { gradientColor1: c })} />
                        </Field>
                        <Field label="Color 2">
                          <ColorPicker value={doc.material.gradientColor2} onChange={(c) => patch('material', { gradientColor2: c })} />
                        </Field>
                      </div>
                      <Field label="Direction">
                        <GradientDirControl value={doc.material.gradientDirection} onChange={(v) => patch('material', { gradientDirection: v })} />
                      </Field>
                    </>
                  ) : null}

                  {/* Spacing & position */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Spacing &amp; position
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <ValueField label="Letter spacing" value={doc.spacing.letter} min={-20} max={100} onChange={(v) => patch('spacing', { letter: v })} unit="px" />
                  <ValueField label="Word spacing" value={doc.spacing.word} min={-40} max={200} onChange={(v) => patch('spacing', { word: v })} unit="px" />
                  <ValueField label="Line spacing" value={doc.spacing.line} min={-50} max={200} onChange={(v) => patch('spacing', { line: v })} unit="px" />
                  <ValueField label="Safe zone" value={doc.align.safeZone} min={0} max={500} onChange={(v) => patch('align', { safeZone: v })} unit="px" />
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <ValueField label="Offset X" value={doc.align.offsetX} min={-2000} max={2000} onChange={(v) => patch('align', { offsetX: v })} />
                    <ValueField label="Offset Y" value={doc.align.offsetY} min={-2000} max={2000} onChange={(v) => patch('align', { offsetY: v })} />
                  </div>

                  <EffectsStack
                    sortable={fxSortable(doc.fx, (f) => setDoc((d) => ({ ...d, fx: f })))}
                    decorSortable={decorSortableFor(doc.decor, (v) => setDoc((d) => ({ ...d, decor: v })))}
                    entries={[
                      gradeEntry(doc.grade, (g) => setDoc((d) => ({ ...d, grade: g }))),
                      ...fxEntries(doc.fx, (f) => setDoc((d) => ({ ...d, fx: f })), { ...pickCtx, selfId: 'text' }),
                      {
                        key: 'shadow',
                        label: 'Shadow',
                        enabled: doc.shadow.enabled,
                        setEnabled: (on) => patch('shadow', { enabled: on }),
                        children: <ShadowFields value={doc.shadow} onChange={(v) => patch('shadow', v)} />,
                      },
                      {
                        key: 'glow',
                        label: 'Glow',
                        enabled: doc.glow.enabled,
                        setEnabled: (on) => patch('glow', { enabled: on }),
                        children: <GlowFields value={doc.glow} onChange={(v) => patch('glow', v)} />,
                      },
                      {
                        key: 'stroke',
                        label: 'Stroke',
                        enabled: doc.stroke.enabled,
                        setEnabled: (on) => patch('stroke', { enabled: on }),
                        children: <StrokeFields value={doc.stroke} onChange={(v) => patch('stroke', v)} />,
                      },
                      {
                        key: 'pattern',
                        label: 'Pattern',
                        enabled: doc.pattern.enabled,
                        setEnabled: (on) => patch('pattern', { enabled: on }),
                        children: <PatternFields value={doc.pattern} onChange={(v) => patch('pattern', v)} />,
                      },
                      {
                        key: 'box',
                        label: 'Background box',
                        enabled: doc.box.enabled,
                        setEnabled: (on) => patch('box', { enabled: on }),
                        children: (
                          <>
                            <Field label="Material">
                              <Segmented
                                value={doc.box.material}
                                onChange={(v) => patch('box', { material: v as MaterialType })}
                                options={[
                                  { value: 'solid', label: 'Solid' },
                                  { value: 'gradient', label: 'Gradient' },
                                  { value: 'glass', label: 'Glass' },
                                ]}
                              />
                            </Field>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                              <Field label="Color">
                                <ColorPicker value={doc.box.color} onChange={(c) => patch('box', { color: c })} />
                              </Field>
                              {doc.box.material === 'gradient' ? (
                                <Field label="Color 2">
                                  <ColorPicker value={doc.box.gradientColor2} onChange={(c) => patch('box', { gradientColor2: c })} />
                                </Field>
                              ) : null}
                            </div>
                            {doc.box.material !== 'gradient' ? (
                              <ValueField label="Opacity" value={doc.box.opacity} min={0} max={100} onChange={(v) => patch('box', { opacity: v })} unit="%" />
                            ) : (
                              <Field label="Direction">
                                <GradientDirControl value={doc.box.gradientDirection} onChange={(v) => patch('box', { gradientDirection: v })} />
                              </Field>
                            )}
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                              <ValueField label="Padding X" value={doc.box.paddingX} min={0} max={300} onChange={(v) => patch('box', { paddingX: v })} />
                              <ValueField label="Padding Y" value={doc.box.paddingY} min={0} max={300} onChange={(v) => patch('box', { paddingY: v })} />
                            </div>
                            <ValueField label="Corner radius" value={doc.box.radius} min={0} max={150} onChange={(v) => patch('box', { radius: v })} />
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                              <ValueField label="Text offset X" value={doc.box.offsetX} min={-200} max={200} onChange={(v) => patch('box', { offsetX: v })} />
                              <ValueField label="Text offset Y" value={doc.box.offsetY} min={-200} max={200} onChange={(v) => patch('box', { offsetY: v })} />
                            </div>
                            <EffectsStack
                              label="Box effects"
                              entries={[
                                {
                                  key: 'box-stroke',
                                  label: 'Box stroke',
                                  enabled: doc.box.stroke.enabled,
                                  setEnabled: (on) => setDoc((d) => ({ ...d, box: { ...d.box, stroke: { ...d.box.stroke, enabled: on } } })),
                                  children: <StrokeFields value={doc.box.stroke} onChange={(v) => setDoc((d) => ({ ...d, box: { ...d.box, stroke: v } }))} />,
                                },
                                {
                                  key: 'box-shadow',
                                  label: 'Box shadow',
                                  enabled: doc.box.shadow.enabled,
                                  setEnabled: (on) => setDoc((d) => ({ ...d, box: { ...d.box, shadow: { ...d.box.shadow, enabled: on } } })),
                                  children: <ShadowFields value={doc.box.shadow} onChange={(v) => setDoc((d) => ({ ...d, box: { ...d.box, shadow: v } }))} />,
                                },
                              ]}
                            />
                          </>
                        ),
                      },
                    ]}
                  />
                </ItemCard>
              )
            }

            if (layerType === 'shape') {
              return (
                <ItemCard
                  key="shape"
                  sortableId={layerType}
                  title={doc.labels?.shape ?? 'Shape'}
                  icon={<Shapes />}
                  enabled={doc.shape.enabled}
                  onToggle={(on) => patch('shape', { enabled: on })}
                  onDuplicate={duplicatePrimaryShape}
                  onDelete={() => removePrimary('shape')}
                  onRename={(name) => setDoc((d) => ({ ...d, labels: { ...d.labels, shape: name } }))}
                  {...selectHandlers}
                >
                  <Field label="Type">
                    <select className={selectCls} value={doc.shape.type} onChange={(e) => patch('shape', { type: e.target.value as StudioDoc['shape']['type'] })}>
                      <option value="circle">Circle</option>
                      <option value="square">Square</option>
                      <option value="triangle">Triangle</option>
                      <option value="star">Star</option>
                      <option value="hexagon">Hexagon</option>
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <ValueField label="Width" value={doc.shape.width ?? doc.shape.size} min={10} max={2000} onChange={(v) => patch('shape', { width: v })} unit="px" />
                    <ValueField label="Height" value={doc.shape.height ?? doc.shape.size} min={10} max={2000} onChange={(v) => patch('shape', { height: v })} unit="px" />
                  </div>
                  {doc.shape.type !== 'circle' ? (
                    <ValueField
                      label="Corner radius"
                      value={doc.shape.cornerRadius}
                      min={0}
                      max={Math.max(10, Math.round(Math.min(doc.shape.width ?? doc.shape.size, doc.shape.height ?? doc.shape.size) / 2))}
                      onChange={(v) => patch('shape', { cornerRadius: v })}
                      unit="px"
                    />
                  ) : null}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <ValueField label="Offset X" value={doc.shape.x} min={-2000} max={2000} onChange={(v) => patch('shape', { x: v })} />
                    <ValueField label="Offset Y" value={doc.shape.y} min={-2000} max={2000} onChange={(v) => patch('shape', { y: v })} />
                  </div>
                  <Field label="Fill">
                    <Segmented
                      value={doc.shape.material ?? 'solid'}
                      onChange={(v) => patch('shape', { material: v as 'solid' | 'gradient' })}
                      options={[
                        { value: 'solid', label: 'Solid' },
                        { value: 'gradient', label: 'Gradient' },
                      ]}
                    />
                  </Field>
                  {doc.shape.material === 'gradient' ? (
                    <>
                      <Field label="Color 2">
                        <ColorPicker
                          value={doc.shape.gradientColor2 ?? doc.shape.color}
                          onChange={(c) => patch('shape', { gradientColor2: c })}
                        />
                      </Field>
                      <Field label="Direction">
                        <GradientDirControl
                          value={doc.shape.gradientDirection ?? 'vertical'}
                          onChange={(v) => patch('shape', { gradientDirection: v })}
                        />
                      </Field>
                    </>
                  ) : null}
                  <ValueField label="Opacity" value={doc.shape.opacity} min={0} max={100} onChange={(v) => patch('shape', { opacity: v })} unit="%" />
                  <Field label="Color">
                    <ColorPicker value={doc.shape.color} onChange={(c) => patch('shape', { color: c })} />
                  </Field>
                  <EffectsStack
                    sortable={fxSortable(doc.shape.fx, (f) => patch('shape', { fx: f }))}
                    decorSortable={decorSortableFor(doc.shape.decor, (v) => patch('shape', { decor: v }), DECOR_DEFAULT_SHAPE)}
                    entries={[
                      gradeEntry(doc.shape.grade, (g) => patch('shape', { grade: g })),
                      ...fxEntries(doc.shape.fx, (f) => patch('shape', { fx: f }), { ...pickCtx, selfId: 'shape' }),
                      {
                        key: 'shadow',
                        label: 'Shadow',
                        enabled: doc.shape.shadow.enabled,
                        setEnabled: (on) => setDoc((d) => ({ ...d, shape: { ...d.shape, shadow: { ...d.shape.shadow, enabled: on } } })),
                        children: <ShadowFields value={doc.shape.shadow} onChange={(v) => patch('shape', { shadow: v })} />,
                      },
                      {
                        key: 'glow',
                        label: 'Glow',
                        enabled: doc.shape.glow.enabled,
                        setEnabled: (on) => setDoc((d) => ({ ...d, shape: { ...d.shape, glow: { ...d.shape.glow, enabled: on } } })),
                        children: <GlowFields value={doc.shape.glow} onChange={(v) => patch('shape', { glow: v })} />,
                      },
                      {
                        key: 'stroke',
                        label: 'Stroke',
                        enabled: doc.shape.stroke.enabled,
                        setEnabled: (on) => setDoc((d) => ({ ...d, shape: { ...d.shape, stroke: { ...d.shape.stroke, enabled: on } } })),
                        children: <StrokeFields value={doc.shape.stroke} onChange={(v) => patch('shape', { stroke: v })} />,
                      },
                      {
                        key: 'pattern',
                        label: 'Pattern',
                        enabled: doc.shape.pattern.enabled,
                        setEnabled: (on) => setDoc((d) => ({ ...d, shape: { ...d.shape, pattern: { ...d.shape.pattern, enabled: on } } })),
                        children: <PatternFields value={doc.shape.pattern} onChange={(v) => patch('shape', { pattern: v })} />,
                      },
                    ]}
                  />
                </ItemCard>
              )
            }

            if (layerType === 'icon') {
              return (
                <ItemCard
                  key="icon"
                  sortableId={layerType}
                  title={doc.labels?.icon ?? 'Icon / logo'}
                  icon={<Sticker />}
                  enabled={doc.icon.enabled}
                  onToggle={(on) => patch('icon', { enabled: on })}
                  onDuplicate={doc.icon.dataUrl ? duplicatePrimaryIcon : undefined}
                  onDelete={() => removePrimary('icon')}
                  onRename={(name) => setDoc((d) => ({ ...d, labels: { ...d.labels, icon: name } }))}
                  {...selectHandlers}
                >
                  <div className="flex gap-1.5">
                    <Button variant="secondary" size="sm" className="flex-1" onClick={uploadIcon}>
                      <Upload /> {doc.icon.dataUrl ? 'Replace' : 'Upload SVG / image'}
                    </Button>
                    {doc.icon.dataUrl ? (
                      <Button variant="ghost" size="icon-sm" onClick={() => patch('icon', { dataUrl: null })} aria-label="Clear icon">
                        <X />
                      </Button>
                    ) : null}
                  </div>
                  <Field label="Position">
                    <Segmented
                      value={doc.icon.position}
                      onChange={(v) => patch('icon', { position: v as StudioDoc['icon']['position'] })}
                      options={[
                        { value: 'left', label: 'Left' },
                        { value: 'right', label: 'Right' },
                        { value: 'above', label: 'Above' },
                        { value: 'below', label: 'Below' },
                      ]}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <ValueField label="Size" value={doc.icon.size} min={10} max={400} onChange={(v) => patch('icon', { size: v })} unit="%" />
                    <ValueField label="Gap" value={doc.icon.gap} min={0} max={200} onChange={(v) => patch('icon', { gap: v })} />
                  </div>
                  <SubSwitch label="Tint color" checked={doc.icon.tint !== null} onChange={(on) => patch('icon', { tint: on ? '#FFFFFF' : null })} />
                  {doc.icon.tint !== null ? (
                    <Field label="Tint">
                      <ColorPicker value={doc.icon.tint} onChange={(c) => patch('icon', { tint: c })} />
                    </Field>
                  ) : null}
                  <EffectsStack
                    sortable={fxSortable(doc.icon.fx, (f) => patch('icon', { fx: f }))}
                    decorSortable={decorSortableFor(doc.icon.decor, (v) => patch('icon', { decor: v }))}
                    entries={[
                      gradeEntry(doc.icon.grade, (g) => patch('icon', { grade: g })),
                      ...fxEntries(doc.icon.fx, (f) => patch('icon', { fx: f }), { ...pickCtx, selfId: 'icon' }),
                      {
                        key: 'shadow',
                        label: 'Shadow',
                        enabled: doc.icon.shadow.enabled,
                        setEnabled: (on) => setDoc((d) => ({ ...d, icon: { ...d.icon, shadow: { ...d.icon.shadow, enabled: on } } })),
                        children: <ShadowFields value={doc.icon.shadow} onChange={(v) => patch('icon', { shadow: v })} />,
                      },
                      {
                        key: 'glow',
                        label: 'Glow',
                        enabled: doc.icon.glow.enabled,
                        setEnabled: (on) => setDoc((d) => ({ ...d, icon: { ...d.icon, glow: { ...d.icon.glow, enabled: on } } })),
                        children: <GlowFields value={doc.icon.glow} onChange={(v) => patch('icon', { glow: v })} />,
                      },
                      {
                        key: 'stroke',
                        label: 'Stroke',
                        enabled: doc.icon.stroke.enabled,
                        setEnabled: (on) => setDoc((d) => ({ ...d, icon: { ...d.icon, stroke: { ...d.icon.stroke, enabled: on } } })),
                        children: <StrokeFields value={doc.icon.stroke} onChange={(v) => patch('icon', { stroke: v })} />,
                      },
                      {
                        key: 'pattern',
                        label: 'Pattern',
                        enabled: doc.icon.pattern.enabled,
                        setEnabled: (on) => setDoc((d) => ({ ...d, icon: { ...d.icon, pattern: { ...d.icon.pattern, enabled: on } } })),
                        children: <PatternFields value={doc.icon.pattern} onChange={(v) => patch('icon', { pattern: v })} />,
                      },
                    ]}
                  />
                </ItemCard>
              )
            }

            if (layerType === 'image') {
              return (
                <ItemCard
                  key="image"
                  sortableId={layerType}
                  title={doc.labels?.image ?? 'Picture'}
                  icon={<ImagePlus />}
                  enabled={doc.image.enabled}
                  onToggle={(on) => patch('image', { enabled: on })}
                  onDuplicate={doc.image.dataUrl ? duplicatePrimaryImage : undefined}
                  onDelete={() => removePrimary('image')}
                  onRename={(name) => setDoc((d) => ({ ...d, labels: { ...d.labels, image: name } }))}
                  {...selectHandlers}
                >
                  <div className="flex gap-1.5">
                    <Button variant="secondary" size="sm" className="flex-1" onClick={uploadPictureImage}>
                      <Upload /> {doc.image.dataUrl ? 'Replace' : 'Upload picture'}
                    </Button>
                    {doc.image.dataUrl ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => patch('image', { dataUrl: null, originalDataUrl: null, bgRemoved: false })}
                        aria-label="Clear picture"
                      >
                        <X />
                      </Button>
                    ) : null}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => setTab('photos')}
                    title="Generate a subject or background with AI, then send it back here"
                  >
                    <Sparkles /> Generate with AI
                  </Button>
                  {doc.image.dataUrl ? (
                    <>
                      <ValueField
                        label="Edge softness"
                        value={doc.image.bgRemovalEdgeSoftness}
                        min={0}
                        max={100}
                        onChange={(v) => patch('image', { bgRemovalEdgeSoftness: v })}
                        unit="%"
                      />
                      <div className="flex gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1"
                          onClick={removePictureBackground}
                          disabled={removingBg}
                        >
                          {removingBg ? <Loader2 className="animate-spin" /> : <Wand2 />}
                          {removingBg
                            ? bgRemoveProgress?.note ?? 'Removing background…'
                            : doc.image.bgRemoved ? 'Re-run removal' : 'Remove background'}
                        </Button>
                        {doc.image.bgRemoved ? (
                          <Button variant="ghost" size="icon-sm" onClick={restorePictureOriginal} aria-label="Restore original" title="Restore original">
                            <RotateCcw />
                          </Button>
                        ) : null}
                      </div>
                      {bgRemoveError ? <p className="text-sm text-destructive">{bgRemoveError}</p> : null}
                      <ValueField label="Size" value={doc.image.width} min={20} max={4000} onChange={(v) => patch('image', { width: v })} unit="px" />
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <ValueField label="Offset X" value={doc.image.x} min={-2000} max={2000} onChange={(v) => patch('image', { x: v })} />
                        <ValueField label="Offset Y" value={doc.image.y} min={-2000} max={2000} onChange={(v) => patch('image', { y: v })} />
                      </div>
                      <ValueField label="Opacity" value={doc.image.opacity} min={0} max={100} onChange={(v) => patch('image', { opacity: v })} unit="%" />
                      <EffectsStack
                        sortable={fxSortable(doc.image.fx, (f) => patch('image', { fx: f }))}
                        decorSortable={decorSortableFor(doc.image.decor, (v) => patch('image', { decor: v }))}
                        entries={[
                          gradeEntry(doc.image.grade, (g) => patch('image', { grade: g })),
                          ...fxEntries(doc.image.fx, (f) => patch('image', { fx: f }), { ...pickCtx, selfId: 'image' }),
                          {
                            key: 'shadow',
                            label: 'Shadow',
                            enabled: doc.image.shadow.enabled,
                            setEnabled: (on) => setDoc((d) => ({ ...d, image: { ...d.image, shadow: { ...d.image.shadow, enabled: on } } })),
                            children: <ShadowFields value={doc.image.shadow} onChange={(v) => patch('image', { shadow: v })} />,
                          },
                          {
                            key: 'glow',
                            label: 'Glow',
                            enabled: doc.image.glow.enabled,
                            setEnabled: (on) => setDoc((d) => ({ ...d, image: { ...d.image, glow: { ...d.image.glow, enabled: on } } })),
                            children: <GlowFields value={doc.image.glow} onChange={(v) => patch('image', { glow: v })} />,
                          },
                          {
                            key: 'stroke',
                            label: 'Stroke',
                            enabled: doc.image.stroke.enabled,
                            setEnabled: (on) => setDoc((d) => ({ ...d, image: { ...d.image, stroke: { ...d.image.stroke, enabled: on } } })),
                            children: <StrokeFields value={doc.image.stroke} onChange={(v) => patch('image', { stroke: v })} />,
                          },
                        ]}
                      />
                    </>
                  ) : null}
                </ItemCard>
              )
            }
            if (layerType === 'logo') {
              return (
                <ItemCard
                  key="logo"
                  sortableId={layerType}
                  title={doc.labels?.logo ?? 'Logo'}
                  icon={<BadgeCheck />}
                  enabled={doc.logo.enabled}
                  onToggle={(on) => patch('logo', { enabled: on })}
                  onDuplicate={duplicatePrimaryLogo}
                  onDelete={() => removePrimary('logo')}
                  onRename={(name) => setDoc((d) => ({ ...d, labels: { ...d.labels, logo: name } }))}
                  {...selectHandlers}
                >
                  <LogoFields
                    value={doc.logo}
                    onChange={(p) => patch('logo', p)}
                    onUpload={() => void uploadLogoImage((dataUrl) => patch('logo', { dataUrl, kind: 'image' }))}
                    customFonts={customFonts}
                    systemFonts={systemFonts}
                  />
                </ItemCard>
              )
            }
            if (layerType === 'border') {
              return (
                <ItemCard
                  key="border"
                  sortableId={layerType}
                  title={doc.labels?.border ?? 'Border'}
                  icon={<Square />}
                  enabled={doc.border.enabled}
                  onToggle={(on) => patch('border', { enabled: on })}
                  onDuplicate={duplicatePrimaryBorder}
                  onDelete={() => removePrimary('border')}
                  onRename={(name) => setDoc((d) => ({ ...d, labels: { ...d.labels, border: name } }))}
                  {...selectHandlers}
                >
                  <BorderFields value={doc.border} onChange={(p) => patch('border', p)} />
                </ItemCard>
              )
            }
            // ── Extra (duplicated) items, keyed by UUID in the layer order ──
            const exShape = doc.extraShapes.find((s) => s.id === layerType)
            if (exShape) {
              return (
                <ExtraShapeCard
                  key={exShape.id}
                  sortableId={layerType}
                  item={exShape}
                  index={doc.extraShapes.findIndex((s) => s.id === exShape.id)}
                  onChange={(p) => patchExtraShape(exShape.id, p)}
                  onDelete={() => removeExtraShape(exShape.id)}
                  onDuplicate={() => duplicateExtraShape(exShape.id)}
                  {...selectHandlers}
                />
              )
            }
            const exText = doc.extraTexts.find((t) => t.id === layerType)
            if (exText) {
              return (
                <ExtraTextCard
                  key={exText.id}
                  sortableId={layerType}
                  item={exText}
                  index={doc.extraTexts.findIndex((t) => t.id === exText.id)}
                  onChange={(p) => patchExtraText(exText.id, p)}
                  onDelete={() => removeExtraText(exText.id)}
                  onDuplicate={() => duplicateExtraText(exText.id)}
                  customFonts={customFonts}
                  systemFonts={systemFonts}
                  {...selectHandlers}
                />
              )
            }
            const exIcon = doc.extraIcons.find((it) => it.id === layerType)
            if (exIcon) {
              return (
                <ExtraIconCard
                  key={exIcon.id}
                  sortableId={layerType}
                  item={exIcon}
                  index={doc.extraIcons.findIndex((it) => it.id === exIcon.id)}
                  onChange={(p) => patchExtraIcon(exIcon.id, p)}
                  onDelete={() => removeExtraIcon(exIcon.id)}
                  onDuplicate={() => duplicateExtraIcon(exIcon.id)}
                  onReplace={() => void replaceExtraIcon(exIcon.id)}
                  {...selectHandlers}
                />
              )
            }
            const exImg = (doc.extraImages ?? []).find((it) => it.id === layerType)
            if (exImg) {
              return (
                <ExtraImageCard
                  key={exImg.id}
                  sortableId={layerType}
                  item={exImg}
                  index={(doc.extraImages ?? []).findIndex((it) => it.id === exImg.id)}
                  onChange={(p) => patchExtraImage(exImg.id, p)}
                  onDelete={() => removeExtraImage(exImg.id)}
                  onDuplicate={() => duplicateExtraImage(exImg.id)}
                  {...selectHandlers}
                />
              )
            }
            const exBorder = (doc.extraBorders ?? []).find((b) => b.id === layerType)
            if (exBorder) {
              const idx = (doc.extraBorders ?? []).findIndex((b) => b.id === exBorder.id)
              return (
                <ItemCard
                  key={exBorder.id}
                  sortableId={layerType}
                  title={exBorder.name ?? `Border ${idx + 2}`}
                  icon={<Square />}
                  enabled={exBorder.enabled}
                  onToggle={(on) => patchExtraBorder(exBorder.id, { enabled: on })}
                  onDuplicate={() => duplicateExtraBorder(exBorder.id)}
                  onDelete={() => removeExtraBorder(exBorder.id)}
                  onRename={(name) => patchExtraBorder(exBorder.id, { name })}
                  {...selectHandlers}
                >
                  <BorderFields value={exBorder} selfId={exBorder.id} onChange={(p) => patchExtraBorder(exBorder.id, p)} />
                </ItemCard>
              )
            }
            const exLogo = (doc.extraLogos ?? []).find((l) => l.id === layerType)
            if (exLogo) {
              const idx = (doc.extraLogos ?? []).findIndex((l) => l.id === exLogo.id)
              return (
                <ItemCard
                  key={exLogo.id}
                  sortableId={layerType}
                  title={exLogo.name ?? `Logo ${idx + 2}`}
                  icon={<BadgeCheck />}
                  enabled={exLogo.enabled}
                  onToggle={(on) => patchExtraLogo(exLogo.id, { enabled: on })}
                  onDuplicate={() => duplicateExtraLogo(exLogo.id)}
                  onDelete={() => removeExtraLogo(exLogo.id)}
                  onRename={(name) => patchExtraLogo(exLogo.id, { name })}
                  {...selectHandlers}
                >
                  <LogoFields
                    value={exLogo}
                    selfId={exLogo.id}
                    onChange={(p) => patchExtraLogo(exLogo.id, p)}
                    onUpload={() =>
                      void uploadLogoImage((dataUrl) => patchExtraLogo(exLogo.id, { dataUrl, kind: 'image' }))
                    }
                    customFonts={customFonts}
                    systemFonts={systemFonts}
                  />
                </ItemCard>
              )
            }
            return null
          })}
          </SortableContext>
          </DndContext>

          {/* ── Item: Canvas background — size lives in the bar above the canvas ── */}
          <ItemCard
            title="Canvas background"
            icon={<ImageIcon />}
            enabled={doc.layers.canvasBg}
            onToggle={(on) => patch('layers', { canvasBg: on })}
          >
            <Field label="Background">
              <Segmented
                value={doc.canvas.bg}
                onChange={(v) => patch('canvas', { bg: v as StudioDoc['canvas']['bg'] })}
                options={[
                  { value: 'transparent', label: 'None' },
                  { value: 'solid', label: 'Solid' },
                  { value: 'gradient', label: 'Grad' },
                  { value: 'image', label: 'Image' },
                ]}
              />
            </Field>
            {doc.canvas.bg === 'solid' ? (
              <Field label="Color">
                <ColorPicker value={doc.canvas.bgColor} onChange={(c) => patch('canvas', { bgColor: c })} />
              </Field>
            ) : null}
            {doc.canvas.bg === 'gradient' ? (
              <>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <Field label="Color 1">
                    <ColorPicker value={doc.canvas.bgColor} onChange={(c) => patch('canvas', { bgColor: c })} />
                  </Field>
                  <Field label="Color 2">
                    <ColorPicker value={doc.canvas.gradientColor2} onChange={(c) => patch('canvas', { gradientColor2: c })} />
                  </Field>
                </div>
                <Field label="Direction">
                  <GradientDirControl value={doc.canvas.gradientDirection} onChange={(v) => patch('canvas', { gradientDirection: v })} />
                </Field>
              </>
            ) : null}
            {doc.canvas.bg === 'image' ? (
              <>
                <div className="flex gap-1.5">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={uploadCanvasImage}>
                    <ImageIcon /> {doc.canvas.imageDataUrl ? 'Replace image' : 'Upload image'}
                  </Button>
                  {doc.canvas.imageDataUrl ? (
                    <Button variant="ghost" size="icon-sm" onClick={() => patch('canvas', { imageDataUrl: null })} aria-label="Clear image">
                      <X />
                    </Button>
                  ) : null}
                </div>
                {doc.canvas.imageDataUrl ? (
                  <>
                    <ValueField label="Zoom" value={doc.canvas.imageZoom} min={50} max={400} onChange={(v) => patch('canvas', { imageZoom: v })} unit="%" />
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      <ValueField label="Offset X" value={doc.canvas.imageX} min={-2000} max={2000} onChange={(v) => patch('canvas', { imageX: v })} />
                      <ValueField label="Offset Y" value={doc.canvas.imageY} min={-2000} max={2000} onChange={(v) => patch('canvas', { imageY: v })} />
                    </div>
                    <ValueField label="Blur" value={doc.canvas.filterBlur} min={0} max={40} onChange={(v) => patch('canvas', { filterBlur: v })} unit="px" />
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      <ValueField label="Brightness" value={doc.canvas.filterBrightness} min={50} max={150} onChange={(v) => patch('canvas', { filterBrightness: v })} unit="%" />
                      <ValueField label="Saturation" value={doc.canvas.filterSaturation} min={0} max={200} onChange={(v) => patch('canvas', { filterSaturation: v })} unit="%" />
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
            <EffectsStack
              entries={[
                {
                  key: 'pattern',
                  label: 'Pattern',
                  enabled: doc.canvas.pattern.enabled,
                  setEnabled: (on) => setDoc((d) => ({ ...d, canvas: { ...d.canvas, pattern: { ...d.canvas.pattern, enabled: on } } })),
                  children: <PatternFields value={doc.canvas.pattern} onChange={(v) => patch('canvas', { pattern: v })} />,
                },
              ]}
            />
          </ItemCard>


          {/* Output — effects on the finished composite. Separate from the
              layer cards because these apply after everything is drawn, which
              is the difference between darkening the frame and darkening a
              layer's own pixels. */}
          <ItemCard title="Output" icon={<Wand2 />}>
            <p className="text-sm text-muted-foreground">
              Applied to the whole design after every layer is drawn — the finishing pass.
            </p>
            <EffectsStack
              label="Finishing"
              entries={[
                gradeEntry(doc.canvasGrade, (g) => setDoc((d) => ({ ...d, canvasGrade: g }))),
                ...fxEntries(
                  doc.canvasFx,
                  (f) => setDoc((d) => ({ ...d, canvasFx: f })),
                  { ...pickCtx, selfId: '__canvas__' },
                ).filter((e) => !['mask', 'transform', 'threeD', 'crop'].includes(e.key)),
              ]}
              sortable={fxSortable(doc.canvasFx, (f) => setDoc((d) => ({ ...d, canvasFx: f })))}
            />
          </ItemCard>

          {/* Presets */}
          <Section
            title="Style presets"
            action={
              <Button variant="ghost" size="xs" onClick={savePreset} title="Save current style">
                <Save /> Save
              </Button>
            }
          >
            {presets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No presets yet — dial in a look and hit Save.</p>
            ) : (
              <div className="space-y-0.5">
                {presets.map((p) => (
                  <div key={p.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDoc((d) => applyPreset(d, p))}
                      className="h-7 min-w-0 flex-1 truncate rounded-md px-2 text-left text-base text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {p.name}
                    </button>
                    <Button variant="ghost" size="icon-sm" className="opacity-0 transition-opacity group-hover:opacity-100" onClick={() => deletePreset(p.id)} aria-label={`Delete ${p.name}`}>
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <div className="pt-1">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setDoc(defaultStudioDoc())}>
              <RotateCcw /> Reset to defaults
            </Button>
          </div>
        </div>
      </div>

      {/* ── Canvas preview ───────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Canvas tabs — one independent document per tab */}
        <div className="mb-2 flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Canvases">
          {canvases.map((c) => {
            const active = c.id === activeId
            return (
              <div
                key={c.id}
                className={cn(
                  'group flex h-7 shrink-0 items-center rounded-md border border-transparent transition-colors duration-120 ease-out',
                  active ? 'bg-primary-soft' : 'hover:bg-secondary',
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => switchCanvas(c.id)}
                  onDoubleClick={() => renameCanvas(c.id, c.name)}
                  title="Double-click to rename"
                  className={cn(
                    'h-full max-w-[140px] truncate px-2.5 text-sm font-medium outline-none',
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {c.name}
                </button>
                <button
                  type="button"
                  onClick={() => duplicateCanvas(c.id)}
                  aria-label={`Duplicate ${c.name}`}
                  title="Duplicate this canvas"
                  className={cn(
                    'rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity',
                    'hover:bg-secondary hover:text-foreground group-hover:opacity-100',
                    active && 'opacity-100',
                  )}
                >
                  <Copy className="size-3" />
                </button>
                {canvases.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => closeCanvas(c.id)}
                    aria-label={`Close ${c.name}`}
                    className={cn(
                      'mr-1 rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity',
                      'hover:bg-secondary hover:text-foreground group-hover:opacity-100',
                      active && 'opacity-100',
                    )}
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>
            )
          })}
          <Button variant="ghost" size="icon-sm" onClick={addCanvas} aria-label="New canvas" title="New canvas">
            <Plus />
          </Button>
        </div>
        <div className="mb-3 flex h-9 items-center justify-between gap-3">
          {/* Per-canvas size — each tab keeps its own resolution */}
          <div className="flex items-center gap-1.5">
            <select
              aria-label="Canvas size preset"
              className={cn(selectCls, 'h-7 w-auto min-w-[176px] text-sm')}
              value={CANVAS_PRESETS.find((p) => p.width === doc.canvas.width && p.height === doc.canvas.height)?.id ?? 'custom'}
              onChange={(e) => {
                const p = CANVAS_PRESETS.find((x) => x.id === e.target.value)
                if (p) resizeCanvas(p.width, p.height)
              }}
            >
              {CANVAS_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
              <option value="custom" disabled>Custom</option>
            </select>
            <div className="w-[72px]">
              <NumberInput
                value={doc.canvas.width}
                min={16}
                max={8192}
                onCommit={(v) => resizeCanvas(v, doc.canvas.height)}
                compact
                aria-label="Canvas width"
              />
            </div>
            <span className="text-sm text-muted-foreground">×</span>
            <div className="w-[72px]">
              <NumberInput
                value={doc.canvas.height}
                min={16}
                max={8192}
                onCommit={(v) => resizeCanvas(doc.canvas.width, v)}
                compact
                aria-label="Canvas height"
              />
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => resizeCanvas(doc.canvas.height, doc.canvas.width)}
              title="Swap width and height — the layout restacks to suit"
              aria-label="Swap orientation"
            >
              <RotateCcw />
            </Button>
            {doc.canvas.bg === 'transparent' ? (
              <span className="ml-1 hidden font-mono text-sm text-muted-foreground xl:inline">transparent</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {exportError ? (
              <span className="max-w-[280px] truncate text-sm text-destructive" title={exportError}>
                {exportError}
              </span>
            ) : exportedTo ? (
              <span className="inline-flex items-center gap-1 truncate text-sm text-muted-foreground">
                <Check className="size-3.5 shrink-0 text-primary" />
                <span className="truncate">{exportedTo}</span>
              </span>
            ) : null}
            {isBatchOrBullet ? (
              <Button variant="secondary" size="sm" onClick={exportAll} disabled={exporting}>
                Export all
              </Button>
            ) : null}
            <Button onClick={exportSingle} disabled={exporting}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />}
              Export PNG
            </Button>
          </div>
        </div>
        <StudioPreview
          doc={doc}
          onDrop={onCanvasDrop}
          redrawNonce={redrawNonce}
          picking={picking}
          onPickColor={handlePickedColor}
          selectedId={selectedLayerId}
          onSelect={setSelectedLayerId}
          onMoveTo={(id, x, y) => setDoc((d) => setLayerPosition(d, id, x, y))}
        />
        {doc.mode === 'batch' ? (
          <BatchGallery
            doc={doc}
            redrawNonce={redrawNonce}
            onSelect={(i) => patch('selectedBatchIndex', i as never)}
          />
        ) : null}
      </div>
    </div>
    </EyedropperContext.Provider>
  )
}

/* ── Mode-specific inputs ────────────────────────────────────────────────── */

function ModeInput({
  doc,
  setDoc,
}: {
  doc: StudioDoc
  setDoc: React.Dispatch<React.SetStateAction<StudioDoc>>
}): JSX.Element {
  const textareaCls = cn(
    'w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-base text-foreground',
    'placeholder:text-muted-foreground/60 outline-none transition-colors duration-120 ease-out',
    'focus:border-primary focus:ring-2 focus:ring-primary-soft',
  )

  if (doc.mode === 'single' || doc.mode === 'batch') {
    if (doc.mode === 'batch') {
      const count = batchLines(doc).length
      return (
        <div className="space-y-1.5">
          <textarea
            value={doc.batchText}
            onChange={(e) => {
              const value = e.target.value
              // Keep the selected index in range as lines are added/removed.
              const n = value.split('\n').map((l) => l.trim()).filter(Boolean).length
              setDoc((d) => ({
                ...d,
                batchText: value,
                selectedBatchIndex: Math.min(d.selectedBatchIndex, Math.max(0, n - 1)),
              }))
            }}
            rows={4}
            placeholder={'One title per line…'}
            spellCheck={false}
            className={textareaCls}
          />
          <p className="text-sm text-muted-foreground">{count} item{count === 1 ? '' : 's'}</p>
        </div>
      )
    }
    return (
      <textarea
        value={doc.text}
        onChange={(e) => setDoc((d) => ({ ...d, text: e.target.value }))}
        rows={3}
        placeholder="Enter your text…"
        spellCheck={false}
        className={textareaCls}
      />
    )
  }

  if (doc.mode === 'split') {
    return (
      <div className="space-y-2">
        {(['left', 'center', 'right'] as const).map((slot) => (
          <Input
            key={slot}
            value={doc.split[slot]}
            onChange={(e) => setDoc((d) => ({ ...d, split: { ...d.split, [slot]: e.target.value } }))}
            placeholder={`${slot[0].toUpperCase()}${slot.slice(1)} text…`}
          />
        ))}
      </div>
    )
  }

  // bullets
  return (
    <div className="space-y-1.5">
      {doc.bullets.map((b, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-4 shrink-0 text-right font-mono text-sm text-muted-foreground">{i + 1}</span>
          <Input
            value={b}
            onChange={(e) => setDoc((d) => ({ ...d, bullets: d.bullets.map((x, j) => (j === i ? e.target.value : x)) }))}
            placeholder="List item…"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={doc.bullets.length <= 1}
            onClick={() => setDoc((d) => ({ ...d, bullets: d.bullets.filter((_, j) => j !== i) }))}
            aria-label="Remove item"
          >
            <X />
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" className="w-full" onClick={() => setDoc((d) => ({ ...d, bullets: [...d.bullets, ''] }))}>
        <Plus /> Add item
      </Button>
    </div>
  )
}

/* ── Batch gallery ───────────────────────────────────────────────────────── */

function BatchGallery({
  doc,
  redrawNonce,
  onSelect,
}: {
  doc: StudioDoc
  redrawNonce: number
  onSelect: (i: number) => void
}): JSX.Element {
  const lines = batchLines(doc)
  return (
    <div className="mt-3 shrink-0">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {lines.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">Add lines above to preview each title.</p>
        ) : (
          lines.map((text, i) => (
            <BatchThumb
              key={i}
              doc={doc}
              text={text}
              index={i}
              active={i === doc.selectedBatchIndex}
              redrawNonce={redrawNonce}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  )
}

function BatchThumb({
  doc,
  text,
  index,
  active,
  redrawNonce,
  onSelect,
}: {
  doc: StudioDoc
  text: string
  index: number
  active: boolean
  redrawNonce: number
  onSelect: (i: number) => void
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const w = 132
  const h = Math.max(24, Math.round((w * doc.canvas.height) / doc.canvas.width))
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Render at 2× thumb size (not full doc res — far cheaper) into a temp
    // canvas, then downscale for crispness. Coalesced into one rAF so a burst
    // of edits repaints each thumb at most once per frame.
    const raf = requestAnimationFrame(() => {
      const off = document.createElement('canvas')
      off.width = w * 2
      off.height = h * 2
      const octx = off.getContext('2d')
      if (!octx) return
      octx.scale((w * 2) / doc.canvas.width, (h * 2) / doc.canvas.height)
      renderStudioDoc(octx, { ...doc, selectedBatchIndex: index })
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(off, 0, 0, w, h)
    })
    return () => cancelAnimationFrame(raf)
  }, [doc, index, text, w, h, redrawNonce])
  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      title={text}
      className={cn(
        'shrink-0 rounded-md border p-1 transition-colors',
        active ? 'border-border bg-primary-soft' : 'border-border hover:border-muted-foreground/40',
      )}
      style={{ width: w + 10, height: h + 10 }}
    >
      <canvas
        ref={canvasRef}
        width={w}
        height={h}
        className="block rounded-sm bg-[repeating-conic-gradient(rgba(127,127,127,0.14)_0_25%,transparent_0_50%)] bg-[length:12px_12px]"
      />
    </button>
  )
}

/* ── Preview canvas ──────────────────────────────────────────────────────── */

function StudioPreview({
  doc,
  onDrop,
  redrawNonce,
  picking,
  onPickColor,
  selectedId,
  onSelect,
  onMoveTo,
}: {
  doc: StudioDoc
  onDrop: (e: React.DragEvent) => void
  redrawNonce: number
  /** Eyedropper armed — the next click samples a pixel instead of doing nothing. */
  picking?: boolean
  onPickColor?: (hex: string) => void
  selectedId?: string | null
  /** Canvas click picked a layer, or null for a click on empty canvas. */
  onSelect?: (id: string | null) => void
  /** Drag moved a layer to an absolute position, in that layer's own fields. */
  onMoveTo?: (id: string, x: number, y: number) => void
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fit, setFit] = useState({ width: 0, height: 0 })
  const [dragOver, setDragOver] = useState(false)

  // ── Selection outline + direct dragging ──
  // The outline is an overlay rather than something drawn into the canvas: the
  // canvas IS the exported image, and selection chrome must never reach a PNG.
  const [box, setBox] = useState<LayerBox | null>(null)
  const [nudge, setNudge] = useState<{ x: number; y: number } | null>(null)
  const [overBox, setOverBox] = useState(false)
  const [guides, setGuides] = useState<SnapGuides | null>(null)
  const [measureNonce, bumpMeasure] = useReducer((n: number) => n + 1, 0)
  const dragRef = useRef<{
    id: string
    sx: number
    sy: number
    from: { x: number; y: number }
    /** The layer's box at drag start — what snapping is computed against. */
    startBox: LayerBox | null
  } | null>(null)

  const scale = fit.width ? fit.width / doc.canvas.width : 1
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  useEffect(() => {
    if (!selectedId) {
      setBox(null)
      return
    }
    // While dragging, the outline follows the pointer via `nudge` instead —
    // re-measuring on every pointermove would re-render the layer each frame.
    if (dragRef.current) return
    let cancelled = false
    const raf = requestAnimationFrame(() => {
      if (!cancelled) setBox(measureLayer(doc, selectedId))
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [doc, selectedId, measureNonce])

  /** Pointer position in the document's own pixel space. */
  const toDoc = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * doc.canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * doc.canvas.height,
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (picking || e.button !== 0 || !onSelect) return
    const p = toDoc(e)
    const id = hitTestDoc(doc, p.x, p.y)
    onSelect(id)
    if (!id || !onMoveTo || !canMoveLayer(doc, id)) return
    const from = layerPosition(doc, id)
    if (!from) return
    // Capture keeps the drag alive if the pointer leaves the canvas. It throws
    // when the pointer is no longer active, which must not abort the drag.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* not capturable — the drag still works while the pointer stays over the canvas */
    }
    // Measure now rather than reusing `box`: the click may have just changed
    // the selection, and snapping needs the box of the layer being dragged.
    const startBox = measureLayer(doc, id)
    dragRef.current = { id, sx: e.clientX, sy: e.clientY, from, startBox: startBox.empty ? null : startBox }
    if (!startBox.empty) setBox(startBox)
    setNudge({ x: 0, y: 0 })
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const d = dragRef.current
    if (!d) {
      // Cheap rect test against the selected box only — a full hit test on every
      // pointermove would re-render every layer, and this just drives the cursor.
      if (!box || box.empty || picking) return
      const p = toDoc(e)
      const inside =
        p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height
      if (inside !== overBox) setOverBox(inside)
      return
    }
    if (!onMoveTo) return
    const s = scaleRef.current || 1
    let dx = (e.clientX - d.sx) / s
    let dy = (e.clientY - d.sy) / s
    // Snap to the canvas centre lines and edges — hold Cmd/Ctrl to drag free.
    // The threshold is in screen pixels so the pull feels the same at any zoom.
    if (d.startBox && !e.metaKey && !e.ctrlKey) {
      const snapped = snapDrag(d.startBox, dx, dy, doc.canvas.width, doc.canvas.height, 8 / s)
      dx = snapped.dx
      dy = snapped.dy
      setGuides(snapped.guides.v !== null || snapped.guides.h !== null ? snapped.guides : null)
    } else {
      setGuides(null)
    }
    setNudge({ x: dx, y: dy })
    onMoveTo(d.id, d.from.x + dx, d.from.y + dy)
  }

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!dragRef.current) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* never captured */
    }
    dragRef.current = null
    setNudge(null)
    setGuides(null)
    bumpMeasure() // the doc stopped changing — re-measure the settled box
  }

  const samplePixel = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!picking || !onPickColor) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { willReadFrequently: true })
    if (!canvas || !ctx) return
    // The canvas is displayed scaled to fit, so map the click back into the
    // document's own pixel space before reading.
    const rect = canvas.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * canvas.width)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * canvas.height)
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data
    const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`
    onPickColor(hex)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const compute = (): void => {
      const pad = 32
      const maxW = el.clientWidth - pad
      const maxH = el.clientHeight - pad
      if (maxW <= 0 || maxH <= 0) return
      const scale = Math.min(maxW / doc.canvas.width, maxH / doc.canvas.height, 1)
      setFit({ width: Math.floor(doc.canvas.width * scale), height: Math.floor(doc.canvas.height * scale) })
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [doc.canvas.width, doc.canvas.height])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Coalesce into one rAF — slider drags fire many state updates per frame,
    // and a full-res render (with shadow/glow blurs) is too expensive to run
    // for each one.
    let cancelled = false
    const raf = requestAnimationFrame(() => {
      if (cancelled) return
      renderStudioDoc(ctx, doc)
      const spec = `${doc.font.italic ? 'italic ' : ''}${doc.font.weight} ${doc.font.size}px "${doc.font.family}"`
      if (!document.fonts.check(spec)) {
        document.fonts.load(spec).then(() => {
          if (!cancelled && canvasRef.current) renderStudioDoc(ctx, doc)
        })
      }
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [doc, redrawNonce])

  const checker = useMemo(
    () => ({
      backgroundImage:
        'conic-gradient(var(--studio-check, rgba(127,127,127,0.16)) 0 25%, transparent 0 50%, var(--studio-check, rgba(127,127,127,0.16)) 0 75%, transparent 0)',
      backgroundSize: '16px 16px',
    }),
    [],
  )

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      }}
      onDrop={(e) => {
        setDragOver(false)
        void onDrop(e)
      }}
      className={cn(
        'flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border bg-secondary/40 transition-colors',
        dragOver ? 'border-primary bg-primary-soft' : 'border-border',
      )}
    >
      <div className="relative" style={{ width: fit.width || undefined, height: fit.height || undefined }}>
        <canvas
          ref={canvasRef}
          width={doc.canvas.width}
          height={doc.canvas.height}
          onClick={samplePixel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            width: fit.width || undefined,
            height: fit.height || undefined,
            ...(doc.canvas.bg === 'transparent' ? checker : {}),
          }}
          className={cn(
            'touch-none rounded-sm border border-border/60 shadow-sm',
            picking
              ? 'cursor-crosshair ring-2 ring-primary'
              : nudge
                ? 'cursor-grabbing'
                : overBox
                  ? 'cursor-move'
                  : 'cursor-default',
          )}
        />
        {box && !box.empty ? (
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-[2px] ring-1 ring-primary"
            style={{
              left: (box.x + (nudge?.x ?? 0)) * scale,
              top: (box.y + (nudge?.y ?? 0)) * scale,
              width: box.width * scale,
              height: box.height * scale,
            }}
          />
        ) : null}
        {guides?.v !== null && guides?.v !== undefined ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-primary/70"
            style={{ left: guides.v * scale }}
          />
        ) : null}
        {guides?.h !== null && guides?.h !== undefined ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 h-px bg-primary/70"
            style={{ top: guides.h * scale }}
          />
        ) : null}
      </div>
    </div>
  )
}

/* ── Local primitives ────────────────────────────────────────────────────── */

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}): JSX.Element {
  return (
    <section className="space-y-3">
      <div className="flex h-6 items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Selection + drag controls shared by every layer card (primary and extra). */
interface LayerCardControls {
  sortableId?: string
  isSelected?: boolean
  onSelect?: () => void
}

/**
 * Item card — the visually distinct container for the three canvas items
 * (Text, Shape, Icon). A hairline-bordered card with an accent-tinted icon
 * chip in the header, and an optional enable switch for items that can be
 * turned off entirely.
 */
/** DOM id of a layer's card, so selecting on the canvas can reveal it. */
const LAYER_CARD_ID = (layerId: string): string => `layer-card-${layerId}`

function ItemCard({
  title,
  icon,
  enabled,
  onToggle,
  onDelete,
  onDuplicate,
  onRename,
  onSelect,
  isSelected,
  sortableId,
  children,
}: {
  title: string
  icon: React.ReactNode
  enabled?: boolean
  onToggle?: (on: boolean) => void
  onDelete?: () => void
  onDuplicate?: () => void
  /** When provided, clicking the title text lets the user rename the item inline. */
  onRename?: (name: string) => void
  /** Called when the card header left side is clicked — sets this card as the
   *  active selection (arrow keys will then reorder it). */
  onSelect?: () => void
  isSelected?: boolean
  sortableId?: string
  children: React.ReactNode
}): JSX.Element {
  const dimmed = enabled === false
  const sortable = useSortable({ id: sortableId ?? '__static__', disabled: !sortableId })
  const style = sortableId
    ? {
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }
    : undefined

  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(title)
  useEffect(() => { if (!editingName) setDraftName(title) }, [title, editingName])

  const commitRename = (): void => {
    setEditingName(false)
    const next = draftName.trim()
    if (next && next !== title && onRename) onRename(next)
    else setDraftName(title)
  }

  return (
    <section
      ref={sortableId ? sortable.setNodeRef : undefined}
      // Lets a canvas click scroll this card into view; see LAYER_CARD_ID.
      id={sortableId ? LAYER_CARD_ID(sortableId) : undefined}
      style={style}
      className={cn(
        'rounded-lg border p-3 transition-colors duration-120',
        isSelected ? 'border-primary bg-primary-soft' : 'border-border bg-card',
        sortableId && sortable.isDragging && 'relative z-10 opacity-90 shadow-md',
      )}
    >
      <div className="flex h-7 items-center justify-between">
        <div
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
          onClick={onSelect}
          role="button"
          tabIndex={-1}
        >
          {sortableId ? (
            <button
              type="button"
              {...sortable.attributes}
              {...sortable.listeners}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Drag to reorder ${title.toLowerCase()}`}
              title="Drag to reorder"
              className="-ml-1 flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
            >
              <GripVertical className="size-3.5" />
            </button>
          ) : null}
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary [&_svg]:size-3.5">
            {icon}
          </span>
          {editingName ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') { setDraftName(title); setEditingName(false) }
                e.stopPropagation()
              }}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 rounded bg-secondary px-1 text-base font-semibold text-foreground outline-none ring-1 ring-primary"
            />
          ) : (
            <h2
              className={cn('truncate text-base font-semibold text-foreground', onRename && 'cursor-text')}
              title={onRename ? 'Click to rename' : undefined}
              onClick={(e) => {
                if (onRename) { e.stopPropagation(); setEditingName(true) }
              }}
            >
              {title}
            </h2>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onDuplicate ? (
            <Button variant="ghost" size="icon-sm" onClick={onDuplicate} aria-label={`Duplicate ${title.toLowerCase()}`} title="Duplicate">
              <Copy className="size-3.5" />
            </Button>
          ) : null}
          {onToggle ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onToggle(!enabled)}
              aria-label={`${enabled ? 'Hide' : 'Show'} ${title.toLowerCase()}`}
              title={enabled ? 'Hide layer' : 'Show layer'}
              className={cn(!enabled && 'text-muted-foreground/50')}
            >
              {enabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            </Button>
          ) : null}
          {onDelete ? (
            <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label={`Delete ${title.toLowerCase()}`} title="Delete">
              <Trash2 />
            </Button>
          ) : null}
        </div>
      </div>
      {dimmed ? null : <div className="mt-3 space-y-3">{children}</div>}
    </section>
  )
}

/**
 * Effects stack — Figma-style effect management. A labeled divider with a `+`
 * button lists effects not yet applied; picking one enables it and its
 * controls appear as a removable block. Click `+` again to add another.
 */
interface EffectEntry {
  key: string
  label: string
  enabled: boolean
  setEnabled: (on: boolean) => void
  children: React.ReactNode
  /** Present when the effect participates in the reorderable pipeline; the key
   *  written into `fx.order`. */
  sortKey?: string
  /** Rendered after the sortable region (noise — always last in the pipeline). */
  pinBottom?: boolean
  /** Part of the layer itself rather than something added — no remove button. */
  fixed?: boolean
}

/** One active effect block. Draggable when it has a sortKey and the stack has
 *  a `sortable` config — the AE-style reorderable pipeline. */
function EffectBlock({
  entry,
  draggable,
  dragId,
}: {
  entry: EffectEntry
  draggable: boolean
  /** Overrides the sortable id — decorations sort by `key`, pipeline stages by
   *  `sortKey`, and the two live in separate drag groups. */
  dragId?: string
}): JSX.Element {
  const sortable = useSortable({
    id: dragId ?? entry.sortKey ?? `__pin-${entry.key}`,
    disabled: !draggable,
  })
  const style = draggable
    ? { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }
    : undefined
  return (
    <div
      ref={draggable ? sortable.setNodeRef : undefined}
      style={style}
      className={cn(
        'rounded-md border border-border/60 bg-secondary/30 p-2.5',
        draggable && sortable.isDragging && 'relative z-10 opacity-90 shadow-md',
      )}
    >
      <div className="flex h-5 items-center justify-between">
        <div className="flex min-w-0 items-center gap-1">
          {draggable ? (
            <button
              type="button"
              {...sortable.attributes}
              {...sortable.listeners}
              aria-label={`Drag to reorder ${entry.label.toLowerCase()}`}
              title="Drag to reorder — pipeline order changes the result"
              className="-ml-1 flex size-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
            >
              <GripVertical className="size-3" />
            </button>
          ) : null}
          <span className="truncate text-xs font-semibold uppercase tracking-wider text-foreground">
            {entry.label}
          </span>
        </div>
        {entry.fixed ? null : (
          <button
            type="button"
            onClick={() => entry.setEnabled(false)}
            aria-label={`Remove ${entry.label.toLowerCase()}`}
            className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      <div className="mt-2.5 space-y-3">{entry.children}</div>
    </div>
  )
}

/** The layer's own pixels — a fixed member of the decoration stack, there so a
 *  stroke or shadow can be dragged above or below it. */
const FILL_ENTRY: EffectEntry = {
  key: 'fill',
  label: 'Fill',
  enabled: true,
  fixed: true,
  setEnabled: () => {},
  children: (
    <p className="text-sm text-muted-foreground">
      The layer&apos;s own colour or image. Drag a stroke or shadow past it to change which one
      sits on top.
    </p>
  ),
}

function EffectsStack({
  label = 'Effects',
  entries,
  sortable,
  decorSortable,
}: {
  label?: string
  entries: EffectEntry[]
  /** When set, entries with a sortKey become drag-reorderable pipeline stages. */
  sortable?: { order: string[]; onReorder: (activeKeys: string[]) => void }
  /** When set, the layer's shadow / glow / stroke / fill / pattern become their
   *  own drag-reorderable group, ahead of the pipeline stages. */
  decorSortable?: {
    order: string[]
    onReorder: (fullOrder: string[]) => void
    fallback?: readonly DecorKey[]
  }
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const available = entries.filter((e) => !e.enabled)
  const activeRaw = decorSortable ? [...entries, FILL_ENTRY].filter((e) => e.enabled) : entries.filter((e) => e.enabled)

  // Decorations (in their paint order) first, then anything else pinned, then
  // the pipeline stages in execution order, then pin-bottom entries (noise).
  const decorKeys = new Set<string>(DECOR_KEYS)
  const fullDecor = decorOrder(decorSortable?.order, decorSortable?.fallback)
  const decorActive = decorSortable
    ? activeRaw
        .filter((e) => decorKeys.has(e.key))
        .sort((a, b) => fullDecor.indexOf(a.key as DecorKey) - fullDecor.indexOf(b.key as DecorKey))
    : []

  const orderIdx = (k: string): number => {
    const i = sortable?.order.indexOf(k) ?? -1
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  const pinnedTop = activeRaw.filter(
    (e) => !e.sortKey && !e.pinBottom && !(decorSortable && decorKeys.has(e.key)),
  )
  const ordered = activeRaw
    .filter((e) => e.sortKey)
    .sort((a, b) => orderIdx(a.sortKey!) - orderIdx(b.sortKey!))
  const pinnedBottom = activeRaw.filter((e) => e.pinBottom)
  const active = [...decorActive, ...pinnedTop, ...ordered, ...pinnedBottom]

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active: dragged, over } = event
    if (!sortable || !over || dragged.id === over.id) return
    const keys = ordered.map((e) => e.sortKey!)
    const from = keys.indexOf(String(dragged.id))
    const to = keys.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    sortable.onReorder(arrayMove(keys, from, to))
  }

  const handleDecorDragEnd = (event: DragEndEvent): void => {
    const { active: dragged, over } = event
    if (!decorSortable || !over || dragged.id === over.id) return
    const shown = decorActive.map((e) => e.key)
    const from = shown.indexOf(String(dragged.id))
    const to = shown.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    const moved = arrayMove(shown, from, to)
    // Only the enabled decorations are on screen. Write the reorder back into
    // the full five-key order by refilling the slots the visible ones occupied,
    // so a decoration that is currently off keeps its place for when it returns.
    let i = 0
    const next = fullDecor.map((k) => (shown.includes(k) ? moved[i++] : k))
    decorSortable.onReorder(next)
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 pt-1">
        <span className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span className="h-px flex-1 bg-border" />
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              disabled={available.length === 0}
              aria-label={`Add ${label.toLowerCase().replace(/s$/, '')}`}
              title="Add effect"
              className={cn(
                'inline-flex size-5 items-center justify-center rounded-md border border-border text-muted-foreground',
                'transition-colors duration-120 ease-out',
                'hover:bg-secondary hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:pointer-events-none disabled:opacity-40',
              )}
            >
              <Plus className="size-3" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              sideOffset={6}
              align="end"
              className={cn(
                'z-50 w-44 rounded-lg border border-border bg-popover p-1 shadow-popover outline-none',
                'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
              )}
            >
              {available.map((e) => (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => {
                    e.setEnabled(true)
                    setOpen(false)
                  }}
                  className="flex h-7 w-full items-center rounded-sm px-2 text-left text-base text-foreground outline-none transition-colors duration-120 ease-out hover:bg-secondary"
                >
                  {e.label}
                </button>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      {decorSortable && decorActive.length > 1 ? (
        <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleDecorDragEnd}>
          <SortableContext items={decorActive.map((e) => e.key)} strategy={verticalListSortingStrategy}>
            {decorActive.map((e) => (
              <EffectBlock key={e.key} entry={e} draggable dragId={e.key} />
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        decorActive.map((e) => <EffectBlock key={e.key} entry={e} draggable={false} />)
      )}
      {sortable && ordered.length > 0 ? (
        <>
          {pinnedTop.map((e) => (
            <EffectBlock key={e.key} entry={e} draggable={false} />
          ))}
          <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ordered.map((e) => e.sortKey!)} strategy={verticalListSortingStrategy}>
              {ordered.map((e) => (
                <EffectBlock key={e.key} entry={e} draggable />
              ))}
            </SortableContext>
          </DndContext>
          {pinnedBottom.map((e) => (
            <EffectBlock key={e.key} entry={e} draggable={false} />
          ))}
        </>
      ) : (
        active
          .filter((e) => !decorActive.includes(e))
          .map((e) => <EffectBlock key={e.key} entry={e} draggable={false} />)
      )}
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">None — click + to add one.</p>
      ) : null}
    </div>
  )
}

/** The `decorSortable` prop for a layer's EffectsStack — the paint order of its
 *  shadow / glow / stroke / fill / pattern, plus the writer that persists it. */
function decorSortableFor(
  decor: string[] | undefined,
  set: (next: string[]) => void,
  fallback?: readonly DecorKey[],
): { order: string[]; onReorder: (keys: string[]) => void; fallback?: readonly DecorKey[] } {
  return { order: decorOrder(decor, fallback), onReorder: set, fallback }
}

/** The `sortable` prop for a layer's EffectsStack — execution order plus the
 *  writer that persists a reorder into `fx.order`. */
function fxSortable(
  fx: LayerEffects | undefined,
  set: (next: LayerEffects) => void,
): { order: string[]; onReorder: (keys: string[]) => void } {
  return {
    order: fxOrder(normalizeFx(fx)),
    onReorder: (keys) => set({ ...(normalizeFx(fx) ?? {}), order: keys }),
  }
}

/** Shadow fields — blur / offsets / color. Shared by every item. */
/**
 * Every effect row for a layer's EffectsStack beyond the per-layer basics
 * (shadow/glow/stroke/pattern). Each effect is stored as an optional field on
 * the layer, so an untouched layer carries none of them.
 */
type FxDataKey = Exclude<keyof LayerEffects, 'order'>

function fxEntries(
  fx: LayerEffects | undefined,
  set: (next: LayerEffects) => void,
  ctx: {
    requestPick: (apply: (hex: string) => void) => void
    picking: boolean
    /** Layers this one can be clipped to, and which layer this is. */
    maskTargets?: Array<{ id: string; label: string }>
    selfId?: string
  },
): EffectEntry[] {
  const base = normalizeFx(fx) ?? {}
  const patch = <K extends FxDataKey>(key: K, value: LayerEffects[K]): void =>
    set({ ...base, [key]: value })

  const row = <K extends FxDataKey>(
    key: K,
    label: string,
    fallback: () => NonNullable<LayerEffects[K]>,
    render: (v: NonNullable<LayerEffects[K]>, on: (p: Partial<NonNullable<LayerEffects[K]>>) => void) => React.ReactNode,
    opts?: { pinBottom?: boolean },
  ): EffectEntry => {
    // Merge over the defaults so fields added in later versions surface with
    // sane values even on fx objects saved before they existed.
    const v = { ...fallback(), ...((base[key] ?? {}) as object) } as NonNullable<LayerEffects[K]>
    const on = (p: Partial<NonNullable<LayerEffects[K]>>): void =>
      patch(key, { ...v, ...p } as LayerEffects[K])
    return {
      key: String(key),
      label,
      enabled: (v as { enabled: boolean }).enabled,
      setEnabled: (enabled) => patch(key, { ...v, enabled } as LayerEffects[K]),
      children: render(v, on),
      sortKey: opts?.pinBottom ? undefined : String(key),
      pinBottom: opts?.pinBottom,
    }
  }

  return [
    row('mask', 'Mask', defaultMask, (v, on) => {
      const targets = (ctx.maskTargets ?? []).filter((t) => t.id !== ctx.selfId)
      return (
        <>
          <Field label="Clip to" htmlFor="mask-source">
            <select
              id="mask-source"
              className={selectCls}
              value={v.sourceId}
              onChange={(e) => on({ sourceId: e.target.value })}
            >
              {targets.length === 0 ? <option value="">No other layers</option> : null}
              {targets.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </Field>
          <SubSwitch
            label="Punch out instead"
            checked={v.invert ?? false}
            onChange={(b) => on({ invert: b })}
          />
          <p className="text-sm text-muted-foreground">
            Shows this layer only where the chosen layer is — a picture inside a shape, or
            imagery through knocked-out text.
          </p>
        </>
      )
    }),
    row('echo', 'Echo', defaultEcho, (v, on) => (
      <>
        <ValueField label="Copies" value={v.copies} min={1} max={10} onChange={(n) => on({ copies: n })} />
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <ValueField label="Offset X" value={v.offsetX} min={-200} max={200} onChange={(n) => on({ offsetX: n })} />
          <ValueField label="Offset Y" value={v.offsetY} min={-200} max={200} onChange={(n) => on({ offsetY: n })} />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <ValueField label="Scale step" value={v.scaleStep} min={50} max={150} onChange={(n) => on({ scaleStep: n })} unit="%" />
          <ValueField label="Rotate step" value={v.rotateStep} min={-45} max={45} onChange={(n) => on({ rotateStep: n })} unit="°" />
        </div>
        <ValueField label="Fade" value={v.opacityDecay} min={0} max={100} onChange={(n) => on({ opacityDecay: n })} unit="%" />
      </>
    )),
    row('transform', 'Transform', defaultTransform, (v, on) => (
      <>
        <div className="flex items-end gap-1.5">
          <div className="min-w-0 flex-1">
            <ValueField
              label={v.uniform ?? true ? 'Scale' : 'Scale X'}
              value={v.scale}
              min={5}
              max={400}
              onChange={(n) => on({ scale: n })}
              unit="%"
            />
          </div>
          <IconToggle
            pressed={v.uniform ?? true}
            onPressedChange={(b) => on({ uniform: b, scaleY: v.scaleY ?? v.scale })}
            label="Uniform scale (link X and Y)"
          >
            <Link2 />
          </IconToggle>
        </div>
        {!(v.uniform ?? true) ? (
          <ValueField label="Scale Y" value={v.scaleY ?? v.scale} min={5} max={400} onChange={(n) => on({ scaleY: n })} unit="%" />
        ) : null}
        <ValueField label="Rotate" value={v.rotate} min={-180} max={180} onChange={(n) => on({ rotate: n })} unit="°" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <ValueField label="Move X" value={v.offsetX} min={-2000} max={2000} onChange={(n) => on({ offsetX: n })} />
          <ValueField label="Move Y" value={v.offsetY} min={-2000} max={2000} onChange={(n) => on({ offsetY: n })} />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <ValueField label="Anchor X" value={v.anchorX ?? 0} min={-1000} max={1000} onChange={(n) => on({ anchorX: n })} />
          <ValueField label="Anchor Y" value={v.anchorY ?? 0} min={-1000} max={1000} onChange={(n) => on({ anchorY: n })} />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <ValueField label="Skew X" value={v.skewX} min={-60} max={60} onChange={(n) => on({ skewX: n })} unit="°" />
          <ValueField label="Skew Y" value={v.skewY} min={-60} max={60} onChange={(n) => on({ skewY: n })} unit="°" />
        </div>
        <ValueField label="Opacity" value={v.opacity ?? 100} min={0} max={100} onChange={(n) => on({ opacity: n })} unit="%" />
        <Field label="Flip">
          <div className="flex gap-1.5">
            <IconToggle pressed={v.flipH} onPressedChange={(b) => on({ flipH: b })} label="Flip horizontally">
              <FlipHorizontal />
            </IconToggle>
            <IconToggle pressed={v.flipV} onPressedChange={(b) => on({ flipV: b })} label="Flip vertically">
              <FlipVertical />
            </IconToggle>
          </div>
        </Field>
      </>
    )),
    row('threeD', '3D tilt', default3D, (v, on) => (
      <>
        <ValueField label="Rotate X" value={v.rotateX} min={-70} max={70} onChange={(n) => on({ rotateX: n })} unit="°" />
        <ValueField label="Rotate Y" value={v.rotateY} min={-70} max={70} onChange={(n) => on({ rotateY: n })} unit="°" />
        <ValueField label="Perspective" value={v.distance} min={200} max={4000} onChange={(n) => on({ distance: n })} />
        <SubSwitch label="Specular sheen" checked={v.specular ?? false} onChange={(b) => on({ specular: b })} />
        {v.specular ? (
          <ValueField label="Sheen strength" value={v.specularStrength ?? 40} min={0} max={100} onChange={(n) => on({ specularStrength: n })} unit="%" />
        ) : null}
        <p className="text-sm text-muted-foreground">Lower perspective exaggerates the depth.</p>
      </>
    )),
    row('crop', 'Crop', defaultCrop, (v, on) => (
      <>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <ValueField label="Top" value={v.top} min={0} max={2000} onChange={(n) => on({ top: n })} unit="px" />
          <ValueField label="Bottom" value={v.bottom} min={0} max={2000} onChange={(n) => on({ bottom: n })} unit="px" />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <ValueField label="Left" value={v.left} min={0} max={2000} onChange={(n) => on({ left: n })} unit="px" />
          <ValueField label="Right" value={v.right} min={0} max={2000} onChange={(n) => on({ right: n })} unit="px" />
        </div>
        <ValueField label="Corner radius" value={v.radius} min={0} max={600} onChange={(n) => on({ radius: n })} unit="px" />
        <ValueField label="Edge feather" value={v.feather ?? 0} min={0} max={200} onChange={(n) => on({ feather: n })} unit="px" />
      </>
    )),
    row('mosaic', 'Mosaic', defaultMosaic, (v, on) => (
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Block width" value={v.size} min={2} max={200} onChange={(n) => on({ size: n })} unit="px" />
        <ValueField
          label="Block height"
          value={v.sizeV || v.size}
          min={2}
          max={200}
          onChange={(n) => on({ sizeV: n })}
          unit="px"
        />
      </div>
    )),
    row('gaussianBlur', 'Gaussian blur', defaultGaussianBlur, (v, on) => (
      <ValueField label="Amount" value={v.amount} min={0} max={100} onChange={(n) => on({ amount: n })} unit="px" />
    )),
    row('radialBlur', 'Radial blur', defaultRadialBlur, (v, on) => (
      <>
        <Field label="Type">
          <Segmented
            value={v.type}
            onChange={(n) => on({ type: n as FxRadialBlur['type'] })}
            options={[
              { value: 'zoom', label: 'Zoom' },
              { value: 'spin', label: 'Spin' },
            ]}
          />
        </Field>
        <ValueField label="Amount" value={v.amount} min={0} max={200} onChange={(n) => on({ amount: n })} unit="%" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <ValueField label="Center X" value={v.centerX ?? 0} min={-1500} max={1500} onChange={(n) => on({ centerX: n })} />
          <ValueField label="Center Y" value={v.centerY ?? 0} min={-1500} max={1500} onChange={(n) => on({ centerY: n })} />
        </div>
      </>
    )),
    row(
      'noise',
      'Noise / grain',
      defaultNoise,
      (v, on) => (
        <>
          <ValueField label="Amount" value={v.amount} min={0} max={100} onChange={(n) => on({ amount: n })} unit="%" />
          <ValueField label="Grain size" value={v.size} min={1} max={12} onChange={(n) => on({ size: n })} unit="px" />
          <SubSwitch label="Monochrome" checked={v.mono} onChange={(b) => on({ mono: b })} />
          <p className="text-sm text-muted-foreground">Always runs last so the grain stays crisp.</p>
        </>
      ),
      { pinBottom: true },
    ),
    row('roughen', 'Roughen edges', defaultRoughen, (v, on) => (
      <>
        <ValueField label="Amount" value={v.amount} min={0} max={100} onChange={(n) => on({ amount: n })} unit="%" />
        <ValueField label="Detail size" value={v.size} min={1} max={60} onChange={(n) => on({ size: n })} unit="px" />
        <ValueField label="Evolution" value={v.seed ?? 1} min={0} max={100} onChange={(n) => on({ seed: n })} />
      </>
    )),
    row('wave', 'Wave warp', defaultWave, (v, on) => (
      <>
        <Field label="Direction">
          <Segmented
            value={v.axis}
            onChange={(n) => on({ axis: n as FxWave['axis'] })}
            options={[
              { value: 'horizontal', label: 'Horizontal' },
              { value: 'vertical', label: 'Vertical' },
            ]}
          />
        </Field>
        <Field label="Wave type">
          <Segmented
            value={v.waveType ?? 'sine'}
            onChange={(n) => on({ waveType: n as WaveType })}
            options={[
              { value: 'sine', label: 'Sine' },
              { value: 'triangle', label: 'Triangle' },
              { value: 'square', label: 'Square' },
            ]}
          />
        </Field>
        <ValueField label="Amplitude" value={v.amplitude} min={0} max={400} onChange={(n) => on({ amplitude: n })} unit="px" />
        <ValueField label="Wavelength" value={v.wavelength} min={8} max={2000} onChange={(n) => on({ wavelength: n })} unit="px" />
        <ValueField label="Phase" value={v.phase} min={0} max={360} onChange={(n) => on({ phase: n })} unit="°" />
        <SubSwitch label="Pin edges" checked={v.pinEdges ?? false} onChange={(b) => on({ pinEdges: b })} />
      </>
    )),
    row('turbulence', 'Turbulent displace', defaultTurbulence, (v, on) => (
      <>
        <ValueField label="Amount" value={v.amount} min={0} max={300} onChange={(n) => on({ amount: n })} unit="px" />
        <ValueField label="Size" value={v.size} min={8} max={600} onChange={(n) => on({ size: n })} unit="px" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <ValueField label="Complexity" value={v.complexity} min={1} max={3} onChange={(n) => on({ complexity: n })} />
          <ValueField label="Evolution" value={v.evolution} min={0} max={100} onChange={(n) => on({ evolution: n })} />
        </div>
      </>
    )),
    row('vignette', 'Vignette', defaultVignette, (v, on) => (
      <>
        <ValueField label="Amount" value={v.amount} min={-100} max={100} onChange={(n) => on({ amount: n })} />
        <ValueField label="Size" value={v.size} min={0} max={100} onChange={(n) => on({ size: n })} unit="%" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <ValueField label="Feather" value={v.feather} min={0} max={100} onChange={(n) => on({ feather: n })} unit="%" />
          <ValueField label="Roundness" value={v.roundness} min={0} max={100} onChange={(n) => on({ roundness: n })} unit="%" />
        </div>
      </>
    )),
    row('duotone', 'Duotone', defaultDuotone, (v, on) => (
      <>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <Field label="Shadows">
            <ColorPicker value={v.shadowColor} onChange={(c) => on({ shadowColor: c })} />
          </Field>
          <Field label="Highlights">
            <ColorPicker value={v.highlightColor} onChange={(c) => on({ highlightColor: c })} />
          </Field>
        </div>
        <ValueField label="Amount" value={v.amount} min={0} max={100} onChange={(n) => on({ amount: n })} unit="%" />
      </>
    )),
    row('blinds', 'Venetian blinds', defaultBlinds, (v, on) => (
      <>
        <Field label="Direction">
          <Segmented
            value={v.direction}
            onChange={(n) => on({ direction: n as FxBlinds['direction'] })}
            options={[
              { value: 'horizontal', label: 'Horizontal' },
              { value: 'vertical', label: 'Vertical' },
            ]}
          />
        </Field>
        <ValueField label="Completion" value={v.completion} min={0} max={100} onChange={(n) => on({ completion: n })} unit="%" />
        <ValueField label="Stripe width" value={v.width} min={4} max={400} onChange={(n) => on({ width: n })} unit="px" />
      </>
    )),
    row('mirror', 'Mirror', defaultMirror, (v, on) => (
      <>
        <Field label="Keep half">
          <Segmented
            value={v.keep}
            onChange={(n) => on({ keep: n as FxMirror['keep'] })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
              { value: 'top', label: 'Top' },
              { value: 'bottom', label: 'Bottom' },
            ]}
          />
        </Field>
        <ValueField label="Line offset" value={v.offset ?? 0} min={-1000} max={1000} onChange={(n) => on({ offset: n })} unit="px" />
        <ValueField label="Line angle" value={v.angle ?? 0} min={-45} max={45} onChange={(n) => on({ angle: n })} unit="°" />
      </>
    )),
    row('colorReplace', 'Color change', defaultColorReplace, (v, on) => (
      <>
        <Field label="Pick color">
          <div className="flex gap-1.5">
            <ColorPicker value={v.from} onChange={(c) => on({ from: c })} />
            <IconToggle
              pressed={ctx.picking}
              onPressedChange={() => ctx.requestPick((hex) => on({ from: hex }))}
              label="Pick a color from the canvas"
            >
              <Pipette />
            </IconToggle>
          </div>
        </Field>
        {ctx.picking ? (
          <p className="text-sm text-primary">Click the preview to sample a color.</p>
        ) : null}
        <Field label="Change to">
          <ColorPicker value={v.to} onChange={(c) => on({ to: c })} />
        </Field>
        <Field label="Match by">
          <Segmented
            value={v.matchBy ?? 'rgb'}
            onChange={(n) => on({ matchBy: n as 'rgb' | 'hue' })}
            options={[
              { value: 'rgb', label: 'Exact color' },
              { value: 'hue', label: 'Hue' },
            ]}
          />
        </Field>
        <ValueField label="Tolerance" value={v.tolerance} min={0} max={100} onChange={(n) => on({ tolerance: n })} unit="%" />
        <ValueField label="Softness" value={v.softness ?? 0} min={0} max={100} onChange={(n) => on({ softness: n })} unit="%" />
        <SubSwitch label="Keep shading" checked={v.preserveShading} onChange={(b) => on({ preserveShading: b })} />
      </>
    )),
  ]
}

/** The "Color grade" row for a layer's EffectsStack. Layers store the grade as
 *  an optional field, so an ungraded layer falls back to neutral defaults. */
function gradeEntry(
  grade: EffectColorGrade | undefined,
  set: (g: EffectColorGrade) => void,
): EffectEntry {
  // Merge over the defaults so Lumetri fields added later surface with sane
  // values on grades saved before they existed.
  const g = { ...defaultColorGrade(), ...(grade ?? {}) }
  return {
    key: 'grade',
    label: 'Color grade',
    enabled: g.enabled,
    setEnabled: (on) => set({ ...g, enabled: on }),
    children: <ColorGradeFields value={g} onChange={set} />,
    sortKey: 'grade',
  }
}

/**
 * Color-grade fields — shared by every layer that can be graded. The preset row
 * replaces all sliders at once; the sliders below stay live for fine-tuning
 * after a look is picked.
 */
function ColorGradeFields({
  value,
  onChange,
}: {
  value: EffectColorGrade
  onChange: (v: EffectColorGrade) => void
}): JSX.Element {
  const matches = (g: Omit<EffectColorGrade, 'enabled'>): boolean =>
    (Object.keys(g) as Array<keyof typeof g>).every((k) => value[k] === g[k])
  return (
    <>
      <Field label="Look">
        <div className="flex flex-wrap gap-1">
          {GRADE_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => onChange({ ...value, ...p.grade })}
              aria-pressed={matches(p.grade)}
              className={cn(
                'h-7 rounded-md px-2 text-sm font-medium transition-colors duration-120 ease-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                matches(p.grade)
                  ? 'bg-primary-soft text-primary'
                  : 'bg-secondary text-muted-foreground hover:text-foreground',
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Field>
      <GradeGroup title="Basic correction" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Exposure" value={value.exposure ?? 0} min={-100} max={100} onChange={(v) => onChange({ ...value, exposure: v })} />
        <ValueField label="Contrast" value={value.contrast} min={0} max={200} onChange={(v) => onChange({ ...value, contrast: v })} unit="%" />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Highlights" value={value.highlights ?? 0} min={-100} max={100} onChange={(v) => onChange({ ...value, highlights: v })} />
        <ValueField label="Shadows" value={value.shadows ?? 0} min={-100} max={100} onChange={(v) => onChange({ ...value, shadows: v })} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Whites" value={value.whites ?? 0} min={-100} max={100} onChange={(v) => onChange({ ...value, whites: v })} />
        <ValueField label="Blacks" value={value.blacks ?? 0} min={-100} max={100} onChange={(v) => onChange({ ...value, blacks: v })} />
      </div>
      <ValueField label="Brightness" value={value.brightness} min={0} max={200} onChange={(v) => onChange({ ...value, brightness: v })} unit="%" />

      <GradeGroup title="Color" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Temperature" value={value.temperature} min={-100} max={100} onChange={(v) => onChange({ ...value, temperature: v })} />
        <ValueField label="Tint" value={value.tint ?? 0} min={-100} max={100} onChange={(v) => onChange({ ...value, tint: v })} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Vibrance" value={value.vibrance ?? 0} min={-100} max={100} onChange={(v) => onChange({ ...value, vibrance: v })} />
        <ValueField label="Saturation" value={value.saturation} min={0} max={300} onChange={(v) => onChange({ ...value, saturation: v })} unit="%" />
      </div>
      <ValueField label="Hue shift" value={value.hue} min={-180} max={180} onChange={(v) => onChange({ ...value, hue: v })} unit="°" />

      <GradeGroup title="Stylize" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Sepia" value={value.sepia} min={0} max={100} onChange={(v) => onChange({ ...value, sepia: v })} unit="%" />
        <ValueField label="B&W" value={value.grayscale} min={0} max={100} onChange={(v) => onChange({ ...value, grayscale: v })} unit="%" />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Invert" value={value.invert} min={0} max={100} onChange={(v) => onChange({ ...value, invert: v })} unit="%" />
        <ValueField label="Blur" value={value.blur} min={0} max={60} onChange={(v) => onChange({ ...value, blur: v })} unit="px" />
      </div>
    </>
  )
}

/** Section divider inside the color-grade panel — Lumetri's group headers. */
function GradeGroup({ title }: { title: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/** Corner picker — a 2×2 grid mirroring the canvas, so the chosen cell is
 *  literally where the logo lands. */
function CornerPicker({
  value,
  onChange,
}: {
  value: LogoCorner
  onChange: (c: LogoCorner) => void
}): JSX.Element {
  const cells: Array<{ corner: LogoCorner; label: string }> = [
    { corner: 'top-left', label: 'Top left' },
    { corner: 'top-right', label: 'Top right' },
    { corner: 'bottom-left', label: 'Bottom left' },
    { corner: 'bottom-right', label: 'Bottom right' },
  ]
  return (
    <div className="grid aspect-[16/9] w-24 grid-cols-2 grid-rows-2 gap-0.5 rounded-md border border-border bg-secondary p-0.5">
      {cells.map((c) => {
        const active = c.corner === value
        return (
          <button
            key={c.corner}
            type="button"
            onClick={() => onChange(c.corner)}
            aria-pressed={active}
            aria-label={c.label}
            title={c.label}
            className={cn(
              'flex items-center justify-center rounded-sm transition-colors duration-120 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-primary-soft' : 'hover:bg-card',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-[1px] transition-colors',
                active ? 'bg-primary' : 'bg-muted-foreground/40',
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Logo fields — shared by the primary watermark and every extra one. A logo is
 * either an uploaded image or a typed wordmark (`kind`); both hug a canvas
 * corner via margin plus a fine nudge.
 */
function LogoFields({
  value,
  onChange,
  onUpload,
  customFonts,
  systemFonts,
  selfId = 'logo',
}: {
  value: LogoStyle
  onChange: (p: Partial<LogoStyle>) => void
  onUpload: () => void
  customFonts: CustomFont[]
  systemFonts: string[]
  /** Which layer this card edits — excluded from its own mask picker. */
  selfId?: string
}): JSX.Element {
  const pick = useEyedropper()
  const isText = value.kind === 'text'
  return (
    <>
      <Field label="Source">
        <Segmented
          value={value.kind}
          onChange={(v) => onChange({ kind: v as LogoStyle['kind'] })}
          options={[
            { value: 'image', label: 'Image' },
            { value: 'text', label: 'Text' },
          ]}
        />
      </Field>

      {isText ? (
        <>
          <Field label="Wordmark" htmlFor="logo-text">
            <Input
              id="logo-text"
              value={value.text}
              onChange={(e) => onChange({ text: e.target.value })}
              placeholder="Your brand"
            />
          </Field>
          <Field label="Family">
            <FontPicker
              value={value.fontFamily}
              customFonts={customFonts}
              systemFonts={systemFonts}
              onChange={(family) => onChange({ fontFamily: family })}
            />
          </Field>
          <Field label="Weight">
            <div className="flex gap-1.5">
              <select
                className={selectCls}
                value={value.fontWeight}
                onChange={(e) => onChange({ fontWeight: Number(e.target.value) as LogoStyle['fontWeight'] })}
              >
                <option value={400}>Regular</option>
                <option value={500}>Medium</option>
                <option value={600}>Semibold</option>
                <option value={700}>Bold</option>
              </select>
              <IconToggle
                pressed={value.italic}
                onPressedChange={(on) => onChange({ italic: on })}
                label="Italic"
              >
                <Italic />
              </IconToggle>
            </div>
          </Field>
          <Field label="Color">
            <ColorPicker value={value.color} onChange={(c) => onChange({ color: c })} />
          </Field>
        </>
      ) : (
        <>
          <div className="flex gap-1.5">
            <Button variant="secondary" size="sm" className="flex-1" onClick={onUpload}>
              <Upload /> {value.dataUrl ? 'Replace logo' : 'Upload logo'}
            </Button>
            {value.dataUrl ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onChange({ dataUrl: null })}
                aria-label="Clear logo"
              >
                <X />
              </Button>
            ) : null}
          </div>
          <Field label="Tint">
            <div className="flex gap-1.5">
              {value.tint !== null ? (
                <ColorPicker value={value.tint} onChange={(c) => onChange({ tint: c })} />
              ) : (
                <div className="flex h-8 flex-1 items-center rounded-md border border-dashed border-border px-2.5 text-sm text-muted-foreground">
                  Original colors
                </div>
              )}
              <IconToggle
                pressed={value.tint !== null}
                onPressedChange={(on) => onChange({ tint: on ? '#FFFFFF' : null })}
                label="Recolor logo to a flat color"
              >
                <Wand2 />
              </IconToggle>
            </div>
          </Field>
        </>
      )}

      <Field label="Corner">
        <CornerPicker value={value.corner} onChange={(c) => onChange({ corner: c })} />
      </Field>
      <ValueField
        label={isText ? 'Font size' : 'Size'}
        value={value.size}
        min={8}
        max={800}
        onChange={(v) => onChange({ size: v })}
        unit="px"
      />
      <ValueField label="Margin" value={value.margin} min={0} max={600} onChange={(v) => onChange({ margin: v })} unit="px" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Nudge X" value={value.offsetX} min={-300} max={300} onChange={(v) => onChange({ offsetX: v })} />
        <ValueField label="Nudge Y" value={value.offsetY} min={-300} max={300} onChange={(v) => onChange({ offsetY: v })} />
      </div>
      <ValueField label="Opacity" value={value.opacity} min={0} max={100} onChange={(v) => onChange({ opacity: v })} unit="%" />
      <EffectsStack
        sortable={fxSortable(value.fx, (f) => onChange({ fx: f }))}
        decorSortable={decorSortableFor(value.decor, (v) => onChange({ decor: v }))}
        entries={[
          gradeEntry(value.grade, (g) => onChange({ grade: g })),
          ...fxEntries(value.fx, (f) => onChange({ fx: f }), { ...pick, selfId }),
          {
            key: 'shadow',
            label: 'Shadow',
            enabled: value.shadow.enabled,
            setEnabled: (on) => onChange({ shadow: { ...value.shadow, enabled: on } }),
            children: <ShadowFields value={value.shadow} onChange={(v) => onChange({ shadow: v })} />,
          },
          {
            key: 'glow',
            label: 'Glow',
            enabled: value.glow.enabled,
            setEnabled: (on) => onChange({ glow: { ...value.glow, enabled: on } }),
            children: <GlowFields value={value.glow} onChange={(v) => onChange({ glow: v })} />,
          },
          {
            key: 'stroke',
            label: 'Stroke',
            enabled: value.stroke.enabled,
            setEnabled: (on) => onChange({ stroke: { ...value.stroke, enabled: on } }),
            children: <StrokeFields value={value.stroke} onChange={(v) => onChange({ stroke: v })} />,
          },
        ]}
      />
    </>
  )
}

/**
 * Border fields — shared by the primary frame and every nested extra frame.
 * The ring sits between two rounded rects, so the outer and inner corners are
 * rounded independently ("Outer" bows the frame's outside edge, "Inner" bows
 * the hole it wraps).
 */
function BorderFields({
  value,
  onChange,
  selfId = 'border',
}: {
  value: BorderStyle
  onChange: (p: Partial<BorderStyle>) => void
  /** Which layer this card edits — excluded from its own mask picker. */
  selfId?: string
}): JSX.Element {
  const pick = useEyedropper()
  return (
    <>
      <ValueField label="Thickness" value={value.thickness} min={0} max={400} onChange={(v) => onChange({ thickness: v })} unit="px" />
      <ValueField label="Inset from edge" value={value.inset} min={0} max={600} onChange={(v) => onChange({ inset: v })} unit="px" />
      <div className="flex items-center gap-2 pt-1">
        <span className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
          Corners
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Outer" value={value.outerRadius} min={0} max={600} onChange={(v) => onChange({ outerRadius: v })} unit="px" />
        <ValueField label="Inner" value={value.innerRadius} min={0} max={600} onChange={(v) => onChange({ innerRadius: v })} unit="px" />
      </div>
      <Field label="Fill">
        <Segmented
          value={value.material}
          onChange={(v) => onChange({ material: v as BorderStyle['material'] })}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'gradient', label: 'Gradient' },
          ]}
        />
      </Field>
      {value.material === 'gradient' ? (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <Field label="Color 1">
              <ColorPicker value={value.color} onChange={(c) => onChange({ color: c })} />
            </Field>
            <Field label="Color 2">
              <ColorPicker value={value.gradientColor2} onChange={(c) => onChange({ gradientColor2: c })} />
            </Field>
          </div>
          <Field label="Direction">
            <GradientDirControl value={value.gradientDirection} onChange={(v) => onChange({ gradientDirection: v })} />
          </Field>
        </>
      ) : (
        <Field label="Color">
          <ColorPicker value={value.color} onChange={(c) => onChange({ color: c })} />
        </Field>
      )}
      <ValueField label="Opacity" value={value.opacity} min={0} max={100} onChange={(v) => onChange({ opacity: v })} unit="%" />
      <EffectsStack
        sortable={fxSortable(value.fx, (f) => onChange({ fx: f }))}
        decorSortable={decorSortableFor(value.decor, (v) => onChange({ decor: v }))}
        entries={[
          gradeEntry(value.grade, (g) => onChange({ grade: g })),
          ...fxEntries(value.fx, (f) => onChange({ fx: f }), { ...pick, selfId }),
          {
            key: 'shadow',
            label: 'Shadow',
            enabled: value.shadow.enabled,
            setEnabled: (on) => onChange({ shadow: { ...value.shadow, enabled: on } }),
            children: <ShadowFields value={value.shadow} onChange={(v) => onChange({ shadow: v })} />,
          },
          {
            key: 'glow',
            label: 'Glow',
            enabled: value.glow.enabled,
            setEnabled: (on) => onChange({ glow: { ...value.glow, enabled: on } }),
            children: <GlowFields value={value.glow} onChange={(v) => onChange({ glow: v })} />,
          },
          {
            key: 'pattern',
            label: 'Pattern',
            enabled: value.pattern.enabled,
            setEnabled: (on) => onChange({ pattern: { ...value.pattern, enabled: on } }),
            children: <PatternFields value={value.pattern} onChange={(v) => onChange({ pattern: v })} />,
          },
        ]}
      />
    </>
  )
}

function ShadowFields({
  value,
  onChange,
}: {
  value: EffectShadow
  onChange: (v: EffectShadow) => void
}): JSX.Element {
  return (
    <>
      <ValueField label="Blur" value={value.blur} min={0} max={120} onChange={(v) => onChange({ ...value, blur: v })} />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Offset X" value={value.x} min={-100} max={100} onChange={(v) => onChange({ ...value, x: v })} />
        <ValueField label="Offset Y" value={value.y} min={-100} max={100} onChange={(v) => onChange({ ...value, y: v })} />
      </div>
      <Field label="Color">
        <ColorPicker value={value.color} onChange={(c) => onChange({ ...value, color: c })} />
      </Field>
    </>
  )
}

/** Glow fields — blur / strength / color. Shared by every item. */
function GlowFields({
  value,
  onChange,
}: {
  value: EffectGlow
  onChange: (v: EffectGlow) => void
}): JSX.Element {
  return (
    <>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Blur" value={value.blur} min={5} max={80} onChange={(v) => onChange({ ...value, blur: v })} />
        <ValueField label="Strength" value={value.strength} min={1} max={6} onChange={(v) => onChange({ ...value, strength: v })} />
      </div>
      <Field label="Color">
        <ColorPicker value={value.color} onChange={(c) => onChange({ ...value, color: c })} />
      </Field>
    </>
  )
}

/** Stroke fields — width / color. Shared by every item. */
function StrokeFields({
  value,
  onChange,
}: {
  value: EffectStroke
  onChange: (v: EffectStroke) => void
}): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      <ValueField label="Width" value={value.width} min={1} max={50} onChange={(v) => onChange({ ...value, width: v })} />
      <Field label="Color">
        <ColorPicker value={value.color} onChange={(c) => onChange({ ...value, color: c })} />
      </Field>
    </div>
  )
}

/** Pattern fields — type / size / opacity / color. Fills the item's own silhouette. */
function PatternFields({
  value,
  onChange,
}: {
  value: EffectPattern
  onChange: (v: EffectPattern) => void
}): JSX.Element {
  return (
    <>
      <Field label="Type">
        <Segmented
          value={value.type}
          onChange={(v) => onChange({ ...value, type: v as EffectPattern['type'] })}
          options={[
            { value: 'grid', label: 'Grid' },
            { value: 'dots', label: 'Dots' },
            { value: 'lines', label: 'Lines' },
          ]}
        />
      </Field>
      <ValueField label="Size" value={value.size} min={10} max={300} onChange={(v) => onChange({ ...value, size: v })} />
      <ValueField label="Opacity" value={value.opacity} min={1} max={100} onChange={(v) => onChange({ ...value, opacity: v })} unit="%" />
      {value.type === 'dots' ? (
        <ValueField label="Dot size" value={value.dotSize} min={1} max={30} onChange={(v) => onChange({ ...value, dotSize: v })} />
      ) : null}
      {value.type === 'lines' ? (
        <ValueField label="Angle" value={value.angle} min={0} max={180} onChange={(v) => onChange({ ...value, angle: v })} unit="°" />
      ) : null}
      <Field label="Color">
        <ColorPicker value={value.color} onChange={(c) => onChange({ ...value, color: c })} />
      </Field>
    </>
  )
}

/** A standalone free-floating text layer, added via "+ Add text". Independent
 *  of the primary title text — own font, color, and canvas-center-relative
 *  position. */
function ExtraTextCard({
  item,
  index,
  onChange,
  onDelete,
  onDuplicate,
  customFonts,
  systemFonts,
  sortableId,
  isSelected,
  onSelect,
}: {
  item: ExtraTextItem
  index: number
  onChange: (p: Partial<ExtraTextItem>) => void
  onDelete: () => void
  onDuplicate: () => void
  customFonts: CustomFont[]
  systemFonts: string[]
} & LayerCardControls): JSX.Element {
  const pick = useEyedropper()
  return (
    <ItemCard
      title={item.name ?? `Text ${index + 1}`}
      icon={<Type />}
      enabled={item.enabled}
      onToggle={(on) => onChange({ enabled: on })}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onRename={(name) => onChange({ name })}
      sortableId={sortableId}
      isSelected={isSelected}
      onSelect={onSelect}
    >
      <textarea
        value={item.text}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={2}
        placeholder="Enter text…"
        spellCheck={false}
        className={cn(
          'w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-base text-foreground',
          'placeholder:text-muted-foreground/60 outline-none transition-colors duration-120 ease-out',
          'focus:border-primary focus:ring-2 focus:ring-primary-soft',
        )}
      />
      <Field label="Family">
        <FontPicker
          value={item.fontFamily}
          customFonts={customFonts}
          systemFonts={systemFonts}
          onChange={(family) => onChange({ fontFamily: family })}
        />
      </Field>
      <Field label="Weight" htmlFor={`extra-text-weight-${item.id}`}>
        <div className="flex gap-1.5">
          <select
            id={`extra-text-weight-${item.id}`}
            className={selectCls}
            value={item.fontWeight}
            onChange={(e) => onChange({ fontWeight: Number(e.target.value) as ExtraTextItem['fontWeight'] })}
          >
            <option value={400}>Regular</option>
            <option value={500}>Medium</option>
            <option value={600}>Semibold</option>
            <option value={700}>Bold</option>
          </select>
          <IconToggle
            pressed={item.italic}
            onPressedChange={(on) => onChange({ italic: on })}
            label="Italic"
          >
            <Italic />
          </IconToggle>
        </div>
      </Field>
      <ValueField label="Size" value={item.size} min={10} max={600} onChange={(v) => onChange({ size: v })} unit="px" />
      <Field label="Align">
        <Segmented
          value={item.align}
          onChange={(v) => onChange({ align: v as HAlign })}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' },
          ]}
        />
      </Field>
      <Field label="Color">
        <ColorPicker value={item.color} onChange={(c) => onChange({ color: c })} />
      </Field>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Offset X" value={item.x} min={-2000} max={2000} onChange={(v) => onChange({ x: v })} />
        <ValueField label="Offset Y" value={item.y} min={-2000} max={2000} onChange={(v) => onChange({ y: v })} />
      </div>
      <ValueField label="Opacity" value={item.opacity} min={0} max={100} onChange={(v) => onChange({ opacity: v })} unit="%" />
      <EffectsStack
        sortable={fxSortable(item.fx, (f) => onChange({ fx: f }))}
        decorSortable={decorSortableFor(item.decor, (v) => onChange({ decor: v }))}
        entries={[
          gradeEntry(item.grade, (g) => onChange({ grade: g })),
          ...fxEntries(item.fx, (f) => onChange({ fx: f }), { ...pick, selfId: item.id }),
          {
            key: 'shadow',
            label: 'Shadow',
            enabled: item.shadow.enabled,
            setEnabled: (on) => onChange({ shadow: { ...item.shadow, enabled: on } }),
            children: <ShadowFields value={item.shadow} onChange={(v) => onChange({ shadow: v })} />,
          },
          {
            key: 'glow',
            label: 'Glow',
            enabled: item.glow.enabled,
            setEnabled: (on) => onChange({ glow: { ...item.glow, enabled: on } }),
            children: <GlowFields value={item.glow} onChange={(v) => onChange({ glow: v })} />,
          },
          {
            key: 'stroke',
            label: 'Stroke',
            enabled: item.stroke.enabled,
            setEnabled: (on) => onChange({ stroke: { ...item.stroke, enabled: on } }),
            children: <StrokeFields value={item.stroke} onChange={(v) => onChange({ stroke: v })} />,
          },
        ]}
      />
    </ItemCard>
  )
}

/** A standalone decorative shape, added via "+ Add shape". Positioned as a
 *  pixel offset from canvas center (unlike the primary shape, which is
 *  anchored to the title text). */
function ExtraShapeCard({
  item,
  index,
  onChange,
  onDelete,
  onDuplicate,
  sortableId,
  isSelected,
  onSelect,
}: {
  item: ExtraShapeItem
  index: number
  onChange: (p: Partial<ExtraShapeItem>) => void
  onDelete: () => void
  onDuplicate: () => void
} & LayerCardControls): JSX.Element {
  const pick = useEyedropper()
  return (
    <ItemCard
      title={item.name ?? `Shape ${index + 1}`}
      icon={<Shapes />}
      enabled={item.enabled}
      onToggle={(on) => onChange({ enabled: on })}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onRename={(name) => onChange({ name })}
      sortableId={sortableId}
      isSelected={isSelected}
      onSelect={onSelect}
    >
      <Field label="Type">
        <select className={selectCls} value={item.type} onChange={(e) => onChange({ type: e.target.value as ShapeType })}>
          <option value="circle">Circle</option>
          <option value="square">Square</option>
          <option value="triangle">Triangle</option>
          <option value="star">Star</option>
          <option value="hexagon">Hexagon</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Width" value={item.width ?? item.size} min={10} max={2000} onChange={(v) => onChange({ width: v })} unit="px" />
        <ValueField label="Height" value={item.height ?? item.size} min={10} max={2000} onChange={(v) => onChange({ height: v })} unit="px" />
      </div>
      {item.type !== 'circle' ? (
        <ValueField
          label="Corner radius"
          value={item.cornerRadius}
          min={0}
          max={Math.max(10, Math.round(Math.min(item.width ?? item.size, item.height ?? item.size) / 2))}
          onChange={(v) => onChange({ cornerRadius: v })}
          unit="px"
        />
      ) : null}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Offset X" value={item.x} min={-2000} max={2000} onChange={(v) => onChange({ x: v })} />
        <ValueField label="Offset Y" value={item.y} min={-2000} max={2000} onChange={(v) => onChange({ y: v })} />
      </div>
      <ValueField label="Opacity" value={item.opacity} min={0} max={100} onChange={(v) => onChange({ opacity: v })} unit="%" />
      <Field label="Color">
        <ColorPicker value={item.color} onChange={(c) => onChange({ color: c })} />
      </Field>
      <EffectsStack
        sortable={fxSortable(item.fx, (f) => onChange({ fx: f }))}
        decorSortable={decorSortableFor(item.decor, (v) => onChange({ decor: v }), DECOR_DEFAULT_SHAPE)}
        entries={[
          gradeEntry(item.grade, (g) => onChange({ grade: g })),
          ...fxEntries(item.fx, (f) => onChange({ fx: f }), { ...pick, selfId: item.id }),
          {
            key: 'shadow',
            label: 'Shadow',
            enabled: item.shadow.enabled,
            setEnabled: (on) => onChange({ shadow: { ...item.shadow, enabled: on } }),
            children: <ShadowFields value={item.shadow} onChange={(v) => onChange({ shadow: v })} />,
          },
          {
            key: 'glow',
            label: 'Glow',
            enabled: item.glow.enabled,
            setEnabled: (on) => onChange({ glow: { ...item.glow, enabled: on } }),
            children: <GlowFields value={item.glow} onChange={(v) => onChange({ glow: v })} />,
          },
          {
            key: 'stroke',
            label: 'Stroke',
            enabled: item.stroke.enabled,
            setEnabled: (on) => onChange({ stroke: { ...item.stroke, enabled: on } }),
            children: <StrokeFields value={item.stroke} onChange={(v) => onChange({ stroke: v })} />,
          },
          {
            key: 'pattern',
            label: 'Pattern',
            enabled: item.pattern.enabled,
            setEnabled: (on) => onChange({ pattern: { ...item.pattern, enabled: on } }),
            children: <PatternFields value={item.pattern} onChange={(v) => onChange({ pattern: v })} />,
          },
        ]}
      />
    </ItemCard>
  )
}

/** A standalone icon/logo, added via "+ Add icon / logo". Independent of the
 *  primary icon, which is anchored relative to the title text. */
function ExtraIconCard({
  item,
  index,
  onChange,
  onDelete,
  onDuplicate,
  onReplace,
  sortableId,
  isSelected,
  onSelect,
}: {
  item: ExtraIconItem
  index: number
  onChange: (p: Partial<ExtraIconItem>) => void
  onDelete: () => void
  onDuplicate: () => void
  onReplace: () => void
} & LayerCardControls): JSX.Element {
  const pick = useEyedropper()
  return (
    <ItemCard
      title={item.name ?? `Icon ${index + 1}`}
      icon={<Sticker />}
      enabled={item.enabled}
      onToggle={(on) => onChange({ enabled: on })}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onRename={(name) => onChange({ name })}
      sortableId={sortableId}
      isSelected={isSelected}
      onSelect={onSelect}
    >
      <Button variant="secondary" size="sm" className="w-full" onClick={onReplace}>
        <Upload /> Replace image
      </Button>
      <ValueField label="Size" value={item.size} min={10} max={2000} onChange={(v) => onChange({ size: v })} unit="px" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <ValueField label="Offset X" value={item.x} min={-2000} max={2000} onChange={(v) => onChange({ x: v })} />
        <ValueField label="Offset Y" value={item.y} min={-2000} max={2000} onChange={(v) => onChange({ y: v })} />
      </div>
      <ValueField label="Opacity" value={item.opacity} min={0} max={100} onChange={(v) => onChange({ opacity: v })} unit="%" />
      <SubSwitch label="Tint color" checked={item.tint !== null} onChange={(on) => onChange({ tint: on ? '#FFFFFF' : null })} />
      {item.tint !== null ? (
        <Field label="Tint">
          <ColorPicker value={item.tint} onChange={(c) => onChange({ tint: c })} />
        </Field>
      ) : null}
      <EffectsStack
        sortable={fxSortable(item.fx, (f) => onChange({ fx: f }))}
        decorSortable={decorSortableFor(item.decor, (v) => onChange({ decor: v }))}
        entries={[
          gradeEntry(item.grade, (g) => onChange({ grade: g })),
          ...fxEntries(item.fx, (f) => onChange({ fx: f }), { ...pick, selfId: item.id }),
          {
            key: 'shadow',
            label: 'Shadow',
            enabled: item.shadow.enabled,
            setEnabled: (on) => onChange({ shadow: { ...item.shadow, enabled: on } }),
            children: <ShadowFields value={item.shadow} onChange={(v) => onChange({ shadow: v })} />,
          },
          {
            key: 'glow',
            label: 'Glow',
            enabled: item.glow.enabled,
            setEnabled: (on) => onChange({ glow: { ...item.glow, enabled: on } }),
            children: <GlowFields value={item.glow} onChange={(v) => onChange({ glow: v })} />,
          },
          {
            key: 'stroke',
            label: 'Stroke',
            enabled: item.stroke.enabled,
            setEnabled: (on) => onChange({ stroke: { ...item.stroke, enabled: on } }),
            children: <StrokeFields value={item.stroke} onChange={(v) => onChange({ stroke: v })} />,
          },
        ]}
      />
    </ItemCard>
  )
}

/** A standalone picture, created by duplicating the primary picture. Full
 *  parity with the primary Picture card: replace, background removal, size,
 *  position, opacity, and effects — each on its own local bg-removal state. */
function ExtraImageCard({
  item,
  index,
  onChange,
  onDelete,
  onDuplicate,
  sortableId,
  isSelected,
  onSelect,
}: {
  item: ExtraImageItem
  index: number
  onChange: (p: Partial<ExtraImageItem>) => void
  onDelete: () => void
  onDuplicate: () => void
} & LayerCardControls): JSX.Element {
  const pick = useEyedropper()
  const [removingBg, setRemovingBg] = useState(false)
  const [progress, setProgress] = useState<{ ratio: number; note?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const replace = async (): Promise<void> => {
    const file = await pickFile('image/*')
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    setError(null)
    const size = await loadImageNaturalSize(dataUrl)
    onChange({
      dataUrl,
      originalDataUrl: dataUrl,
      bgRemoved: false,
      ...(size ? { width: Math.min(size.width, 1200) } : {}),
    })
  }

  const removeBg = async (): Promise<void> => {
    const source = item.originalDataUrl ?? item.dataUrl
    if (!source || removingBg) return
    setRemovingBg(true)
    setError(null)
    setProgress({ ratio: 0 })
    try {
      onChange({
        dataUrl: await removeBackgroundLocally(source, item.bgRemovalEdgeSoftness, setProgress),
        bgRemoved: true,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRemovingBg(false)
      setProgress(null)
    }
  }

  const restoreOriginal = (): void => {
    onChange({ dataUrl: item.originalDataUrl ?? item.dataUrl, bgRemoved: false })
  }

  return (
    <ItemCard
      title={item.name ?? `Picture ${index + 1}`}
      icon={<ImagePlus />}
      enabled={item.enabled}
      onToggle={(on) => onChange({ enabled: on })}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onRename={(name) => onChange({ name })}
      sortableId={sortableId}
      isSelected={isSelected}
      onSelect={onSelect}
    >
      <div className="flex gap-1.5">
        <Button variant="secondary" size="sm" className="flex-1" onClick={replace}>
          <Upload /> {item.dataUrl ? 'Replace' : 'Upload picture'}
        </Button>
      </div>
      {item.dataUrl ? (
        <>
          <ValueField
            label="Edge softness"
            value={item.bgRemovalEdgeSoftness}
            min={0}
            max={100}
            onChange={(v) => onChange({ bgRemovalEdgeSoftness: v })}
            unit="%"
          />
          <div className="flex gap-1.5">
            <Button variant="secondary" size="sm" className="flex-1" onClick={removeBg} disabled={removingBg}>
              {removingBg ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {removingBg ? progress?.note ?? 'Removing background…' : item.bgRemoved ? 'Re-run removal' : 'Remove background'}
            </Button>
            {item.bgRemoved ? (
              <Button variant="ghost" size="icon-sm" onClick={restoreOriginal} aria-label="Restore original" title="Restore original">
                <RotateCcw />
              </Button>
            ) : null}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <ValueField label="Size" value={item.width} min={20} max={4000} onChange={(v) => onChange({ width: v })} unit="px" />
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <ValueField label="Offset X" value={item.x} min={-2000} max={2000} onChange={(v) => onChange({ x: v })} />
            <ValueField label="Offset Y" value={item.y} min={-2000} max={2000} onChange={(v) => onChange({ y: v })} />
          </div>
          <ValueField label="Opacity" value={item.opacity} min={0} max={100} onChange={(v) => onChange({ opacity: v })} unit="%" />
          <EffectsStack
            sortable={fxSortable(item.fx, (f) => onChange({ fx: f }))}
            decorSortable={decorSortableFor(item.decor, (v) => onChange({ decor: v }))}
            entries={[
              gradeEntry(item.grade, (g) => onChange({ grade: g })),
              ...fxEntries(item.fx, (f) => onChange({ fx: f }), { ...pick, selfId: item.id }),
              {
                key: 'shadow',
                label: 'Shadow',
                enabled: item.shadow.enabled,
                setEnabled: (on) => onChange({ shadow: { ...item.shadow, enabled: on } }),
                children: <ShadowFields value={item.shadow} onChange={(v) => onChange({ shadow: v })} />,
              },
              {
                key: 'glow',
                label: 'Glow',
                enabled: item.glow.enabled,
                setEnabled: (on) => onChange({ glow: { ...item.glow, enabled: on } }),
                children: <GlowFields value={item.glow} onChange={(v) => onChange({ glow: v })} />,
              },
              {
                key: 'stroke',
                label: 'Stroke',
                enabled: item.stroke.enabled,
                setEnabled: (on) => onChange({ stroke: { ...item.stroke, enabled: on } }),
                children: <StrokeFields value={item.stroke} onChange={(v) => onChange({ stroke: v })} />,
              },
            ]}
          />
        </>
      ) : null}
    </ItemCard>
  )
}

/**
 * Searchable font picker — a select-look trigger that opens a popover with a
 * filter field and a scrollable list; every row previews its own typeface.
 */
function FontPicker({
  value,
  customFonts,
  systemFonts,
  onChange,
}: {
  value: string
  customFonts: CustomFont[]
  systemFonts: string[]
  onChange: (family: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matchedCustom = customFonts.filter((f) => f.name.toLowerCase().includes(q))
  const matchedSystem = systemFonts.filter((f) => f.toLowerCase().includes(q))

  const pick = (family: string): void => {
    onChange(family)
    setOpen(false)
  }

  const optionCls = (active: boolean): string =>
    cn(
      'flex h-7 w-full items-center justify-between rounded-sm px-2 text-left text-base',
      'outline-none transition-colors duration-120 ease-out',
      active ? 'bg-primary-soft text-primary' : 'text-foreground hover:bg-secondary',
    )

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery('')
      }}
    >
      <Popover.Trigger asChild>
        <button type="button" className={cn(selectCls, 'flex items-center justify-between gap-2 text-left')} style={{ fontFamily: `"${value}"` }}>
          <span className="truncate">{value}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          className={cn(
            'z-50 w-[268px] rounded-lg border border-border bg-popover p-2 shadow-popover outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fonts…"
              spellCheck={false}
              className={cn(
                'h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-base text-foreground',
                'placeholder:text-muted-foreground/60 outline-none',
                'focus:border-primary focus:ring-2 focus:ring-primary-soft',
              )}
            />
          </div>
          <div className="mt-2 max-h-64 space-y-0.5 overflow-y-auto">
            {matchedCustom.length > 0 ? (
              <>
                <p className="px-2 pb-0.5 pt-1 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Custom
                </p>
                {matchedCustom.map((f) => (
                  <button key={f.name} type="button" onClick={() => pick(f.name)} className={optionCls(f.name === value)} style={{ fontFamily: `"${f.name}"` }}>
                    <span className="truncate">{f.name}</span>
                    {f.name === value ? <Check className="size-3.5 shrink-0" /> : null}
                  </button>
                ))}
              </>
            ) : null}
            {matchedSystem.length > 0 ? (
              <>
                <p className="px-2 pb-0.5 pt-1 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
                  System
                </p>
                {matchedSystem.map((f) => (
                  <button key={f} type="button" onClick={() => pick(f)} className={optionCls(f === value)} style={{ fontFamily: `"${f}"` }}>
                    <span className="truncate">{f}</span>
                    {f === value ? <Check className="size-3.5 shrink-0" /> : null}
                  </button>
                ))}
              </>
            ) : null}
            {matchedCustom.length === 0 && matchedSystem.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">No fonts match “{query}”.</p>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function SubSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }): JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[18px] w-8 shrink-0 rounded-full transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        checked ? 'bg-primary' : 'border border-border bg-secondary',
      )}
    >
      <span
        className={cn(
          'absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-[left] duration-150 ease-out',
          checked ? 'left-[15px]' : 'left-[2px]',
        )}
      />
    </button>
  )
}

/** A single-boolean toggle rendered as one pressable icon button — used where a
 *  two-option segmented control would be more chrome than the choice deserves. */
function IconToggle({
  pressed,
  onPressedChange,
  label,
  children,
}: {
  pressed: boolean
  onPressedChange: (on: boolean) => void
  label: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-md border',
        'transition-colors duration-120 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        '[&_svg]:size-3.5',
        pressed
          ? 'border-border bg-primary-soft text-primary'
          : 'border-border bg-background text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/**
 * One property row: label on the left, the value on the right as a scrubbable
 * number — the After Effects layout.
 *
 * This replaced a label + number + slider track stacked over two lines. The
 * track cost a whole extra row per property and gave *less* precision than
 * dragging the number: an offset ranging -2000…2000 across a ~180px track moved
 * ~22 canvas px per pixel of travel, so it could not be nudged at all. Scrubbing
 * is a fixed 1 unit per pixel regardless of range, with modifiers for coarse and
 * fine, which is why AE and every NLE settled on it.
 */
function ValueField({
  label,
  value,
  min,
  max,
  onChange,
  unit,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  unit?: string
}): JSX.Element {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="min-w-0 truncate text-sm text-muted-foreground">{label}</span>
      <ScrubNumber label={label} value={value} min={min} max={max} onChange={onChange} unit={unit} />
    </div>
  )
}

/**
 * A number you drag to change and click to type.
 *
 * At rest it shows the value WITH its unit ("24px"); clicking swaps to just the
 * number, pre-selected for overtyping. Drag and click are told apart by a 3px
 * threshold, so a click never scrubs by accident and a scrub never opens the
 * editor.
 */
function ScrubNumber({
  label,
  value,
  min,
  max,
  onChange,
  unit,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  unit?: string
}): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  const drag = useRef<{ x: number; from: number; moved: boolean } | null>(null)
  const clamp = (n: number): number => Math.max(min, Math.min(max, Math.round(n)))

  const commit = (): void => {
    if (draft === null) return
    const trimmed = draft.trim()
    setDraft(null)
    if (trimmed === '') return // blank is not 0 — keep the previous value
    const n = Number(trimmed)
    if (Number.isFinite(n)) onChange(clamp(n))
  }

  if (draft !== null) {
    return (
      <input
        type="text"
        inputMode="numeric"
        autoFocus
        aria-label={label}
        value={draft}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(null)
          // Don't let arrows reach the layer-reorder handler while editing.
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.stopPropagation()
        }}
        className="w-14 shrink-0 rounded-sm bg-secondary px-1 py-0.5 text-right font-mono text-sm text-foreground outline-none ring-1 ring-ring"
      />
    )
  }

  return (
    <span
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      title="Drag to change · click to type · shift ×10 · alt ×0.1"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture?.(e.pointerId)
        drag.current = { x: e.clientX, from: value, moved: false }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const dx = e.clientX - d.x
        if (!d.moved && Math.abs(dx) < 3) return
        d.moved = true
        const gain = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
        onChange(clamp(d.from + dx * gain))
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        e.currentTarget.releasePointerCapture?.(e.pointerId)
        // A press that never moved is a click — open the editor.
        if (d && !d.moved) setDraft(String(value))
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
          e.preventDefault()
          e.stopPropagation()
          onChange(clamp(value + step))
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
          e.preventDefault()
          e.stopPropagation()
          onChange(clamp(value - step))
        } else if (e.key === 'Enter') {
          e.preventDefault()
          setDraft(String(value))
        }
      }}
      className={cn(
        'w-14 shrink-0 cursor-ew-resize select-none rounded-sm px-1 py-0.5 text-right font-mono text-sm',
        'text-primary transition-colors duration-120 ease-out',
        'hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      )}
    >
      {value}
      {unit ?? ''}
    </span>
  )
}

function NumberInput({
  id,
  value,
  min,
  max,
  onCommit,
  compact,
  'aria-label': ariaLabel,
}: {
  id?: string
  value: number
  min: number
  max: number
  onCommit: (v: number) => void
  /** 28px height for toolbar placement (default is the 32px form height). */
  compact?: boolean
  'aria-label'?: string
}): JSX.Element {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = (): void => {
    const trimmed = draft.trim()
    // Blank is not 0 — revert to the previous value (Number('') === 0 would
    // otherwise clamp up to min).
    if (trimmed === '') {
      setDraft(String(value))
      return
    }
    const n = Math.round(Number(trimmed))
    if (Number.isFinite(n)) onCommit(Math.max(min, Math.min(max, n)))
    else setDraft(String(value))
  }
  return (
    <Input
      id={id}
      inputMode="numeric"
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
      className={cn('font-mono', compact && 'h-7 text-sm')}
    />
  )
}

function GradientDirControl({ value, onChange }: { value: GradientDir; onChange: (v: GradientDir) => void }): JSX.Element {
  return (
    <Segmented
      value={value}
      onChange={(v) => onChange(v as GradientDir)}
      options={[
        { value: 'vertical', label: 'Vert' },
        { value: 'horizontal', label: 'Horiz' },
        { value: 'diagonal', label: 'Diag' },
        { value: 'radial', label: 'Radial' },
      ]}
    />
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  iconOnly,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>
  iconOnly?: boolean
}): JSX.Element {
  return (
    <div className="inline-flex h-8 w-full items-center gap-0.5 rounded-lg border border-border/60 bg-secondary p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            aria-label={o.label}
            title={iconOnly ? o.label : undefined}
            className={cn(
              'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium',
              iconOnly ? 'px-1.5' : 'px-2',
              'transition-colors duration-120 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              '[&_svg]:size-3.5',
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.icon}
            {iconOnly ? null : o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── File helpers ────────────────────────────────────────────────────────── */

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('file-read-failed'))
    reader.readAsDataURL(file)
  })
}

function downloadFallback(href: string, name: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
}

function loadImageNaturalSize(dataUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}
