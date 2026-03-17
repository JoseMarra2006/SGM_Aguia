// src/App.jsx

import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Dialog } from '@capacitor/dialog';
import useAuthStore from './store/authStore.js';
import useAppStore from './store/appStore.js';
import { initSync } from './services/sync.js';

// ─── Importação das Telas ───
import Login                from './pages/Login/Login.jsx';
import Painel               from './pages/Dashboard/Painel.jsx';
import Usuarios             from './pages/Dashboard/Usuarios.jsx';
import Pecas                from './pages/Dashboard/Pecas.jsx';
import Listagem             from './pages/Equipamentos/Listagem.jsx';
import Cadastro             from './pages/Equipamentos/Cadastro.jsx';
import Detalhe              from './pages/Equipamentos/Detalhes.jsx';
import ListagemPreventivas  from './pages/Preventivas/Listagem.jsx';
import Checklist            from './pages/Preventivas/Checklist.jsx';
import ListagemCorretivas   from './pages/Corretivas/Listagem.jsx';
import NovaOS               from './pages/Corretivas/NovaOS.jsx';
import DetalhesOS           from './pages/Corretivas/Detalhes.jsx';

// ─── Tela de carregamento ──────────────────────────────────────────────────
// Exibida enquanto initAuth verifica se há sessão ativa (F5 / reload).
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

// ─── Placeholder para módulos em desenvolvimento ───────────────────────────
function Placeholder({ title }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100dvh', gap: '12px',
      fontFamily: "'DM Sans', sans-serif", color: '#64748B', backgroundColor: '#F8F9FB',
    }}>
      <span style={{ fontSize: '40px' }}>🚧</span>
      <h2 style={{ margin: 0, color: '#0D1B2A' }}>{title}</h2>
      <p style={{ margin: 0, fontSize: '14px' }}>Módulo em desenvolvimento</p>
      <a href="/dashboard" style={{ marginTop: '16px', color: '#0F4C81', textDecoration: 'none', fontWeight: 'bold' }}>
        Voltar ao Início
      </a>
    </div>
  );
}

// ─── Guardas de rota ──────────────────────────────────────────────────────
//
// REGRA: Todas as guardas dependem de `isReady` para saber se initAuth terminou.
// Enquanto !isReady → SplashScreen (initAuth ainda está verificando sessão).
// Após isReady=true → decisão de rota baseada em isAuthenticated.

/**
 * Rota privada: exige autenticação.
 * Se !isReady → SplashScreen.
 * Se !isAuthenticated → redireciona para /login.
 */
function PrivateRoute() {
  const { isAuthenticated, isReady } = useAuthStore();
  const location = useLocation();

  if (!isReady) return <SplashScreen />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

/**
 * Subrota exclusiva para SuperAdmin.
 * Assume que já está dentro de PrivateRoute (isReady e isAuthenticated garantidos).
 */
function SuperAdminRoute() {
  const { isSuperAdmin, isReady } = useAuthStore();

  if (!isReady) return <SplashScreen />;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/**
 * Rota pública: redireciona para /dashboard se já autenticado.
 * Se !isReady → SplashScreen.
 * Só redireciona se isAuthenticated E senha_alterada=true
 * (usuários que ainda precisam trocar senha ficam no Login para ver o modal).
 */
function PublicOnlyRoute() {
  const { isAuthenticated, isReady, profile } = useAuthStore();

  if (!isReady) return <SplashScreen />;

  // ⚠️ Só redireciona se o usuário já completou o primeiro acesso.
  // Se senha_alterada=false, Login.jsx mostrará o modal de troca — não interferir.
  if (isAuthenticated && profile?.senha_alterada) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

// ─── Rotas raiz (sem histórico para voltar) ───────────────────────────────
// Nestas rotas, pressionar Voltar exibe o diálogo de saída em vez de navegar.
const ROOT_ROUTES = ['/dashboard', '/login', '/'];

// ─── Handler do botão Voltar do Android ──────────────────────────────────
//
// ARQUITETURA:
//  • Componente sem UI posicionado DENTRO do BrowserRouter, garantindo
//    acesso ao contexto do React Router (useNavigate, useLocation).
//
//  • O listener do Capacitor é registrado UMA ÚNICA VEZ (deps=[]).
//    Para evitar closures obsoletos com a rota atual, usamos locationRef —
//    uma ref atualizada a cada mudança de location sem recriar o listener.
//
//  • Lógica de decisão:
//      1. `window.history.state?.idx > 0` → React Router v6 grava o índice
//         da entrada no estado do History API. Se idx > 0, existe histórico
//         real para navegar de volta.
//      2. Se a rota atual for uma ROOT_ROUTE (sem contexto de "voltar"),
//         tratamos como raiz independentemente do idx.
//      3. Ambas as condições falsas → diálogo de confirmação de saída.
//
//  • Limpeza: listenerHandle.remove() no retorno do useEffect garante que
//    o listener seja removido se o componente for desmontado (StrictMode,
//    HMR etc.), prevenindo vazamentos de memória.

function BackButtonHandler() {
  const navigate     = useNavigate();
  const location     = useLocation();
  // Ref para capturar sempre a rota mais recente dentro do listener,
  // sem precisar recriar o listener a cada mudança de rota.
  const locationRef  = useRef(location);

  // Mantém locationRef sincronizado com a rota atual
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // Registra o listener UMA vez durante a vida do componente
  useEffect(() => {
    let listenerHandle = null;

    const setupListener = async () => {
      listenerHandle = await CapApp.addListener('backButton', async () => {
        const currentPath = locationRef.current.pathname;

        // Verifica se há histórico real de navegação (React Router v6 / History API)
        const historyIdx  = window.history.state?.idx ?? 0;
        const isRootRoute = ROOT_ROUTES.includes(currentPath);
        const canGoBack   = historyIdx > 0 && !isRootRoute;

        if (canGoBack) {
          // Há histórico e não estamos numa rota raiz → navega para trás
          navigate(-1);
          return;
        }

        // Estamos na raiz ou sem histórico → confirma saída
        const { value: confirmed } = await Dialog.confirm({
          title:             'Sair do aplicativo',
          message:           'Tem certeza que deseja sair do aplicativo? Não se preocupe, as suas atividades ficarão salvas e seu login permanecerá ativo por até 24h.',
          okButtonTitle:     'Sair',
          cancelButtonTitle: 'Cancelar',
        });

        if (confirmed) {
          await CapApp.exitApp();
        }
        // Se cancelou, não faz nada — app continua aberto
      });
    };

    setupListener();

    // Cleanup: remove o listener ao desmontar para evitar vazamento de memória
    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null; // Componente sem UI
}

// ─── Inicializador global ─────────────────────────────────────────────────
// Componente sem UI que inicializa auth e serviços na montagem inicial.
// useEffect com [] garante que initAuth rode exatamente uma vez.
// (authStore.initAuth tem guarda interna _authInitialized para React StrictMode)
function AppInitializer() {
  const initAuth       = useAuthStore((s) => s.initAuth);
  const loadLastSyncAt = useAppStore((s) => s.loadLastSyncAt);
  const loadQueues     = useAppStore((s) => s.loadQueuesFromStorage);

  useEffect(() => {
    // initAuth retorna uma função de cleanup (unsubscribe do listener Supabase)
    const unsubAuth = initAuth();

    // Carrega estado offline
    loadQueues();
    loadLastSyncAt();

    // Inicia motor de sincronização offline→online
    initSync();

    // Estilos globais injetados uma vez
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin { to { transform: rotate(360deg); } }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
      input:focus { outline: none; border-color: #0F4C81 !important; }
    `;
    document.head.appendChild(style);

    return () => {
      if (typeof unsubAuth === 'function') unsubAuth();
      if (document.head.contains(style)) document.head.removeChild(style);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

// ─── App principal ────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      {/*
        AppInitializer e BackButtonHandler são posicionados DENTRO do
        BrowserRouter para terem acesso ao contexto do React Router.
        Ambos são componentes sem UI (retornam null).

        Ordem importa:
          1. AppInitializer → inicializa auth e serviços
          2. BackButtonHandler → registra listener do back button nativo
      */}
      <AppInitializer />
      <BackButtonHandler />

      <Routes>
        {/* Raiz → dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Rotas públicas (apenas visitantes não autenticados) */}
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<Login />} />
        </Route>

        {/* Rotas privadas (exige autenticação) */}
        <Route element={<PrivateRoute />}>
          {/* Dashboard central */}
          <Route path="/dashboard" element={<Painel />} />
          <Route path="/perfil"    element={<Placeholder title="Meu Perfil" />} />

          {/* Módulo 1 — Equipamentos */}
          <Route path="/equipamentos"     element={<Listagem />} />
          <Route path="/equipamentos/:id" element={<Detalhe />} />

          {/* Módulo 2 — Preventivas */}
          <Route path="/preventivas"                          element={<ListagemPreventivas />} />
          <Route path="/preventivas/:agendamentoId/checklist" element={<Checklist />} />

          {/* Módulo 3 — Corretivas */}
          <Route path="/corretivas"      element={<ListagemCorretivas />} />
          <Route path="/corretivas/nova" element={<NovaOS />} />
          <Route path="/corretivas/:id"  element={<DetalhesOS />} />

          {/* Apenas SuperAdmin */}
          <Route element={<SuperAdminRoute />}>
            <Route path="/equipamentos/novo"  element={<Cadastro />} />
            <Route path="/dashboard/usuarios" element={<Usuarios />} />
            <Route path="/dashboard/pecas"    element={<Pecas />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
