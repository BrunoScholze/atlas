const MAP = {
  done:        { label: 'Concluída',     bg: '#f0fdf4', color: '#16a34a' },
  no_subject:  { label: 'Sem assunto',   bg: '#fef9c3', color: '#a16207' },
  error:       { label: 'Erro',          bg: '#fef2f2', color: '#dc2626' },
  cancelled:   { label: 'Cancelada',     bg: '#f3f4f6', color: '#6b7280' },
  resolved:    { label: 'Resolvido',     bg: '#f0fdf4', color: '#16a34a' },
  unresolved:  { label: 'Não resolvido', bg: '#fef2f2', color: '#dc2626' },
};

export default function StatusBadge({ status }) {
  const s = MAP[status] || { label: status || '—', bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}
