// src/App.jsx

import { useEffect, useRef } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate,
  Outlet, useLocation, useNavigate,
} from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
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
// Exibida enquanto initAuth verifica se há sessão ativa (F5 / reload).
//
// RESPONSIVIDADE: usa 100dvh (Dynamic Viewport Height) em vez de 100vh para
// que a tela de splash preencha exatamente a viewport visível em mobile,
// sem ser cortada pela barra de endereço retrátil ou pela status bar.
function SplashScreen() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100dvh',                 // dvh: viewport dinâmica (mobile-safe)
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
      height: '100dvh',               // dvh: viewport dinâmica (mobile-safe)
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

  if (!isReady)         return <SplashScreen />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

/**
 * Subrota exclusiva para SuperAdmin.
 * Assume que já está dentro de PrivateRoute (isReady e isAuthenticated garantidos).
 */
function SuperAdminRoute() {
  const { isSuperAdmin, isReady } = useAuthStore();

  if (!isReady)      return <SplashScreen />;
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
  const navigate    = useNavigate();
  const location    = useLocation();
  const locationRef = useRef(location);

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

// ─── Solução 1: AppStateHandler ───────────────────────────────────────────
//
// PROBLEMA RAIZ:
//   Quando o SO pausa o app (background), a interface de rede é suspensa.
//   O cliente Supabase continua tentando renovar o JWT e manter o WebSocket
//   do Realtime ativo — falhas que resultam em ERR_NAME_NOT_RESOLVED.
//   Ao voltar para foreground, o token pode ter expirado e os canais Realtime
//   estão em estado inconsistente.
//
// SOLUÇÃO:
//   • background  → stopAutoRefresh(): pausa renovação de token (sem rede, sem sentido)
//   • foreground  → startAutoRefresh(): reinicia renovação e revalida sessão
//   • foreground  → dispara evento DOM 'app-foreground': qualquer componente
//                   pode reagir (re-fetch de dados, renovar subscription, etc.)
//   • foreground  → initSync(): tenta sincronizar filas offline acumuladas
//
// COMO REAGIR EM OUTROS COMPONENTES (exemplo):
//   useEffect(() => {
//     const onForeground = () => fetchMeusDados();
//     window.addEventListener('app-foreground', onForeground);
//     return () => window.removeEventListener('app-foreground', onForeground);
//   }, []);

function AppStateHandler() {
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    let handle = null;

    const setup = async () => {
      handle = await CapApp.addListener('appStateChange', async ({ isActive }) => {

        if (!isActive) {
          // ── App foi para background ────────────────────────────────────
          // Para o ciclo de auto-refresh para economizar bateria e evitar
          // requisições contra uma interface de rede suspensa pelo SO.
          supabase.auth.stopAutoRefresh();
          console.log('[AppState] Background → autoRefresh pausado.');
          return;
        }

        // ── App voltou para foreground ─────────────────────────────────
        console.log('[AppState] Foreground → retomando sessão...');

        try {
          // 1. Reinicia auto-refresh antes de qualquer coisa
          await supabase.auth.startAutoRefresh();

          // 2. Força a revalidação do token agora, não aguardando o próximo ciclo.
          //    Se o token expirou durante o background, esta chamada o renova.
          //    Se a sessão é inválida, retorna session: null → authStore.logout().
          const { data: { session }, error } = await supabase.auth.getSession();

          if (error) {
            console.error('[AppState] Erro ao revalidar sessão:', error.message);
            return;
          }

          if (!session) {
            console.warn('[AppState] Sessão expirada durante background.');
            // O listener onAuthStateChange no authStore tratará o SIGNED_OUT
            return;
          }

          // 3. Sinaliza aos componentes que o app voltou ao foreground.
          //    Painel.jsx e outros podem ouvir este evento para re-buscar dados
          //    e garantir que suas subscrições Realtime estão ativas.
          window.dispatchEvent(new CustomEvent('app-foreground'));

          // 4. Tenta sincronizar filas offline (checklists/OS) acumuladas
          //    enquanto o app estava sem conexão ou em background.
          initSync().catch((err) =>
            console.warn('[AppState] Falha ao sincronizar após foreground:', err.message)
          );

          console.log('[AppState] Foreground → sessão válida, componentes notificados.');
        } catch (err) {
          // Não deixa erro não tratado quebrar o handler silenciosamente
          console.error('[AppState] Erro no handler de foreground:', err.message);
        }
      });
    };

    // Só registra o listener se há uma sessão ativa
    // (evita overhead em telas de login)
    if (isAuthenticated) {
      setup();
    }

    return () => {
      if (handle) handle.remove();
    };
  }, [isAuthenticated]);

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
//
// RESPONSIVIDADE — Safe Area Insets:
//   O wrapper externo (#app-shell) aplica padding usando env() para respeitar:
//     • Status bar (bateria/hora/notch) no topo  → padding-top
//     • Barra de gestos do Android/iOS no rodapé → padding-bottom
//     • Bordas laterais em iPhones com Dynamic Island → padding-left/right
//
//   max(env(...), Xpx) garante um mínimo legível mesmo em dispositivos sem
//   safe area real (tablets com borda plana, emuladores, browser desktop).
//
//   height: 100dvh no shell garante que o app preencha exatamente a viewport
//   dinâmica visível — sem overflow quando a barra de endereço do browser
//   aparece/desaparece em mobile.
//
//   ATENÇÃO: Para que env(safe-area-inset-*) funcione no Capacitor/WebView,
//   o index.html DEVE conter:
//     <meta name="viewport" content="width=device-width, initial-scale=1,
//           viewport-fit=cover">

export default function App() {
  return (
    <BrowserRouter>
      {/*
        AppInitializer, BackButtonHandler e AppStateHandler são posicionados
        DENTRO do BrowserRouter para terem acesso ao contexto do React Router.
        Todos são componentes sem UI (retornam null).

        Ordem importa:
          1. AppInitializer    → inicializa auth e serviços
          2. BackButtonHandler → registra listener do back button nativo
          3. AppStateHandler   → resiliência a background/foreground
      */}
      <AppInitializer />
      <BackButtonHandler />
      <AppStateHandler />

      {/*
        #app-shell — container raiz do layout visual.

        Estrutura:
          display: flex + flex-direction: column → permite que filhos usem
            flex: 1 para ocupar o espaço restante (scrollable content area).
          height: 100dvh → viewport dinâmica; não corta em mobile.
          overflow: hidden → o scroll acontece nos filhos, não aqui.
          padding safe area → afasta conteúdo da status bar e barra de gestos.
      */}
      <div
        id="app-shell"
        style={{
          display:       'flex',
          flexDirection: 'column',
          height:        '100dvh',
          overflow:      'hidden',
          // Safe area: topo (status bar / notch)
          paddingTop:    'max(env(safe-area-inset-top, 0px), 0px)',
          // Safe area: rodapé (barra de gestos Android/iOS)
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          // Safe area: laterais (Dynamic Island, punched-holes)
          paddingLeft:   'env(safe-area-inset-left,  0px)',
          paddingRight:  'env(safe-area-inset-right, 0px)',
          // Herda background global definido em index.css
          backgroundColor: 'var(--color-bg, #F4F7FA)',
        }}
      >
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
      </div>
    </BrowserRouter>
  );
}
