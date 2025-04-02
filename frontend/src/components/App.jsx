import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './Dashboard';
import Login from './Login';
import ResetPasswordManual from './ResetPasswordManual';

const App = () => {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  // Verificação assíncrona do token
  useEffect(() => {
    const verifyToken = async () => {
      try {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
          // Adicione aqui uma validação do token com a API se necessário
          setToken(storedToken);
        }
      } catch (error) {
        console.error("Erro na verificação do token:", error);
        localStorage.removeItem('token');
      } finally {
        setIsCheckingAuth(false);
      }
    };

    verifyToken();
  }, []);

  if (isCheckingAuth) {
    return <div className="flex justify-center items-center min-h-screen">Carregando...</div>;
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/login" 
          element={token ? <Navigate to="/dashboard" replace /> : <Login />} 
        />
        <Route path="/reset-password-manual" element={<ResetPasswordManual />} />
        <Route 
          path="/dashboard" 
          element={token ? <Dashboard /> : <Navigate to="/login" replace />} 
        />
        <Route 
          path="/" 
          element={<Navigate to={token ? "/dashboard" : "/login"} replace />} 
        />
        <Route 
          path="*" 
          element={<Navigate to={token ? "/dashboard" : "/login"} replace />} 
        />
      </Routes>
    </Router>
  );
};

export default App;