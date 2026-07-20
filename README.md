# SmoothyStudio

[![macOS](https://img.shields.io/badge/macOS-Apple%20Silicon%20%7C%20Intel-000?logo=apple&logoColor=white)](https://github.com/alibahrawy/smoothystudio/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-2E7BF6.svg)](LICENSE)

> **Status:** macOS only for now. Windows and Linux targets are already configured in
> `package.json`, but nothing is built or tested against them yet.

A focused thumbnail tool: **generate the imagery, compose the thumbnail, export it** — plus an
MCP server so an agent can do the whole loop for you.

Two surfaces in one window:

- **Studio** — the canvas designer. Text (single / bullets / batch / split), shapes, icons,
  pictures, borders, corner logos, and a reorderable per-layer effect pipeline
  (crop, mosaic, wave warp, mirror, colour replace, duotone, roughen, blurs, vignette,
  turbulent displace, echo, venetian blinds, transform, 3D tilt, and a Lumetri-style grade).
  Exports transparent PNGs, one at a time or a whole batch.
- **AI Photos** — generation for the assets a thumbnail needs: reaction faces, text-to-image,
  background removal, upscaling, vertical covers.

The two are wired together: **Send to Studio** on any generated image drops it in as a picture
layer, and the picture layer has a **Generate with AI** button that takes you the other way.

## Running it

Requires Node 20+ and macOS.

```bash
npm install
npm run dev
```

Signing in uses your existing SmoothyEdit account — the app opens your browser and
receives the token back, so no credentials are stored in this repo or entered into the app.

### Building a release

```bash
npm run dist:mac   # → dist/SmoothyStudio-<version>.dmg and .zip
```

Builds are unsigned for now, so the first launch needs right-click → Open (or
System Settings → Privacy & Security → Open Anyway).

Dev server runs on `127.0.0.1:5176`, so it can run alongside SmoothyDesktop (5175).

```bash
npm run typecheck   # node + web
npm test            # vitest
npm run build
```

## Business model

The editor is free. Image *generation* costs credits, metered against the same
`/api/credits` rail the web app already uses — inference has real marginal cost, composition
doesn't.

**Background removal runs on device** and costs nothing. It uses the ISNet model bundled with
`@imgly/background-removal-node` in a `utilityProcess`, so photos never leave the machine, there
is no per-image cost, and there is no upload size limit — a full-resolution PNG exceeds a hosted
function's request-body cap before it even starts.

## MCP server

The app hosts an MCP server on `http://127.0.0.1:3777/mcp` while it's running. Rendering happens
in the app's own renderer (through `window.__studioMcp`), so agents get the exact code path the UI
uses — no second renderer to keep in sync.

Connect Claude Code to it:

```bash
claude mcp add --transport http smoothystudio http://127.0.0.1:3777/mcp
```

Then ask for thumbnails in plain language. Three tools, deliberately coarse — a tool per effect
would make an agent burn turns and produce incoherent layouts:

| Tool | What it does |
|---|---|
| `get_capabilities` | The full design reference: canvas presets, fonts, templates with guidance on when to use each, a catalogue of every **layer** and every **effect** saying what it is for and what each field does, plus general thumbnail guidance. Call this first. |
| `render_thumbnail` | One partial document → one PNG, returned **inline as an image**, and opened as a canvas in the running app so you can finish it by hand. Pass `openInApp: false` to skip that. |
| `render_variants` | A shared base + a list of overrides → one PNG per variant. Does not open canvases by default — compare the images, then render your pick with `render_thumbnail`. |

Agent renders land in the app as **new canvases**; nothing you already have open is
touched or overwritten.

### The document model

There is no parallel "spec" format to learn. A Studio document is plain JSON, and every tool takes
a **partial** document that's merged one level deep over the defaults — or over a template when you
pass `templateId`:

```jsonc
{
  "templateId": "bold-centered",
  "doc": {
    "text": "MY HOOK\nGOES HERE",
    "font": { "family": "SF Pro Display", "weight": 700, "size": 180, "color": "#FFFFFF" }
  }
}
```

Templates exist because an agent handed a blank canvas and raw coordinates produces valid but ugly
layouts. Each one fixes the composition — type scale, safe margins, contrast — leaving the words and
the imagery to the model. Current set: `bold-centered`, `subject-right-text-left`, `top-banner`,
`vertical-short`.

Rendered PNGs come back inline so a vision-capable model can look at its own output and iterate.
That feedback loop is the point; a tool that only returned a file path couldn't close it.

Effects live on a layer's `fx` object and the colour grade on its `grade` object, both optional:

```jsonc
{ "doc": { "text": "BOLD CLAIM",
           "grade": { "enabled": true, "contrast": 130, "vibrance": 25 },
           "fx": { "vignette": { "enabled": true, "amount": -45 } } } }
```

## Where your work is stored

Canvases are written to `studio-workspace.json` in the app's userData directory, not
localStorage. Documents embed their images as data URLs, so a couple of generated pictures
blow past localStorage's ~5 MB quota — and it fails *silently*, losing work. The file-backed
path has no cap, writes atomically, and surfaces any failure in the Studio header.

## Layout

```
src/main/        Electron main — auth, credits, AI Photos bridge, export dialogs, MCP server
src/preload/     contextBridge surface (auth, credits, aiPhotos, studioApi)
src/renderer/    React UI — Studio + AI Photos, the render library, the MCP bridge
src/shared/      Types shared across processes
```

The rendering core is `src/renderer/src/lib/studio.ts` (document model + pure renderer) and
`studio-effects.ts` (the effect pipeline). `renderDocToPngBase64(doc)` is a pure
document-to-pixels function, which is what makes the whole thing drivable by an agent.
