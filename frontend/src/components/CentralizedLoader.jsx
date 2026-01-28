import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaSync } from 'react-icons/fa';

/**
 * Componente de loader centralizado na tela
 * Aparece no centro e no meio da tela com melhor visibilidade
 */
export const CentralizedLoader = ({ isLoading, message = 'Carregando dados...' }) => {
  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4"
          >
            {/* Spinner animado */}
            <div className="relative w-16 h-16">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0"
              >
                <svg
                  className="w-full h-full text-violet-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8z"
                  ></path>
                </svg>
              </motion.div>

              {/* Ícone de sincronização no centro */}
              <div className="absolute inset-0 flex items-center justify-center">
                <FaSync className="text-violet-600 text-lg animate-pulse" />
              </div>
            </div>

            {/* Mensagem */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-center"
            >
              <p className="text-lg font-semibold text-gray-800">{message}</p>
              <p className="text-sm text-gray-500 mt-2">Por favor, aguarde...</p>
            </motion.div>

            {/* Barra de progresso animada */}
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-48 h-1 bg-gradient-to-r from-violet-400 to-purple-600 rounded-full"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * Loader compacto para atualizações (topo da tela)
 */
export const CompactLoader = ({ isLoading, message = 'Atualizando...' }) => {
  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-gradient-to-r from-violet-500 to-purple-600 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3"
        >
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
            <FaSync className="text-lg" />
          </motion.div>
          <span className="font-semibold">{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CentralizedLoader;
