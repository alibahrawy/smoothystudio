/**
 * Background removal, on device.
 *
 * Runs in a utilityProcess rather than the main process because matting a
 * full-resolution photo is seconds of ONNX inference — on main it would stall
 * IPC and freeze the window.
 *
 * This deliberately does NOT call a server. The hosted endpoint caps request
 * bodies at a few megabytes, and a 1920×1080 PNG data URL is past that before
 * it starts, which is what produced `413 FUNCTION_PAYLOAD_TOO_LARGE`. Doing it
 * locally also means no per-image cost, no upload of the user's photos, and
 * the higher-accuracy model.
 */
import type { MessagePortMain } from 'electron'

interface RemoveBgRequest {
  id: string
  imageDataUrl: string
  edgeSoftness?: number
}

type RemoveBgFn = (
  image: Blob,
  config?: {
    model?: 'small' | 'medium' | 'large'
    output?: { format?: 'image/png' | 'image/webp'; quality?: number }
    progress?: (key: string, current: number, total: number) => void
  },
) => Promise<Blob>

/** The package pulls in onnxruntime + sharp and ~100 MB of bundled weights, so
 *  it is imported on first use rather than at host startup. */
let removeBgFn: RemoveBgFn | null = null
async function loadRemoveBg(): Promise<RemoveBgFn> {
  if (removeBgFn) return removeBgFn
  const mod = (await import('@imgly/background-removal-node')) as unknown as { default: RemoveBgFn }
  removeBgFn = mod.default
  return removeBgFn
}

/** The library resolves the codec from the Blob's MIME type — a bare Buffer
 *  arrives with an empty type and throws "Unsupported format". */
function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl)
  if (!m) throw new Error('remove-background: expected a base64 data URL')
  return new Blob([Buffer.from(m[2], 'base64')], { type: m[1] })
}

/**
 * Soften the matte edge. The model has no strength knob, so this is a
 * post-process blur of the alpha channel.
 *
 * Blurring alpha alone would drag the arbitrary colour sitting in the
 * fully-transparent background pixels into the new semi-transparent edge,
 * showing up as a halo once composited. Premultiplying by alpha before the
 * blur and dividing back out afterwards weights the average by opacity, so
 * transparent pixels contribute nothing and the falloff carries the subject's
 * own edge colour.
 */
async function applyEdgeSoftness(png: Buffer, softness: number): Promise<Buffer> {
  if (softness <= 0) return png
  const sharpMod = (await import('sharp')).default
  const sigma = Math.max(0.3, (Math.min(100, softness) / 100) * 10)
  const { data, info } = await sharpMod(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const n = width * height

  const premultiplied = Buffer.alloc(n * 4)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const a = data[o + 3] / 255
    premultiplied[o] = data[o] * a
    premultiplied[o + 1] = data[o + 1] * a
    premultiplied[o + 2] = data[o + 2] * a
    premultiplied[o + 3] = data[o + 3]
  }

  const blurred = await sharpMod(premultiplied, { raw: { width, height, channels: 4 } })
    .blur(sigma)
    .raw()
    .toBuffer()

  const out = Buffer.alloc(n * 4)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const a = blurred[o + 3]
    if (a === 0) continue // leave fully-transparent pixels zeroed in RGB too
    const af = a / 255
    out[o] = Math.min(255, Math.round(blurred[o] / af))
    out[o + 1] = Math.min(255, Math.round(blurred[o + 1] / af))
    out[o + 2] = Math.min(255, Math.round(blurred[o + 2] / af))
    out[o + 3] = a
  }

  return await sharpMod(out, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

const parent = (process as unknown as { parentPort: MessagePortMain }).parentPort

function post(msg: unknown): void {
  parent.postMessage(msg)
}

parent.on('message', (e: { data: RemoveBgRequest }) => {
  const req = e.data
  void (async () => {
    const startedAt = Date.now()
    try {
      post({ id: req.id, type: 'progress', ratio: 0.02, note: 'loading model…' })
      const removeBackground = await loadRemoveBg()

      const blob = await removeBackground(dataUrlToBlob(req.imageDataUrl), {
        // 'medium' is the most accurate model bundled offline with the package;
        // 'large' would require a CDN download at runtime.
        model: 'medium',
        output: { format: 'image/png' },
        progress: (key, current, total) => {
          const ratio = total > 0 ? Math.min(0.98, Math.max(0.05, current / total)) : 0.5
          post({ id: req.id, type: 'progress', ratio, note: key })
        },
      })

      let outBuffer: Buffer = Buffer.from(await blob.arrayBuffer())
      if (req.edgeSoftness && req.edgeSoftness > 0) {
        post({ id: req.id, type: 'progress', ratio: 0.99, note: 'softening edge…' })
        outBuffer = await applyEdgeSoftness(outBuffer, req.edgeSoftness)
      }

      post({
        id: req.id,
        type: 'done',
        imageDataUrl: `data:image/png;base64,${outBuffer.toString('base64')}`,
        elapsedMs: Date.now() - startedAt,
      })
    } catch (err) {
      post({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  })()
})
