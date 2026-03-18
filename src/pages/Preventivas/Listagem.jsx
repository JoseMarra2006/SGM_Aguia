// src/pages/Preventivas/Listagem.jsx
// CORREÇÃO CRÍTICA: query usa relação explícita `tecnico:usuarios!mecanico_id`
// para evitar o erro "more than one relationship found for 'agendamentos_preventivos' and 'usuarios'".
// Referências ao objeto `usuarios` renomeadas para `tecnico` em todo o componente.
//
// ALTERAÇÕES VISUAIS (mantidas):
//   • #0F4C81 → #20643F em: eyebrow, abaBtnAtiva, verBtn, btnRetry
//   • getStatusInfo: cor 'Hoje' → #20643F

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import useAuthStore from '../../store/authStore';

// ─── Helpers ──────────────────────────────────────────────────

function formatarData(dateStr) {
  if (!dateStr) return '—';
  const [ano, mes, dia] = dateStr.split('-');
  return `${dia}/${mes}/${ano}`;
}

function diasParaData(dateStr) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dateStr + 'T00:00:00');
  return Math.round((alvo - hoje) / (1000 * 60 * 60 * 24));
}

function getStatusInfo(agendamento) {
  if (agendamento.status === 'concluido') {
    return { label: 'Concluído', cor: '#10B981', bg: 'rgba(16,185,129,0.1)', borda: 'rgba(16,185,129,0.25)' };
  }
  if (agendamento.status === 'cancelado') {
    return { label: 'Cancelado', cor: '#EF4444', bg: 'rgba(239,68,68,0.1)', borda: 'rgba(239,68,68,0.25)' };
  }
  const dias = diasParaData(agendamento.data_agendada);
  if (dias < 0)   return { label: 'Atrasado',   cor: '#EF4444', bg: 'rgba(239,68,68,0.08)',    borda: 'rgba(239,68,68,0.2)' };
  if (dias === 0) return { label: 'Hoje',        cor: '#20643F', bg: 'rgba(32,100,63,0.1)',     borda: 'rgba(32,100,63,0.25)' };
  if (dias <= 3)  return { label: `Em ${dias}d`, cor: '#F59E0B', bg: 'rgba(245,158,11,0.1)',   borda: 'rgba(245,158,11,0.25)' };
  return            { label: `Em ${dias}d`,      cor: '#64748B', bg: 'rgba(100,116,139,0.08)', borda: 'rgba(100,116,139,0.2)' };
}

// ─── Card de Agendamento ──────────────────────────────────────

function CardAgendamento({ agendamento, onClick, index }) {
  const statusInfo = getStatusInfo(agendamento);
  const dias = diasParaData(agendamento.data_agendada);
  const isConcluido = agendamento.status === 'concluido';
  const isHoje     = dias === 0 && agendamento.status === 'pendente';
  const isAlerta   = dias > 0 && dias <= 3 && agendamento.status === 'pendente';
  const isAtrasado = dias < 0 && agendamento.status === 'pendente';

  return (
    <article
      onClick={onClick}
      style={{
        ...S.card,
        animationDelay: `${index * 55}ms`,
        borderLeft: `4px solid ${statusInfo.cor}`,
        opacity: isConcluido ? 0.75 : 1,
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {/* Linha superior: equipamento + status */}
      <div style={S.cardTop}>
        <div style={S.equipInfo}>
          <GearIcon cor={statusInfo.cor} />
          <span style={S.equipNome}>{agendamento.equipamentos?.nome ?? '—'}</span>
        </div>
        <span style={{ ...S.statusPill, color: statusInfo.cor, backgroundColor: statusInfo.bg, border: `1px solid ${statusInfo.borda}` }}>
          {statusInfo.label}
        </span>
      </div>

      {/* Linha de data */}
      <div style={S.cardMid}>
        <CalendarIcon />
        <span style={S.dataTexto}>
          {isHoje ? <strong>Hoje — </strong> : null}
          {formatarData(agendamento.data_agendada)}
        </span>
        {isAlerta && (
          <span style={S.alertaTag}>
            <BellIcon /> Alerta
          </span>
        )}
        {isAtrasado && (
          <span style={{ ...S.alertaTag, backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444', borderColor: 'rgba(239,68,68,0.25)' }}>
            ⚠ Atrasado
          </span>
        )}
      </div>

      {/* Mecânico — usa `tecnico` (corrigido) */}
      <div style={S.cardBot}>
        <UserIcon />
        <span style={S.mecanicoNome}>{agendamento.tecnico?.nome_completo ?? '—'}</span>
        {!isConcluido && (
          <span style={S.verBtn}>
            {isHoje ? 'Iniciar checklist' : 'Ver detalhes'}
            <ChevronIcon />
          </span>
        )}
      </div>
    </article>
  );
}

// ─── Tela principal ───────────────────────────────────────────

const ABAS = [
  { label: 'Pendentes',  value: 'pendente' },
  { label: 'Concluídos', value: 'concluido' },
];

export default function ListagemPreventivas() {
  const navigate = useNavigate();
  const { isSuperAdmin, profile } = useAuthStore();

  const [agendamentos, setAgendamentos] = useState([]);
  const [abaAtiva, setAbaAtiva]         = useState('pendente');
  const [loading, setLoading]           = useState(true);
  const [erro, setErro]                 = useState(null);

  const fetchAgendamentos = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      // ─── CORREÇÃO: relação explícita via alias `tecnico` ───────────────
      // Evita o erro "more than one relationship found for 'agendamentos_preventivos'
      // and 'usuarios'" quando a tabela tem múltiplas FKs para `usuarios`.
      // A FK utilizada é `mecanico_id` — ajuste o nome se o seu schema for diferente.
      let query = supabase
        .from('agendamentos_preventivos')
        .select(`
          id,
          data_agendada,
          status,
          equipamentos ( id, nome ),
          tecnico:usuarios!mecanico_id ( id, nome_completo )
        `)
        .order('data_agendada', { ascending: abaAtiva === 'pendente' });

      if (!isSuperAdmin) query = query.eq('mecanico_id', profile.id);

      if (abaAtiva === 'pendente') {
        query = query.in('status', ['pendente', 'em_andamento']);
      } else {
        query = query.eq('status', 'concluido');
      }

      const { data, error } = await query;
      if (error) throw error;
      setAgendamentos(data ?? []);
    } catch (err) {
      setErro('Não foi possível carregar os agendamentos.');
      console.error('[Preventivas] Erro:', err.message);
    } finally {
      setLoading(false);
    }
  }, [abaAtiva, isSuperAdmin, profile?.id]);

  useEffect(() => { fetchAgendamentos(); }, [fetchAgendamentos]);

  const totalAlertas = agendamentos.filter((a) => {
    const dias = diasParaData(a.data_agendada);
    return a.status === 'pendente' && dias >= 0 && dias <= 3;
  }).length;

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {/* Header */}
      <header style={S.header}>
        <div style={S.headerTop}>
          <div>
            <p style={S.eyebrow}>Módulo 2</p>
            <h1 style={S.pageTitle}>Preventivas</h1>
          </div>
          {totalAlertas > 0 && (
            <div style={S.alertaBadge}>
              <BellIcon cor="#92400E" />
              <span>{totalAlertas} alerta{totalAlertas > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* Abas */}
        <div style={S.abasRow}>
          {ABAS.map((aba) => (
            <button
              key={aba.value}
              onClick={() => setAbaAtiva(aba.value)}
              style={{ ...S.abaBtn, ...(abaAtiva === aba.value ? S.abaBtnAtiva : {}) }}
            >
              {aba.label}
            </button>
          ))}
        </div>
      </header>

      {/* Conteúdo */}
      <main style={S.main}>
        {loading ? (
          <SkeletonList />
        ) : erro ? (
          <EstadoVazio icone="⚠️" texto={erro} acao={{ label: 'Tentar novamente', fn: fetchAgendamentos }} />
        ) : agendamentos.length === 0 ? (
          <EstadoVazio
            icone={abaAtiva === 'pendente' ? '📋' : '✅'}
            texto={abaAtiva === 'pendente' ? 'Nenhuma preventiva pendente.' : 'Nenhuma preventiva concluída.'}
          />
        ) : (
          <div style={S.lista}>
            {agendamentos.map((ag, i) => (
              <CardAgendamento
                key={ag.id}
                agendamento={ag}
                index={i}
                onClick={() => navigate(`/preventivas/${ag.id}/checklist`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Auxiliares ───────────────────────────────────────────────

function SkeletonList() {
  return (
    <div style={S.lista}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={S.skeleton}>
          <div style={{ ...S.skeletonLine, width: '60%' }} />
          <div style={{ ...S.skeletonLine, width: '40%', height: '11px' }} />
          <div style={{ ...S.skeletonLine, width: '50%', height: '11px' }} />
        </div>
      ))}
    </div>
  );
}

function EstadoVazio({ icone, texto, acao }) {
  return (
    <div style={S.estadoVazio}>
      <span style={{ fontSize: '44px' }}>{icone}</span>
      <p style={S.estadoTexto}>{texto}</p>
      {acao && <button onClick={acao.fn} style={S.btnRetry}>{acao.label}</button>}
    </div>
  );
}

// ─── Ícones ───────────────────────────────────────────────────
function GearIcon({ cor = '#64748B' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke={cor} strokeWidth="1.8"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={cor} strokeWidth="1.8"/>
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="#94A3B8" strokeWidth="2"/>
      <path d="M16 2v4M8 2v4M3 10h18" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function BellIcon({ cor = '#92400E' }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke={cor} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="7" r="4" stroke="#94A3B8" strokeWidth="2"/>
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

// ─── CSS e Estilos ────────────────────────────────────────────
const CSS = `
  @keyframes cardFadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes shimmer    { 0% { background-position:-400px 0; } 100% { background-position:400px 0; } }
`;

const S = {
  page: { minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  header: { backgroundColor: '#FFFFFF', padding: '24px 20px 0', borderBottom: '1px solid #E8EDF2', position: 'sticky', top: 0, zIndex: 10 },
  headerTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' },
  eyebrow: { margin: '0 0 2px', fontSize: '11px', fontWeight: '600', letterSpacing: '1.2px', textTransform: 'uppercase', color: '#20643F' },
  pageTitle: { margin: 0, fontSize: '26px', fontWeight: '800', color: '#0D1B2A', letterSpacing: '-0.5px' },
  alertaBadge: { display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', backgroundColor: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '20px', fontSize: '12px', fontWeight: '700', color: '#92400E' },
  abasRow: { display: 'flex', gap: '4px' },
  abaBtn: { padding: '10px 20px', border: 'none', background: 'none', fontSize: '14px', fontWeight: '600', color: '#94A3B8', cursor: 'pointer', borderBottom: '2px solid transparent', fontFamily: 'inherit', transition: 'color 0.15s, border-color 0.15s' },
  abaBtnAtiva: { color: '#20643F', borderBottomColor: '#20643F' },
  main: { padding: '16px', boxSizing: 'border-box' },
  lista: { display: 'flex', flexDirection: 'column', gap: '10px' },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: '12px',
    border: '1px solid #E8EDF2', padding: '16px',
    cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px',
    animation: 'cardFadeIn 0.3s ease both',
    WebkitTapHighlightColor: 'transparent', outline: 'none', minWidth: 0,
  },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  equipInfo: { display: 'flex', alignItems: 'center', gap: '7px', overflow: 'hidden', minWidth: 0 },
  equipNome: { fontSize: '15px', fontWeight: '700', color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.1px' },
  statusPill: { padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', flexShrink: 0, letterSpacing: '0.2px' },
  cardMid: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  dataTexto: { fontSize: '13px', color: '#475569' },
  alertaTag: { display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', backgroundColor: 'rgba(245,158,11,0.1)', color: '#92400E', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', fontSize: '11px', fontWeight: '600' },
  cardBot: { display: 'flex', alignItems: 'center', gap: '6px' },
  mecanicoNome: { fontSize: '12px', color: '#94A3B8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  verBtn: { display: 'flex', alignItems: 'center', gap: '2px', fontSize: '12px', fontWeight: '700', color: '#20643F', flexShrink: 0 },
  estadoVazio: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', gap: '12px', textAlign: 'center' },
  estadoTexto: { margin: 0, fontSize: '15px', color: '#64748B', fontWeight: '500' },
  btnRetry: { padding: '10px 20px', backgroundColor: '#20643F', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
  skeleton: { backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8EDF2', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' },
  skeletonLine: { height: '14px', borderRadius: '6px', background: 'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize: '400px 100%', animation: 'shimmer 1.4s infinite linear' },
};
