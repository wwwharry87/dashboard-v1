import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Toast container.
 *
 * @param {{
 *  toasts: Array<{ id: string, type: 'success'|'error'|'info', title?: string, message: string, durationMs?: number }>,
 *  removeToast: (id: string) => void,
 *  position?: 'top-right'|'top-left'|'bottom-right'|'bottom-left',
 * }} props
 */
export default function Toast({ toasts, removeToast, position = 'top-right' }) {
  const posClass = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  }[position] || 'top-4 right-4';

  return (
    <div className={`pointer-events-none fixed z-[60] ${posClass} w-[min(92vw,360px)] space-y-2`}>
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast, onClose }) {
  const { type, title, message, durationMs = 3500 } = toast;

  useEffect(() => {
    const t = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(t);
  }, [onClose, durationMs]);

  const styles = {
    success: 'border-success-500 bg-success-50 text-success-900 dark:border-success-500/60 dark:bg-success-500/10 dark:text-success-100',
    error: 'border-danger-500 bg-danger-50 text-danger-900 dark:border-danger-500/60 dark:bg-danger-500/10 dark:text-danger-100',
    info: 'border-primary-500 bg-primary-50 text-primary-900 dark:border-primary-500/60 dark:bg-primary-500/10 dark:text-primary-100',
  }[type] || 'border-gray-300 bg-white text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

  return (
    <motion.div
      className={`pointer-events-auto rounded-xl border p-3 shadow-lg ${styles}`}
      initial={{ opacity: 0, x: 24, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {title ? (
            <div className="text-sm font-bold leading-tight">{title}</div>
          ) : null}
          <div className="text-sm leading-snug opacity-90">{message}</div>
        </div>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs font-bold opacity-70 hover:opacity-100"
          onClick={onClose}
          aria-label="Fechar notificação"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}
