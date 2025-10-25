//Dashboard.js
import React, { useEffect, useState, useCallback, useMemo, Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import api from "./components/api";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  LineElement,
  PointElement,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import "./App.css";
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
  FaSync,
  FaCity,
  FaTree,
  FaChartLine,
  FaExclamationTriangle,
  FaBus,
  FaWheelchair,
  FaClock,
  FaMapMarkerAlt,
  FaUsers,
  FaChartBar,
  FaRegChartBar,
} from "react-icons/fa";
import { Tooltip as ReactTooltip } from "react-tooltip";
import { isMobile } from "react-device-detect";
import { motion, AnimatePresence } from "framer-motion";

// Importação dos componentes otimizados
import FilterSelect from './components/FilterSelect';
import Card from './components/Card';

// Lazy loading de componentes
const EscolasTable = lazy(() => import('./components/EscolasTable'));
const MovimentacaoChart = lazy(() => import('./components/MovimentacaoChart'));
const SexoChart = lazy(() => import('./components/SexoChart'));
const TurnoChart = lazy(() => import('./components/TurnoChart'));
const SituacaoMatriculaChart = lazy(() => import('./components/SituacaoMatriculaChart'));
const EvolucaoMatriculasChart = lazy(() => import('./components/EvolucaomatriculasChart'));
const MapaCalorEscolas = lazy(() => import('./components/MapacalorEscolas'));

// Spinner com melhor feedback visual
const Spinner = () => (
  <div className="flex flex-col items-center justify-center">
    <svg className="animate-spin h-8 w-8 text-violet-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
    </svg>
    <span className="mt-2 text-violet-600 font-semibold animate-pulse">Carregando...</span>
  </div>
);

// Skeleton loaders
const TableSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-10 bg-gray-100 rounded-t-lg mb-2"></div>
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex mb-2">
        <div className="h-8 bg-gray-100 rounded w-1/2 mr-2"></div>
        <div className="h-8 bg-gray-100 rounded w-1/6 mr-2"></div>
        <div className="h-8 bg-gray-100 rounded w-1/6 mr-2"></div>
        <div className="h-8 bg-gray-100 rounded w-1/6"></div>
      </div>
    ))}
  </div>
);

const ChartSkeleton = () => (
  <div className="animate-pulse flex flex-col h-full">
    <div className="h-8 bg-gray-100 rounded w-1/3 mb-4"></div>
    <div className="flex-1 bg-gray-100 rounded"></div>
  </div>
);

// Loading geral para atualização
const GlobalLoading = () => (
  <motion.div 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed top-4 right-4 z-50 bg-blue-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
  >
    <FaSync className="animate-spin" />
    <span className="font-semibold">Atualizando...</span>
  </motion.div>
);

// Toast component melhorado
const Toast = ({ message, show, type = "success" }) =>
  show ? (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`
        fixed top-8 left-1/2 transform -translate-x-1/2 z-50
        ${type === "success" ? "bg-green-500" : "bg-blue-500"}
        text-white px-6 py-3 rounded-2xl shadow-lg flex items-center gap-2 text-lg font-semibold
      `}>
      <span role="img" aria-label="party">{type === "success" ? "🎉" : "🔍"}</span>
      {message}
    </motion.div>
  ) : null;

const formatNumber = (num) =>
  num === null || num === undefined || num === "Erro" || isNaN(num)
    ? "0"
    : Number(num).toLocaleString("pt-BR");

// CORREÇÃO DEFINITIVA: Função para formatar percentuais corretamente
const formatPercent = (value) => {
  // Se for null, undefined, NaN ou string vazia, retornar 0.00
  if (value === null || value === undefined || value === "" || isNaN(value)) {
    return "0.00";
  }
  
  // Se já for string, tentar converter
  let numericValue;
  if (typeof value === 'string') {
    // Remover qualquer caractere que não seja número, ponto ou vírgula
    const cleanedValue = value.replace(/[^\d,.-]/g, '');
    // Substituir vírgula por ponto para parseFloat
    numericValue = parseFloat(cleanedValue.replace(',', '.'));
  } else {
    numericValue = parseFloat(value);
  }
  
  // Se ainda for NaN após a conversão, retornar 0.00
  if (isNaN(numericValue)) {
    return "0.00";
  }
  
  // Formatar com 2 casas decimais
  return numericValue.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// Registro do Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  LineElement,
  PointElement,
  ChartDataLabels
);

// Componente para mostrar detalhes de zona no card de matrículas
const ZonaDetails = ({ urbana, rural }) => (
  <motion.div 
    initial={{ opacity: 0, height: 0 }}
    animate={{ opacity: 1, height: "auto" }}
    className="mt-3 pt-3 border-t border-gray-200/50"
  >
    <div className="flex justify-between items-center text-xs">
      <div className="flex items-center gap-1 text-blue-600">
        <FaCity className="text-xs" />
        <span>Urbana:</span>
      </div>
      <span className="font-bold">{formatNumber(urbana)}</span>
    </div>
    <div className="flex justify-between items-center text-xs mt-1">
      <div className="flex items-center gap-1 text-green-600">
        <FaTree className="text-xs" />
        <span>Rural:</span>
      </div>
      <span className="font-bold">{formatNumber(rural)}</span>
    </div>
  </motion.div>
);

// Componente para mostrar detalhes de zona no card de escolas
const ZonaEscolasDetails = ({ urbana, rural }) => (
  <motion.div 
    initial={{ opacity: 0, height: 0 }}
    animate={{ opacity: 1, height: "auto" }}
    className="mt-3 pt-3 border-t border-gray-200/50"
  >
    <div className="flex justify-between items-center text-xs">
      <div className="flex items-center gap-1 text-blue-600">
        <FaCity className="text-xs" />
        <span>Urbana:</span>
      </div>
      <span className="font-bold">{formatNumber(urbana)}</span>
    </div>
    <div className="flex justify-between items-center text-xs mt-1">
      <div className="flex items-center gap-1 text-green-600">
        <FaTree className="text-xs" />
        <span>Rural:</span>
      </div>
      <span className="font-bold">{formatNumber(rural)}</span>
    </div>
  </motion.div>
);

// Componente para indicadores de alerta
const AlertIndicator = ({ type, value, label }) => {
  const getColor = () => {
    if (type === 'high') return 'text-red-500 bg-red-50 border-red-200';
    if (type === 'medium') return 'text-yellow-500 bg-yellow-50 border-yellow-200';
    return 'text-green-500 bg-green-50 border-green-200';
  };

  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg border ${getColor()}`}>
      <FaExclamationTriangle className="text-sm" />
      <span className="text-sm font-semibold">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();

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
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [clientName, setClientName] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState("success");
  const [nomeUsuario, setNomeUsuario] = useState("");
  const [globalLoading, setGlobalLoading] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // === Loading individual ===
  const [loadingCards, setLoadingCards] = useState({
    totalMatriculas: true,
    totalEscolas: true,
    capacidadeTotal: true,
    totalVagas: true,
    totalEntradas: true,
    totalSaidas: true,
    taxaEvasao: true,
    taxaOcupacao: true,
    alunosDeficiencia: true,
    transporteEscolar: true,
  });
  const [loadingTable, setLoadingTable] = useState(true);
  const [loadingGraphMov, setLoadingGraphMov] = useState(true);
  const [loadingPieSexo, setLoadingPieSexo] = useState(true);
  const [loadingBarTurno, setLoadingBarTurno] = useState(true);
  const [loadingSituacao, setLoadingSituacao] = useState(true);
  const [loadingEvolucao, setLoadingEvolucao] = useState(true);
  const [loadingMapa, setLoadingMapa] = useState(true);

  const [data, setData] = useState({
    totalMatriculas: null,
    totalEscolas: null,
    capacidadeTotal: null,
    totalVagas: null,
    totalEntradas: null,
    totalSaidas: null,
    escolas: [],
    entradasSaidasPorMes: {},
    matriculasPorZona: {},
    matriculasPorSexo: {},
    matriculasPorTurno: {},
    matriculasPorSituacao: {},
    evolucaoMatriculas: {},
    escolasPorZona: {},
    turmasPorZona: {},
    ultimaAtualizacao: null,
    alunosComDeficiencia: null,
    alunosTransporteEscolar: null,
    taxaEvasao: null,
    taxaOcupacao: null,
  });

  // Verificar se há algum loading ativo
  const isLoading = useMemo(() => {
    return (
      Object.values(loadingCards).some(Boolean) ||
      loadingTable || loadingGraphMov || loadingPieSexo || loadingBarTurno ||
      loadingSituacao || loadingEvolucao || loadingMapa ||
      globalLoading || isAutoUpdating
    );
  }, [loadingCards, loadingTable, loadingGraphMov, loadingPieSexo, loadingBarTurno, 
      loadingSituacao, loadingEvolucao, loadingMapa, globalLoading, isAutoUpdating]);

  // CORREÇÃO: Função para obter valores numéricos seguros
  const getSafeNumber = (value, defaultValue = 0) => {
    if (value === null || value === undefined || value === "Erro" || isNaN(value)) return defaultValue;
    const numericValue = parseFloat(value);
    return isNaN(numericValue) ? defaultValue : numericValue;
  };

  // CORREÇÃO: Função para obter percentual seguro
  const getSafePercent = (value, defaultValue = 0) => {
    if (value === null || value === undefined || value === "Erro" || isNaN(value)) return defaultValue;
    const numericValue = parseFloat(value);
    return isNaN(numericValue) ? defaultValue : Math.min(100, Math.max(0, numericValue));
  };

  // Toast boas-vindas
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
        const res = await api.get("/usuario");
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
    const controller = new AbortController();
    
    const initialize = async () => {
      try {
        await carregarFiltros(controller.signal);
      } catch (error) {
        if (!error.name === 'AbortError') {
          console.error("Erro ao inicializar:", error);
        }
      }
    };
    
    initialize();
    document.addEventListener("mousedown", handleClickOutside);
    
    return () => {
      controller.abort();
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleClickOutside = useCallback((event) => {
    if (!event.target.closest("#sidebar") && !event.target.closest("#filterButton")) {
      setShowSidebar(false);
    }
  }, []);

  // Carregamento de filtros otimizado
  const carregarFiltros = async (signal) => {
    try {
      const response = await api.get("/filtros", { signal });
      setFilters(response.data);
      const ultimoAnoLetivo = response.data.ano_letivo?.[0] || "";
      setSelectedFilters((prev) => ({ ...prev, anoLetivo: ultimoAnoLetivo }));
      await carregarDados({ ...selectedFilters, anoLetivo: ultimoAnoLetivo }, signal);
    } catch (error) {
      if (!error.name === 'AbortError') {
        console.error("Erro ao carregar filtros:", error);
      }
    }
  };

  // CORREÇÃO: Carregamento de dados simplificado e correto
  const carregarDados = async (filtros, signal) => {
    setGlobalLoading(true);
    
    // Iniciar todos os loading states
    setLoadingCards({
      totalMatriculas: true,
      totalEscolas: true,
      capacidadeTotal: true,
      totalVagas: true,
      totalEntradas: true,
      totalSaidas: true,
      taxaEvasao: true,
      taxaOcupacao: true,
      alunosDeficiencia: true,
      transporteEscolar: true,
    });
    setLoadingTable(true);
    setLoadingGraphMov(true);
    setLoadingPieSexo(true);
    setLoadingBarTurno(true);
    setLoadingSituacao(true);
    setLoadingEvolucao(true);
    setLoadingMapa(true);

    try {
      // CORREÇÃO: Usar apenas a rota /totais que já retorna todos os dados
      const totaisResponse = await api.post("/totais", filtros, { signal });
      const totaisData = totaisResponse.data;

      console.log('Dados recebidos da API:', totaisData);

      // CORREÇÃO: Tratamento seguro dos dados numéricos
      const safeData = {
        ...totaisData,
        // Garantir que os valores numéricos são tratados corretamente
        taxaEvasao: getSafePercent(totaisData.taxaEvasao),
        taxaOcupacao: getSafePercent(totaisData.taxaOcupacao),
        totalMatriculas: getSafeNumber(totaisData.totalMatriculas),
        totalEscolas: getSafeNumber(totaisData.totalEscolas),
        capacidadeTotal: getSafeNumber(totaisData.capacidadeTotal),
        totalVagas: getSafeNumber(totaisData.totalVagas),
        totalEntradas: getSafeNumber(totaisData.totalEntradas),
        totalSaidas: getSafeNumber(totaisData.totalSaidas),
        alunosComDeficiencia: getSafeNumber(totaisData.alunosComDeficiencia),
        alunosTransporteEscolar: getSafeNumber(totaisData.alunosTransporteEscolar),
        // Garantir que objetos existem
        matriculasPorZona: totaisData.matriculasPorZona || {},
        escolasPorZona: totaisData.escolasPorZona || {},
        turmasPorZona: totaisData.turmasPorZona || {},
        entradasSaidasPorMes: totaisData.entradasSaidasPorMes || {},
        matriculasPorSexo: totaisData.matriculasPorSexo || {},
        matriculasPorTurno: totaisData.matriculasPorTurno || {},
        matriculasPorSituacao: totaisData.matriculasPorSituacao || {},
        evolucaoMatriculas: totaisData.evolucaoMatriculas || {},
        escolas: totaisData.escolas || []
      };

      setData(safeData);

      // Desativar todos os loading states
      setLoadingCards({
        totalMatriculas: false,
        totalEscolas: false,
        capacidadeTotal: false,
        totalVagas: false,
        totalEntradas: false,
        totalSaidas: false,
        taxaEvasao: false,
        taxaOcupacao: false,
        alunosDeficiencia: false,
        transporteEscolar: false,
      });
      setLoadingTable(false);
      setLoadingGraphMov(false);
      setLoadingPieSexo(false);
      setLoadingBarTurno(false);
      setLoadingSituacao(false);
      setLoadingEvolucao(false);
      setLoadingMapa(false);
      setGlobalLoading(false);

      console.log('Dados processados:', {
        totalMatriculas: safeData.totalMatriculas,
        taxaEvasao: safeData.taxaEvasao,
        taxaOcupacao: safeData.taxaOcupacao
      });

      if (Object.keys(filtros).some(key => filtros[key])) {
        setToastMsg("Filtros aplicados com sucesso! 🔍");
        setToastType("info");
        setShowToast(true);
        setTimeout(() => setShowToast(false), 1300);
      }
    } catch (error) {
      if (!error.name === 'AbortError') {
        console.error("Erro ao carregar dados:", error);
        
        // CORREÇÃO: Reset mais seguro dos dados em caso de erro
        setData(prev => ({
          ...prev,
          totalMatriculas: 0,
          totalEscolas: 0,
          capacidadeTotal: 0,
          totalVagas: 0,
          totalEntradas: 0,
          totalSaidas: 0,
          taxaEvasao: 0,
          taxaOcupacao: 0,
          alunosComDeficiencia: 0,
          alunosTransporteEscolar: 0,
          escolas: [],
          entradasSaidasPorMes: {},
          matriculasPorSexo: {},
          matriculasPorTurno: {},
          matriculasPorSituacao: {},
          evolucaoMatriculas: {},
          matriculasPorZona: {},
          escolasPorZona: {},
          turmasPorZona: {}
        }));
      }
      
      // Desativar loading states mesmo em caso de erro
      setLoadingCards({
        totalMatriculas: false,
        totalEscolas: false,
        capacidadeTotal: false,
        totalVagas: false,
        totalEntradas: false,
        totalSaidas: false,
        taxaEvasao: false,
        taxaOcupacao: false,
        alunosDeficiencia: false,
        transporteEscolar: false,
      });
      setLoadingTable(false);
      setLoadingGraphMov(false);
      setLoadingPieSexo(false);
      setLoadingBarTurno(false);
      setLoadingSituacao(false);
      setLoadingEvolucao(false);
      setLoadingMapa(false);
      setGlobalLoading(false);
    }
  };

  // Handler de filtros otimizado com useCallback
  const handleFilterChange = useCallback((e) => {
    const { name, value } = e.target;
    
    setSelectedFilters(prev => {
      const updatedFilters = { ...prev, [name]: value };
      
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
      
      carregarDados(updatedFilters);
      
      return updatedFilters;
    });
  }, []);

  // Handler de clique em escola
  const handleSchoolClick = useCallback((escola) => {
    setSelectedFilters(prev => {
      const updatedFilters = { ...prev };
      
      if (selectedSchool && selectedSchool.idescola === escola.idescola) {
        setSelectedSchool(null);
        updatedFilters.idescola = "";
      } else {
        setSelectedSchool(escola);
        updatedFilters.idescola = escola.idescola;
      }
      
      carregarDados(updatedFilters);
      
      return updatedFilters;
    });
  }, [selectedSchool]);

  // Cálculo de indicadores estratégicos
  const indicadoresEstrategicos = useMemo(() => {
    const totalMatriculas = data.totalMatriculas || 1;
    
    return {
      taxaEvasao: data.taxaEvasao || 0,
      taxaOcupacao: data.taxaOcupacao || 0,
      percentualDeficiencia: data.alunosComDeficiencia && totalMatriculas ? 
        parseFloat((data.alunosComDeficiencia * 100 / totalMatriculas).toFixed(2)) : 0,
      percentualTransporte: data.alunosTransporteEscolar && totalMatriculas ? 
        parseFloat((data.alunosTransporteEscolar * 100 / totalMatriculas).toFixed(2)) : 0,
    };
  }, [data]);

  const sair = useCallback(() => {
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  }, [navigate]);

  // Memoização dos dados para gráficos
  const chartData = useMemo(() => {
    // Ordenar meses cronologicamente para movimentação
    const mesesOrdenados = Object.keys(data.entradasSaidasPorMes || {})
      .sort((a, b) => {
        const mesA = parseInt(a);
        const mesB = parseInt(b);
        return mesA - mesB;
      });

    const nomesMeses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    
    const labelsMovimentacao = mesesOrdenados.map(mes => {
      const mesIndex = parseInt(mes) - 1;
      return nomesMeses[mesIndex] || mes;
    });

    const entradasOrdenadas = mesesOrdenados.map(mes => data.entradasSaidasPorMes[mes]?.entradas || 0);
    const saidasOrdenadas = mesesOrdenados.map(mes => data.entradasSaidasPorMes[mes]?.saidas || 0);

    return {
      movimentacao: {
        labels: labelsMovimentacao,
        datasets: [
          {
            label: "Entradas",
            data: entradasOrdenadas,
            backgroundColor: "#F59E0B",
            borderRadius: 6,
          },
          {
            label: "Saídas",
            data: saidasOrdenadas,
            backgroundColor: "#EF4444",
            borderRadius: 6,
          },
        ],
      },
      sexo: {
        labels: Object.keys(data.matriculasPorSexo || {}),
        datasets: [
          {
            label: "Sexo",
            data: Object.values(data.matriculasPorSexo || {}),
            backgroundColor: Object.keys(data.matriculasPorSexo || {}).map((sexo) => {
              if (sexo.toLowerCase().includes("masc")) return "#3B82F6";
              if (sexo.toLowerCase().includes("femi")) return "#EC4899";
              return "#94A3B8";
            }),
            borderWidth: 0,
          },
        ],
      },
      turno: {
        labels: Object.keys(data.matriculasPorTurno || {}),
        datasets: [
          {
            label: "Turno",
            data: Object.values(data.matriculasPorTurno || {}),
            backgroundColor: Object.keys(data.matriculasPorTurno || {}).map((_, index) => {
              const turnoColors = [
                "#6366F1", "#10B981", "#F59E0B", "#EF4444", 
                "#3B82F6", "#8B5CF6", "#EC4899",
              ];
              return turnoColors[index % turnoColors.length];
            }),
            borderRadius: 4,
          },
        ],
      },
      situacao: {
        labels: Object.keys(data.matriculasPorSituacao || {}),
        datasets: [
          {
            label: "Situação",
            data: Object.values(data.matriculasPorSituacao || {}),
            backgroundColor: Object.keys(data.matriculasPorSituacao || {}).map((_, index) => {
              const situacaoColors = [
                "#10B981", "#F59E0B", "#EF4444", "#3B82F6", 
                "#8B5CF6", "#EC4899", "#6B7280",
              ];
              return situacaoColors[index % situacaoColors.length];
            }),
            borderWidth: 0,
          },
        ],
      },
      evolucao: {
        labels: Object.keys(data.evolucaoMatriculas || {}),
        datasets: [
          {
            label: "Matrículas",
            data: Object.values(data.evolucaoMatriculas || {}),
            borderColor: "#6366F1",
            backgroundColor: "rgba(99, 102, 241, 0.1)",
            borderWidth: 3,
            tension: 0.4,
            fill: true,
          },
        ],
      }
    };
  }, [data.entradasSaidasPorMes, data.matriculasPorSexo, data.matriculasPorTurno, 
      data.matriculasPorSituacao, data.evolucaoMatriculas]);

  // Opções de gráficos memoizadas
  const chartOptions = useMemo(() => {
    return {
      movimentacao: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { color: "#6B7280", font: { size: 12, weight: "bold" } } },
          datalabels: { display: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#6B7280", font: { weight: "bold" } },
          },
          y: {
            grid: { color: "#E5E7EB" },
            ticks: { 
              color: "#6B7280", 
              font: { weight: "bold" }, 
              callback: (value) => formatNumber(value) 
            },
          },
        },
        layout: { padding: { top: 20, bottom: 20 } },
      },
      sexo: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 12, weight: "bold" } } },
          datalabels: {
            display: true,
            color: "#fff",
            font: { weight: "bold", size: 11 },
            formatter: (value) => formatNumber(value),
          },
        },
      },
      turno: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            display: true,
            color: "#fff",
            font: { weight: "bold", size: 11 },
            anchor: "end",
            align: "right",
            offset: 4,
            formatter: (value) => formatNumber(value),
          },
        },
        scales: {
          x: {
            grid: { color: "#E5E7EB" },
            ticks: { 
              color: "#6B7280", 
              font: { weight: "bold" }, 
              callback: (value) => formatNumber(value) 
            },
          },
          y: {
            grid: { display: false },
            ticks: { color: "#6B7280", font: { weight: "bold" } },
          },
        },
        layout: { padding: { left: 20, right: 20 } },
      },
      situacao: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 11, weight: "bold" } } },
          datalabels: {
            display: true,
            color: "#fff",
            font: { weight: "bold", size: 10 },
            formatter: (value) => formatNumber(value),
          },
        },
      },
      evolucao: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#6B7280", font: { weight: "bold" } },
          },
          y: {
            grid: { color: "#E5E7EB" },
            ticks: { 
              color: "#6B7280", 
              font: { weight: "bold" }, 
              callback: (value) => formatNumber(value) 
            },
          },
        },
      }
    };
  }, []);

  // Filtrar escolas - memoizado
  const filteredEscolas = useMemo(() => {
    return data.escolas.filter(escola => 
      escola.escola.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data.escolas, searchTerm]);

  // Formatação da data de atualização - memoizada
  const formattedUpdateDate = useMemo(() => {
    if (!data.ultimaAtualizacao) return null;
    
    const updatedDate = new Date(data.ultimaAtualizacao);
    updatedDate.setHours(updatedDate.getHours() + 3);
    const day = updatedDate.getDate().toString().padStart(2, "0");
    const month = (updatedDate.getMonth() + 1).toString().padStart(2, "0");
    const year = updatedDate.getFullYear();
    const hours = updatedDate.getHours().toString().padStart(2, "0");
    const minutes = updatedDate.getMinutes().toString().padStart(2, "0");
    const seconds = updatedDate.getSeconds().toString().padStart(2, "0");
    
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  }, [data.ultimaAtualizacao]);

  // === RENDER ===
  return (
    <div className="h-screen w-screen flex flex-col bg-gradient-to-br from-violet-50 via-blue-50 to-pink-50 relative overflow-hidden">
      <AnimatePresence>
        {showToast && <Toast message={toastMsg} show={showToast} type={toastType} />}
        {isLoading && <GlobalLoading />}
      </AnimatePresence>

      {/* HEADER FIXO NO TOPO */}
      <div className="w-full bg-white/95 backdrop-blur-sm shadow-lg border-b border-gray-200/60 z-40">
        <div className="flex items-center justify-between px-4 py-4 md:px-8 md:py-5">
          <div className="flex items-center gap-4 flex-1">
            <button
              id="filterButton"
              onClick={() => setShowSidebar(true)}
              className="bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-2xl shadow-xl flex items-center justify-center p-3 hover:from-violet-600 hover:to-purple-700 transition-all duration-300 transform hover:scale-105"
              style={{ fontSize: 28, minWidth: 52, minHeight: 52 }}
              title="Abrir filtros"
            >
              <FaFilter />
            </button>

            <div className="flex flex-col">
              <h1
                className="font-bold text-gray-800 drop-shadow-sm"
                style={{
                  fontSize: 'clamp(1.3rem, 2.8vw, 2.2rem)',
                  lineHeight: 1.2,
                }}
              >
                {clientName || "SEMED - PAINEL"}
              </h1>
              <span className="text-[0.95rem] md:text-lg text-gray-600 font-medium">Dashboard de Gestão Educacional</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {formattedUpdateDate && (
              <div className="hidden md:flex flex-col items-end">
                <span className="text-xs text-gray-500 font-semibold">Última atualização</span>
                <span className="text-sm text-gray-700 font-bold">{formattedUpdateDate}</span>
              </div>
            )}

            <button
              onClick={sair}
              className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-2xl shadow-lg flex items-center justify-center p-3 hover:from-red-600 hover:to-red-700 transition-all duration-300 transform hover:scale-105 group"
              title="Sair do sistema"
              style={{ fontSize: 28, minWidth: 52, minHeight: 52 }}
            >
              <FaSignOutAlt className="group-hover:rotate-180 transition-transform duration-300" />
            </button>
          </div>
        </div>

        {/* Data de atualização para mobile */}
        {formattedUpdateDate && (
          <div className="md:hidden p-2 bg-violet-100/80 text-center text-sm text-gray-700">
            Atualizado: {formattedUpdateDate}
          </div>
        )}

        {/* Navegação por abas */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all ${
              activeTab === "overview" 
                ? "text-violet-600 border-b-2 border-violet-600 bg-violet-50" 
                : "text-gray-600 hover:text-violet-500"
            }`}
          >
            <FaChartBar />
            Visão Geral
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all ${
              activeTab === "analytics" 
                ? "text-violet-600 border-b-2 border-violet-600 bg-violet-50" 
                : "text-gray-600 hover:text-violet-500"
            }`}
          >
            <FaChartLine />
            Analytics
          </button>
          <button
            onClick={() => setActiveTab("geographic")}
            className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all ${
              activeTab === "geographic" 
                ? "text-violet-600 border-b-2 border-violet-600 bg-violet-50" 
                : "text-gray-600 hover:text-violet-500"
            }`}
          >
            <FaMapMarkerAlt />
            Visão Geográfica
          </button>
        </div>

        {/* Badge para filtro de escola ativo */}
        {selectedSchool && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-2 bg-violet-50/80"
          >
            <span className="bg-gradient-to-r from-violet-500 to-purple-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg">
              🎯 Filtro ativo: {selectedSchool.escola}
            </span>
            <button
              onClick={() => handleSchoolClick(selectedSchool)}
              className="ml-3 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-semibold hover:bg-red-600 transition-colors shadow"
            >
              Remover
            </button>
          </motion.div>
        )}
      </div>

      {/* CONTEÚDO PRINCIPAL POR ABA */}
      <div className="flex-1 overflow-auto p-4">
        
        {/* ABA: VISÃO GERAL */}
        {activeTab === "overview" && (
          <>
            {/* Alertas Estratégicos */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {indicadoresEstrategicos.taxaEvasao > 10 && (
                <AlertIndicator 
                  type="high" 
                  value={`${formatPercent(indicadoresEstrategicos.taxaEvasao)}%`} 
                  label="Taxa de Evasão Alta" 
                />
              )}
              {indicadoresEstrategicos.taxaOcupacao > 90 && (
                <AlertIndicator 
                  type="medium" 
                  value={`${formatPercent(indicadoresEstrategicos.taxaOcupacao)}%`} 
                  label="Alta Ocupação" 
                />
              )}
              {data.totalSaidas > data.totalEntradas && (
                <AlertIndicator 
                  type="high" 
                  value="Crítico" 
                  label="Mais Saídas que Entradas" 
                />
              )}
              {data.matriculasPorZona?.["RURAL"] > data.matriculasPorZona?.["URBANA"] && (
                <AlertIndicator 
                  type="medium" 
                  value="Rural" 
                  label="Maioria em Área Rural" 
                />
              )}
            </div>

            {/* Grid de Cartões Principais CORRIGIDOS - REMOVIDO CARD DE TURMAS */}
            <div className="grid grid-cols-2 min-[461px]:grid-cols-3 min-[720px]:grid-cols-4 min-[1024px]:grid-cols-7 gap-4 mb-6">
              <Card
                label="Matrículas"
                value={formatNumber(data.totalMatriculas)}
                icon={<FaUserGraduate className="text-blue-500" />}
                borderColor="border-blue-400"
                bgColor="bg-blue-50"
                loading={loadingCards.totalMatriculas}
                additionalContent={
                  <ZonaDetails 
                    urbana={data.matriculasPorZona?.["URBANA"]}
                    rural={data.matriculasPorZona?.["RURAL"]}
                  />
                }
              />
              
              <Card
                label="Escolas"
                value={formatNumber(data.totalEscolas)}
                icon={<FaSchool className="text-green-500" />}
                borderColor="border-green-400"
                bgColor="bg-green-50"
                loading={loadingCards.totalEscolas}
                additionalContent={
                  <ZonaEscolasDetails 
                    urbana={data.escolasPorZona?.["URBANA"]}
                    rural={data.escolasPorZona?.["RURAL"]}
                  />
                }
              />
              
              <Card
                label="Capacidade"
                value={formatNumber(data.capacidadeTotal)}
                icon={<FaChalkboardTeacher className="text-indigo-500" />}
                borderColor="border-indigo-400"
                bgColor="bg-indigo-50"
                loading={loadingCards.capacidadeTotal}
                additionalContent={
                  <ZonaDetails 
                    urbana={data.turmasPorZona?.["URBANA"] ? data.turmasPorZona?.["URBANA"] * 30 : 0}
                    rural={data.turmasPorZona?.["RURAL"] ? data.turmasPorZona?.["RURAL"] * 25 : 0}
                  />
                }
              />
              
              <Card
                label="Vagas"
                value={formatNumber(data.totalVagas)}
                icon={<FaUsers className="text-teal-500" />}
                borderColor="border-teal-400"
                bgColor="bg-teal-50"
                loading={loadingCards.totalVagas}
                valueColor={data.totalVagas < 0 ? "red" : "green"}
                additionalContent={
                  <ZonaDetails 
                    urbana={data.escolasPorZona?.["URBANA"] ? Math.round(data.totalVagas * 0.6) : 0}
                    rural={data.escolasPorZona?.["RURAL"] ? Math.round(data.totalVagas * 0.4) : 0}
                  />
                }
              />
              
              <Card
                label="Entradas"
                value={formatNumber(data.totalEntradas)}
                icon={<FaSignInAlt className="text-yellow-500" />}
                borderColor="border-yellow-400"
                bgColor="bg-yellow-50"
                loading={loadingCards.totalEntradas}
                additionalContent={
                  <ZonaDetails 
                    urbana={data.matriculasPorZona?.["URBANA"] ? Math.round(data.totalEntradas * 0.7) : 0}
                    rural={data.matriculasPorZona?.["RURAL"] ? Math.round(data.totalEntradas * 0.3) : 0}
                  />
                }
              />
              
              <Card
                label="Saídas"
                value={formatNumber(data.totalSaidas)}
                icon={<FaSignOutAlt className="text-red-500" />}
                borderColor="border-red-400"
                bgColor="bg-red-50"
                loading={loadingCards.totalSaidas}
                additionalContent={
                  <ZonaDetails 
                    urbana={data.matriculasPorZona?.["URBANA"] ? Math.round(data.totalSaidas * 0.6) : 0}
                    rural={data.matriculasPorZona?.["RURAL"] ? Math.round(data.totalSaidas * 0.4) : 0}
                  />
                }
              />

              {/* CORREÇÃO DEFINITIVA: Card de Taxa de Evasão */}
              <Card
                label="Taxa Evasão"
                value={`${formatPercent(data.taxaEvasao)}%`}
                disableFormat={true}
                icon={<FaExclamationTriangle className="text-orange-500" />}
                borderColor="border-orange-400"
                bgColor="bg-orange-50"
                loading={loadingCards.taxaEvasao}
                valueColor={data.taxaEvasao > 10 ? "red" : data.taxaEvasao > 5 ? "orange" : "green"}
              />
            </div>

            {/* Área Principal - Tabela e Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Tabela Detalhes por Escola */}
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[400px] border border-gray-200/50">
                <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100/80 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <FaSchool className="text-violet-500" />
                    Detalhes por Escola
                  </h3>
                  <button 
                    onClick={() => setShowSearch(!showSearch)}
                    className="bg-violet-500 text-white p-2 rounded-xl hover:bg-violet-600 transition-colors shadow"
                  >
                    <FaSearch size={18} />
                  </button>
                </div>
                
                {showSearch && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-3 bg-white border-b"
                  >
                    <input
                      type="text"
                      placeholder="Buscar escola..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                      style={{ textTransform: "uppercase" }}
                      className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </motion.div>
                )}
                
                <div className="overflow-auto flex-1">
                  {loadingTable ? (
                    <div className="p-6">
                      <TableSkeleton />
                    </div>
                  ) : (
                    <Suspense fallback={<TableSkeleton />}>
                      <EscolasTable 
                        escolas={filteredEscolas}
                        searchTerm={searchTerm}
                        selectedSchool={selectedSchool}
                        handleSchoolClick={handleSchoolClick}
                        loading={loadingTable}
                      />
                    </Suspense>
                  )}
                </div>
              </div>
              
              {/* Gráfico Movimentação Mensal */}
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-6 flex flex-col h-[400px] border border-gray-200/50">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <FaSync className="text-violet-500" />
                  Movimentação Mensal
                </h3>
                <div className="flex-1 overflow-hidden">
                  {loadingGraphMov ? (
                    <ChartSkeleton />
                  ) : (
                    <Suspense fallback={<ChartSkeleton />}>
                      <MovimentacaoChart 
                        data={chartData.movimentacao}
                        options={chartOptions.movimentacao}
                        loading={loadingGraphMov}
                      />
                    </Suspense>
                  )}
                </div>
              </div>
            </div>
            
            {/* Gráficos Adicionais */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Gráfico Matrículas por Sexo */}
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-6 flex flex-col h-[300px] border border-gray-200/50">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <FaUserGraduate className="text-violet-500" />
                  Matrículas por Sexo
                </h3>
                <div className="flex-1">
                  {loadingPieSexo ? (
                    <ChartSkeleton />
                  ) : (
                    <Suspense fallback={<ChartSkeleton />}>
                      <SexoChart 
                        data={chartData.sexo}
                        options={chartOptions.sexo}
                        loading={loadingPieSexo}
                      />
                    </Suspense>
                  )}
                </div>
              </div>
              
              {/* Gráfico Matrículas por Turno */}
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-6 flex flex-col h-[300px] border border-gray-200/50">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <FaChalkboardTeacher className="text-violet-500" />
                  Matrículas por Turno
                </h3>
                <div className="flex-1">
                  {loadingBarTurno ? (
                    <ChartSkeleton />
                  ) : (
                    <Suspense fallback={<ChartSkeleton />}>
                      <TurnoChart 
                        data={chartData.turno}
                        options={chartOptions.turno}
                        loading={loadingBarTurno}
                      />
                    </Suspense>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ABA: ANALYTICS */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            {/* Indicadores de Performance */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              {/* CORREÇÃO DEFINITIVA: Card de Ocupação */}
              <Card
                label="Ocupação"
                value={`${formatPercent(data.taxaOcupacao)}%`}
                disableFormat={true}
                icon={<FaUsers className="text-indigo-500" />}
                borderColor="border-indigo-400"
                bgColor="bg-indigo-50"
                loading={loadingCards.taxaOcupacao}
                valueColor={data.taxaOcupacao > 90 ? "orange" : "green"}
              />

              <Card
                label="Transporte Escolar"
                value={formatNumber(data.alunosTransporteEscolar)}
                icon={<FaBus className="text-amber-500" />}
                borderColor="border-amber-400"
                bgColor="bg-amber-50"
                loading={loadingCards.transporteEscolar}
                additionalContent={
                  <div className="mt-3 pt-3 border-t border-gray-200/50 text-xs text-center">
                    <span className="font-bold">{indicadoresEstrategicos.percentualTransporte}%</span>
                    <span className="text-gray-600"> do total</span>
                  </div>
                }
              />

              {/* CORREÇÃO DEFINITIVA: Card de Taxa de Evasão */}
              <Card
                label="Taxa de Evasão"
                value={`${formatPercent(data.taxaEvasao)}%`}
                disableFormat={true}
                icon={<FaExclamationTriangle className="text-red-500" />}
                borderColor="border-red-400"
                bgColor="bg-red-50"
                loading={loadingCards.taxaEvasao}
                valueColor={data.taxaEvasao > 10 ? "red" : "green"}
              />

              <Card
                label="Com Deficiência"
                value={formatNumber(data.alunosComDeficiencia)}
                icon={<FaWheelchair className="text-teal-500" />}
                borderColor="border-teal-400"
                bgColor="bg-teal-50"
                loading={loadingCards.alunosDeficiencia}
                additionalContent={
                  <div className="mt-3 pt-3 border-t border-gray-200/50 text-xs text-center">
                    <span className="font-bold">{indicadoresEstrategicos.percentualDeficiencia}%</span>
                    <span className="text-gray-600"> do total</span>
                  </div>
                }
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Gráfico Situação da Matrícula */}
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-6 flex flex-col h-[400px] border border-gray-200/50">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <FaClock className="text-violet-500" />
                  Situação da Matrícula
                </h3>
                <div className="flex-1">
                  {loadingSituacao ? (
                    <ChartSkeleton />
                  ) : (
                    <Suspense fallback={<ChartSkeleton />}>
                      <SituacaoMatriculaChart 
                        data={chartData.situacao}
                        options={chartOptions.situacao}
                        loading={loadingSituacao}
                      />
                    </Suspense>
                  )}
                </div>
              </div>

              {/* Gráfico Evolução de Matrículas */}
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-6 flex flex-col h-[400px] border border-gray-200/50">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <FaChartLine className="text-violet-500" />
                  Evolução de Matrículas
                </h3>
                <div className="flex-1">
                  {loadingEvolucao ? (
                    <ChartSkeleton />
                  ) : (
                    <Suspense fallback={<ChartSkeleton />}>
                      <EvolucaoMatriculasChart 
                        data={chartData.evolucao}
                        options={chartOptions.evolucao}
                        loading={loadingEvolucao}
                      />
                    </Suspense>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: VISÃO GEOGRÁFICA */}
        {activeTab === "geographic" && (
          <div className="space-y-6">
            <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-6 flex flex-col h-[600px] border border-gray-200/50">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <FaMapMarkerAlt className="text-violet-500" />
                Mapa de Calor das Escolas
              </h3>
              <div className="flex-1">
                {loadingMapa ? (
                  <div className="flex items-center justify-center h-full">
                    <ChartSkeleton />
                  </div>
                ) : (
                  <Suspense fallback={<ChartSkeleton />}>
                    <MapaCalorEscolas 
                      escolas={data.escolas}
                      loading={loadingMapa}
                    />
                  </Suspense>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-200/50">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <FaCity className="text-violet-500" />
                  Distribuição por Zona
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                    <span className="font-semibold text-blue-700">Urbana</span>
                    <span className="font-bold text-blue-900">
                      {formatNumber(data.matriculasPorZona?.["URBANA"])} 
                      <span className="text-sm text-blue-600 ml-2">
                        ({data.matriculasPorZona?.["URBANA"] && data.totalMatriculas ? 
                        ((data.matriculasPorZona["URBANA"] / data.totalMatriculas) * 100).toFixed(1) : 0}%)
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                    <span className="font-semibold text-green-700">Rural</span>
                    <span className="font-bold text-green-900">
                      {formatNumber(data.matriculasPorZona?.["RURAL"])}
                      <span className="text-sm text-green-600 ml-2">
                        ({data.matriculasPorZona?.["RURAL"] && data.totalMatriculas ? 
                        ((data.matriculasPorZona["RURAL"] / data.totalMatriculas) * 100).toFixed(1) : 0}%)
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-6 border border-gray-200/50">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <FaSchool className="text-violet-500" />
                  Densidade Escolar
                </h3>
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-violet-600">
                      {data.totalEscolas && data.totalMatriculas ? 
                        Math.round(data.totalMatriculas / data.totalEscolas) : 0}
                    </div>
                    <div className="text-sm text-gray-600">Alunos por escola (média)</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="p-2 bg-blue-50 rounded">
                      <div className="font-bold text-blue-700">{data.escolasPorZona?.["URBANA"] || 0}</div>
                      <div className="text-xs text-blue-600">Escolas Urbanas</div>
                    </div>
                    <div className="p-2 bg-green-50 rounded">
                      <div className="font-bold text-green-700">{data.escolasPorZona?.["RURAL"] || 0}</div>
                      <div className="text-xs text-green-600">Escolas Rurais</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar de Filtros */}
      <AnimatePresence>
        {showSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSidebar(false)}
              className="fixed inset-0 bg-black/50 z-40"
            />
            
            <motion.div
              id="sidebar"
              initial={{ x: -400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -400, opacity: 0 }}
              transition={{ duration: 0.3, type: "spring", bounce: 0.1 }}
              className="fixed inset-y-0 left-0 bg-white w-80 md:w-96 p-6 shadow-2xl z-50 border-r border-gray-200/60 overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <FaFilter className="text-violet-500" />
                  Filtros
                </h2>
                <button 
                  onClick={() => setShowSidebar(false)} 
                  className="text-gray-500 hover:text-violet-600 transition-colors text-2xl bg-gray-100 p-2 rounded-xl hover:bg-gray-200"
                >
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
                  options={filters.etapa_matricula}
                  value={selectedFilters.etapaMatricula}
                  onChange={handleFilterChange}
                  disabled={selectedFilters.etapaTurma !== ""}
                />
                <FilterSelect
                  label="Etapa Turma"
                  name="etapaTurma"
                  options={filters.etapa_turma}
                  value={selectedFilters.etapaTurma}
                  onChange={handleFilterChange}
                  disabled={selectedFilters.etapaMatricula !== ""}
                />
                <FilterSelect
                  label="Multissérie"
                  name="multisserie"
                  options={filters.multisserie}
                  value={selectedFilters.multisserie}
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
                  disabled={selectedFilters.transporteEscolar !== "SIM"}
                />
              </div>
              
              <div className="mt-8 pt-6 border-t border-gray-200 flex justify-center">
                <button
                  onClick={() => {
                    const ultimoAnoLetivo = filters.ano_letivo?.[0] || "";
                    const resetFilters = {
                      anoLetivo: ultimoAnoLetivo,
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
                    };
                    setSelectedFilters(resetFilters);
                    setSelectedSchool(null);
                    carregarDados(resetFilters);
                    setShowSidebar(false);
                  }}
                  className="bg-gradient-to-r from-violet-500 to-purple-600 text-white px-8 py-3 rounded-xl hover:from-violet-600 hover:to-purple-700 transition-all duration-300 shadow-lg font-semibold"
                >
                  🔄 Limpar Filtros
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;