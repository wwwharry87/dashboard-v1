import React from 'react';

const base =
  'w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus:ring-2 focus:ring-primary-500/60 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:ring-primary-400/60';

const states = {
  default: 'border-gray-300 dark:border-slate-700',
  error:
    'border-danger-500 focus:ring-danger-500/50 dark:border-danger-400 dark:focus:ring-danger-400/50',
  success:
    'border-success-500 focus:ring-success-500/50 dark:border-success-400 dark:focus:ring-success-400/50',
};

/**
 * Input reutilizavel com label, hint e validacao visual.
 *
 * @param {{
 *  id?: string,
 *  label?: string,
 *  hint?: string,
 *  error?: string,
 *  success?: string,
 *  leftIcon?: React.ReactNode,
 *  rightIcon?: React.ReactNode,
 * } & React.InputHTMLAttributes<HTMLInputElement>} props
 */
const Input = React.forwardRef(function Input(
  {
    id,
    label,
    hint,
    error,
    success,
    leftIcon,
    rightIcon,
    className = '',
    ...rest
  },
  ref
) {
  const state = error ? 'error' : success ? 'success' : 'default';
  const describedById = useAutoId(id, 'input');
  const hintId = hint ? `${describedById}__hint` : undefined;
  const errorId = error ? `${describedById}__error` : undefined;
  const successId = success ? `${describedById}__success` : undefined;

  const ariaDescribedBy = [hintId, errorId, successId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={describedById} className="mb-1 block text-xs font-semibold text-gray-700 dark:text-slate-200">
          {label}
        </label>
      ) : null}

      <div className="relative">
        {leftIcon ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400 dark:text-slate-400">
            {leftIcon}
          </span>
        ) : null}

        <input
          ref={ref}
          id={describedById}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={ariaDescribedBy}
          className={`${base} ${states[state]} ${leftIcon ? 'pl-10' : ''} ${rightIcon ? 'pr-10' : ''} ${className}`}
          {...rest}
        />

        {rightIcon ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400 dark:text-slate-400">
            {rightIcon}
          </span>
        ) : null}
      </div>

      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-gray-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="mt-1 text-xs font-semibold text-danger-600 dark:text-danger-400">
          {error}
        </p>
      ) : null}

      {!error && success ? (
        <p id={successId} className="mt-1 text-xs font-semibold text-success-600 dark:text-success-400">
          {success}
        </p>
      ) : null}
    </div>
  );
});

function useAutoId(providedId, prefix) {
  const reactId = React.useId();
  return providedId || `${prefix}-${reactId}`;
}

export default Input;
