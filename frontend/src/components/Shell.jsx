import React from 'react';
export default function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="toolbar sticky top-0 z-30">
        <div className="container-pro flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-bw-gradient"></div>
            <div>
              <p className="text-sm font-semibold text-gray-900 leading-none">BW Soluções</p>
              <p className="text-xs text-gray-500">Dashboard de Matrículas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-primary">Atualizar</button>
          </div>
        </div>
      </header>
      <main className="container-pro py-6">{children}</main>
      <footer className="mt-10 pb-10">
        <div className="container-pro text-xs text-gray-500">© {new Date().getFullYear()} BW Soluções Inteligentes — Interface aprimorada.</div>
      </footer>
    </div>
  );
}