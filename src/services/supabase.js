// src/services/supabase.js

import { createClient } from '@supabase/supabase-js';
import { CapacitorStorage } from './capacitor-storage.js';
import { Capacitor } from '@capacitor/core';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Supabase] Variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não definidas. ' +
    'Crie o arquivo .env na raiz do projeto com esses valores.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persiste a sessão entre reloads do app
    persistSession: true,
    // Detecta automaticamente tokens na URL (OAuth callbacks)
    detectSessionInUrl: false,
    storage: Capacitor.isNativePlatform() ? CapacitorStorage : localStorage,
  },
  global: {
    headers: {
      'x-app-version': import.meta.env.VITE_APP_VERSION ?? '1.0.0',
    },
  },
  // Realtime desativado por padrão para economizar bateria/dados.
  // Ative por canal específico quando necessário.
  realtime: {
    params: {
      eventsPerSecond: 2,
    },
  },
});

/**
 * Utilitário: executa uma query Supabase e lança erro se houver falha.
 * Evita repetição de `if (error) throw error` em todo o codebase.
 *
 * @template T
 * @param {Promise<{ data: T, error: import('@supabase/supabase-js').PostgrestError | null }>} queryPromise
 * @returns {Promise<T>}
 */
export async function queryOrThrow(queryPromise) {
  const { data, error } = await queryPromise;
  if (error) throw error;
  return data;
}
