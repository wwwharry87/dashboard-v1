import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from './api';

// Recharts
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';

/**
 * AiAssistant.jsx (TOP)
 *
 * Premium UX:
 * - Envia contexto rico (history + availableFilters)
 * - Mantém conversationId para continuidade
 * - Quando kind === 'breakdown', renderiza gráfico (recharts) com fallback para tabela
 * - Quando kind === 'disambiguation', oferece botões de escolha + "somar"/"separar"
 */

function formatPtBRNumber(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x ?? '0');
  return n.toLocaleString('pt-BR');
}

function formatPercentMaybe(metric, value) {
  if (metric === 'taxa_evasao') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0,00%';
    return `${n.toFixed(2).replace('.', ',')}%`;
  }
  return formatPtBRNumber(value);
}

function clampText(s, max = 28) {
  const t = String(s ?? '');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function Badge({ children }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-xs">
      {children}
    </span>
  );
}

function Table({ columns, rows }) {
  return (
    <div className="mt-3 overflow-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="text-left font-semibold text-gray-700 px-3 py-2 whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className={idx % 2 ? 'bg-white' : 'bg-gray-50/40'}>
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-gray-800 whitespace-nowrap">
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

class ChartErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    // no-op
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function BreakdownChart({ rows, metric, groupBy, onDrillDown }) {
  const data = (rows || []).map((r) => ({
    name: String(r.label ?? ''),
    value: Number(r.value) || 0,
  }));

  if (!data.length) return null;

  // Limita para não ficar feio no chat
  const sliced = data.slice(0, 18);

  const handleBarClick = (barData) => {
    const payload = barData?.payload || barData;
    const label = payload?.name;
    if (!label || !groupBy || typeof onDrillDown !== 'function') return;
    onDrillDown({ dimension: groupBy, value: String(label) });
  };

  const tooltipFormatter = (val) => formatPercentMaybe(metric, val);

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-xs text-gray-500 mb-2">Visualização</div>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sliced} layout="vertical" margin={{ top: 8, right: 18, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={(v) => (metric === 'taxa_evasao' ? `${Number(v).toFixed(0)}%` : formatPtBRNumber(v))} />
            <YAxis
              type="category"
              dataKey="name"
              width={150}
              tickFormatter={(v) => clampText(v, 26)}
            />
            <Tooltip formatter={tooltipFormatter} labelFormatter={(l) => String(l)} />
            <Legend />
            <Bar
              dataKey="value"
              name="Valor"
              radius={[8, 8, 8, 8]}
              cursor={onDrillDown ? 'pointer' : 'default'}
              onClick={handleBarClick}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.length > sliced.length && (
        <div className="mt-2 text-[11px] text-gray-500">
          Mostrando {sliced.length} de {data.length} itens (use filtros ou peça “top 10”).
        </div>
      )}

      {onDrillDown && (
        <div className="mt-2 text-[11px] text-gray-500">
          Dica: clique em uma barra para aplicar o filtro e detalhar.
        </div>
      )}
    </div>
  );
}

function buildHistoryString(messages, maxPairs = 4) {
  const last = Array.isArray(messages) ? messages.slice(-maxPairs * 2) : [];
  return last
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').trim()}`)
    .join('\n');
}

export default function AiAssistant({ filters, totals, filtersCatalog }) {
  const [messages, setMessages] = useState(() => ([
    {
      role: 'assistant',
      kind: 'intro',
      content:
        'Oi! Eu sou sua IA do Dashboard. Me pergunte coisas como:\n' +
        '• "Comparar matrículas 2026 vs 2025"\n' +
        '• "Top 10 escolas com mais matrículas"\n' +
        '• "Quantas turmas do 1º ano?"\n' +
        '• "Matrículas por turno"\n\n' +
        'Eu respondo com números agregados (sem dados pessoais de alunos).',
      suggestions: [
        'Comparar matrículas 2026 vs 2025',
        'Top 10 escolas com mais matrículas',
        'Quantas turmas do 1º ano?',
        'Matrículas por turno',
        'Matrículas por sexo',
      ],
    },
  ]));

  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);

  // filtros locais aplicados via cliques (drill-down)
  const [aiFilters, setAiFilters] = useState({});

  // quando o backend pedir desambiguação, guardamos a última pergunta para reenviar com selection
  const [pendingDisambiguation, setPendingDisambiguation] = useState(null);

  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const canSend = useMemo(() => !!question.trim() && !loading, [question, loading]);

  async function send(q, opts = {}) {
    const trimmed = String(q || '').trim();
    if (!trimmed || loading) return;

    const selection = opts.selection || null;
    const mergedFilters = {
      ...(filters || {}),
      ...(aiFilters || {}),
      ...(opts.extraFilters || {}),
    };

    // Se estamos respondendo uma desambiguação, não duplicar o texto do user (fica feio)
    const shouldAppendUser = !opts.silentUser;

    if (shouldAppendUser) {
      setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    }

    setQuestion('');
    setLoading(true);

    try {
      const history = buildHistoryString(messages, 4);

      const { data: json } = await api.post('/ai/query', {
        question: trimmed,
        filters: mergedFilters,
        history,
        conversationId: conversationId || null,
        selection,
        dashboardContext: {
          availableFilters: filtersCatalog || null,
          totals: totals || null,
          activeFilters: mergedFilters,
        },
      });

      if (json?.conversationId) setConversationId(json.conversationId);

      // se o backend pediu desambiguação, guarda a pergunta que gerou isso
      if (json?.kind === 'disambiguation') {
        setPendingDisambiguation({
          question: trimmed,
          clarify: json?.clarify || null,
          options: json?.options || [],
        });
      } else {
        setPendingDisambiguation(null);
      }

      setMessages((prev) => {
        const lastAssistant = [...prev].reverse().find((m) => m.role === 'assistant');

        const next = {
          role: 'assistant',
          content: json?.answer || json?.error || 'Não consegui processar agora.',
          kind: json?.kind || (json?.ok ? 'ok' : 'error'),
          data: json?.data,
          spec: json?.spec,
          insights: json?.insights || null,
          healed: !!json?.healed,
          suggestions: json?.suggestions || [],
          options: json?.options || [],
          clarify: json?.clarify || null,
        };

        // evita loop de clarify idêntico
        if (lastAssistant && lastAssistant.content === next.content && next.kind === 'clarify') {
          const merged = Array.from(new Set([...(lastAssistant.suggestions || []), ...(next.suggestions || [])])).slice(0, 8);
          const updatedLast = { ...lastAssistant, suggestions: merged };
          const out = prev.slice();
          const idx = out.lastIndexOf(lastAssistant);
          if (idx >= 0) out[idx] = updatedLast;
          return out;
        }

        return [...prev, next];
      });
    } catch (e) {
      const backendMsg = e?.response?.data?.error || e?.response?.data?.message || e?.response?.data?.details;
      const msg = backendMsg || e?.message || 'erro desconhecido';
      setMessages((prev) => [...prev, { role: 'assistant', kind: 'error', content: `Erro ao consultar IA: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  function sendSuggestion(text) {
    send(text);
  }

  function sendDisambiguationChoice(choice) {
    const pending = pendingDisambiguation;
    const clarifyType = pending?.clarify?.type;

    // Caso 1: desambiguação de "turmas cheias / sem vagas" — resolvemos reenviando a mesma pergunta
    // com um sufixo que deixa a intenção inequívoca (sem precisar de selection estruturado).
    if (clarifyType === 'choose_turmas_vagas' && pending?.question) {
      const suffix =
        choice === 'sem_vagas' ? ' sem vagas' :
        choice === 'excedidas' ? ' excedidas (acima da capacidade)' :
        ' quase cheias (até 5 vagas)';

      send(`${pending.question}${suffix}`, { silentUser: true });
      return;
    }

    // Caso 2: desambiguação de etapa (fluxo antigo)
    const dim = pending?.clarify?.dimension;
    if (!pending?.question || !dim) return;

    send(pending.question, {
      silentUser: true,
      selection: { dimension: dim, value: choice },
    });
  }

  function sendDisambiguationMode(mode) {
    const pending = pendingDisambiguation;
    const dim = pending?.clarify?.dimension;
    const matches = pending?.clarify?.matches || pending?.options || [];

    if (!pending?.question || !dim || !Array.isArray(matches) || !matches.length) return;

    send(pending.question, {
      silentUser: true,
      selection: { mode, dimension: dim, matches },
    });
  }

  // =========================
  // Drill-down: mapeia dimensão (snake_case) -> chave de filtro usada no backend
  // =========================
  const mapDimensionToFilterKey = (dimension) => {
    if (!dimension) return null;
    const d = String(dimension);
    if (d === 'zona_aluno') return 'zonaAluno';
    if (d === 'zona_escola') return 'zonaEscola';
    if (d === 'situacao_matricula') return 'situacaoMatricula';
    if (d === 'tipo_matricula') return 'tipoMatricula';
    if (d === 'etapa_matricula') return 'etapaMatricula';
    if (d === 'etapa_turma') return 'etapaTurma';
    if (d === 'grupo_etapa') return 'grupoEtapa';
    if (d === 'transporte_escolar') return 'transporteEscolar';
    if (d === 'tipo_transporte') return 'tipoTransporte';
    // fallback: tenta usar como veio
    return d;
  };

  const prettyDimension = (dimension) => String(dimension || '').replace(/_/g, ' ');

  // =========================
  // Exportação (PDF / Excel) da resposta da IA (client-side)
  // =========================
  const metricLabelMap = {
    total_matriculas: 'Total de matrículas',
    matriculas_ativas: 'Matrículas ativas',
    desistentes: 'Desistentes',
    taxa_evasao: 'Taxa de evasão',
    total_turmas: 'Total de turmas',
    total_escolas: 'Total de escolas',
    taxa_ocupacao: 'Taxa de ocupação',
    total_vagas_disponiveis: 'Vagas disponíveis',
    total_entradas: 'Entradas',
    total_saidas: 'Saídas',
  };

  const sanitizeFileName = (name) =>
    String(name || 'relatorio')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\-_ ]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'relatorio';

  const buildReportTable = (msg) => {
    const kind = msg?.kind;
    const spec = msg?.spec || {};
    const data = msg?.data || {};
    const insights = msg?.insights || null;

    const metric = data.metric || spec.metric;
    const metricLabel = metricLabelMap[metric] || metric || 'Métrica';

    if (kind === 'single') {
      const value = data?.value;
      const valueFmt = metric === 'taxa_evasao' ? `${Number(value || 0).toFixed(2).replace('.', ',')}%` : formatPtBRNumber(value || 0);
      const head = ['Campo', 'Valor'];
      const body = [[metricLabel, valueFmt]];
      if (insights?.text) body.push(['Insight', insights.text]);
      return { title: metricLabel, head, body };
    }

    if ((kind === 'breakdown' || kind === 'ok') && Array.isArray(data?.rows)) {
      const head = ['Grupo', 'Valor'];
      const body = data.rows.map((r) => [String(r.label ?? ''), formatPercentMaybe(metric, r.value)]);
      return { title: `${metricLabel} por ${prettyDimension(data.groupBy || spec.groupBy)}`, head, body };
    }

    if (kind === 'compare' && Array.isArray(data?.rows)) {
      const by = prettyDimension(data.groupBy || spec.groupBy);
      const baseYear = data?.compare?.baseYear ?? 'Base';
      const compYear = data?.compare?.compareYear ?? 'Comparação';
      const head = [`Grupo (${by || 'geral'})`, String(baseYear), String(compYear), 'Δ', '%Δ'];
      const body = data.rows.map((r) => [
        String(r.label ?? ''),
        formatPercentMaybe(metric, r.base_value),
        formatPercentMaybe(metric, r.compare_value),
        formatPercentMaybe(metric, r.delta),
        r.pct_change === null || r.pct_change === undefined ? '—' : `${Number(r.pct_change).toFixed(2).replace('.', ',')}%`,
      ]);
      return { title: `${metricLabel} — comparativo`, head, body };
    }

    if (kind === 'list' && Array.isArray(data?.rows)) {
      // tenta inferir colunas do primeiro item
      const first = data.rows[0] || {};
      const keys = Object.keys(first).slice(0, 12);
      const head = keys.map((k) => prettyDimension(k));
      const body = data.rows.map((r) => keys.map((k) => {
        const v = r?.[k];
        if (typeof v === 'number') return formatPtBRNumber(v);
        return String(v ?? '');
      }));
      return { title: 'Lista', head, body };
    }

    return null;
  };

  const exportReport = async (format, msg) => {
    const table = buildReportTable(msg);
    if (!table) {
      alert('Não há dados tabulares para exportar nesta resposta.');
      return;
    }

    const title = table.title || 'Relatório';
    const fileBase = sanitizeFileName(title);
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

    if (format === 'excel') {
      const ExcelJSModule = await import('exceljs');
      const ExcelJS = ExcelJSModule?.default ?? ExcelJSModule;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Relatorio');

      ws.addRow([title]);
      ws.getRow(1).font = { bold: true, size: 14 };
      ws.addRow([`Gerado em: ${new Date().toLocaleString('pt-BR')}`]);
      ws.addRow([]);

      ws.addRow(table.head);
      ws.getRow(ws.lastRow.number).font = { bold: true };
      table.body.forEach((r) => ws.addRow(r));

      ws.views = [{ state: 'frozen', ySplit: 4 }];
      ws.columns = table.head.map(() => ({ width: 28 }));

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileBase}_${stamp}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // PDF
    const jsPDFModule = await import('jspdf');
    const autoTableModule = await import('jspdf-autotable');
    const jsPDF = jsPDFModule?.jsPDF ?? jsPDFModule?.default ?? jsPDFModule;

    const resolveAutoTable = (mod) => {
      if (!mod) return null;
      if (typeof mod === 'function') return mod;
      if (typeof mod?.default === 'function') return mod.default;
      if (typeof mod?.autoTable === 'function') return mod.autoTable;
      if (typeof mod?.default?.autoTable === 'function') return mod.default.autoTable;
      return null;
    };
    const autoTable = resolveAutoTable(autoTableModule);
    if (!autoTable) throw new Error('jspdf-autotable não carregou corretamente.');

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, pageWidth / 2, 18, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, 28);

    autoTable(doc, {
      startY: 34,
      head: [table.head],
      body: table.body,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fontStyle: 'bold' },
    });

    doc.save(`${fileBase}_${stamp}.pdf`);
  };

  function renderAssistantExtras(m) {
    const data = m?.data;
    const spec = m?.spec;
    const suggestions = (m?.suggestions || []).filter(Boolean);

    const metaBadges = (m?.healed || m?.insights) ? (
      <div className="mt-2 flex flex-wrap gap-2">
        {m?.healed && (
          <span className="px-2 py-1 rounded-full text-[11px] border border-amber-200 bg-amber-50 text-amber-800">
            ✅ Autocorreção aplicada
          </span>
        )}
        {m?.insights?.text && (
          <span className="px-2 py-1 rounded-full text-[11px] border border-blue-200 bg-blue-50 text-blue-800">
            📌 Insight
          </span>
        )}
      </div>
    ) : null;

    const reportButtons = (
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => exportReport('pdf', m)}
          className="px-3 py-1.5 rounded-full text-xs border border-gray-200 bg-white hover:bg-gray-50"
        >
          📄 Baixar PDF
        </button>
        <button
          onClick={() => exportReport('excel', m)}
          className="px-3 py-1.5 rounded-full text-xs border border-gray-200 bg-white hover:bg-gray-50"
        >
          📊 Baixar Excel
        </button>
      </div>
    );

    // Desambiguação
    if (m.kind === 'disambiguation' && Array.isArray(m.options) && m.options.length) {
      const clarifyType = m?.clarify?.type;

      // Turmas cheias/sem vagas: apenas botões simples
      if (clarifyType === 'choose_turmas_vagas') {
        const labelMap = {
          sem_vagas: 'Sem vagas',
          excedidas: 'Excedidas',
          quase_sem_vagas: 'Quase cheias',
        };
        return (
          <div className="mt-3 space-y-2">
            <div className="text-xs text-gray-500">Escolha uma opção:</div>
            <div className="flex flex-wrap gap-2">
              {m.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => sendDisambiguationChoice(opt)}
                  className="px-3 py-1.5 rounded-full text-xs border border-gray-200 bg-white hover:bg-gray-50"
                >
                  {labelMap[opt] || opt}
                </button>
              ))}
            </div>
          </div>
        );
      }

      // Etapa: mantém fluxo com "somar"/"separar"
      return (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => sendDisambiguationMode('sum')}
              className="px-3 py-1.5 rounded-full text-xs border border-gray-200 bg-white hover:bg-gray-50"
            >
              Somar todas
            </button>
            <button
              onClick={() => sendDisambiguationMode('separate')}
              className="px-3 py-1.5 rounded-full text-xs border border-gray-200 bg-white hover:bg-gray-50"
            >
              Separar por opção
            </button>
          </div>

          <div className="text-xs text-gray-500">Ou escolha uma opção:</div>
          <div className="flex flex-wrap gap-2">
            {m.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => sendDisambiguationChoice(opt)}
                className="px-3 py-1.5 rounded-full text-xs border border-gray-200 bg-white hover:bg-gray-50"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Compare
    if (data?.rows && Array.isArray(data.rows) && data.rows.length && m.kind === 'compare') {
      const cols = [
        { key: 'label', label: spec?.groupBy ? `Grupo (${spec.groupBy})` : 'Grupo' },
        { key: 'base', label: `${data.compare?.baseYear ?? 'Base'}` },
        { key: 'comp', label: `${data.compare?.compareYear ?? 'Comparação'}` },
        { key: 'delta', label: 'Δ' },
        { key: 'pct', label: '% Δ' },
      ];

      const rows = data.rows.map((r) => ({
        label: r.label,
        base: formatPercentMaybe(data.metric, r.base_value),
        comp: formatPercentMaybe(data.metric, r.compare_value),
        delta: formatPercentMaybe(data.metric, r.delta),
        pct: r.pct_change === null || r.pct_change === undefined ? '—' : `${Number(r.pct_change).toFixed(2).replace('.', ',')}%`,
      }));

      return (
        <>
          {metaBadges}
          {reportButtons}
          <Table columns={cols} rows={rows} />
          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendSuggestion(s)}
                  className="px-3 py-1.5 rounded-full text-xs border border-gray-200 bg-white hover:bg-gray-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      );
    }

    // Breakdown (gráfico + fallback tabela)
    if (data?.rows && Array.isArray(data.rows) && data.rows.length && (m.kind === 'breakdown' || m.kind === 'ok')) {
      const metric = data.metric || spec?.metric;
      const groupBy = data.groupBy || spec?.groupBy;

      const onDrillDown = ({ dimension, value }) => {
        const key = mapDimensionToFilterKey(dimension);
        if (!key) return;
        const extraFilters = { [key]: value };
        setAiFilters((prev) => ({ ...(prev || {}), ...extraFilters }));

        // por padrão, ao clicar em um grupo, detalha por escola (efeito Power BI)
        const nextQuestion = groupBy && String(groupBy) === 'escola'
          ? `Filtrar por ${prettyDimension(dimension)} = ${value} e mostrar detalhes`
          : `Filtrar por ${prettyDimension(dimension)} = ${value} e detalhar por escola`;

        send(nextQuestion, { silentUser: true, selection: { dimension, value }, extraFilters });
      };

      const cols = [
        { key: 'label', label: groupBy ? `Grupo (${groupBy})` : 'Grupo' },
        { key: 'value', label: 'Valor' },
      ];
      const rows = data.rows.map((r) => ({
        label: r.label,
        value: formatPercentMaybe(metric, r.value),
      }));

      const chart = (
        <BreakdownChart rows={data.rows} metric={metric} groupBy={groupBy} onDrillDown={onDrillDown} />
      );

      const fallback = <Table columns={cols} rows={rows} />;

      return (
        <>
          {metaBadges}
          {reportButtons}
          {m.kind === 'breakdown' ? (
            <ChartErrorBoundary fallback={fallback}>{chart}</ChartErrorBoundary>
          ) : (
            fallback
          )}

          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendSuggestion(s)}
                  className="px-3 py-1.5 rounded-full text-xs border border-gray-200 bg-white hover:bg-gray-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      );
    }

    // Lista (ex.: turmas sem vagas)
    if (data?.rows && Array.isArray(data.rows) && data.rows.length && m.kind === 'list') {
      const cols = [
        { key: 'escola', label: 'Escola' },
        { key: 'turma', label: 'Turma' },
        { key: 'etapa_turma', label: 'Etapa' },
        { key: 'turno', label: 'Turno' },
        { key: 'capacidade', label: 'Capacidade' },
        { key: 'matriculas_ativas', label: 'Ativos' },
        { key: 'vagas_disponiveis', label: 'Vagas' },
        { key: 'taxa_ocupacao', label: '% Ocup.' },
      ];

      const rows = data.rows.map((r) => ({
        escola: clampText(r.escola, 36),
        turma: clampText(r.turma, 26),
        etapa_turma: clampText(r.etapa_turma, 20),
        turno: r.turno,
        capacidade: formatPtBRNumber(r.capacidade),
        matriculas_ativas: formatPtBRNumber(r.matriculas_ativas),
        vagas_disponiveis: formatPtBRNumber(r.vagas_disponiveis),
        taxa_ocupacao: r.taxa_ocupacao === null || r.taxa_ocupacao === undefined ? '—' : `${Number(r.taxa_ocupacao).toFixed(2).replace('.', ',')}%`,
      }));

      return (
        <>
          {metaBadges}
          {reportButtons}
          <Table columns={cols} rows={rows} />
          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendSuggestion(s)}
                  className="px-3 py-1.5 rounded-full text-xs border border-gray-200 bg-white hover:bg-gray-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      );
    }

    // Single (apenas badges + export + sugestões)
    if (m.kind === 'single' && data && (data.value !== undefined && data.value !== null)) {
      return (
        <>
          {metaBadges}
          {reportButtons}
          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendSuggestion(s)}
                  className="px-3 py-1.5 rounded-full text-xs border border-gray-200 bg-white hover:bg-gray-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      );
    }

    // Clarify chips
    if (m.kind === 'clarify' && suggestions.length > 0) {
      return (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => sendSuggestion(s)}
              className="px-3 py-1.5 rounded-full text-xs border border-gray-200 bg-white hover:bg-gray-50"
            >
              {s}
            </button>
          ))}
        </div>
      );
    }

    return null;
  }

  return (
    <div className="w-full rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-violet-600/10 flex items-center justify-center">
            <span className="text-violet-700 font-bold">AI</span>
          </div>
          <div>
            <div className="font-semibold text-gray-900">Assistente do Dashboard</div>
            <div className="text-xs text-gray-500">Agente de dados (Text-to-SQL) • Premium</div>
          </div>
        </div>
        <Badge>{conversationId ? 'Conectado' : 'Novo chat'}</Badge>
      </div>

      <div className="px-4 py-3 h-[420px] overflow-auto">
        {Object.keys(aiFilters || {}).length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Filtros IA:</span>
            {Object.entries(aiFilters).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border border-gray-200 bg-white">
                <span className="text-gray-600">{prettyDimension(k)}</span>
                <span className="font-medium text-gray-900">{String(v)}</span>
                <button
                  type="button"
                  onClick={() => setAiFilters((prev) => {
                    const next = { ...(prev || {}) };
                    delete next[k];
                    return next;
                  })}
                  className="ml-1 text-gray-400 hover:text-gray-700"
                  title="Remover filtro"
                >
                  ✕
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setAiFilters({})}
              className="px-2 py-1 rounded-full text-[11px] border border-gray-200 bg-white hover:bg-gray-50"
            >
              Limpar
            </button>
          </div>
        )}
        <div className="space-y-3">
          {messages.map((m, idx) => (
            <div key={idx} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  m.role === 'user'
                    ? 'max-w-[90%] rounded-2xl rounded-br-sm bg-violet-600 text-white px-3 py-2 text-sm'
                    : 'max-w-[90%] rounded-2xl rounded-bl-sm bg-gray-50 text-gray-900 px-3 py-2 text-sm border border-gray-100'
                }
              >
                <div className="whitespace-pre-line leading-relaxed">{m.content}</div>
                {m.role === 'assistant' && renderAssistantExtras(m)}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-gray-50 text-gray-900 px-3 py-2 text-sm border border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
                  <span className="text-gray-600">Pensando...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="px-4 py-3 border-t border-gray-100">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(question);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder='Ex.: "Top 10 escolas com mais matrículas"'
            className="flex-1 h-11 px-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
          <button
            type="submit"
            disabled={!canSend}
            className={
              canSend
                ? 'h-11 px-4 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700'
                : 'h-11 px-4 rounded-xl bg-gray-200 text-gray-500 font-semibold cursor-not-allowed'
            }
          >
            Enviar
          </button>
        </form>

        <div className="mt-2 text-[11px] text-gray-500">
          Dica: use os filtros do dashboard (ano, etapa, turno, etc.) e depois pergunte aqui.
        </div>
      </div>
    </div>
  );
}
