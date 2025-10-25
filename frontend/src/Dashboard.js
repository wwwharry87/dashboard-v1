//Dashboard.js
import React, { useEffect, useState, useCallback, useMemo, Suspense, lazy, createContext, useContext } from "react";
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
  FaInfoCircle,
  FaDownload,
  FaFileExcel,
  FaFilePdf,
  FaSun,
  FaMoon,
  FaDatabase,
} from "react-icons/fa";
import { Tooltip as ReactTooltip } from "react-tooltip";
import { isMobile } from "react-device-detect";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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

// Context para modo escuro
const DarkModeContext = createContext();

// Spinner com melhor feedback visual
const Spinner = () => (
  <div className="flex flex-col items-center justify-center">
    <svg className="animate-spin h-8 w-8 text-sky-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
    </svg>
    <span className="mt-2 text-sky-600 font-semibold animate-pulse">Carregando...</span>
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

// CORREÇÃO: Função para formatar números com separador de milhar correto (padrão brasileiro)
const formatNumber = (num) => {
  if (num === null || num === undefined || num === "Erro" || isNaN(num)) {
    return "0";
  }
  
  const numberValue = typeof num === 'string' ? parseFloat(num.replace(',', '.')) : Number(num);
  
  if (isNaN(numberValue)) {
    return "0";
  }
  
  return numberValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
};

// CORREÇÃO DEFINITIVA: Função para formatar percentuais corretamente
const formatPercent = (value) => {
  if (value === null || value === undefined || value === "" || isNaN(value)) {
    return "0,00";
  }
  
  let numericValue;
  if (typeof value === 'string') {
    const cleanedValue = value.replace(/[^\d,.-]/g, '');
    numericValue = parseFloat(cleanedValue.replace(',', '.'));
  } else {
    numericValue = parseFloat(value);
  }
  
  if (isNaN(numericValue)) {
    return "0,00";
  }
  
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
    className="mt-3 pt-3 border-t border-gray-200/50 dark:border-gray-600/50"
  >
    <div className="flex justify-between items-center text-xs">
      <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
        <FaCity className="text-xs" />
        <span>Urbana:</span>
      </div>
      <span className="font-bold">{formatNumber(urbana)}</span>
    </div>
    <div className="flex justify-between items-center text-xs mt-1">
      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
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
    className="mt-3 pt-3 border-t border-gray-200/50 dark:border-gray-600/50"
  >
    <div className="flex justify-between items-center text-xs">
      <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
        <FaCity className="text-xs" />
        <span>Urbana:</span>
      </div>
      <span className="font-bold">{formatNumber(urbana)}</span>
    </div>
    <div className="flex justify-between items-center text-xs mt-1">
      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
        <FaTree className="text-xs" />
        <span>Rural:</span>
      </div>
      <span className="font-bold">{formatNumber(rural)}</span>
    </div>
  </motion.div>
);

// Helper para pegar valor por zona/field com segurança
const getZonaValue = (obj, zona, field) => Number(obj?.[zona]?.[field]) || 0;

// Componente de Tooltip informativo
const InfoTooltip = ({ content, id }) => (
  <>
    <FaInfoCircle 
      className="text-gray-400 hover:text-gray-600 cursor-help text-sm" 
      data-tooltip-id={id}
      data-tooltip-content={content}
    />
    <ReactTooltip id={id} place="top" variant="info" />
  </>
);

// === Exportação (Excel/PDF) corrigida ===
const ExportButtons = ({ data, escolas, loading }) => {
  const toNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const exportToExcel = () => {
    if (loading || !escolas.length) return;

    const rows = escolas.map((esc) => {
      const matric = toNumber(esc.qtde_matriculas);
      const cap    = toNumber(esc.capacidade_total);
      const vagas  = toNumber(esc.vagas_disponiveis);
      const ocup   = cap > 0 ? ((matric * 100) / cap) : 0;

      return {
        Escola: esc.escola,
        Matrículas: matric,
        Capacidade: cap,
        Vagas: vagas,
        Ocupação: `${ocup.toFixed(2).replace('.', ',')}%`,
        Zona: esc.zona_escola || 'Sem informação'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 40 },
      { wch: 12 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 18 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Escolas");
    XLSX.writeFile(workbook, "dados_escolas.xlsx");
  };

  const exportToPDF = () => {
    if (loading || !escolas.length) return;

    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("Relatório de Escolas", 14, 15);

    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 22);

    const taxaOcup = (() => {
      const cap = toNumber(data.capacidadeTotal);
      const atv = toNumber(data.totalMatriculasAtivas);
      return cap > 0 ? ((atv * 100) / cap) : 0;
    })();

    doc.setFontSize(12);
    doc.text(`Total de Matrículas: ${formatNumber(data.totalMatriculas)}`, 14, 32);
    doc.text(`Total de Escolas: ${formatNumber(data.totalEscolas)}`, 14, 38);
    doc.text(`Taxa de Ocupação: ${formatPercent(taxaOcup)}%`, 14, 44);

    const body = escolas.map((esc) => {
      const matric = toNumber(esc.qtde_matriculas);
      const cap    = toNumber(esc.capacidade_total);
      const vagas  = toNumber(esc.vagas_disponiveis);
      const ocup   = cap > 0 ? ((matric * 100) / cap) : 0;

      return [
        esc.escola,
        formatNumber(matric),
        formatNumber(cap),
        formatNumber(vagas),
        `${formatPercent(ocup)}%`,
        esc.zona_escola || 'Sem informação',
      ];
    });

    doc.autoTable({
      startY: 50,
      head: [['Escola', 'Matrículas', 'Capacidade', 'Vagas', 'Ocupação', 'Zona']],
      body,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [99, 102, 241] },
      didDrawPage: () => {
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.setFontSize(9);
        doc.text(`Página ${doc.internal.getNumberOfPages()}`, 14, pageHeight - 8);
      }
    });

    doc.save("relatorio_escolas.pdf");
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={exportToExcel}
        disabled={loading || !escolas.length}
        className="flex items-center gap-2 bg-green-500 text-white px-3 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        title="Exportar para Excel"
      >
        <FaFileExcel />
        <span className="hidden sm:inline">Excel</span>
      </button>
      <button
        onClick={exportToPDF}
        disabled={loading || !escolas.length}
        className="flex items-center gap-2 bg-red-500 text-white px-3 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        title="Exportar para PDF"
      >
        <FaFilePdf />
        <span className="hidden sm:inline">PDF</span>
      </button>
    </div>
  );
};

// Hook para cache local
const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Erro ao salvar no localStorage: ${error}`);
    }
  };

  return [storedValue, setValue];
};

const Dashboard = () => {
  const navigate = useNavigate();

  // === STATES ===
  const [darkMode, setDarkMode] = useLocalStorage("darkMode", false);
  const [filters, setFilters] = useState({});
  const [selectedFilters, setSelectedFilters] = useLocalStorage("selectedFilters", {
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
  const [selectedSchool, setSelectedSchool] = useLocalStorage("selectedSchool", null);
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
  const [activeTab, setActiveTab] = useLocalStorage("activeTab", "overview");
  const [cachedData, setCachedData] = useLocalStorage("cachedData", null);

  // Aplicar modo escuro no body
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

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
    totalMatriculasAtivas: null,
    capacidadePorZona: {},
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
    if (value === null || value === undefined || value === "Erro") return defaultValue;
    let numericValue;
    if (typeof value === 'string') {
      const cleanedValue = value.replace(/[^\d,.-]/g, '');
      numericValue = parseFloat(cleanedValue.replace(',', '.'));
    } else {
      numericValue = parseFloat(value);
    }
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
      
      // Verificar se há filtros salvos
      const savedFilters = JSON.parse(localStorage.getItem("selectedFilters") || "{}");
      const initialFilters = savedFilters.anoLetivo ? savedFilters : { ...selectedFilters, anoLetivo: ultimoAnoLetivo };
      
      setSelectedFilters(initialFilters);
      await carregarDados(initialFilters, signal);
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
      const totaisResponse = await api.post("/totais", filtros, { signal });
      const totaisData = totaisResponse.data;

      const safeData = {
        ...totaisData,
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
        totalMatriculasAtivas: getSafeNumber(totaisData.totalMatriculasAtivas),
        matriculasPorZona: totaisData.matriculasPorZona || {},
        escolasPorZona: totaisData.escolasPorZona || {},
        turmasPorZona: totaisData.turmasPorZona || {},
        entradasSaidasPorMes: totaisData.entradasSaidasPorMes || {},
        matriculasPorSexo: totaisData.matriculasPorSexo || {},
        matriculasPorTurno: totaisData.matriculasPorTurno || {},
        matriculasPorSituacao: totaisData.matriculasPorSituacao || {},
        evolucaoMatriculas: totaisData.evolucaoMatriculas || {},
        escolas: totaisData.escolas || [],
        capacidadePorZona: totaisData.capacidadePorZona || {}
      };

      setData(safeData);
      setCachedData(safeData);

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

      if (Object.keys(filtros).some(key => filtros[key])) {
        setToastMsg("Filtros aplicados com sucesso! 🔍");
        setToastType("info");
        setShowToast(true);
        setTimeout(() => setShowToast(false), 1300);
      }
    } catch (error) {
      if (!error.name === 'AbortError') {
        console.error("Erro ao carregar dados:", error);
        
        if (cachedData) {
          setData(cachedData);
          setToastMsg("Usando dados em cache 📋");
          setToastType("info");
          setShowToast(true);
          setTimeout(() => setShowToast(false), 2000);
        } else {
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
            turmasPorZona: {},
            capacidadePorZona: {}
          }));
        }
      }
      
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
    localStorage.removeItem("selectedFilters");
    localStorage.removeItem("selectedSchool");
    localStorage.removeItem("activeTab");
    localStorage.removeItem("cachedData");
    navigate("/login", { replace: true });
  }, [navigate]);

  // Memoização dos dados para gráficos
  const chartData = useMemo(() => {
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
          legend: { position: "top", labels: { color: darkMode ? "#E5E7EB" : "#6B7280", font: { size: 12, weight: "bold" } } },
          datalabels: { display: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: darkMode ? "#E5E7EB" : "#6B7280", font: { weight: "bold" } },
          },
          y: {
            grid: { color: darkMode ? "#374151" : "#E5E7EB" },
            ticks: { 
              color: darkMode ? "#E5E7EB" : "#6B7280", 
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
          legend: { position: "bottom", labels: { font: { size: 12, weight: "bold" }, color: darkMode ? "#E5E7EB" : "#6B7280" } },
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
            grid: { color: darkMode ? "#374151" : "#E5E7EB" },
            ticks: { 
              color: darkMode ? "#E5E7EB" : "#6B7280", 
              font: { weight: "bold" }, 
              callback: (value) => formatNumber(value) 
            },
          },
          y: {
            grid: { display: false },
            ticks: { color: darkMode ? "#E5E7EB" : "#6B7280", font: { weight: "bold" } },
          },
        },
        layout: { padding: { left: 20, right: 20 } },
      },
      situacao: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 11, weight: "bold" }, color: darkMode ? "#E5E7EB" : "#6B7280" } },
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
            ticks: { color: darkMode ? "#E5E7EB" : "#6B7280", font: { weight: "bold" } },
          },
          y: {
            grid: { color: darkMode ? "#374151" : "#E5E7EB" },
            ticks: { 
              color: darkMode ? "#E5E7EB" : "#6B7280", 
              font: { weight: "bold" }, 
              callback: (value) => formatNumber(value) 
            },
          },
        },
      }
    };
  }, [darkMode]);

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
    <DarkModeContext.Provider value={{ darkMode, setDarkMode }}>
      <div className={`h-screen w-screen flex flex-col ${darkMode 
        ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100' 
        : 'bg-gradient-to-br from-slate-50 via-white to-slate-50 text-slate-800'
      } relative overflow-hidden`}>
        <AnimatePresence>
          {showToast && <Toast message={toastMsg} show={showToast} type={toastType} />}
          {isLoading && <GlobalLoading />}
        </AnimatePresence>

        {/* HEADER FIXO NO TOPO */}
        <div className={`w-full ${darkMode ? 'bg-slate-900/95' : 'bg-white/95'} backdrop-blur-sm shadow-lg border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'} z-40`}>
          <div className="flex items-center justify-between px-4 py-4 md:px-8 md:py-5">
            <div className="flex items-center gap-4 flex-1">
              <button
                id="filterButton"
                onClick={() => setShowSidebar(true)}
                className={`${darkMode ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-900 hover:bg-black'} text-white rounded-2xl shadow-xl flex items-center justify-center p-3 transition-all duration-300 transform hover:scale-105`}
                style={{ fontSize: 28, minWidth: 52, minHeight: 52 }}
                title="Abrir filtros"
              >
                <FaFilter />
              </button>

              <div className="flex flex-col">
                <h1
                  className="font-bold drop-shadow-sm"
                  style={{
                    fontSize: 'clamp(1.3rem, 2.8vw, 2.2rem)',
                    lineHeight: 1.2,
                  }}
                >
                  {clientName || "SEMED - PAINEL"}
                </h1>
                <span className={`text-[0.95rem] md:text-lg ${darkMode ? 'text-slate-300' : 'text-slate-600'} font-medium`}>
                  Dashboard de Gestão Educacional
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Botão Modo Escuro */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`p-3 rounded-2xl shadow-lg transition-all duration-300 transform hover:scale-105 ${
                  darkMode 
                    ? 'bg-yellow-500 text-white hover:bg-yellow-600' 
                    : 'bg-slate-900 text-white hover:bg-black'
                }`}
                title={darkMode ? "Modo Claro" : "Modo Escuro"}
                style={{ fontSize: 28, minWidth: 52, minHeight: 52 }}
              >
                {darkMode ? <FaSun /> : <FaMoon />}
              </button>

              {formattedUpdateDate && (
                <div className="hidden md:flex flex-col items-end">
                  <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'} font-semibold`}>
                    Última atualização
                  </span>
                  <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'} font-bold`}>
                    {formattedUpdateDate}
                  </span>
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
            <div className={`md:hidden p-2 text-center text-sm ${darkMode ? 'bg-slate-800/80 text-slate-300' : 'bg-slate-100/80 text-slate-700'}`}>
              Atualizado: {formattedUpdateDate}
            </div>
          )}

          {/* Navegação por abas (ajustada) */}
          <div className={`flex border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
            {['overview','analytics','geographic'].map((tab, idx) => {
              const icons = [<FaChartBar/>, <FaChartLine/>, <FaMapMarkerAlt/>];
              const labels = ['Visão Geral','Analytics','Geográfica'];
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-2 px-4 sm:px-6 py-3 font-semibold transition-all ${
                    active
                      ? `${darkMode ? 'text-sky-400 border-b-2 border-sky-400 bg-slate-800' : 'text-sky-700 border-b-2 border-sky-600 bg-slate-50'}`
                      : `${darkMode ? 'text-slate-400 hover:text-sky-300' : 'text-slate-600 hover:text-sky-600'}`
                  }`}
                >
                  {icons[idx]}
                  <span className="hidden xs:inline">{labels[idx]}</span>
                </button>
              );
            })}
          </div>

          {/* Badge para filtro de escola ativo */}
          {selectedSchool && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`text-center py-2 ${darkMode ? 'bg-slate-800/80' : 'bg-slate-50/80'}`}
            >
              <span className="bg-sky-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg">
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
        <div className="flex-1 overflow-auto p-2 sm:p-4">
          
          {/* ABA: VISÃO GERAL */}
          {activeTab === "overview" && (
            <>
              {/* Alertas Estratégicos */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
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

              {/* Grid de Cartões Principais CORRIGIDOS */}
              <div className="grid grid-cols-2 min-[320px]:grid-cols-2 min-[461px]:grid-cols-3 min-[720px]:grid-cols-4 min-[1024px]:grid-cols-7 gap-3 sm:gap-4 mb-4 sm:mb-6">
                <Card
                  label="Matrículas"
                  value={formatNumber(data.totalMatriculas)}
                  icon={<FaUserGraduate className="text-blue-500" />}
                  borderColor={darkMode ? "border-blue-600" : "border-blue-400"}
                  bgColor={darkMode ? "bg-slate-900/50" : "bg-blue-50"}
                  loading={loadingCards.totalMatriculas}
                  tooltip="Total de alunos matriculados no sistema"
                  tooltipId="total-matriculas"
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
                  borderColor={darkMode ? "border-green-600" : "border-green-400"}
                  bgColor={darkMode ? "bg-slate-900/50" : "bg-green-50"}
                  loading={loadingCards.totalEscolas}
                  tooltip="Total de escolas ativas no sistema"
                  tooltipId="total-escolas"
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
                  borderColor={darkMode ? "border-indigo-600" : "border-indigo-400"}
                  bgColor={darkMode ? "bg-slate-900/50" : "bg-indigo-50"}
                  loading={loadingCards.capacidadeTotal}
                  tooltip="Capacidade total de alunos no sistema"
                  tooltipId="capacidade-total"
                  additionalContent={
                    <ZonaDetails 
                      urbana={getZonaValue(data.capacidadePorZona, "URBANA", "capacidade")}
                      rural={getZonaValue(data.capacidadePorZona, "RURAL", "capacidade")}
                    />
                  }
                />
                
                <Card
                  label="Vagas"
                  value={formatNumber(data.totalVagas)}
                  icon={<FaUsers className="text-teal-500" />}
                  borderColor={darkMode ? "border-teal-600" : "border-teal-400"}
                  bgColor={darkMode ? "bg-slate-900/50" : "bg-teal-50"}
                  loading={loadingCards.totalVagas}
                  valueColor={data.totalVagas < 0 ? "red" : "green"}
                  tooltip="Vagas disponíveis no sistema"
                  tooltipId="total-vagas"
                  additionalContent={
                    <ZonaDetails 
                      urbana={getZonaValue(data.capacidadePorZona, "URBANA", "vagas")}
                      rural={getZonaValue(data.capacidadePorZona, "RURAL", "vagas")}
                    />
                  }
                />
                
                <Card
                  label="Entradas"
                  value={formatNumber(data.totalEntradas)}
                  icon={<FaSignInAlt className="text-yellow-500" />}
                  borderColor={darkMode ? "border-yellow-600" : "border-yellow-400"}
                  bgColor={darkMode ? "bg-slate-900/50" : "bg-yellow-50"}
                  loading={loadingCards.totalEntradas}
                  tooltip="Total de matrículas de entrada"
                  tooltipId="total-entradas"
                />
                
                <Card
                  label="Saídas"
                  value={formatNumber(data.totalSaidas)}
                  icon={<FaSignOutAlt className="text-red-500" />}
                  borderColor={darkMode ? "border-red-600" : "border-red-400"}
                  bgColor={darkMode ? "bg-slate-900/50" : "bg-red-50"}
                  loading={loadingCards.totalSaidas}
                  tooltip="Total de matrículas de saída"
                  tooltipId="total-saidas"
                />

                {/* CORREÇÃO DEFINITIVA: Card de Taxa de Evasão */}
                <Card
                  label="Taxa Evasão"
                  value={`${formatPercent(data.taxaEvasao)}%`}
                  disableFormat={true}
                  icon={<FaExclamationTriangle className="text-orange-500" />}
                  borderColor={darkMode ? "border-orange-600" : "border-orange-400"}
                  bgColor={darkMode ? "bg-slate-900/50" : "bg-orange-50"}
                  loading={loadingCards.taxaEvasao}
                  valueColor={data.taxaEvasao > 10 ? "red" : data.taxaEvasao > 5 ? "orange" : "green"}
                  tooltip="Percentual de alunos que deixaram o sistema"
                  tooltipId="taxa-evasao"
                />
              </div>

              {/* Área Principal - Tabela e Gráficos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
                {/* Tabela Detalhes por Escola */}
                <div className={`${darkMode ? 'bg-slate-900/90' : 'bg-white'} backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[400px] ${darkMode ? 'border-slate-800' : 'border-slate-200'} border`}>
                  <div className={`p-3 sm:p-4 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'} border-b flex justify-between items-center`}>
                    <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                      <FaSchool className="text-sky-500" />
                      Detalhes por Escola
                    </h3>
                    <div className="flex gap-2">
                      <ExportButtons data={data} escolas={filteredEscolas} loading={loadingTable} />
                      <button 
                        onClick={() => setShowSearch(!showSearch)}
                        className="bg-sky-600 text-white p-2 rounded-xl hover:bg-sky-700 transition-colors shadow"
                      >
                        <FaSearch size={18} />
                      </button>
                    </div>
                  </div>
                  
                  {showSearch && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className={`p-3 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} border-b`}
                    >
                      <input
                        type="text"
                        placeholder="Buscar escola..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                        style={{ textTransform: "uppercase" }}
                        className={`w-full p-3 border rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent ${
                          darkMode 
                            ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' 
                            : 'border-slate-300 text-slate-800'
                        }`}
                      />
                    </motion.div>
                  )}
                  
                  <div className="overflow-auto flex-1">
                    {loadingTable ? (
                      <div className="p-4 sm:p-6">
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
                          darkMode={darkMode}
                        />
                      </Suspense>
                    )}
                  </div>
                </div>
                
                {/* Gráfico Movimentação Mensal */}
                <div className={`${darkMode ? 'bg-slate-900/90' : 'bg-white'} backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 flex flex-col h-[400px] ${darkMode ? 'border-slate-800' : 'border-slate-200'} border`}>
                  <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2">
                    <FaSync className="text-sky-500" />
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
                          darkMode={darkMode}
                        />
                      </Suspense>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Gráficos Adicionais */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
                {/* Gráfico Matrículas por Sexo */}
                <div className={`${darkMode ? 'bg-slate-900/90' : 'bg-white'} backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 flex flex-col h-[300px] ${darkMode ? 'border-slate-800' : 'border-slate-200'} border`}>
                  <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2">
                    <FaUserGraduate className="text-sky-500" />
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
                          darkMode={darkMode}
                        />
                      </Suspense>
                    )}
                  </div>
                </div>
                
                {/* Gráfico Matrículas por Turno */}
                <div className={`${darkMode ? 'bg-slate-900/90' : 'bg-white'} backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 flex flex-col h-[300px] ${darkMode ? 'border-slate-800' : 'border-slate-200'} border`}>
                  <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2">
                    <FaChalkboardTeacher className="text-sky-500" />
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
                          darkMode={darkMode}
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
            <div className="space-y-4 sm:space-y-6">
              {/* Indicadores de Performance */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
                {/* CORREÇÃO DEFINITIVA: Card de Ocupação */}
                <Card
                  label="Ocupação"
                  value={`${formatPercent(data.taxaOcupacao)}%`}
                  disableFormat={true}
                  icon={<FaUsers className="text-indigo-500" />}
                  borderColor={darkMode ? "border-indigo-600" : "border-indigo-400"}
                  bgColor={darkMode ? "bg-slate-900/50" : "bg-indigo-50"}
                  loading={loadingCards.taxaOcupacao}
                  valueColor={data.taxaOcupacao > 90 ? "orange" : "green"}
                  tooltip="Percentual de ocupação das vagas disponíveis"
                  tooltipId="taxa-ocupacao"
                />

                <Card
                  label="Transporte Escolar"
                  value={formatNumber(data.alunosTransporteEscolar)}
                  icon={<FaBus className="text-amber-500" />}
                  borderColor={darkMode ? "border-amber-600" : "border-amber-400"}
                  bgColor={darkMode ? "bg-slate-900/50" : "bg-amber-50"}
                  loading={loadingCards.transporteEscolar}
                  tooltip="Alunos que utilizam transporte escolar"
                  tooltipId="transporte-escolar"
                  additionalContent={
                    <div className={`mt-3 pt-3 border-t ${darkMode ? 'border-gray-600/50' : 'border-gray-200/50'} text-xs text-center`}>
                      <span className="font-bold">{formatPercent((data.alunosTransporteEscolar * 100) / (data.totalMatriculas || 1))}%</span>
                      <span className={darkMode ? "text-slate-400" : "text-slate-600"}> do total</span>
                    </div>
                  }
                />

                {/* CORREÇÃO DEFINITIVA: Card de Taxa de Evasão */}
                <Card
                  label="Taxa de Evasão"
                  value={`${formatPercent(data.taxaEvasao)}%`}
                  disableFormat={true}
                  icon={<FaExclamationTriangle className="text-red-500" />}
                  borderColor={darkMode ? "border-red-600" : "border-red-400"}
                  bgColor={darkMode ? "bg-slate-900/50" : "bg-red-50"}
                  loading={loadingCards.taxaEvasao}
                  valueColor={data.taxaEvasao > 10 ? "red" : "green"}
                  tooltip="Percentual de evasão escolar"
                  tooltipId="taxa-evasao-analytics"
                  additionalContent={
                    <div className={`mt-3 pt-3 border-t ${darkMode ? 'border-gray-600/50' : 'border-gray-200/50'} text-xs text-center`}>
                      <span className={data.taxaEvasao > 10 ? "text-red-500 font-bold" : "text-green-500 font-bold"}>
                        {data.taxaEvasao > 10 ? "Alerta" : "Normal"}
                      </span>
                    </div>
                  }
                />

                <Card
                  label="Com Deficiência"
                  value={formatNumber(data.alunosComDeficiencia)}
                  icon={<FaWheelchair className="text-teal-500" />}
                  borderColor={darkMode ? "border-teal-600" : "border-teal-400"}
                  bgColor={darkMode ? "bg-slate-900/50" : "bg-teal-50"}
                  loading={loadingCards.alunosDeficiencia}
                  tooltip="Alunos com necessidades especiais"
                  tooltipId="alunos-deficiencia"
                  additionalContent={
                    <div className={`mt-3 pt-3 border-t ${darkMode ? 'border-gray-600/50' : 'border-gray-200/50'} text-xs text-center`}>
                      <span className="font-bold">{formatPercent((data.alunosComDeficiencia * 100) / (data.totalMatriculas || 1))}%</span>
                      <span className={darkMode ? "text-slate-400" : "text-slate-600"}> do total</span>
                    </div>
                  }
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {/* Gráfico Situação da Matrícula */}
                <div className={`${darkMode ? 'bg-slate-900/90' : 'bg-white'} backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 flex flex-col h-[400px] ${darkMode ? 'border-slate-800' : 'border-slate-200'} border`}>
                  <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2">
                    <FaClock className="text-sky-500" />
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
                          darkMode={darkMode}
                        />
                      </Suspense>
                    )}
                  </div>
                </div>

                {/* Gráfico Evolução de Matrículas */}
                <div className={`${darkMode ? 'bg-slate-900/90' : 'bg-white'} backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 flex flex-col h-[400px] ${darkMode ? 'border-slate-800' : 'border-slate-200'} border`}>
                  <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2">
                    <FaChartLine className="text-sky-500" />
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
                          darkMode={darkMode}
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
            <div className="space-y-4 sm:space-y-6">
              <div className={`${darkMode ? 'bg-slate-900/90' : 'bg-white'} backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 flex flex-col h-[500px] sm:h-[600px] ${darkMode ? 'border-slate-800' : 'border-slate-200'} border`}>
                <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2">
                  <FaMapMarkerAlt className="text-sky-500" />
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
                        darkMode={darkMode}
                      />
                    </Suspense>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className={`${darkMode ? 'bg-slate-900/90' : 'bg-white'} backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 ${darkMode ? 'border-slate-800' : 'border-slate-200'} border`}>
                  <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2">
                    <FaCity className="text-sky-500" />
                    Distribuição por Zona
                  </h3>
                  <div className="space-y-4">
                    <div className={`flex justify-between items-center p-3 rounded-lg ${darkMode ? 'bg-sky-900/20' : 'bg-sky-50'}`}>
                      <span className={`font-semibold ${darkMode ? 'text-sky-300' : 'text-sky-700'}`}>Urbana</span>
                      <span className={`font-bold ${darkMode ? 'text-sky-200' : 'text-sky-900'}`}>
                        {formatNumber(data.matriculasPorZona?.["URBANA"])} 
                        <span className={`text-sm ${darkMode ? 'text-sky-300' : 'text-sky-600'} ml-2`}>
                          ({data.matriculasPorZona?.["URBANA"] && data.totalMatriculas ? 
                          ((data.matriculasPorZona["URBANA"] / data.totalMatriculas) * 100).toFixed(1) : 0}%)
                        </span>
                      </span>
                    </div>
                    <div className={`flex justify-between items-center p-3 rounded-lg ${darkMode ? 'bg-emerald-900/20' : 'bg-emerald-50'}`}>
                      <span className={`font-semibold ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>Rural</span>
                      <span className={`font-bold ${darkMode ? 'text-emerald-200' : 'text-emerald-900'}`}>
                        {formatNumber(data.matriculasPorZona?.["RURAL"])}
                        <span className={`text-sm ${darkMode ? 'text-emerald-300' : 'text-emerald-600'} ml-2`}>
                          ({data.matriculasPorZona?.["RURAL"] && data.totalMatriculas ? 
                          ((data.matriculasPorZona["RURAL"] / data.totalMatriculas) * 100).toFixed(1) : 0}%)
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className={`${darkMode ? 'bg-slate-900/90' : 'bg-white'} backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 ${darkMode ? 'border-slate-800' : 'border-slate-200'} border`}>
                  <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2">
                    <FaSchool className="text-sky-500" />
                    Densidade Escolar
                  </h3>
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-2xl sm:text-3xl font-bold text-sky-600">
                        {data.totalEscolas && data.totalMatriculas ? 
                          Math.round(data.totalMatriculas / data.totalEscolas) : 0}
                      </div>
                      <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Alunos por escola (média)</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className={`p-2 rounded ${darkMode ? 'bg-sky-900/20' : 'bg-sky-50'}`}>
                        <div className={`font-bold ${darkMode ? 'text-sky-300' : 'text-sky-700'}`}>{data.escolasPorZona?.["URBANA"] || 0}</div>
                        <div className={`text-xs ${darkMode ? 'text-sky-300' : 'text-sky-600'}`}>Escolas Urbanas</div>
                      </div>
                      <div className={`p-2 rounded ${darkMode ? 'bg-emerald-900/20' : 'bg-emerald-50'}`}>
                        <div className={`font-bold ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>{data.escolasPorZona?.["RURAL"] || 0}</div>
                        <div className={`text-xs ${darkMode ? 'text-emerald-300' : 'text-emerald-600'}`}>Escolas Rurais</div>
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
                className={`fixed inset-y-0 left-0 ${darkMode ? 'bg-slate-900' : 'bg-white'} w-80 md:w-96 p-6 shadow-2xl z-50 ${darkMode ? 'border-slate-800' : 'border-slate-200'} border-r overflow-y-auto`}
              >
                <div className={`flex justify-between items-center mb-8 pb-4 ${darkMode ? 'border-slate-800' : 'border-slate-200'} border-b`}>
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <FaFilter className="text-sky-500" />
                    Filtros
                  </h2>
                  <button 
                    onClick={() => setShowSidebar(false)} 
                    className={`text-slate-500 hover:text-sky-600 transition-colors text-2xl ${darkMode ? 'bg-slate-800' : 'bg-slate-100'} p-2 rounded-xl ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-200'}`}
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
                    darkMode={darkMode}
                  />
                  <FilterSelect
                    label="Tipo Matrícula"
                    name="tipoMatricula"
                    options={filters.tipo_matricula}
                    value={selectedFilters.tipoMatricula}
                    onChange={handleFilterChange}
                    darkMode={darkMode}
                  />
                  <FilterSelect
                    label="Situação Matrícula"
                    name="situacaoMatricula"
                    options={filters.situacao_matricula}
                    value={selectedFilters.situacaoMatricula}
                    onChange={handleFilterChange}
                    darkMode={darkMode}
                  />
                  <FilterSelect
                    label="Grupo Etapa"
                    name="grupoEtapa"
                    options={filters.grupo_etapa}
                    value={selectedFilters.grupoEtapa}
                    onChange={handleFilterChange}
                    darkMode={darkMode}
                  />
                  <FilterSelect
                    label="Etapa Matrícula"
                    name="etapaMatricula"
                    options={filters.etapa_matricula}
                    value={selectedFilters.etapaMatricula}
                    onChange={handleFilterChange}
                    disabled={selectedFilters.etapaTurma !== ""}
                    darkMode={darkMode}
                  />
                  <FilterSelect
                    label="Etapa Turma"
                    name="etapaTurma"
                    options={filters.etapa_turma}
                    value={selectedFilters.etapaTurma}
                    onChange={handleFilterChange}
                    disabled={selectedFilters.etapaMatricula !== ""}
                    darkMode={darkMode}
                  />
                  <FilterSelect
                    label="Multissérie"
                    name="multisserie"
                    options={filters.multisserie}
                    value={selectedFilters.multisserie}
                    onChange={handleFilterChange}
                    darkMode={darkMode}
                  />
                  <FilterSelect
                    label="Deficiência"
                    name="deficiencia"
                    options={filters.deficiencia}
                    value={selectedFilters.deficiencia}
                    onChange={handleFilterChange}
                    darkMode={darkMode}
                  />
                  <FilterSelect
                    label="Transporte Escolar"
                    name="transporteEscolar"
                    options={filters.transporte_escolar}
                    value={selectedFilters.transporteEscolar}
                    onChange={handleFilterChange}
                    darkMode={darkMode}
                  />
                  <FilterSelect
                    label="Tipo Transporte"
                    name="tipoTransporte"
                    options={filters.tipo_transporte}
                    value={selectedFilters.tipoTransporte}
                    onChange={handleFilterChange}
                    disabled={selectedFilters.transporteEscolar !== "SIM"}
                    darkMode={darkMode}
                  />
                </div>
                
                <div className={`mt-8 pt-6 ${darkMode ? 'border-slate-800' : 'border-slate-200'} border-t flex justify-center`}>
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
                    className="bg-sky-600 text-white px-8 py-3 rounded-xl hover:bg-sky-700 transition-all duration-300 shadow-lg font-semibold"
                  >
                    🔄 Limpar Filtros
                  </button>
                </div>

                {/* Informações de Cache */}
                <div className={`mt-6 p-4 rounded-lg ${darkMode ? 'bg-slate-800/50' : 'bg-slate-100/80'} text-sm`}>
                  <div className="flex items-center gap-2 mb-2">
                    <FaDatabase className="text-sky-500" />
                    <span className="font-semibold">Sistema de Cache</span>
                  </div>
                  <p className={darkMode ? 'text-slate-300' : 'text-slate-600'}>
                    Seus filtros e preferências são salvos automaticamente.
                  </p>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </DarkModeContext.Provider>
  );
};

export default Dashboard;
