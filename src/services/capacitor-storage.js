// src/services/capacitor-storage.js

import { Preferences } from '@capacitor/preferences';

/**
 * Cache em memória: ÚNICA fonte de verdade durante a execução do app.
 * Após o warmup, todas as leituras são instantâneas e síncronas,
 * isolando completamente o Supabase Auth da ponte assíncrona do Android.
 */
const memoryCache = new Map();

/**
 * Pré-carrega TODAS as chaves do Capacitor Preferences para o memoryCache
 * antes de qualquer módulo consumidor (supabase.js, authStore.js) ser instanciado.
 *
 * Deve ser chamado em main.jsx com `await warmupStorage()` antes do
 * `import('./App.jsx')`.
 *
 * @returns {Promise<void>}
 */
export async function warmupStorage() {
  try {
    const { keys } = await Preferences.keys();
    if (!keys || keys.length === 0) return;

    const results = await Promise.allSettled(
      keys.map(async (key) => {
        const result = await Preferences.get({ key });
        if (result?.value != null) {
          memoryCache.set(key, result.value);
        }
      })
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      console.warn(
        `[CapacitorStorage] warmup: ${failed} chave(s) falharam ao carregar.`
      );
    }
  } catch (err) {
    // Warmup falhou (ex: ambiente web sem Capacitor). O app continua sem cache.
    console.warn('[CapacitorStorage] warmup falhou:', err.message);
  }
}

/**
 * Adaptador de storage para Zustand persist e Supabase Auth.
 *
 * getItem  → SÍNCRONO via memoryCache (zero latência, zero ponte nativa).
 * setItem  → atualiza cache imediatamente + persiste em background (fire-and-forget).
 * removeItem → remove do cache imediatamente + persiste em background.
 */
export const CapacitorStorage = {
  /**
   * Leitura SÍNCRONA do cache em memória.
   * Supabase Auth chama getItem na inicialização; com esta implementação
   * a resposta é instantânea e nunca bloqueia a ponte nativa do Android.
   *
   * @param {string} key
   * @returns {string | null}
   */
  getItem: (key) => {
    return memoryCache.get(key) ?? null;
  },

  /**
   * @param {string} key
   * @param {string} value
   * @returns {Promise<void>}
   */
  setItem: async (key, value) => {
    const strValue = String(value);
    // Atualiza cache imediatamente para que leituras subsequentes sejam instantâneas
    memoryCache.set(key, strValue);
    // Persiste em background — falhas não afetam o estado em memória
    Preferences.set({ key, value: strValue }).catch((err) => {
      console.warn('[CapacitorStorage] Falha ao persistir no nativo:', err.message);
    });
  },

  /**
   * @param {string} key
   * @returns {Promise<void>}
   */
  removeItem: async (key) => {
    // Remove do cache imediatamente
    memoryCache.delete(key);
    // Remove do storage nativo em background
    Preferences.remove({ key }).catch((err) => {
      console.warn('[CapacitorStorage] Falha ao remover do nativo:', err.message);
    });
  },
};
