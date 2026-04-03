// src/services/capacitor-storage.js
//
// Adaptador de storage assíncrono baseado em @capacitor/preferences.
//
// MOTIVAÇÃO:
//   Em ambiente nativo (Android/iOS via Capacitor), o `localStorage` do
//   WebView pode ser apagado pelo sistema operacional sob pressão de memória,
//   ou simplesmente não persistir entre sessões de forma confiável.
//   @capacitor/preferences usa armazenamento nativo (SharedPreferences no
//   Android, NSUserDefaults no iOS), que é gerenciado pelo SO como dados
//   de aplicativo — muito mais robusto.
//
// COMPATIBILIDADE:
//   • Em ambiente web puro (browser), @capacitor/preferences cai de volta
//     para localStorage automaticamente via fallback interno do Capacitor.
//     Portanto, este adaptador é seguro em qualquer ambiente.
//
// USO:
//   • Supabase client → auth.storage: CapacitorStorage
//   • Zustand persist  → storage: createJSONStorage(() => CapacitorStorage)

import { Preferences } from '@capacitor/preferences';

export const CapacitorStorage = {
  /**
   * Recupera um valor pela chave.
   * @param {string} key
   * @returns {Promise<string | null>}
   */
  getItem: async (key) => {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  },

  /**
   * Grava um valor (deve ser string) para a chave informada.
   * Zustand e Supabase já serializam para string antes de chamar este método.
   * @param {string} key
   * @param {string} value
   * @returns {Promise<void>}
   */
  setItem: async (key, value) => {
    await Preferences.set({ key, value: String(value) });
  },

  /**
   * Remove a entrada associada à chave.
   * @param {string} key
   * @returns {Promise<void>}
   */
  removeItem: async (key) => {
    await Preferences.remove({ key });
  },
};
