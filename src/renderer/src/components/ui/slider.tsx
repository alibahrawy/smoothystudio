import * as React from 'react'
import { cn } from '../../lib/cn'

/**
 * Pointer-driven slider. Native range inputs render inconsistently across
 * macOS / Windows, so this is a hand-rolled track + fill + thumb that follows
 * pointer drags and arrow keys. Color-only hover states, snappy 120ms easing —
 * matches the Button / Input primitives.
 */
interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
  className,
  'aria-label': ariaLabel,
}: SliderProps): JSX.Element {
  const trackRef = React.useRef<HTMLDivElement>(null)
  const draggingRef = React.useRef(false)
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0

  const snap = React.useCallback(
    (raw: number): number => {
      const clamped = Math.max(min, Math.min(max, raw))
      const snapped = Math.round((clamped - min) / step) * step + min
      return Math.max(min, Math.min(max, Math.round(snapped * 1000) / 1000))
    },
    [min, max, step],
  )

  const setFromClientX = React.useCallback(
    (clientX: number): void => {
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
      onChange(snap(min + ratio * (max - min)))
    },
    [min, max, onChange, snap],
  )

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (disabled) return
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    setFromClientX(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return
    setFromClientX(e.clientX)
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    draggingRef.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(snap(value - step))
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      onChange(snap(value + step))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onChange(min)
    } else if (e.key === 'End') {
      e.preventDefault()
      onChange(max)
    }
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className={cn(
        'relative flex h-5 w-full touch-none items-center',
        'focus-visible:outline-none',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      <div className="relative h-1 w-full rounded-full bg-secondary">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
        <div
          className={cn(
            'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
            'border-2 border-primary bg-card shadow-sm transition-shadow',
            'group-focus-visible:ring-2',
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  )
}
