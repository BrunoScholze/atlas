import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const FUNC_COLORS = ['#6366f1','#f59e0b','#14b8a6','#ec4899','#f97316','#8b5cf6','#06b6d4','#84cc16','#ef4444','#a3e635'];
import StatusBadge from '../components/StatusBadge';
import { fetchEfetividade } from '../api';

function fmtData(ts) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 };

export default function Efetividade() {
  const [data, setData] = useState(null);

  useEffect(() => { fetchEfetividade().then(setData).catch(console.error); }, []);

  if (!data) return <div style={{ color: 'var(--muted2)', padding: 40 }}>Carregando...</div>;

  const { taxaPorSemana, refinamentoStats, topFuncionalidades, refinamentos } = data;
  const totalRef = (refinamentoStats.comRefinamento || 0) + (refinamentoStats.semRefinamento || 0);
  const pieData  = [
    { name: 'Sem refinamento', value: refinamentoStats.semRefinamento || 0 },
    { name: 'Com refinamento', value: refinamentoStats.comRefinamento || 0 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Efetividade</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Taxa de resolução por semana</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={taxaPorSemana}>
              <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total"     name="Total"     stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="resolvidos" name="Resolvidos" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Uso de refinamento</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                <Cell fill="#6366f1" />
                <Cell fill="#f59e0b" />
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted2)', marginTop: 8 }}>
            {totalRef > 0
              ? `${Math.round((refinamentoStats.comRefinamento / totalRef) * 100)}% precisaram de refinamento`
              : 'Sem dados ainda'}
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 16 }}>Top funcionalidades analisadas</div>
        {topFuncionalidades.length === 0
          ? <div style={{ color: 'var(--muted2)', fontSize: 12 }}>Sem dados ainda</div>
          : <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topFuncionalidades} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={150} />
                <Tooltip />
                <Bar dataKey="total" name="Análises" radius={[0, 4, 4, 0]}>
                    {topFuncionalidades.map((_, i) => <Cell key={i} fill={FUNC_COLORS[i % FUNC_COLORS.length]} />)}
                  </Bar>
              </BarChart>
            </ResponsiveContainer>}
      </div>

      {refinamentos.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
            Tickets que usaram refinamento
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                {['Ticket', 'Título', 'Texto enviado', 'Status', 'Data'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted2)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {refinamentos.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>{r.ticketId || '—'}</td>
                  <td style={{ padding: '10px 14px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo || '—'}</td>
                  <td style={{ padding: '10px 14px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted2)' }} title={r.textoRefinamento}>{r.textoRefinamento}</td>
                  <td style={{ padding: '10px 14px' }}><StatusBadge status={r.statusFinal} /></td>
                  <td style={{ padding: '10px 14px', color: 'var(--muted2)', whiteSpace: 'nowrap' }}>{fmtData(r.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
