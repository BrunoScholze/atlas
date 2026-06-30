import { NavLink } from 'react-router-dom';

const links = [
  { to: '/overview',     label: 'Overview' },
  { to: '/execucoes',    label: 'Execuções' },
  { to: '/efetividade',  label: 'Efetividade' },
];

export default function Sidebar() {
  return (
    <nav style={{
      width: 'var(--sidebar-w)', background: 'var(--surface)',
      borderRight: '1px solid var(--border)', padding: '24px 0',
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, height: '100vh', flexShrink: 0
    }}>
      <div style={{ padding: '0 20px 28px' }}>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px' }}>Atlas Code</div>
        <div style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 2 }}>Mesa de Controle</div>
      </div>
      {links.map(l => (
        <NavLink key={l.to} to={l.to} style={({ isActive }) => ({
          padding: '9px 20px', fontSize: 13,
          color: isActive ? 'var(--text)' : 'var(--muted2)',
          fontWeight: isActive ? 600 : 400,
          background: isActive ? 'var(--bg)' : 'transparent',
          borderLeft: isActive ? '3px solid var(--text)' : '3px solid transparent',
        })}>
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
