/**
 * Custom `smoothy-media://` protocol — lets the renderer's <video> element
 * play a user-selected local file behind the caption preview canvas.
 *
 * The renderer's CSP (`media-src 'self' blob: app:`) blocks `file://`, and
 * pointing a <video> at an arbitrary file path would be both blocked and
 * unsafe. Instead we stream the file through a privileged scheme with proper
 * HTTP range support (so seeking/scrubbing works) and an allowlist so only
 * paths the user explicitly opened in the Captions tool are readable.
 *
 * Scheme registration MUST happen before `app.whenReady()` — call
 * `registerMediaProtocolScheme()` at module load. The request handler is wired
 * inside `whenReady` via `registerMediaProtocolHandler()`.
 */
import { protocol } from 'electron'
import fs from 'node:fs'
import { Readable } from 'node:stream'

const SCHEME = 'smoothy-media'

// Only files the renderer explicitly registers are streamable. Prevents the
// scheme from becoming an arbitrary-file-read primitive.
const allowed = new Set<string>()

/** Register `absPath` as streamable and return the URL to feed a <video src>. */
export function allowMediaPath(absPath: string): string {
  allowed.add(absPath)
  return `${SCHEME}://media/${encodeURIComponent(absPath)}`
}

export function registerMediaProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true },
    },
  ])
}

export function registerMediaProtocolHandler(): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const filePath = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (!allowed.has(filePath) || !fs.existsSync(filePath)) {
        return new Response('Not found', { status: 404 })
      }
      const total = fs.statSync(filePath).size
      const contentType = mimeFor(filePath)
      const range = request.headers.get('Range')

      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        let start = m && m[1] ? parseInt(m[1], 10) : 0
        let end = m && m[2] ? parseInt(m[2], 10) : total - 1
        if (!isFinite(start) || start < 0) start = 0
        if (!isFinite(end) || end >= total) end = total - 1
        if (start > end) start = 0
        const stream = fs.createReadStream(filePath, { start, end })
        return new Response(Readable.toWeb(stream) as ReadableStream, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
          },
        })
      }

      const stream = fs.createReadStream(filePath)
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(total),
        },
      })
    } catch (err) {
      return new Response(String(err), { status: 500 })
    }
  })
}

function mimeFor(p: string): string {
  const ext = p.toLowerCase().split('.').pop() ?? ''
  switch (ext) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4'
    case 'mov':
      return 'video/quicktime'
    case 'webm':
      return 'video/webm'
    case 'mkv':
      return 'video/x-matroska'
    case 'avi':
      return 'video/x-msvideo'
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'm4a':
    case 'aac':
      return 'audio/aac'
    case 'ogg':
      return 'audio/ogg'
    case 'flac':
      return 'audio/flac'
    default:
      return 'application/octet-stream'
  }
}
