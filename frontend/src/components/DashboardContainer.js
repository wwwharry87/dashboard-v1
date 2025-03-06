// src/components/DashboardContainer.js
import React, { useState, useEffect } from "react";
import Dashboard from "./Dashboard";

const DashboardContainer = ({ loginData, onLogout }) => {
  const [clientes, setClientes] = useState([]);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [dados, setDados] = useState(null);

  useEffect(() => {
    setClientes(loginData.clientes);
    setSelectedCliente(loginData.selectedCliente);
  }, [loginData]);

  const carregarDados = async (clienteId) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/totais", {
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
    }
  };

  useEffect(() => {
    if (selectedCliente) {
      carregarDados(selectedCliente.idcliente);
    }
  }, [selectedCliente]);

  const handleChangeCliente = (e) => {
    const novoIdCliente = parseInt(e.target.value, 10);
    const novoCliente = clientes.find((c) => c.idcliente === novoIdCliente);
    setSelectedCliente(novoCliente);
  };

  return (
    <div>
      <h1>Dashboard</h1>
      <button onClick={onLogout} style={{ float: "right" }}>
        Logout
      </button>
      <div>
        <label>Selecione o Cliente: </label>
        <select
          value={selectedCliente ? selectedCliente.idcliente : ""}
          onChange={handleChangeCliente}
        >
          {clientes.map((cliente) => (
            <option key={cliente.idcliente} value={cliente.idcliente}>
              {cliente.cliente}
            </option>
          ))}
        </select>
      </div>
      {dados ? (
        <Dashboard data={dados} />
      ) : (
        <p>Carregando dados...</p>
      )}
    </div>
  );
};

export default DashboardContainer;