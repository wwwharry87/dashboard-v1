/**
 * Sistema de Versionamento do Dashboard
 * 
 * Formato: v{MAJOR}.{MINOR}.{PATCH}
 * 
 * MAJOR: Mudanças significativas na interface/funcionalidade
 * MINOR: Novas funcionalidades, melhorias
 * PATCH: Correções de bugs, ajustes pequenos
 * 
 * Exemplo: v0.1.17
 */

export const VERSION = {
  major: 0,
  minor: 2,
  patch: 26,
  
  // Retorna a versão formatada
  toString() {
    return `v${this.major}.${this.minor}.${this.patch}`;
  },
  
  // Retorna a versão com data
  toStringWithDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${this.toString()} (${day}/${month}/${year})`;
  },
  
  // Incrementa o patch (correções)
  incrementPatch() {
    this.patch += 1;
    return this.toString();
  },
  
  // Incrementa o minor (novas funcionalidades)
  incrementMinor() {
    this.minor += 1;
    this.patch = 0;
    return this.toString();
  },
  
  // Incrementa o major (mudanças significativas)
  incrementMajor() {
    this.major += 1;
    this.minor = 0;
    this.patch = 0;
    return this.toString();
  },
};

// Histórico de versões
export const VERSION_HISTORY = [
  {
    version: 'v0.1.17',
    date: '2026-01-28',
    changes: [
      'Sistema de cache inteligente com persistência',
      'Atualização automática programada às 08:10',
      'Cache mantido ao fechar app (PWA)',
      'Limpeza de cache apenas ao fazer logout',
      'Novos ícones do dashboard',
      'Atualização automática de ícones em PWAs instalados',
      'Melhoria no Service Worker',
    ],
  },
  {
    version: 'v0.1.16',
    date: '2026-01-28',
    changes: [
      'Adicionado sistema de versionamento automático',
      'Melhorado cálculo de vagas com excesso de capacidade',
      'Adicionado status "Lotada" para escolas acima da capacidade',
      'Melhorado display de vagas negativas (excesso)',
      'Integrado versionamento na interface',
    ],
  },
  {
    version: 'v0.1.15',
    date: '2026-01-28',
    changes: [
      'Implementado loader centralizado',
      'Adicionado cache inteligente para mobile',
      'Sistema de detecção de atualizações',
      'Notificações de atualização de dados',
    ],
  },
  {
    version: 'v0.1.14',
    date: '2026-01-27',
    changes: [
      'Melhorias de performance',
      'Otimização de renderização',
    ],
  },
];

export default VERSION;
