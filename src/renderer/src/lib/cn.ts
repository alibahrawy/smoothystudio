/**
 * Tailwind class merger used by all shadcn primitives. Combines clsx
 * (conditional class names) with tailwind-merge (resolves conflicting
 * utilities — last one wins).
 */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
