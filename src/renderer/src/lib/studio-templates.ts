import type { StudioDoc } from './studio'

/**
 * Opinionated starting points for thumbnails.
 *
 * These exist mainly for agent-driven use: handed a blank canvas and raw x/y
 * coordinates, a model produces technically-valid but ugly layouts. A template
 * fixes the composition — type scale, safe margins, contrast treatment — and
 * leaves the agent to supply the words and the imagery, which is the part it
 * is actually good at.
 *
 * Each entry is a partial document merged over `defaultStudioDoc()`.
 */
export interface StudioTemplate {
  id: string
  label: string
  /** When to reach for it — surfaced to agents through `get_capabilities`. */
  whenToUse: string
  doc: Partial<StudioDoc>
}

export const STUDIO_TEMPLATES: StudioTemplate[] = [
  {
    id: 'bold-centered',
    label: 'Bold centered',
    whenToUse:
      'Short punchy statement of 2–4 words, no subject photo. The default for a text-only thumbnail.',
    doc: {
      canvas: {
        width: 1920,
        height: 1080,
        bg: 'gradient',
        bgColor: '#0F172A',
        gradientColor2: '#1E293B',
        gradientDirection: 'diagonal',
        imageDataUrl: null,
        imageZoom: 100,
        imageX: 0,
        imageY: 0,
        filterBlur: 0,
        filterBrightness: 100,
        filterSaturation: 100,
        filterContrast: 100,
        pattern: { enabled: false, type: 'grid', size: 60, dotSize: 4, color: '#FFFFFF', opacity: 20, angle: 0 },
      },
      text: 'YOUR HOOK\nGOES HERE',
      font: { family: 'SF Pro Display', weight: 700, italic: false, size: 190, color: '#FFFFFF' },
      align: { h: 'center', v: 'middle', safeZone: 140, offsetX: 0, offsetY: 0 },
      shadow: { enabled: true, blur: 40, x: 0, y: 12, color: '#000000' },
      stroke: { enabled: false, width: 4, color: '#000000' },
    },
  },
  {
    id: 'subject-right-text-left',
    label: 'Subject right, text left',
    whenToUse:
      'A cut-out person or product on the right with the headline on the left. The standard talking-head thumbnail — pair it with a background-removed image.',
    doc: {
      canvas: {
        width: 1920,
        height: 1080,
        bg: 'gradient',
        bgColor: '#111827',
        gradientColor2: '#0B4F4A',
        gradientDirection: 'horizontal',
        imageDataUrl: null,
        imageZoom: 100,
        imageX: 0,
        imageY: 0,
        filterBlur: 0,
        filterBrightness: 100,
        filterSaturation: 100,
        filterContrast: 100,
        pattern: { enabled: false, type: 'grid', size: 60, dotSize: 4, color: '#FFFFFF', opacity: 20, angle: 0 },
      },
      text: 'THE BIG\nCLAIM',
      font: { family: 'SF Pro Display', weight: 700, italic: false, size: 165, color: '#FFFFFF' },
      align: { h: 'left', v: 'middle', safeZone: 120, offsetX: 0, offsetY: 0 },
      shadow: { enabled: true, blur: 32, x: 0, y: 10, color: '#000000' },
    },
  },
  {
    id: 'top-banner',
    label: 'Top banner',
    whenToUse:
      'Headline across the top over a full-bleed image, leaving the lower two-thirds for the picture. Good when the image itself is the story.',
    doc: {
      canvas: {
        width: 1920,
        height: 1080,
        bg: 'solid',
        bgColor: '#000000',
        gradientColor2: '#333333',
        gradientDirection: 'vertical',
        imageDataUrl: null,
        imageZoom: 100,
        imageX: 0,
        imageY: 0,
        filterBlur: 0,
        filterBrightness: 100,
        filterSaturation: 100,
        filterContrast: 100,
        pattern: { enabled: false, type: 'grid', size: 60, dotSize: 4, color: '#FFFFFF', opacity: 20, angle: 0 },
      },
      text: 'HEADLINE HERE',
      font: { family: 'SF Pro Display', weight: 700, italic: false, size: 130, color: '#FFFFFF' },
      align: { h: 'center', v: 'top', safeZone: 90, offsetX: 0, offsetY: 0 },
      box: {
        enabled: true,
        material: 'solid',
        color: '#000000',
        opacity: 62,
        gradientColor2: '#333333',
        gradientDirection: 'vertical',
        paddingX: 60,
        paddingY: 30,
        radius: 0,
        offsetX: 0,
        offsetY: 0,
        stroke: { enabled: false, width: 4, color: '#FFFFFF' },
        shadow: { enabled: false, blur: 20, x: 0, y: 8, color: '#000000' },
      },
    },
  },
  {
    id: 'vertical-short',
    label: 'Vertical short',
    whenToUse:
      'Cover for a 9:16 short or reel. Text sits high so platform UI at the bottom does not cover it.',
    doc: {
      canvas: {
        width: 1080,
        height: 1920,
        bg: 'gradient',
        bgColor: '#18181B',
        gradientColor2: '#3F3F46',
        gradientDirection: 'vertical',
        imageDataUrl: null,
        imageZoom: 100,
        imageX: 0,
        imageY: 0,
        filterBlur: 0,
        filterBrightness: 100,
        filterSaturation: 100,
        filterContrast: 100,
        pattern: { enabled: false, type: 'grid', size: 60, dotSize: 4, color: '#FFFFFF', opacity: 20, angle: 0 },
      },
      text: 'WATCH\nTHIS',
      font: { family: 'SF Pro Display', weight: 700, italic: false, size: 165, color: '#FFFFFF' },
      align: { h: 'center', v: 'top', safeZone: 260, offsetX: 0, offsetY: 0 },
      shadow: { enabled: true, blur: 36, x: 0, y: 10, color: '#000000' },
    },
  },
]

export function templateById(id: string): StudioTemplate | undefined {
  return STUDIO_TEMPLATES.find((t) => t.id === id)
}
