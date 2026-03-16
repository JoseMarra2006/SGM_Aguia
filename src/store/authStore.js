// src/store/authStore.js

import { create } from 'zustand';
import { supabase } from '../services/supabase';

const useAuthStore = create((set, get) => ({

  // ─── Estado ────────────────────────────────────────────────────────────────
  session:            null,
  profile:            null,
  isReady:            false,   // true apenas quando initAuth terminou de verificar sessão
  authError:          null,
  isLoading:          false,

  // Estados fixos (não getters) — garantem reatividade correta do Zustand
  isAuthenticated:    false,
  isSuperAdmin:       false,
  isMecanico:         false,
  mustChangePassword: false,

  // Flag interna de idempotência — impede que initAuth corra duas vezes
  // (necessário no React StrictMode que monta componentes duas vezes)
  _authInitialized:   false,

  // ─── initAuth ──────────────────────────────────────────────────────────────
  // Chamado UMA vez no AppInitializer (App.jsx). Retorna função de cleanup.
  //
  // DESIGN INTENCIONAL:
  //  • isReady=true é definido AQUI (no finally de checkSession), e em NENHUM
  //    outro lugar — nem dentro de _loadProfile, nem no listener.
  //    Isso evita que o PublicOnlyRoute redirecione no meio do loginWithCPF.
  //
  //  • O listener de onAuthStateChange é bloqueado enquanto isLoading=true,
  //    garantindo que o fluxo manual de login não seja interrompido.
  initAuth: () => {
    // ── Guarda de idempotência ──────────────────────────────────────────────
    if (get()._authInitialized) {
      return () => {}; // já inicializado, retorna cleanup vazio
    }
    set({ _authInitialized: true });

    // ── Failsafe: libera a UI após 2.5 s se o Supabase não responder ────────
    const safetyTimeout = setTimeout(() => {
      if (!get().isReady) {
        console.warn('[Auth] safetyTimeout acionado — forçando isReady=true.');
        set({ isReady: true });
      }
    }, 2500);

    // ── Verificação de sessão existente (F5 / reload) ────────────────────────
    // isReady=true é SEMPRE definido no finally deste bloco,
    // independentemente de haver sessão ou não.
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          set({ session });
          // _loadProfile NÃO seta isReady — apenas carrega dados de perfil
          await get()._loadProfile(session.user.id);
        }
        // Se não houver sessão, o finally abaixo libera a UI
      } catch (err) {
        console.error('[Auth] Erro ao recuperar sessão:', err.message);
      } finally {
        // ✅ ÚNICO lugar onde isReady=true é definido no fluxo de init
        clearTimeout(safetyTimeout);
        set({ isReady: true });
      }
    };

    checkSession();

    // ── Listener reativo para eventos pós-inicialização ──────────────────────
    // Ignoramos INITIAL_SESSION (tratado por checkSession acima).
    // Ignoramos qualquer evento enquanto loginWithCPF estiver rodando (isLoading).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'INITIAL_SESSION') return;

        // Bloqueia enquanto loginWithCPF estiver no controle
        if (get().isLoading) return;

        console.log('[Auth] onAuthStateChange:', event);

        if (session) {
          set({ session });
          // _loadProfile aqui não precisa setar isReady pois já é true
          await get()._loadProfile(session.user.id);
        } else {
          // SIGNED_OUT / expiração de token: reset completo
          set({
            session:            null,
            profile:            null,
            isAuthenticated:    false,
            isSuperAdmin:       false,
            isMecanico:         false,
            mustChangePassword: false,
            // isReady permanece true — a UI pode redirecionar para /login
          });
        }
      }
    );

    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimeout);
    };
  },

  // ─── loginWithCPF ──────────────────────────────────────────────────────────
  // DESIGN INTENCIONAL:
  //  • isLoading=true bloqueia o listener de onAuthStateChange durante todo o fluxo.
  //  • isLoading=false é SEMPRE definido no finally — nunca travará o spinner.
  //  • isReady já é true quando o usuário chega na tela de login
  //    (initAuth completou sem sessão). Por isso, _loadProfile pode setar
  //    isAuthenticated=true sem causar redirect automático antes do return.
  //  • A navegação para /dashboard é responsabilidade de Login.jsx,
  //    que recebe o result diretamente do await.
  loginWithCPF: async (cpf, senha) => {
    set({ isLoading: true, authError: null });

    try {
      // 1. Descobre o e-mail vinculado ao CPF via RPC (SECURITY DEFINER)
      const { data: emailData, error: emailError } = await supabase
        .rpc('fn_email_por_cpf', { p_cpf: cpf.replace(/\D/g, '') });

      if (emailError || !emailData) {
        throw new Error('CPF não encontrado no sistema.');
      }

      // 2. Autentica no Supabase Auth
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email:    emailData,
        password: senha,
      });

      if (loginError) {
        throw new Error('CPF ou senha incorretos.');
      }

      // 3. Salva a sessão imediatamente — necessário para que changePassword
      //    tenha acesso ao session.user.id caso o usuário precise trocar a senha
      //    (o onAuthStateChange está bloqueado por isLoading=true neste momento)
      set({ session: data.session });

      // 4. Carrega perfil completo (define isAuthenticated, isSuperAdmin etc.)
      //    _loadProfile NÃO toca em isReady nem isLoading
      await get()._loadProfile(data.user.id);

      // 4. Valida que o perfil foi realmente carregado (RLS pode ter bloqueado)
      if (!get().profile) {
        await supabase.auth.signOut();
        throw new Error('Perfil não encontrado. Contate o administrador.');
      }

      return { success: true, mustChangePassword: get().mustChangePassword };

    } catch (err) {
      set({ authError: err.message });
      return { success: false };

    } finally {
      // ✅ Garante que isLoading sempre volta a false, mesmo em caso de erro
      set({ isLoading: false });
    }
  },

  // ─── changePassword ────────────────────────────────────────────────────────
  changePassword: async (novaSenha) => {
    set({ isLoading: true, authError: null });

    try {
      const { data: updatedAuth, error: authError } = await supabase.auth.updateUser({ password: novaSenha });
      if (authError) throw authError;

      // Prioriza o id retornado pelo updateUser — garantido mesmo quando
      // onAuthStateChange está bloqueado por isLoading=true (primeiro acesso)
      const userId = updatedAuth?.user?.id ?? get().session?.user?.id;
      if (!userId) throw new Error('Sessão não encontrada. Faça login novamente.');

      const { error: dbError } = await supabase
        .from('usuarios')
        .update({ senha_alterada: true })
        .eq('id', userId);
      if (dbError) throw dbError;

      set((state) => ({
        profile:            { ...state.profile, senha_alterada: true },
        mustChangePassword: false,
      }));

      return { success: true };

    } catch (err) {
      set({ authError: err.message });
      return { success: false };

    } finally {
      set({ isLoading: false });
    }
  },

  // ─── logout ────────────────────────────────────────────────────────────────
  logout: async () => {
    await supabase.auth.signOut();
    // Reset imediato — o listener de onAuthStateChange também fará isso
    set({
      session:            null,
      profile:            null,
      authError:          null,
      isAuthenticated:    false,
      isSuperAdmin:       false,
      isMecanico:         false,
      mustChangePassword: false,
    });
  },

  // ─── _loadProfile (interno) ────────────────────────────────────────────────
  // RESPONSABILIDADE: Carregar dados de perfil do banco e atualizar o estado
  // de autenticação (isAuthenticated, isSuperAdmin, profile, etc.)
  //
  // NÃO TOCA em: isReady, isLoading
  // Quem controla isReady: initAuth (checkSession.finally)
  // Quem controla isLoading: loginWithCPF (finally) e changePassword (finally)
  _loadProfile: async (userId) => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, role, nome_completo, cpf, email, senha_alterada')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[Auth] Falha ao carregar perfil:', error.message);
        // Não faz signOut automático — deixa o PrivateRoute agir via isAuthenticated=false
        set({
          session:            null,
          profile:            null,
          isAuthenticated:    false,
          isSuperAdmin:       false,
          isMecanico:         false,
          mustChangePassword: false,
          // ⚠️ NÃO seta isReady aqui
        });
        return;
      }

      set({
        profile:            data,
        isAuthenticated:    true,
        isSuperAdmin:       data.role === 'superadmin',
        isMecanico:         data.role === 'mecanico',
        mustChangePassword: data.senha_alterada === false,
        // ⚠️ NÃO seta isReady aqui
      });

    } catch (err) {
      console.error('[Auth] Erro inesperado em _loadProfile:', err.message);
      set({
        isAuthenticated:    false,
        isSuperAdmin:       false,
        isMecanico:         false,
        mustChangePassword: false,
        // ⚠️ NÃO seta isReady aqui
      });
    }
  },

  // ─── Utilitários ──────────────────────────────────────────────────────────
  clearAuthError: () => set({ authError: null }),

}));

export default useAuthStore;
