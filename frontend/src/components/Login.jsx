import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL;

// Função para aplicar a máscara de CPF
const formatCPF = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 11); // remove tudo que não é dígito e limita a 11
  if (digits.length > 9) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
  } else if (digits.length > 6) {
    return digits.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
  } else if (digits.length > 3) {
    return digits.replace(/(\d{3})(\d{0,3})/, "$1.$2");
  }
  return digits;
};

// Função para validar CPF
const isValidCPF = (cpf) => {
  cpf = cpf.replace(/[^\d]+/g, ''); // remove máscara
  if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let checkDigit1 = 11 - (sum % 11);
  if (checkDigit1 >= 10) checkDigit1 = 0;
  if (checkDigit1 !== parseInt(cpf.charAt(9))) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  let checkDigit2 = 11 - (sum % 11);
  if (checkDigit2 >= 10) checkDigit2 = 0;
  return checkDigit2 === parseInt(cpf.charAt(10));
};

const Login = () => {
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  }, []);

  const handleCpfChange = (e) => {
    const formattedValue = formatCPF(e.target.value);
    setCpf(formattedValue);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErro('');
    // Remove máscara para validação e envio
    const rawCpf = cpf.replace(/\D/g, '');
    if (rawCpf.length !== 11) {
      setErro("CPF deve ter 11 dígitos.");
      return;
    }
    if (!isValidCPF(cpf)) {
      setErro("CPF inválido.");
      return;
    }
    try {
      const response = await axios.post(`${API_URL}/login`, { cpf: rawCpf, password });
      const { token } = response.data;
      if (!token) {
        throw new Error('Token não retornado');
      }
      localStorage.setItem('token', token);
      window.location.replace('/dashboard');
    } catch (err) {
      console.error("Erro no login:", err.response || err);
      setErro(err.response?.data?.message || 'Credenciais inválidas. Verifique e tente novamente.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-center">Login</h2>
        {erro && <p className="mb-4 text-red-500 text-center">{erro}</p>}
        <div className="mb-4">
          <label htmlFor="cpf" className="block mb-1 font-medium text-gray-700">CPF:</label>
          <input
            id="cpf"
            type="text"
            value={cpf}
            onChange={handleCpfChange}
            className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500"
            placeholder="Digite seu CPF"
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="password" className="block mb-1 font-medium text-gray-700">Senha:</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500"
            placeholder="Digite sua senha"
            required
          />
        </div>
        <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition-colors">
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
