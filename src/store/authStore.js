// src/store/authStore.js

import { create } from 'zustand';
import { supabase } from '../services/supabase';

const useAuthStore = create((set, get) => ({

  // ─── Estado ────────────────────────────────────────────────────────────────
  session:            null,
  profile:            null,
  isReady:            false,
  authError:          null,
  isLoading:          false,

  // Estados fixos (não getters) — garantem reatividade correta do Zustand
  isAuthenticated:    false,
  isSuperAdmin:       false,
  isMecanico:         false,
  mustChangePassword: false,

  // ─── initAuth ──────────────────────────────────────────────────────────────
  // Chamado UMA vez no AppInitializer (App.jsx). Retorna o cleanup do listener.
  initAuth: () => {

    // REQUISITO 1 — Failsafe: force isReady=true após 2.5 s se o Supabase não
    // responder, evitando o travamento eterno da SplashScreen.
    const safetyTimeout = setTimeout(() => {
      if (!get().isReady) {
        console.warn('[Auth] safetyTimeout acionado — forçando isReady=true.');
        set({ isReady: true });
      }
    }, 2500);

    // REQUISITO 2 — Fluxo de recuperação de sessão prioritário:
    // getSession → _loadProfile → isReady=true (nessa ordem, sem corrida).
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          set({ session });
          // _loadProfile já define isReady=true em qualquer desfecho (req. 4)
          await get()._loadProfile(session.user.id);
        } else {
          // Sem sessão: libera a UI imediatamente
          set({ isReady: true });
        }
      } catch (err) {
        console.error('[Auth] Erro ao recuperar sessão:', err.message);
        set({ isReady: true });
      } finally {
        clearTimeout(safetyTimeout);
      }
    };

    checkSession();

    // REQUISITO 3 — Listener reativo para eventos pós-inicialização.
    // • Ignora INITIAL_SESSION (conflitaria com checkSession acima).
    // • Ignora qualquer evento enquanto um login manual estiver em andamento
    //   (isLoading=true), pois loginWithCPF chama _loadProfile diretamente.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Bloqueia evento de inicialização — já tratado por checkSession
        if (event === 'INITIAL_SESSION') return;

        // Bloqueia enquanto loginWithCPF estiver rodando
        if (get().isLoading) return;

        console.log('[Auth] onAuthStateChange:', event);

        if (session) {
          set({ session });
          await get()._loadProfile(session.user.id);
        } else {
          // Logout ou expiração de token
          set({
            session:            null,
            profile:            null,
            isAuthenticated:    false,
            isSuperAdmin:       false,
            isMecanico:         false,
            mustChangePassword: false,
            isReady:            true,   // garante que a UI desbloqueie
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
  // isLoading=true durante todo o fluxo → onAuthStateChange fica bloqueado
  // para não conflitar com a chamada direta a _loadProfile aqui.
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

      // 3. Carrega perfil completo (seta isAuthenticated, isSuperAdmin etc.)
      await get()._loadProfile(data.user.id);

      // 4. Verifica se o perfil foi carregado (RLS pode ter bloqueado)
      if (!get().profile) {
        await supabase.auth.signOut();
        throw new Error('Perfil não encontrado. Contate o administrador.');
      }

      set({ isLoading: false });
      return { success: true, mustChangePassword: get().mustChangePassword };

    } catch (err) {
      set({ isLoading: false, authError: err.message });
      return { success: false };
    }
  },

  // ─── changePassword ────────────────────────────────────────────────────────
  changePassword: async (novaSenha) => {
    set({ isLoading: true, authError: null });

    try {
      const { error: authError } = await supabase.auth.updateUser({ password: novaSenha });
      if (authError) throw authError;

      const userId = get().session?.user?.id;
      const { error: dbError } = await supabase
        .from('usuarios')
        .update({ senha_alterada: true })
        .eq('id', userId);
      if (dbError) throw dbError;

      set((state) => ({
        profile:            { ...state.profile, senha_alterada: true },
        mustChangePassword: false,
        isLoading:          false,
      }));

      return { success: true };
    } catch (err) {
      set({ isLoading: false, authError: err.message });
      return { success: false };
    }
  },

  // ─── logout ────────────────────────────────────────────────────────────────
  // O signOut dispara onAuthStateChange(SIGNED_OUT) — o listener cuida do reset
  // do estado. O set aqui é um seguro extra para o caso de o listener demorar.
  logout: async () => {
    await supabase.auth.signOut();
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
  // REQUISITO 4 — Em qualquer desfecho (sucesso ou erro), isReady=true é
  // garantido para que o sistema possa redirecionar o usuário ao invés de travar.
  _loadProfile: async (userId) => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, role, nome_completo, cpf, email, senha_alterada')
        .eq('id', userId)
        .single();

      if (error) {
        // Erro de RLS ou rede: não faz signOut automático — deixa o PrivateRoute
        // redirecionar para /login via isAuthenticated=false.
        console.error('[Auth] Falha ao carregar perfil:', error.message);
        set({
          session:            null,
          profile:            null,
          isAuthenticated:    false,
          isSuperAdmin:       false,
          isMecanico:         false,
          mustChangePassword: false,
          isReady:            true,   // CRÍTICO: desbloqueia a UI
        });
        return;
      }

      set({
        profile:            data,
        isAuthenticated:    true,
        isSuperAdmin:       data.role === 'superadmin',
        isMecanico:         data.role === 'mecanico',
        mustChangePassword: data.senha_alterada === false,
        isReady:            true,   // CRÍTICO: desbloqueia a UI
      });

    } catch (err) {
      // Erro inesperado (rede, parse, etc.)
      console.error('[Auth] Erro inesperado em _loadProfile:', err.message);
      set({
        isAuthenticated:    false,
        isSuperAdmin:       false,
        isMecanico:         false,
        mustChangePassword: false,
        isReady:            true,   // CRÍTICO: desbloqueia a UI
      });
    }
  },

  // ─── Utilitários ──────────────────────────────────────────────────────────
  clearAuthError: () => set({ authError: null }),

}));

export default useAuthStore;
