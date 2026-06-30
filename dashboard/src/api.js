export const fetchOverview        = () => fetch('/dashboard/overview').then(r => r.json());
export const fetchExecucoes       = (p) => fetch('/dashboard/execucoes?' + new URLSearchParams(p)).then(r => r.json());
export const fetchExecucaoDetalhe = (id) => fetch(`/dashboard/execucoes/${id}`).then(r => r.json());
export const fetchEfetividade     = () => fetch('/dashboard/efetividade').then(r => r.json());
