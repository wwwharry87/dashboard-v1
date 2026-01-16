import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

const SIZE = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Modal reutilizável com Framer Motion.
 *
 * @example
 * const [open, setOpen] = useState(false);
 * <Modal
 *   isOpen={open}
 *   onClose={() => setOpen(false)}
 *   title="Detalhes"
 *   footer={<>
 *     <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
 *     <Button onClick={salvar}>Salvar</Button>
 *   </>}
 * >
 *   <div>Conteúdo...</div>
 * </Modal>
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  showCloseButton = true,
  className,
}) {
  const panelRef = React.useRef(null);

  React.useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };

    document.addEventListener('keydown', onKeyDown);
    // trava scroll do body
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => {
              if (closeOnBackdrop) onClose?.();
            }}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            className={cn(
              'relative w-full overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5',
              'dark:bg-slate-900 dark:ring-white/10',
              SIZE[size] || SIZE.md,
              className
            )}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onMouseDown={(e) => {
              // impede fechar ao clicar dentro do modal (backdrop usa mouseDown)
              e.stopPropagation();
            }}
          >
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="min-w-0">
                  {title ? (
                    <h2 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                      {title}
                    </h2>
                  ) : null}
                </div>

                {showCloseButton ? (
                  <button
                    type="button"
                    onClick={() => onClose?.()}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label="Fechar modal"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            )}

            <div className="max-h-[70vh] overflow-auto px-5 py-4 text-sm text-slate-700 dark:text-slate-200">
              {children}
            </div>

            {footer ? (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
