import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md'
  icon?: ReactNode
}

const variants: Record<string, string> = {
  primary: 'bg-info-500 hover:bg-info-400 text-hull-950 border-transparent font-semibold',
  secondary: 'bg-hull-700 hover:bg-hull-600 text-ink-100 border-hull-500/50',
  ghost: 'bg-transparent hover:bg-hull-700/60 text-ink-300 border-hull-500/40',
  danger: 'bg-critical-500/15 hover:bg-critical-500/25 text-critical-400 border-critical-500/40',
  success: 'bg-healthy-500/15 hover:bg-healthy-500/25 text-healthy-400 border-healthy-500/40',
}

const sizes: Record<string, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-1.5 text-sm',
}

export function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
