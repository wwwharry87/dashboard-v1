import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaSync, FaTimes, FaCheckCircle } from 'react-icons/fa';

/**
 * Componente que notifica o usuário quando há atualizações disponíveis
 * Aparece como um banner no topo com opções de atualizar ou descartar
 */
export const UpdateNotification = ({
  isVisible,
  onUpdate,
  onDismiss,
  isUpdating = false,
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 text-white px-4 py-4 shadow-lg"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            {/* Conteúdo da notificação */}
            <div className="flex items-center gap-3 flex-1">
              <motion.div
                animate={{ rotate: isUpdating ? 360 : 0 }}
                transition={{ duration: isUpdating ? 2 : 0, repeat: isUpdating ? Infinity : 0, ease: 'linear' }}
              >
                <FaSync className="text-xl" />
              </motion.div>
              <div className="flex-1">
                <p className="font-semibold text-base">
                  {isUpdating ? 'Atualizando dados...' : 'Novos dados disponíveis!'}
                </p>
                <p className="text-sm text-blue-100">
                  {isUpdating
                    ? 'Sincronizando com o servidor...'
                    : 'Há atualizações no banco de dados. Clique em atualizar para carregar os dados mais recentes.'}
                </p>
              </div>
            </div>

            {/* Botões de ação */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {!isUpdating && (
                <>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onUpdate}
                    disabled={isUpdating}
                    className="bg-white text-blue-600 px-4 py-2 rounded-lg font-semibold hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <FaCheckCircle className="text-sm" />
                    Atualizar
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onDismiss}
                    className="text-blue-100 hover:text-white hover:bg-blue-500/30 px-3 py-2 rounded-lg transition-colors"
                  >
                    <FaTimes className="text-lg" />
                  </motion.button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * Variante compacta para mobile
 */
export const UpdateNotificationCompact = ({
  isVisible,
  onUpdate,
  onDismiss,
  isUpdating = false,
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-4 right-4 z-40 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl shadow-xl p-4 max-w-xs"
        >
          <div className="flex items-start gap-3">
            <motion.div
              animate={{ rotate: isUpdating ? 360 : 0 }}
              transition={{ duration: isUpdating ? 2 : 0, repeat: isUpdating ? Infinity : 0, ease: 'linear' }}
              className="flex-shrink-0 mt-1"
            >
              <FaSync className="text-lg" />
            </motion.div>

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">
                {isUpdating ? 'Atualizando...' : 'Novos dados!'}
              </p>
              <p className="text-xs text-blue-100 mt-1">
                {isUpdating
                  ? 'Sincronizando com o servidor...'
                  : 'Há atualizações disponíveis no banco de dados.'}
              </p>

              {!isUpdating && (
                <div className="flex gap-2 mt-3">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onUpdate}
                    className="bg-white text-blue-600 px-3 py-1 rounded text-xs font-semibold hover:bg-blue-50 transition-colors"
                  >
                    Atualizar
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onDismiss}
                    className="text-blue-100 hover:text-white text-xs font-semibold"
                  >
                    Descartar
                  </motion.button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default UpdateNotification;
