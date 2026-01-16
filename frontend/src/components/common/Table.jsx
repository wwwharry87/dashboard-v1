import React from 'react';

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Tabela genérica, responsiva e otimizada.
 *
 * @typedef {Object} Column
 * @property {string} key - chave do campo (usa item[key] se render não for definido)
 * @property {React.ReactNode} header - título do cabeçalho
 * @property {(item:any, index:number)=>React.ReactNode} [render] - render customizado
 * @property {string} [className] - classes na célula
 *
 * @param {{
 *  columns: Column[],
 *  data: any[],
 *  rowKey?: (item:any, index:number)=>string|number,
 *  onRowClick?: (item:any)=>void,
 *  loading?: boolean,
 *  emptyText?: string,
 *  className?: string,
 * }} props
 */
export default function Table({
  columns,
  data,
  rowKey,
  onRowClick,
  loading = false,
  emptyText = 'Nenhum registro encontrado.',
  className,
}) {
  const safeColumns = React.useMemo(() => columns || [], [columns]);
  const safeData = React.useMemo(() => data || [], [data]);

  return (
    <div className={cn('w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800', className)}>
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          <tr>
            {safeColumns.map((col) => (
              <th key={col.key} className="px-4 py-3 font-semibold">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950">
          {loading ? (
            <tr>
              <td colSpan={Math.max(1, safeColumns.length)} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                Carregando...
              </td>
            </tr>
          ) : safeData.length === 0 ? (
            <tr>
              <td colSpan={Math.max(1, safeColumns.length)} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                {emptyText}
              </td>
            </tr>
          ) : (
            safeData.map((item, index) => {
              const key = rowKey ? rowKey(item, index) : String(item?.id ?? index);
              return (
                <tr
                  key={key}
                  className={cn(
                    'hover:bg-slate-50 dark:hover:bg-slate-900/60',
                    onRowClick ? 'cursor-pointer' : undefined
                  )}
                  onClick={onRowClick ? () => onRowClick(item) : undefined}
                >
                  {safeColumns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-3 text-slate-700 dark:text-slate-200', col.className)}>
                      {col.render ? col.render(item, index) : String(item?.[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
