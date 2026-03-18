// src/services/notifications.js
// Serviço central de notificações: Supabase Realtime + Capacitor Local Notifications

import { supabase } from './supabase';

// ─── Capacitor Local Notifications (mobile only) ──────────────
// Importado dinamicamente para não quebrar em ambiente web.
let _localNotif  = null;
let _localAvail  = false;
let _initStarted = false;

async function initLocalNotif() {
  if (_initStarted) return;
  _initStarted = true;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const mod = await import('@capacitor/local-notifications');
    _localNotif = mod.LocalNotifications;
    const { display } = await _localNotif.requestPermissions();
    _localAvail = display === 'granted';
  } catch {
    _localNotif = null;
    _localAvail = false;
  }
}

// Pré-aquece sem bloquear o boot
initLocalNotif().catch(() => {});

// ─── CRUD ─────────────────────────────────────────────────────

/**
 * Busca as notificações mais recentes do usuário.
 * @param {string} userId
 * @param {number} limit  (padrão 40)
 * @returns {Promise<object[]>}
 */
export async function fetchNotificacoes(userId, limit = 40) {
  const { data, error } = await supabase
    .from('notificacoes')
    .select('id, titulo, mensagem, lida, link, tipo, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

/**
 * Marca uma única notificação como lida.
 * @param {string} notifId
 */
export async function marcarComoLida(notifId) {
  const { error } = await supabase
    .from('notificacoes')
    .update({ lida: true })
    .eq('id', notifId);
  if (error) throw error;
}

/**
 * Marca TODAS as notificações não-lidas do usuário como lidas.
 * @param {string} userId
 */
export async function marcarTodasComoLidas(userId) {
  const { error } = await supabase
    .from('notificacoes')
    .update({ lida: true })
    .eq('user_id', userId)
    .eq('lida', false);
  if (error) throw error;
}

// ─── REALTIME ─────────────────────────────────────────────────

/**
 * Assina em tempo real o canal de notificações do usuário.
 * Chama `onInsert(notif)` a cada novo registro inserido.
 * Em mobile, dispara Local Notification automaticamente.
 *
 * @param {string}           userId
 * @param {(n: object)=>void} onInsert
 * @returns {() => void}  função de cleanup
 */
export function subscribeToNotificacoes(userId, onInsert) {
  const channel = supabase
    .channel(`notif_user_${userId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'notificacoes',
        filter: `user_id=eq.${userId}`,
      },
      async (payload) => {
        const notif = payload.new;
        onInsert(notif);

        // Notificação local em mobile
        if (_localAvail && _localNotif) {
          _localNotif
            .schedule({
              notifications: [{
                id:         Math.abs(Date.now() % 2147483647),
                title:      notif.titulo,
                body:       notif.mensagem,
                extra:      { link: notif.link ?? '/' },
                smallIcon:  'ic_stat_icon_config_sample',
                iconColor:  '#20643F',
              }],
            })
            .catch(() => {});
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ─── HELPERS ──────────────────────────────────────────────────

/** Ícone emoji baseado no tipo da notificação. */
export function iconePorTipo(tipo) {
  const map = {
    os_aberta:             '🔧',
    os_concluida:          '✅',
    preventiva_concluida:  '📋',
    preventiva_agendada:   '🗓',
    preventiva_lembrete:   '⏰',
  };
  return map[tipo] ?? '🔔';
}

/** Texto relativo de tempo em pt-BR (ex: "há 3 min"). */
export function tempoRelativo(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const min  = Math.floor(diff / 60000);
  const h    = Math.floor(diff / 3600000);
  const d    = Math.floor(diff / 86400000);
  if (min < 1)  return 'agora';
  if (min < 60) return `há ${min} min`;
  if (h < 24)   return `há ${h}h`;
  if (d < 7)    return `há ${d}d`;
  return new Date(isoString).toLocaleDateString('pt-BR');
}
