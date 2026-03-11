// src/App.jsx

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuthStore from './store/authStore';
import useAppStore from './store/appStore';
import { initSync } from './services/sync';
import Login from './pages/Login/Login';

// ─── Lazy imports das páginas ────────────────────────────────
// Use React.lazy para code-splitting à medida que as páginas forem criadas.
// Descomente conforme cada módulo for implementado.

// import Dashboard       from './pages/Dashboard/Dashboard';
import Listagem from './pages/Equipamentos/Listagem';
import Cadastro from './pages/Equipamentos/Cadastro';
import Detalhe   from './pages/Equipamentos/Detalhes';
// import Equipamentos    from './pages/Equipamentos/Equipamentos';
// import EquipamentoDetalhe from './pages/Equipamentos/EquipamentoDetalhe';
// import Preventivas     from './pages/Preventivas/Preventivas';
// import ChecklistExec   from './pages/Preventivas/ChecklistExec';
// import Corretivas      from './pages/Corretivas/Corretivas';
// import NovaOS          from './pages/Corretivas/NovaOS';
// import OSDetalhe       from './pages/Corretivas/OSDetalhe';
// import GerenciarUsuarios from './pages/Dashboard/GerenciarUsuarios';
// import GerenciarPecas  from './pages/Dashboard/GerenciarPecas';

// ─── Placeholder para páginas não implementadas ──────────────
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

// ─── Tela de carregamento inicial ────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// GUARDAS DE ROTA
// ─────────────────────────────────────────────────────────────

/**
 * PrivateRoute — Garante que apenas usuários autenticados acessem.
 * Redireciona para /login se não autenticado.
 */
function PrivateRoute() {
  const { isAuthenticated, isReady } = useAuthStore();
  const location = useLocation();

  if (!isReady) return <SplashScreen />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

/**
 * SuperAdminRoute — Restringe acesso a usuários com role 'superadmin'.
 * Redireciona mecânicos para /preventivas se tentarem acessar área admin.
 */
function SuperAdminRoute() {
  const { isSuperAdmin, isReady } = useAuthStore();

  if (!isReady) return <SplashScreen />;

  if (!isSuperAdmin) {
    return <Navigate to="/preventivas" replace />;
  }

  return <Outlet />;
}

/**
 * PublicOnlyRoute — Redireciona usuários já logados para fora do Login.
 * Evita que um usuário autenticado volte para a tela de login.
 */
function PublicOnlyRoute() {
  const { isAuthenticated, isReady, profile } = useAuthStore();

  if (!isReady) return <SplashScreen />;

  if (isAuthenticated && profile?.senha_alterada) {
    const dest = profile.role === 'superadmin' ? '/dashboard' : '/preventivas';
    return <Navigate to={dest} replace />;
  }

  return <Outlet />;
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE RAIZ COM INICIALIZAÇÃO
// ─────────────────────────────────────────────────────────────

/**
 * AppInitializer — Inicializa Auth, Sync e filas.
 * Separado em componente próprio para ter acesso ao contexto do Router.
 */
function AppInitializer() {
  const initAuth = useAuthStore((s) => s.initAuth);
  const loadLastSyncAt = useAppStore((s) => s.loadLastSyncAt);
  const loadQueues = useAppStore((s) => s.loadQueuesFromStorage);

  useEffect(() => {
    // 1. Inicia listener de autenticação Supabase
    const unsubAuth = initAuth();

    // 2. Carrega estado persistido das filas offline
    loadQueues();
    loadLastSyncAt();

    // 3. Inicia motor de sincronização (listener de rede)
    initSync();

    // 4. Injeta keyframes de animação globais
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
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

// ─────────────────────────────────────────────────────────────
// MAPA DE ROTAS
// ─────────────────────────────────────────────────────────────
//
//  / (raiz)                   → Redireciona para /login
//  /login                     → Login (pública, redireciona se autenticado)
//
//  [PRIVADAS - todos os autenticados]
//  /equipamentos              → Lista de equipamentos
//  /equipamentos/:id          → Detalhe do equipamento (PDF + galeria)
//  /preventivas               → Lista de agendamentos do mecânico logado
//  /preventivas/:id/checklist → Execução do checklist
//  /corretivas                → Lista de OS do mecânico logado
//  /corretivas/nova           → Abrir nova OS
//  /corretivas/:id            → Detalhe/finalização de OS
//
//  [PRIVADAS - apenas SuperAdmin]
//  /dashboard                 → Painel geral (horas, relatórios)
//  /dashboard/usuarios        → CRUD de usuários
//  /dashboard/pecas           → Gestão de estoque
//  /dashboard/equipamentos/novo → Cadastro de equipamento
// ─────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AppInitializer />
      <Routes>

        {/* ── Raiz: redireciona para login ── */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* ── Rotas Públicas (só para não-autenticados) ── */}
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<Login />} />
        </Route>

        {/* ── Rotas Privadas (qualquer usuário autenticado) ── */}
        <Route element={<PrivateRoute />}>

          {/* Módulo 1 — Equipamentos (leitura para todos) */}
          <Route path="/equipamentos" element={<Placeholder title="Equipamentos" />} />
          <Route path="/equipamentos/:id" element={<Placeholder title="Detalhe do Equipamento" />} />

          {/* Módulo 2 — Preventivas */}
          <Route path="/preventivas" element={<Placeholder title="Preventivas" />} />
          <Route path="/preventivas/:agendamentoId/checklist" element={<Placeholder title="Checklist" />} />

          {/* Módulo 3 — Corretivas / Ordens de Serviço */}
          <Route path="/corretivas" element={<Placeholder title="Ordens de Serviço" />} />
          <Route path="/corretivas/nova" element={<Placeholder title="Nova OS" />} />
          <Route path="/corretivas/:id" element={<Placeholder title="Detalhe da OS" />} />

          {/* ── Rotas exclusivas do SuperAdmin ── */}
          <Route element={<SuperAdminRoute />}>
            <Route path="/dashboard" element={<Placeholder title="Dashboard" />} />
            <Route path="/dashboard/usuarios" element={<Placeholder title="Gerenciar Usuários" />} />
            <Route path="/dashboard/pecas" element={<Placeholder title="Gerenciar Peças" />} />
            <Route path="/equipamentos/novo" element={<Placeholder title="Cadastrar Equipamento" />} />
          </Route>

        </Route>

        {/* ── 404 ── */}
        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>
    </BrowserRouter>
  );
}