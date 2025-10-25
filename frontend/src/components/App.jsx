import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from '../Dashboard';
import Login from './Login';
import ResetPasswordManual from './ResetPasswordManual';
import PrivateRoute from './PrivateRoute';

const App = () => {
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
    </Router>
  );
};

export default App;
