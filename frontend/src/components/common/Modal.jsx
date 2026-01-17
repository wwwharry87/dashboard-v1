import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Button from './Button';

/**
 * Modal reutilizavel (Framer Motion).
 * - Backdrop com click-to-close (opcional)
 * - Header / Body / Footer
 * - ESC fecha (opcional)
 *
 * @param {{
 *  open: boolean,
 *  onClose: () => void,
 *  title?: string,
 *  children: React.ReactNode,
 *  footer?: React.ReactNode,
 *  closeOnBackdrop?: boolean,
 *  closeOnEsc?: boolean,
 *  size?: 'sm'|'md'|'lg'|'xl',
 * }} props
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  closeOnBackdrop = true,
  closeOnEsc = true,
  size = 'md',
}) {
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeOnEsc, onClose]);

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-modal="true"
          role="dialog"
        >
          {/* Backdrop */}
          <motion.button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeOnBackdrop ? onClose : undefined}
            aria-label="Fechar modal"
          />

          {/* Dialog */}
          <motion.div
            className={`relative w-full ${sizes[size] || sizes.md} overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900`}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            {/* Header */}
            {(title || onClose) ? (
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-800">
                <div className="min-w-0">
                  {title ? (
                    <h2 className="truncate text-sm font-bold text-gray-900 dark:text-slate-100">{title}</h2>
                  ) : null}
                </div>
                <Button variant="outline" size="sm" onClick={onClose}>
                  Fechar
                </Button>
              </div>
            ) : null}

            {/* Body */}
            <div className="max-h-[70vh] overflow-auto px-4 py-4">{children}</div>

            {/* Footer */}
            {footer ? (
              <div className="border-t border-gray-100 px-4 py-3 dark:border-slate-800">{footer}</div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
