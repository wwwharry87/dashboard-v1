// Dashboard.js - VERSÃO COM CARDS COMPACTOS (AJUSTADO: Excel/PDF + Layout cards sem buraco + remove Taxa Evasão da HOME)
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  Suspense,
  lazy,
  createContext,
} from "react";
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
  FaInfoCircle,
  FaFileExcel,
  FaFilePdf,
  FaDatabase,
  FaHome,
  FaRobot,
} from "react-icons/fa";
import { Tooltip as ReactTooltip } from "react-tooltip";
import { motion, AnimatePresence } from "framer-motion";

// Importação dos componentes otimizados
import FilterSelect from "./components/FilterSelect";
import Card from "./components/Card";
import AiAssistant from "./components/AiAssistant";

// Lazy loading de componentes
const EscolasTable = lazy(() => import("./components/EscolasTable"));
const MovimentacaoChart = lazy(() => import("./components/MovimentacaoChart"));
const SexoChart = lazy(() => import("./components/SexoChart"));
const TurnoChart = lazy(() => import("./components/TurnoChart"));
const SituacaoMatriculaChart = lazy(() =>
  import("./components/SituacaoMatriculaChart")
);
const EvolucaoMatriculasChart = lazy(() =>
  import("./components/EvolucaomatriculasChart")
);
const MapaCalorEscolas = lazy(() => import("./components/MapacalorEscolas"));

// Context para configurações
const AppContext = createContext();

// Spinner com melhor feedback visual
const Spinner = () => (
  <div className="flex flex-col items-center justify-center">
    <svg
      className="animate-spin h-8 w-8 text-violet-600"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8z"
      ></path>
    </svg>
    <span className="mt-2 text-violet-700 font-semibold animate-pulse">
      Carregando...
    </span>
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
    className="fixed top-4 right-4 z-50 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
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
        ${
          type === "success"
            ? "bg-gradient-to-r from-green-500 to-green-600"
            : "bg-gradient-to-r from-blue-500 to-blue-600"
        }
        text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-lg font-semibold
      `}
    >
      <span role="img" aria-label="party">
        {type === "success" ? "🎉" : "🔍"}
      </span>
      {message}
    </motion.div>
  ) : null;

// === Formatadores (mantidos aqui por compatibilidade com seu arquivo atual) ===
const formatNumber = (num) => {
  if (num == null || num === "" || num === "Erro" || isNaN(num)) {
    return "0";
  }
  const number = Number(num) || 0;
  return number.toLocaleString("pt-BR");
};

const formatPercent = (value) => {
  if (value == null || value === "" || value === "Erro" || isNaN(value)) {
    return "0,00";
  }
  const number = parseFloat(value) || 0;
  return number.toFixed(2).replace(".", ",");
};

// === Normalização robusta de campos (resolve colunas em branco no Excel/PDF) ===
const pick = (obj, keys, fallback = null) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return fallback;
};

const normalizeSchoolRow = (esc) => {
  // Ajuste de chaves mais comuns (se ainda vier branco, me manda um console.log(data.escolas[0]) e eu travo 100%)
  const escola = pick(esc, ["escola", "nomeEscola", "nome", "ds_escola"], "N/A");

  const matriculas = Number(
    pick(
      esc,
      [
        "total_matriculas",
        "totalMatriculas",
        "matriculas",
        "qtd_matriculas",
        "qtdMatriculas",
        "matriculas_total",
        "matriculasTotal",
      ],
      0
    )
  );

  const capacidade = Number(
    pick(
      esc,
      ["capacidade", "capacidadeTotal", "capacidade_total", "capacidadeTotalEscola"],
      0
    )
  );

  const vagas = Number(
    pick(
      esc,
      ["vagas", "totalVagas", "vagasDisponiveis", "vagas_disponiveis", "vagasDisponiveisEscola"],
      0
    )
  );

  const ocupacao = Number(
    pick(esc, ["taxa_ocupacao", "taxaOcupacao", "ocupacao", "ocupacaoPercentual"], 0)
  );

  const zona = String(
    pick(
      esc,
      ["zona", "localizacao", "area", "tp_zona", "zona_escola", "zonaEscola"],
      "N/A"
    )
  );

  return { escola, matriculas, capacidade, vagas, ocupacao, zona };
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
    className="mt-1 pt-1 border-t border-gray-200/50"
  >
    <div className="flex justify-between items-center text-[10px]">
      <div className="flex items-center gap-1 text-blue-600">
        <FaCity className="text-[8px]" />
        <span>Urbana:</span>
      </div>
      <span className="font-bold">{formatNumber(urbana)}</span>
    </div>
    <div className="flex justify-between items-center text-[10px] mt-0.5">
      <div className="flex items-center gap-1 text-green-600">
        <FaTree className="text-[8px]" />
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
    className="mt-1 pt-1 border-t border-gray-200/50"
  >
    <div className="flex justify-between items-center text-[10px]">
      <div className="flex items-center gap-1 text-blue-600">
        <FaCity className="text-[8px]" />
        <span>Urbana:</span>
      </div>
      <span className="font-bold">{formatNumber(urbana)}</span>
    </div>
    <div className="flex justify-between items-center text-[10px] mt-0.5">
      <div className="flex items-center gap-1 text-green-600">
        <FaTree className="text-[8px]" />
        <span>Rural:</span>
      </div>
      <span className="font-bold">{formatNumber(rural)}</span>
    </div>
  </motion.div>
);

// Componente para mostrar detalhes de evasão por zona
const ZonaEvasaoDetails = ({ urbana, rural }) => (
  <motion.div
    initial={{ opacity: 0, height: 0 }}
    animate={{ opacity: 1, height: "auto" }}
    className="mt-1 pt-1 border-t border-gray-200/50"
  >
    <div className="flex justify-between items-center text-[10px]">
      <div className="flex items-center gap-1 text-blue-600">
        <FaCity className="text-[8px]" />
        <span>Urbana:</span>
      </div>
      <span className="font-bold">{formatPercent(urbana)}%</span>
    </div>
    <div className="flex justify-between items-center text-[10px] mt-0.5">
      <div className="flex items-center gap-1 text-green-600">
        <FaTree className="text-[8px]" />
        <span>Rural:</span>
      </div>
      <span className="font-bold">{formatPercent(rural)}%</span>
    </div>
  </motion.div>
);

// Componente para indicadores de alerta
const AlertIndicator = ({ type, value, label }) => {
  const getColor = () => {
    if (type === "high") return "text-red-600 bg-red-50 border-red-200";
    if (type === "medium")
      return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-green-600 bg-green-50 border-green-200";
  };

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-lg border ${getColor()} shadow-sm`}
    >
      <FaExclamationTriangle className="text-sm" />
      <span className="text-sm font-semibold">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
};

// Tooltip informativo
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

// ✅ Exportação Excel (exceljs) - 2 abas: Resumo + Escolas
const exportToExcel = async (escolas, data) => {
  if (!escolas || escolas.length === 0) {
    alert("Nenhum dado disponível para exportação");
    return;
  }

  try {
    const ExcelJSModule = await import("exceljs");
    const ExcelJS = ExcelJSModule?.default ?? ExcelJSModule;

    const wb = new ExcelJS.Workbook();
    wb.creator = "Dashboard";
    wb.created = new Date();

    // =========================
    // Aba 1: RESUMO
    // =========================
    const wsResumo = wb.addWorksheet("Resumo");

    wsResumo.columns = [
      { header: "Métrica", key: "metrica", width: 32 },
      { header: "Valor", key: "valor", width: 18 },
    ];

    wsResumo.addRows([
      { metrica: "Total de Matrículas", valor: data?.totalMatriculas ?? 0 },
      { metrica: "Total de Escolas", valor: data?.totalEscolas ?? 0 },
      { metrica: "Capacidade Total", valor: data?.capacidadeTotal ?? 0 },
      { metrica: "Vagas Disponíveis", valor: data?.totalVagas ?? 0 },
      { metrica: "Taxa de Ocupação (%)", valor: Number(data?.taxaOcupacao ?? 0) },
      { metrica: "Entradas", valor: data?.totalEntradas ?? 0 },
      { metrica: "Saídas", valor: data?.totalSaidas ?? 0 },
      // pode manter no resumo mesmo removendo o card da Home
      { metrica: "Taxa de Evasão (%)", valor: Number(data?.taxaEvasao ?? 0) },
    ]);

    wsResumo.getRow(1).font = { bold: true };

    // =========================
    // Aba 2: ESCOLAS
    // =========================
    const wsEscolas = wb.addWorksheet("Escolas");

    wsEscolas.columns = [
      { header: "Escola", key: "escola", width: 40 },
      { header: "Matrículas", key: "matriculas", width: 12 },
      { header: "Capacidade", key: "capacidade", width: 12 },
      { header: "Vagas", key: "vagas", width: 10 },
      { header: "Ocupação (%)", key: "ocupacao", width: 12 },
      { header: "Zona", key: "zona", width: 10 },
    ];

    wsEscolas.getRow(1).font = { bold: true };

    escolas.forEach((esc) => {
      const row = normalizeSchoolRow(esc);
      wsEscolas.addRow(row);
    });

    wsResumo.views = [{ state: "frozen", ySplit: 1 }];
    wsEscolas.views = [{ state: "frozen", ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const dataHora = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const fileName = `dados_escolas_${dataHora}.xlsx`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Erro na exportação Excel:", error);
    alert("Erro ao exportar para Excel. Verifique o console.");
  }
};

// ✅ Exportação PDF (jsPDF + jspdf-autotable) compatível com CRA/ESM
const exportToPDF = async (escolas, data) => {
  if (!escolas || escolas.length === 0) {
    alert("Nenhum dado disponível para exportação");
    return;
  }

  try {
    const jsPDFModule = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");

    const jsPDF = jsPDFModule?.jsPDF ?? jsPDFModule?.default ?? jsPDFModule;

    // Resolver robusto para autoTable (CRA/ESM varia muito)
    const resolveAutoTable = (mod) => {
      if (!mod) return null;
      if (typeof mod === "function") return mod;
      if (typeof mod?.default === "function") return mod.default;
      if (typeof mod?.autoTable === "function") return mod.autoTable;
      if (typeof mod?.default?.autoTable === "function") return mod.default.autoTable;
      return null;
    };

    const autoTable = resolveAutoTable(autoTableModule);
    if (!autoTable) {
      throw new Error(
        "jspdf-autotable não carregou corretamente (autoTable não encontrado)."
      );
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("RELATÓRIO DE ESCOLAS - SEMED", pageWidth / 2, 18, {
      align: "center",
    });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, 28);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("RESUMO:", margin, 40);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    const resumo = [
      ["Total de Matrículas", String(data?.totalMatriculas ?? 0)],
      ["Total de Escolas", String(data?.totalEscolas ?? 0)],
      ["Capacidade Total", String(data?.capacidadeTotal ?? 0)],
      ["Vagas Disponíveis", String(data?.totalVagas ?? 0)],
      ["Taxa de Ocupação (%)", String(data?.taxaOcupacao ?? 0)],
      ["Entradas", String(data?.totalEntradas ?? 0)],
      ["Saídas", String(data?.totalSaidas ?? 0)],
      ["Taxa de Evasão (%)", String(data?.taxaEvasao ?? 0)],
    ];

    autoTable(doc, {
      startY: 44,
      head: [["Métrica", "Valor"]],
      body: resumo,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fontStyle: "bold" },
    });

    const startY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 10 : 80;

    // tabela escolas (normalizada)
    const body = escolas.map((esc) => {
      const row = normalizeSchoolRow(esc);
      return [
        row.escola,
        String(row.matriculas ?? 0),
        String(row.capacidade ?? 0),
        String(row.vagas ?? 0),
        String(row.ocupacao ?? 0),
        row.zona ?? "N/A",
      ];
    });

    autoTable(doc, {
      startY,
      head: [["Escola", "Matrículas", "Capacidade", "Vagas", "Ocupação (%)", "Zona"]],
      body,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fontStyle: "bold" },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.text(
          `Página ${doc.internal.getNumberOfPages()}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: "center" }
        );
      },
    });

    const dataHora = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    doc.save(`relatorio_escolas_${dataHora}.pdf`);
  } catch (error) {
    console.error("Erro na exportação PDF:", error);
    alert("Erro ao exportar para PDF. Verifique o console.");
  }
};

// Componente de Exportação
const ExportButtons = ({ data, escolas, loading }) => {
  const handleExportExcel = () => {
    if (loading) {
      alert("Aguarde o carregamento dos dados");
      return;
    }
    exportToExcel(escolas, data);
  };

  const handleExportPDF = () => {
    if (loading) {
      alert("Aguarde o carregamento dos dados");
      return;
    }
    exportToPDF(escolas, data);
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handleExportExcel}
        disabled={loading || !escolas || escolas.length === 0}
        className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-green-600 text-white px-3 py-2 rounded-lg hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-sm text-sm font-semibold"
        title="Exportar para Excel"
      >
        <FaFileExcel />
        <span className="hidden sm:inline">Excel</span>
      </button>
      <button
        onClick={handleExportPDF}
        disabled={loading || !escolas || escolas.length === 0}
        className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-red-600 text-white px-3 py-2 rounded-lg hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-sm text-sm font-semibold"
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
  const [filters, setFilters] = useState({});
  const [selectedFilters, setSelectedFilters] = useLocalStorage("selectedFilters", {
    anoLetivo: "",
    // ✅ filtros de interação por clique nos gráficos
    sexo: "",
    turno: "",
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
  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  const [activeTab, setActiveTab] = useLocalStorage("activeTab", "overview");
  const [cachedData, setCachedData] = useLocalStorage("cachedData", null);

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
    detalhesZona: {
      entradas: { urbana: 0, rural: 0 },
      saidas: { urbana: 0, rural: 0 },
      evasao: { urbana: 0, rural: 0 },
    },
  });

  // Função para calcular taxa de evasão consistente
  const calcularTaxaEvasaoConsistente = useCallback((dados) => {
    if (!dados || !dados.detalhesZona) return dados?.taxaEvasao || 0;

    const { evasao } = dados.detalhesZona;

    if (evasao?.desistentes && evasao?.totalMatriculas) {
      const desistentesUrbana = evasao.desistentes.urbana || 0;
      const desistentesRural = evasao.desistentes.rural || 0;
      const totalUrbana = evasao.totalMatriculas.urbana || 0;
      const totalRural = evasao.totalMatriculas.rural || 0;

      const totalDesistentes = desistentesUrbana + desistentesRural;
      const totalMatriculas = totalUrbana + totalRural;

      if (totalMatriculas > 0) {
        const taxaCalculada = (totalDesistentes * 100) / totalMatriculas;
        return Number(taxaCalculada.toFixed(2));
      }
    }

    if (
      evasao?.urbana !== undefined &&
      evasao?.rural !== undefined &&
      evasao?.totalMatriculas?.urbana &&
      evasao?.totalMatriculas?.rural
    ) {
      const taxaUrbana = evasao.urbana || 0;
      const taxaRural = evasao.rural || 0;
      const totalUrbana = evasao.totalMatriculas.urbana || 0;
      const totalRural = evasao.totalMatriculas.rural || 0;

      const totalGeral = totalUrbana + totalRural;

      if (totalGeral > 0) {
        const taxaCalculada =
          (taxaUrbana * totalUrbana + taxaRural * totalRural) / totalGeral;
        return Number(taxaCalculada.toFixed(2));
      }
    }

    return dados.taxaEvasao || 0;
  }, []);

  // Verificar se há algum loading ativo
  const isLoading = useMemo(() => {
    return (
      Object.values(loadingCards).some(Boolean) ||
      loadingTable ||
      loadingGraphMov ||
      loadingPieSexo ||
      loadingBarTurno ||
      loadingSituacao ||
      loadingEvolucao ||
      loadingMapa ||
      globalLoading ||
      isAutoUpdating
    );
  }, [
    loadingCards,
    loadingTable,
    loadingGraphMov,
    loadingPieSexo,
    loadingBarTurno,
    loadingSituacao,
    loadingEvolucao,
    loadingMapa,
    globalLoading,
    isAutoUpdating,
  ]);

  const getSafeNumber = (value, defaultValue = 0) => {
    if (value === null || value === undefined || value === "Erro")
      return defaultValue;

    let numericValue;
    if (typeof value === "string") {
      const cleanedValue = value.replace(/[^\d,.-]/g, "");
      numericValue = parseFloat(cleanedValue.replace(",", "."));
    } else {
      numericValue = parseFloat(value);
    }

    return isNaN(numericValue) ? defaultValue : numericValue;
  };

  const getSafePercent = (value, defaultValue = 0) => {
    if (value === null || value === undefined || value === "Erro" || isNaN(value))
      return defaultValue;
    const numericValue = parseFloat(value);
    return isNaN(numericValue)
      ? defaultValue
      : Math.min(100, Math.max(0, numericValue));
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
        if (!error.name === "AbortError") {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClickOutside = useCallback((event) => {
    if (!event.target.closest("#sidebar") && !event.target.closest("#filterButton")) {
      setShowSidebar(false);
    }
  }, []);

  const carregarFiltros = async (signal) => {
    try {
      const response = await api.get("/filtros", { signal });
      setFilters(response.data);
      const ultimoAnoLetivo = response.data.ano_letivo?.[0] || "";

      const savedFilters = JSON.parse(localStorage.getItem("selectedFilters") || "{}");
      const initialFilters = savedFilters.anoLetivo
        ? savedFilters
        : { ...selectedFilters, anoLetivo: ultimoAnoLetivo };

      setSelectedFilters(initialFilters);
      await carregarDados(initialFilters, signal);
    } catch (error) {
      if (!error.name === "AbortError") {
        console.error("Erro ao carregar filtros:", error);
      }
    }
  };

  // NOTE:
  // `carregarDados` é usado em arrays de dependências de hooks (useEffect/useCallback)
  // que aparecem ANTES da sua declaração no arquivo. Quando declarado com `const`, isso
  // causa erro em runtime (TDZ): "Cannot access 'X' before initialization".
  // Por isso, usamos function declaration (hoisted) aqui.
  async function carregarDados(filtros, signal) {
    setGlobalLoading(true);

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

      // --- Mapa (escolas_geo + agregados de matrículas ativas) ---
      let mapaPoints = [];
      try {
        const mapResp = await api.post("/map/escolas-ativos", { filters: filtros, onlyWithGeo: true }, { signal });
        mapaPoints = mapResp.data?.points || [];
      } catch (e) {
        console.warn("[Dashboard] Falha ao carregar pontos do mapa:", e?.message || e);
      }

      const taxaEvasaoConsistente = calcularTaxaEvasaoConsistente(totaisData);

      const safeData = {
        ...totaisData,
        taxaEvasao: taxaEvasaoConsistente,
        taxaOcupacao: getSafePercent(totaisData.taxaOcupacao),
        totalMatriculas: getSafeNumber(totaisData.totalMatriculas),
        totalEscolas: getSafeNumber(totaisData.totalEscolas),
        capacidadeTotal: getSafeNumber(totaisData.capacidadeTotal),
        totalVagas: getSafeNumber(totaisData.totalVagas),
        totalEntradas: getSafeNumber(totaisData.totalEntradas),
        totalSaidas: getSafeNumber(totaisData.totalSaidas),
        alunosComDeficiencia: getSafeNumber(totaisData.alunosComDeficiencia),
        alunosTransporteEscolar: getSafeNumber(totaisData.alunosTransporteEscolar),
        matriculasPorZona: totaisData.matriculasPorZona || {},
        escolasPorZona: totaisData.escolasPorZona || {},
        turmasPorZona: totaisData.turmasPorZona || {},
        entradasSaidasPorMes: totaisData.entradasSaidasPorMes || {},
        matriculasPorSexo: totaisData.matriculasPorSexo || {},
        matriculasPorTurno: totaisData.matriculasPorTurno || {},
        matriculasPorSituacao: totaisData.matriculasPorSituacao || {},
        evolucaoMatriculas: totaisData.evolucaoMatriculas || {},
        escolas: mapaPoints.length ? mapaPoints : (totaisData.escolas || []),
        detalhesZona:
          totaisData.detalhesZona || {
            entradas: { urbana: 0, rural: 0 },
            saidas: { urbana: 0, rural: 0 },
            evasao: { urbana: 0, rural: 0 },
          },
      };

      setData(safeData);
      setCachedData(safeData);

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

      if (Object.keys(filtros).some((key) => filtros[key])) {
        setToastMsg("Filtros aplicados com sucesso! 🔍");
        setToastType("info");
        setShowToast(true);
        setTimeout(() => setShowToast(false), 1300);
      }
    } catch (error) {
      if (!error.name === "AbortError") {
        console.error("Erro ao carregar dados:", error);

        if (cachedData) {
          setData(cachedData);
          setToastMsg("Usando dados em cache 📋");
          setToastType("info");
          setShowToast(true);
          setTimeout(() => setShowToast(false), 2000);
        } else {
          setData((prev) => ({
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
            detalhesZona: {
              entradas: { urbana: 0, rural: 0 },
              saidas: { urbana: 0, rural: 0 },
              evasao: { urbana: 0, rural: 0 },
            },
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
  }

  const handleFilterChange = useCallback((e) => {
    const { name, value } = e.target;

    setSelectedFilters((prev) => {
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

  const handleSchoolClick = useCallback(
    (escola) => {
      setSelectedFilters((prev) => {
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
    },
    [selectedSchool]
  );

  // ✅ Interação estilo Power BI: clique em gráfico aplica filtro e atualiza TODAS as visualizações
  const handleSexoSelect = useCallback((label) => {
    setSelectedFilters((prev) => {
      const next = { ...prev, sexo: prev.sexo === label ? "" : label };
      carregarDados(next);
      return next;
    });
  }, []);

  const handleTurnoSelect = useCallback((label) => {
    setSelectedFilters((prev) => {
      const next = { ...prev, turno: prev.turno === label ? "" : label };
      carregarDados(next);
      return next;
    });
  }, []);

  const handleSituacaoSelect = useCallback((label) => {
    setSelectedFilters((prev) => {
      const next = {
        ...prev,
        situacaoMatricula: prev.situacaoMatricula === label ? "" : label,
      };
      carregarDados(next);
      return next;
    });
  }, []);

  const limparSelecoesGraficos = useCallback(() => {
    setSelectedFilters((prev) => {
      const next = { ...prev, sexo: "", turno: "", situacaoMatricula: "" };
      carregarDados(next);
      return next;
    });
  }, []);

  const indicadoresEstrategicos = useMemo(() => {
    const totalMatriculas = data.totalMatriculas || 1;

    return {
      taxaEvasao: data.taxaEvasao || 0,
      taxaOcupacao: data.taxaOcupacao || 0,
      percentualDeficiencia:
        data.alunosComDeficiencia && totalMatriculas
          ? parseFloat(((data.alunosComDeficiencia * 100) / totalMatriculas).toFixed(2))
          : 0,
      percentualTransporte:
        data.alunosTransporteEscolar && totalMatriculas
          ? parseFloat(((data.alunosTransporteEscolar * 100) / totalMatriculas).toFixed(2))
          : 0,
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

  // Dados de gráficos memoizados
  const chartData = useMemo(() => {
    const mesesOrdenados = Object.keys(data.entradasSaidasPorMes || {}).sort((a, b) => {
      const mesA = parseInt(a);
      const mesB = parseInt(b);
      return mesA - mesB;
    });

    const nomesMeses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dec"];

    const labelsMovimentacao = mesesOrdenados.map((mes) => {
      const mesIndex = parseInt(mes) - 1;
      return nomesMeses[mesIndex] || mes;
    });

    const entradasOrdenadas = mesesOrdenados.map(
      (mes) => data.entradasSaidasPorMes[mes]?.entradas || 0
    );
    const saidasOrdenadas = mesesOrdenados.map(
      (mes) => data.entradasSaidasPorMes[mes]?.saidas || 0
    );

    let evolucaoLabels = [];
    let evolucaoData = [];

    if (data.evolucaoMatriculas && Object.keys(data.evolucaoMatriculas).length > 0) {
      const ultimoAno = Object.keys(data.evolucaoMatriculas).sort().pop();
      const dadosUltimoAno = data.evolucaoMatriculas[ultimoAno];

      if (dadosUltimoAno) {
        evolucaoLabels = Object.keys(dadosUltimoAno)
          .sort((a, b) => parseInt(a) - parseInt(b))
          .map((mes) => {
            const mesIndex = parseInt(mes) - 1;
            return nomesMeses[mesIndex] || mes;
          });

        evolucaoData = Object.keys(dadosUltimoAno)
          .sort((a, b) => parseInt(a) - parseInt(b))
          .map((mes) => dadosUltimoAno[mes] || 0);
      }
    }

    return {
      movimentacao: {
        labels: labelsMovimentacao,
        datasets: [
          { label: "Entradas", data: entradasOrdenadas, backgroundColor: "#F59E0B", borderRadius: 6 },
          { label: "Saídas", data: saidasOrdenadas, backgroundColor: "#EF4444", borderRadius: 6 },
        ],
      },
      sexo: {
        labels: Object.keys(data.matriculasPorSexo || {}),
        datasets: [
          {
            label: "Sexo",
            data: Object.values(data.matriculasPorSexo || {}),
            backgroundColor: Object.keys(data.matriculasPorSexo || {}).map((sexo) => {
              const selected = selectedFilters?.sexo;
              let base = "#94A3B8";
              if (String(sexo).toLowerCase().includes("masc")) base = "#3B82F6";
              if (String(sexo).toLowerCase().includes("femi")) base = "#EC4899";
              // Se há filtro via clique, esmaece as fatias não selecionadas
              if (selected && String(selected) !== String(sexo)) return "#E5E7EB";
              return base;
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
              const turnoColors = ["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6", "#EC4899"];
              const label = Object.keys(data.matriculasPorTurno || {})[index];
              const selected = selectedFilters?.turno;
              const base = turnoColors[index % turnoColors.length];
              if (selected && String(selected) !== String(label)) return "#E5E7EB";
              return base;
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
              const situacaoColors = ["#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6", "#EC4899", "#6B7280"];
              const label = Object.keys(data.matriculasPorSituacao || {})[index];
              const selected = selectedFilters?.situacaoMatricula;
              const base = situacaoColors[index % situacaoColors.length];
              if (selected && String(selected) !== String(label)) return "#E5E7EB";
              return base;
            }),
            borderWidth: 0,
          },
        ],
      },
      evolucao: {
        labels: evolucaoLabels,
        datasets: [
          {
            label: "Matrículas",
            data: evolucaoData,
            borderColor: "#6366F1",
            backgroundColor: "rgba(99, 102, 241, 0.1)",
            borderWidth: 3,
            tension: 0.4,
            fill: true,
          },
        ],
      },
    };
  }, [
    data.entradasSaidasPorMes,
    data.matriculasPorSexo,
    data.matriculasPorTurno,
    data.matriculasPorSituacao,
    data.evolucaoMatriculas,
    selectedFilters.sexo,
    selectedFilters.turno,
    selectedFilters.situacaoMatricula,
  ]);

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
          x: { grid: { display: false }, ticks: { color: "#6B7280", font: { weight: "bold" } } },
          y: {
            grid: { color: "#E5E7EB" },
            ticks: { color: "#6B7280", font: { weight: "bold" }, callback: (value) => formatNumber(value) },
          },
        },
        layout: { padding: { top: 20, bottom: 20 } },
      },
      sexo: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 12, weight: "bold" }, color: "#6B7280" } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = Number(ctx.parsed) || 0;
                const dataArr = ctx.chart?.data?.datasets?.[0]?.data || [];
                const sum = dataArr.reduce((a, b) => a + (Number(b) || 0), 0);
                const pct = sum ? (value * 100) / sum : 0;
                return `${ctx.label}: ${formatNumber(value)} (${pct.toFixed(1).replace('.', ',')}%)`;
              },
            },
          },
          datalabels: {
            display: true,
            color: "#fff",
            font: { weight: "bold", size: 11 },
            formatter: (value, ctx) => {
              const v = Number(value) || 0;
              const dataArr = ctx.chart?.data?.datasets?.[0]?.data || [];
              const sum = dataArr.reduce((a, b) => a + (Number(b) || 0), 0);
              const pct = sum ? (v * 100) / sum : 0;
              // evita poluir visual quando a fatia é muito pequena
              if (pct < 4) return "";
              return `${pct.toFixed(1).replace('.', ',')}%`;
            },
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
            color: "#111827",
            font: { weight: "bold", size: 11 },
            anchor: "end",
            align: "end",
            offset: 4,
            formatter: (value) => formatNumber(value),
          },
        },
        scales: {
          x: {
            grid: { color: "#E5E7EB" },
            ticks: { color: "#6B7280", font: { weight: "bold" }, callback: (value) => formatNumber(value) },
          },
          y: { grid: { display: false }, ticks: { color: "#6B7280", font: { weight: "bold" } } },
        },
        layout: { padding: { left: 20, right: 20 } },
      },
      situacao: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 11, weight: "bold" }, color: "#6B7280" } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = Number(ctx.parsed) || 0;
                const dataArr = ctx.chart?.data?.datasets?.[0]?.data || [];
                const sum = dataArr.reduce((a, b) => a + (Number(b) || 0), 0);
                const pct = sum ? (value * 100) / sum : 0;
                return `${ctx.label}: ${formatNumber(value)} (${pct.toFixed(1).replace('.', ',')}%)`;
              },
            },
          },
          datalabels: {
            display: true,
            color: "#fff",
            font: { weight: "bold", size: 10 },
            formatter: (value, ctx) => {
              const v = Number(value) || 0;
              const dataArr = ctx.chart?.data?.datasets?.[0]?.data || [];
              const sum = dataArr.reduce((a, b) => a + (Number(b) || 0), 0);
              const pct = sum ? (v * 100) / sum : 0;
              if (pct < 4) return "";
              return `${pct.toFixed(1).replace('.', ',')}%`;
            },
          },
        },
      },
      evolucao: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#6B7280", font: { weight: "bold" } } },
          y: { grid: { color: "#E5E7EB" }, ticks: { color: "#6B7280", font: { weight: "bold" }, callback: (value) => formatNumber(value) } },
        },
      },
    };
  }, []);

  const filteredEscolas = useMemo(() => {
    const term = (searchTerm || "").trim().toLowerCase();
    if (!term) return data.escolas;
    return data.escolas.filter((escola) =>
      String(escola.escola || "").toLowerCase().includes(term)
    );
  }, [data.escolas, searchTerm]);

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

  return (
    <AppContext.Provider value={{}}>
      <div className="h-screen w-screen flex flex-col bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 text-gray-800 relative overflow-hidden">
        <AnimatePresence>
          {showToast && <Toast message={toastMsg} show={showToast} type={toastType} />}
          {isLoading && <GlobalLoading />}
        </AnimatePresence>

        {/* HEADER FIXO NO TOPO */}
        <div className="w-full bg-white/95 backdrop-blur-sm shadow-xl border-b border-gray-200/60 z-40">
          <div className="flex items-center justify-between px-3 py-3 md:px-6 md:py-4">
            <div className="flex items-center gap-3 flex-1">
              <button
                id="filterButton"
                onClick={() => setShowSidebar(true)}
                className="bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl shadow-lg flex items-center justify-center p-2 hover:from-violet-600 hover:to-purple-700 transition-all duration-300 transform hover:scale-105"
                style={{ fontSize: 24, minWidth: 44, minHeight: 44 }}
                title="Abrir filtros"
              >
                <FaFilter />
              </button>

              <div className="flex flex-col">
                <h1
                  className="font-bold drop-shadow-sm bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent"
                  style={{ fontSize: "clamp(1.2rem, 2.5vw, 2rem)", lineHeight: 1.2 }}
                >
                  {clientName || "SEMED - PAINEL"}
                </h1>
                <span className="text-[0.85rem] md:text-base text-gray-600 font-medium">
                  Dashboard de Gestão Educacional
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {formattedUpdateDate && (
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-xs text-gray-500 font-semibold">Última atualização</span>
                  <span className="text-sm text-gray-700 font-bold">{formattedUpdateDate}</span>
                </div>
              )}

              <button
                onClick={sair}
                className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl shadow-lg flex items-center justify-center p-2 hover:from-red-600 hover:to-red-700 transition-all duration-300 transform hover:scale-105 group"
                title="Sair do sistema"
                style={{ fontSize: 24, minWidth: 44, minHeight: 44 }}
              >
                <FaSignOutAlt className="group-hover:rotate-180 transition-transform duration-300" />
              </button>
            </div>
          </div>

          {formattedUpdateDate && (
            <div className="md:hidden p-2 text-center text-xs bg-violet-100/80 text-gray-700">
              Atualizado: {formattedUpdateDate}
            </div>
          )}

          {/* Navegação por abas */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-1 px-3 sm:px-4 py-2 text-sm font-semibold transition-all ${
                activeTab === "overview"
                  ? "text-violet-600 border-b-2 border-violet-600 bg-violet-50"
                  : "text-gray-600 hover:text-violet-500"
              }`}
            >
              <FaHome className="text-sm" />
              <span className="hidden xs:inline">Visão Geral</span>
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center gap-1 px-3 sm:px-4 py-2 text-sm font-semibold transition-all ${
                activeTab === "analytics"
                  ? "text-violet-600 border-b-2 border-violet-600 bg-violet-50"
                  : "text-gray-600 hover:text-violet-500"
              }`}
            >
              <FaChartBar className="text-sm" />
              <span className="hidden xs:inline">Analytics</span>
            </button>
            <button
              onClick={() => setActiveTab("geographic")}
              className={`flex items-center gap-1 px-3 sm:px-4 py-2 text-sm font-semibold transition-all ${
                activeTab === "geographic"
                  ? "text-violet-600 border-b-2 border-violet-600 bg-violet-50"
                  : "text-gray-600 hover:text-violet-500"
              }`}
            >
              <FaMapMarkerAlt className="text-sm" />
              <span className="hidden xs:inline">Geográfica</span>
            </button>

            <button
              onClick={() => setActiveTab("assistant")}
              className={`flex items-center gap-1 px-3 sm:px-4 py-2 text-sm font-semibold transition-all ${
                activeTab === "assistant"
                  ? "text-violet-600 border-b-2 border-violet-600 bg-violet-50"
                  : "text-gray-600 hover:text-violet-500"
              }`}
            >
              <FaRobot className="text-sm" />
              <span className="hidden xs:inline">Assistente IA</span>
            </button>
          </div>

          {selectedSchool && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center py-1 bg-violet-50/80">
              <span className="bg-gradient-to-r from-violet-500 to-purple-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow">
                🎯 Filtro ativo: {selectedSchool.escola}
              </span>
              <button
                onClick={() => handleSchoolClick(selectedSchool)}
                className="ml-2 bg-red-500 text-white px-2 py-0.5 rounded-full text-xs font-semibold hover:bg-red-600 transition-colors"
              >
                Remover
              </button>
            </motion.div>
          )}

          {/* Chips de seleção por clique nos gráficos (Power BI style) */}
          {(selectedFilters.sexo || selectedFilters.turno || selectedFilters.situacaoMatricula) && (
            <div className="px-3 md:px-6 py-2 bg-white/80 border-t border-gray-200 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-gray-600">Seleções:</span>

              {selectedFilters.sexo && (
                <button
                  onClick={() => handleSexoSelect(selectedFilters.sexo)}
                  className="text-xs px-3 py-1 rounded-full bg-violet-100 text-violet-800 border border-violet-200 hover:bg-violet-200"
                >
                  Sexo: <b>{selectedFilters.sexo}</b> ✕
                </button>
              )}

              {selectedFilters.turno && (
                <button
                  onClick={() => handleTurnoSelect(selectedFilters.turno)}
                  className="text-xs px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200"
                >
                  Turno: <b>{selectedFilters.turno}</b> ✕
                </button>
              )}

              {selectedFilters.situacaoMatricula && (
                <button
                  onClick={() => handleSituacaoSelect(selectedFilters.situacaoMatricula)}
                  className="text-xs px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200"
                >
                  Situação: <b>{selectedFilters.situacaoMatricula}</b> ✕
                </button>
              )}

              <button
                onClick={limparSelecoesGraficos}
                className="ml-auto text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200"
              >
                Limpar seleções
              </button>
            </div>
          )}
        </div>

        {/* CONTEÚDO PRINCIPAL POR ABA */}
        <div className="flex-1 overflow-auto p-2 sm:p-3">
          {/* ABA: VISÃO GERAL */}
          {activeTab === "overview" && (
            <>
              {/* Alertas Estratégicos */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4">
                {indicadoresEstrategicos.taxaEvasao > 10 && (
                  <AlertIndicator type="high" value={`${formatPercent(indicadoresEstrategicos.taxaEvasao)}%`} label="Taxa de Evasão Alta" />
                )}
                {indicadoresEstrategicos.taxaOcupacao > 90 && (
                  <AlertIndicator type="medium" value={`${formatPercent(indicadoresEstrategicos.taxaOcupacao)}%`} label="Alta Ocupação" />
                )}
                {data.totalSaidas > data.totalEntradas && (
                  <AlertIndicator type="high" value="Crítico" label="Mais Saídas que Entradas" />
                )}
                {data.matriculasPorZona?.["RURAL"] > data.matriculasPorZona?.["URBANA"] && (
                  <AlertIndicator type="medium" value="Rural" label="Maioria em Área Rural" />
                )}
              </div>

              {/* ✅ GRID DOS CARDS SEM BURACO (agora são 6 cards na Home) */}
              <div className="grid grid-cols-2 min-[480px]:grid-cols-3 min-[640px]:grid-cols-4 min-[1024px]:grid-cols-6 min-[1280px]:grid-cols-6 gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Card
                  label="Matrículas"
                  value={data.totalMatriculas}
                  icon={<FaUserGraduate className="text-blue-500" />}
                  borderColor="border-blue-400"
                  bgColor="bg-blue-50"
                  loading={loadingCards.totalMatriculas}
                  additionalContent={
                    <ZonaDetails urbana={data.matriculasPorZona?.["URBANA"]} rural={data.matriculasPorZona?.["RURAL"]} />
                  }
                />

                <Card
                  label="Escolas"
                  value={data.totalEscolas}
                  icon={<FaSchool className="text-green-500" />}
                  borderColor="border-green-400"
                  bgColor="bg-green-50"
                  loading={loadingCards.totalEscolas}
                  additionalContent={<ZonaEscolasDetails urbana={data.escolasPorZona?.["URBANA"]} rural={data.escolasPorZona?.["RURAL"]} />}
                />

                <Card
                  label="Capacidade"
                  value={data.capacidadeTotal}
                  icon={<FaChalkboardTeacher className="text-indigo-500" />}
                  borderColor="border-indigo-400"
                  bgColor="bg-indigo-50"
                  loading={loadingCards.capacidadeTotal}
                  additionalContent={
                    <ZonaDetails
                      urbana={data.capacidadePorZona?.["URBANA"]?.capacidade || 0}
                      rural={data.capacidadePorZona?.["RURAL"]?.capacidade || 0}
                    />
                  }
                />

                <Card
                  label="Vagas"
                  value={data.totalVagas}
                  icon={<FaUsers className="text-teal-500" />}
                  borderColor="border-teal-400"
                  bgColor="bg-teal-50"
                  loading={loadingCards.totalVagas}
                  valueColor={data.totalVagas < 0 ? "red" : "green"}
                  additionalContent={
                    <ZonaDetails
                      urbana={data.capacidadePorZona?.["URBANA"]?.vagas || 0}
                      rural={data.capacidadePorZona?.["RURAL"]?.vagas || 0}
                    />
                  }
                />

                <Card
                  label="Entradas"
                  value={data.totalEntradas}
                  icon={<FaSignInAlt className="text-yellow-500" />}
                  borderColor="border-yellow-400"
                  bgColor="bg-yellow-50"
                  loading={loadingCards.totalEntradas}
                  additionalContent={
                    <ZonaDetails urbana={data.detalhesZona?.entradas?.urbana || 0} rural={data.detalhesZona?.entradas?.rural || 0} />
                  }
                />

                <Card
                  label="Saídas"
                  value={data.totalSaidas}
                  icon={<FaSignOutAlt className="text-red-500" />}
                  borderColor="border-red-400"
                  bgColor="bg-red-50"
                  loading={loadingCards.totalSaidas}
                  additionalContent={
                    <ZonaDetails urbana={data.detalhesZona?.saidas?.urbana || 0} rural={data.detalhesZona?.saidas?.rural || 0} />
                  }
                />
              </div>

              {/* Área Principal - Tabela e Gráficos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
                <div className="bg-white/90 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-lg overflow-hidden flex flex-col h-[400px] border-gray-200/50 border">
                  <div className="p-3 bg-gradient-to-r from-gray-50 to-gray-100/80 border-gray-200 border-b flex justify-between items-center">
                    <h3 className="text-base sm:text-lg font-bold flex items-center gap-2">
                      <FaSchool className="text-violet-500" />
                      Detalhes por Escola
                    </h3>
                    <div className="flex gap-2">
                      <ExportButtons data={data} escolas={filteredEscolas} loading={loadingTable} />
                      <button
                        onClick={() => setShowSearch(!showSearch)}
                        className="bg-violet-500 text-white p-2 rounded-lg hover:bg-violet-600 transition-colors shadow"
                      >
                        <FaSearch size={16} />
                      </button>
                    </div>
                  </div>

                  {showSearch && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="p-2 bg-white border-gray-200 border-b">
                      <input
                        type="text"
                        placeholder="Buscar escola..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent text-gray-800 text-sm"
                      />
                    </motion.div>
                  )}

                  <div className="overflow-auto flex-1">
                    {loadingTable ? (
                      <div className="p-3">
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

                <div className="bg-white/90 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-lg p-3 flex flex-col h-[400px] border-gray-200/50 border">
                  <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2">
                    <FaSync className="text-violet-500" />
                    Movimentação Mensal
                  </h3>
                  <div className="flex-1 overflow-hidden">
                    {loadingGraphMov ? (
                      <ChartSkeleton />
                    ) : (
                      <Suspense fallback={<ChartSkeleton />}>
                        <MovimentacaoChart data={chartData.movimentacao} options={chartOptions.movimentacao} loading={loadingGraphMov} />
                      </Suspense>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
                <div className="bg-white/90 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-lg p-3 flex flex-col h-[300px] border-gray-200/50 border">
                  <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2">
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
                          onSelect={handleSexoSelect}
                          selected={selectedFilters.sexo}
                        />
                      </Suspense>
                    )}
                  </div>
                </div>

                <div className="bg-white/90 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-lg p-3 flex flex-col h-[300px] border-gray-200/50 border">
                  <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2">
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
                          onSelect={handleTurnoSelect}
                          selected={selectedFilters.turno}
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
            <div className="space-y-3 sm:space-y-4">
              <div className="grid grid-cols-2 min-[480px]:grid-cols-3 min-[1024px]:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Card
                  label="Ocupação"
                  value={`${formatPercent(data.taxaOcupacao)}%`}
                  disableFormat={true}
                  icon={<FaUsers className="text-indigo-500" />}
                  borderColor="border-indigo-400"
                  bgColor="bg-indigo-50"
                  loading={loadingCards.taxaOcupacao}
                  valueColor={data.taxaOcupacao > 90 ? "orange" : "green"}
                  tooltip="Percentual de ocupação das vagas disponíveis"
                  tooltipId="taxa-ocupacao"
                />

                <Card
                  label="Transporte Escolar"
                  value={data.alunosTransporteEscolar}
                  icon={<FaBus className="text-amber-500" />}
                  borderColor="border-amber-400"
                  bgColor="bg-amber-50"
                  loading={loadingCards.transporteEscolar}
                  additionalContent={
                    <div className="mt-1 pt-1 border-t border-gray-200/50 text-[10px] text-center">
                      <span className="font-bold">{indicadoresEstrategicos.percentualTransporte}%</span>
                      <span className="text-gray-600"> do total</span>
                    </div>
                  }
                />

                {/* Taxa de evasão fica somente aqui (Analytics), como você pediu */}
                <Card
                  label="Taxa de Evasão"
                  value={`${formatPercent(data.taxaEvasao)}%`}
                  disableFormat={true}
                  icon={<FaExclamationTriangle className="text-red-500" />}
                  borderColor="border-red-400"
                  bgColor="bg-red-50"
                  loading={loadingCards.taxaEvasao}
                  valueColor={data.taxaEvasao > 10 ? "red" : "green"}
                  tooltip="Percentual de evasão escolar"
                  tooltipId="taxa-evasao-analytics"
                  additionalContent={
                    <ZonaEvasaoDetails urbana={data.detalhesZona?.evasao?.urbana || 0} rural={data.detalhesZona?.evasao?.rural || 0} />
                  }
                />

                <Card
                  label="Com Deficiência"
                  value={data.alunosComDeficiencia}
                  icon={<FaWheelchair className="text-teal-500" />}
                  borderColor="border-teal-400"
                  bgColor="bg-teal-50"
                  loading={loadingCards.alunosDeficiencia}
                  additionalContent={
                    <div className="mt-1 pt-1 border-t border-gray-200/50 text-[10px] text-center">
                      <span className="font-bold">{indicadoresEstrategicos.percentualDeficiencia}%</span>
                      <span className="text-gray-600"> do total</span>
                    </div>
                  }
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-white/90 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-lg p-3 flex flex-col h-[400px] border-gray-200/50 border">
                  <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2">
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
                          onSelect={handleSituacaoSelect}
                          selected={selectedFilters.situacaoMatricula}
                        />
                      </Suspense>
                    )}
                  </div>
                </div>

                <div className="bg-white/90 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-lg p-3 flex flex-col h-[400px] border-gray-200/50 border">
                  <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2">
                    <FaChartLine className="text-violet-500" />
                    Evolução de Matrículas
                  </h3>
                  <div className="flex-1">
                    {loadingEvolucao ? (
                      <ChartSkeleton />
                    ) : (
                      <Suspense fallback={<ChartSkeleton />}>
                        <EvolucaoMatriculasChart data={chartData.evolucao} options={chartOptions.evolucao} loading={loadingEvolucao} />
                      </Suspense>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA: VISÃO GEOGRÁFICA */}
          {activeTab === "geographic" && (
            <div className="space-y-3 sm:space-y-4">
              <div className="bg-white/90 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-lg p-3 flex flex-col h-[500px] sm:h-[600px] border-gray-200/50 border">
                <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2">
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
                      <MapaCalorEscolas escolas={data.escolas} loading={loadingMapa} />
                    </Suspense>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-white/90 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-lg p-3 border-gray-200/50 border">
                  <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2">
                    <FaCity className="text-violet-500" />
                    Distribuição por Zona
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 rounded-lg bg-blue-50">
                      <span className="font-semibold text-blue-700 text-sm">Urbana</span>
                      <span className="font-bold text-blue-900 text-sm">
                        {formatNumber(data.matriculasPorZona?.["URBANA"])}
                        <span className="text-xs text-blue-600 ml-1">
                          ({data.matriculasPorZona?.["URBANA"] && data.totalMatriculas
                            ? ((data.matriculasPorZona["URBANA"] / data.totalMatriculas) * 100).toFixed(1)
                            : 0}
                          %)
                        </span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded-lg bg-green-50">
                      <span className="font-semibold text-green-700 text-sm">Rural</span>
                      <span className="font-bold text-green-900 text-sm">
                        {formatNumber(data.matriculasPorZona?.["RURAL"])}
                        <span className="text-xs text-green-600 ml-1">
                          ({data.matriculasPorZona?.["RURAL"] && data.totalMatriculas
                            ? ((data.matriculasPorZona["RURAL"] / data.totalMatriculas) * 100).toFixed(1)
                            : 0}
                          %)
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white/90 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-lg p-3 border-gray-200/50 border">
                  <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2">
                    <FaSchool className="text-violet-500" />
                    Densidade Escolar
                  </h3>
                  <div className="space-y-2">
                    <div className="text-center">
                      <div className="text-xl sm:text-2xl font-bold text-violet-600">
                        {data.totalEscolas && data.totalMatriculas ? Math.round(data.totalMatriculas / data.totalEscolas) : 0}
                      </div>
                      <div className="text-xs text-gray-600">Alunos por escola (média)</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="p-2 rounded bg-blue-50">
                        <div className="font-bold text-blue-700 text-sm">{data.escolasPorZona?.["URBANA"] || 0}</div>
                        <div className="text-xs text-blue-600">Escolas Urbanas</div>
                      </div>
                      <div className="p-2 rounded bg-green-50">
                        <div className="font-bold text-green-700 text-sm">{data.escolasPorZona?.["RURAL"] || 0}</div>
                        <div className="text-xs text-green-600">Escolas Rurais</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA: ASSISTENTE IA */}
          {activeTab === "assistant" && (
            <div className="space-y-3 sm:space-y-4">
              <AiAssistant filters={selectedFilters} />
            </div>
          )}
        </div>

        {/* Sidebar de Filtros */}
        <AnimatePresence>
          {showSidebar && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSidebar(false)} className="fixed inset-0 bg-black/50 z-40" />

              <motion.div
                id="sidebar"
                initial={{ x: -400, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -400, opacity: 0 }}
                transition={{ duration: 0.3, type: "spring", bounce: 0.1 }}
                className="fixed inset-y-0 left-0 bg-white w-80 md:w-96 p-4 shadow-2xl z-50 border-gray-200/60 border-r overflow-y-auto"
              >
                <div className="flex justify-between items-center mb-6 pb-3 border-gray-200 border-b">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <FaFilter className="text-violet-500" />
                    Filtros
                  </h2>
                  <button onClick={() => setShowSidebar(false)} className="text-gray-500 hover:text-violet-600 transition-colors text-xl bg-gray-100 p-1 rounded-lg hover:bg-gray-200">
                    ✕
                  </button>
                </div>

                <div className="space-y-3">
                  <FilterSelect label="Ano Letivo" name="anoLetivo" options={filters.ano_letivo} value={selectedFilters.anoLetivo} onChange={handleFilterChange} />
                  <FilterSelect label="Sexo" name="sexo" options={filters.sexo} value={selectedFilters.sexo} onChange={handleFilterChange} />
                  <FilterSelect label="Turno" name="turno" options={filters.turno} value={selectedFilters.turno} onChange={handleFilterChange} />
                  <FilterSelect label="Tipo Matrícula" name="tipoMatricula" options={filters.tipo_matricula} value={selectedFilters.tipoMatricula} onChange={handleFilterChange} />
                  <FilterSelect label="Situação Matrícula" name="situacaoMatricula" options={filters.situacao_matricula} value={selectedFilters.situacaoMatricula} onChange={handleFilterChange} />
                  <FilterSelect label="Grupo Etapa" name="grupoEtapa" options={filters.grupo_etapa} value={selectedFilters.grupoEtapa} onChange={handleFilterChange} />
                  <FilterSelect label="Etapa Matrícula" name="etapaMatricula" options={filters.etapa_matricula} value={selectedFilters.etapaMatricula} onChange={handleFilterChange} disabled={selectedFilters.etapaTurma !== ""} />
                  <FilterSelect label="Etapa Turma" name="etapaTurma" options={filters.etapa_turma} value={selectedFilters.etapaTurma} onChange={handleFilterChange} disabled={selectedFilters.etapaMatricula !== ""} />
                  <FilterSelect label="Multissérie" name="multisserie" options={filters.multisserie} value={selectedFilters.multisserie} onChange={handleFilterChange} />
                  <FilterSelect label="Deficiência" name="deficiencia" options={filters.deficiencia} value={selectedFilters.deficiencia} onChange={handleFilterChange} />
                  <FilterSelect label="Transporte Escolar" name="transporteEscolar" options={filters.transporte_escolar} value={selectedFilters.transporteEscolar} onChange={handleFilterChange} />
                  <FilterSelect label="Tipo Transporte" name="tipoTransporte" options={filters.tipo_transporte} value={selectedFilters.tipoTransporte} onChange={handleFilterChange} disabled={selectedFilters.transporteEscolar !== "SIM"} />
                </div>

                <div className="mt-6 pt-4 border-gray-200 border-t flex justify-center">
                  <button
                    onClick={() => {
                      const ultimoAnoLetivo = filters.ano_letivo?.[0] || "";
                      const resetFilters = {
                        anoLetivo: ultimoAnoLetivo,
                        sexo: "",
                        turno: "",
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
                    className="bg-gradient-to-r from-violet-500 to-purple-600 text-white px-6 py-2 rounded-lg hover:from-violet-600 hover:to-purple-700 transition-all duration-300 shadow font-semibold text-sm"
                  >
                    🔄 Limpar Filtros
                  </button>
                </div>

                <div className="mt-4 p-3 rounded-lg bg-gray-100/80 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <FaDatabase className="text-violet-500" />
                    <span className="font-semibold">Sistema de Cache</span>
                  </div>
                  <p className="text-gray-600">Seus filtros e preferências são salvos automaticamente.</p>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </AppContext.Provider>
  );
};

export default Dashboard;
