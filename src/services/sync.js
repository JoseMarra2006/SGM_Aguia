// src/services/sync.js
// CORREÇÃO (Fila Aberta — Conflito #4):
//   • notificarAdminsChecklist: adicionado guard `if (mecanicoId)` antes de
//     fazer query de nome do mecânico. Com fila aberta, mecanico_id é null
//     em todas as novas OS; a query falhava silenciosamente (sem lancar erro,
//     mas retornando undefined). O nome é resolvido por _meta.mec_nome quando
//     disponível, e por aberto_por como fallback final.
// INALTERADO: toda a lógica de sync, backoff, filas e processamento.

import { Network } from '@capacitor/network';
import { supabase } from './supabase';
import { markAttemptFailed } from './storage';
import useAppStore from '../store/appStore';

const BACKOFF_BASE_MS = 2000;

let networkListenerHandle = null;
let isProcessing = false;

// ─────────────────────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────────────────────

export async function initSync() {
  const status = await Network.getStatus();
  useAppStore.getState().setIsOnline(status.connected);

  if (status.connected) {
    await processQueues();
  }

  networkListenerHandle = await Network.addListener(
    'networkStatusChange',
    async (status) => {
      console.log('[Sync] Status de rede:', status.connectionType, '| Online:', status.connected);
      useAppStore.getState().setIsOnline(status.connected);
      if (status.connected) {
        await sleep(4000);
        await processQueues();
      }
    }
  );

  console.log('[Sync] Sistema de sincronização inicializado.');
}

export async function destroySync() {
  if (networkListenerHandle) {
    await networkListenerHandle.remove();
    networkListenerHandle = null;
  }
}

// ─────────────────────────────────────────────────────────────
// PROCESSAMENTO DAS FILAS
// ─────────────────────────────────────────────────────────────

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
  const queue = [...store.checklistQueue];

  for (const item of queue) {
    if (item.attempts > 0) {
      const wait = Math.min(BACKOFF_BASE_MS * Math.pow(2, item.attempts - 1), 30000);
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
      await store.loadQueuesFromStorage();
    }
  }
}

async function syncChecklist(item) {
  const { checklist, respostas, _meta } = item.payload;

  const { data: checklistCriado, error: errChecklist } = await supabase
    .from('checklists')
    .insert({
      ...checklist,
      obs_geral: checklist.obs_geral
        ? `${checklist.obs_geral}\n[sync:${item.localId}]`
        : `[sync:${item.localId}]`,
    })
    .select('id')
    .maybeSingle();

  if (errChecklist) {
    if (errChecklist.code === '23505') {
      console.log(`[Sync] Checklist ${item.localId} já existe no servidor, ignorando.`);
      return;
    }
    throw errChecklist;
  }

  if (!checklistCriado) {
    throw new Error(`Checklist ${item.localId} não foi criado e não retornou dados.`);
  }

  if (respostas && respostas.length > 0) {
    const { error: errRespostas } = await supabase
      .from('checklist_respostas')
      .insert(respostas.map(r => ({ ...r, checklist_id: checklistCriado.id })));
    if (errRespostas) throw errRespostas;
  }

  const { error: errAgend } = await supabase
    .from('agendamentos_preventivos')
    .update({ status: 'concluido' })
    .eq('id', checklist.agendamento_id);
  if (errAgend) throw errAgend;

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
 * Notifica admins sobre conclusão de checklist.
 *
 * CORREÇÃO CONFLITO #4:
 *   mecanicoId pode ser null (fila aberta). O guard `if (mecanicoId)` evita
 *   uma query `SELECT ... WHERE id = null` que retornaria undefined e
 *   causaria falha silenciosa na resolução do nome.
 *   Fonte de verdade para o nome: _meta.mec_nome (gravado pelo Checklist.jsx)
 *   ou fallback para '—' quando não disponível.
 */
async function notificarAdminsChecklist({ agendamentoId, mecanicoId, respostas, meta }) {
  const promises = [
    supabase.from('usuarios').select('id').eq('role', 'superadmin'),
  ];

  // Só faz queries extras se os metadados não vieram no payload
  const precisaEquipNome = !meta?.equip_nome;
  const precisaMecNome   = !meta?.mec_nome && !!mecanicoId; // guard: só busca se mecanicoId não for null

  if (precisaEquipNome) {
    promises.push(
      supabase
        .from('agendamentos_preventivos')
        .select('equipamentos(nome)')
        .eq('id', agendamentoId)
        .single()
    );
  }

  if (precisaMecNome) {
    promises.push(
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

  // Resolve nomes com fallback seguro
  let equipIdx = 1;
  let mecIdx   = precisaEquipNome ? 2 : 1;

  const equipNome = meta?.equip_nome
    || (precisaEquipNome ? results[equipIdx]?.data?.equipamentos?.nome : undefined)
    || 'Equipamento';

  const mecNome = meta?.mec_nome
    || (precisaMecNome ? results[mecIdx]?.data?.nome_completo : undefined)
    || '—';

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
    if (item.attempts > 0) {
      const wait = Math.min(BACKOFF_BASE_MS * Math.pow(2, item.attempts - 1), 30000);
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

async function syncOS(item) {
  const { type, payload } = item;

  if (type === 'os_iniciada') {
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
      if (error.code === '23505') return;
      throw error;
    }
    return;
  }

  if (type === 'os_completa') {
    const { os, pecas } = payload;

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

    if (pecas && pecas.length > 0) {
      const { error: errPecas } = await supabase
        .from('os_pecas_utilizadas')
        .insert(pecas.map(p => ({ ...p, ordem_servico_id: osCriada.id })));
      if (errPecas) throw errPecas;
    }

    useAppStore.getState().stopTimer(item.localId);
    return;
  }

  throw new Error(`[Sync] Tipo de item desconhecido na fila de OS: ${type}`);
}

// ─────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────

export async function forcSync() {
  const store = useAppStore.getState();
  const before = store.checklistQueue.length + store.osQueue.length;
  await processQueues();
  const after = store.checklistQueue.length + store.osQueue.length;
  return { synced: before - after, failed: after };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}