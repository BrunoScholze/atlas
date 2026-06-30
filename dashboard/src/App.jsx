import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Overview from './pages/Overview';
import Execucoes from './pages/Execucoes';
import Efetividade from './pages/Efetividade';
import './index.css';

export default function App() {
  return (
    <BrowserRouter basename="/dashboard">
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '32px', overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview"    element={<Overview />} />
            <Route path="/execucoes"   element={<Execucoes />} />
            <Route path="/efetividade" element={<Efetividade />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
