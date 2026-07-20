import { cn } from '../lib/cn'

/**
 * The SmoothyStudio mark, inlined rather than loaded from build/logo.svg so it
 * can inherit CSS colour and needs no SVG loader in the bundler. Same
 * construction as the app icon: two offset planes fused into one stepped
 * silhouette with a circular counter punched through it, in blueberry.
 *
 * `plated` draws the navy squircle behind it (the icon treatment). Without it
 * the glyph stands alone, which is what the title bar wants on a light theme.
 */
export function Logo({
  className,
  plated = false,
}: {
  className?: string
  plated?: boolean
}): JSX.Element {
  return (
    <svg
      viewBox="0 0 1024 1024"
      role="img"
      aria-label="SmoothyStudio"
      className={cn('block', className)}
    >
      <defs>
        <linearGradient id="smoothystudio-accent" x1="184" y1="230" x2="840" y2="794" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7FB6FF" />
          <stop offset="1" stopColor="#2A6FEF" />
        </linearGradient>
        <linearGradient id="smoothystudio-plate" x1="512" y1="64" x2="512" y2="960" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0A1B38" />
          <stop offset="1" stopColor="#000418" />
        </linearGradient>
      </defs>
      {plated ? <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#smoothystudio-plate)" /> : null}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="url(#smoothystudio-accent)"
        d="M428 230H792A48 48 0 0 1 840 278V542A48 48 0 0 1 792 590H684A40 40 0 0 0 644 630V746A48 48 0 0 1 596 794H232A48 48 0 0 1 184 746V482A48 48 0 0 1 232 434H340A40 40 0 0 0 380 394V278A48 48 0 0 1 428 230ZM372 632m-88 0a88 88 0 1 0 176 0a88 88 0 1 0-176 0Z"
      />
    </svg>
  )
}
