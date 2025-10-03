// src/components/ResetPasswordManual.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL; // Certifique-se que está definido como: https://dashboard-v1-pp6t.onrender.com/api

const ResetPasswordManual = () => {
  const [cpf, setCpf] = useState('');
  const [nome, setNome] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [telefone, setTelefone] = useState('');
  const [idcliente, setIdcliente] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [erro, setErro] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setErro('');
    
    if (newPassword !== confirmPassword) {
      setErro('As senhas não conferem.');
      return;
    }
    
    try {
      // Usando axios diretamente para não enviar token no header
      const response = await axios.post(`${API_URL}/reset-password-manual`, {
        cpf,
        nome,
        data_nascimento: dataNascimento, // formato "YYYY-MM-DD"
        telefone,
        idcliente,
        newPassword,
      });
      setMessage(response.data.message);
      // Limpa os campos
      setCpf('');
      setNome('');
      setDataNascimento('');
      setTelefone('');
      setIdcliente('');
      setNewPassword('');
      setConfirmPassword('');
      // Redireciona para a tela de login após 2 segundos
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (error) {
      console.error("Erro ao redefinir senha:", error.response || error);
      setErro(error.response?.data?.error || 'Erro ao redefinir senha.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Redefinir Senha</h2>
        {message && <p className="mb-4 text-green-500">{message}</p>}
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
          <label htmlFor="nome" className="block mb-1">Nome:</label>
          <input
            id="nome"
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="border p-2 rounded w-full"
            placeholder="Digite seu nome"
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="dataNascimento" className="block mb-1">Data de Nascimento:</label>
          <input
            id="dataNascimento"
            type="date"
            value={dataNascimento}
            onChange={(e) => setDataNascimento(e.target.value)}
            className="border p-2 rounded w-full"
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="telefone" className="block mb-1">Telefone:</label>
          <input
            id="telefone"
            type="text"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            className="border p-2 rounded w-full"
            placeholder="Digite seu telefone"
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="idcliente" className="block mb-1">ID do Cliente:</label>
          <input
            id="idcliente"
            type="text"
            value={idcliente}
            onChange={(e) => setIdcliente(e.target.value)}
            className="border p-2 rounded w-full"
            placeholder="Digite o ID do Cliente"
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="newPassword" className="block mb-1">Nova Senha:</label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="border p-2 rounded w-full"
            placeholder="Digite sua nova senha"
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="confirmPassword" className="block mb-1">Confirmar Nova Senha:</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="border p-2 rounded w-full"
            placeholder="Confirme sua nova senha"
            required
          />
        </div>
        <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600">
          Redefinir Senha
        </button>
      </form>
    </div>
  );
};

export default ResetPasswordManual;
