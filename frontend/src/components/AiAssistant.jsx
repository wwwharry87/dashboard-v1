import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from './api';

// Gráficos (instalar no frontend): npm i recharts
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
 * AiAssistant.jsx (Premium Agent UI)
 * - ConversationId (continuidade + histórico curto)
 * - Envia contexto rico: history + dashboardContext.availableFilters
 * - Renderiza breakdown com gráfico (recharts) com fallback para tabela
 * - Renderiza desambiguação com opções clicáveis
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

function safeLocalUserName() {
  // Não é usado para segurança; apenas UX (personalização). O backend ainda valida tudo via token.
  try {
    const raw =
      localStorage.getItem('user') ||
      localStorage.getItem('usuario') ||
      localStorage.getItem('currentUser') ||
      '';
    if (raw) {
      const obj = JSON.parse(raw);
      const nome = obj?.nome || obj?.name || obj?.usuario?.nome || obj?.user?.nome;
      if (nome && String(nome).trim()) return String(nome).trim();
    }
  } catch (_) {}

  const direct = localStorage.getItem('nome') || localStorage.getItem('userName');
  if (direct && String(direct).trim()) return String(direct).trim();
  return null;
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

function ChartBreakdown({ rows, metric }) {
  // Fallback rápido
  if (!rows || !Array.isArray(rows) || rows.length === 0) return null;

  // Evita labels gigantes explodirem a UI
  const safeRows = rows
    .map((r) => ({
      label: String(r.label ?? '').slice(0, 48),
      value: Number(r.value) || 0,
    }))
    .slice(0, 20);

  // Layout "vertical" (barras horizontais) costuma ficar mais bonito no chat.
  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-xs text-gray-500 mb-2">Visualização (Top {safeRows.length})</div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={safeRows} layout="vertical" margin={{ left: 24, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(v) => formatPercentMaybe(metric, v)}
              labelStyle={{ fontSize: 12 }}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="value" />
          </BarChart>
        </ResponsiveContainer>
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

  // mantém conversa viva (UX premium)
  const [conversationId, setConversationId] = useState(() => {
    try {
      return localStorage.getItem('aiConversationId') || '';
    } catch (_) {
      return '';
    }
  });

  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    try {
      if (conversationId) localStorage.setItem('aiConversationId', conversationId);
    } catch (_) {}
  }, [conversationId]);

  const canSend = useMemo(() => !!question.trim() && !loading, [question, loading]);

  function buildHistoryString(prevMessages) {
    // últimas 4 (user/assistant), ignora intro
    const last = (prevMessages || [])
      .filter((m) => m?.role === 'user' || m?.role === 'assistant')
      .filter((m) => m?.kind !== 'intro')
      .slice(-4);

    return last
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').slice(0, 400)}`)
      .join('\n');
  }

  async function send(q, extra = {}) {
    const trimmed = String(q || '').trim();
    if (!trimmed || loading) return;

    // adiciona mensagem do usuário
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setQuestion('');
    setLoading(true);

    try {
      // monta history com o estado ANTES da resposta do backend
      const history = buildHistoryString([
        ...messages,
        { role: 'user', content: trimmed },
      ]);

      const clientUserName = safeLocalUserName();

      const { data: json } = await api.post('/ai/query', {
        question: trimmed,
        filters: filters || {},
        conversationId: conversationId || undefined,
        history,
        clientUserName: clientUserName || undefined,
        ...extra,
        dashboardContext: {
          // valores possíveis (domínio) — sem PII
          availableFilters: filtersCatalog || null,
          // totais/agrupamentos já carregados pelo dashboard — sem PII
          totals: totals || null,
          // filtros ativos no momento
          activeFilters: filters || {},
        },
      });

      if (json?.conversationId) {
        setConversationId(String(json.conversationId));
      }

      setMessages((prev) => {
        const lastAssistant = [...prev].reverse().find((m) => m.role === 'assistant');
        const next = {
          role: 'assistant',
          content: json?.answer || json?.error || 'Não consegui processar agora.',
          kind: json?.kind || (json?.ok ? 'ok' : 'error'),
          data: json?.data,
          spec: json?.spec,
          suggestions: json?.suggestions || [],
          options: json?.options || null,
          clarify: json?.clarify || null,
        };

        // evita loop de clarificação repetida
        if (lastAssistant && lastAssistant.content === next.content && next.kind === 'clarify') {
          const merged = Array.from(new Set([...(lastAssistant.suggestions || []), ...(next.suggestions || [])])).slice(0, 10);
          const updatedLast = { ...lastAssistant, suggestions: merged, options: next.options || lastAssistant.options };
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

  function renderSuggestionChips(suggestions) {
    if (!suggestions || suggestions.length === 0) return null;
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

  function renderDisambiguation(m) {
    const options = m?.options;
    if (!options || !Array.isArray(options) || options.length === 0) return null;

    // backend pode mandar metadata em m.clarify
    const clarify = m?.clarify;

    return (
      <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
        <div className="text-xs text-gray-500 mb-2">Escolha uma opção</div>
        <div className="flex flex-wrap gap-2">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => {
                // Envia seleção estruturada (mais robusto que texto)
                send(opt, {
                  selection: {
                    dimension: clarify?.dimension,
                    value: opt,
                    mode: 'exact',
                  },
                });
              }}
              className="px-3 py-1.5 rounded-full text-xs border border-gray-200 bg-gray-50 hover:bg-gray-100"
              title={opt}
            >
              {opt}
            </button>
          ))}
        </div>

        {clarify?.actions?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {clarify.actions.map((a, i) => (
              <button
                key={i}
                onClick={() => {
                  // "sum" ou "separate" com baseToken (ex.: 1º ANO)
                  send(a.label, {
                    selection: {
                      dimension: clarify?.dimension,
                      baseToken: clarify?.baseToken,
                      mode: a.mode,
                    },
                  });
                }}
                className="px-3 py-1.5 rounded-full text-xs border border-gray-200 bg-white hover:bg-gray-50"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderAssistantExtras(m) {
    const data = m?.data;
    const spec = m?.spec;
    const suggestions = (m?.suggestions || []).filter(Boolean);

    // desambiguação primeiro
    if (m.kind === 'disambiguation') {
      return (
        <>
          {renderDisambiguation(m)}
          {renderSuggestionChips(suggestions)}
        </>
      );
    }

    // compare
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
          <Table columns={cols} rows={rows} />
          {renderSuggestionChips(suggestions)}
        </>
      );
    }

    // breakdown
    if (data?.rows && Array.isArray(data.rows) && data.rows.length) {
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

      // tenta gráfico quando kind === breakdown
      let chart = null;
      try {
        if (m.kind === 'breakdown') {
          chart = <ChartBreakdown rows={data.rows} metric={metric} />;
        }
      } catch (_) {
        chart = null;
      }

      return (
        <>
          {chart}
          {/* fallback/apoio em tabela */}
          <Table columns={cols} rows={rows} />
          {renderSuggestionChips(suggestions)}
        </>
      );
    }

    // clarify chips even sem data
    if ((m.kind === 'clarify' || m.kind === 'unsupported') && suggestions.length > 0) {
      return renderSuggestionChips(suggestions);
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
        <div className="flex items-center gap-2">
          {conversationId ? <Badge>Conectado</Badge> : <Badge>Beta</Badge>}
        </div>
      </div>

      <div className="px-4 py-3 h-[420px] overflow-auto">
        <div className="space-y-3">
          {messages.map((m, idx) => (
            <div key={idx} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  m.role === 'user'
                    ? 'max-w-[88%] rounded-2xl rounded-br-sm bg-violet-600 text-white px-3 py-2 text-sm'
                    : 'max-w-[88%] rounded-2xl rounded-bl-sm bg-gray-50 text-gray-900 px-3 py-2 text-sm border border-gray-100'
                }
              >
                <div className="whitespace-pre-line leading-relaxed">{m.content}</div>
                {m.role === 'assistant' && renderAssistantExtras(m)}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-gray-50 text-gray-900 px-3 py-2 text-sm border border-gray-100">
                <div className="text-gray-500">Processando…</div>
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
          className="flex gap-2"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Pergunte algo… (ex.: Quantas turmas do 1º ano?)"
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!canSend}
            className={
              canSend
                ? 'rounded-xl bg-violet-600 text-white px-4 py-2 text-sm font-semibold hover:bg-violet-700'
                : 'rounded-xl bg-gray-200 text-gray-500 px-4 py-2 text-sm font-semibold'
            }
          >
            Enviar
          </button>
        </form>
        <div className="mt-2 text-[11px] text-gray-500">
          Dica: se aparecer opções (ex.: 1º ANO URBANO/RURAL), clique para escolher ou peça “separar tudo”.
        </div>
      </div>
    </div>
  );
}
