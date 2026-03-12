// src/App.jsx

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuthStore from './store/authStore';
import useAppStore from './store/appStore';
import { initSync } from './services/sync';

import Login                from './pages/Login/Login';
import Listagem             from './pages/Equipamentos/Listagem';
import Cadastro             from './pages/Equipamentos/Cadastro';
import Detalhe              from './pages/Equipamentos/Detalhes';
import ListagemPreventivas  from './pages/Preventivas/Listagem';
import Checklist            from './pages/Preventivas/Checklist';

function Placeholder({ title }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100dvh', gap: '12px',
      fontFamily: "'DM Sans', sans-serif", color: '#64748B'
    }}>
      <span style={{ fontSize: '40px' }}>🔧</span>
      <h2 style={{ margin: 0, color: '#0D1B2A' }}>{title}</h2>
      <p style={{ margin: 0, fontSize: '14px' }}>Módulo em desenvolvimento</p>
    </div>
  );
}

function SplashScreen() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100dvh', backgroundColor: '#0F4C81',
      flexDirection: 'column', gap: '16px',
    }}>
      <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="rgba(255,255,255,0.15)"/>
        <path d="M14 34V22l10-8 10 8v12H28v-8h-8v8H14z" fill="white"/>
        <circle cx="24" cy="18" r="3" fill="#F59E0B"/>
      </svg>
      <div style={{
        width: '32px', height: '32px',
        border: '3px solid rgba(255,255,255,0.3)',
        borderTopColor: '#FFFFFF',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function PrivateRoute() {
  const { isAuthenticated, isReady } = useAuthStore();
  const location = useLocation();
  if (!isReady) return <SplashScreen />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

function SuperAdminRoute() {
  const { isSuperAdmin, isReady } = useAuthStore();
  if (!isReady) return <SplashScreen />;
  if (!isSuperAdmin) return <Navigate to="/preventivas" replace />;
  return <Outlet />;
}

function PublicOnlyRoute() {
  const { isAuthenticated, isReady, profile } = useAuthStore();
  if (!isReady) return <SplashScreen />;
  if (isAuthenticated && profile?.senha_alterada) {
    const dest = profile.role === 'superadmin' ? '/dashboard' : '/preventivas';
    return <Navigate to={dest} replace />;
  }
  return <Outlet />;
}

function AppInitializer() {
  const initAuth    = useAuthStore((s) => s.initAuth);
  const loadLastSyncAt = useAppStore((s) => s.loadLastSyncAt);
  const loadQueues  = useAppStore((s) => s.loadQueuesFromStorage);

  useEffect(() => {
    const unsubAuth = initAuth();
    loadQueues();
    loadLastSyncAt();
    initSync();

    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin    { to { transform: rotate(360deg); } }
      @keyframes fadeIn  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 0; }
      input:focus { outline: none; border-color: #0F4C81 !important; box-shadow: 0 0 0 3px rgba(15,76,129,0.12) !important; }
      button:active { transform: scale(0.98); }
    `;
    document.head.appendChild(style);

    return () => {
      if (typeof unsubAuth === 'function') unsubAuth();
      document.head.removeChild(style);
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInitializer />
      <Routes>

        {/* Raiz → login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Rotas públicas */}
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<Login />} />
        </Route>

        {/* Rotas privadas — qualquer usuário autenticado */}
        <Route element={<PrivateRoute />}>

          {/* Módulo 1 — Equipamentos ✅ */}
          <Route path="/equipamentos"     element={<Listagem />} />
          <Route path="/equipamentos/:id" element={<Detalhe />} />

          {/* Módulo 2 — Preventivas ✅ */}
          <Route path="/preventivas"                          element={<ListagemPreventivas />} />
          <Route path="/preventivas/:agendamentoId/checklist" element={<Checklist />} />

          {/* Módulo 3 — Corretivas ⏳ */}
          <Route path="/corretivas"      element={<Placeholder title="Ordens de Serviço" />} />
          <Route path="/corretivas/nova" element={<Placeholder title="Nova OS" />} />
          <Route path="/corretivas/:id"  element={<Placeholder title="Detalhe da OS" />} />

          {/* Rotas exclusivas do SuperAdmin */}
          <Route element={<SuperAdminRoute />}>
            <Route path="/dashboard"           element={<Navigate to="/equipamentos" replace />} />
            <Route path="/dashboard/usuarios"  element={<Placeholder title="Gerenciar Usuários" />} />
            <Route path="/dashboard/pecas"     element={<Placeholder title="Gerenciar Peças" />} />
            <Route path="/equipamentos/novo"   element={<Cadastro />} />
          </Route>

        </Route>

        {/* 404 → login */}
        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>
    </BrowserRouter>
  );
}