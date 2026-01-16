import React from 'react';

/**
 * Junta classes Tailwind evitando valores falsy.
 * @param  {...(string|undefined|null|false)} classes
 */
function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

const VARIANT_CLASSES = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 dark:bg-primary-500 dark:hover:bg-primary-400 dark:active:bg-primary-600',
  secondary:
    'bg-secondary-600 text-white hover:bg-secondary-700 active:bg-secondary-800 dark:bg-secondary-500 dark:hover:bg-secondary-400 dark:active:bg-secondary-600',
  danger:
    'bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-800 dark:bg-danger-500 dark:hover:bg-danger-400 dark:active:bg-danger-600',
  outline:
    'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
};

const SIZE_CLASSES = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

/**
 * Button reutilizável.
 *
 * @example
 * <Button variant="primary" size="md" onClick={...}>Salvar</Button>
 * <Button variant="outline" size="sm">Cancelar</Button>
 */
const Button = React.memo(
  React.forwardRef(function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      className,
      leftIcon,
      rightIcon,
      children,
      type = 'button',
      ...rest
    },
    ref
  ) {
    const isDisabled = Boolean(disabled || loading);

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition',
          'focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 dark:focus:ring-primary-800 dark:focus:ring-offset-slate-900',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          SIZE_CLASSES[size] || SIZE_CLASSES.md,
          VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary,
          className
        )}
        {...rest}
      >
        {leftIcon ? <span className="shrink-0">{leftIcon}</span> : null}
        <span className={cn(loading ? 'opacity-80' : '')}>{children}</span>
        {loading ? (
          <span
            className="ml-1 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            aria-label="Carregando"
          />
        ) : null}
        {rightIcon ? <span className="shrink-0">{rightIcon}</span> : null}
      </button>
    );
  })
);

export default Button;
