// src/pages/Dashboard/Painel.jsx
// ADIÇÕES:
//   • Ícone de sino (BellIcon) no header com badge de não-lidas
//   • Painel lateral de notificações (slide-in da direita)
//   • Subscription Supabase Realtime para notificações em tempo real
//   • Query de preventivas corrigida: tecnico:usuarios!mecanico_id
// MANTIDAS:
//   • Todas as lógicas de autenticação e AuthStore
//   • Paleta de cores verde (#20643F)
//   • AguiaLogo SVG inline

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import useAuthStore from '../../store/authStore';
import useAppStore from '../../store/appStore';
import { SecurityAlertModal } from '../Login/Login.jsx';
import {
  subscribeToNotificacoes,
  iconePorTipo,
  tempoRelativo,
} from '../../services/notifications';

// ─── Helpers ──────────────────────────────────────────────────

function formatarDataHora(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function calcularDuracao(inicio) {
  if (!inicio) return '—';
  const ms = Date.now() - new Date(inicio).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Painel de Notificações ───────────────────────────────────

function PainelNotificacoes({ onClose }) {
  const navigate   = useNavigate();
  const { profile } = useAuthStore();
  const {
    notifications,
    unreadCount,
    notifLoading,
    markNotificationRead,
    markAllNotificationsRead,
  } = useAppStore();

  const handleClick = (notif) => {
    if (!notif.lida) markNotificationRead(notif.id);
    if (notif.link) {
      onClose();
      navigate(notif.link);
    }
  };

  const handleMarcarTodas = () => {
    if (profile?.id) markAllNotificationsRead(profile.id);
  };

  return (
    <>
      {/* Overlay para fechar clicando fora */}
      <div style={NS.overlay} onClick={onClose} />

      {/* Painel lateral */}
      <div style={NS.painel}>
        {/* Cabeçalho */}
        <div style={NS.header}>
          <div style={NS.headerLeft}>
            <span style={NS.titulo}>Notificações</span>
            {unreadCount > 0 && (
              <span style={NS.unreadBadge}>{unreadCount}</span>
            )}
          </div>
          <div style={NS.headerAcoes}>
            {unreadCount > 0 && (
              <button onClick={handleMarcarTodas} style={NS.btnMarcarTodas}>
                Marcar todas como lidas
              </button>
            )}
            <button onClick={onClose} style={NS.btnFechar}>
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Lista */}
        <div style={NS.lista}>
          {notifLoading ? (
            <div style={NS.vazio}>
              <div style={NS.spinner} />
            </div>
          ) : notifications.length === 0 ? (
            <div style={NS.vazio}>
              <span style={{ fontSize: '36px' }}>🔔</span>
              <p style={NS.vazioTexto}>Nenhuma notificação ainda.</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                style={{
                  ...NS.item,
                  backgroundColor: notif.lida ? '#FFFFFF' : 'rgba(32,100,63,0.04)',
                  borderLeft: `3px solid ${notif.lida ? '#E8EDF2' : '#20643F'}`,
                }}
              >
                <span style={NS.itemIcone}>{iconePorTipo(notif.tipo)}</span>
                <div style={NS.itemCorpo}>
                  <span style={{ ...NS.itemTitulo, fontWeight: notif.lida ? '500' : '700' }}>
                    {notif.titulo}
                  </span>
                  <span style={NS.itemMsg}>{notif.mensagem}</span>
                  <span style={NS.itemTempo}>{tempoRelativo(notif.created_at)}</span>
                </div>
                {!notif.lida && <span style={NS.dotNaoLida} />}
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ─── Card de Métrica ──────────────────────────────────────────

function CardMetrica({ label, valor, icone, cor, bg, borda, onClick, loading, index }) {
  return (
    <div
      onClick={onClick}
      style={{
        ...S.metricaCard,
        borderTop: `3px solid ${cor}`,
        cursor: onClick ? 'pointer' : 'default',
        animationDelay: `${index * 80}ms`,
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      <div style={{ ...S.metricaIconeWrapper, backgroundColor: bg, border: `1px solid ${borda}` }}>
        {icone}
      </div>
      <div style={S.metricaTextos}>
        <span style={S.metricaLabel}>{label}</span>
        {loading
          ? <div style={S.metricaSkeletonNum} />
          : <span style={{ ...S.metricaValor, color: cor }}>{valor}</span>
        }
      </div>
      {onClick && <ChevronIcon />}
    </div>
  );
}

// ─── Item de OS Ativa ─────────────────────────────────────────

function ItemOSAtiva({ os, onClick }) {
  return (
    <div onClick={onClick} style={S.osItem} role="button" tabIndex={0}>
      <div style={S.osItemLeft}>
        <span style={S.osEquip}>{os.equipamentos?.nome ?? '—'}</span>
        <span style={S.osProblema}>{os.problema}</span>
        <div style={S.osMeta}>
          <span style={S.osMetaItem}><UserSmIcon /> {os.usuarios?.nome_completo ?? '—'}</span>
          <span style={S.osMetaDot} />
          <span style={S.osMetaItem}><TimerSmIcon /> {calcularDuracao(os.inicio_em)}</span>
        </div>
      </div>
      <ChevronIcon />
    </div>
  );
}

// ─── Item de Preventiva Atrasada ──────────────────────────────

function ItemPrevAtrasada({ ag, onClick }) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const data = new Date(ag.data_agendada + 'T00:00:00');
  const diasAtraso = Math.round((hoje - data) / (1000 * 60 * 60 * 24));

  return (
    <div onClick={onClick} style={S.osItem} role="button" tabIndex={0}>
      <div style={S.osItemLeft}>
        <span style={S.osEquip}>{ag.equipamentos?.nome ?? '—'}</span>
        <span style={S.osProblema}>Preventiva não realizada</span>
        <div style={S.osMeta}>
          {/* CORREÇÃO: usa `tecnico` em vez de `usuarios` */}
          <span style={S.osMetaItem}><UserSmIcon /> {ag.tecnico?.nome_completo ?? '—'}</span>
          <span style={S.osMetaDot} />
          <span style={{ ...S.osMetaItem, color: '#EF4444', fontWeight: '600' }}>
            {diasAtraso === 0 ? 'Hoje' : `${diasAtraso}d de atraso`}
          </span>
        </div>
      </div>
      <ChevronIcon />
    </div>
  );
}

// ─── Tela principal ───────────────────────────────────────────

export default function Painel() {
  const navigate = useNavigate();
  const { profile, isSuperAdmin, logout, showSecurityAlert, setShowSecurityAlert } = useAuthStore();
  const {
    isOnline, checklistQueue, osQueue,
    notifications, unreadCount, notifPanelOpen,
    loadNotifications, addNotification, setNotifPanelOpen,
    clearNotifications,
  } = useAppStore();

  const [metricas, setMetricas]           = useState({ equipamentos: 0, osAbertas: 0, prevAtrasadas: 0, emManutencao: 0 });
  const [osAtivas, setOsAtivas]           = useState([]);
  const [prevAtrasadas, setPrevAtrasadas] = useState([]);
  const [loadingMetricas, setLoadingMetricas] = useState(true);
  const [loadingListas, setLoadingListas]     = useState(true);

  const unsubNotifRef = useRef(null);

  // ─── Carrega notificações + assina Realtime ──────────────────
  useEffect(() => {
    if (!profile?.id) return;

    loadNotifications(profile.id);

    // Subscription Supabase Realtime
    unsubNotifRef.current = subscribeToNotificacoes(profile.id, (notif) => {
      addNotification(notif);
    });

    return () => {
      if (unsubNotifRef.current) unsubNotifRef.current();
    };
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Limpa notificações ao desmontar (ex: logout via outro componente)
  useEffect(() => {
    return () => {
      if (unsubNotifRef.current) unsubNotifRef.current();
    };
  }, []);

  // ─── Busca métricas ───────────────────────────────────────────
  useEffect(() => {
    async function fetchMetricas() {
      setLoadingMetricas(true);
      try {
        const hoje = new Date().toISOString().split('T')[0];
        const [
          { count: totalEq },
          { count: emManut },
          { count: osAb },
          { count: prevAt },
        ] = await Promise.all([
          supabase.from('equipamentos').select('*', { count: 'exact', head: true }),
          supabase.from('equipamentos').select('*', { count: 'exact', head: true }).eq('status', 'em_manutencao'),
          supabase.from('ordens_servico').select('*', { count: 'exact', head: true }).eq('status', 'em_andamento'),
          supabase.from('agendamentos_preventivos').select('*', { count: 'exact', head: true })
            .eq('status', 'pendente').lt('data_agendada', hoje),
        ]);
        setMetricas({
          equipamentos:  totalEq  ?? 0,
          emManutencao:  emManut  ?? 0,
          osAbertas:     osAb     ?? 0,
          prevAtrasadas: prevAt   ?? 0,
        });
      } catch (err) {
        console.error('[Painel] Erro métricas:', err.message);
      } finally {
        setLoadingMetricas(false);
      }
    }
    fetchMetricas();
  }, []);

  // ─── Busca listas detalhadas ───────────────────────────────────
  useEffect(() => {
    async function fetchListas() {
      setLoadingListas(true);
      try {
        const hoje = new Date().toISOString().split('T')[0];

        let qOS = supabase
          .from('ordens_servico')
          .select(`id, problema, inicio_em, equipamentos(nome), usuarios(nome_completo)`)
          .eq('status', 'em_andamento')
          .order('inicio_em', { ascending: true })
          .limit(5);
        if (!isSuperAdmin) qOS = qOS.eq('mecanico_id', profile.id);

        // CORREÇÃO: relação explícita para preventivas
        let qPrev = supabase
          .from('agendamentos_preventivos')
          .select(`id, data_agendada, equipamentos(nome), tecnico:usuarios!mecanico_id(nome_completo)`)
          .eq('status', 'pendente')
          .lt('data_agendada', hoje)
          .order('data_agendada', { ascending: true })
          .limit(5);
        if (!isSuperAdmin) qPrev = qPrev.eq('mecanico_id', profile.id);

        const [{ data: os }, { data: prev }] = await Promise.all([qOS, qPrev]);
        setOsAtivas(os ?? []);
        setPrevAtrasadas(prev ?? []);
      } catch (err) {
        console.error('[Painel] Erro listas:', err.message);
      } finally {
        setLoadingListas(false);
      }
    }
    fetchListas();
  }, [isSuperAdmin, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendentesSync = checklistQueue.length + osQueue.length;

  const handleLogout = async () => {
    clearNotifications();
    logout();
  };

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {showSecurityAlert && (
        <SecurityAlertModal
          nomeUsuario={profile?.nome_completo?.split(' ')[0] ?? 'usuário'}
          onConfirm={() => setShowSecurityAlert(false)}
        />
      )}

      {/* ── Painel de Notificações (renderizado sobre tudo) ── */}
      {notifPanelOpen && (
        <PainelNotificacoes onClose={() => setNotifPanelOpen(false)} />
      )}

      {/* ── Header ── */}
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={S.logoMark}>
            <AguiaLogo />
          </div>
          <div style={S.headerTextos}>
            <span style={S.headerSub}>Sistema de Manutenção</span>
            <span style={S.headerNome}>Olá, {profile?.nome_completo?.split(' ')[0] ?? 'usuário'}</span>
          </div>
          <div style={S.headerAcoes}>
            {!isOnline && (
              <div style={S.offlinePill}>
                <OfflineIcon /> Offline
              </div>
            )}

            {/* ── Sino de Notificações ── */}
            <button
              onClick={() => setNotifPanelOpen(true)}
              style={S.btnSino}
              title="Notificações"
              aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ''}`}
            >
              <BellNavIcon />
              {unreadCount > 0 && (
                <span style={S.sinoBadge}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <button onClick={handleLogout} style={S.btnLogout} title="Sair">
              <LogoutIcon />
            </button>
          </div>
        </div>

        {pendentesSync > 0 && (
          <div style={S.syncBanner}>
            <SyncIcon />
            <span>{pendentesSync} item(ns) aguardando sincronização com o servidor.</span>
          </div>
        )}
      </header>

      <main style={S.main}>

        {/* ── Métricas rápidas ── */}
        <section>
          <p style={S.sectionLabel}>Visão geral</p>
          <div style={S.metricasGrid}>
            <CardMetrica
              index={0} label="Equipamentos" valor={metricas.equipamentos}
              cor="#20643F" bg="rgba(32,100,63,0.08)" borda="rgba(32,100,63,0.2)"
              icone={<GearMetIcon />} onClick={() => navigate('/equipamentos')} loading={loadingMetricas}
            />
            <CardMetrica
              index={1} label="Em manutenção" valor={metricas.emManutencao}
              cor="#F59E0B" bg="rgba(245,158,11,0.08)" borda="rgba(245,158,11,0.2)"
              icone={<WrenchMetIcon />} onClick={() => navigate('/equipamentos')} loading={loadingMetricas}
            />
            <CardMetrica
              index={2} label="OS abertas" valor={metricas.osAbertas}
              cor={metricas.osAbertas > 0 ? '#EF4444' : '#10B981'}
              bg={metricas.osAbertas > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)'}
              borda={metricas.osAbertas > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}
              icone={<OSMetIcon ativa={metricas.osAbertas > 0} />}
              onClick={() => navigate('/corretivas')} loading={loadingMetricas}
            />
            <CardMetrica
              index={3} label="Prev. atrasadas" valor={metricas.prevAtrasadas}
              cor={metricas.prevAtrasadas > 0 ? '#EF4444' : '#10B981'}
              bg={metricas.prevAtrasadas > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)'}
              borda={metricas.prevAtrasadas > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}
              icone={<CalMetIcon atrasada={metricas.prevAtrasadas > 0} />}
              onClick={() => navigate('/preventivas')} loading={loadingMetricas}
            />
          </div>
        </section>

        {/* ── Ações rápidas (SuperAdmin) ── */}
        {isSuperAdmin && (
          <section>
            <p style={S.sectionLabel}>Administração</p>
            <div style={S.acoesGrid}>
              {[
                { label: 'Nova OS',      icon: <OSAcaoIcon />,   rota: '/corretivas/nova' },
                { label: 'Equipamentos', icon: <GearAcaoIcon />, rota: '/equipamentos' },
                { label: 'Usuários',     icon: <UserAcaoIcon />, rota: '/dashboard/usuarios' },
                { label: 'Estoque',      icon: <BoxAcaoIcon />,  rota: '/dashboard/pecas' },
              ].map((a, i) => (
                <button key={a.rota} onClick={() => navigate(a.rota)}
                  style={{ ...S.acaoBtn, animationDelay: `${i * 60}ms` }}>
                  <div style={S.acaoIcone}>{a.icon}</div>
                  <span style={S.acaoLabel}>{a.label}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── OS em andamento ── */}
        <section>
          <div style={S.listaHeader}>
            <p style={S.sectionLabel}>OS em andamento</p>
            <button onClick={() => navigate('/corretivas')} style={S.verTodosBtn}>Ver todas</button>
          </div>
          {loadingListas ? (
            <SkeletonLista />
          ) : osAtivas.length === 0 ? (
            <EmptyLista icone="✅" texto="Nenhuma OS em andamento." />
          ) : (
            <div style={S.listaCard}>
              {osAtivas.map((os) => (
                <ItemOSAtiva key={os.id} os={os} onClick={() => navigate(`/corretivas/${os.id}`)} />
              ))}
            </div>
          )}
        </section>

        {/* ── Preventivas atrasadas ── */}
        <section>
          <div style={S.listaHeader}>
            <p style={S.sectionLabel}>Preventivas atrasadas</p>
            <button onClick={() => navigate('/preventivas')} style={S.verTodosBtn}>Ver todas</button>
          </div>
          {loadingListas ? (
            <SkeletonLista />
          ) : prevAtrasadas.length === 0 ? (
            <EmptyLista icone="📋" texto="Nenhuma preventiva em atraso." />
          ) : (
            <div style={S.listaCard}>
              {prevAtrasadas.map((ag) => (
                <ItemPrevAtrasada
                  key={ag.id} ag={ag}
                  onClick={() => navigate(`/preventivas/${ag.id}/checklist`)}
                />
              ))}
            </div>
          )}
        </section>

      </main>

      {/* ── Bottom Nav ── */}
      <nav style={S.bottomNav}>
        {[
          { label: 'Início',       icon: <HomeIcon />,    rota: '/dashboard' },
          { label: 'Equipamentos', icon: <GearNavIcon />, rota: '/equipamentos' },
          { label: 'Preventivas',  icon: <CalNavIcon />,  rota: '/preventivas' },
          { label: 'OS',           icon: <OSNavIcon />,   rota: '/corretivas' },
        ].map((item) => {
          const ativo = location.pathname === item.rota;
          return (
            <button key={item.rota} onClick={() => navigate(item.rota)}
              style={{ ...S.navItem, ...(ativo ? S.navItemAtivo : {}) }}>
              {item.icon}
              <span style={S.navLabel}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ─── Auxiliares ───────────────────────────────────────────────

function SkeletonLista() {
  return (
    <div style={S.listaCard}>
      {[1, 2].map((i) => (
        <div key={i} style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px', borderBottom: '1px solid #F1F5F9' }}>
          {[60, 85, 45].map((w, j) => (
            <div key={j} style={{ height: '12px', width: `${w}%`, borderRadius: '5px', background: 'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize: '400px', animation: 'shimmer 1.4s infinite linear' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyLista({ icone, texto }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px 16px', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8EDF2' }}>
      <span style={{ fontSize: '22px' }}>{icone}</span>
      <span style={{ fontSize: '13px', color: '#94A3B8', fontWeight: '500' }}>{texto}</span>
    </div>
  );
}

// ─── Logo SGM Águia ───────────────────────────────────────────
function AguiaLogo() {
  return (
    <svg width="40" height="40" viewBox="0 0 48 48" fill="none" aria-label="SGM Águia">
      <rect width="48" height="48" rx="10" fill="rgba(255,255,255,0.18)"/>
      <path d="M14 34V22l10-8 10 8v12H28v-8h-8v8H14z" fill="white"/>
      <circle cx="24" cy="18" r="3" fill="#F59E0B"/>
      <path d="M10 26 Q6 22 10 18 L14 22" fill="rgba(255,255,255,0.55)"/>
      <path d="M38 26 Q42 22 38 18 L34 22" fill="rgba(255,255,255,0.55)"/>
    </svg>
  );
}

// ─── Ícones ───────────────────────────────────────────────────
function CloseIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function ChevronIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#CBD5E1', flexShrink: 0 }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function UserSmIcon() { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="7" r="4" stroke="#94A3B8" strokeWidth="2"/></svg>; }
function TimerSmIcon() { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" stroke="#94A3B8" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/></svg>; }
function BellNavIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function GearMetIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="#20643F" strokeWidth="1.8"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#20643F" strokeWidth="1.8"/></svg>; }
function WrenchMetIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"/></svg>; }
function OSMetIcon({ ativa }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={ativa ? '#EF4444' : '#10B981'} strokeWidth="2"/><path d="M14 2v6h6M12 18v-6M9 15h6" stroke={ativa ? '#EF4444' : '#10B981'} strokeWidth="2" strokeLinecap="round"/></svg>; }
function CalMetIcon({ atrasada }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke={atrasada ? '#EF4444' : '#10B981'} strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke={atrasada ? '#EF4444' : '#10B981'} strokeWidth="2" strokeLinecap="round"/></svg>; }
function OSAcaoIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#20643F" strokeWidth="2"/><path d="M14 2v6h6M12 18v-6M9 15h6" stroke="#20643F" strokeWidth="2" strokeLinecap="round"/></svg>; }
function GearAcaoIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="#20643F" strokeWidth="1.8"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#20643F" strokeWidth="1.8"/></svg>; }
function UserAcaoIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="#20643F" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="7" r="4" stroke="#20643F" strokeWidth="2"/></svg>; }
function BoxAcaoIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke="#20643F" strokeWidth="2"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke="#20643F" strokeWidth="2" strokeLinecap="round"/></svg>; }
function LogoutIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function OfflineIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.8M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function SyncIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><polyline points="1 4 1 10 7 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function HomeIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function GearNavIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.8"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.8"/></svg>; }
function CalNavIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function OSNavIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2"/><path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }

// ─── CSS Global ───────────────────────────────────────────────
const CSS = `
  @keyframes cardFadeIn  { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @keyframes shimmer     { 0% { background-position:-400px 0; } 100% { background-position:400px 0; } }
  @keyframes slideInRight { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
`;

// ─── Estilos do Painel de Notificações ────────────────────────
const NS = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 40,
    backgroundColor: 'rgba(0,0,0,0.35)',
    backdropFilter: 'blur(2px)',
  },
  painel: {
    position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
    width: 'min(380px, 100vw)',
    backgroundColor: '#FFFFFF',
    display: 'flex', flexDirection: 'column',
    boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
    animation: 'slideInRight 0.25s ease both',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 16px 12px',
    borderBottom: '1px solid #E8EDF2',
    gap: '8px',
    flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '8px' },
  titulo: { fontSize: '16px', fontWeight: '800', color: '#0D1B2A', letterSpacing: '-0.2px' },
  unreadBadge: {
    padding: '2px 8px', borderRadius: '20px',
    backgroundColor: '#20643F', color: '#FFFFFF',
    fontSize: '11px', fontWeight: '700',
  },
  headerAcoes: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 },
  btnMarcarTodas: {
    padding: '5px 10px', borderRadius: '7px', border: '1.5px solid #E2E8F0',
    backgroundColor: '#F8FAFC', color: '#64748B',
    fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit',
  },
  btnFechar: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '30px', height: '30px', border: '1px solid #E2E8F0',
    borderRadius: '7px', background: '#F8FAFC', cursor: 'pointer', color: '#64748B',
  },
  lista: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  vazio: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '40px',
  },
  vazioTexto: { margin: 0, fontSize: '14px', color: '#94A3B8', fontWeight: '500' },
  spinner: {
    width: '24px', height: '24px',
    border: '3px solid #E8EDF2', borderTopColor: '#20643F',
    borderRadius: '50%', animation: 'shimmer 1s linear infinite',
  },
  item: {
    width: '100%', display: 'flex', alignItems: 'flex-start', gap: '12px',
    padding: '14px 16px', border: 'none', borderBottom: '1px solid #F1F5F9',
    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
    transition: 'background-color 0.15s',
  },
  itemIcone: { fontSize: '18px', flexShrink: 0, marginTop: '1px' },
  itemCorpo: { flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 },
  itemTitulo: { fontSize: '13px', color: '#0D1B2A', lineHeight: 1.4 },
  itemMsg: {
    fontSize: '12px', color: '#64748B', lineHeight: 1.45,
    overflow: 'hidden', textOverflow: 'ellipsis',
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
  },
  itemTempo: { fontSize: '11px', color: '#94A3B8', fontWeight: '500' },
  dotNaoLida: {
    width: '8px', height: '8px', borderRadius: '50%',
    backgroundColor: '#20643F', flexShrink: 0, marginTop: '5px',
  },
};

// ─── Estilos do Painel principal ──────────────────────────────
const S = {
  page: { minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans','Segoe UI',sans-serif", paddingBottom: '72px' },
  header: { backgroundColor: '#20643F', position: 'sticky', top: 0, zIndex: 20 },
  headerInner: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px' },
  logoMark: { flexShrink: 0, display: 'flex', alignItems: 'center' },
  headerTextos: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  headerSub: { fontSize: '10px', color: 'rgba(255,255,255,0.6)', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase' },
  headerNome: { fontSize: '16px', color: '#FFFFFF', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  headerAcoes: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 },
  offlinePill: { display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '20px', fontSize: '11px', color: '#FFFFFF', fontWeight: '600' },
  // Botão sino
  btnSino: {
    position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '36px', height: '36px',
    border: '1.5px solid rgba(255,255,255,0.5)',
    borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.15)',
    cursor: 'pointer', color: '#FFFFFF',
  },
  sinoBadge: {
    position: 'absolute', top: '-5px', right: '-5px',
    minWidth: '17px', height: '17px', padding: '0 4px',
    borderRadius: '10px', backgroundColor: '#EF4444',
    color: '#FFFFFF', fontSize: '10px', fontWeight: '800',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '2px solid #20643F',
  },
  btnLogout: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: '1.5px solid rgba(255,255,255,0.5)', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.15)', cursor: 'pointer', color: '#FFFFFF' },
  syncBanner: { display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', backgroundColor: 'rgba(245,158,11,0.2)', borderTop: '1px solid rgba(245,158,11,0.3)', fontSize: '12px', color: '#FEF3C7', fontWeight: '500' },
  main: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px', margin: '0 auto', width: '100%', boxSizing: 'border-box' },
  sectionLabel: { margin: '0 0 10px 0', fontSize: '11px', fontWeight: '700', color: '#94A3B8', letterSpacing: '1.2px', textTransform: 'uppercase' },
  metricasGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  metricaCard: { backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8EDF2', padding: '14px', display: 'flex', alignItems: 'center', gap: '12px', animation: 'cardFadeIn 0.35s ease both', WebkitTapHighlightColor: 'transparent', outline: 'none', minWidth: 0 },
  metricaIconeWrapper: { width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  metricaTextos: { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden', minWidth: 0 },
  metricaLabel: { fontSize: '11px', color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px' },
  metricaValor: { fontSize: '26px', fontWeight: '800', lineHeight: 1, letterSpacing: '-0.5px' },
  metricaSkeletonNum: { height: '26px', width: '40px', borderRadius: '6px', background: 'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize: '400px', animation: 'shimmer 1.4s infinite linear' },
  acoesGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' },
  acaoBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '14px 8px', backgroundColor: '#FFFFFF', border: '1px solid #E8EDF2', borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', animation: 'cardFadeIn 0.35s ease both', WebkitTapHighlightColor: 'transparent', minWidth: 0 },
  acaoIcone: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  acaoLabel: { fontSize: '11px', fontWeight: '600', color: '#374151', textAlign: 'center', lineHeight: 1.3 },
  listaHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' },
  verTodosBtn: { fontSize: '12px', fontWeight: '600', color: '#20643F', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontFamily: 'inherit' },
  listaCard: { backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8EDF2', overflow: 'hidden' },
  osItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  osItemLeft: { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden', minWidth: 0 },
  osEquip: { fontSize: '14px', fontWeight: '700', color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  osProblema: { fontSize: '12px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  osMeta: { display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' },
  osMetaItem: { display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#94A3B8' },
  osMetaDot: { width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#CBD5E1' },
  bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30, display: 'flex', backgroundColor: '#FFFFFF', borderTop: '1px solid #E8EDF2', paddingBottom: 'env(safe-area-inset-bottom)' },
  navItem: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', padding: '10px 4px', border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' },
  navItemAtivo: { color: '#20643F' },
  navLabel: { fontSize: '10px', fontWeight: '600', letterSpacing: '0.2px' },
};
