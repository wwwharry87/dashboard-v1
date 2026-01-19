import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from './api'; // Certifique-se que o caminho está correto para seu projeto

// Charts (recharts) - Certifique-se de ter rodado: npm install recharts
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';

/**
 * AiAssistant.jsx - VERSÃO FINAL TOP TIER
 *
 * - Gráficos visuais com números externos (legibilidade máxima)
 * - Cores consistentes (Violeta)
 * - Tratamento de erro em gráficos
 * - Envio de contexto rico (Histórico + Catálogo de Filtros)
 */

function formatPtBRNumber(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x ?? '0');
  return n.toLocaleString('pt-BR');
}

function formatPercentMaybe(metric, value) {
  if (metric === 'taxa_evasao' || metric === 'taxa_ocupacao') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0,00%';
    return `${n.toFixed(2).replace('.', ',')}%`;
  }
  return formatPtBRNumber(value);
}

function Badge({ children }) {
  return (
    <span className="inline-flex items-center rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-xs font-semibold border border-violet-200">
      {children}
    </span>
  );
}

function Table({ columns, rows }) {
  return (
    <div className="mt-3 overflow-auto rounded-lg border border-gray-200 shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="text-left font-semibold text-gray-700 px-3 py-2 whitespace-nowrap border-b border-gray-200">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className={`hover:bg-violet-50/50 transition-colors ${idx % 2 ? 'bg-white' : 'bg-gray-50/30'}`}>
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

// Resiliência: se o Recharts falhar, cai de volta para a tabela
class ChartErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err) {
    console.warn('[AiAssistant] Chart render failed:', err);
  }

  render() {
    if (this.state.hasError) return this.props.fallback || null;
    return this.props.children;
  }
}

function BreakdownBarChart({ rows, metric, groupBy }) {
  const chartData = Array.isArray(rows)
    ? rows
        .filter((r) => r && (r.label !== undefined) && (r.value !== undefined))
        .map((r) => ({ name: String(r.label), value: Number(r.value) || 0 }))
    : [];

  // Truncar labels muito longos no eixo Y para não quebrar o layout
  const shortLabel = (s) => {
    const str = String(s || '');
    return str.length > 20 ? `${str.slice(0, 18)}…` : str;
  };

  if (!chartData.length) return null;

  // Ajuste de altura dinâmico baseado na quantidade de barras
  const dynamicHeight = Math.min(400, Math.max(200, chartData.length * 35));

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {groupBy ? `Análise por ${groupBy.replace('_', ' ')}` : 'Análise'}
      </div>
      <div style={{ width: '100%', height: dynamicHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={chartData} 
            layout="vertical" 
            margin={{ top: 5, right: 45, left: 10, bottom: 5 }} // Right maior para o LabelList caber
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
            <XAxis
              type="number"
              hide // Esconde o eixo X numérico para limpar o visual
            />
            <YAxis 
              type="category" 
              dataKey="name" 
              width={110} 
              tickFormatter={shortLabel} 
              tick={{ fontSize: 11, fill: '#4b5563' }}
              interval={0}
            />
            <Tooltip
              cursor={{ fill: '#f3f4f6' }}
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              formatter={(value) => [formatPercentMaybe(metric, value), metric === 'taxa_evasao' ? 'Taxa' : 'Total']}
              labelFormatter={(label) => `${label}`}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20} fill="#7c3aed">
              <LabelList
                dataKey="value"
                position="right"
                formatter={(v) => formatPercentMaybe(metric, v)}
                style={{ fill: '#4b5563', fontSize: '11px', fontWeight: 'bold' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function buildHistoryString(messages, pendingUserText) {
  const base = Array.isArray(messages) ? messages : [];
  const withPending = pendingUserText
    ? [...base, { role: 'user', content: String(pendingUserText) }]
    : base;

  const last4 = withPending
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-4);

  return last4
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content).replace(/\s+$/g, '')}`)
    .join('\n');
}

export default function AiAssistant({ filters, totals, filtersCatalog }) {
  const [messages, setMessages] = useState(() => ([
    {
      role: 'assistant',
      kind: 'intro',
      content:
        'Olá! Sou sua Inteligência de Dados. 🧠\n' +
        'Analiso matrículas, turmas e escolas em tempo real.\n\n' +
        'Tente perguntar:\n' +
        '• "Qual escola tem mais alunos?"\n' +
        '• "Matrículas por turno"\n' +
        '• "Quantas turmas de 1º ano?"\n' +
        '• "Comparar 2026 e 2025"',
      suggestions: [
        'Qual escola tem mais alunos?',
        'Matrículas por turno',
        'Quantas turmas de 1º ano?',
        'Comparar matrículas 2026 e 2025',
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

  async function send(q) {
    const trimmed = String(q || '').trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setQuestion('');
    setLoading(true);

    try {
      const history = buildHistoryString(messages, trimmed);
      
      const { data: json } = await api.post('/ai/query', {
        question: trimmed,
        filters: filters || {},
        history,
        dashboardContext: {
          availableFilters: filtersCatalog || null,
          totals: totals || null,
          activeFilters: filters || {},
        },
      });

      setMessages((prev) => {
        // Lógica para evitar mensagens duplicadas se a IA repetir o clarify
        const last = [...prev].reverse().find((m) => m.role === 'assistant');
        const inferredKind =
          json?.kind ||
          (Array.isArray(json?.data?.rows) && json?.data?.rows?.length ? 'breakdown' : (json?.ok ? 'ok' : 'error'));

        const next = {
          role: 'assistant',
          content: json?.answer || json?.error || 'Não consegui processar agora.',
          kind: inferredKind,
          data: json?.data,
          spec: json?.spec,
          suggestions: json?.suggestions || [],
        };

        if (last && last.content === next.content && next.kind === 'clarify') {
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
    const suggestions = (m?.suggestions || []).filter(Boolean);

    // breakdown / compare
    if (data?.rows && Array.isArray(data.rows) && data.rows.length) {
      if (m.kind === 'compare') {
        const cols = [
          { key: 'label', label: spec?.groupBy ? `Grupo` : 'Métrica' },
          { key: 'base', label: `${data.compare?.baseYear ?? 'Base'}` },
          { key: 'comp', label: `${data.compare?.compareYear ?? 'Atual'}` },
          { key: 'delta', label: 'Diferença' },
          { key: 'pct', label: 'Variação' },
        ];
        const rows = data.rows.map((r) => ({
          label: r.label || 'Geral',
          base: formatPercentMaybe(data.metric, r.base_value),
          comp: formatPercentMaybe(data.metric, r.compare_value),
          delta: formatPercentMaybe(data.metric, r.delta),
          pct: r.pct_change === null || r.pct_change === undefined ? '—' : `${Number(r.pct_change).toFixed(2).replace('.', ',')}%`,
        }));

        return (
          <div className="w-full">
            <Table columns={cols} rows={rows} />
            {suggestions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => send(s)} className="px-3 py-1.5 rounded-full text-xs border border-violet-200 bg-white text-violet-700 hover:bg-violet-50 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      }

      // Breakdown -> Gráfico
      const metric = data.metric || spec?.metric;
      const groupBy = data.groupBy || spec?.groupBy;
      
      const cols = [
        { key: 'label', label: groupBy ? `Grupo (${groupBy})` : 'Grupo' },
        { key: 'value', label: 'Valor' },
      ];
      const rows = data.rows.map((r) => ({
        label: r.label,
        value: formatPercentMaybe(metric, r.value),
      }));

      const fallbackTable = <Table columns={cols} rows={rows} />;

      return (
        <div className="w-full">
          {m.kind === 'breakdown' ? (
            <ChartErrorBoundary fallback={fallbackTable}>
              <BreakdownBarChart rows={data.rows} metric={metric} groupBy={groupBy} />
            </ChartErrorBoundary>
          ) : (
            fallbackTable
          )}
          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => send(s)} className="px-3 py-1.5 rounded-full text-xs border border-violet-200 bg-white text-violet-700 hover:bg-violet-50 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Clarify chips
    if (m.kind === 'clarify' && suggestions.length > 0) {
      return (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => send(s)} className="px-3 py-1.5 rounded-full text-xs border border-violet-200 bg-white text-violet-700 hover:bg-violet-50 transition-colors">
              {s}
            </button>
          ))}
        </div>
      );
    }

    return null;
  }

  return (
    <div className="w-full rounded-2xl border border-gray-200 bg-white shadow-lg flex flex-col h-[600px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-violet-600 to-indigo-600">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-xl">
            🤖
          </div>
          <div>
            <div className="font-bold text-white">Assistente IA</div>
            <div className="text-xs text-violet-100 opacity-90">Powered by DeepSeek</div>
          </div>
        </div>
        <div className="bg-white/20 text-white text-[10px] font-bold px-2 py-1 rounded-lg backdrop-blur-sm">
          V2.0 PRO
        </div>
      </div>

      {/* Area do Chat */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50">
        {messages.map((m, idx) => (
          <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`
                max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm
                ${m.role === 'user' 
                  ? 'bg-violet-600 text-white rounded-br-none' 
                  : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'}
              `}
            >
              <div className="whitespace-pre-line leading-relaxed">{m.content}</div>
              {m.role === 'assistant' && renderAssistantExtras(m)}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-none border border-gray-200 shadow-sm flex items-center gap-2">
              <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce delay-100" />
              <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce delay-200" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-100">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(question);
          }}
          className="flex items-center gap-2 relative"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder='Ex.: "Qual escola tem mais alunos ativos?"'
            className="flex-1 h-12 pl-4 pr-12 rounded-xl bg-gray-50 border-0 ring-1 ring-gray-200 focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all text-gray-700 placeholder-gray-400"
          />
          <button
            type="submit"
            disabled={!canSend}
            className={`
              absolute right-2 h-9 px-4 rounded-lg font-medium transition-all text-sm
              ${canSend 
                ? 'bg-violet-600 text-white hover:bg-violet-700 shadow-md transform hover:scale-105' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
            `}
          >
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}