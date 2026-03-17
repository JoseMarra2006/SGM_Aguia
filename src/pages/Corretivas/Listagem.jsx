// src/pages/Corretivas/Listagem.jsx
// ALTERAÇÕES VISUAIS:
//   • #0F4C81 → #20643F em: eyebrow, btnNova, contadorNum 'Em andamento',
//     filtroBtnAtivo, btnRetry e STATUS_CONFIG.em_andamento (cor/bg/borda/barraEsq)

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import useAuthStore from '../../store/authStore';

// ─── Helpers ──────────────────────────────────────────────────

function formatarDataHora(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function calcularDuracao(inicio, fim) {
  if (!inicio) return null;
  const ms = (fim ? new Date(fim) : new Date()) - new Date(inicio);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ALTERADO: em_andamento cor/bg/borda/barraEsq #0F4C81 → #20643F / rgba(32,100,63,…)
const STATUS_CONFIG = {
  em_andamento: { label: 'Em andamento', cor: '#20643F', bg: 'rgba(32,100,63,0.1)', borda: 'rgba(32,100,63,0.25)', barraEsq: '#20643F' },
  concluida:    { label: 'Concluída',    cor: '#10B981', bg: 'rgba(16,185,129,0.1)', borda: 'rgba(16,185,129,0.25)', barraEsq: '#10B981' },
  cancelada:    { label: 'Cancelada',    cor: '#94A3B8', bg: 'rgba(148,163,184,0.1)', borda: 'rgba(148,163,184,0.25)', barraEsq: '#CBD5E1' },
};

const FILTROS = [
  { label: 'Todas',        value: 'todas' },
  { label: 'Em andamento', value: 'em_andamento' },
  { label: 'Concluídas',   value: 'concluida' },
  { label: 'Canceladas',   value: 'cancelada' },
];

// ─── Card de OS ───────────────────────────────────────────────

function CardOS({ os, index, onClick }) {
  const cfg = STATUS_CONFIG[os.status] ?? STATUS_CONFIG.em_andamento;
  const duracao = calcularDuracao(os.inicio_em, os.fim_em);

  return (
    <article
      onClick={onClick}
      style={{ ...S.card, borderLeft: `4px solid ${cfg.barraEsq}`, animationDelay: `${index * 55}ms` }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {/* Linha 1: Equipamento + status */}
      <div style={S.cardTop}>
        <div style={S.equipRow}>
          <WrenchIcon cor={cfg.cor} />
          <span style={S.equipNome}>{os.equipamentos?.nome ?? '—'}</span>
        </div>
        <span style={{ ...S.statusPill, color: cfg.cor, backgroundColor: cfg.bg, border: `1px solid ${cfg.borda}` }}>
          {cfg.label}
        </span>
      </div>

      {/* Linha 2: Problema */}
      <p style={S.problemaTexto}>{os.problema}</p>

      {/* Linha 3: Solicitante + data + duração */}
      <div style={S.cardBot}>
        <span style={S.metaItem}><UserIcon /> {os.solicitante}</span>
        <span style={S.metaDot} />
        <span style={S.metaItem}><CalendarIcon /> {formatarDataHora(os.inicio_em)}</span>
        {duracao && (
          <>
            <span style={S.metaDot} />
            <span style={S.metaItem}><TimerIcon /> {duracao}</span>
          </>
        )}
      </div>

      {/* Mecânico */}
      <div style={S.mecRow}>
        <MecIcon />
        <span style={S.mecNome}>{os.usuarios?.nome_completo ?? '—'}</span>
        <ChevronIcon />
      </div>
    </article>
  );
}

// ─── Tela principal ───────────────────────────────────────────

export default function ListagemCorretivas() {
  const navigate = useNavigate();
  const { isSuperAdmin, profile } = useAuthStore();

  const [ordens, setOrdens] = useState([]);
  const [filtro, setFiltro] = useState('todas');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [contadores, setContadores] = useState({ em_andamento: 0, concluida: 0, cancelada: 0 });

  const fetchOrdens = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      let query = supabase
        .from('ordens_servico')
        .select(`
          id, problema, solicitante, status, inicio_em, fim_em,
          equipamentos ( id, nome ),
          usuarios     ( id, nome_completo )
        `)
        .order('inicio_em', { ascending: false });

      if (!isSuperAdmin) query = query.eq('mecanico_id', profile.id);
      if (filtro !== 'todas') query = query.eq('status', filtro);

      const { data, error } = await query;
      if (error) throw error;
      setOrdens(data ?? []);

      let qCount = supabase.from('ordens_servico').select('status');
      if (!isSuperAdmin) qCount = qCount.eq('mecanico_id', profile.id);
      const { data: todos } = await qCount;
      if (todos) {
        const cnt = { em_andamento: 0, concluida: 0, cancelada: 0 };
        todos.forEach((o) => { if (cnt[o.status] !== undefined) cnt[o.status]++; });
        setContadores(cnt);
      }
    } catch (err) {
      setErro('Não foi possível carregar as ordens de serviço.');
      console.error('[Corretivas] Erro:', err.message);
    } finally {
      setLoading(false);
    }
  }, [filtro, isSuperAdmin, profile?.id]);

  useEffect(() => { fetchOrdens(); }, [fetchOrdens]);

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {/* Header */}
      <header style={S.header}>
        <div style={S.headerTop}>
          <div>
            {/* ALTERADO: color #0F4C81 → #20643F */}
            <p style={S.eyebrow}>Módulo 3</p>
            <h1 style={S.pageTitle}>Ordens de Serviço</h1>
          </div>
          {/* ALTERADO: backgroundColor #0F4C81 → #20643F */}
          <button onClick={() => navigate('/corretivas/nova')} style={S.btnNova}>
            <PlusIcon /> Nova OS
          </button>
        </div>

        {/* Contadores */}
        <div style={S.contadoresRow}>
          <div style={S.contador}>
            {/* ALTERADO: color #0F4C81 → #20643F */}
            <span style={{ ...S.contadorNum, color: '#20643F' }}>{contadores.em_andamento}</span>
            <span style={S.contadorLabel}>Em andamento</span>
          </div>
          <div style={S.contadorDiv} />
          <div style={S.contador}>
            <span style={{ ...S.contadorNum, color: '#10B981' }}>{contadores.concluida}</span>
            <span style={S.contadorLabel}>Concluídas</span>
          </div>
          <div style={S.contadorDiv} />
          <div style={S.contador}>
            <span style={{ ...S.contadorNum, color: '#94A3B8' }}>{contadores.cancelada}</span>
            <span style={S.contadorLabel}>Canceladas</span>
          </div>
        </div>

        {/* Filtros */}
        <div style={S.filtrosRow}>
          {FILTROS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltro(f.value)}
              style={{ ...S.filtroBtn, ...(filtro === f.value ? S.filtroBtnAtivo : {}) }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {/* Lista */}
      <main style={S.main}>
        {loading ? (
          <SkeletonList />
        ) : erro ? (
          <EstadoVazio icone="⚠️" texto={erro} acao={{ label: 'Tentar novamente', fn: fetchOrdens }} />
        ) : ordens.length === 0 ? (
          <EstadoVazio
            icone="🔧"
            texto="Nenhuma ordem de serviço encontrada."
            acao={{ label: 'Abrir nova OS', fn: () => navigate('/corretivas/nova') }}
          />
        ) : (
          <div style={S.lista}>
            {ordens.map((os, i) => (
              <CardOS key={os.id} os={os} index={i} onClick={() => navigate(`/corretivas/${os.id}`)} />
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={S.skeleton}>
          {[65, 90, 50].map((w, j) => (
            <div key={j} style={{ ...S.skeletonLine, width: `${w}%`, height: j === 1 ? '12px' : '14px' }} />
          ))}
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
function WrenchIcon({ cor = '#64748B' }) { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke={cor} strokeWidth="2" strokeLinecap="round"/></svg>; }
function UserIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="7" r="4" stroke="#94A3B8" strokeWidth="2"/></svg>; }
function CalendarIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2" stroke="#94A3B8" strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/></svg>; }
function TimerIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" stroke="#94A3B8" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/></svg>; }
function MecIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function PlusIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>; }
function ChevronIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto' }}><path d="M9 18l6-6-6-6" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round"/></svg>; }

// ─── CSS e Estilos ────────────────────────────────────────────
const CSS = `
  @keyframes cardFadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes shimmer    { 0% { background-position:-400px 0; } 100% { background-position:400px 0; } }
`;
const S = {
  page: { minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  header: { backgroundColor: '#FFFFFF', padding: '24px 20px 0', borderBottom: '1px solid #E8EDF2', position: 'sticky', top: 0, zIndex: 10 },
  headerTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' },
  // ALTERADO: color #0F4C81 → #20643F
  eyebrow: { margin: '0 0 2px', fontSize: '11px', fontWeight: '600', letterSpacing: '1.2px', textTransform: 'uppercase', color: '#20643F' },
  pageTitle: { margin: 0, fontSize: '26px', fontWeight: '800', color: '#0D1B2A', letterSpacing: '-0.5px' },
  // ALTERADO: backgroundColor #0F4C81 → #20643F
  btnNova: { display: 'flex', alignItems: 'center', padding: '10px 18px', backgroundColor: '#20643F', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
  contadoresRow: { display: 'flex', alignItems: 'center', gap: '0', marginBottom: '16px', backgroundColor: '#F8FAFC', border: '1px solid #E8EDF2', borderRadius: '10px', padding: '12px 0', overflow: 'hidden' },
  contador: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' },
  contadorNum: { fontSize: '22px', fontWeight: '800', letterSpacing: '-0.5px' },
  contadorLabel: { fontSize: '10px', color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'center' },
  contadorDiv: { width: '1px', backgroundColor: '#E8EDF2', alignSelf: 'stretch' },
  filtrosRow: { display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '12px', scrollbarWidth: 'none' },
  filtroBtn: { padding: '6px 14px', borderRadius: '20px', border: '1.5px solid #E2E8F0', backgroundColor: '#FFFFFF', fontSize: '12px', fontWeight: '600', color: '#64748B', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', flexShrink: 0 },
  // ALTERADO: backgroundColor/borderColor #0F4C81 → #20643F
  filtroBtnAtivo: { backgroundColor: '#20643F', borderColor: '#20643F', color: '#FFFFFF' },
  main: { padding: '16px' },
  lista: { display: 'flex', flexDirection: 'column', gap: '10px' },
  card: { backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8EDF2', padding: '16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', animation: 'cardFadeIn 0.3s ease both', WebkitTapHighlightColor: 'transparent', outline: 'none', minWidth: 0 },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  equipRow: { display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', minWidth: 0 },
  equipNome: { fontSize: '15px', fontWeight: '700', color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  statusPill: { padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', flexShrink: 0 },
  problemaTexto: { margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  cardBot: { display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' },
  metaItem: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94A3B8' },
  metaDot: { width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#CBD5E1' },
  mecRow: { display: 'flex', alignItems: 'center', gap: '5px', paddingTop: '6px', borderTop: '1px solid #F1F5F9' },
  mecNome: { fontSize: '12px', color: '#64748B', fontWeight: '500' },
  estadoVazio: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', gap: '12px', textAlign: 'center' },
  estadoTexto: { margin: 0, fontSize: '15px', color: '#64748B', fontWeight: '500' },
  // ALTERADO: backgroundColor #0F4C81 → #20643F
  btnRetry: { padding: '10px 20px', backgroundColor: '#20643F', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
  skeleton: { backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8EDF2', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' },
  skeletonLine: { height: '14px', borderRadius: '6px', background: 'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize: '400px 100%', animation: 'shimmer 1.4s infinite linear' },
};