// src/services/storage.js

import { Preferences } from '@capacitor/preferences';

/**
 * Wrapper tipado sobre @capacitor/preferences.
 *
 * Todas as funções serializam/desserializam JSON automaticamente,
 * permitindo salvar objetos complexos (não apenas strings).
 *
 * Chaves reservadas do sistema (prefixo '@mnt:'):
 *   @mnt:offline_queue_checklists   → fila de checklists pendentes
 *   @mnt:offline_queue_os           → fila de ordens de serviço pendentes
 *   @mnt:last_sync_at               → timestamp da última sincronização
 */

// ─────────────────────────────────────────────────────────────
// OPERAÇÕES BÁSICAS
// ─────────────────────────────────────────────────────────────

/**
 * Salva um valor (qualquer tipo serializável) em uma chave.
 * @param {string} key
 * @param {*} value
 */
export async function setItem(key, value) {
  await Preferences.set({
    key,
    value: JSON.stringify(value),
  });
}

/**
 * Recupera um valor pela chave. Retorna null se não encontrado.
 * @param {string} key
 * @returns {Promise<*>}
 */
export async function getItem(key) {
  const { value } = await Preferences.get({ key });
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    // Valor foi salvo como string simples (sem JSON.stringify)
    return value;
  }
}

/**
 * Remove uma chave do armazenamento.
 * @param {string} key
 */
export async function removeItem(key) {
  await Preferences.remove({ key });
}

/**
 * Retorna todas as chaves armazenadas.
 * @returns {Promise<string[]>}
 */
export async function getAllKeys() {
  const { keys } = await Preferences.keys();
  return keys;
}

/**
 * Limpa TODO o armazenamento local. Use com cautela.
 */
export async function clearAll() {
  await Preferences.clear();
}

// ─────────────────────────────────────────────────────────────
// GERENCIAMENTO DE FILAS OFFLINE
// Cada item da fila possui um `localId` (uuid gerado no cliente)
// para controle de idempotência e rastreabilidade.
// ─────────────────────────────────────────────────────────────

const QUEUE_KEYS = {
  CHECKLISTS: '@mnt:offline_queue_checklists',
  OS: '@mnt:offline_queue_os',
  LAST_SYNC: '@mnt:last_sync_at',
};

/**
 * @typedef {Object} QueueItem
 * @property {string} localId     - ID único gerado no cliente (crypto.randomUUID)
 * @property {string} type        - 'checklist_completo' | 'os_completa' | 'checklist_resposta' | etc.
 * @property {*}      payload     - Dados a serem enviados ao Supabase
 * @property {number} createdAt   - Timestamp de criação (ms)
 * @property {number} attempts    - Quantas vezes tentou enviar (para backoff)
 * @property {string|null} error  - Último erro ao tentar enviar
 */

/**
 * Adiciona um item à fila offline de checklists.
 * @param {Omit<QueueItem, 'attempts' | 'error'>} item
 */
export async function enqueueChecklist(item) {
  const queue = await getChecklistQueue();
  queue.push({ ...item, attempts: 0, error: null });
  await setItem(QUEUE_KEYS.CHECKLISTS, queue);
}

/**
 * Adiciona um item à fila offline de Ordens de Serviço.
 * @param {Omit<QueueItem, 'attempts' | 'error'>} item
 */
export async function enqueueOS(item) {
  const queue = await getOSQueue();
  queue.push({ ...item, attempts: 0, error: null });
  await setItem(QUEUE_KEYS.OS, queue);
}

/**
 * Retorna todos os itens da fila de checklists.
 * @returns {Promise<QueueItem[]>}
 */
export async function getChecklistQueue() {
  return (await getItem(QUEUE_KEYS.CHECKLISTS)) ?? [];
}

/**
 * Retorna todos os itens da fila de Ordens de Serviço.
 * @returns {Promise<QueueItem[]>}
 */
export async function getOSQueue() {
  return (await getItem(QUEUE_KEYS.OS)) ?? [];
}

/**
 * Remove um item da fila de checklists pelo localId.
 * Chamado após sincronização bem-sucedida.
 * @param {string} localId
 */
export async function dequeueChecklist(localId) {
  const queue = await getChecklistQueue();
  await setItem(
    QUEUE_KEYS.CHECKLISTS,
    queue.filter((item) => item.localId !== localId)
  );
}

/**
 * Remove um item da fila de OS pelo localId.
 * @param {string} localId
 */
export async function dequeueOS(localId) {
  const queue = await getOSQueue();
  await setItem(
    QUEUE_KEYS.OS,
    queue.filter((item) => item.localId !== localId)
  );
}

/**
 * Incrementa o contador de tentativas e registra o último erro
 * em um item da fila (útil para backoff exponencial).
 * @param {'checklists'|'os'} queueType
 * @param {string} localId
 * @param {string} errorMessage
 */
export async function markAttemptFailed(queueType, localId, errorMessage) {
  const key = queueType === 'checklists' ? QUEUE_KEYS.CHECKLISTS : QUEUE_KEYS.OS;
  const queue = await getItem(key) ?? [];
  const updated = queue.map((item) =>
    item.localId === localId
      ? { ...item, attempts: item.attempts + 1, error: errorMessage }
      : item
  );
  await setItem(key, updated);
}

/**
 * Salva o timestamp da última sincronização bem-sucedida.
 */
export async function setLastSyncAt() {
  await setItem(QUEUE_KEYS.LAST_SYNC, Date.now());
}

/**
 * Retorna o timestamp da última sincronização.
 * @returns {Promise<number|null>}
 */
export async function getLastSyncAt() {
  return getItem(QUEUE_KEYS.LAST_SYNC);
}

export { QUEUE_KEYS };