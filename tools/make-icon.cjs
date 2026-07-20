/**
 * Rasterise build/logo.svg into the PNG sizes electron-builder wants.
 *
 * Runs under Electron rather than pulling in a rasteriser dependency: the app
 * already ships Chromium, so the icon is drawn by the same engine that renders
 * the UI and the gradients and squircle match exactly.
 *
 * The SVG is painted into a <canvas> and read back with toDataURL rather than
 * captured with capturePage — capture depends on the compositor having painted
 * an on-screen window, which is unreliable for a hidden one.
 *
 *   npx electron tools/make-icon.mjs
 */
const { app, BrowserWindow, nativeImage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const svg = fs.readFileSync(path.join(root, 'build', 'logo.svg'), 'utf8')
const SIZES = [1024, 512, 256, 128, 64, 32, 16]

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 64, height: 64, show: false })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><body></body>'))

  const svgB64 = Buffer.from(svg, 'utf8').toString('base64')
  const dataUrl = await win.webContents.executeJavaScript(
    `new Promise((resolve, reject) => {
       const img = new Image()
       img.onload = () => {
         const c = document.createElement('canvas')
         c.width = 1024; c.height = 1024
         const ctx = c.getContext('2d')
         ctx.drawImage(img, 0, 0, 1024, 1024)
         resolve(c.toDataURL('image/png'))
       }
       img.onerror = () => reject(new Error('svg failed to decode'))
       img.src = 'data:image/svg+xml;base64,${svgB64}'
     })`,
    true,
  )

  const full = nativeImage.createFromDataURL(dataUrl)
  if (full.isEmpty()) throw new Error('rasterised image is empty')

  const outDir = path.join(root, 'build')
  const iconset = path.join(outDir, 'icon.iconset')
  fs.mkdirSync(iconset, { recursive: true })

  for (const size of SIZES) {
    const img = size === 1024 ? full : full.resize({ width: size, height: size, quality: 'best' })
    const png = img.toPNG()
    if (size === 1024) fs.writeFileSync(path.join(outDir, 'icon.png'), png)
    fs.writeFileSync(path.join(iconset, `icon_${size}x${size}.png`), png)
    const pt = size / 2
    if (pt >= 16) fs.writeFileSync(path.join(iconset, `icon_${pt}x${pt}@2x.png`), png)
  }

  console.log(`wrote build/icon.png (${full.getSize().width}px) and build/icon.iconset`)
  app.quit()
}).catch((err) => {
  console.error('[make-icon]', err)
  app.exit(1)
})
