// src/components/DashboardContainer.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // Importe o useNavigate para redirecionar
import Dashboard from "./Dashboard";

const DashboardContainer = ({ loginData, onLogout }) => {
  const navigate = useNavigate(); // Hook para redirecionamento
  const [clientes, setClientes] = useState([]);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);

  // Verifica se loginData está disponível antes de acessar suas propriedades
  useEffect(() => {
    if (loginData) {
      setClientes(loginData.clientes || []);
      setSelectedCliente(loginData.selectedCliente || null);
    }
  }, [loginData]);

  // Função para carregar os dados do cliente selecionado
  const carregarDados = async (clienteId) => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("https://dashboard-v1-pp6t.onrender.com/api/totais", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ idcliente: clienteId }),
      });
      const data = await response.json();
      setDados(data);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  // Carrega os dados quando o cliente selecionado muda
  useEffect(() => {
    if (selectedCliente) {
      carregarDados(selectedCliente.idcliente);
    }
  }, [selectedCliente]);

  // Função para lidar com a mudança de cliente
  const handleChangeCliente = (e) => {
    const novoIdCliente = parseInt(e.target.value, 10);
    const novoCliente = clientes.find((c) => c.idcliente === novoIdCliente);
    setSelectedCliente(novoCliente);
  };

  // Função para redirecionar para a tela de login
  const handleBackToLogin = () => {
    localStorage.removeItem("token"); // Remove o token do localStorage
    navigate("/login"); // Redireciona para a tela de login
  };

  // Se loginData for null, exibe uma mensagem de erro e um botão para voltar ao login
  if (!loginData) {
    return (
      <div className="p-6 bg-gray-100 min-h-screen flex flex-col items-center justify-center">
        <p className="text-red-600 mb-4">Erro: Dados de login não disponíveis.</p>
        <button
          onClick={handleBackToLogin}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
        >
          Voltar ao Login
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      {/* Cabeçalho */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <button
          onClick={onLogout}
          className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
        >
          Logout
        </button>
      </div>

      {/* Seleção de Cliente */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Selecione o Cliente:
        </label>
        <select
          value={selectedCliente ? selectedCliente.idcliente : ""}
          onChange={handleChangeCliente}
          className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="" disabled>
            Selecione um cliente
          </option>
          {clientes.map((cliente) => (
            <option key={cliente.idcliente} value={cliente.idcliente}>
              {cliente.cliente}
            </option>
          ))}
        </select>
      </div>

      {/* Conteúdo do Dashboard */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-600">Carregando dados...</p>
        </div>
      ) : dados ? (
        <Dashboard data={dados} />
      ) : (
        <p className="text-center text-gray-600">Nenhum dado disponível.</p>
      )}
    </div>
  );
};

export default DashboardContainer;