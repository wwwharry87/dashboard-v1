// src/App.js
import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import DashboardContainer from "./components/DashboardContainer";

const App = () => {
  const [loginData, setLoginData] = useState(null);

  // Função para lidar com o login bem-sucedido
  const handleLogin = (data) => {
    localStorage.setItem("token", data.token); // Salva o token
    setLoginData(data); // Atualiza o estado com os dados do login
  };

  // Função para lidar com o logout
  const handleLogout = () => {
    localStorage.removeItem("token"); // Remove o token
    setLoginData(null); // Limpa os dados do login
  };

  return (
    <Router>
      <Routes>
        {/* Rota para a tela de login */}
        <Route
          path="/login"
          element={
            !loginData ? (
              <Login onLogin={handleLogin} />
            ) : (
              <Navigate to="/dashboard" />
            )
          }
        />

        {/* Rota para o dashboard */}
        <Route
          path="/dashboard"
          element={
            loginData ? (
              <DashboardContainer loginData={loginData} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        {/* Redireciona para /login por padrão */}
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
};

export default App;