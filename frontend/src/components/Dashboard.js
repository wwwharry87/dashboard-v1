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
  FaBalanceScale,
  FaSearch
} from "react-icons/fa";
import { Tooltip } from "react-tooltip";
import { isMobile, isTablet, isDesktop, isIOS, isAndroid } from 'react-device-detect';

// Registrar componentes do Chart.js, incluindo datalabels
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  ChartTooltip,
  Legend,
  ArcElement,
  ChartDataLabels
);

// Função para formatar números com separador de milhar (ex.: 4417 => "4.417")
const formatNumber = (num) => Number(num).toLocaleString("pt-BR");

// Função auxiliar para reordenar opções "sim"/"não"
const reorderYesNo = (options) => {
  if (!options) return [];
  const opts = options.map(o => String(o));
  if (opts.length === 2) {
    const lower = opts.map(o => o.toLowerCase());
    if (lower.includes("sim") && lower.includes("não")) {
      return opts.sort((a, b) => a.toLowerCase() === "sim" ? -1 : 1);
    }
  }
  return opts;
};

// Função auxiliar para obter a cor do ícone a partir da classe de borda
const getIconColorFromBorder = (borderClass) => {
  const mapping = {
    "border-blue-500": "#3B82F6",
    "border-green-500": "#10B981",
    "border-purple-500": "#8B5CF6",
    "border-yellow-500": "#FBBF24",
    "border-red-500": "#EF4444",
    "border-black": "#000000"
  };
  return mapping[borderClass] || "#000000";
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

const Card = ({ label, value, icon, borderColor, comparativo, disableFormat, valueColor = "" }) => {
  const iconWithColor = React.cloneElement(icon, { style: { color: getIconColorFromBorder(borderColor) } });
  
  const renderComparativo = () => {
    if (comparativo && comparativo.diff != null) {
      return (
        <div className="flex items-center justify-center mt-1">
          {comparativo.arrow === "up" ? (
            <FaArrowUp className="mr-1" style={{ color: "green" }} />
          ) : (
            <FaArrowDown className="mr-1" style={{ color: "red" }} />
          )}
          <span style={{ color: comparativo.arrow === "up" ? "green" : "red", fontSize: "0.8rem" }}>
            {comparativo.diff}%
          </span>
        </div>
      );
    }
    return null;
  };

  return (
    <div 
      className={`
        shadow-lg rounded-xl 
        p-3 text-center border-l-4 ${borderColor}
        hover:shadow-xl transition-shadow 
        h-28 flex flex-col items-center justify-center
      `}
    >
      <div className="text-2xl mb-1">
        {iconWithColor}
      </div>
      <h3 className="text-md font-semibold text-gray-600">{label}</h3>
      <span className="text-xl font-bold text-gray-800 max-[430px]:text-sm" style={{ color: valueColor }}>
        {disableFormat ? value : formatNumber(value)}
      </span>
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
  const [tableGraphHeight, setTableGraphHeight] = useState("h-96");
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showMonthlyLabels, setShowMonthlyLabels] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      await carregarFiltros();
    };
    initialize();
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const carregarFiltros = async () => {
    try {
      setLoading(true);
      const response = await axios.get("https://dashboard-v1-pp6t.onrender.com/api/filtros");
      setFilters(response.data);
      const ultimoAnoLetivo = response.data.ano_letivo?.[0] || "";
      setSelectedFilters((prev) => ({ ...prev, anoLetivo: ultimoAnoLetivo }));
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
      setData((prev) => ({ ...prev, comparativos: null }));
      const [totaisResponse, breakdownsResponse] = await Promise.all([
        axios.post("https://dashboard-v1-pp6t.onrender.com/api/totais", filtros),
        axios.post("https://dashboard-v1-pp6t.onrender.com/api/breakdowns", filtros)
      ]);
      setData((prev) => ({
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

  useEffect(() => {
    let interval;
    if (loading) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(prev => (prev < 95 ? prev + 5 : prev));
      }, 300);
    } else {
      setProgress(100);
      const timeout = setTimeout(() => setProgress(0), 500);
      return () => clearTimeout(timeout);
    }
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    const handleResize = () => {
      setTableGraphHeight(
        window.innerWidth <= 1180 && window.innerHeight <= 820 ? "h-64" : "h-96"
      );
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  let trendValue = "N/A";
  let trendValueColor = "";
  if (data.tendenciaMatriculas) {
    const { missing, percent } = data.tendenciaMatriculas;
    if (missing === 0) {
      trendValue = "0 (0%)";
    } else {
      const sign = missing > 0 ? "-" : "+";
      trendValue = `${formatNumber(Math.abs(missing))} (${sign}${percent}%)`;
      trendValueColor = missing > 0 ? "red" : "green";
    }
  }

  return (
    <div className={`${isMobile ? "min-h-screen" : "h-screen"} w-screen flex flex-col bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50`}>
      {updateAvailable && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-300 p-2 flex justify-between items-center z-50">
          <span className="text-gray-800 font-semibold">Nova versão disponível!</span>
          <button onClick={() => window.location.reload()} className="bg-blue-600 text-white px-4 py-1 rounded">
            Atualizar
          </button>
        </div>
      )}
      <div className="p-4 bg-white shadow-md flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            SEMED Marabá-PA
          </h1>
          <h2 className="text-lg text-gray-600">- Painel de Matrículas</h2>
        </div>
        <button
          onClick={() => setShowSidebar(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md"
        >
          <FaFilter size={20} />
        </button>
      </div>
      {data.ultimaAtualizacao && (() => {
        const updatedDate = new Date(data.ultimaAtualizacao);
        updatedDate.setHours(updatedDate.getHours() + 3);
        const day = updatedDate.getDate().toString().padStart(2, "0");
        const month = (updatedDate.getMonth() + 1).toString().padStart(2, "0");
        const year = updatedDate.getFullYear();
        const hours = updatedDate.getHours().toString().padStart(2, "0");
        const minutes = updatedDate.getMinutes().toString().padStart(2, "0");
        const seconds = updatedDate.getSeconds().toString().padStart(2, "0");
        return (
          <div className="p-2 bg-blue-100 text-center text-sm text-gray-700">
            Dados atualizados: {`${day}/${month}/${year} às ${hours}:${minutes}:${seconds}`}
          </div>
        );
      })()}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex flex-col items-center justify-center z-50">
          <div className="w-1/3 bg-gray-300 rounded-full overflow-hidden">
            <div className="bg-blue-600 text-center py-2 text-white font-bold" style={{ width: `${progress}%` }}>
              {progress}%
            </div>
          </div>
          <p className="mt-4 text-white">
            {updateAvailable ? "Atualizando versão..." : "Carregando dados..."}
          </p>
        </div>
      )}
      {/* Grid de Cartões */}
      <div className="grid grid-cols-2 min-[461px]:grid-cols-3 min-[720px]:grid-cols-6 gap-3 mb-4 px-4 pt-4">
        <div
          data-tooltip-id="matriculas-tooltip"
          data-tooltip-content={`Urbana: ${data.matriculasPorZona?.["URBANA"] || 0}\nRural: ${data.matriculasPorZona?.["RURAL"] || 0}`}
        >
          <Card
            label="Matrículas"
            value={data.totalMatriculas}
            icon={<FaUserGraduate />}
            borderColor="border-blue-500"
            comparativo={data.comparativos ? data.comparativos.totalMatriculas : null}
          />
          <Tooltip id="matriculas-tooltip" />
        </div>
        <div>
          <Card
            label="Comparativo"
            value={trendValue}
            icon={<FaBalanceScale />}
            borderColor="border-black"
            comparativo={null}
            disableFormat
            valueColor={trendValueColor}
          />
        </div>
        <div
          data-tooltip-id="escolas-tooltip"
          data-tooltip-content={`Urbana: ${data.escolasPorZona?.["URBANA"] || 0}\nRural: ${data.escolasPorZona?.["RURAL"] || 0}`}
        >
          <Card
            label="Escolas"
            value={data.totalEscolas}
            icon={<FaSchool />}
            borderColor="border-green-500"
            comparativo={data.comparativos ? data.comparativos.totalEscolas : null}
          />
          <Tooltip id="escolas-tooltip" />
        </div>
        <Card
          label="Vagas"
          value={data.totalVagas}
          icon={<FaChalkboardTeacher />}
          borderColor="border-purple-500"
          comparativo={data.comparativos ? data.comparativos.totalVagas : null}
        />
        <Card
          label="Entradas"
          value={data.totalEntradas}
          icon={<FaSignInAlt />}
          borderColor="border-yellow-500"
          comparativo={data.comparativos ? data.comparativos.totalEntradas : null}
        />
        <Card
          label="Saídas"
          value={data.totalSaidas}
          icon={<FaSignOutAlt />}
          borderColor="border-red-500"
          comparativo={data.comparativos ? data.comparativos.totalSaidas : null}
        />
      </div>
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 px-4 pb-4">
        {/* Tabela – scroll vertical somente, sem scroll horizontal */}
        <div className={`bg-white rounded-xl shadow-lg overflow-y-auto ${tableGraphHeight}`}>
          <div className="p-4 bg-gray-100 border-b flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-700">Detalhes por Escola</h3>
            <button onClick={() => setShowSearch(!showSearch)}>
              <FaSearch size={20} className="text-gray-700 cursor-pointer" />
            </button>
          </div>
          {showSearch && (
            <div className="p-2">
              <input
                type="text"
                placeholder="Buscar escola..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                style={{ textTransform: "uppercase" }}
                className="w-full p-2 border border-gray-300 rounded"
              />
            </div>
          )}
          <div className="overflow-x-hidden">
            <table className="min-w-full table-fixed">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="w-1/2 px-2 py-2 text-left text-sm font-medium text-gray-700">Escola</th>
                  <th className="w-1/6 px-2 py-2 text-left text-sm font-medium text-gray-700">Turmas</th>
                  <th className="w-1/6 px-2 py-2 text-left text-sm font-medium text-gray-700">Matrículas</th>
                  <th className="w-1/6 px-2 py-2 text-left text-sm font-medium text-gray-700">Vagas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.escolas
                  .filter(escola =>
                    escola.escola.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((escola, index) => (
                    <tr
                      key={index}
                      onClick={() => handleSchoolClick(escola)}
                      className={`cursor-pointer hover:bg-gray-50 ${
                        selectedSchool && selectedSchool.idescola === escola.idescola
                          ? "bg-blue-100"
                          : index % 2 === 0
                          ? "bg-white"
                          : "bg-gray-50"
                      }`}
                    >
                      <td className="px-2 py-2 text-sm text-gray-700 break-words">{escola.escola}</td>
                      <td className="px-2 py-2 text-sm text-gray-700">{escola.qtde_turmas}</td>
                      <td className="px-2 py-2 text-sm text-gray-700">{escola.qtde_matriculas}</td>
                      <td className={`px-2 py-2 text-sm font-semibold ${
                        escola.status_vagas === "disponivel" ? "text-green-600" : "text-red-600"
                      }`}>
                        {escola.vagas_disponiveis}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Gráfico – Movimentação Mensal sem valores por padrão */}
        <div className={`bg-white rounded-xl shadow-lg p-4 flex flex-col ${tableGraphHeight}`}>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Movimentação Mensal</h3>
          <div className="flex-1 overflow-hidden">
            <Bar
              data={{
                labels: Object.keys(data.entradasSaidasPorMes),
                datasets: [
                  {
                    label: "Entradas",
                    data: Object.values(data.entradasSaidasPorMes).map((e) => e.entradas),
                    backgroundColor: "#FBBF24",
                    borderRadius: 6
                  },
                  {
                    label: "Saídas",
                    data: Object.values(data.entradasSaidasPorMes).map((e) => e.saidas),
                    backgroundColor: "#EF4444",
                    borderRadius: 6
                  }
                ]
              }}
              // Ao clicar no gráfico, os labels são alternados (aparecem ou somem)
              onClick={(event, elements) => setShowMonthlyLabels(prev => !prev)}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: "top", labels: { color: "#6B7280" } },
                  datalabels: {
                    display: showMonthlyLabels,
                    color: "#000",
                    font: { weight: "bold" },
                    anchor: "end",
                    align: "end",
                    offset: 4,
                    formatter: (value) => formatNumber(value)
                  }
                },
                scales: {
                  x: {
                    grid: { display: false },
                    ticks: { color: "#6B7280", font: { weight: "bold" } }
                  },
                  y: {
                    grid: { color: "#E5E7EB" },
                    ticks: {
                      color: "#6B7280",
                      font: { weight: "bold" },
                      callback: (value) => formatNumber(value)
                    }
                  }
                },
                layout: { padding: { top: 20, bottom: 20 } }
              }}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 pb-4">
        <div className="bg-white rounded-xl shadow-lg p-4 flex flex-col h-[250px]">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Matrículas por Sexo</h3>
          <div className="flex-1">
            <Pie
              data={{
                labels: Object.keys(data.matriculasPorSexo),
                datasets: [
                  {
                    label: "Sexo",
                    data: Object.values(data.matriculasPorSexo),
                    backgroundColor: Object.keys(data.matriculasPorSexo).map(sexo => {
                      if (sexo.toLowerCase().includes("masc")) return "#0000FF";
                      if (sexo.toLowerCase().includes("femi")) return "#FFC0CB";
                      return "#CCCCCC";
                    }),
                    borderWidth: 0
                  }
                ]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: "bottom" },
                  datalabels: {
                    display: true,
                    color: "#fff",
                    font: { weight: "bold" },
                    formatter: (value) => formatNumber(value)
                  }
                }
              }}
            />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4 flex flex-col h-[250px]">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Matrículas por Turno</h3>
          <div className="flex-1">
            <Bar
              data={{
                labels: Object.keys(data.matriculasPorTurno),
                datasets: [
                  {
                    label: "Turno",
                    data: Object.values(data.matriculasPorTurno),
                    backgroundColor: Object.keys(data.matriculasPorTurno).map((_, index) => {
                      const turnoColors = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6", "#EC4899"];
                      return turnoColors[index % turnoColors.length];
                    }),
                    borderRadius: 4
                  }
                ]
              }}
              options={{
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  datalabels: {
                    display: true,
                    color: "#fff",
                    font: { weight: "bold" },
                    anchor: "end",
                    align: "right",
                    offset: 4,
                    formatter: (value) => formatNumber(value)
                  }
                },
                scales: {
                  x: {
                    grid: { color: "#E5E7EB" },
                    ticks: {
                      color: "#6B7280",
                      font: { weight: "bold" },
                      callback: (value) => formatNumber(value)
                    }
                  },
                  y: {
                    grid: { display: false },
                    ticks: { color: "#6B7280", font: { weight: "bold" } }
                  }
                },
                layout: { padding: { left: 20, right: 20 } }
              }}
            />
          </div>
        </div>
      </div>

      <div
        id="sidebar"
        className={`fixed inset-y-0 left-0 bg-white w-64 md:w-80 p-6 shadow-2xl transform ${
          showSidebar ? "translate-x-0" : "-translate-x-full"
        } transition-transform duration-300 ease-in-out z-50`}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Filtros</h2>
          <button onClick={() => setShowSidebar(false)} className="text-gray-500 hover:text-gray-700 transition-colors">
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <FilterSelect
            label="Ano Letivo"
            name="anoLetivo"
            options={filters.ano_letivo}
            value={selectedFilters.anoLetivo}
            onChange={handleFilterChange}
          />
          <FilterSelect
            label="Tipo Matrícula"
            name="tipoMatricula"
            options={filters.tipo_matricula}
            value={selectedFilters.tipoMatricula}
            onChange={handleFilterChange}
          />
          <FilterSelect
            label="Situação Matrícula"
            name="situacaoMatricula"
            options={filters.situacao_matricula}
            value={selectedFilters.situacaoMatricula}
            onChange={handleFilterChange}
          />
          <FilterSelect
            label="Grupo Etapa"
            name="grupoEtapa"
            options={filters.grupo_etapa}
            value={selectedFilters.grupoEtapa}
            onChange={handleFilterChange}
          />
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
          <FilterSelect
            label="Deficiência"
            name="deficiencia"
            options={filters.deficiencia}
            value={selectedFilters.deficiencia}
            onChange={handleFilterChange}
          />
          <FilterSelect
            label="Multissérie"
            name="multisserie"
            options={filters.multisserie}
            value={selectedFilters.multisserie}
            onChange={handleFilterChange}
          />
          <FilterSelect
            label="Transporte Escolar"
            name="transporteEscolar"
            options={filters.transporte_escolar}
            value={selectedFilters.transporteEscolar}
            onChange={handleFilterChange}
          />
          <FilterSelect
            label="Tipo Transporte"
            name="tipoTransporte"
            options={filters.tipo_transporte}
            value={selectedFilters.tipoTransporte}
            onChange={handleFilterChange}
          />
        </div>
      </div>
    </div>
  );
  
};

export default Dashboard;
