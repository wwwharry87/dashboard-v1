import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from '../Dashboard';
import Login from './Login.jsx';
import ResetPasswordManual from './ResetPasswordManual';
import PrivateRoute from './PrivateRoute';
import Toast from './common/Toast';
import { useApp } from '../context/AppContext';

const App = () => {
  const { toasts, removeToast } = useApp();

  return (
    <Router>
      <Routes>
        {/* Login e reset de senha continuam abertos */}
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password-manual" element={<ResetPasswordManual />} />
        
        {/* Rotas privadas */}
        <Route element={<PrivateRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          {/* Se quiser proteger outras rotas, coloque aqui! */}
          {/* <Route path="/minha-outra-pagina" element={<OutraPagina />} /> */}
        </Route>
        
        {/* Redirecionamento inteligente */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>

      {/* Notificacoes globais */}
      <Toast toasts={toasts} removeToast={removeToast} />
    </Router>
  );
};

export default App;
