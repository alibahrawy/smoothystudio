import * as http from 'node:http'
import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

/**
 * MCP server, hosted inside the running app.
 *
 * Rendering needs a DOM canvas, so every tool call is forwarded into the
 * renderer through `executeJavaScript` and answered by `window.__studioMcp`.
 * Hosting it here rather than shipping a separate headless binary means the
 * agent renders with exactly the same code path the UI uses — no second
 * renderer to keep in sync, and no swapping canvas implementations.
 *
 * Transport is streamable HTTP on a loopback port so an agent can attach to the
 * app while the user has it open. It binds to 127.0.0.1 only.
 */
export const MCP_PORT = 3777

let httpServer: http.Server | null = null

/** Run an expression against `window.__studioMcp` in the renderer. */
async function callRenderer<T>(win: BrowserWindow, expression: string): Promise<T> {
  if (win.isDestroyed()) throw new Error('window-destroyed')
  return (await win.webContents.executeJavaScript(expression, true)) as T
}

interface RenderResult {
  pngBase64: string
  width: number
  height: number
}

/** MCP image content — returning the pixels inline is what lets a vision model
 *  critique its own thumbnail and iterate, rather than emitting and hoping. */
function imageContent(r: RenderResult): { type: 'image'; data: string; mimeType: string } {
  return { type: 'image', data: r.pngBase64, mimeType: 'image/png' }
}

function buildServer(win: BrowserWindow): McpServer {
  const server = new McpServer(
    { name: 'smoothystudio', version: '0.1.0' },
    {
      instructions:
        'Design thumbnails and title cards. Call get_capabilities first to learn the ' +
        'document vocabulary, the available templates, and the effect names. Then send a ' +
        'PARTIAL document to render_thumbnail — it is merged over the defaults, or over a ' +
        'template when you pass templateId. Prefer starting from a template: it fixes the ' +
        'composition so you only supply the words. Rendered PNGs come back inline, so look ' +
        'at the result and iterate if the layout reads badly. Call measure rather than guessing ' +
        'coordinates, and get_canvas to edit what the user already has open. Renders open as canvases in the ' +
        'running app by default so the user can finish them by hand — treat your output as a ' +
        'strong starting point, not a final file. get_capabilities also returns a catalogue of ' +
        'every layer and effect with what each is for; read it before reaching for effects.',
    },
  )

  server.registerTool(
    'get_capabilities',
    {
      title: 'Get capabilities',
      description:
        'The design vocabulary: canvas presets, available fonts, thumbnail templates (with ' +
        'guidance on when to use each), layer kinds, effect names and pipeline order, and the ' +
        'shape of a document patch. Call this before composing anything.',
    },
    async () => {
      const caps = await callRenderer<unknown>(win, 'window.__studioMcp.capabilities()')
      return { content: [{ type: 'text', text: JSON.stringify(caps, null, 2) }] }
    },
  )

  server.registerTool(
    'render_thumbnail',
    {
      title: 'Render thumbnail',
      description:
        'Render one thumbnail and return it as a PNG image. `doc` is a PARTIAL document ' +
        'merged one level deep over the defaults (or over the template named by templateId). ' +
        'By default the design also opens as a new canvas in the running SmoothyStudio app, ' +
        'so the user can finish it by hand — existing canvases are never overwritten. ' +
        'Look at the returned image and re-render if the composition needs fixing.',
      inputSchema: {
        doc: z
          .any()
          .optional()
          .describe('Partial StudioDoc object — e.g. { text, font: { size, color }, canvas: { width, height } }'),
        templateId: z
          .string()
          .optional()
          .describe('Template to start from; see get_capabilities. Strongly recommended.'),
        openInApp: z
          .boolean()
          .optional()
          .describe('Open the design as a canvas in the app for hand finishing. Default true.'),
        name: z.string().optional().describe('Tab name for the canvas opened in the app.'),
        previewWidth: z
          .number()
          .optional()
          .describe(
            'Width of the RETURNED image (default 640; 0 = full resolution). The app always ' +
            'gets the full-res document — this only shrinks the wire copy you look at.',
          ),
      },
    },
    async ({ doc, templateId, openInApp, name, previewWidth }) => {
      const r = await callRenderer<RenderResult>(
        win,
        `window.__studioMcp.render(${JSON.stringify(doc ?? {})}, ${JSON.stringify(templateId ?? null)} ?? undefined, ${JSON.stringify(openInApp ?? true)}, ${JSON.stringify(name ?? null)} ?? undefined, ${JSON.stringify(previewWidth ?? 640)})`,
      )
      if (openInApp !== false && !win.isDestroyed()) {
        // Bring the app forward so the user sees what was just made.
        if (win.isMinimized()) win.restore()
        win.show()
      }
      return {
        content: [
          imageContent(r),
          {
            type: 'text',
            text:
              `Rendered ${r.width}×${r.height}.` +
              (openInApp === false ? '' : ' Opened as a canvas in SmoothyStudio for hand finishing.'),
          },
        ],
      }
    },
  )

  server.registerTool(
    'render_variants',
    {
      title: 'Render variants',
      description:
        'Render several thumbnails that share one design. `doc` is the common base; each entry ' +
        'in `overrides` is a further partial document merged on top — e.g. a different `text` ' +
        'per variant. Returns one PNG per override, so you can compare them side by side.',
      inputSchema: {
        doc: z.any().optional().describe('Shared base — partial StudioDoc object'),
        overrides: z
          .array(z.any())
          .min(1)
          .max(24)
          .describe('One partial document per variant, e.g. [{ text: "A" }, { text: "B" }]'),
        templateId: z.string().optional().describe('Template to start from; see get_capabilities.'),
        openInApp: z
          .boolean()
          .optional()
          .describe('Open every variant as a canvas in the app. Default false — pick one first, then render it with openInApp.'),
      },
    },
    async ({ doc, overrides, templateId, openInApp }) => {
      const results = await callRenderer<RenderResult[]>(
        win,
        `window.__studioMcp.renderVariants(${JSON.stringify(doc ?? {})}, ${JSON.stringify(
          overrides,
        )}, ${JSON.stringify(templateId ?? null)} ?? undefined, ${JSON.stringify(openInApp ?? false)})`,
      )
      return {
        content: [
          { type: 'text', text: `Rendered ${results.length} variants.` },
          ...results.map(imageContent),
        ],
      }
    },
  )

  server.registerTool(
    'measure',
    {
      title: 'Measure layers',
      description:
        'Where every layer actually lands: x, y, width, height and centre for each, plus the ' +
        'safe area. Call this instead of guessing coordinates — it is the difference between ' +
        'one render and five. Optionally pass `anchors` to have positions computed for you: ' +
        "each entry is { id, width, height, anchor: { to, edge, gap } } where `to` is a layer " +
        "id or 'canvas' and `edge` is left|right|top|bottom|center|below|above|left-of|right-of.",
      inputSchema: {
        doc: z.any().optional().describe('Partial StudioDoc object'),
        templateId: z.string().optional().describe('Template to start from'),
        anchors: z
          .array(z.any())
          .optional()
          .describe('Placements to resolve: { id, width, height, anchor: { to, edge, gap } }'),
      },
    },
    async ({ doc, templateId, anchors }) => {
      const m = await callRenderer<unknown>(
        win,
        `window.__studioMcp.measure(${JSON.stringify(doc ?? {})}, ${JSON.stringify(
          templateId ?? null,
        )} ?? undefined, ${JSON.stringify(anchors ?? null)} ?? undefined)`,
      )
      return { content: [{ type: 'text', text: JSON.stringify(m, null, 2) }] }
    },
  )

  server.registerTool(
    'analyze',
    {
      title: 'Analyze a design',
      description:
        'Numeric vision — judge a design without pulling the image back. Returns, for the given ' +
        'document: contrast of every text layer against the pixels actually behind it (≥4.5 ' +
        'reads), its height at the 168px feed size (≥10px reads), visual-weight balance per ' +
        'quadrant with the centre of mass, the dominant palette with coverage, overlapping ' +
        'layer boxes, safe-area violations, and ink coverage. Iterate against these numbers ' +
        'between renders — render once at the end to look, not five times to guess.',
      inputSchema: {
        doc: z.any().optional().describe('Partial StudioDoc object'),
        templateId: z.string().optional().describe('Template to start from'),
      },
    },
    async ({ doc, templateId }) => {
      const a = await callRenderer<unknown>(
        win,
        `window.__studioMcp.analyze(${JSON.stringify(doc ?? {})}, ${JSON.stringify(
          templateId ?? null,
        )} ?? undefined)`,
      )
      return { content: [{ type: 'text', text: JSON.stringify(a, null, 2) }] }
    },
  )

  server.registerTool(
    'get_canvas',
    {
      title: 'Get the open canvas',
      description:
        'The document the user currently has open in SmoothyStudio, as a full StudioDoc. Use ' +
        'this to edit their work in place — read it, change what was asked for, and render it ' +
        'back — rather than starting from scratch and losing everything else on the canvas.',
    },
    async () => {
      const cur = await callRenderer<{ name: string; doc: unknown } | null>(
        win,
        'window.__studioMcp.currentCanvas()',
      )
      if (!cur) {
        return { content: [{ type: 'text', text: 'No canvas is open.' }] }
      }
      return {
        content: [
          { type: 'text', text: `Open canvas: ${cur.name}\n\n${JSON.stringify(cur.doc, null, 2)}` },
        ],
      }
    },
  )

  return server
}

export async function startMcpServer(win: BrowserWindow): Promise<void> {
  if (httpServer) return

  // Stateless: a fresh server + transport per request. Thumbnail rendering has
  // no session state worth keeping, and this sidesteps session-id bookkeeping
  // entirely.
  httpServer = http.createServer((req, res) => {
    if (!req.url?.startsWith('/mcp')) {
      res.writeHead(404).end()
      return
    }
    void (async () => {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined

      const server = buildServer(win)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      res.on('close', () => {
        void transport.close()
        void server.close()
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
    })().catch((err) => {
      console.error('[mcp] request failed', err)
      if (!res.headersSent) res.writeHead(500)
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
          id: randomUUID(),
        }),
      )
    })
  })

  await new Promise<void>((resolve, reject) => {
    httpServer!.once('error', reject)
    // Loopback only — never expose the render surface beyond this machine.
    httpServer!.listen(MCP_PORT, '127.0.0.1', () => resolve())
  })
  console.log(`[mcp] listening on http://127.0.0.1:${MCP_PORT}/mcp`)
}

export async function stopMcpServer(): Promise<void> {
  if (!httpServer) return
  await new Promise<void>((resolve) => httpServer!.close(() => resolve()))
  httpServer = null
}
