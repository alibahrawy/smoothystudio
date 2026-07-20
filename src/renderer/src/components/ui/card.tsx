import * as React from 'react'
import { cn } from '../../lib/cn'

/**
 * Desktop card. In light mode, separation comes from a 1px hairline border
 * against the warm bg-app — no drop shadow. The `density` prop chooses
 * between `compact` (p-4 / 16px) and `comfortable` (p-5 / 20px). Web
 * defaults of p-6/p-8 read as bloated and are not offered.
 */
type CardDensity = 'compact' | 'comfortable'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  density?: CardDensity
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, density = 'comfortable', ...props }, ref) => (
    <div
      ref={ref}
      data-density={density}
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col gap-1 px-5 pt-5 pb-3',
        '[[data-density=compact]_&]:px-4 [[data-density=compact]_&]:pt-4 [[data-density=compact]_&]:pb-2.5',
        className,
      )}
      {...props}
    />
  ),
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('text-lg font-semibold text-foreground leading-tight', className)}
      {...props}
    />
  ),
)
CardTitle.displayName = 'CardTitle'

export const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  ),
)
CardDescription.displayName = 'CardDescription'

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'px-5 pb-5',
        '[[data-density=compact]_&]:px-4 [[data-density=compact]_&]:pb-4',
        className,
      )}
      {...props}
    />
  ),
)
CardContent.displayName = 'CardContent'

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center px-5 pb-5',
        '[[data-density=compact]_&]:px-4 [[data-density=compact]_&]:pb-4',
        className,
      )}
      {...props}
    />
  ),
)
CardFooter.displayName = 'CardFooter'
