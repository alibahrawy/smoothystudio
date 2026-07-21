/**
 * The reference an agent reads before designing.
 *
 * `get_capabilities` returns this verbatim. It exists because a model given
 * only a type signature produces technically-valid but ugly output: it needs to
 * know not just that `vignette.amount` is a number, but that a vignette pulls
 * the eye toward the centre and that −40 is tasteful while −100 looks like a
 * mistake. Every entry therefore says what the thing is *for*, not just what
 * fields it has.
 */

export interface FieldDoc {
  name: string
  type: string
  purpose: string
}

export interface EffectDoc {
  key: string
  label: string
  purpose: string
  useFor: string
  fields: FieldDoc[]
}

export interface LayerDoc {
  key: string
  label: string
  purpose: string
  /** Where it lives on the document. */
  path: string
  extrasPath?: string
  keyFields: FieldDoc[]
}

const f = (name: string, type: string, purpose: string): FieldDoc => ({ name, type, purpose })

export const LAYER_DOCS: LayerDoc[] = [
  {
    key: 'text',
    label: 'Title text',
    purpose:
      'The headline. Owns several top-level fields rather than one object, because it is the ' +
      'layer everything else is arranged around.',
    path: 'doc.text (the string) plus doc.font, doc.material, doc.align, doc.spacing, doc.shadow, doc.glow, doc.stroke, doc.box, doc.pattern',
    extrasPath: 'doc.extraTexts[] — free-floating text blocks, each positioned from canvas centre by x/y',
    keyFields: [
      f('text', 'string', 'The words. "\\n" starts a new line; keep thumbnails to 2–4 words per line.'),
      f('font', '{family,weight,italic,size,color}', 'weight 400–700; size is px on the canvas, so ~150–200 reads well at 1920×1080.'),
      f('material', "{type:'solid'|'gradient'|'glass', gradientColor1, gradientColor2, gradientDirection, glassOpacity}", 'How the glyphs are filled. Gradient adds depth; glass is translucent over imagery.'),
      f('align', '{h,v,safeZone,offsetX,offsetY}', 'safeZone is the margin in px kept clear of the canvas edge — never let type touch the edge.'),
      f('spacing', '{letter,line,word}', 'Tighten line spacing on multi-line headlines so they read as one block.'),
      f('box', '{enabled,color,opacity,paddingX,paddingY,radius,...}', 'A plate behind the text. The reliable way to keep type legible over a busy photo.'),
      f('stroke / shadow / glow', 'effect objects', 'Separation from the background. A dark shadow under white type is the workhorse.'),
    ],
  },
  {
    key: 'image',
    label: 'Picture',
    purpose: 'A photo or cut-out subject — usually the person or product the thumbnail is about.',
    path: 'doc.image',
    extrasPath: 'doc.extraImages[]',
    keyFields: [
      f('dataUrl', 'string|null', 'The image itself, embedded as a data URL. Generate one in AI Photos and send it over.'),
      f('width', 'number', 'Display width in px; height follows the source aspect.'),
      f('x / y', 'number', 'Offset from canvas centre.'),
      f('bgRemoved', 'boolean', 'Whether the background was cut out. A cut-out subject over a graphic background is the classic thumbnail.'),
      f('opacity / stroke / shadow / glow', 'various', 'A stroke around a cut-out subject separates it from the background.'),
    ],
  },
  {
    key: 'shape',
    label: 'Shape',
    purpose: 'A decorative block — circle, square, triangle, star, hexagon.',
    path: 'doc.shape',
    extrasPath: 'doc.extraShapes[]',
    keyFields: [
      f('type', "'circle'|'square'|'triangle'|'star'|'hexagon'", 'The silhouette.'),
      f('size / cornerRadius', 'number', 'Overall size; corner rounding (no effect on circle).'),
      f('color / opacity', 'string / number', 'Use a low opacity block behind text as a legibility plate.'),
      f('x / y', 'number', 'Offset from the title anchor.'),
    ],
  },
  {
    key: 'icon',
    label: 'Icon',
    purpose: 'A small mark anchored to the title text — an arrow, a symbol, a badge.',
    path: 'doc.icon',
    extrasPath: 'doc.extraIcons[]',
    keyFields: [
      f('dataUrl', 'string|null', 'The icon image or SVG.'),
      f('position', "'left'|'right'|'top'|'bottom'", 'Which side of the title it sits on.'),
      f('size / gap', 'number', 'Icon height, and its distance from the text.'),
      f('tint', 'string|null', 'Recolour to a flat colour — useful for making a mixed-colour logo mono.'),
    ],
  },
  {
    key: 'border',
    label: 'Border',
    purpose: 'A frame inset from the canvas edges. Reads as a deliberate, designed edge.',
    path: 'doc.border',
    extrasPath: 'doc.extraBorders[] — nest several for a double frame',
    keyFields: [
      f('thickness / inset', 'number', 'Ring width, and the gap between the canvas edge and the frame.'),
      f('outerRadius / innerRadius', 'number', 'The outside and inside corners round independently.'),
      f('material', "'solid'|'gradient'", 'A gradient frame catches light across the design.'),
    ],
  },
  {
    key: 'logo',
    label: 'Logo / watermark',
    purpose: 'Branding pinned to a canvas corner — either an image or a typed wordmark.',
    path: 'doc.logo',
    extrasPath: 'doc.extraLogos[]',
    keyFields: [
      f('kind', "'image'|'text'", 'Image logo, or type the brand name if there is no file.'),
      f('corner', "'top-left'|'top-right'|'bottom-left'|'bottom-right'", 'Which corner it hugs.'),
      f('margin / offsetX / offsetY', 'number', 'Distance from both edges, plus a fine nudge. Positive nudge always moves right/down.'),
      f('size / opacity', 'number', 'Image height or font size; keep a watermark subtle at 60–80% opacity.'),
    ],
  },
  {
    key: 'canvasBg',
    label: 'Canvas background',
    purpose: 'The backdrop behind every layer.',
    path: 'doc.canvas',
    keyFields: [
      f('bg', "'transparent'|'solid'|'gradient'|'image'", 'Transparent exports a PNG with alpha — use it for overlays, not thumbnails.'),
      f('bgColor / gradientColor2 / gradientDirection', 'string', 'A dark diagonal gradient is the safest backdrop for white type.'),
      f('filterBlur / filterBrightness / filterSaturation', 'number', 'Applied to a background image — blur and darken it so foreground type wins.'),
      f('pattern', 'effect object', 'A subtle grid or dot texture; keep opacity under ~20.'),
    ],
  },
]

export const EFFECT_DOCS: EffectDoc[] = [
  {
    key: 'transform',
    label: 'Transform',
    purpose: 'Moves, scales, rotates, skews and flips the whole layer.',
    useFor: 'Angling a headline for energy, or nudging a layer that a template placed generically.',
    fields: [
      f('scale / scaleY / uniform', 'number / boolean', 'Percent. Set uniform:false to stretch one axis.'),
      f('rotate', 'number', 'Degrees. A 3–8° tilt on a title adds motion; more looks careless.'),
      f('offsetX / offsetY', 'number', 'Move in px.'),
      f('anchorX / anchorY', 'number', 'Pivot for scale and rotation, offset from layer centre.'),
      f('skewX / skewY', 'number', 'Degrees of slant.'),
      f('opacity', 'number', '0–100.'),
      f('flipH / flipV', 'boolean', 'Mirror the layer. Useful to make a subject face into the frame.'),
    ],
  },
  {
    key: 'threeD',
    label: '3D tilt',
    purpose: 'Tilts the layer in perspective, like a card turned in space.',
    useFor: 'Giving a flat title or picture depth. Best kept subtle — under about 25°.',
    fields: [
      f('rotateX / rotateY', 'number', 'Degrees of tilt about each axis.'),
      f('distance', 'number', 'Viewer distance; lower exaggerates the perspective.'),
      f('specular / specularStrength', 'boolean / number', 'A light sheen across the tilted plane.'),
    ],
  },
  {
    key: 'crop',
    label: 'Crop',
    purpose: 'Trims the layer from each side, with rounded corners and a soft edge.',
    useFor: 'Turning a photo into a rounded card, or feathering an image so it blends into the background.',
    fields: [
      f('top / right / bottom / left', 'number', 'Pixels trimmed from each side.'),
      f('radius', 'number', 'Corner rounding of what remains.'),
      f('feather', 'number', 'Soft edge in px — a large feather makes an image fade out rather than cut.'),
    ],
  },
  {
    key: 'mosaic',
    label: 'Mosaic',
    purpose: 'Pixelates the layer into blocks.',
    useFor: 'Censoring a face, or a deliberate retro/low-res look.',
    fields: [
      f('size', 'number', 'Block width in px.'),
      f('sizeV', 'number', 'Block height; 0 means square blocks.'),
    ],
  },
  {
    key: 'gaussianBlur',
    label: 'Gaussian blur',
    purpose: 'An even, all-directions blur.',
    useFor: 'Pushing a background layer back so the subject and title read first.',
    fields: [f('amount', 'number', 'Radius in px.')],
  },
  {
    key: 'radialBlur',
    label: 'Radial blur',
    purpose: 'Blur that streaks outward from a point (zoom) or around it (spin).',
    useFor: 'Speed and impact. Zoom-blur a background to make the centred subject explode forward.',
    fields: [
      f('type', "'zoom'|'spin'", 'Streak outward, or rotate around the centre.'),
      f('amount', 'number', 'Strength, 0–200.'),
      f('centerX / centerY', 'number', 'Move the blur origin off centre — put it on the subject.'),
    ],
  },
  {
    key: 'vignette',
    label: 'Vignette',
    purpose: 'Darkens (or lightens) the edges of the layer.',
    useFor: 'Pulling the eye to the middle. −30 to −60 is tasteful; −100 looks like a mistake.',
    fields: [
      f('amount', 'number', '−100 darken … 100 lighten.'),
      f('size', 'number', 'Where the falloff starts, 0–100.'),
      f('feather', 'number', 'How gradual the falloff is.'),
      f('roundness', 'number', '0 follows the canvas shape, 100 is a circle.'),
    ],
  },
  {
    key: 'grade',
    label: 'Colour grade',
    purpose: 'Full colour correction, modelled on Premiere\'s Lumetri.',
    useFor:
      'Making a generated image match the design\'s palette, or pushing contrast so a thumbnail ' +
      'pops at small size. Lives on the layer\'s `grade` object, not inside `fx`.',
    fields: [
      f('exposure', 'number', '−100…100; 50 units = one photographic stop.'),
      f('contrast / brightness / saturation', 'number', 'Percent, neutral at 100.'),
      f('highlights / shadows', 'number', '−100…100, weighted to the bright / dark end.'),
      f('whites / blacks', 'number', 'Endpoint remap. Lift blacks for a faded film look.'),
      f('temperature / tint', 'number', 'Warm↔cool and green↔magenta white balance.'),
      f('vibrance', 'number', 'Saturation weighted toward dull pixels — safer than raw saturation.'),
      f('hue', 'number', 'Rotation in degrees, −180…180.'),
      f('sepia / grayscale / invert / blur', 'number', 'Stylise. grayscale:100 for a mono treatment.'),
    ],
  },
  {
    key: 'duotone',
    label: 'Duotone',
    purpose: 'Maps luminance onto two colours — dark tones to one, bright to the other.',
    useFor: 'Forcing a photo into a brand palette so a mixed-colour image stops fighting the design.',
    fields: [
      f('shadowColor / highlightColor', 'string', 'The two ends of the ramp.'),
      f('amount', 'number', 'Blend with the original, 0–100.'),
    ],
  },
  {
    key: 'colorReplace',
    label: 'Colour change',
    purpose: 'Swaps one colour for another, with tolerance and a soft falloff.',
    useFor: 'Recolouring a logo or a piece of clothing to match the palette.',
    fields: [
      f('from / to', 'string', 'The colour to find, and its replacement.'),
      f('matchBy', "'rgb'|'hue'", "'hue' swaps every shade of a colour regardless of brightness."),
      f('tolerance / softness', 'number', 'How close counts as a match, and how gradually the edge falls off.'),
      f('preserveShading', 'boolean', 'Keep the original brightness so gradients and edges survive. Leave on.'),
    ],
  },
  {
    key: 'noise',
    label: 'Noise / grain',
    purpose: 'Film grain over the layer. Always runs last so it stays crisp.',
    useFor: 'Taking the plastic sheen off an AI-generated image, or an analogue feel. 10–25 is plenty.',
    fields: [
      f('amount', 'number', 'Opacity of the grain, 0–100.'),
      f('size', 'number', 'Grain pixel size; 1 is fine film grain.'),
      f('mono', 'boolean', 'Monochrome grain rather than coloured.'),
    ],
  },
  {
    key: 'roughen',
    label: 'Roughen edges',
    purpose: 'Chews the layer\'s edge into an irregular, torn outline.',
    useFor: 'A grunge or hand-torn look on a text or shape layer.',
    fields: [
      f('amount', 'number', 'How far the edge is eaten, 0–100.'),
      f('size', 'number', 'Size of the roughness features in px.'),
      f('seed', 'number', 'Evolution — reshapes the noise without changing its character.'),
    ],
  },
  {
    key: 'wave',
    label: 'Wave warp',
    purpose: 'Ripples the layer along one axis.',
    useFor: 'A liquid or retro-poster distortion on a title.',
    fields: [
      f('axis', "'horizontal'|'vertical'", 'Direction rows/columns shift.'),
      f('waveType', "'sine'|'triangle'|'square'", 'Smooth, angular, or stepped.'),
      f('amplitude / wavelength / phase', 'number', 'Peak displacement, crest spacing, and offset.'),
      f('pinEdges', 'boolean', 'Fades displacement to zero at both ends so edges stay put.'),
    ],
  },
  {
    key: 'turbulence',
    label: 'Turbulent displace',
    purpose: 'Organic noise-driven warp — melts and billows the layer.',
    useFor: 'Smoke, liquid or dreamlike distortion. Heavier than the other effects; use sparingly.',
    fields: [
      f('amount', 'number', 'Peak displacement in px.'),
      f('size', 'number', 'Feature size — larger is billowier.'),
      f('complexity', 'number', 'Octaves of detail, 1–3.'),
      f('evolution', 'number', 'Reshapes the field without changing its character.'),
    ],
  },
  {
    key: 'mirror',
    label: 'Mirror',
    purpose: 'Reflects one half of the layer onto the other, across a line you can tilt and move.',
    useFor: 'Symmetry, kaleidoscope effects, or fixing an unbalanced composition.',
    fields: [
      f('keep', "'left'|'right'|'top'|'bottom'", 'Which half survives and gets reflected.'),
      f('offset / angle', 'number', 'Move and tilt the mirror line.'),
    ],
  },
  {
    key: 'echo',
    label: 'Echo',
    purpose: 'Trailing ghost copies behind the layer.',
    useFor: 'Motion trails on a title, or a stacked-cards look.',
    fields: [
      f('copies', 'number', 'Number of ghosts, 1–10.'),
      f('offsetX / offsetY', 'number', 'Step between copies.'),
      f('scaleStep / rotateStep', 'number', 'Scale and rotation change per copy.'),
      f('opacityDecay', 'number', 'Fade per copy, 0–100.'),
    ],
  },
  {
    key: 'blinds',
    label: 'Venetian blinds',
    purpose: 'Erases the layer in stripes.',
    useFor: 'A slatted reveal, or breaking a solid block into bands.',
    fields: [
      f('completion', 'number', 'How much is wiped away, 0–100.'),
      f('direction', "'horizontal'|'vertical'", 'Stripe orientation.'),
      f('width', 'number', 'Stripe period in px.'),
    ],
  },
]

/** What actually makes a thumbnail work, as opposed to what the API allows. */
export const DESIGN_GUIDANCE = [
  'Start from a template. It fixes type scale, safe margins and contrast; you supply the words.',
  'Thumbnails are judged at about 200 px wide. Use 2–4 words per line at a large size, and check the rendered image at that scale in your head before iterating.',
  'Contrast beats decoration: light type on a dark backdrop (or the reverse) with a shadow or a box behind it will out-perform any effect.',
  'One focal point. A cut-out subject on one side and the headline on the other is the most reliable layout there is.',
  'Keep everything inside the safe zone — type touching the canvas edge reads as broken.',
  'Effects are seasoning. A grade plus a vignette plus a shadow is usually the whole recipe; reach for wave, turbulence or blinds only when the concept calls for it.',
  'Look at the PNG that comes back. If the title collides with the subject or overflows the frame, change it and render again.',
]

/**
 * Which face to reach for.
 *
 * The font list alone is not enough — an agent handed 26 names picks the first
 * one every time, which is why everything came out in the system UI face. This
 * says what each group is *for*.
 */
export const FONT_GUIDE: Array<{ group: string; fonts: string[]; useFor: string }> = [
  {
    group: 'Heavy display',
    fonts: ['Impact', 'Arial Black', 'Phosphate', 'Haettenschweiler'],
    useFor:
      'Thumbnail headlines. Maximum weight at small sizes — this is what most high-performing ' +
      'thumbnails actually use. Reach here first for a hook, not for a UI font.',
  },
  {
    group: 'Condensed',
    fonts: ['DIN Condensed', 'Avenir Next Condensed', 'Helvetica Neue Condensed Bold'],
    useFor:
      'Long headlines that must stay big. Condensed faces fit more characters per line without ' +
      'dropping the point size, so a six-word hook still reads at 200px wide.',
  },
  {
    group: 'Geometric sans',
    fonts: ['Futura', 'DIN Alternate', 'Avenir Next'],
    useFor: 'Clean, modern, slightly premium. Good for product and tech subjects.',
  },
  {
    group: 'Neutral sans',
    fonts: ['SF Pro Display', 'Helvetica Neue', 'Arial'],
    useFor:
      'Captions, subtitles, eyebrows and UI-ish labels. Safe but characterless — avoid for the ' +
      'headline unless the subject is deliberately corporate.',
  },
  {
    group: 'Editorial serif',
    fonts: ['Didot', 'Bodoni 72', 'Baskerville', 'Palatino'],
    useFor: 'Fashion, film, essays, anything wanting authority or elegance over shout.',
  },
  {
    group: 'Slab & typewriter',
    fonts: ['Rockwell', 'American Typewriter', 'Courier New'],
    useFor: 'Documentary, retro, technical or handmade subjects.',
  },
  {
    group: 'Character',
    fonts: ['Marker Felt', 'Chalkboard SE', 'Copperplate'],
    useFor: 'Use sparingly and deliberately — casual, handmade or vintage-formal registers.',
  },
]

/**
 * Named looks a working designer actually reaches for — effect COMBINATIONS
 * with the doc fragments that produce them, not descriptions of single tools.
 *
 * The effect catalog says what each tool does; this says which tools go
 * together and why. An agent that has only the catalog rediscovers the same
 * two moves every time (drop shadow + gradient background). Each recipe below
 * produces a distinct, recognisable look and names the pitfall that ruins it.
 */
export const PLAYBOOK: Array<{
  name: string
  when: string
  how: string
  fragment: Record<string, unknown>
  pitfall: string
}> = [
  {
    name: 'Depth stack',
    when: 'A cut-out subject and a headline that must both read — the default thumbnail grammar.',
    how:
      'Radial gradient background (dark rim, warmer centre) → soft glow behind the subject in an ' +
      'accent colour → subject → headline OVERLAPPING the subject by 10–20% so the layers ' +
      'interlock instead of sitting in separate columns. layerOrder puts text above image.',
    fragment: {
      canvas: { bg: 'gradient', gradientDirection: 'radial' },
      image: { glow: { enabled: true, blur: 120, strength: 2 } },
      layerOrder: ['text', 'image'],
    },
    pitfall: 'Glow in the same hue as the background disappears — pick the complementary accent.',
  },
  {
    name: 'Knockout text',
    when: 'Imagery is strong and words are secondary — the photo shows through the letters.',
    how:
      "A photo layer masked to the title's silhouette: put the image ABOVE a bold dark canvas, " +
      "set image.fx.mask = { enabled: true, sourceId: 'text' }. Use the heaviest face you have; " +
      'thin strokes leave nothing to see through.',
    fragment: {
      font: { family: 'Impact', size: 260 },
      image: { fx: { mask: { enabled: true, sourceId: 'text' } } },
      layerOrder: ['image', 'text'],
    },
    pitfall: 'Busy photos kill it — the eye needs one dominant colour region inside the glyphs.',
  },
  {
    name: 'Duotone poster',
    when: 'A flat, editorial, screen-print look; also rescues low-quality photos.',
    how:
      'Duotone on the photo (dark shadows in the background hue, highlights in the accent), plus ' +
      'coarse noise and a slight contrast lift in the grade. Type in the same two colours only.',
    fragment: {
      image: {
        fx: { duotone: { enabled: true, shadowColor: '#1A1040', highlightColor: '#FF5A36', amount: 100 } },
        grade: { enabled: true, contrast: 115 },
      },
      canvasFx: { noise: { enabled: true, amount: 12, size: 2, mono: true } },
    },
    pitfall: 'A third colour anywhere breaks the system — even the logo should take one of the two.',
  },
  {
    name: 'Motion echo',
    when: 'Anything about speed, progress, or before/after — implies movement in a still.',
    how:
      'Echo on the subject (4–6 copies, offset along the travel direction, opacity decay ~60) ' +
      'UNDER a sharp final copy; tilt the whole stack with transform.rotate for energy.',
    fragment: {
      image: {
        fx: {
          echo: { enabled: true, copies: 5, offsetX: -40, offsetY: 0, scaleStep: 97, opacityDecay: 60 },
          transform: { enabled: true, rotate: -6 },
        },
      },
    },
    pitfall: 'Echo over a textured background reads as smear — keep the trail zone calm.',
  },
  {
    name: 'Neon night',
    when: 'Tech, gaming, hidden-feature energy — glow as the light source.',
    how:
      'Near-black canvas, headline with a saturated glow (strength 3+) and NO shadow, thin bright ' +
      'stroke in the glow colour on key shapes, vignette pulling the corners down.',
    fragment: {
      canvas: { bg: 'solid', bgColor: '#07070C' },
      glow: { enabled: true, blur: 40, strength: 3, color: '#39D9F5' },
      canvasFx: { vignette: { enabled: true, amount: -55, size: 45, feather: 70 } },
    },
    pitfall: 'Glow plus drop shadow reads as mud — a light source does not cast its own shadow.',
  },
  {
    name: 'Sticker cutout',
    when: 'Playful, MrBeast-adjacent energy; makes any subject feel designed.',
    how:
      'Thick white stroke around the cut-out subject (width 14–20), hard small offset shadow, ' +
      'saturated flat or radial background. Rotate the subject 3–8° so it feels placed by hand.',
    fragment: {
      image: {
        stroke: { enabled: true, width: 16, color: '#FFFFFF' },
        shadow: { enabled: true, blur: 0, x: 10, y: 12, color: '#00000088' },
        fx: { transform: { enabled: true, rotate: 5 } },
      },
    },
    pitfall: 'Soft blurry shadows undo the sticker illusion — keep blur at 0 and offset hard.',
  },
  {
    name: 'Split versus',
    when: 'Comparisons, X-vs-Y, old-vs-new.',
    how:
      'Two full-height shapes as colour fields meeting mid-canvas (or mode: "split"), one subject ' +
      'per side, headline centred ACROSS the seam on a plate or with a heavy stroke so it owns ' +
      'both halves.',
    fragment: {
      extraShapes: [
        { id: 'left', type: 'square', width: 960, height: 1080, x: -480, y: 0, color: '#15243B' },
        { id: 'right', type: 'square', width: 960, height: 1080, x: 480, y: 0, color: '#3B1520' },
      ],
    },
    pitfall: 'Equal visual weight on both sides is static — let the "winner" side be brighter.',
  },
  {
    name: 'Big number',
    when: 'Listicles, prices, percentages — the number IS the thumbnail.',
    how:
      'One numeral at 400–600px in the heaviest face, gradient or accent fill, subject tucked ' +
      'behind or beside it; supporting words tiny by comparison (the contrast in scale is the ' +
      'design).',
    fragment: {
      text: '7',
      font: { family: 'Arial Black', size: 520 },
      material: { type: 'gradient', gradientDirection: 'vertical' },
    },
    pitfall: 'Two big things fight — if the number is huge the subject must be clearly second.',
  },
]
