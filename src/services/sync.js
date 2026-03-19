// src/services/sync.js

import { Network } from '@capacitor/network';
import { supabase } from './supabase';
import { markAttemptFailed } from './storage';
import useAppStore from '../store/appStore';

/**
 * sync.js — Motor de sincronização Offline → Online
 *
 * Funcionamento:
 *  1. Ao inicializar (initSync), registra listener de rede via @capacitor/network.
 *  2. Quando a conexão volta (connected = true), dispara processQueues().
 *  3. processQueues() percorre ambas as filas e tenta enviar cada item.
 *  4. Itens enviados com sucesso são removidos da fila.
 *  5. Itens com falha incrementam o contador de tentativas.
 *  6. Backoff exponencial: itens com muitas falhas aguardam mais tempo.
 *
 * Estratégia de idempotência:
 *  - Checklists e OS usam `localId` para evitar duplicatas.
 *  - O Supabase usa upsert com base no localId quando possível,
 *    ou INSERT com verificação prévia de existência.
 *
 * Estrutura dos payloads esperados na fila:
 *
 *  type: 'checklist_completo'
 *  payload: {
 *    checklist: { agendamento_id, mecanico_id, obs_geral, fim_em },
 *    respostas: [{ peca_equipamento_id, status_resposta, observacao }],
 *    _meta:     { equip_nome, mec_nome }   ← usado para notificação offline
 *  }
 *
 *  type: 'os_completa'
 *  payload: {
 *    os: { equipamento_id, mecanico_id, solicitante, problema, causa,
 *           hora_parada, servicos_executados, obs, fim_em, status },
 *    pecas: [{ tipo_peca, peca_id, quantidade }]
 *  }
 *
 *  type: 'os_iniciada'
 *  payload: { equipamento_id, mecanico_id, solicitante, problema, hora_parada }
 */

// Número máximo de tentativas antes de desistir temporariamente
const MAX_ATTEMPTS = 5;

// Tempo base de backoff em ms (dobra a cada falha)
const BACKOFF_BASE_MS = 2000;

let networkListenerHandle = null;
let isProcessing = false;

// ─────────────────────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────────────────────

/**
 * Inicializa o sistema de sincronização.
 * Deve ser chamado UMA VEZ no App.jsx após o mount.
 */
export async function initSync() {
  // Verifica estado atual da rede imediatamente
  const status = await Network.getStatus();
  useAppStore.getState().setOnline(status.connected);

  // Se já está online na inicialização, tenta sincronizar imediatamente
  if (status.connected) {
    await processQueues();
  }

  // Registra listener para mudanças futuras de conectividade
  networkListenerHandle = await Network.addListener(
    'networkStatusChange',
    async (status) => {
      console.log('[Sync] Status de rede:', status.connectionType, '| Online:', status.connected);
      useAppStore.getState().setOnline(status.connected);

      if (status.connected) {
        // Pequeno delay para garantir que a conexão está estável
        await sleep(1500);
        await processQueues();
      }
    }
  );

  console.log('[Sync] Sistema de sincronização inicializado.');
}

/**
 * Remove o listener de rede. Chamar ao desmontar o app (raro, mas boas práticas).
 */
export async function destroySync() {
  if (networkListenerHandle) {
    await networkListenerHandle.remove();
    networkListenerHandle = null;
  }
}

// ─────────────────────────────────────────────────────────────
// PROCESSAMENTO DAS FILAS
// ─────────────────────────────────────────────────────────────

/**
 * Processa todas as filas pendentes.
 * Protegido por mutex simples (isProcessing) para evitar execuções concorrentes.
 */
export async function processQueues() {
  if (isProcessing) {
    console.log('[Sync] Já em processamento, ignorando chamada duplicada.');
    return;
  }

  const store = useAppStore.getState();
  const totalPending = store.checklistQueue.length + store.osQueue.length;

  if (totalPending === 0) {
    console.log('[Sync] Filas vazias, nada a sincronizar.');
    return;
  }

  console.log(`[Sync] Iniciando sincronização de ${totalPending} item(s) pendente(s).`);
  isProcessing = true;
  store.setSyncing(true);

  try {
    await processChecklistQueue();
    await processOSQueue();
    await store.setSyncSuccess();
    console.log('[Sync] Sincronização concluída com sucesso.');
  } catch (err) {
    console.error('[Sync] Erro durante sincronização:', err);
    store.setSyncError(err.message ?? 'Erro desconhecido na sincronização.');
  } finally {
    isProcessing = false;
  }
}

// ─────────────────────────────────────────────────────────────
// FILA DE CHECKLISTS
// ─────────────────────────────────────────────────────────────

async function processChecklistQueue() {
  const store = useAppStore.getState();
  // Copia local para não iterar sobre estado mutável
  const queue = [...store.checklistQueue];

  for (const item of queue) {
    if (item.attempts >= MAX_ATTEMPTS) {
      console.warn(`[Sync] Item ${item.localId} ignorado após ${item.attempts} tentativas.`);
      continue;
    }

    // Backoff exponencial
    if (item.attempts > 0) {
      const wait = BACKOFF_BASE_MS * Math.pow(2, item.attempts - 1);
      console.log(`[Sync] Aguardando ${wait}ms antes de tentar novamente (tentativa ${item.attempts}).`);
      await sleep(wait);
    }

    try {
      await syncChecklist(item);
      await store.removeChecklistFromQueue(item.localId);
      console.log(`[Sync] Checklist ${item.localId} sincronizado com sucesso.`);
    } catch (err) {
      const msg = err?.message ?? String(err);
      console.error(`[Sync] Falha ao sincronizar checklist ${item.localId}:`, msg);
      await markAttemptFailed('checklists', item.localId, msg);
      // Recarrega a fila em memória para refletir o contador atualizado
      await store.loadQueuesFromStorage();
    }
  }
}

/**
 * Envia um checklist completo para o Supabase.
 * @param {import('./storage').QueueItem} item
 */
async function syncChecklist(item) {
  const { checklist, respostas, _meta } = item.payload;

  // 1. Insere o checklist
  const { data: checklistCriado, error: errChecklist } = await supabase
    .from('checklists')
    .insert({
      ...checklist,
      // Mescla obs_geral do usuário com metadado de idempotência
      obs_geral: checklist.obs_geral
        ? `${checklist.obs_geral}\n[sync:${item.localId}]`
        : `[sync:${item.localId}]`,
    })
    .select('id')
    .maybeSingle();

  if (errChecklist) {
    // Verifica se é duplicata (constraint violation) — considera como sucesso
    if (errChecklist.code === '23505') {
      console.log(`[Sync] Checklist ${item.localId} já existe no servidor, ignorando.`);
      return;
    }
    throw errChecklist;
  }

  if (!checklistCriado) {
    throw new Error(`Checklist ${item.localId} não foi criado e não retornou dados.`);
  }

  // 2. Insere as respostas vinculadas ao checklist recém-criado
  if (respostas && respostas.length > 0) {
    const { error: errRespostas } = await supabase
      .from('checklist_respostas')
      .insert(
        respostas.map((r) => ({
          ...r,
          checklist_id: checklistCriado.id,
        }))
      );

    if (errRespostas) throw errRespostas;
  }

  // 3. Marca o agendamento como 'concluido'
  const { error: errAgend } = await supabase
    .from('agendamentos_preventivos')
    .update({ status: 'concluido' })
    .eq('id', checklist.agendamento_id);

  if (errAgend) throw errAgend;

  // 4. Notifica admins (fire-and-forget — falha não interrompe a sync)
  notificarAdminsChecklist({
    agendamentoId: checklist.agendamento_id,
    mecanicoId:    checklist.mecanico_id,
    respostas,
    meta:          _meta ?? {},
  }).catch(err =>
    console.warn('[Sync] Falha ao notificar admins sobre checklist:', err.message)
  );
}

/**
 * Envia notificação de conclusão de preventiva para todos os superadmins.
 * Chamado de forma não-bloqueante (fire-and-forget) em syncChecklist.
 *
 * Usa os metadados `_meta` gravados pelo Checklist.jsx no payload da fila
 * para evitar queries extras. Se não disponíveis, faz queries pontuais.
 */
async function notificarAdminsChecklist({ agendamentoId, mecanicoId, respostas, meta }) {
  // Busca admins e, se necessário, nomes do equipamento e do mecânico
  const promises = [
    supabase.from('usuarios').select('id').eq('role', 'superadmin'),
  ];

  // Se os metadados já vieram no payload (caso normal), não precisamos
  // de queries extras. Caso contrário, buscamos do banco.
  const precisaNomes = !meta?.equip_nome || !meta?.mec_nome;
  if (precisaNomes) {
    promises.push(
      supabase
        .from('agendamentos_preventivos')
        .select('equipamentos(nome)')
        .eq('id', agendamentoId)
        .single(),
      supabase
        .from('usuarios')
        .select('nome_completo')
        .eq('id', mecanicoId)
        .single()
    );
  }

  const results = await Promise.all(promises);
  const admins  = results[0].data ?? [];

  if (admins.length === 0) return;

  const equipNome = meta?.equip_nome || results[1]?.data?.equipamentos?.nome || 'Equipamento';
  const mecNome   = meta?.mec_nome   || results[2]?.data?.nome_completo       || 'Mecânico';

  const naoConf = (respostas ?? []).filter(r => r.status_resposta === 'correcao').length;
  const mensagem = naoConf > 0
    ? `${mecNome} concluiu a preventiva de "${equipNome}" com ${naoConf} item(ns) não conforme(s).`
    : `${mecNome} concluiu a preventiva de "${equipNome}" com sucesso.`;

  await supabase.from('notificacoes').insert(
    admins.map(admin => ({
      user_id:  admin.id,
      tipo:     'preventiva_concluida',
      titulo:   'Preventiva concluída',
      mensagem,
      link:     '/preventivas',
      lida:     false,
    }))
  );
}

// ─────────────────────────────────────────────────────────────
// FILA DE ORDENS DE SERVIÇO
// ─────────────────────────────────────────────────────────────

async function processOSQueue() {
  const store = useAppStore.getState();
  const queue = [...store.osQueue];

  for (const item of queue) {
    if (item.attempts >= MAX_ATTEMPTS) {
      console.warn(`[Sync] OS ${item.localId} ignorada após ${item.attempts} tentativas.`);
      continue;
    }

    if (item.attempts > 0) {
      const wait = BACKOFF_BASE_MS * Math.pow(2, item.attempts - 1);
      await sleep(wait);
    }

    try {
      await syncOS(item);
      await store.removeOSFromQueue(item.localId);
      console.log(`[Sync] OS ${item.localId} sincronizada com sucesso.`);
    } catch (err) {
      const msg = err?.message ?? String(err);
      console.error(`[Sync] Falha ao sincronizar OS ${item.localId}:`, msg);
      await markAttemptFailed('os', item.localId, msg);
      await store.loadQueuesFromStorage();
    }
  }
}

/**
 * Envia uma OS completa para o Supabase.
 * @param {import('./storage').QueueItem} item
 */
async function syncOS(item) {
  const { type, payload } = item;

  if (type === 'os_iniciada') {
    // OS apenas iniciada offline — insere com status em_andamento
    const { error } = await supabase
      .from('ordens_servico')
      .insert({
        ...payload.os,
        status: 'em_andamento',
        obs: payload.os.obs
          ? `${payload.os.obs}\n[sync:${item.localId}]`
          : `[sync:${item.localId}]`,
      });

    if (error) {
      if (error.code === '23505') return; // Já existe, considera sucesso
      throw error;
    }
    return;
  }

  if (type === 'os_completa') {
    const { os, pecas } = payload;

    // 1. Insere a OS finalizada
    const { data: osCriada, error: errOS } = await supabase
      .from('ordens_servico')
      .insert({
        ...os,
        obs: os.obs
          ? `${os.obs}\n[sync:${item.localId}]`
          : `[sync:${item.localId}]`,
      })
      .select('id')
      .maybeSingle();

    if (errOS) {
      if (errOS.code === '23505') return;
      throw errOS;
    }

    if (!osCriada) {
      throw new Error(`OS ${item.localId} não foi criada e não retornou dados.`);
    }

    // 2. Insere as peças utilizadas
    if (pecas && pecas.length > 0) {
      const { error: errPecas } = await supabase
        .from('os_pecas_utilizadas')
        .insert(
          pecas.map((p) => ({
            ...p,
            ordem_servico_id: osCriada.id,
          }))
        );

      if (errPecas) throw errPecas;
    }

    // 3. Restaura timer no store com o ID real do Supabase
    useAppStore.getState().stopTimer(item.localId);
    return;
  }

  throw new Error(`[Sync] Tipo de item desconhecido na fila de OS: ${type}`);
}

// ─────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────

/**
 * Força uma sincronização manual (chamável por botão na UI).
 * Retorna um resumo do resultado.
 * @returns {Promise<{ synced: number, failed: number }>}
 */
export async function forcSync() {
  const store = useAppStore.getState();
  const before = store.checklistQueue.length + store.osQueue.length;
  await processQueues();
  const after = store.checklistQueue.length + store.osQueue.length;
  return {
    synced: before - after,
    failed: after,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
