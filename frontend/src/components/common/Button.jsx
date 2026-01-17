import React from 'react';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

const variants = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-600 dark:focus:ring-primary-500',
  secondary:
    'bg-secondary-600 text-white hover:bg-secondary-700 focus:ring-secondary-600 dark:focus:ring-secondary-500',
  danger:
    'bg-danger-600 text-white hover:bg-danger-700 focus:ring-danger-600 dark:focus:ring-danger-500',
  outline:
    'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 focus:ring-gray-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
};

const sizes = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

/**
 * Button reutilizavel.
 *
 * @param {{
 *  variant?: 'primary'|'secondary'|'danger'|'outline',
 *  size?: 'sm'|'md'|'lg',
 *  loading?: boolean,
 *  leftIcon?: React.ReactNode,
 *  rightIcon?: React.ReactNode,
 * } & React.ButtonHTMLAttributes<HTMLButtonElement>} props
 */
const Button = React.forwardRef(function Button(
  {
    className = '',
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    children,
    disabled,
    ...rest
  },
  ref
) {
  const v = variants[variant] || variants.primary;
  const s = sizes[size] || sizes.md;

  return (
    <button
      ref={ref}
      className={`${base} ${v} ${s} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          aria-hidden="true"
        />
      ) : (
        leftIcon || null
      )}
      <span className="truncate">{children}</span>
      {rightIcon || null}
    </button>
  );
});

export default Button;
