import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/cn'

/**
 * Desktop input — 32px tall by default, matching the 32px button. Focus
 * combines a 1px accent border + a 2px accent-soft ring (the Claude Desktop
 * pattern — a focused field whispers, it doesn't shout).
 */
const inputVariants = cva(
  [
    'flex w-full rounded-md border border-input bg-background text-foreground',
    'px-2.5 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium',
    'placeholder:text-muted-foreground/70',
    'transition-colors duration-120 ease-out',
    'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft focus-visible:ring-offset-0',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/20',
  ].join(' '),
  {
    variants: { size: { sm: 'h-7', md: 'h-8', lg: 'h-9' } },
    defaultVariants: { size: 'md' },
  },
)

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size, ...props }, ref) => (
    <input type={type} ref={ref} className={cn(inputVariants({ size }), className)} {...props} />
  ),
)
Input.displayName = 'Input'
