import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import KPICard from '../components/KPICard';
import { fetchOverview } from '../api';

const STATUS_COLORS = { done: '#22c55e', no_subject: '#f59e0b', error: '#ef4444', cancelled: '#9ca3af' };

function fmtTempo(s) {
  if (!s) return '—';
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}
function fmtTokens(n) {
  if (!n) return '0';
  return n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

export default function Overview() {
  const [data, setData] = useState(null);

  useEffect(() => { fetchOverview().then(setData).catch(console.error); }, []);

  if (!data) return <div style={{ color: 'var(--muted2)', padding: 40 }}>Carregando...</div>;

  const { kpis, porDia, porStatus, porProjeto } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Overview</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KPICard label="Total de análises" value={kpis.totalAnalises} />
        <KPICard label="Taxa de resolução" value={`${kpis.taxaResolucao}%`} color="#16a34a" sub="do total com feedback" />
        <KPICard label="Tempo médio" value={fmtTempo(kpis.tempoMedio)} sub="por análise" />
        <KPICard label="Tokens usados" value={fmtTokens(kpis.tokensTotal)} sub="estimativa total" />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 16 }}>Análises por dia — últimas 4 semanas</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={porDia}>
            <XAxis dataKey="data" tick={{ fontSize: 11 }} interval={6} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="total"     name="Total"     stroke="#111" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="resolvidos" name="Resolvidos" stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Status das análises</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={porStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                {porStatus.map(e => <Cell key={e.name} fill={STATUS_COLORS[e.name] || '#9ca3af'} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Análises por projeto</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={porProjeto} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="projeto" tick={{ fontSize: 11 }} width={140} />
              <Tooltip />
              <Bar dataKey="total" fill="#111" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
