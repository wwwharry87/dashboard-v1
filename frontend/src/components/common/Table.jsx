import React, { useMemo } from 'react';

/**
 * Table reutilizavel.
 * - Recebe colunas configuraveis
 * - Memoiza colunas e linhas renderizadas
 * - Responsiva: tabela no md+ e cards no mobile
 *
 * @template T
 * @param {{
 *  columns: Array<{ key: string, header: React.ReactNode, accessor?: (row: T) => React.ReactNode, className?: string, cellClassName?: string }>,
 *  data: T[],
 *  keyField?: string | ((row: T, index: number) => string),
 *  emptyState?: React.ReactNode,
 *  onRowClick?: (row: T) => void,
 *  className?: string,
 * }} props
 */
export default function Table({
  columns,
  data,
  keyField = 'id',
  emptyState = <div className="p-4 text-sm text-gray-500 dark:text-slate-400">Sem dados</div>,
  onRowClick,
  className = '',
}) {
  const cols = useMemo(() => columns, [columns]);

  const getKey = (row, index) => {
    if (typeof keyField === 'function') return keyField(row, index);
    return String(row?.[keyField] ?? index);
  };

  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  if (!rows.length) return <div className={className}>{emptyState}</div>;

  return (
    <div className={className}>
      {/* Desktop table */}
      <div className="hidden md:block overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs font-bold text-gray-700 dark:bg-slate-900 dark:text-slate-200">
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={`px-3 py-2 text-left ${c.className || ''}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {rows.map((row, idx) => (
              <tr
                key={getKey(row, idx)}
                className={onRowClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/60' : ''}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {cols.map((c) => (
                  <td key={c.key} className={`px-3 py-2 text-gray-800 dark:text-slate-100 ${c.cellClassName || ''}`}>
                    {c.accessor ? c.accessor(row) : String(row?.[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {rows.map((row, idx) => (
          <button
            key={getKey(row, idx)}
            type="button"
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`w-full rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900 ${onRowClick ? 'active:scale-[0.99]' : ''}`}
          >
            <div className="grid gap-2">
              {cols.map((c) => (
                <div key={c.key} className="grid grid-cols-2 gap-2">
                  <div className="text-[11px] font-bold text-gray-500 dark:text-slate-400">{c.header}</div>
                  <div className="text-sm text-gray-900 dark:text-slate-100">
                    {c.accessor ? c.accessor(row) : String(row?.[c.key] ?? '')}
                  </div>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
