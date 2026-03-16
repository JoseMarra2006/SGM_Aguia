// src/store/authStore.js

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '../services/supabase';

// ─── Constantes ────────────────────────────────────────────────────────────────
const INATIVIDADE_LIMITE_MS = 24 * 60 * 60 * 1000; // 24 horas em ms
const STORAGE_KEY = '@sgm:auth';                    // chave no localStorage

// ─── Store com persistência ───────────────────────────────────────────────────
//
// ARQUITETURA DE PERSISTÊNCIA:
//  • O middleware `persist` salva no localStorage apenas os campos de
//    `partialize`: profile, isAuthenticated, isSuperAdmin, isMecanico,
//    mustChangePassword e lastActivity.
//
//  • A sessão JWT NÃO é persistida aqui — o Supabase já faz isso via
//    `persistSession: true` no cliente (supabase.js). O Zustand persist
//    guarda somente o estado da UI (perfil, roles) para evitar flash de
//    tela de login ao reabrir o app.
//
//  • isReady NUNCA é persistido. Começa false em todo boot e vira true
//    apenas após initAuth validar a sessão Supabase em tempo real.
//    Isso garante que o estado reidratado não "atropele" a verificação real.
//
// FLUXO DE REIDRATAÇÃO (app abre):
//  1. Zustand reidrata profile/isAuthenticated do localStorage
//  2. isReady = false → SplashScreen exibida
//  3. initAuth roda → checa inatividade de 24h → verifica token Supabase
//  4a. Tudo ok → isReady = true → /dashboard (sem tela de login)
//  4b. Inativo > 24h OU token inválido → logout → isReady = true → /login
//
// SEGURANÇA MULTI-USUÁRIO:
//  • logout() chama localStorage.removeItem(STORAGE_KEY), garantindo que
//    nenhum dado do usuário anterior persista para o próximo.

const useAuthStore = create(
  persist(
    (set, get) => ({

      // ─── Estado ──────────────────────────────────────────────────────────────
      session:            null,
      profile:            null,
      isReady:            false,   // NUNCA persistido — recalculado no boot
      authError:          null,
      isLoading:          false,

      isAuthenticated:    false,
      isSuperAdmin:       false,
      isMecanico:         false,
      mustChangePassword: false,

      // Timestamp da última atividade confirmada — persistido para checar 24h
      lastActivity:       null,

      // Flag interna de idempotência (não persistida)
      _authInitialized:   false,

      // ─── Atualiza timestamp de atividade ────────────────────────────────────
      // Chamar sempre que o usuário realizar uma ação significativa.
      // Já é chamado automaticamente por loginWithCPF e changePassword.
      updateActivity: () => set({ lastActivity: Date.now() }),

      // ─── initAuth ────────────────────────────────────────────────────────────
      // Chamado UMA vez no AppInitializer (App.jsx). Retorna cleanup.
      initAuth: () => {
        if (get()._authInitialized) {
          return () => {};
        }
        set({ _authInitialized: true });

        // Failsafe: libera a UI após 3s caso o Supabase não responda
        const safetyTimeout = setTimeout(() => {
          if (!get().isReady) {
            console.warn('[Auth] safetyTimeout acionado — forçando isReady=true.');
            set({ isReady: true });
          }
        }, 3000);

        const checkSession = async () => {
          try {
            // ── 1. Checa inatividade de 24h ──────────────────────────────────
            // Feito ANTES de qualquer outra verificação para garantir que
            // sessões antigas sejam descartadas mesmo com token Supabase válido.
            const { lastActivity, isAuthenticated } = get();
            if (isAuthenticated && lastActivity) {
              const inativo = Date.now() - lastActivity;
              if (inativo > INATIVIDADE_LIMITE_MS) {
                console.warn('[Auth] Sessão expirada por inatividade (>24h). Fazendo logout.');
                await get().logout();
                return; // isReady será setado no finally
              }
            }

            // ── 2. Verifica sessão ativa no Supabase ─────────────────────────
            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
              set({ session });
              await get()._loadProfile(session.user.id);
            } else if (get().isAuthenticated) {
              // Cache diz autenticado mas Supabase não tem sessão
              // (token expirou com app fechado) → limpa tudo
              console.warn('[Auth] Sessão Supabase inválida. Limpando estado persistido.');
              await get().logout();
            }
          } catch (err) {
            console.error('[Auth] Erro ao recuperar sessão:', err.message);
          } finally {
            clearTimeout(safetyTimeout);
            // isReady só vira true aqui — único lugar no fluxo de init
            set({ isReady: true });
          }
        };

        checkSession();

        // ── Listener reativo pós-inicialização ───────────────────────────────
        // Ignora INITIAL_SESSION (tratado por checkSession) e eventos
        // durante loginWithCPF (isLoading=true).
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            if (event === 'INITIAL_SESSION') return;
            if (get().isLoading) return;

            console.log('[Auth] onAuthStateChange:', event);

            if (session) {
              set({ session });
              await get()._loadProfile(session.user.id);
              get().updateActivity();
            } else {
              // SIGNED_OUT / token expirado: reset completo
              set({
                session:            null,
                profile:            null,
                isAuthenticated:    false,
                isSuperAdmin:       false,
                isMecanico:         false,
                mustChangePassword: false,
                lastActivity:       null,
              });
            }
          }
        );

        return () => {
          subscription.unsubscribe();
          clearTimeout(safetyTimeout);
        };
      },

      // ─── loginWithCPF ────────────────────────────────────────────────────────
      loginWithCPF: async (cpf, senha) => {
        set({ isLoading: true, authError: null });

        try {
          const { data: emailData, error: emailError } = await supabase
            .rpc('fn_email_por_cpf', { p_cpf: cpf.replace(/\D/g, '') });

          if (emailError || !emailData) {
            throw new Error('CPF não encontrado no sistema.');
          }

          const { data, error: loginError } = await supabase.auth.signInWithPassword({
            email:    emailData,
            password: senha,
          });

          if (loginError) {
            throw new Error('CPF ou senha incorretos.');
          }

          // Salva sessão e registra atividade imediatamente após login
          set({ session: data.session, lastActivity: Date.now() });

          await get()._loadProfile(data.user.id);

          if (!get().profile) {
            await supabase.auth.signOut();
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

      // ─── changePassword ──────────────────────────────────────────────────────
      changePassword: async (novaSenha) => {
        set({ isLoading: true, authError: null });

        try {
          const { data: updatedAuth, error: authError } = await supabase.auth.updateUser({ password: novaSenha });
          if (authError) throw authError;

          // Prioriza o id retornado pelo updateUser — garantido mesmo com
          // isLoading=true bloqueando o onAuthStateChange (primeiro acesso)
          const userId = updatedAuth?.user?.id ?? get().session?.user?.id;
          if (!userId) throw new Error('Sessão não encontrada. Faça login novamente.');

          const { error: dbError } = await supabase
            .from('usuarios')
            .update({ senha_alterada: true })
            .eq('id', userId);
          if (dbError) throw dbError;

          // Atualiza perfil e registra atividade após troca de senha
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

      // ─── logout ──────────────────────────────────────────────────────────────
      // Limpa estado em memória E remove o cache persistido do localStorage.
      // Essencial para multi-usuário: o próximo usuário começa do zero.
      logout: async () => {
        try {
          await supabase.auth.signOut();
        } catch (err) {
          // Ignora falhas de rede — o que importa é limpar o estado local
          console.warn('[Auth] Erro no signOut Supabase:', err.message);
        }

        // Reset completo do estado em memória
        set({
          session:            null,
          profile:            null,
          authError:          null,
          isAuthenticated:    false,
          isSuperAdmin:       false,
          isMecanico:         false,
          mustChangePassword: false,
          lastActivity:       null,
          _authInitialized:   false,
        });

        // Remove o cache do localStorage — garante que o próximo
        // usuário não herde nenhum dado do anterior
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch (err) {
          console.warn('[Auth] Erro ao limpar cache persistido:', err.message);
        }
      },

      // ─── _loadProfile (interno) ──────────────────────────────────────────────
      // NÃO toca em: isReady, isLoading
      _loadProfile: async (userId) => {
        try {
          const { data, error } = await supabase
            .from('usuarios')
            .select('id, role, nome_completo, cpf, email, senha_alterada')
            .eq('id', userId)
            .single();

          if (error) {
            console.error('[Auth] Falha ao carregar perfil:', error.message);
            set({
              session:            null,
              profile:            null,
              isAuthenticated:    false,
              isSuperAdmin:       false,
              isMecanico:         false,
              mustChangePassword: false,
              lastActivity:       null,
            });
            return;
          }

          set({
            profile:            data,
            isAuthenticated:    true,
            isSuperAdmin:       data.role === 'superadmin',
            isMecanico:         data.role === 'mecanico',
            mustChangePassword: data.senha_alterada === false,
          });

        } catch (err) {
          console.error('[Auth] Erro inesperado em _loadProfile:', err.message);
          set({
            isAuthenticated:    false,
            isSuperAdmin:       false,
            isMecanico:         false,
            mustChangePassword: false,
            lastActivity:       null,
          });
        }
      },

      // ─── Utilitários ─────────────────────────────────────────────────────────
      clearAuthError: () => set({ authError: null }),

    }),

    // ─── Configuração do middleware persist ─────────────────────────────────────
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),

      // Apenas estes campos são gravados no localStorage.
      // NUNCA persistir: isReady, isLoading, authError, session, _authInitialized
      partialize: (state) => ({
        profile:            state.profile,
        isAuthenticated:    state.isAuthenticated,
        isSuperAdmin:       state.isSuperAdmin,
        isMecanico:         state.isMecanico,
        mustChangePassword: state.mustChangePassword,
        lastActivity:       state.lastActivity,
      }),

      // Hook pós-reidratação: garante que campos voláteis nunca venham do cache.
      // Chamado assim que o persist termina de ler o localStorage.
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isReady          = false;
          state.isLoading        = false;
          state.authError        = null;
          state.session          = null;
          state._authInitialized = false;
        }
      },
    }
  )
);

export default useAuthStore;
