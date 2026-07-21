import {
  CANVAS_PRESETS,
  DEFAULT_FONTS,
  defaultColorGrade,
  defaultStudioDoc,
  exportAllFiles,
  getCachedImage,
  mergeDoc,
  preloadImage,
  renderDocToPngBase64,
  FX_PIPELINE_KEYS,
  type StudioDoc,
} from './studio'
import { STUDIO_TEMPLATES, templateById } from './studio-templates'
import { DESIGN_GUIDANCE, EFFECT_DOCS, FONT_GUIDE, LAYER_DOCS } from './studio-docs'
import { measureDoc, resolveAnchor, type Anchor, type DocMeasurement } from './studio-measure'
import { useAppStore } from '../store'

/**
 * The surface the MCP server drives.
 *
 * Rendering needs a DOM canvas, so it happens here in the renderer rather than
 * in the main process; main reaches it through `webContents.executeJavaScript`.
 * That avoids swapping the canvas implementation for a headless one, which
 * would mean abstracting every `document.createElement('canvas')` in the
 * renderer library.
 *
 * Everything is expressed as a *partial* StudioDoc merged over the defaults —
 * an agent describes only what it cares about, and `mergeDoc` fills the rest.
 */
export interface McpRenderResult {
  pngBase64: string
  width: number
  height: number
}

function resolveDoc(patch: unknown, templateId?: string): StudioDoc {
  const base = templateId
    ? mergeDoc(defaultStudioDoc(), templateById(templateId)?.doc ?? {})
    : defaultStudioDoc()
  return mergeDoc(base, patch)
}

/**
 * Wait for every image the document references.
 *
 * The renderer draws pictures from a cache that the UI fills as a side effect
 * of rendering; nothing populates it on this path, so without this an
 * agent-supplied photo or logo silently renders as nothing at all.
 */
async function ensureImages(doc: StudioDoc): Promise<void> {
  const urls = [
    doc.canvas.imageDataUrl,
    doc.icon?.dataUrl,
    doc.image?.dataUrl,
    doc.logo?.kind === 'image' ? doc.logo.dataUrl : null,
    ...(doc.extraIcons ?? []).map((i) => i.dataUrl),
    ...(doc.extraImages ?? []).map((i) => i.dataUrl),
    ...(doc.extraLogos ?? []).map((l) => (l.kind === 'image' ? l.dataUrl : null)),
  ].filter((u): u is string => typeof u === 'string' && u.length > 0)

  await Promise.all(
    [...new Set(urls)].map(
      (url) =>
        new Promise<void>((resolve) => {
          if (getCachedImage(url)) return resolve()
          // Resolve either way — a broken URL should not hang the render.
          const done = (): void => resolve()
          preloadImage(url, done)
          setTimeout(done, 10_000)
        }),
    ),
  )
}

/** Wait for the fonts a document asks for, so text isn't rendered in a
 *  fallback face on the very first paint. */
async function ensureFonts(doc: StudioDoc): Promise<void> {
  const specs = new Set<string>()
  specs.add(`${doc.font.italic ? 'italic ' : ''}${doc.font.weight} ${doc.font.size}px "${doc.font.family}"`)
  for (const t of doc.extraTexts ?? []) {
    specs.add(`${t.italic ? 'italic ' : ''}${t.fontWeight} ${t.size}px "${t.fontFamily}"`)
  }
  if (doc.logo?.kind === 'text') {
    specs.add(`${doc.logo.italic ? 'italic ' : ''}${doc.logo.fontWeight} ${doc.logo.size}px "${doc.logo.fontFamily}"`)
  }
  await Promise.all(
    [...specs].map((s) =>
      document.fonts.check(s) ? Promise.resolve() : document.fonts.load(s).catch(() => undefined),
    ),
  )
}

export const studioMcp = {
  /** The vocabulary an agent needs before composing anything. */
  capabilities(): unknown {
    const d = defaultStudioDoc()
    return {
      canvasPresets: CANVAS_PRESETS,
      fonts: DEFAULT_FONTS,
      fontGuide: FONT_GUIDE,
      templates: STUDIO_TEMPLATES.map((t) => ({
        id: t.id,
        label: t.label,
        whenToUse: t.whenToUse,
      })),
      textModes: ['single', 'bullet', 'batch', 'split'],
      layers: {
        primaries: ['logo', 'border', 'image', 'shape', 'text', 'icon'],
        note:
          'Each primary is a field on the document. Extra copies live in extraTexts / ' +
          'extraShapes / extraIcons / extraImages / extraBorders / extraLogos, each an object ' +
          'with an `id`. `doc.layerOrder` sets the stack; order[0] is the top-most layer.',
        catalog: LAYER_DOCS,
      },
      effects: {
        pipelineOrder: FX_PIPELINE_KEYS,
        note:
          "Per-layer effects live on the layer's `fx` object; the colour grade lives on its " +
          "`grade` object. Effects run in `fx.order` (defaults to pipelineOrder); noise always " +
          'runs last. Every effect object needs `enabled: true`.',
        catalog: EFFECT_DOCS,
      },
      gradeFields: Object.keys(defaultColorGrade()),
      canvasEffects: {
        note:
          'doc.canvasFx and doc.canvasGrade apply to the FINISHED composite, not one layer. ' +
          'Use these for the finishing pass — a vignette or grade on doc.fx darkens the title ' +
          'text itself, which is almost never what you want.',
      },
      masking: {
        note:
          "Any layer's fx.mask clips it to another layer's silhouette: " +
          "{ enabled: true, sourceId: 'shape' } draws the layer only where that shape is. " +
          'Set invert:true to punch it out instead. This is how you put a photo inside a ' +
          'circle, or show imagery through knocked-out text.',
      },
      gradients: {
        note:
          "gradientDirection accepts 'vertical' | 'horizontal' | 'diagonal' | 'radial'. " +
          'Radial on the canvas background gives a real centre glow — do not fake one with a ' +
          'blurred circle. Shapes take material:"gradient" with gradientColor2 too.',
      },
      placement: {
        note:
          'Do not guess coordinates. Call measure to get every layer\'s real box, then place ' +
          'things relative to those numbers — or pass an anchor to measure and let it compute ' +
          'the x/y for you.',
        shadows:
          'Boxes are measured from pixels, so a soft shadow or glow counts as part of the ' +
          'layer — a 46px drop shadow can add ~130px below the glyphs. When you want something ' +
          'to sit under the LETTERS, measure a copy of the doc with that shadow/glow disabled, ' +
          'then render with it back on.',
      },
      designGuidance: DESIGN_GUIDANCE,
      documentShape: {
        note:
          'Send a PARTIAL document; it is merged one level deep over the defaults (or over a template when templateId is given).',
        example: {
          text: 'MY HOOK',
          font: { family: 'SF Pro Display', weight: 700, size: 180, color: '#FFFFFF', italic: false },
          canvas: { width: 1920, height: 1080 },
        },
        defaults: { canvas: { width: d.canvas.width, height: d.canvas.height }, mode: d.mode },
      },
    }
  },

  /**
   * One document → one PNG. When `openInApp` is set the document is also opened
   * as a canvas in the running app, so the agent's render is a starting point
   * the user can finish by hand rather than a dead-end file.
   */
  async render(patch: unknown, templateId?: string, openInApp = true, name?: string): Promise<McpRenderResult> {
    const doc = resolveDoc(patch, templateId)
    await Promise.all([ensureFonts(doc), ensureImages(doc)])
    const png = renderDocToPngBase64(doc)
    if (openInApp) useAppStore.getState().openDocInStudio(name ?? 'From Claude', doc)
    return { pngBase64: png, width: doc.canvas.width, height: doc.canvas.height }
  },

  /**
   * One base document + a list of patches → one PNG per patch. Batch mode's
   * `exportAllFiles` covers many-titles-from-one-style; this covers the more
   * general "same design, different overrides" case an agent wants.
   */
  async renderVariants(
    patch: unknown,
    overrides: unknown[],
    templateId?: string,
    openInApp = false,
  ): Promise<McpRenderResult[]> {
    const base = resolveDoc(patch, templateId)
    const out: McpRenderResult[] = []
    for (const [i, o] of overrides.entries()) {
      const doc = mergeDoc(base, o)
      await Promise.all([ensureFonts(doc), ensureImages(doc)])
      out.push({
        pngBase64: renderDocToPngBase64(doc),
        width: doc.canvas.width,
        height: doc.canvas.height,
      })
      if (openInApp) useAppStore.getState().openDocInStudio(`Variant ${i + 1}`, doc)
    }
    return out
  },

  /**
   * Where every layer actually lands, plus optional anchor resolution.
   *
   * This is the tool that removes the render-look-nudge loop: measure once and
   * place from real numbers instead of guessing and re-rendering.
   */
  async measure(
    patch: unknown,
    templateId?: string,
    anchors?: Array<{ id: string; anchor: Anchor; width: number; height: number }>,
  ): Promise<DocMeasurement & { resolved?: Array<{ id: string; x: number; y: number }> }> {
    const doc = resolveDoc(patch, templateId)
    await Promise.all([ensureFonts(doc), ensureImages(doc)])
    const m = measureDoc(doc)
    if (!anchors?.length) return m
    return {
      ...m,
      resolved: anchors.map((a) => ({
        id: a.id,
        ...resolveAnchor(m, a.anchor, { width: a.width, height: a.height }),
      })),
    }
  },

  /** The document the app currently has open, so it can be edited in place. */
  currentCanvas(): { name: string; doc: unknown } | null {
    return useAppStore.getState().liveDoc
  },

  /** Batch/bullet "export all" — N titles from one styled document. */
  async renderBatch(patch: unknown, templateId?: string): Promise<Array<{ name: string; pngBase64: string }>> {
    const doc = resolveDoc(patch, templateId)
    await Promise.all([ensureFonts(doc), ensureImages(doc)])
    return exportAllFiles(doc).map((f) => ({ name: f.name, pngBase64: f.dataBase64 }))
  },
}

declare global {
  interface Window {
    __studioMcp: typeof studioMcp
  }
}

export function installMcpBridge(): void {
  window.__studioMcp = studioMcp
}
