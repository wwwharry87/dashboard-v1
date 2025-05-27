import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "./api";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  ArcElement,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import "../App.css";
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
  FaSearch,
} from "react-icons/fa";
import { Tooltip } from "react-tooltip";
import { isMobile } from "react-device-detect";
import { motion, AnimatePresence } from "framer-motion";

// Spinner com animação centralizada
const Spinner = () => (
  <svg className="animate-spin h-8 w-8 text-violet-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
  </svg>
);

// Toast animado e reutilizável
const Toast = ({ message, show, type = "success" }) =>
  show ? (
    <div className={`
      fixed top-8 left-1/2 transform -translate-x-1/2
      ${type === "success" ? "bg-green-600" : "bg-blue-600"}
      text-white px-6 py-3 rounded-2xl shadow-lg flex items-center gap-2 z-50 animate-slide-in text-lg font-semibold
      `}>
      <span role="img" aria-label="party">{type === "success" ? "🎉" : "🔍"}</span>
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
  ) : null;

const formatNumber = (num) =>
  num === null || num === undefined || num === "Erro"
    ? num
    : Number(num).toLocaleString("pt-BR");

const reorderYesNo = (options) => {
  if (!options) return [];
  const opts = options.map((o) => String(o));
  if (opts.length === 2) {
    const lower = opts.map((o) => o.toLowerCase());
    if (lower.includes("sim") && lower.includes("não")) {
      return opts.sort((a, b) => (a.toLowerCase() === "sim" ? -1 : 1));
    }
  }
  return opts;
};

const getIconColorFromBorder = (borderClass) => {
  const mapping = {
    "border-blue-500": "#3B82F6",
    "border-green-500": "#10B981",
    "border-purple-500": "#8B5CF6",
    "border-yellow-500": "#FBBF24",
    "border-red-500": "#EF4444",
    "border-black": "#000000",
  };
  return mapping[borderClass] || "#000000";
};

const FilterSelect = ({ label, name, options, disabled = false, value, onChange }) => {
  const orderedOptions = reorderYesNo(options);
  return (
    <label className="block mt-2">
      <span className="text-sm font-medium text-gray-700">{label}:</span>
      <select
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-violet-500"
      >
        <option value="">Todos</option>
        {orderedOptions?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
};

const Card = ({ label, value, icon, borderColor, comparativo, disableFormat, valueColor = "", loading }) => {
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
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`
        shadow-xl rounded-2xl p-4 text-center border-l-8 ${borderColor}
        h-32 flex flex-col items-center justify-center
        bg-white/70 backdrop-blur-md ring-1 ring-gray-200
        hover:shadow-2xl transition-all cursor-pointer select-none
      `}
      style={{ boxShadow: "0 6px 28px 0 rgba(140, 82, 255, 0.13)" }}
    >
      <div className={`text-3xl mb-1 ${loading ? "animate-pulse" : ""}`}>{iconWithColor}</div>
      <h3 className="text-md font-semibold text-gray-600">{label}</h3>
      <span className={`text-xl font-bold max-[430px]:text-sm`} style={{ color: valueColor }}>
        {loading ? <Spinner /> : disableFormat ? value : formatNumber(value)}
      </span>
      {renderComparativo()}
    </motion.div>
  );
};

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

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // === STATES ===
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
    idescola: "",
  });
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [tableGraphHeight, setTableGraphHeight] = useState("h-96");
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [clientName, setClientName] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState("success");
  const [nomeUsuario, setNomeUsuario] = useState("");

  // === Loading individual ===
  const [loadingCards, setLoadingCards] = useState({
    totalMatriculas: true,
    totalEscolas: true,
    totalVagas: true,
    totalEntradas: true,
    totalSaidas: true,
  });
  const [loadingTable, setLoadingTable] = useState(true);
  const [loadingGraphMov, setLoadingGraphMov] = useState(true);
  const [loadingPieSexo, setLoadingPieSexo] = useState(true);
  const [loadingBarTurno, setLoadingBarTurno] = useState(true);

  const [data, setData] = useState({
    totalMatriculas: null,
    totalEscolas: null,
    totalVagas: null,
    totalEntradas: null,
    totalSaidas: null,
    escolas: [],
    entradasSaidasPorMes: {},
    comparativos: {},
    matriculasPorZona: {},
    matriculasPorSexo: {},
    matriculasPorTurno: {},
    escolasPorZona: {},
    ultimaAtualizacao: null,
    tendenciaMatriculas: null,
  });

  // Toast boas-vindas + uso para filtros também
  useEffect(() => {
    if (nomeUsuario) {
      setToastMsg(`Bem-vindo(a), ${nomeUsuario}! 🎉`);
      setToastType("success");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 1800);
    }
  }, [nomeUsuario]);

  // Buscar nome do usuário logado via API
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get("/usuario"); // ajuste para sua rota correta!
        setNomeUsuario(res.data.nome);
      } catch {
        setNomeUsuario("");
      }
    };
    fetchUser();
  }, []);

  // Protege o acesso
  useEffect(() => {
    if (!localStorage.getItem("token")) {
      navigate("/login", { replace: true });
      return;
    }
  }, [navigate]);

  // Nome do cliente
  useEffect(() => {
    const fetchClientName = async () => {
      try {
        const response = await api.get("/client");
        setClientName(response.data.cliente);
      } catch {
        setClientName("");
      }
    };
    fetchClientName();
  }, []);

  // Filtros iniciais
  useEffect(() => {
    const initialize = async () => {
      await carregarFiltros();
    };
    initialize();
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleClickOutside = (event) => {
    if (!event.target.closest("#sidebar") && !event.target.closest("#filterButton")) {
      setShowSidebar(false);
    }
  };

  const carregarFiltros = async () => {
    try {
      const response = await api.get("/filtros");
      setFilters(response.data);
      const ultimoAnoLetivo = response.data.ano_letivo?.[0] || "";
      setSelectedFilters((prev) => ({ ...prev, anoLetivo: ultimoAnoLetivo }));
      await carregarDados({ ...selectedFilters, anoLetivo: ultimoAnoLetivo });
    } catch {}
  };

  // Carregamento individual de cada bloco/tabela/gráfico
  const carregarDados = async (filtros) => {
    setLoadingCards({
      totalMatriculas: true,
      totalEscolas: true,
      totalVagas: true,
      totalEntradas: true,
      totalSaidas: true,
    });
    setLoadingTable(true);
    setLoadingGraphMov(true);
    setLoadingPieSexo(true);
    setLoadingBarTurno(true);

    try {
      const [totaisResponse, breakdownsResponse] = await Promise.all([
        api.post("/totais", filtros),
        api.post("/breakdowns", filtros),
      ]);
      setData((prev) => ({
        ...prev,
        ...totaisResponse.data,
        ...breakdownsResponse.data,
      }));

      setLoadingCards({
        totalMatriculas: false,
        totalEscolas: false,
        totalVagas: false,
        totalEntradas: false,
        totalSaidas: false,
      });
      setLoadingTable(false);
      setLoadingGraphMov(false);
      setLoadingPieSexo(false);
      setLoadingBarTurno(false);

      // Toast suave para filtros aplicados
      if (Object.keys(filtros).length > 0) {
        setToastMsg("Filtros aplicados com sucesso! 🔍");
        setToastType("info");
        setShowToast(true);
        setTimeout(() => setShowToast(false), 1300);
      }
    } catch (error) {
      setData((prev) => ({
        ...prev,
        totalMatriculas: "Erro",
        totalEscolas: "Erro",
        totalVagas: "Erro",
        totalEntradas: "Erro",
        totalSaidas: "Erro",
        escolas: [],
        entradasSaidasPorMes: {},
        matriculasPorSexo: {},
        matriculasPorTurno: {},
      }));
      setLoadingCards({
        totalMatriculas: false,
        totalEscolas: false,
        totalVagas: false,
        totalEntradas: false,
        totalSaidas: false,
      });
      setLoadingTable(false);
      setLoadingGraphMov(false);
      setLoadingPieSexo(false);
      setLoadingBarTurno(false);
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

  // Lógica do comparativo/trend
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

  const sair = () => {
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  // === RENDER ===
  return (
    <div className={`${isMobile ? "min-h-screen" : "h-screen"} w-screen flex flex-col bg-gradient-to-br from-violet-500 via-pink-400 to-blue-400`}>
      <Toast message={toastMsg} show={showToast} type={toastType} />

      {/* Bloco de saudação do usuário, bonito e responsivo */}
      <div className="w-full flex flex-col items-center py-3 bg-white/80 rounded-b-2xl shadow-md mb-2
        md:flex-row md:justify-between md:px-8 md:py-5 md:mb-4
      ">
        <div className="flex flex-col items-center md:flex-row md:items-center gap-3 md:gap-4 w-full md:w-auto">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg ring-4 ring-pink-200 transition-all duration-200">
            {nomeUsuario ? nomeUsuario[0].toUpperCase() : 'U'}
          </div>
          <div className="flex flex-col items-center md:items-start">
            <span className="text-sm text-gray-400 mb-0.5">Bem-vindo(a)</span>
            <span className="text-xl md:text-2xl font-bold text-gray-700 break-all max-w-xs md:max-w-none">{nomeUsuario || "Usuário"}</span>
          </div>
        </div>
        <div className="hidden md:flex flex-1 justify-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 drop-shadow-sm text-center">{clientName || "SEMED - TESTE"}</h1>
            <h2 className="text-lg text-gray-600 text-center">Painel de Matrículas</h2>
          </div>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
          <button
            id="filterButton"
            onClick={() => setShowSidebar(true)}
            className="bg-violet-600 text-white rounded-full shadow-xl p-3 hover:bg-pink-500 transition-colors"
          >
            <FaFilter size={24} />
          </button>
          <button
            onClick={sair}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-md flex items-center gap-2"
          >
            <FaSignOutAlt size={18} />
            <span className="font-semibold hidden md:inline">Sair</span>
          </button>
        </div>
      </div>

      {/* O restante do dashboard continua igual */}
      {/* ...copie todo o resto do seu dashboard daqui para baixo normalmente... */}
      {/* Badge para filtro de escola ativo */}
      {selectedSchool && (
        <div className="text-center my-2">
          <span className="bg-violet-100 text-violet-800 px-4 py-1 rounded-full text-sm font-bold shadow">
            Filtro ativo: {selectedSchool.escola}
          </span>
          <button
            onClick={() => handleSchoolClick(selectedSchool)}
            className="ml-2 text-red-600 hover:underline text-xs font-semibold"
          >
            Remover filtro
          </button>
        </div>
      )}

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
          <div className="p-2 bg-violet-100/90 text-center text-sm text-gray-700 rounded-xl mx-4 mt-2 shadow">
            Dados atualizados: {`${day}/${month}/${year} às ${hours}:${minutes}:${seconds}`}
          </div>
        );
      })()}

      {/* Grid de Cartões */}
      <div className="grid grid-cols-2 min-[461px]:grid-cols-3 min-[720px]:grid-cols-6 gap-3 mb-4 px-4 pt-6">
        {/* ...restante dos cards... */}
        {/* ...restante do dashboard igual ao seu */}
      </div>
      {/* ...e todo o restante igual ao seu dashboard original, sem mudar nada */}
    </div>
  );
};

export default Dashboard;
