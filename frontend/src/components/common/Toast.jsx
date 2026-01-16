import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

const TYPE_STYLES = {
  success:
    'border-success-200 bg-success-50 text-success-900 dark:border-success-900 dark:bg-success-950 dark:text-success-100',
  error:
    'border-danger-200 bg-danger-50 text-danger-900 dark:border-danger-900 dark:bg-danger-950 dark:text-danger-100',
  info:
    'border-primary-200 bg-primary-50 text-primary-900 dark:border-primary-900 dark:bg-primary-950 dark:text-primary-100',
};

/**
 * @typedef {'success'|'error'|'info'} ToastType
 * @typedef {{ id: string, type: ToastType, title?: string, message: string, duration?: number }} ToastItem
 */

/**
 * Toast container (viewport).
 *
 * @param {{ toasts: ToastItem[], onDismiss: (id:string) => void }} props
 */
export default function Toast({ toasts, onDismiss }) {
  return (
    <div className="fixed right-4 top-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className={cn(
              'rounded-xl border p-3 shadow-soft',
              TYPE_STYLES[t.type] || TYPE_STYLES.info
            )}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {t.title ? <div className="truncate text-sm font-semibold">{t.title}</div> : null}
                <div className="break-words text-sm opacity-90">{t.message}</div>
              </div>
              <button
                onClick={() => onDismiss(t.id)}
                className="rounded-md px-2 py-1 text-sm opacity-70 hover:opacity-100"
                aria-label="Fechar notificação"
              >
                ×
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
