import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/cn'

/**
 * Desktop button primitive. Heights snap to the 28 / 32 / 36 grid so they
 * line up with inputs and the 40px toolbar. Hover and active states are
 * color-only — no `scale`, no `translate`. The 120ms `ease-out` transition
 * makes desktop hovers feel snappier than web defaults.
 *
 * `default` is the teal primary. The legacy `default` size (h-9 / px-4)
 * remains the fallback to avoid breaking call-sites that omit `size=`, but
 * new call-sites should pick `sm` / `md` / `lg` explicitly.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none',
    'rounded-md font-medium ring-offset-background',
    'transition-colors duration-120 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:brightness-110 active:brightness-95',
        destructive: 'bg-destructive text-destructive-foreground hover:brightness-110 active:brightness-95',
        outline: 'border border-border bg-transparent text-foreground hover:bg-secondary hover:border-muted-foreground/40',
        secondary: 'bg-secondary text-secondary-foreground border border-border hover:bg-muted',
        ghost: 'bg-transparent text-foreground hover:bg-secondary active:bg-muted',
        link: 'bg-transparent text-primary underline-offset-4 hover:underline px-0 h-auto',
        soft: 'bg-primary-soft text-primary hover:bg-primary/15',
      },
      size: {
        default: 'h-9 px-4 text-base',
        xs: 'h-6 px-2 text-sm gap-1',
        sm: 'h-7 px-2.5 text-base',
        md: 'h-8 px-3 text-base',
        lg: 'h-9 px-4 text-base',
        'icon-sm': 'h-7 w-7 p-0',
        'icon-md': 'h-8 w-8 p-0',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
