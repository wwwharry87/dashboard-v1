import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { clearAllCache } from '../serviceWorkerRegistration';

const API_URL = process.env.REACT_APP_API_URL;

const formatCPF = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length > 9) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
  else if (digits.length > 6) return digits.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
  else if (digits.length > 3) return digits.replace(/(\d{3})(\d{0,3})/, "$1.$2");
  return digits;
};

const isValidCPF = (cpf) => {
  cpf = cpf.replace(/[^\d]+/g, '');
  if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i)) * (10 - i);
  let checkDigit1 = 11 - (sum % 11);
  if (checkDigit1 >= 10) checkDigit1 = 0;
  if (checkDigit1 !== parseInt(cpf.charAt(9))) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i)) * (11 - i);
  let checkDigit2 = 11 - (sum % 11);
  if (checkDigit2 >= 10) checkDigit2 = 0;
  return checkDigit2 === parseInt(cpf.charAt(10));
};

const Toast = ({ message, show, type = "info" }) => (
  show ? (
    <div
      key={type}
      className={`
        fixed top-5 left-1/2 transform -translate-x-1/2
        px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 animate-slide-in
        ${type === "success" ? "bg-green-600 text-white" : ""}
        ${type === "error" ? "bg-red-600 text-white" : ""}
        ${type === "info" ? "bg-blue-600 text-white" : ""}
      `}
    >
      <span role="img" aria-label="icon">{type === "success" ? "🎉" : type === "error" ? "❌" : "🔔"}</span>
      {message}
      <style>
        {`
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(-20px) scale(0.95);}
          to { opacity: 1; transform: translateY(0) scale(1);}
        }
        .animate-slide-in {
          animation: slide-in 0.5s cubic-bezier(.44,1.38,.64,1) forwards;
        }
        `}
      </style>
    </div>
  ) : null
);

const Login = () => {
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const navigate = useNavigate();

  useEffect(() => {
    // Limpa o token ao carregar a página de login
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    
    // Limpa todo o cache de dados ao sair/deslogar
    // Isso garante que os dados serão recarregados no próximo login
    try {
      // Limpar cache do localStorage
      const keys = Object.keys(localStorage);
      keys.forEach(k => {
        if (k.startsWith('cache_') || k === 'cachedData' || k === 'selectedFilters' || k === 'selectedSchool' || k === 'activeTab') {
          localStorage.removeItem(k);
        }
      });
      
      // Limpar cache do Service Worker
      if (typeof clearAllCache === 'function') {
        clearAllCache();
      }
      
      console.log('[Login] Cache limpo com sucesso');
    } catch (error) {
      console.warn('[Login] Erro ao limpar cache:', error);
    }
  }, []);

  const handleCpfChange = (e) => setCpf(formatCPF(e.target.value));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErro('');
    setLoading(true);

    const rawCpf = cpf.replace(/\D/g, '');
    if (rawCpf.length !== 11) {
      setErro("CPF deve ter 11 dígitos.");
      setLoading(false);
      return;
    }
    if (!isValidCPF(cpf)) {
      setErro("CPF inválido.");
      setLoading(false);
      return;
    }

    setToast({ show: true, message: 'Validando usuário, aguarde...', type: 'info' });

    try {
      const response = await axios.post(`${API_URL}/login`, { cpf: rawCpf, password });
      const { token, nome } = response.data;
      if (!token) throw new Error('Token não retornado');

      // Armazena o token e configura o header de autorização
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      setToast({ show: true, message: 'Login realizado com sucesso! Bem-vindo(a)!', type: 'success' });

      // Redireciona após um pequeno delay para garantir que o token foi armazenado
      setTimeout(() => {
        // Força uma recarga completa para garantir que o Dashboard pegue o token
        window.location.href = '/dashboard';
      }, 1000);

    } catch (err) {
      setToast({ show: true, message: err.response?.data?.error || 'Credenciais inválidas. Verifique e tente novamente.', type: 'error' });
      setErro(err.response?.data?.error || 'Credenciais inválidas. Verifique e tente novamente.');
      setTimeout(() => setToast({ show: false, message: '', type: 'error' }), 1800);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md relative">
        <h2 className="text-3xl font-bold mb-6 text-center text-blue-600">Bem-vindo 👋</h2>
        {erro && <p key="erro-msg" className="mb-4 text-red-500 text-center">{erro}</p>}
        <div className="mb-5">
          <label htmlFor="cpf" className="block mb-1 font-semibold text-gray-700">CPF:</label>
          <input
            id="cpf"
            type="text"
            value={cpf}
            onChange={handleCpfChange}
            className="border p-3 rounded-xl w-full focus:ring-2 focus:ring-blue-500 transition"
            placeholder="Digite seu CPF"
            required
            disabled={loading}
          />
        </div>
        <div className="mb-6">
          <label htmlFor="password" className="block mb-1 font-semibold text-gray-700">Senha:</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="border p-3 rounded-xl w-full focus:ring-2 focus:ring-blue-500 transition"
            placeholder="Digite sua senha"
            required
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          className={`w-full p-3 rounded-xl font-semibold bg-blue-600 text-white transition-colors hover:bg-blue-700 flex justify-center items-center gap-2 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
          disabled={loading}
        >
          {loading && (
            <svg className="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
            </svg>
          )}
          {loading ? 'Validando usuário...' : 'Entrar'}
        </button>
        <div className="mt-5 text-center">
          <Link to="/reset-password-manual" className="text-blue-500 hover:underline text-sm">
            Esqueci minha senha
          </Link>
        </div>
        <Toast message={toast.message} show={toast.show} type={toast.type} />
      </form>
    </div>
  );
};

export default Login;