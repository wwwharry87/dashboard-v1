// frontend/src/components/Dashboard.js
import useInView from "../hooks/useInView";
import React, { useEffect, useState, useCallback, useMemo, Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import api from "./api";
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
  FaBalanceScale,
  FaSearch,
} from "react-icons/fa";
import { Tooltip } from "react-tooltip";
import { isMobile } from "react-device-detect";
import { motion, AnimatePresence } from "framer-motion";

// Importação dos componentes
import FilterSelect from "./FilterSelect";
import Card from "./Card";

// Lazy loading
const EscolasTable = lazy(() => import("./EscolasTable"));
const MovimentacaoChart = lazy(() => import("./MovimentacaoChart"));
const SexoChart = lazy(() => import("./SexoChart"));
const TurnoChart = lazy(() => import("./TurnoChart"));

// Spinner
const Spinner = () => (
  <div className="flex flex-col items-center justify-center">
    <svg className="animate-spin h-8 w-8 text-violet-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
    </svg>
    <span className="mt-2 text-violet-700 font-semibold animate-pulse">Carregando...</span>
  </div>
);

// Skeletons
const TableSkeleton = () => (
  <div className="p-4 animate-pulse">
    <div className="h-10 bg-gray-200 rounded-t-lg mb-2"></div>
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex mb-2">
        <div className="h-8 bg-gray-200 rounded w-1/2 mr-2"></div>
        <div className="h-8 bg-gray-200 rounded w-1/6 mr-2"></div>
        <div className="h-8 bg-gray-200 rounded w-1/6 mr-2"></div>
        <div className="h-8 bg-gray-200 rounded w-1/6"></div>
      </div>
    ))}
  </div>
);

const ChartSkeleton = () => (
  <div className="animate-pulse flex flex-col h-full p-4">
    <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
    <div className="flex-1 bg-gray-200 rounded"></div>
  </div>
);

// Toast
const Toast = ({ message, show, type = "success" }) =>
  show ? (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`
        fixed top-8 left-1/2 transform -translate-x-1/2 z-50
        ${type === "success" ? "bg-green-600" : "bg-blue-600"}
        text-white px-6 py-3 rounded-2xl shadow-lg flex items-center gap-2 text-lg font-semibold
      `}
    >
      <span role="img" aria-label="party">{type === "success" ? "🎉" : "🔍"}</span>
      {message}
    </motion.div>
  ) : null;

const formatNumber = (num) =>
  num === null || num === undefined || num === "Erro" ? num : Number(num).toLocaleString("pt-BR");

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, ChartTooltip, Legend, ArcElement, ChartDataLabels);

export default function Dashboard() {
  const navigate = useNavigate();

  // Gate de visibilidade para montar gráficos/tabela só quando entram na tela
  const { ref: chartGate, inView } = useInView({ threshold: 0.15 });

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

  // Loading states
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

  // Welcome toast
  useEffect(() => {
    if (nomeUsuario) {
      setToastMsg(`Bem-vindo(a), ${nomeUsuario}! 🎉`);
      setToastType("success");
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 1800);
      return () => clearTimeout(t);
    }
  }, [nomeUsuario]);

  // Obter usuário
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get("/usuario");
        setNomeUsuario(res.data?.nome || "");
      } catch {
        setNomeUsuario("");
      }
    };
    fetchUser();
  }, []);

  // Guard de rota
  useEffect(() => {
    if (!localStorage.getItem("token")) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  // Nome do cliente
  useEffect(() => {
    const fetchClientName = async () => {
      try {
        const response = await api.get("/client");
        setClientName(response.data?.cliente || "");
      } catch {
        setClientName("");
      }
    };
    fetchClientName();
  }, []);

  // Click fora para fechar sidebar
  const handleClickOutside = useCallback((event) => {
    if (!event.target.closest("#sidebar") && !event.target.closest("#filterButton")) {
      setShowSidebar(false);
    }
  }, []);

  // Inicialização + listeners
  useEffect(() => {
    const controller = new AbortController();

    const initialize = async () => {
      try {
        await carregarFiltros(controller.signal);
      } catch (error) {
        if (error?.name !== "AbortError") {
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
  }, [handleClickOutside]);

  // Resize
  useEffect(() => {
    const handleResize = () => {
      setTableGraphHeight(window.innerWidth <= 1180 && window.innerHeight <= 820 ? "h-64" : "h-96");
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Carregar filtros
  const carregarFiltros = async (signal) => {
    try {
      const response = await api.get("/filtros", { signal });
      setFilters(response.data || {});
      const ultimoAnoLetivo = response.data?.ano_letivo?.[0] || "";
      const next = { ...selectedFilters, anoLetivo: ultimoAnoLetivo };
      setSelectedFilters(next);
      await carregarDados(next, signal);
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Erro ao carregar filtros:", error);
      }
    }
  };

  // Carregar dados
  const carregarDados = async (filtros, signal) => {
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
        api.post("/totais", filtros, { signal }),
        api.post("/breakdowns", filtros, { signal }),
      ]);

      setData((prev) => ({
        ...prev,
        ...(totaisResponse?.data || {}),
        ...(breakdownsResponse?.data || {}),
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

      if (Object.keys(filtros || {}).some((k) => filtros[k])) {
        setToastMsg("Filtros aplicados com sucesso! 🔍");
        setToastType("info");
        setShowToast(true);
        setTimeout(() => setShowToast(false), 1300);
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Erro ao carregar dados:", error);
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
      }
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

  // Handlers
  const handleFilterChange = useCallback((e) => {
    const { name, value } = e.target;
    setSelectedFilters((prev) => {
      const updated = { ...prev, [name]: value };

      if (name === "grupoEtapa") {
        updated.etapaMatricula = "";
        updated.etapaTurma = "";
      }
      if (name === "etapaMatricula" && value !== "") {
        updated.etapaTurma = "";
      }
      if (name === "etapaTurma" && value !== "") {
        updated.etapaMatricula = "";
      }

      carregarDados(updated);
      return updated;
    });
  }, []);

  const handleSchoolClick = useCallback(
    (escola) => {
      setSelectedFilters((prev) => {
        const updated = { ...prev };
        if (selectedSchool && selectedSchool.idescola === escola.idescola) {
          setSelectedSchool(null);
          updated.idescola = "";
        } else {
          setSelectedSchool(escola);
          updated.idescola = escola.idescola;
        }
        carregarDados(updated);
        return updated;
      });
    },
    [selectedSchool]
  );

  const sair = useCallback(() => {
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  }, [navigate]);

  // Trend
  const trendData = useMemo(() => {
    let value = "N/A";
    let color = "";
    if (data.tendenciaMatriculas) {
      const { missing, percent } = data.tendenciaMatriculas;
      if (missing === 0) {
        value = "0 (0%)";
      } else {
        const sign = missing > 0 ? "-" : "+";
        value = `${formatNumber(Math.abs(missing))} (${sign}${percent}%)`;
        color = missing > 0 ? "red" : "green";
      }
    }
    return { value, color };
  }, [data.tendenciaMatriculas]);

  // Charts data/options
  const chartData = useMemo(() => {
    return {
      movimentacao: {
        labels: Object.keys(data.entradasSaidasPorMes || {}),
        datasets: [
          {
            label: "Entradas",
            data: Object.values(data.entradasSaidasPorMes || {}).map((e) => e.entradas),
            backgroundColor: "#FBBF24",
            borderRadius: 6,
          },
          {
            label: "Saídas",
            data: Object.values(data.entradasSaidasPorMes || {}).map((e) => e.saidas),
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
              const s = (sexo || "").toLowerCase();
              if (s.includes("masc")) return "#0000FF";
              if (s.includes("femi")) return "#FFC0CB";
              return "#CCCCCC";
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
              const turnoColors = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6", "#EC4899"];
              return turnoColors[index % turnoColors.length];
            }),
            borderRadius: 4,
          },
        ],
      },
    };
  }, [data.entradasSaidasPorMes, data.matriculasPorSexo, data.matriculasPorTurno]);

  const chartOptions = useMemo(() => {
    return {
      movimentacao: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { color: "#6B7280" } },
          datalabels: { display: false },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#6B7280", font: { weight: "bold" } } },
          y: {
            grid: { color: "#E5E7EB" },
            ticks: { color: "#6B7280", font: { weight: "bold" }, callback: (v) => formatNumber(v) },
          },
        },
        layout: { padding: { top: 20, bottom: 20 } },
      },
      sexo: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          datalabels: { display: true, color: "#fff", font: { weight: "bold" }, formatter: (v) => formatNumber(v) },
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
            font: { weight: "bold" },
            anchor: "end",
            align: "right",
            offset: 4,
            formatter: (v) => formatNumber(v),
          },
        },
        scales: {
          x: {
            grid: { color: "#E5E7EB" },
            ticks: { color: "#6B7280", font: { weight: "bold" }, callback: (v) => formatNumber(v) },
          },
          y: { grid: { display: false }, ticks: { color: "#6B7280", font: { weight: "bold" } } },
        },
        layout: { padding: { left: 20, right: 20 } },
      },
    };
  }, []);

  // Filtro de escolas
  const filteredEscolas = useMemo(() => {
    const term = (searchTerm || "").toLowerCase();
    return (data.escolas || []).filter((e) => (e.escola || "").toLowerCase().includes(term));
  }, [data.escolas, searchTerm]);

  // Data formatada
  const formattedUpdateDate = useMemo(() => {
    if (!data.ultimaAtualizacao) return null;
    const d = new Date(data.ultimaAtualizacao);
    d.setHours(d.getHours() + 3);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}:${pad(d.getSeconds())}`;
  }, [data.ultimaAtualizacao]);

  // === RENDER ===
  return (
    <div className={`${isMobile ? "min-h-screen" : "h-screen"} w-screen flex flex-col bg-gradient-to-br from-violet-500 via-pink-400 to-blue-400`}>
      <AnimatePresence>{showToast && <Toast message={toastMsg} show={showToast} type={toastType} />}</AnimatePresence>

      {/* Topo */}
      <div className="w-full bg-white/80 rounded-b-2xl shadow-md mb-2 flex items-center justify-between px-2 py-3 md:px-8 md:py-5 md:mb-4">
        <div className="flex items-center">
          <button
            id="filterButton"
            onClick={() => setShowSidebar(true)}
            className="bg-violet-600 text-white rounded-full shadow-xl flex items-center justify-center p-3 hover:bg-pink-500 transition-colors"
            style={{ fontSize: 28, minWidth: 48, minHeight: 48 }}
            title="Filtrar"
          >
            <FaFilter />
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center">
          <h1
            className="font-bold text-center text-gray-800 drop-shadow-sm"
            style={{ fontSize: "clamp(1.1rem, 2.8vw, 2.1rem)", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "94vw" }}
          >
            {clientName || "SEMED - TESTE"}
          </h1>
          <span className="text-[0.95rem] md:text-lg text-gray-600 text-center -mt-1">Painel de Matrículas</span>
        </div>

        <div className="flex items-center">
          <button
            onClick={sair}
            className="bg-red-600 text-white rounded-full shadow-md flex items-center justify-center p-3 hover:bg-red-700 transition-colors"
            title="Sair"
            style={{ fontSize: 28, minWidth: 48, minHeight: 48 }}
          >
            <FaSignOutAlt />
          </button>
        </div>
      </div>

      {/* Badge de escola ativa */}
      {selectedSchool && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center my-2">
          <span className="bg-violet-100 text-violet-800 px-4 py-1 rounded-full text-sm font-bold shadow">
            Filtro ativo: {selectedSchool.escola}
          </span>
          <button onClick={() => handleSchoolClick(selectedSchool)} className="ml-2 text-red-600 hover:underline text-xs font-semibold">
            Remover filtro
          </button>
        </motion.div>
      )}

      {/* Data de atualização */}
      {formattedUpdateDate && (
        <div className="p-2 bg-violet-100/90 text-center text-sm text-gray-700 rounded-xl mx-4 mt-2 shadow">Dados atualizados: {formattedUpdateDate}</div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-2 min-[461px]:grid-cols-3 min-[720px]:grid-cols-6 gap-3 mb-4 px-4 pt-6">
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
            loading={loadingCards.totalMatriculas}
          />
          <Tooltip id="matriculas-tooltip" />
        </div>

        <div>
          <Card
            label="Comparativo"
            value={trendData.value}
            icon={<FaBalanceScale />}
            borderColor="border-black"
            comparativo={null}
            disableFormat
            valueColor={trendData.color}
            loading={loadingCards.totalMatriculas}
            isComparativo
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
            loading={loadingCards.totalEscolas}
          />
          <Tooltip id="escolas-tooltip" />
        </div>

        <Card
          label="Vagas"
          value={data.totalVagas}
          icon={<FaChalkboardTeacher />}
          borderColor="border-purple-500"
          comparativo={data.comparativos ? data.comparativos.totalVagas : null}
          loading={loadingCards.totalVagas}
        />
        <Card
          label="Entradas"
          value={data.totalEntradas}
          icon={<FaSignInAlt />}
          borderColor="border-yellow-500"
          comparativo={data.comparativos ? data.comparativos.totalEntradas : null}
          loading={loadingCards.totalEntradas}
        />
        <Card
          label="Saídas"
          value={data.totalSaidas}
          icon={<FaSignOutAlt />}
          borderColor="border-red-500"
          comparativo={data.comparativos ? data.comparativos.totalSaidas : null}
          loading={loadingCards.totalSaidas}
        />
      </div>

      {/* Tabela + Movimentação */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 px-4 pb-4" ref={chartGate}>
        {/* Tabela */}
        <div className={`bg-white/75 rounded-2xl shadow-2xl overflow-y-auto ${tableGraphHeight} ring-1 ring-violet-100`}>
          <div className="p-4 bg-gray-50/60 border-b flex justify-between items-center rounded-t-2xl">
            <h3 className="text-lg font-semibold text-gray-700">Detalhes por Escola</h3>
            <button onClick={() => setShowSearch((s) => !s)}>
              <FaSearch size={20} className="text-gray-700 cursor-pointer" />
            </button>
          </div>

          {showSearch && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="p-2">
              <input
                type="text"
                placeholder="Buscar escola..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                style={{ textTransform: "uppercase" }}
                className="w-full p-2 border border-gray-300 rounded"
              />
            </motion.div>
          )}

          <div className="overflow-x-hidden">
            {loadingTable ? (
              <TableSkeleton />
            ) : inView ? (
              <Suspense fallback={<TableSkeleton />}>
                <EscolasTable
                  escolas={filteredEscolas}
                  searchTerm={searchTerm}
                  selectedSchool={selectedSchool}
                  handleSchoolClick={handleSchoolClick}
                  loading={loadingTable}
                />
              </Suspense>
            ) : (
              <TableSkeleton />
            )}
          </div>
        </div>

        {/* Movimentação Mensal */}
        <div className={`bg-white/75 rounded-2xl shadow-2xl p-4 flex flex-col ${tableGraphHeight} ring-1 ring-violet-100`}>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Movimentação Mensal</h3>
          <div className="flex-1 overflow-hidden">
            {loadingGraphMov ? (
              <ChartSkeleton />
            ) : inView ? (
              <Suspense fallback={<ChartSkeleton />}>
                <MovimentacaoChart data={chartData.movimentacao} options={chartOptions.movimentacao} loading={loadingGraphMov} />
              </Suspense>
            ) : (
              <ChartSkeleton />
            )}
          </div>
        </div>
      </div>

      {/* Gráficos adicionais */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 pb-6">
        {/* Sexo */}
        <div className="bg-white/75 rounded-2xl shadow-2xl p-4 flex flex-col h-[250px] ring-1 ring-violet-100">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Matrículas por Sexo</h3>
          <div className="flex-1">
            {loadingPieSexo ? (
              <ChartSkeleton />
            ) : inView ? (
              <Suspense fallback={<ChartSkeleton />}>
                <SexoChart data={chartData.sexo} options={chartOptions.sexo} loading={loadingPieSexo} />
              </Suspense>
            ) : (
              <ChartSkeleton />
            )}
          </div>
        </div>

        {/* Turno */}
        <div className="bg-white/75 rounded-2xl shadow-2xl p-4 flex flex-col h-[250px] ring-1 ring-violet-100">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Matrículas por Turno</h3>
          <div className="flex-1">
            {loadingBarTurno ? (
              <ChartSkeleton />
            ) : inView ? (
              <Suspense fallback={<ChartSkeleton />}>
                <TurnoChart data={chartData.turno} options={chartOptions.turno} loading={loadingBarTurno} />
              </Suspense>
            ) : (
              <ChartSkeleton />
            )}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            id="sidebar"
            initial={{ x: -350, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -350, opacity: 0 }}
            transition={{ duration: 0.32, type: "spring", bounce: 0.19 }}
            className="fixed inset-y-0 left-0 bg-white w-64 md:w-80 p-6 shadow-2xl z-50 ring-1 ring-violet-200 overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Filtros</h2>
              <button onClick={() => setShowSidebar(false)} className="text-gray-500 hover:text-violet-600 transition-colors text-2xl">
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <FilterSelect label="Ano Letivo" name="anoLetivo" options={filters.ano_letivo} value={selectedFilters.anoLetivo} onChange={handleFilterChange} />
              <FilterSelect label="Tipo Matrícula" name="tipoMatricula" options={filters.tipo_matricula} value={selectedFilters.tipoMatricula} onChange={handleFilterChange} />
              <FilterSelect label="Situação Matrícula" name="situacaoMatricula" options={filters.situacao_matricula} value={selectedFilters.situacaoMatricula} onChange={handleFilterChange} />
              <FilterSelect label="Grupo Etapa" name="grupoEtapa" options={filters.grupo_etapa} value={selectedFilters.grupoEtapa} onChange={handleFilterChange} />
              <FilterSelect
                label="Etapa Matrícula"
                name="etapaMatricula"
                options={selectedFilters.grupoEtapa && filters.etapasMatriculaPorGrupo ? filters.etapasMatriculaPorGrupo[selectedFilters.grupoEtapa] : filters.etapa_matricula}
                value={selectedFilters.etapaMatricula}
                onChange={handleFilterChange}
                disabled={selectedFilters.etapaTurma !== ""}
              />
              <FilterSelect
                label="Etapa Turma"
                name="etapaTurma"
                options={selectedFilters.grupoEtapa && filters.etapasTurmaPorGrupo ? filters.etapasTurmaPorGrupo[selectedFilters.grupoEtapa] : filters.etapa_turma}
                value={selectedFilters.etapaTurma}
                onChange={handleFilterChange}
                disabled={selectedFilters.etapaMatricula !== ""}
              />
              <FilterSelect label="Multissérie" name="multisserie" options={filters.multisserie} value={selectedFilters.multisserie} onChange={handleFilterChange} />
              <FilterSelect label="Deficiência" name="deficiencia" options={filters.deficiencia} value={selectedFilters.deficiencia} onChange={handleFilterChange} />
              <FilterSelect label="Transporte Escolar" name="transporteEscolar" options={filters.transporte_escolar} value={selectedFilters.transporteEscolar} onChange={handleFilterChange} />
              <FilterSelect
                label="Tipo Transporte"
                name="tipoTransporte"
                options={filters.tipo_transporte}
                value={selectedFilters.tipoTransporte}
                onChange={handleFilterChange}
                disabled={selectedFilters.transporteEscolar !== "SIM"}
              />
            </div>

            <div className="mt-8 flex justify-center">
              <button
                onClick={() => {
                  const ultimoAnoLetivo = filters.ano_letivo?.[0] || "";
                  const reset = {
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
                  setSelectedFilters(reset);
                  setSelectedSchool(null);
                  carregarDados(reset);
                  setShowSidebar(false);
                }}
                className="bg-violet-600 text-white px-6 py-2 rounded-lg hover:bg-violet-700 transition-colors shadow-md"
              >
                Limpar Filtros
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
