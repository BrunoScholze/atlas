import { useEffect, useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import { fetchExecucoes } from '../api';

const STATUS_OPTS  = ['done', 'no_subject', 'error', 'cancelled'];
const PERIODO_OPTS = [
  { label: 'Tudo',    value: 'tudo' },
  { label: 'Hoje',    value: 'hoje' },
  { label: '7 dias',  value: '7d'   },
  { label: '30 dias', value: '30d'  },
];

function fmtTempo(s) { return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; }
function fmtData(ts) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const filterStyle = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
  fontSize: 12, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)'
};

export default function Execucoes() {
  const [data, setData]       = useState({ total: 0, execucoes: [] });
  const [projetos, setProjetos] = useState([]);
  const [filters, setFilters] = useState({ page: 1, limit: 50, projeto: '', status: '', busca: '', periodo: 'tudo' });

  useEffect(() => {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([k, v]) => v !== '' && v !== 'tudo' && k !== 'page' || k === 'page' || k === 'limit')
    );
    fetchExecucoes(params)
      .then(d => {
        setData(d);
        const ps = [...new Set(d.execucoes.map(e => e.projeto).filter(Boolean))];
        setProjetos(prev => [...new Set([...prev, ...ps])]);
      })
      .catch(console.error);
  }, [filters]);

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v, page: 1 }));
  const totalPages = Math.ceil(data.total / filters.limit);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Execuções</h1>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={filters.busca} onChange={e => set('busca', e.target.value)}
          placeholder="Buscar por ticket ou título..."
          style={{ ...filterStyle, width: 220 }} />

        <select value={filters.projeto} onChange={e => set('projeto', e.target.value)} style={filterStyle}>
          <option value="">Todos os projetos</option>
          {projetos.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={filters.status} onChange={e => set('status', e.target.value)} style={filterStyle}>
          <option value="">Todos os status</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {PERIODO_OPTS.map(p => (
          <button key={p.value} onClick={() => set('periodo', p.value)} style={{
            ...filterStyle,
            background: filters.periodo === p.value ? 'var(--text)' : 'var(--surface)',
            color:      filters.periodo === p.value ? '#fff' : 'var(--muted2)',
          }}>
            {p.label}
          </button>
        ))}

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted2)' }}>
          {data.total} execuções
        </span>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              {['Ticket', 'Título', 'Projeto', 'Tempo', 'Tokens', 'Funcionalidades', 'Ref.', 'Status', 'Data'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted2)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.execucoes.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--muted2)' }}>Nenhuma execução encontrada</td></tr>
            )}
            {data.execucoes.map((e, i) => (
              <tr key={e.requestId || i}
                style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={ev => ev.currentTarget.style.background = ''}>
                <td style={{ padding: '10px 14px', fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>{e.ticketId || '—'}</td>
                <td style={{ padding: '10px 14px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.titulo}>{e.titulo || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--muted2)' }}>{e.projeto || '—'}</td>
                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{e.tempoAnalise ? fmtTempo(e.tempoAnalise) : '—'}</td>
                <td style={{ padding: '10px 14px' }}>{e.tokensTotal ? e.tokensTotal.toLocaleString('pt-BR') : '—'}</td>
                <td style={{ padding: '10px 14px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={(e.funcionalidades || []).join(', ')}>
                  {(e.funcionalidades || []).slice(0, 2).join(', ') || '—'}
                  {(e.funcionalidades || []).length > 2 ? ` +${e.funcionalidades.length - 2}` : ''}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {e.isRefinamento
                    ? <span title={e.textoRefinamento || ''} style={{ cursor: 'help', color: '#d97706', fontWeight: 600 }}>Sim</span>
                    : <span style={{ color: 'var(--muted)' }}>—</span>}
                </td>
                <td style={{ padding: '10px 14px' }}><StatusBadge status={e.statusFinal} /></td>
                <td style={{ padding: '10px 14px', color: 'var(--muted2)', whiteSpace: 'nowrap' }}>{fmtData(e.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          <button onClick={() => setFilters(f => ({ ...f, page: Math.max(1, f.page - 1) }))}
            disabled={filters.page === 1} style={filterStyle}>←</button>
          <span style={{ fontSize: 12, color: 'var(--muted2)' }}>{filters.page} / {totalPages}</span>
          <button onClick={() => setFilters(f => ({ ...f, page: Math.min(totalPages, f.page + 1) }))}
            disabled={filters.page === totalPages} style={filterStyle}>→</button>
        </div>
      )}
    </div>
  );
}
