// src/services/capacitor-storage.js

import { Preferences } from '@capacitor/preferences';

/**
 * Força um limite de tempo para evitar que o Android trave uma Promise.
 */
const safePromise = (promise, ms = 3000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout nativo')), ms)
    ),
  ]);
};

/**
 * Cache em memória: permite que getItem() seja respondido de forma
 * pseudo-síncrona na primeira leitura, enquanto o Capacitor carrega
 * do storage nativo em background.
 *
 * Isso resolve o problema do Supabase Auth que lê o token JWT na
 * inicialização e não encontra nada porque o Capacitor ainda não
 * respondeu — fazendo o app agir como se não houvesse sessão.
 */
const memoryCache = new Map();

/**
 * Pré-carrega todas as chaves do Capacitor para o cache em memória.
 * Deve ser chamado o mais cedo possível no boot do app (em main.jsx
 * ou App.jsx, ANTES de criar o cliente Supabase ou o authStore).
 *
 * Retorna uma Promise que resolve quando o cache está aquecido.
 */
export async function warmupStorage() {
  try {
    const { keys } = await safePromise(Preferences.keys());
    if (!keys || keys.length === 0) return;

    const results = await Promise.allSettled(
      keys.map(async (key) => {
        const result = await safePromise(Preferences.get({ key }));
        if (result?.value != null) {
          memoryCache.set(key, result.value);
        }
      })
    );

    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      console.warn(`[CapacitorStorage] warmup: ${failed} chave(s) falharam ao carregar.`);
    }
  } catch (err) {
    console.warn('[CapacitorStorage] warmup falhou:', err.message);
  }
}

/**
 * Adaptador de storage para Zustand persist e Supabase Auth.
 *
 * getItem: responde IMEDIATAMENTE do cache em memória (síncrono-like),
 * evitando race conditions na inicialização do Supabase Auth no Android.
 *
 * setItem/removeItem: persiste no Capacitor E atualiza o cache.
 */
export const CapacitorStorage = {
  /**
   * @returns {Promise<string | null>}
   */
  getItem: async (key) => {
    // 1. Responde do cache em memória imediatamente se disponível
    if (memoryCache.has(key)) {
      return memoryCache.get(key);
    }

    // 2. Fallback: busca direto do Capacitor (ex: primeira leitura antes do warmup)
    try {
      const result = await safePromise(Preferences.get({ key }));
      const value = result?.value ?? null;
      if (value != null) {
        memoryCache.set(key, value);
      }
      return value;
    } catch (error) {
      console.warn('[CapacitorStorage] Falha ao recuperar dado nativo:', error.message);
      return null;
    }
  },

  /**
   * @returns {Promise<void>}
   */
  setItem: async (key, value) => {
    const strValue = String(value);
    // Atualiza cache imediatamente para leituras subsequentes
    memoryCache.set(key, strValue);
    try {
      await safePromise(Preferences.set({ key, value: strValue }));
    } catch (error) {
      console.warn('[CapacitorStorage] Falha ao salvar dado nativo:', error.message);
    }
  },

  /**
   * @returns {Promise<void>}
   */
  removeItem: async (key) => {
    // Remove do cache imediatamente
    memoryCache.delete(key);
    try {
      await safePromise(Preferences.remove({ key }));
    } catch (error) {
      console.warn('[CapacitorStorage] Falha ao remover dado nativo:', error.message);
    }
  },
};
