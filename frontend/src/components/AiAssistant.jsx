import React, { useMemo, useState } from 'react';
import api from './api';
import { FaPaperPlane, FaRobot, FaTrash, FaLightbulb } from 'react-icons/fa';

const formatNumber = (num) => {
  const n = Number(num);
  if (!Number.isFinite(n)) return String(num ?? '0');
  return n.toLocaleString('pt-BR');
};

export default function AiAssistant({ filters }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Me pergunte algo sobre os dados (sem dados pessoais). Ex.: "Total de matrículas ativas" ou "Matrículas por turno".',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [shownUnsupportedHint, setShownUnsupportedHint] = useState(false);

  const examples = useMemo(
    () => [
      'Total de matrículas',
      'Total de matrículas ativas',
      'Matrículas por sexo',
      'Matrículas por turno',
      'Taxa de evasão',
      'Desistentes por zona_escola',
    ],
    []
  );

  const send = async (q) => {
    const question = String(q ?? input).trim();
    if (!question) return;

    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');
    setLoading(true);

    try {
      const resp = await api.post('/ai/query', {
        question,
        filters,
      });

      const payload = resp?.data;

      if (!payload?.ok) {
        const reason = payload?.spec?.reason;
        let msg = payload?.answer || 'Não consegui responder essa consulta.';

        // Evita repetir a mesma mensagem longa toda hora.
        if (typeof msg === 'string' && msg.includes('consultas agregadas')) {
          if (shownUnsupportedHint) {
            msg = 'Não entendi essa pergunta. Tente um dos exemplos na lista ao lado (ou digite: "Matrículas por sexo").';
          } else {
            setShownUnsupportedHint(true);
            msg = 'Ainda não entendi essa pergunta. Eu consigo responder consultas agregadas (totais e quebras por sexo/turno/zona/situação etc.). Exemplos: "Total de matrículas ativas", "Matrículas por sexo", "Desistentes por turno".';
          }
        }

        if (reason && typeof msg === 'string' && !msg.includes('Detalhe:')) {
          msg = `${msg}\n\nDetalhe: ${reason}`;
        }

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: msg,
          },
        ]);
        return;
      }

      const extra = payload?.data;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: payload.answer,
          data: extra || null,
        },
      ]);
    } catch (err) {
      console.error('Erro IA:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'Erro ao consultar a IA. Verifique se o backend está com DEEPSEEK_API_KEY configurada e se a rota /ai/query está acessível.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setMessages([
      {
        role: 'assistant',
        content:
          'Histórico limpo. Manda a próxima pergunta 🙂',
      },
    ]);
    setShownUnsupportedHint(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <div className="lg:col-span-2 bg-white rounded-2xl shadow p-3 sm:p-4 flex flex-col min-h-[420px]">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
              <FaRobot />
            </div>
            <div>
              <div className="font-bold text-gray-900">Assistente IA</div>
              <div className="text-xs text-gray-500">Perguntas agregadas (sem dados pessoais)</div>
            </div>
          </div>

          <button
            onClick={clear}
            className="text-sm px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center gap-2"
            title="Limpar chat"
          >
            <FaTrash />
            Limpar
          </button>
        </div>

        <div className="flex-1 overflow-auto space-y-2 pr-1">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={
                m.role === 'user'
                  ? 'flex justify-end'
                  : 'flex justify-start'
              }
            >
              <div
                className={
                  m.role === 'user'
                    ? 'max-w-[90%] rounded-2xl px-3 py-2 bg-violet-600 text-white shadow'
                    : 'max-w-[90%] rounded-2xl px-3 py-2 bg-gray-100 text-gray-900'
                }
              >
                <div className="text-sm leading-relaxed">{m.content}</div>

                {/* Resultado em tabela quando vier breakdown */}
                {m?.data?.rows?.length ? (
                  <div className="mt-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-3 py-2 text-xs font-bold text-gray-600 bg-gray-50">
                      Top resultados
                    </div>
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500">
                            <th className="px-3 py-2">Label</th>
                            <th className="px-3 py-2">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.data.rows.map((r, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-3 py-2">{r.label}</td>
                              <td className="px-3 py-2 font-semibold">
                                {formatNumber(r.value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-2xl px-3 py-2 bg-gray-100 text-gray-900">
                <div className="text-sm flex items-center gap-2">
                  <span className="animate-spin inline-block h-4 w-4 border-b-2 border-violet-600 rounded-full" />
                  Pensando...
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            placeholder='Ex.: "Matrículas por sexo"'
            className="flex-1 px-3 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          <button
            onClick={() => send()}
            disabled={loading}
            className="px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold flex items-center gap-2 disabled:opacity-60"
          >
            <FaPaperPlane />
            Enviar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-9 w-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <FaLightbulb />
          </div>
          <div>
            <div className="font-bold text-gray-900">Sugestões</div>
            <div className="text-xs text-gray-500">Clique para inserir</div>
          </div>
        </div>

        <div className="space-y-2">
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => send(ex)}
              className="w-full text-left px-3 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-sm"
            >
              {ex}
            </button>
          ))}
        </div>

        <div className="mt-4 text-xs text-gray-500">
          <div className="font-semibold mb-1">Dicas</div>
          <ul className="list-disc ml-4 space-y-1">
            <li>Use <b>por</b> para quebrar: "Matrículas por turno"</li>
            <li>Dimensões suportadas: sexo, turno, zona_escola, zona_aluno, situacao_matricula, etc.</li>
            <li>Respeita os filtros já aplicados no dashboard.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
