// src/store/authStore.js

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '../services/supabase';
import { CapacitorStorage } from '../services/capacitor-storage.js';

const INATIVIDADE_LIMITE_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = '@sgm:auth';

/**
 * Aguarda a rehidratação do Zustand ser concluída antes de prosseguir.
 * Como o CapacitorStorage.getItem agora é síncrono (lê do memoryCache),
 * a rehidratação ocorre quase instantaneamente — este guard existe apenas
 * como garantia para casos extremos de inicialização.
 */
const waitForRehydration = (getState) => {
  return new Promise((resolve) => {
    if (getState()._rehydrated) {
      resolve();
      return;
    }

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

      session:            null,
      profile:            null,
      isReady:            false,
      authError:          null,
      isLoading:          false,

      isAuthenticated:    false,
      isSuperAdmin:       false,
      isMecanico:         false,
      mustChangePassword: false,

      lastActivity:       null,
      showSecurityAlert:  false,

      _authInitialized:   false,
      _rehydrated:        false,

      setShowSecurityAlert: (valor) => set({ showSecurityAlert: valor }),

      updateActivity: () => set({ lastActivity: Date.now() }),

      initAuth: () => {
        if (get()._authInitialized) {
          return () => {};
        }
        set({ _authInitialized: true });

        const checkSession = async () => {
          try {
            await waitForRehydration(get);

            const { lastActivity, isAuthenticated } = get();

            if (isAuthenticated && lastActivity) {
              const inativo = Date.now() - lastActivity;
              if (inativo > INATIVIDADE_LIMITE_MS) {
                console.warn('[Auth] Sessão expirada por inatividade.');
                get()._forceLogoutAndReady();
                return;
              }
            }

            const { data: { session }, error } = await supabase.auth.getSession();

            // ESCUDO OFFLINE ABSOLUTO — checkSession:
            // Detecta ausência de rede tanto via navigator.onLine quanto via
            // erros de fetch que o Supabase propaga ao tentar validar o token.
            // Se o dispositivo está offline E o Zustand já tem um utilizador
            // autenticado reidratado, ignoramos completamente o resultado do
            // Supabase e avançamos com o cache — sem logout, sem limpeza.
            const isOffline = !navigator.onLine || (error && error.message?.includes('fetch'));
            if (isOffline && get().isAuthenticated) {
              console.warn('[Auth] Offline: A usar sessão reidratada.');
              return;
            }

            if (error) throw error;

            if (session) {
              set({ session });
              await get()._loadProfile(session.user.id);
            } else if (isAuthenticated) {
              console.warn('[Auth] Sem sessão ativa no Supabase. Limpando cache.');
              get()._forceLogoutAndReady();
              return;
            }
          } catch (err) {
            // ESCUDO OFFLINE ABSOLUTO — catch:
            // Erros de rede (fetch failed, SSL timeout, ERR_NAME_NOT_RESOLVED)
            // não devem disparar logout quando há um utilizador autenticado em
            // cache. Registamos o erro e deixamos o finally definir isReady.
            if (!navigator.onLine && get().isAuthenticated) {
              console.warn('[Auth] Offline: Erro de rede ignorado, mantendo cache.', err.message);
              return;
            }
            console.error('[Auth] Erro ao recuperar sessão:', err.message);
            get()._forceLogoutAndReady();
            return;
          } finally {
            set({ isReady: true });
          }
        };

        checkSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            // Ignora o evento inicial — tratado pelo checkSession acima
            if (event === 'INITIAL_SESSION') return;

            // CORREÇÃO CRÍTICA: O Supabase emite 'SIGNED_IN' quando recupera
            // a sessão do storage assíncrono DEPOIS do checkSession já ter rodado.
            // Antes isso era ignorado pelo guard de isLoading, causando o loop
            // de login. Agora tratamos SIGNED_IN mesmo sem isLoading ativo,
            // mas apenas se o app ainda não estiver autenticado (evita duplicação).
            if (event === 'SIGNED_IN' && session) {
              // Se já está autenticado com este utilizador, ignora (evita re-render desnecessário)
              if (get().isAuthenticated && get().session?.user?.id === session.user.id) {
                return;
              }
              set({ session });
              await get()._loadProfile(session.user.id);
              get().updateActivity();
              // Garante que isReady seja true caso checkSession já tenha terminado sem sessão
              if (!get().isReady) {
                set({ isReady: true });
              }
              return;
            }

            // TOKEN_REFRESHED: atualiza a sessão silenciosamente sem re-carregar perfil
            if (event === 'TOKEN_REFRESHED' && session) {
              set({ session });
              return;
            }

            if (get().isLoading) return;

            if (session) {
              set({ session });
              await get()._loadProfile(session.user.id);
              get().updateActivity();
            } else {
              // ESCUDO OFFLINE ABSOLUTO — onAuthStateChange:
              // O Supabase pode emitir eventos destrutivos (SIGNED_OUT, USER_DELETED,
              // sessão nula) quando falha em renovar o token sem rede. Bloqueamos
              // qualquer limpeza de estado enquanto o dispositivo estiver offline,
              // protegendo profile, isAuthenticated e isSuperAdmin reidratados.
              if (!navigator.onLine) {
                console.warn('[Auth] Offline: Ignorando evento destrutivo do Supabase.');
                return;
              }

              if (event === 'SIGNED_OUT') {
                get()._clearAuthState();
              }
            }
          }
        );

        return () => {
          subscription.unsubscribe();
        };
      },

      loginWithCPF: async (cpf, senha) => {
        set({ isLoading: true, authError: null });

        try {
          const cpfLimpo = cpf.replace(/\D/g, '');
          let emailParaLogin = `${cpfLimpo}@aguia.com.br`;

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

      logout: () => {
        supabase.auth.signOut().catch((err) => {
          console.warn('[Auth] Aviso no signOut Supabase:', err.message);
        });

        get()._clearAuthState();

        CapacitorStorage.removeItem(STORAGE_KEY).catch(() => {});
      },

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

      _forceLogoutAndReady: () => {
        get()._clearAuthState();
        set({ isReady: true, _authInitialized: false });
        CapacitorStorage.removeItem(STORAGE_KEY).catch(() => {});
      },

      clearAuthError: () => set({ authError: null }),

    }),

    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => CapacitorStorage),

      partialize: (state) => ({
        profile:            state.profile,
        isAuthenticated:    state.isAuthenticated,
        isSuperAdmin:       state.isSuperAdmin,
        isMecanico:         state.isMecanico,
        mustChangePassword: state.mustChangePassword,
        lastActivity:       state.lastActivity,
      }),

      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[Auth] Erro na rehidratação do storage:', error);
        }

        if (state) {
          state.session           = null;
          state.isReady           = false;
          state.isLoading         = false;
          state.authError         = null;
          state.showSecurityAlert = false;
          state._authInitialized  = false;
          state._rehydrated       = true;
        } else {
          useAuthStore.setState({ _rehydrated: true });
        }
      },
    }
  )
);

export default useAuthStore;