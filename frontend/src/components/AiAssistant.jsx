import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from './api';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

/**
 * AiAssistant.jsx
 *
 * Chat simples para "Pergunte ao Dashboard".
 * - Mostra sugestões (chips) quando o backend retorna kind=clarify
 * - Renderiza tabelas para breakdown/compare
 * - Evita repetir a mesma mensagem de clarificação em loop
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

function Badge({ children }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-xs">
      {children}
    </span>
  );
}

function Table({ columns, rows }) {
  return (
    <div className="mt-3 overflow-auto rounded-lg border border-gray-200">
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
  componentDidCatch(err) {
    // eslint-disable-next-line no-console
    console.warn('[AiAssistant] Chart render failed, falling back to table:', err);
  }
  render() {
    if (this.state.hasError) return this.props.fallback || null;
    return this.props.children;
  }
}

function estimateYAxisWidth(labels) {
  const maxLen = Math.max(0, ...(labels || []).map((s) => String(s || '').length));
  // aprox. 7px por caractere, com limites para não quebrar mobile
  return Math.max(90, Math.min(220, Math.round(maxLen * 7)));
}

function BreakdownChart({ rows, metricLabel }) {
  const chartRows = rows.map((r) => ({
    label: r.label,
    value: Number(r.value_raw ?? r.value ?? 0),
  }));

  const yWidth = estimateYAxisWidth(chartRows.map((r) => r.label));
  const height = Math.min(320, Math.max(220, chartRows.length * 28 + 60));

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-2">
      <div className="mb-2 text-xs text-gray-600 flex items-center justify-between">
        <span>{metricLabel || 'Detalhamento'}</span>
        <span className="text-[11px] text-gray-400">Arraste para ver mais</span>
      </div>
      <div className="w-full overflow-x-auto">
        <div style={{ minWidth: Math.max(520, yWidth + 280) }}>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={chartRows} layout="vertical" margin={{ top: 6, right: 16, bottom: 6, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="label"
                width={yWidth}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(v) => [formatPtBRNumber(v), metricLabel || 'Valor']}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="value" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function AiAssistant({ filters, totals, filtersCatalog }) {
  const [messages, setMessages] = useState(() => ([
    {
      role: 'assistant',
      kind: 'intro',
      content:
        'Oi! Eu sou sua IA do Dashboard. Me pergunte coisas como:\n' +
        '• "Qual escola tem mais alunos ativos?"\n' +
        '• "Top 10 escolas com mais matrículas"\n' +
        '• "Quantas turmas do 1º ano?"\n' +
        '• "Matrículas por turno"\n' +
        '• "Comparar matrículas 2026 e 2025 por escola"\n\n' +
        'Eu respondo só com números agregados (sem dados pessoais).',
      suggestions: [
        'Qual escola tem mais alunos ativos?',
        'Top 10 escolas com mais matrículas',
        'Quantas turmas do 1º ano?',
        'Matrículas por turno',
        'Comparar matrículas 2026 e 2025 por escola',
      ],
    },
  ]));
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const canSend = useMemo(() => !!question.trim() && !loading, [question, loading]);

  function buildHistoryString(existingMessages, pendingUserText) {
    const tail = [...(existingMessages || [])];
    if (pendingUserText) tail.push({ role: 'user', content: pendingUserText });
    // últimas 8 mensagens (aprox 4 interações). depois formata User/Assistant.
    const last = tail.slice(-8);
    return last
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').replace(/\s+/g, ' ').trim()}`)
      .join('\n');
  }

  async function send(q) {
    const trimmed = String(q || '').trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setQuestion('');
    setLoading(true);

    try {
      // IMPORTANT:
      // - usa baseURL via REACT_APP_API_URL
      // - envia token automaticamente (interceptor)
      // - evita erro "Unexpected end of JSON" quando o frontend não está no mesmo domínio do backend
      // Envia um "snapshot" do dashboard (agregados + catálogo de filtros) para a IA responder
      // com base no que o usuário está vendo agora (mesmos filtros e mesmos totais).
      const history = buildHistoryString(messages, trimmed);

      const { data: json } = await api.post('/ai/query', {
        question: trimmed,
        filters: filters || {},
        history,
        dashboardContext: {
          // catálogo (valores possíveis) — ensina o backend quais valores existem no banco
          availableFilters: filtersCatalog || null,
          // totais/agrupamentos já carregados pelo dashboard — sem PII
          totals: totals || null,
          // filtros ativos no momento
          activeFilters: filters || {},
        },
      });

      // evita loop de mensagem igual
      setMessages((prev) => {
        const last = [...prev].reverse().find((m) => m.role === 'assistant');
        const next = {
          role: 'assistant',
          content: json?.answer || json?.error || 'Não consegui processar agora.',
          kind: json?.kind || (json?.ok ? 'ok' : 'error'),
          data: json?.data,
          spec: json?.spec,
          suggestions: json?.suggestions || [],
        };

        if (last && last.content === next.content && next.kind === 'clarify') {
          // se repetiu, só atualiza sugestões
          const merged = Array.from(new Set([...(last.suggestions || []), ...(next.suggestions || [])])).slice(0, 8);
          const updatedLast = { ...last, suggestions: merged };
          const out = prev.slice();
          const idx = out.lastIndexOf(last);
          if (idx >= 0) out[idx] = updatedLast;
          return out;
        }

        return [...prev, next];
      });
    } catch (e) {
      // Axios padroniza erro em e.response
      const backendMsg = e?.response?.data?.error || e?.response?.data?.message || e?.response?.data?.details;
      const msg = backendMsg || e?.message || 'erro desconhecido';
      setMessages((prev) => [...prev, { role: 'assistant', kind: 'error', content: `Erro ao consultar IA: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  function renderAssistantExtras(m) {
    const data = m?.data;
    const spec = m?.spec;

    // chips
    const suggestions = (m?.suggestions || []).filter(Boolean);

    // breakdown
    if (data?.rows && Array.isArray(data.rows) && data.rows.length) {
      if (m.kind === 'compare') {
        // compare table
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
            <Table columns={cols} rows={rows} />
            {suggestions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
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

      // breakdown default
      const metric = data.metric || spec?.metric;
      const groupBy = data.groupBy || spec?.groupBy;

      // se o backend não marcou kind, inferimos breakdown quando vier rows
      const isBreakdown = m.kind === 'breakdown' || m.kind === 'ok' || m.kind === undefined;

      const cols = [
        { key: 'label', label: groupBy ? `Grupo (${groupBy})` : 'Grupo' },
        { key: 'value', label: 'Valor' },
      ];
      const rows = data.rows.map((r) => ({
        label: r.label,
        value: formatPercentMaybe(metric, r.value),
        value_raw: r.value,
      }));

      const metricLabel = metric ? (metric === 'taxa_evasao' ? 'Taxa de evasão (%)' : (spec?.metricLabel || metric)) : 'Valor';

      return (
        <>
          {isBreakdown ? (
            <ChartErrorBoundary fallback={<Table columns={cols} rows={rows} />}>
              <BreakdownChart rows={rows} metricLabel={metricLabel} />
            </ChartErrorBoundary>
          ) : (
            <Table columns={cols} rows={rows} />
          )}
          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
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

    // clarify chips even sem data
    if (m.kind === 'clarify' && suggestions.length > 0) {
      return (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => send(s)}
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
            <div className="text-xs text-gray-500">Pergunte, compare e descubra — sem dados pessoais</div>
          </div>
        </div>
        <Badge>Beta</Badge>
      </div>

      <div className="px-4 py-3 h-[360px] overflow-auto">
        <div className="space-y-3">
          {messages.map((m, idx) => (
            <div key={idx} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  m.role === 'user'
                    ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-violet-600 text-white px-3 py-2 text-sm'
                    : (m?.data?.rows && Array.isArray(m.data.rows) && m.data.rows.length > 0)
                      ? 'w-[min(960px,95%)] max-w-none rounded-2xl rounded-bl-sm bg-gray-50 text-gray-900 px-3 py-2 text-sm border border-gray-100'
                      : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-50 text-gray-900 px-3 py-2 text-sm border border-gray-100'
                }
              >
                <div className="whitespace-pre-line leading-relaxed">{m.content}</div>
                {m.role === 'assistant' && renderAssistantExtras(m)}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-50 text-gray-900 px-3 py-2 text-sm border border-gray-100">
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
            placeholder='Ex.: "Qual escola tem mais alunos ativos?"'
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
          Dica: você pode usar os filtros do dashboard (ano, etapa, turno, etc.) e depois perguntar aqui.
        </div>
      </div>
    </div>
  );
}
