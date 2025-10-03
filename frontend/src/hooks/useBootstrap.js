import { useQuery } from '@tanstack/react-query';
import api from '../components/api';

async function fetchAll(signal) {
  const [totais, filtros, client, usuario] = await Promise.all([
    api.post('/totais', {}, { signal }).then(r => r.data),
    api.options('/filtros', { signal }).then(r => r.data).catch(() => ({})), // se OPTIONS não retornar dados, ignore
    api.options('/client',  { signal }).then(r => r.data).catch(() => ({})),
    api.options('/usuario', { signal }).then(r => r.data).catch(() => ({})),
  ]);
  return { totais, filtros, client, usuario };
}

export default function useBootstrap() {
  return useQuery({
    queryKey: ['bootstrap'],
    queryFn: ({ signal }) => fetchAll(signal),
    staleTime: 1000 * 60 * 5, // 5 min
    gcTime: 1000 * 60 * 30,
    retry: 1,
  });
}
