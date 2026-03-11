// src/store/authStore.js

import { create } from 'zustand';
import { supabase } from '../services/supabase';

/**
 * authStore — Sessão, perfil e permissões do usuário autenticado.
 *
 * Ciclo de vida:
 *  1. initAuth() é chamado em App.jsx no mount — restaura sessão existente.
 *  2. Supabase onAuthStateChange mantém o estado sincronizado automaticamente.
 *  3. loginWithCPF() busca o email vinculado ao CPF e autentica via Supabase Auth.
 *  4. logout() encerra a sessão local e no Supabase.
 *
 * Separação de responsabilidades:
 *  - `session`  → objeto bruto do Supabase Auth (tokens, expiração)
 *  - `profile`  → registro da tabela `usuarios` (role, nome, senha_alterada, etc.)
 *  - `isReady`  → true após a verificação inicial de sessão (evita flash de tela de login)
 */

const useAuthStore = create((set, get) => ({
  // ─────────────────────────────────────────
  // ESTADO
  // ─────────────────────────────────────────

  /** @type {import('@supabase/supabase-js').Session | null} */
  session: null,

  /**
   * @typedef {Object} UserProfile
   * @property {string}  id
   * @property {'superadmin'|'mecanico'} role
   * @property {string}  nome_completo
   * @property {string}  cpf
   * @property {string}  email
   * @property {boolean} senha_alterada
   */
  /** @type {UserProfile | null} */
  profile: null,

  /** Impede render prematuro antes de verificar sessão existente. */
  isReady: false,

  /** Erros de autenticação para exibição na UI. */
  authError: null,

  /** Controla o estado de carregamento das chamadas de auth. */
  isLoading: false,

  // ─────────────────────────────────────────
  // GETTERS DERIVADOS
  // ─────────────────────────────────────────

  get isAuthenticated() {
    return get().session !== null && get().profile !== null;
  },

  get isSuperAdmin() {
    return get().profile?.role === 'superadmin';
  },

  get isMecanico() {
    return get().profile?.role === 'mecanico';
  },

  /** True se o usuário precisa trocar a senha (primeiro login). */
  get mustChangePassword() {
    return get().profile?.senha_alterada === false;
  },

  // ─────────────────────────────────────────
  // INICIALIZAÇÃO
  // ─────────────────────────────────────────

  /**
   * Inicializa o listener de sessão do Supabase.
   * Deve ser chamado UMA VEZ em App.jsx via useEffect.
   * Retorna a função de cleanup do listener.
   */
  initAuth: () => {
    // Verifica sessão existente ao abrir o app
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        await get()._loadProfile(session.user.id);
      }
      set({ session, isReady: true });
    });

    // Listener reativo para login/logout/refresh automático de token
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] Evento:', event);

        if (session) {
          set({ session });
          await get()._loadProfile(session.user.id);
        } else {
          set({ session: null, profile: null });
        }

        // Marca como pronto após qualquer evento inicial
        if (!get().isReady) {
          set({ isReady: true });
        }
      }
    );

    // Retorna cleanup para ser usado no useEffect do App.jsx
    return () => subscription.unsubscribe();
  },

  // ─────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────

  /**
   * Autentica via CPF + senha.
   * O CPF é usado para descobrir o email cadastrado, pois o Supabase Auth
   * trabalha com email/senha internamente.
   *
   * @param {string} cpf    - CPF sem formatação (apenas dígitos)
   * @param {string} senha
   * @returns {Promise<{ success: boolean, mustChangePassword?: boolean }>}
   */
  loginWithCPF: async (cpf, senha) => {
    set({ isLoading: true, authError: null });

    try {
      // 1. Busca o email vinculado ao CPF na tabela usuarios
      //    NOTA: Esta query usa a service role? Não — usa anon key com RLS.
      //    A policy de SELECT em `usuarios` permite busca por CPF sem estar autenticado?
      //    Para isso, crie uma RLS policy específica ou uma função RPC pública:
      //
      //    CREATE OR REPLACE FUNCTION public.fn_email_por_cpf(p_cpf TEXT)
      //    RETURNS TEXT AS $$
      //      SELECT email FROM public.usuarios WHERE cpf = p_cpf LIMIT 1;
      //    $$ LANGUAGE sql SECURITY DEFINER;
      //
      //    Isso evita expor a tabela inteira anonimamente.

      const { data: emailData, error: emailError } = await supabase
        .rpc('fn_email_por_cpf', { p_cpf: cpf.replace(/\D/g, '') });

      if (emailError || !emailData) {
        throw new Error('CPF não encontrado. Verifique o número digitado.');
      }

      // 2. Autentica com email + senha no Supabase Auth
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: emailData,
        password: senha,
      });

      if (loginError) {
        // Traduz erros comuns do Supabase para português
        if (loginError.message.includes('Invalid login credentials')) {
          throw new Error('CPF ou senha incorretos.');
        }
        throw new Error(loginError.message);
      }

      // 3. Carrega perfil completo
      await get()._loadProfile(data.user.id);

      const mustChangePassword = get().profile?.senha_alterada === false;

      set({ isLoading: false });
      return { success: true, mustChangePassword };

    } catch (err) {
      set({ isLoading: false, authError: err.message });
      return { success: false };
    }
  },

  // ─────────────────────────────────────────
  // TROCA DE SENHA (PRIMEIRO LOGIN)
  // ─────────────────────────────────────────

  /**
   * Atualiza a senha do usuário e marca `senha_alterada = true`.
   * @param {string} novaSenha
   * @returns {Promise<{ success: boolean }>}
   */
  changePassword: async (novaSenha) => {
    set({ isLoading: true, authError: null });

    try {
      // 1. Atualiza a senha no Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({
        password: novaSenha,
      });
      if (authError) throw authError;

      // 2. Marca senha_alterada = true na tabela usuarios
      const userId = get().session?.user?.id;
      const { error: dbError } = await supabase
        .from('usuarios')
        .update({ senha_alterada: true })
        .eq('id', userId);

      if (dbError) throw dbError;

      // 3. Atualiza o perfil local
      set((state) => ({
        profile: { ...state.profile, senha_alterada: true },
        isLoading: false,
      }));

      return { success: true };
    } catch (err) {
      set({ isLoading: false, authError: err.message });
      return { success: false };
    }
  },

  // ─────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────

  /**
   * Encerra a sessão local e no Supabase.
   */
  logout: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null, authError: null });
  },

  // ─────────────────────────────────────────
  // INTERNOS
  // ─────────────────────────────────────────

  /**
   * Carrega o perfil completo do usuário da tabela `usuarios`.
   * @param {string} userId
   */
  _loadProfile: async (userId) => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, role, nome_completo, cpf, email, senha_alterada')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[Auth] Falha ao carregar perfil:', error.message);
      await supabase.auth.signOut();
      set({ session: null, profile: null });
      return;
    }

    set({ profile: data });
  },

  clearAuthError: () => set({ authError: null }),
}));

export default useAuthStore;