import React, { useEffect, useState } from "react";
import axios from "axios";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  ArcElement
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import "tailwindcss/tailwind.css";
import {
  FaUserGraduate,
  FaSchool,
  FaChalkboardTeacher,
  FaSignInAlt,
  FaSignOutAlt,
  FaFilter,
  FaArrowUp,
  FaArrowDown,
  FaChartLine
} from "react-icons/fa";
import { Tooltip } from "react-tooltip";

// Registrar componentes necessários do Chart.js, incluindo o plugin de datalabels
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, ChartTooltip, Legend, ArcElement, ChartDataLabels);

const formatNumber = (num) => Number(num).toLocaleString("pt-BR");

const reorderYesNo = (options) => {
  if (!options) return [];
  const opts = [...options];
  if (opts.length === 2) {
    const lower = opts.map(o => o.toLowerCase());
    if (lower.includes("sim") && lower.includes("não")) {
      return opts.sort((a, b) => a.toLowerCase() === "sim" ? -1 : 1);
    }
  }
  return opts;
};

const FilterSelect = ({ label, name, options, disabled = false, value, onChange }) => {
  const orderedOptions = reorderYesNo(options);
  return (
    <label className="block mt-4">
      <span className="text-sm font-medium text-gray-700">{label}:</span>
      <select
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Todos</option>
        {orderedOptions?.map((option, idx) => (
          <option key={idx} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
};

const Card = ({ label, value, icon, borderColor, comparativo }) => {
  const renderComparativo = () => {
    if (!comparativo || comparativo.diff === null) return null;
    return (
      <div className="flex items-center justify-center mt-1">
        {comparativo.arrow === "up" ? (
          <FaArrowUp className="text-green-600 mr-1" />
        ) : (
          <FaArrowDown className="text-red-600 mr-1" />
        )}
        <span className={comparativo.arrow === "up" ? "text-green-600" : "text-red-600"}>
          {comparativo.diff}%
        </span>
      </div>
    );
  };

  return (
    <div className={`bg-white shadow-lg rounded-xl p-3 text-center border-l-4 ${borderColor} hover:shadow-xl transition-shadow`}>
      <div className="flex justify-center text-2xl mb-1">{icon}</div>
      <h3 className="text-md font-semibold text-gray-600">{label}</h3>
      <span className="text-xl font-bold text-gray-800">{formatNumber(value)}</span>
      {renderComparativo()}
    </div>
  );
};

const Dashboard = () => {
  const [data, setData] = useState({
    totalMatriculas: 0,
    totalEscolas: 0,
    totalVagas: 0,
    totalEntradas: 0,
    totalSaidas: 0,
    escolas: [],
    entradasSaidasPorMes: {},
    comparativos: {},
    matriculasPorZona: {},
    matriculasPorSexo: {},
    matriculasPorTurno: {},
    escolasPorZona: {},
    ultimaAtualizacao: null,
    tendenciaMatriculas: null
  });

  const [filters, setFilters] = useState({});
  const [selectedFilters, setSelectedFilters] = useState({
    anoLetivo: "",
    deficiencia: "",
    grupoEtapa: "",
    etapaMatricula: "",
    etapaTurma: "",
    multisserie: "",
    situacaoMatricula: "",
    tipoMatricula: "",
    tipoTransporte: "",
    transporteEscolar: "",
    idescola: ""
  });

  const [selectedSchool, setSelectedSchool] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      await carregarFiltros();
    };
    initialize();
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Verifica atualização do service worker para PWA
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.waiting) {
          setUpdateAvailable(true);
        }
        if (reg) {
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setUpdateAvailable(true);
                }
              });
            }
          });
        }
      });
      // Quando o novo service worker assumir, recarrega a página
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }
  }, []);

  const handleUpdate = () => {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg && reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
    });
  };

  // Verificação periódica a cada minuto para atualizar o service worker
  useEffect(() => {
    const interval = setInterval(() => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(registration => {
          if (registration) {
            registration.update();
          }
        });
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Simulação do progresso de carregamento
  useEffect(() => {
    let interval;
    if (loading) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev < 90) {
            return prev + 10;
          } else {
            clearInterval(interval);
            return prev;
          }
        });
      }, 300);
    } else {
      setProgress(100);
      const timeout = setTimeout(() => {
        setProgress(0);
      }, 500);
      return () => clearTimeout(timeout);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const carregarFiltros = async () => {
    try {
      setLoading(true);
      const response = await axios.get("https://dashboard-v1-pp6t.onrender.com/api/filtros");
      setFilters(response.data);
      const ultimoAnoLetivo = response.data.ano_letivo?.[0] || "";
      setSelectedFilters(prev => ({ ...prev, anoLetivo: ultimoAnoLetivo }));
      await carregarDados({ ...selectedFilters, anoLetivo: ultimoAnoLetivo });
    } catch (error) {
      console.error("Erro ao carregar filtros:", error);
    } finally {
      setLoading(false);
    }
  };

  const carregarDados = async (filtros) => {
    try {
      setLoading(true);
      setData(prev => ({
        ...prev,
        comparativos: null,
      }));

      const [totaisResponse, breakdownsResponse] = await Promise.all([
        axios.post("https://dashboard-v1-pp6t.onrender.com/api/totais", filtros),
        axios.post("https://dashboard-v1-pp6t.onrender.com/api/breakdowns", filtros)
      ]);

      setData(prev => ({
        ...prev,
        ...totaisResponse.data,
        ...breakdownsResponse.data
      }));
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    const updatedFilters = { ...selectedFilters, [name]: value };

    if (name === "anoLetivo") {
      updatedFilters.idescola = selectedFilters.idescola;
    }
    if (name === "grupoEtapa") {
      updatedFilters.etapaMatricula = "";
      updatedFilters.etapaTurma = "";
    }
    if (name === "etapaMatricula" && value !== "") {
      updatedFilters.etapaTurma = "";
    }
    if (name === "etapaTurma" && value !== "") {
      updatedFilters.etapaMatricula = "";
    }

    setSelectedFilters(updatedFilters);
    carregarDados(updatedFilters);
  };

  const handleSchoolClick = (escola) => {
    const updatedFilters = { ...selectedFilters };
    if (selectedSchool && selectedSchool.idescola === escola.idescola) {
      setSelectedSchool(null);
      updatedFilters.idescola = "";
    } else {
      setSelectedSchool(escola);
      updatedFilters.idescola = escola.idescola;
    }
    setSelectedFilters(updatedFilters);
    carregarDados(updatedFilters);
  };

  const handleClickOutside = (event) => {
    if (!event.target.closest("#sidebar")) {
      setShowSidebar(false);
    }
  };

  const totalVagasDisponiveis = data.escolas.reduce((total, escola) => total + Number(escola.vagas_disponiveis), 0);

  // Função auxiliar para definir a cor conforme o sexo
  const getSexoColor = (sexo) => {
    if (sexo.toLowerCase().includes("masc")) return "#0000FF";
    if (sexo.toLowerCase().includes("femi")) return "#FFC0CB";
    return "#CCCCCC";
  };

  // Paleta de cores para o gráfico de turno
  const turnoColors = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6", "#EC4899"];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      {/* Barra de atualização para PWA */}
      {updateAvailable && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-300 p-2 flex justify-between items-center z-50">
          <span className="text-gray-800 font-semibold">Nova versão disponível!</span>
          <button onClick={handleUpdate} className="bg-blue-600 text-white px-4 py-1 rounded">
            Atualizar
          </button>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="p-4 bg-white shadow-md flex justify-between items-center mt- updateAvailable ? 'mt-12' : ''">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Secretaria Municipal de Educação de Tucuruí-PA</h1>
          <h2 className="text-lg text-gray-600">- Painel de Matrículas</h2>
        </div>
        <button
          onClick={() => setShowSidebar(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md"
        >
          <FaFilter size={20} />
        </button>
      </div>

      {/* Última Atualização */}
      {data.ultimaAtualizacao && (() => {
        const updatedDate = new Date(data.ultimaAtualizacao);
        updatedDate.setHours(updatedDate.getHours() + 3);
        const day = updatedDate.getDate().toString().padStart(2, '0');
        const month = (updatedDate.getMonth() + 1).toString().padStart(2, '0');
        const year = updatedDate.getFullYear();
        const hours = updatedDate.getHours().toString().padStart(2, '0');
        const minutes = updatedDate.getMinutes().toString().padStart(2, '0');
        const seconds = updatedDate.getSeconds().toString().padStart(2, '0');
        return (
          <div className="p-2 bg-blue-100 text-center text-sm text-gray-700">
            Dados Atualizados: {`${day}/${month}/${year} às ${hours}:${minutes}:${seconds}`}
          </div>
        );
      })()}

      {/* Loader com barra de progresso */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex flex-col items-center justify-center z-50">
          <div className="w-1/3 bg-gray-300 rounded-full overflow-hidden">
            <div className="bg-blue-600 text-center py-2 text-white font-bold" style={{ width: `${progress}%` }}>
              {progress}%
            </div>
          </div>
          <p className="mt-4 text-white">Carregando dados...</p>
        </div>
      )}

      {/* Conteúdo Principal */}
      <div className="flex-1 flex flex-col p-4">
        {/* Cartões de Métricas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
          {/* Cartão Matrículas */}
          <div 
            data-tooltip-id="matriculas-tooltip"
            data-tooltip-content={`Urbana: ${data.matriculasPorZona?.["URBANA"] || 0}\nRural: ${data.matriculasPorZona?.["RURAL"] || 0}`}
          >
            <Card
              label="Matrículas"
              value={data.totalMatriculas}
              icon={<FaUserGraduate className="text-blue-500" />}
              borderColor="border-blue-500"
              comparativo={data.comparativos ? data.comparativos.totalMatriculas : null}
            />
            <Tooltip id="matriculas-tooltip" />
          </div>

          {/* Cartão Tendência */}
          <div>
            <Card
              label="Tendência"
              value={
                data.tendenciaMatriculas && !isNaN(Number(data.tendenciaMatriculas.diff))
                  ? Number(data.tendenciaMatriculas.diff).toFixed(2) + "%"
                  : "N/A"
              }
              icon={<FaChartLine className="text-indigo-500" />}
              borderColor="border-indigo-500"
              comparativo={null}
            />
          </div>

          {/* Cartão Escolas */}
          <div 
            data-tooltip-id="escolas-tooltip"
            data-tooltip-content={`Urbana: ${data.escolasPorZona?.["URBANA"] || 0}\nRural: ${data.escolasPorZona?.["RURAL"] || 0}`}
          >
            <Card
              label="Escolas"
              value={data.totalEscolas}
              icon={<FaSchool className="text-green-500" />}
              borderColor="border-green-500"
              comparativo={data.comparativos ? data.comparativos.totalEscolas : null}
            />
            <Tooltip id="escolas-tooltip" />
          </div>

          {/* Cartão Vagas */}
          <Card
            label="Vagas"
            value={totalVagasDisponiveis}
            icon={<FaChalkboardTeacher className="text-purple-500" />}
            borderColor="border-purple-500"
            comparativo={data.comparativos ? data.comparativos.totalVagas : null}
          />

          {/* Cartão Entradas */}
          <Card
            label="Entradas"
            value={data.totalEntradas}
            icon={<FaSignInAlt className="text-yellow-500" />}
            borderColor="border-yellow-500"
            comparativo={data.comparativos ? data.comparativos.totalEntradas : null}
          />

          {/* Cartão Saídas */}
          <Card
            label="Saídas"
            value={data.totalSaidas}
            icon={<FaSignOutAlt className="text-red-500" />}
            borderColor="border-red-500"
            comparativo={data.comparativos ? data.comparativos.totalSaidas : null}
          />
        </div>

        {/* Tabela de Escolas e Gráfico de Movimentação Mensal */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Tabela de Escolas com scroll vertical */}
          <div className="bg-white rounded-xl shadow-lg overflow-y-auto h-96">
            <div className="p-4 bg-gray-100 border-b">
              <h3 className="text-lg font-semibold text-gray-700">Detalhes por Escola</h3>
            </div>
            <div>
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Escola</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Turmas</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Matrículas</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Vagas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.escolas.map((escola, index) => (
                    <tr 
                      key={index}
                      onClick={() => handleSchoolClick(escola)}
                      className={`cursor-pointer hover:bg-gray-50 ${
                        selectedSchool && selectedSchool.idescola === escola.idescola
                          ? "bg-blue-100"
                          : (index % 2 === 0 ? "bg-white" : "bg-gray-50")
                      }`}
                    >
                      <td className="px-4 py-3 text-sm text-gray-700">{escola.escola}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{escola.qtde_turmas}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{escola.qtde_matriculas}</td>
                      <td className={`px-4 py-3 text-sm font-semibold ${escola.status_vagas === 'disponivel' ? 'text-green-600' : 'text-red-600'}`}>
                        {escola.vagas_disponiveis}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gráfico de Movimentação Mensal */}
          <div className="bg-white rounded-xl shadow-lg p-4 flex flex-col h-96">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Movimentação Mensal</h3>
            <div className="flex-1">
              <Bar
                data={{
                  labels: Object.keys(data.entradasSaidasPorMes),
                  datasets: [
                    {
                      label: "Entradas",
                      data: Object.values(data.entradasSaidasPorMes).map(e => e.entradas),
                      backgroundColor: "#FBBF24",
                      borderRadius: 6
                    },
                    {
                      label: "Saídas",
                      data: Object.values(data.entradasSaidasPorMes).map(e => e.saidas),
                      backgroundColor: "#EF4444",
                      borderRadius: 6
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'top', labels: { color: '#6B7280' } },
                    datalabels: {
                      display: true,
                      color: "#000",
                      anchor: 'end',
                      align: 'end',
                      formatter: (value) => value
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Gráficos de Matrículas por Sexo e por Turno (containers com altura h-90) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* Gráfico de Pizza para Matrículas por Sexo */}
          <div className="bg-white rounded-xl shadow-lg p-4 flex flex-col h-90">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Matrículas por Sexo</h3>
            <div className="flex-1">
              <Pie
                data={{
                  labels: Object.keys(data.matriculasPorSexo),
                  datasets: [
                    {
                      label: "Sexo",
                      data: Object.values(data.matriculasPorSexo),
                      backgroundColor: Object.keys(data.matriculasPorSexo).map(getSexoColor),
                      borderWidth: 0
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'bottom' },
                    datalabels: {
                      display: true,
                      color: "#fff",
                      formatter: (value) => value
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* Gráfico de Barras Horizontal para Matrículas por Turno */}
          <div className="bg-white rounded-xl shadow-lg p-4 flex flex-col h-90">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Matrículas por Turno</h3>
            <div className="flex-1">
              <Bar
                data={{
                  labels: Object.keys(data.matriculasPorTurno),
                  datasets: [
                    {
                      label: "Turno",
                      data: Object.values(data.matriculasPorTurno),
                      backgroundColor: Object.keys(data.matriculasPorTurno).map((_, index) => turnoColors[index % turnoColors.length]),
                      borderRadius: 4
                    }
                  ]
                }}
                options={{
                  indexAxis: 'y',
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    datalabels: {
                      display: true,
                      color: "#000",
                      anchor: 'end',
                      align: 'end',
                      formatter: (value) => value
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar de Filtros */}
      <div 
        id="sidebar"
        className={`fixed inset-y-0 left-0 bg-white w-64 md:w-80 p-6 shadow-2xl transform ${
          showSidebar ? "translate-x-0" : "-translate-x-full"
        } transition-transform duration-300 ease-in-out z-50`}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Filtros</h2>
          <button 
            onClick={() => setShowSidebar(false)}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <FilterSelect label="Ano Letivo" name="anoLetivo" options={filters.ano_letivo} value={selectedFilters.anoLetivo} onChange={handleFilterChange} />
          <FilterSelect label="Tipo Matrícula" name="tipoMatricula" options={filters.tipo_matricula} value={selectedFilters.tipoMatricula} onChange={handleFilterChange} />
          <FilterSelect label="Situação Matrícula" name="situacaoMatricula" options={filters.situacao_matricula} value={selectedFilters.situacaoMatricula} onChange={handleFilterChange} />
          <FilterSelect label="Grupo Etapa" name="grupoEtapa" options={filters.grupo_etapa} value={selectedFilters.grupoEtapa} onChange={handleFilterChange} />
          <FilterSelect 
            label="Etapa Matrícula" 
            name="etapaMatricula" 
            options={
              selectedFilters.grupoEtapa && filters.etapasMatriculaPorGrupo
                ? filters.etapasMatriculaPorGrupo[selectedFilters.grupoEtapa] || []
                : filters.etapa_matricula
            }
            disabled={selectedFilters.etapaTurma !== ""}
            value={selectedFilters.etapaMatricula}
            onChange={handleFilterChange}
          />
          <FilterSelect 
            label="Etapa Turma" 
            name="etapaTurma" 
            options={
              selectedFilters.grupoEtapa && filters.etapasTurmaPorGrupo
                ? filters.etapasTurmaPorGrupo[selectedFilters.grupoEtapa] || []
                : filters.etapa_turma
            }
            disabled={selectedFilters.etapaMatricula !== ""}
            value={selectedFilters.etapaTurma}
            onChange={handleFilterChange}
          />
          <FilterSelect label="Deficiência" name="deficiencia" options={filters.deficiencia} value={selectedFilters.deficiencia} onChange={handleFilterChange} />
          <FilterSelect label="Multissérie" name="multisserie" options={filters.multisserie} value={selectedFilters.multisserie} onChange={handleFilterChange} />
          <FilterSelect label="Transporte Escolar" name="transporteEscolar" options={filters.transporte_escolar} value={selectedFilters.transporteEscolar} onChange={handleFilterChange} />
          <FilterSelect label="Tipo Transporte" name="tipoTransporte" options={filters.tipo_transporte} value={selectedFilters.tipoTransporte} onChange={handleFilterChange} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
