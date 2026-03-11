// src/store/authStore.js

import { create } from 'zustand';
import { supabase } from '../services/supabase';

const useAuthStore = create((set, get) => ({
  session: null,
  profile: null,
  isReady: false,
  authError: null,
  isLoading: false,
  isAuthenticated: false,
  isSuperAdmin: false,
  isMecanico: false,
  mustChangePassword: false,

  // ─────────────────────────────────────────
  // INICIALIZAÇÃO (A Mágica do F5)
  // ─────────────────────────────────────────
  initAuth: () => {
    // 1. Ao recarregar a página (F5), ele checa o cache silenciosamente e destrava a tela.
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        set({ session });
        await get()._loadProfile(session.user.id);
      }
      set({ isReady: true }); // O comando que tira a roda infinita da tela!
    };

    checkSession();

    // 2. O Observador agora só fica cuidando de quando você clica em "Sair"
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'INITIAL_SESSION') return; // Ignora pq o checkSession já fez isso

        if (event === 'SIGNED_OUT') {
          set({
            session: null,
            profile: null,
            isAuthenticated: false,
            isSuperAdmin: false,
            isMecanico: false,
            mustChangePassword: false,
          });
          return;
        }

        if (session) {
          set({ session });
          const profileAtual = get().profile;
          if (!profileAtual || profileAtual.id !== session.user.id) {
            await get()._loadProfile(session.user.id);
          }
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  },

  // ─────────────────────────────────────────
  // LOGIN (Código EXATO do Claude que você testou)
  // ─────────────────────────────────────────
  loginWithCPF: async (cpf, senha) => {
    set({ isLoading: true, authError: null });

    try {
      const { data: emailData, error: emailError } = await supabase
        .rpc('fn_email_por_cpf', { p_cpf: cpf.replace(/\D/g, '') });

      if (emailError || !emailData) {
        throw new Error('CPF não encontrado no sistema.');
      }

      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: emailData,
        password: senha,
      });

      if (loginError) {
        throw new Error('CPF ou senha incorretos.');
      }

      await get()._loadProfile(data.user.id);

      const profileCarregado = get().profile;
      if (!profileCarregado) {
        throw new Error(
          'Perfil não encontrado. Verifique se o usuário existe na tabela "usuarios".'
        );
      }

      return { success: true, mustChangePassword: get().mustChangePassword };

    } catch (err) {
      set({ authError: err.message });
      return { success: false };

    } finally {
      // ✅ A CORREÇÃO DO CLAUDE QUE NUNCA DEIXA TRAVAR
      set({ isLoading: false });
    }
  },

  // ─────────────────────────────────────────
  // TROCA DE SENHA (Código EXATO do Claude)
  // ─────────────────────────────────────────
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
        profile: { ...state.profile, senha_alterada: true },
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

  // ─────────────────────────────────────────
  // LOGOUT (Código EXATO do Claude)
  // ─────────────────────────────────────────
  logout: async () => {
    await supabase.auth.signOut();
  },

  // ─────────────────────────────────────────
  // INTERNO (Código EXATO do Claude)
  // ─────────────────────────────────────────
  _loadProfile: async (userId) => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, role, nome_completo, cpf, email, senha_alterada')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[Auth] Falha ao carregar perfil:', error.message);
      set({
        profile: null,
        isAuthenticated: false,
        isSuperAdmin: false,
        isMecanico: false,
        mustChangePassword: false,
      });
      return;
    }

    set({
      profile: data,
      isAuthenticated: true,
      isSuperAdmin: data.role === 'superadmin',
      isMecanico: data.role === 'mecanico',
      mustChangePassword: data.senha_alterada === false,
    });
  },

  clearAuthError: () => set({ authError: null }),
}));

export default useAuthStore;