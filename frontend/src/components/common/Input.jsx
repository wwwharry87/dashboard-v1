import React from 'react';

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Input reutilizável com acessibilidade e estados de validação.
 *
 * Props principais:
 * - label: string
 * - error: string | boolean (exibe vermelho)
 * - success: string | boolean (exibe verde)
 * - helperText: string (texto auxiliar)
 *
 * @example
 * <Input label="CPF" value={cpf} onChange={e => setCpf(e.target.value)} error={...} />
 */
const Input = React.memo(
  React.forwardRef(function Input(
    {
      id,
      label,
      helperText,
      error,
      success,
      className,
      inputClassName,
      required,
      leftAddon,
      rightAddon,
      ...rest
    },
    ref
  ) {
    const autoId = React.useId();
    const inputId = id || `input-${autoId}`;
    const describedById = `${inputId}-desc`;

    const hasError = Boolean(error);
    const hasSuccess = Boolean(success) && !hasError;

    return (
      <div className={cn('w-full', className)}>
        {label ? (
          <label
            htmlFor={inputId}
            className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            {label}
            {required ? <span className="text-danger-600"> *</span> : null}
          </label>
        ) : null}

        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border bg-white px-3 py-2 transition',
            'dark:bg-slate-900',
            hasError
              ? 'border-danger-400 focus-within:ring-2 focus-within:ring-danger-200 dark:border-danger-600 dark:focus-within:ring-danger-900'
              : hasSuccess
                ? 'border-success-400 focus-within:ring-2 focus-within:ring-success-200 dark:border-success-600 dark:focus-within:ring-success-900'
                : 'border-slate-300 focus-within:ring-2 focus-within:ring-primary-200 dark:border-slate-700 dark:focus-within:ring-primary-900'
          )
        >
          {leftAddon ? <div className="text-slate-500 dark:text-slate-400">{leftAddon}</div> : null}

          <input
            ref={ref}
            id={inputId}
            aria-invalid={hasError ? 'true' : 'false'}
            aria-describedby={helperText || error || success ? describedById : undefined}
            className={cn(
              'w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400',
              'dark:text-slate-100 dark:placeholder:text-slate-500',
              inputClassName
            )}
            {...rest}
          />

          {rightAddon ? <div className="text-slate-500 dark:text-slate-400">{rightAddon}</div> : null}
        </div>

        {helperText || error || success ? (
          <p
            id={describedById}
            className={cn(
              'mt-1 text-xs',
              hasError
                ? 'text-danger-600 dark:text-danger-400'
                : hasSuccess
                  ? 'text-success-700 dark:text-success-400'
                  : 'text-slate-500 dark:text-slate-400'
            )}
          >
            {typeof error === 'string'
              ? error
              : typeof success === 'string'
                ? success
                : helperText}
          </p>
        ) : null}
      </div>
    );
  })
);

export default Input;
