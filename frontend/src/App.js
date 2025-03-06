// src/App.js
import React, { useState, useEffect } from "react";
import Login from "./components/Login";
import DashboardContainer from "./components/DashboardContainer";

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginData, setLoginData] = useState(null);

  // Verifica se o usuário já está autenticado (por exemplo, se há um token no localStorage)
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  // Função para lidar com o login bem-sucedido
  const handleLogin = (data) => {
    localStorage.setItem("token", data.token); // Salva o token no localStorage
    setLoginData(data); // Salva os dados do login
    setIsAuthenticated(true); // Define o usuário como autenticado
  };

  // Função para lidar com o logout
  const handleLogout = () => {
    localStorage.removeItem("token"); // Remove o token do localStorage
    setIsAuthenticated(false); // Define o usuário como não autenticado
    setLoginData(null); // Limpa os dados do login
  };

  return (
    <div>
      {!isAuthenticated ? (
        // Exibe a tela de login se o usuário não estiver autenticado
        <Login onLogin={handleLogin} />
      ) : (
        // Exibe o dashboard se o usuário estiver autenticado
        <DashboardContainer loginData={loginData} onLogout={handleLogout} />
      )}
    </div>
  );
};

export default App;