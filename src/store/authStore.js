// src/store/authStore.js

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '../services/supabase';
import { CapacitorStorage } from '../services/capacitor-storage.js';

const INATIVIDADE_LIMITE_MS = 24 * 60 * 60 * 1000; // 24 horas
const STORAGE_KEY = '@sgm:auth';

/**
 * Timeout de segurança para o initAuth.
 *
 * Deve ser maior do que:
 *   - Timeout do CapacitorStorage (3s)
 *   - Tempo esperado de rehidratação do Zustand no Android
 *   - Tempo de resposta do Supabase em rede móvel
 *
 * 8s é conservador mas evita o loop de carregamento infinito em dispositivos lentos.
 */
const SAFETY_TIMEOUT_MS = 8000;

/**
 * Aguarda a rehidratação do Zustand ser concluída antes de prosseguir.
 * Necessário porque o CapacitorStorage é assíncrono — ao contrário do
 * localStorage (síncrono), o estado rehidratado pode não estar disponível
 * imediatamente após a criação do store.
 *
 * @param {Function} getState - Função get() do Zustand
 * @returns {Promise<void>}
 */
const waitForRehydration = (getState) => {
  return new Promise((resolve) => {
    // Se já rehidratou (isReady foi marcado pelo onRehydrateStorage), resolve imediatamente
    if (getState()._rehydrated) {
      resolve();
      return;
    }

    // Caso contrário, aguarda até 5s verificando a cada 50ms
    const maxWait = 5000;
    const interval = 50;
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += interval;
      if (getState()._rehydrated || elapsed >= maxWait) {
        clearInterval(timer);
        resolve();
      }
    }, interval);
  });
};

const useAuthStore = create(
  persist(
    (set, get) => ({

      // ── Estado de sessão ──────────────────────────────────────────────────
      session:            null,
      profile:            null,
      isReady:            false,
      authError:          null,
      isLoading:          false,

      // ── Flags derivadas (persistidas) ─────────────────────────────────────
      isAuthenticated:    false,
      isSuperAdmin:       false,
      isMecanico:         false,
      mustChangePassword: false,

      // ── Controle de inatividade e alertas ─────────────────────────────────
      lastActivity:       null,
      showSecurityAlert:  false,

      // ── Flags internas (não persistidas) ─────────────────────────────────
      _authInitialized:   false,
      _rehydrated:        false, // sinalizado pelo onRehydrateStorage após leitura do storage

      // ── Ações de UI ───────────────────────────────────────────────────────
      setShowSecurityAlert: (valor) => set({ showSecurityAlert: valor }),

      updateActivity: () => set({ lastActivity: Date.now() }),

      /**
       * Inicializa o listener de autenticação.
       * Deve ser chamado uma única vez na montagem do app (ex: App.jsx useEffect).
       *
       * Aguarda a rehidratação do storage assíncrono antes de validar a sessão,
       * evitando a race condition que causava logout indevido no Android.
       *
       * @returns {Function} Cleanup — cancelar o listener do Supabase
       */
      initAuth: () => {
        if (get()._authInitialized) {
          return () => {};
        }
        set({ _authInitialized: true });

        // Timeout de segurança: se algo travar, libera o app e faz logout defensivo
        const safetyTimeout = setTimeout(() => {
          if (!get().isReady) {
            console.warn('[Auth] safetyTimeout! Forçando liberação do app.');
            get()._forceLogoutAndReady();
          }
        }, SAFETY_TIMEOUT_MS);

        const checkSession = async () => {
          try {
            // ── CORREÇÃO PRINCIPAL ─────────────────────────────────────────
            // Aguarda a rehidratação do CapacitorStorage (assíncrono no Android)
            // antes de ler qualquer estado persistido (isAuthenticated, lastActivity).
            // Sem isso, lemos valores padrão (false/null) e fazemos logout indevido.
            await waitForRehydration(get);
            // ──────────────────────────────────────────────────────────────

            const { lastActivity, isAuthenticated } = get();

            // Verifica inatividade apenas se havia sessão persistida
            if (isAuthenticated && lastActivity) {
              const inativo = Date.now() - lastActivity;
              if (inativo > INATIVIDADE_LIMITE_MS) {
                console.warn('[Auth] Sessão expirada por inatividade.');
                get()._forceLogoutAndReady();
                return;
              }
            }

            // Valida sessão no Supabase
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error) throw error;

            if (session) {
              set({ session });
              await get()._loadProfile(session.user.id);
            } else if (isAuthenticated) {
              // Havia cache local mas Supabase não reconhece a sessão → estado zumbi
              console.warn('[Auth] Sem sessão ativa no Supabase. Limpando cache.');
              get()._forceLogoutAndReady();
              return;
            }
          } catch (err) {
            console.error('[Auth] Erro ao recuperar sessão:', err.message);
            get()._forceLogoutAndReady();
            return;
          } finally {
            clearTimeout(safetyTimeout);
            set({ isReady: true });
          }
        };

        checkSession();

        // Listener de mudanças de estado do Supabase (login/logout externo, token refresh etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            // Ignora o evento inicial — tratado pelo checkSession acima
            if (event === 'INITIAL_SESSION') return;
            // Não processa se já há uma operação em andamento
            if (get().isLoading) return;

            if (session) {
              set({ session });
              await get()._loadProfile(session.user.id);
              get().updateActivity();
            } else {
              get()._clearAuthState();
            }
          }
        );

        return () => {
          subscription.unsubscribe();
          clearTimeout(safetyTimeout);
        };
      },

      // ── Login ─────────────────────────────────────────────────────────────
      loginWithCPF: async (cpf, senha) => {
        set({ isLoading: true, authError: null });

        try {
          const cpfLimpo = cpf.replace(/\D/g, '');
          let emailParaLogin = `${cpfLimpo}@aguia.com.br`;

          // Tenta buscar o e-mail real associado ao CPF
          const { data: emailData, error: emailError } = await supabase
            .rpc('fn_email_por_cpf', { p_cpf: cpfLimpo });

          if (!emailError && emailData) {
            emailParaLogin = emailData;
          }

          const { data, error: loginError } = await supabase.auth.signInWithPassword({
            email: emailParaLogin,
            password: senha,
          });

          if (loginError) {
            throw new Error('CPF ou senha incorretos.');
          }

          set({ session: data.session, lastActivity: Date.now() });

          await get()._loadProfile(data.user.id);

          if (!get().profile) {
            get().logout();
            throw new Error('Perfil não encontrado. Contate o administrador.');
          }

          return { success: true, mustChangePassword: get().mustChangePassword };

        } catch (err) {
          set({ authError: err.message });
          return { success: false };
        } finally {
          set({ isLoading: false });
        }
      },

      // ── Troca de senha ────────────────────────────────────────────────────
      changePassword: async (novaSenha) => {
        set({ isLoading: true, authError: null });

        try {
          const { data: updatedAuth, error: authError } = await supabase.auth.updateUser({
            password: novaSenha,
          });
          if (authError) throw authError;

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
            lastActivity:       Date.now(),
          }));

          return { success: true };

        } catch (err) {
          set({ authError: err.message });
          return { success: false };

        } finally {
          set({ isLoading: false });
        }
      },

      /**
       * Logout explícito (acionado pelo usuário ou por inatividade).
       * Fire-and-forget no Supabase para não travar a UI.
       */
      logout: () => {
        // Dispara sem await — não trava o app se o Supabase estiver lento
        supabase.auth.signOut().catch((err) => {
          console.warn('[Auth] Aviso no signOut Supabase:', err.message);
        });

        get()._clearAuthState();

        // Remove cache nativo silenciosamente
        CapacitorStorage.removeItem(STORAGE_KEY).catch(() => {});
      },

      // ── Helpers internos ──────────────────────────────────────────────────

      /**
       * Carrega o perfil do usuário do banco e atualiza as flags derivadas.
       * Em caso de erro, faz logout defensivo.
       */
      _loadProfile: async (userId) => {
        try {
          const { data, error } = await supabase
            .from('usuarios')
            .select('id, role, nome_completo, cpf, email, senha_alterada')
            .eq('id', userId)
            .single();

          if (error) throw error;

          set({
            profile:            data,
            isAuthenticated:    true,
            isSuperAdmin:       data.role === 'superadmin',
            isMecanico:         data.role === 'mecanico',
            mustChangePassword: data.senha_alterada === false,
          });

        } catch (err) {
          console.error('[Auth] Erro em _loadProfile:', err.message);
          get()._forceLogoutAndReady();
        }
      },

      /**
       * Limpa o estado de autenticação sem fazer signOut no Supabase.
       * Usado internamente pelo listener onAuthStateChange.
       */
      _clearAuthState: () => {
        set({
          session:            null,
          profile:            null,
          isAuthenticated:    false,
          isSuperAdmin:       false,
          isMecanico:         false,
          mustChangePassword: false,
          lastActivity:       null,
          showSecurityAlert:  false,
        });
      },

      /**
       * Logout forçado + marca isReady.
       * Usado pelo safetyTimeout e por erros críticos no initAuth,
       * garantindo que o app nunca fique preso na tela de loading.
       */
      _forceLogoutAndReady: () => {
        get()._clearAuthState();
        set({ isReady: true, _authInitialized: false });
        CapacitorStorage.removeItem(STORAGE_KEY).catch(() => {});
      },

      clearAuthError: () => set({ authError: null }),

    }),

    // ── Configuração de persistência ──────────────────────────────────────
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => CapacitorStorage),

      // Apenas estes campos são gravados no storage nativo
      partialize: (state) => ({
        profile:            state.profile,
        isAuthenticated:    state.isAuthenticated,
        isSuperAdmin:       state.isSuperAdmin,
        isMecanico:         state.isMecanico,
        mustChangePassword: state.mustChangePassword,
        lastActivity:       state.lastActivity,
      }),

      /**
       * Chamado pelo Zustand após a leitura (assíncrona) do storage.
       *
       * IMPORTANTE: No Android, esta callback é invocada de forma assíncrona
       * após o Capacitor Preferences responder. Por isso, usamos a flag
       * `_rehydrated` para sincronizar com o initAuth via waitForRehydration().
       *
       * Resetamos campos voláteis (session, isReady etc.) para que o initAuth
       * sempre valide a sessão no Supabase — nunca confia apenas no cache.
       */
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[Auth] Erro na rehidratação do storage:', error);
        }

        if (state) {
          // Campos voláteis: sempre recalculados pelo initAuth
          state.session           = null;
          state.isReady           = false;
          state.isLoading         = false;
          state.authError         = null;
          state.showSecurityAlert = false;
          state._authInitialized  = false;

          // Sinaliza que a leitura assíncrona do storage concluiu
          // (mesmo que state seja parcial, o Zustand já aplicou o que havia)
          state._rehydrated = true;
        } else {
          // Storage vazio ou corrompido — sinaliza rehidratação como concluída
          // para não bloquear o waitForRehydration indefinidamente
          useAuthStore.setState({ _rehydrated: true });
        }
      },
    }
  )
);

export default useAuthStore;