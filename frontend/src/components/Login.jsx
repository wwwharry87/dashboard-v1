import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL;

const Login = ({ onLoginSuccess }) => {
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    // Remove token antigo ao carregar a página de login
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await axios.post(`${API_URL}/login`, { cpf, password });
      console.log("Login response:", response.data); // Debug: veja o que vem na resposta
      const { token } = response.data;
      if (!token) {
        // Se não houver token, trata como erro
        throw new Error('Token não retornado');
      }
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      onLoginSuccess();
    } catch (err) {
      console.error("Erro no login:", err.response || err);
      setErro('Credenciais inválidas. Verifique e tente novamente.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Login</h2>
        {erro && <p className="mb-4 text-red-500">{erro}</p>}
        <div className="mb-4">
          <label htmlFor="cpf" className="block mb-1">CPF:</label>
          <input
            id="cpf"
            type="text"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            className="border p-2 rounded w-full"
            placeholder="Digite seu CPF"
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="password" className="block mb-1">Senha:</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border p-2 rounded w-full"
            placeholder="Digite sua senha"
            required
          />
        </div>
        <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600">
          Entrar
        </button>
        <div className="mt-4 text-center">
          <Link to="/reset-password-manual" className="text-blue-500 hover:underline">
            Esqueci minha senha
          </Link>
        </div>
      </form>
    </div>
  );
};

export default Login;
