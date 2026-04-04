// src/store/appStore.js

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  getChecklistQueue,
  getOSQueue,
  enqueueChecklist,
  enqueueOS,
  dequeueChecklist,
  dequeueOS,
  getLastSyncAt,
  setLastSyncAt,
} from '../services/storage';
import {
  fetchNotificacoes,
  marcarComoLida,
  marcarTodasComoLidas,
} from '../services/notifications';

/**
 * appStore — Estado global da aplicação.
 *
 * Responsabilidades:
 *  1. Status da rede (online/offline)
 *  2. Filas de dados pendentes de sincronização
 *  3. Timers de OS em andamento
 *  4. Estado de sincronização
 *  5. Sistema de notificações
 */

const useAppStore = create(
  subscribeWithSelector((set, get) => ({

    // ─────────────────────────────────────────
    // ESTADO: Rede
    // ─────────────────────────────────────────

    /**
     * Inicializado com navigator.onLine para que o valor já seja correto
     * no primeiro render, antes de qualquer evento do Capacitor Network.
     * Atualizado em tempo real pelo NetworkHandler em App.jsx.
     */
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

    /** @param {boolean} status */
    setIsOnline: (status) => set({ isOnline: status }),

    // ─────────────────────────────────────────
    // ESTADO: Filas Offline
    // ─────────────────────────────────────────

    /** @type {import('../services/storage').QueueItem[]} */
    checklistQueue: [],

    /** @type {import('../services/storage').QueueItem[]} */
    osQueue: [],

    loadQueuesFromStorage: async () => {
      const [checklistQueue, osQueue] = await Promise.all([
        getChecklistQueue(),
        getOSQueue(),
      ]);
      set({
        checklistQueue: checklistQueue.map(i => ({ ...i, attempts: 0 })),
        osQueue:        osQueue.map(i => ({ ...i, attempts: 0 })),
      });
    },

    addChecklistToQueue: async (item) => {
      await enqueueChecklist(item);
      set((state) => ({
        checklistQueue: [...state.checklistQueue, { ...item, attempts: 0, error: null }],
      }));
    },

    addOSToQueue: async (item) => {
      await enqueueOS(item);
      set((state) => ({
        osQueue: [...state.osQueue, { ...item, attempts: 0, error: null }],
      }));
    },

    removeChecklistFromQueue: async (localId) => {
      await dequeueChecklist(localId);
      set((state) => ({
        checklistQueue: state.checklistQueue.filter((i) => i.localId !== localId),
      }));
    },

    removeOSFromQueue: async (localId) => {
      await dequeueOS(localId);
      set((state) => ({
        osQueue: state.osQueue.filter((i) => i.localId !== localId),
      }));
    },

    get pendingCount() {
      const { checklistQueue, osQueue } = get();
      return checklistQueue.length + osQueue.length;
    },

    // ─────────────────────────────────────────
    // ESTADO: Sincronização
    // ─────────────────────────────────────────
    isSyncing:     false,
    lastSyncAt:    null,
    lastSyncError: null,

    setSyncing:   (status) => set({ isSyncing: status }),
    setSyncError: (msg)    => set({ lastSyncError: msg, isSyncing: false }),

    setSyncSuccess: async () => {
      await setLastSyncAt();
      set({ lastSyncAt: Date.now(), lastSyncError: null, isSyncing: false });
    },

    loadLastSyncAt: async () => {
      const lastSyncAt = await getLastSyncAt();
      set({ lastSyncAt });
    },

    // ─────────────────────────────────────────
    // ESTADO: Timers de OS em andamento
    // ─────────────────────────────────────────

    /** @type {Record<string, number>} */
    activeTimers: {},

    startTimer: (osId, inicioEm) => {
      set((state) => ({
        activeTimers: { ...state.activeTimers, [osId]: inicioEm },
      }));
    },

    stopTimer: (osId) => {
      set((state) => {
        const { [osId]: _, ...rest } = state.activeTimers;
        return { activeTimers: rest };
      });
    },

    getElapsedSeconds: (osId) => {
      const inicio = get().activeTimers[osId];
      if (!inicio) return null;
      return Math.floor((Date.now() - inicio) / 1000);
    },

    restoreTimers: (ordensAtivas) => {
      const timers = {};
      for (const os of ordensAtivas) {
        timers[os.id] = new Date(os.inicio_em).getTime();
      }
      set({ activeTimers: timers });
    },

    // ─────────────────────────────────────────
    // ESTADO: Notificações
    // ─────────────────────────────────────────

    /** @type {object[]}  Lista completa de notificações do usuário logado */
    notifications: [],

    /** Quantidade de notificações não lidas */
    unreadCount: 0,

    /** Controla abertura do painel lateral de notificações */
    notifPanelOpen: false,

    /** true enquanto carrega a lista da primeira vez */
    notifLoading: false,

    // ─── Ações de Notificações ────────────────

    /** Busca notificações do servidor e atualiza o estado. */
    loadNotifications: async (userId) => {
      if (!userId) return;
      set({ notifLoading: true });
      try {
        const data = await fetchNotificacoes(userId, 40);
        const unread = data.filter((n) => !n.lida).length;
        set({ notifications: data, unreadCount: unread, notifLoading: false });
      } catch (err) {
        console.error('[Notif] Erro ao carregar:', err.message);
        set({ notifLoading: false });
      }
    },

    /**
     * Adiciona uma notificação recebida via Realtime ao topo da lista.
     * Chamado pelo subscribeToNotificacoes em Painel.jsx.
     * @param {object} notif
     */
    addNotification: (notif) => {
      set((state) => ({
        notifications: [notif, ...state.notifications].slice(0, 40),
        unreadCount:   state.unreadCount + (notif.lida ? 0 : 1),
      }));
    },

    /** Marca uma notificação como lida (localmente + Supabase). */
    markNotificationRead: async (notifId) => {
      // Optimistic update
      set((state) => {
        const prev    = state.notifications.find((n) => n.id === notifId);
        const wasRead = prev?.lida ?? true;
        return {
          notifications: state.notifications.map((n) =>
            n.id === notifId ? { ...n, lida: true } : n
          ),
          unreadCount: wasRead ? state.unreadCount : Math.max(0, state.unreadCount - 1),
        };
      });
      try {
        await marcarComoLida(notifId);
      } catch (err) {
        console.error('[Notif] Erro ao marcar lida:', err.message);
      }
    },

    /** Marca todas como lidas (localmente + Supabase). */
    markAllNotificationsRead: async (userId) => {
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, lida: true })),
        unreadCount: 0,
      }));
      try {
        await marcarTodasComoLidas(userId);
      } catch (err) {
        console.error('[Notif] Erro ao marcar todas lidas:', err.message);
      }
    },

    /** Abre / fecha o painel de notificações. */
    setNotifPanelOpen: (open) => set({ notifPanelOpen: open }),

    /** Limpa todas as notificações do estado (ao fazer logout). */
    clearNotifications: () => set({ notifications: [], unreadCount: 0, notifPanelOpen: false }),

    // ─────────────────────────────────────────
    // ESTADO: Cache de Equipamentos (Offline-First)
    // ─────────────────────────────────────────

    /**
     * Lista básica de equipamentos (id + nome) persistida localmente.
     * Usada como fallback em NovaOS quando o dispositivo está offline.
     * @type {{ id: string, nome: string }[]}
     */
    equipamentosCache: [],

    /**
     * Sincroniza o cache de equipamentos com o Supabase.
     * Só executa se houver internet. Falhas são silenciosas para não
     * bloquear o fluxo de inicialização da app.
     */
    syncEquipamentosCache: async () => {
      const online = get().isOnline ?? (typeof navigator !== 'undefined' ? navigator.onLine : false);
      if (!online) return;
      try {
        const { supabase } = await import('../services/supabase');
        const { data, error } = await supabase
          .from('equipamentos')
          .select('id, nome')
          .order('nome');
        if (error) throw error;
        if (data) set({ equipamentosCache: data });
      } catch (err) {
        // Silencioso — cache desatualizado é melhor que crash
        console.warn('[appStore] syncEquipamentosCache falhou silenciosamente:', err.message);
      }
    },
  }))
);

export default useAppStore;