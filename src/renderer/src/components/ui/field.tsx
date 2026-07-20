import * as React from 'react'
import * as Label from '@radix-ui/react-label'
import { cn } from '../../lib/cn'

/**
 * Form field group — uppercase 11px label, 6px gap, then the control. Matches
 * the existing SmoothyEdit "pro tool" form pattern (ENCODER / QUALITY / OUTPUT)
 * but enforces the gap and label treatment consistently across panels.
 */
interface FieldProps {
  label: string
  htmlFor?: string
  description?: string
  error?: string
  children: React.ReactNode
  className?: string
}

export function Field({
  label,
  htmlFor,
  description,
  error,
  children,
  className,
}: FieldProps): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      <Label.Root
        htmlFor={htmlFor}
        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </Label.Root>
      {children}
      {description && !error ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
