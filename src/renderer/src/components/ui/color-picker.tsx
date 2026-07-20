import * as React from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * Compact color picker — a swatch button that opens a popover with a curated
 * palette, a native eyedropper (<input type="color">), and a hex field.
 * Used by the caption StylePanel for fill / highlight / stroke colors.
 */
const SWATCHES = [
  '#ffffff', '#000000', '#2dd4bf', '#60a5fa',
  '#a78bfa', '#f472b6', '#fb923c', '#fbbf24',
  '#34d399', '#ef4444', '#facc15', '#94a3b8',
]

interface ColorPickerProps {
  value: string
  onChange: (hex: string) => void
  className?: string
}

export function ColorPicker({ value, onChange, className }: ColorPickerProps): JSX.Element {
  const [draft, setDraft] = React.useState(value)
  React.useEffect(() => setDraft(value), [value])

  const commitHex = (raw: string): void => {
    const v = raw.trim()
    const hex = v.startsWith('#') ? v : `#${v}`
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) onChange(hex)
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2',
            'transition-colors hover:border-muted-foreground/40 focus-visible:outline-none',
            'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft',
            className,
          )}
        >
          <span
            className="size-4 rounded-sm border border-border/60"
            style={{ backgroundColor: value }}
          />
          <span className="font-mono text-sm uppercase text-muted-foreground">{value}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          className={cn(
            'z-50 w-52 rounded-lg border border-border bg-popover p-3',
            'shadow-popover outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <div className="grid grid-cols-6 gap-1.5">
            {SWATCHES.map((c) => {
              const active = c.toLowerCase() === value.toLowerCase()
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange(c)}
                  className={cn(
                    'flex size-6 items-center justify-center rounded-md border transition-transform',
                    'hover:scale-110',
                    active ? 'border-primary' : 'border-border/60',
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                >
                  {active ? (
                    <Check
                      className={cn('size-3', isLight(c) ? 'text-black' : 'text-white')}
                    />
                  ) : null}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border">
              <span className="block size-full" style={{ backgroundColor: value }} />
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff'}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commitHex(draft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitHex(draft)
              }}
              spellCheck={false}
              className={cn(
                'h-8 w-full rounded-md border border-input bg-background px-2',
                'font-mono text-sm uppercase text-foreground',
                'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft',
              )}
            />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return false
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 160
}
