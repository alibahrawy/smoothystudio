import { utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * Main-side driver for the background-removal worker.
 *
 * The worker is spawned on first use and kept alive — the model load is the
 * slow part, so a second cutout in the same session is much faster if the
 * process persists. It is respawned automatically if it dies.
 */
export interface BgProgress {
  ratio: number
  note?: string
}

interface Pending {
  resolve: (dataUrl: string) => void
  reject: (err: Error) => void
  onProgress?: (p: BgProgress) => void
}

let child: UtilityProcess | null = null
const pending = new Map<string, Pending>()

function spawn(): UtilityProcess {
  const worker = utilityProcess.fork(join(__dirname, 'workers/bg-host.js'), [], {
    serviceName: 'smoothystudio-bg',
    // The matting library and sharp are CommonJS native modules; give the
    // worker a normal Node environment rather than a sandboxed one.
    stdio: 'inherit',
  })

  worker.on('message', (msg: { id: string; type: string; [k: string]: unknown }) => {
    const p = pending.get(msg.id)
    if (!p) return
    if (msg.type === 'progress') {
      p.onProgress?.({ ratio: Number(msg.ratio) || 0, note: msg.note as string | undefined })
      return
    }
    pending.delete(msg.id)
    if (msg.type === 'done') p.resolve(String(msg.imageDataUrl))
    else p.reject(new Error(String(msg.message ?? 'remove-background failed')))
  })

  worker.on('exit', () => {
    // Fail anything still in flight rather than leaving the UI spinning.
    for (const [, p] of pending) p.reject(new Error('background-removal worker exited'))
    pending.clear()
    child = null
  })

  return worker
}

export function removeBackgroundLocal(
  args: { imageDataUrl: string; edgeSoftness?: number },
  onProgress?: (p: BgProgress) => void,
): Promise<string> {
  if (!child) child = spawn()
  const id = randomUUID()
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress })
    child!.postMessage({ id, ...args })
  })
}

export function stopBgWorker(): void {
  child?.kill()
  child = null
}
