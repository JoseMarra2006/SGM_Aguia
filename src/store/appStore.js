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

/**
 * appStore — Estado global da aplicação.
 *
 * Responsabilidades:
 *  1. Status da rede (online/offline)
 *  2. Filas de dados pendentes de sincronização
 *  3. Timers de OS em andamento (início conhecido, duração calculada no cliente)
 *  4. Estado de sincronização (em progresso, último erro, último sucesso)
 */

const useAppStore = create(
  subscribeWithSelector((set, get) => ({
    // ─────────────────────────────────────────
    // ESTADO: Rede
    // ─────────────────────────────────────────
    isOnline: true,

    setOnline: (status) => set({ isOnline: status }),

    // ─────────────────────────────────────────
    // ESTADO: Filas Offline
    // ─────────────────────────────────────────

    /** @type {import('../services/storage').QueueItem[]} */
    checklistQueue: [],

    /** @type {import('../services/storage').QueueItem[]} */
    osQueue: [],

    /**
     * Carrega as filas do storage local para a memória.
     * Deve ser chamado uma vez na inicialização do app (App.jsx).
     */
    loadQueuesFromStorage: async () => {
      const [checklistQueue, osQueue] = await Promise.all([
        getChecklistQueue(),
        getOSQueue(),
      ]);
      set({ checklistQueue, osQueue });
    },

    /**
     * Adiciona um checklist à fila offline (memória + disco).
     * @param {import('../services/storage').QueueItem} item
     */
    addChecklistToQueue: async (item) => {
      await enqueueChecklist(item);
      set((state) => ({
        checklistQueue: [...state.checklistQueue, { ...item, attempts: 0, error: null }],
      }));
    },

    /**
     * Adiciona uma OS à fila offline (memória + disco).
     * @param {import('../services/storage').QueueItem} item
     */
    addOSToQueue: async (item) => {
      await enqueueOS(item);
      set((state) => ({
        osQueue: [...state.osQueue, { ...item, attempts: 0, error: null }],
      }));
    },

    /**
     * Remove um checklist sincronizado da fila (memória + disco).
     * @param {string} localId
     */
    removeChecklistFromQueue: async (localId) => {
      await dequeueChecklist(localId);
      set((state) => ({
        checklistQueue: state.checklistQueue.filter((i) => i.localId !== localId),
      }));
    },

    /**
     * Remove uma OS sincronizada da fila (memória + disco).
     * @param {string} localId
     */
    removeOSFromQueue: async (localId) => {
      await dequeueOS(localId);
      set((state) => ({
        osQueue: state.osQueue.filter((i) => i.localId !== localId),
      }));
    },

    /** Retorna total de itens pendentes de sincronização. */
    get pendingCount() {
      const { checklistQueue, osQueue } = get();
      return checklistQueue.length + osQueue.length;
    },

    // ─────────────────────────────────────────
    // ESTADO: Sincronização
    // ─────────────────────────────────────────
    isSyncing: false,
    lastSyncAt: null,      // Timestamp (ms) da última sync bem-sucedida
    lastSyncError: null,   // Mensagem do último erro de sync

    setSyncing: (status) => set({ isSyncing: status }),

    setSyncSuccess: async () => {
      await setLastSyncAt();
      set({ lastSyncAt: Date.now(), lastSyncError: null, isSyncing: false });
    },

    setSyncError: (message) =>
      set({ lastSyncError: message, isSyncing: false }),

    loadLastSyncAt: async () => {
      const lastSyncAt = await getLastSyncAt();
      set({ lastSyncAt });
    },

    // ─────────────────────────────────────────
    // ESTADO: Timers de OS em andamento
    // Os timers são rastreados como { [osId]: inicioEmMs }
    // O tempo decorrido é calculado em runtime: Date.now() - inicioEmMs
    // O osId é o ID real do Supabase (não o localId).
    // ─────────────────────────────────────────

    /** @type {Record<string, number>} */
    activeTimers: {},

    /**
     * Registra o início de um timer para uma OS.
     * @param {string} osId       - ID da OS no Supabase
     * @param {number} inicioEm   - Timestamp de início em ms (vindos do campo inicio_em do servidor)
     */
    startTimer: (osId, inicioEm) => {
      set((state) => ({
        activeTimers: { ...state.activeTimers, [osId]: inicioEm },
      }));
    },

    /**
     * Remove o timer de uma OS finalizada.
     * @param {string} osId
     */
    stopTimer: (osId) => {
      set((state) => {
        const { [osId]: _, ...rest } = state.activeTimers;
        return { activeTimers: rest };
      });
    },

    /**
     * Retorna o tempo decorrido em segundos para uma OS,
     * ou null se não houver timer ativo.
     * @param {string} osId
     * @returns {number|null}
     */
    getElapsedSeconds: (osId) => {
      const inicio = get().activeTimers[osId];
      if (!inicio) return null;
      return Math.floor((Date.now() - inicio) / 1000);
    },

    /**
     * Restaura os timers de todas as OS em andamento.
     * Deve ser chamado no boot do app buscando OS com status 'em_andamento'
     * do Supabase ou da fila local.
     * @param {Array<{id: string, inicio_em: string}>} ordensAtivas
     */
    restoreTimers: (ordensAtivas) => {
      const timers = {};
      for (const os of ordensAtivas) {
        timers[os.id] = new Date(os.inicio_em).getTime();
      }
      set({ activeTimers: timers });
    },
  }))
);

export default useAppStore;