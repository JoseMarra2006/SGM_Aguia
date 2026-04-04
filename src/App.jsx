// src/App.jsx

import { useEffect, useRef } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate,
  Outlet, useLocation, useNavigate,
} from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Network }       from '@capacitor/network';
import { Dialog }        from '@capacitor/dialog';
import useAuthStore  from './store/authStore.js';
import useAppStore   from './store/appStore.js';
import { supabase }  from './services/supabase.js';
import { initSync }  from './services/sync.js';

// ─── Importação das Telas ───
import Login               from './pages/Login/Login.jsx';
import Usuarios            from './pages/Dashboard/Usuarios.jsx';
import Painel              from './pages/Dashboard/Painel.jsx';
import Pecas               from './pages/Dashboard/Pecas.jsx';
import Listagem            from './pages/Equipamentos/Listagem.jsx';
import Cadastro            from './pages/Equipamentos/Cadastro.jsx';
import Detalhe             from './pages/Equipamentos/Detalhes.jsx';
import ListagemPreventivas from './pages/Preventivas/Listagem.jsx';
import Checklist           from './pages/Preventivas/Checklist.jsx';
import ListagemCorretivas  from './pages/Corretivas/Listagem.jsx';
import NovaOS              from './pages/Corretivas/NovaOS.jsx';
import DetalhesOS          from './pages/Corretivas/Detalhes.jsx';

// ─── Tela de carregamento ──────────────────────────────────────────────────
function SplashScreen() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100dvh',
      backgroundColor: '#0F4C81',
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
      justifyContent: 'center',
      height: '100dvh',
      gap: '12px',
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

function PrivateRoute() {
  const { isAuthenticated, isReady } = useAuthStore();
  const location = useLocation();

  if (!isReady)         return <SplashScreen />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

function SuperAdminRoute() {
  const { isSuperAdmin, isReady } = useAuthStore();

  if (!isReady)      return <SplashScreen />;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function AdminOnly({ children }) {
  const { isSuperAdmin, isReady } = useAuthStore();
  if (!isReady)      return <SplashScreen />;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function PublicOnlyRoute() {
  const { isAuthenticated, isReady, profile } = useAuthStore();

  if (!isReady) return <SplashScreen />;

  if (isAuthenticated && profile?.senha_alterada) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

// ─── Rotas raiz ───────────────────────────────────────────────────────────
const ROOT_ROUTES = ['/dashboard', '/login', '/'];

// ─── Handler do botão Voltar do Android ──────────────────────────────────
function BackButtonHandler() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const locationRef = useRef(location);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    let listenerHandle = null;

    const setupListener = async () => {
      listenerHandle = await CapApp.addListener('backButton', async () => {
        const currentPath = locationRef.current.pathname;
        const historyIdx  = window.history.state?.idx ?? 0;
        const isRootRoute = ROOT_ROUTES.includes(currentPath);
        const canGoBack   = historyIdx > 0 && !isRootRoute;

        if (canGoBack) {
          navigate(-1);
          return;
        }

        const { value: confirmed } = await Dialog.confirm({
          title:             'Sair do aplicativo',
          message:           'Tem certeza que deseja sair do aplicativo? Não se preocupe, as suas atividades ficarão salvas e seu login permanecerá ativo por até 24h.',
          okButtonTitle:     'Sair',
          cancelButtonTitle: 'Cancelar',
        });

        if (confirmed) {
          await CapApp.exitApp();
        }
      });
    };

    setupListener();

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

// ─── NetworkHandler ───────────────────────────────────────────────────────
//
// Componente sem UI responsável por manter appStore.isOnline sincronizado
// com o estado real da rede via @capacitor/network.
//
// ARQUITETURA:
//  • No mount: lê o status atual com Network.getStatus() para garantir que
//    o estado inicial seja correto independente de navigator.onLine.
//  • Listener 'networkStatusChange': atualiza setIsOnline em tempo real a
//    cada mudança de conectividade (Wi-Fi → dados → offline e vice-versa).
//  • Cleanup: remove o listener ao desmontar (StrictMode / HMR safe).

function NetworkHandler() {
  const setIsOnline = useAppStore((s) => s.setIsOnline);

  useEffect(() => {
    let listenerHandle = null;

    const setup = async () => {
      // Leitura inicial — pode diferir de navigator.onLine em alguns dispositivos
      try {
        const status = await Network.getStatus();
        setIsOnline(status.connected);
      } catch (err) {
        console.warn('[Network] Falha ao ler status inicial:', err.message);
      }

      // Listener em tempo real
      listenerHandle = await Network.addListener('networkStatusChange', (status) => {
        console.log(`[Network] Status alterado → ${status.connected ? 'online' : 'offline'} (${status.connectionType})`);
        setIsOnline(status.connected);
      });
    };

    setup();

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [setIsOnline]);

  return null;
}

// ─── Banner Global Offline ────────────────────────────────────────────────
//
// Faixa de aviso exibida em TODAS as telas enquanto !isOnline.
// Posicionada fora do #app-shell para cobrir o layout inteiro,
// imediatamente abaixo do safe-area-inset-top (via position sticky/fixed
// gerenciado pelo fluxo normal do documento).
//
// NÃO usa position:fixed para não interferir com o scroll nativo.

function OfflineBanner() {
  const isOnline = useAppStore((s) => s.isOnline);

  if (isOnline) return null;

  return (
    <div style={{
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      gap:             '8px',
      padding:         '9px 16px',
      backgroundColor: '#F59E0B',
      color:           '#78350F',
      fontSize:        '12px',
      fontWeight:      '600',
      fontFamily:      "'DM Sans','Segoe UI',sans-serif",
      lineHeight:      1.4,
      textAlign:       'center',
      position:        'sticky',
      top:             0,
      zIndex:          100,
      boxShadow:       '0 2px 8px rgba(245,158,11,0.3)',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        style={{ display: 'block', flexShrink: 0 }}>
        <path
          d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.8M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"
          stroke="#78350F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
      Modo Offline: Funcionalidades limitadas. Suas ações estão sendo salvas no dispositivo.
    </div>
  );
}

// ─── AppStateHandler ──────────────────────────────────────────────────────
function AppStateHandler() {
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    let handle = null;

    const setup = async () => {
      handle = await CapApp.addListener('appStateChange', async ({ isActive }) => {

        if (!isActive) {
          supabase.auth.stopAutoRefresh();
          console.log('[AppState] Background → autoRefresh pausado.');
          return;
        }

        console.log('[AppState] Foreground → retomando sessão...');

        try {
          await supabase.auth.startAutoRefresh();

          const { data: { session }, error } = await supabase.auth.getSession();

          if (error) {
            console.error('[AppState] Erro ao revalidar sessão:', error.message);
            return;
          }

          if (!session) {
            console.warn('[AppState] Sessão expirada durante background.');
            return;
          }

          window.dispatchEvent(new CustomEvent('app-foreground'));

          initSync().catch((err) =>
            console.warn('[AppState] Falha ao sincronizar após foreground:', err.message)
          );

          console.log('[AppState] Foreground → sessão válida, componentes notificados.');
        } catch (err) {
          console.error('[AppState] Erro no handler de foreground:', err.message);
        }
      });
    };

    if (isAuthenticated) {
      setup();
    }

    return () => {
      if (handle) handle.remove();
    };
  }, [isAuthenticated]);

  return null;
}

// ─── AppInitializer ───────────────────────────────────────────────────────
function AppInitializer() {
  const initAuth              = useAuthStore((s) => s.initAuth);
  const loadLastSyncAt        = useAppStore((s) => s.loadLastSyncAt);
  const loadQueues            = useAppStore((s) => s.loadQueuesFromStorage);
  const syncEquipamentosCache = useAppStore((s) => s.syncEquipamentosCache);

  useEffect(() => {
    const unsubAuth = initAuth();

    Promise.all([loadQueues(), loadLastSyncAt()]).then(() => {
      initSync();
    });

    syncEquipamentosCache();

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
//
// RESPONSIVIDADE — Safe Area Insets:
//   minHeight: 100dvh permite que o conteúdo cresça além da viewport,
//   devolvendo o scroll nativo ao aparelho. overflow NÃO é definido aqui.
//
// OFFLINE BANNER:
//   OfflineBanner é renderizado DENTRO do #app-shell, acima das rotas,
//   mas não afeta o roteamento. Usa position:sticky para acompanhar o
//   scroll sem sobrepor conteúdo de forma inesperada.

export default function App() {
  return (
    <BrowserRouter>
      <AppInitializer />
      <BackButtonHandler />
      <AppStateHandler />
      {/* NetworkHandler: detecta mudanças de rede via @capacitor/network */}
      <NetworkHandler />

      <div
        id="app-shell"
        style={{
          display:       'flex',
          flexDirection: 'column',
          minHeight:     '100dvh',
          paddingTop:    'max(env(safe-area-inset-top, 0px), 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft:   'env(safe-area-inset-left,  0px)',
          paddingRight:  'env(safe-area-inset-right, 0px)',
          backgroundColor: 'var(--color-bg, #F4F7FA)',
        }}
      >
        {/* Banner amarelo global — visível em todas as telas quando offline */}
        <OfflineBanner />

        <Routes>
          {/* Raiz → dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Rotas públicas */}
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<Login />} />
          </Route>

          {/* Rotas privadas */}
          <Route element={<PrivateRoute />}>
            <Route path="/dashboard" element={<Painel />} />
            <Route path="/perfil"    element={<Placeholder title="Meu Perfil" />} />

            <Route path="/equipamentos"      element={<Listagem />} />
            <Route path="/equipamentos/novo" element={<AdminOnly><Cadastro /></AdminOnly>} />
            <Route path="/equipamentos/:id"  element={<Detalhe />} />

            <Route path="/preventivas"                          element={<ListagemPreventivas />} />
            <Route path="/preventivas/:agendamentoId/checklist" element={<Checklist />} />

            <Route path="/corretivas"      element={<ListagemCorretivas />} />
            <Route path="/corretivas/nova" element={<NovaOS />} />
            <Route path="/corretivas/:id"  element={<DetalhesOS />} />

            <Route element={<SuperAdminRoute />}>
              <Route path="/dashboard/usuarios" element={<Usuarios />} />
              <Route path="/dashboard/pecas"    element={<Pecas />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}