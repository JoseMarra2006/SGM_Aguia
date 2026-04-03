// src/services/capacitor-storage.js

import { Preferences } from '@capacitor/preferences';

/**
 * Força um limite de tempo para evitar que o Android trave uma Promise.
 * Aumentado para 3s para dar margem extra em dispositivos lentos.
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
 * Adaptador de storage para Capacitor Preferences.
 *
 * IMPORTANTE: O Zustand's createJSONStorage espera que getItem/setItem/removeItem
 * retornem Promises (interface StateStorage assíncrona). Esta implementação
 * satisfaz essa interface corretamente para uso nativo no Android/iOS.
 *
 * NÃO use este objeto diretamente como substituto do localStorage — ele é
 * assíncrono e deve ser usado apenas via createJSONStorage do Zustand.
 */
export const CapacitorStorage = {
  /**
   * Retorna o valor associado à chave, ou null se não existir / falhar.
   * @returns {Promise<string | null>}
   */
  getItem: async (key) => {
    try {
      const result = await safePromise(Preferences.get({ key }));
      // Preferences.get retorna { value: string | null }
      return result?.value ?? null;
    } catch (error) {
      console.warn('[CapacitorStorage] Falha ao recuperar dado nativo:', error.message);
      return null;
    }
  },

  /**
   * Persiste um valor string associado à chave.
   * @returns {Promise<void>}
   */
  setItem: async (key, value) => {
    try {
      await safePromise(Preferences.set({ key, value: String(value) }));
    } catch (error) {
      console.warn('[CapacitorStorage] Falha ao salvar dado nativo:', error.message);
    }
  },

  /**
   * Remove o valor associado à chave.
   * @returns {Promise<void>}
   */
  removeItem: async (key) => {
    try {
      await safePromise(Preferences.remove({ key }));
    } catch (error) {
      console.warn('[CapacitorStorage] Falha ao remover dado nativo:', error.message);
    }
  },
};