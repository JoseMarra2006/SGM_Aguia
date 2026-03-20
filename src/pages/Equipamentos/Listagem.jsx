// src/pages/Equipamentos/Listagem.jsx
// ADIÇÕES v3 (Admin CRUD):
//   • Barra de ações admin abaixo de cada card (somente superadmin)
//   • Botão "Editar" → navega para Detalhes (que já tem o botão de edição)
//   • Botão "Excluir" → abre ModalExcluirEquipamento com confirmação
//   • ModalExcluirEquipamento verifica OS vinculadas antes de excluir
//   • Limpeza de imagens no bucket 'equipamentos-imagens' via Storage API
//   • extractStoragePath(): resolve o path relativo a partir da URL pública

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import CardEquipamento from '../../components/common/CardEquipamento';
import useAuthStore from '../../store/authStore';

// ─── Constantes ───────────────────────────────────────────────
const FILTROS = [
  { label: 'Todos',         value: 'todos' },
  { label: 'Em operação',   value: 'em_operacao' },
  { label: 'Em manutenção', value: 'em_manutencao' },
];

// ─── Utilitário: path relativo a partir da URL pública do Storage ──────────
function extractStoragePath(publicUrl, bucket) {
  if (!publicUrl) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  try {
    return decodeURIComponent(publicUrl.slice(idx + marker.length));
  } catch {
    return publicUrl.slice(idx + marker.length);
  }
}

// ─── Modal de Confirmação de Exclusão ─────────────────────────
function ModalExcluirEquipamento({ equipamento, onClose, onExcluido }) {
  const [excluindo, setExcluindo] = useState(false);
  const [erro,      setErro]      = useState('');
  const [aviso,     setAviso]     = useState('');
  const [checado,   setChecado]   = useState(false);

  // Checa dependências (OS vinculadas) ao montar
  useEffect(() => {
    async function verificar() {
      try {
        const { count } = await supabase
          .from('ordens_servico')
          .select('id', { count: 'exact', head: true })
          .eq('equipamento_id', equipamento.id);
        if (count > 0) {
          setAviso(
            `Não é possível excluir: este equipamento possui ${count} ` +
            `ordem(ns) de serviço vinculada(s). Conclua ou cancele as O.S. antes de excluir.`
          );
        }
      } catch { /* silencioso */ }
      setChecado(true);
    }
    verificar();
  }, [equipamento.id]);

  const handleExcluir = async () => {
    if (aviso || !checado) return;
    setErro('');
    setExcluindo(true);
    try {
      // 1. Remove imagens do bucket
      const imgs = equipamento.imagens_urls ?? [];
      if (imgs.length > 0) {
        const paths = imgs
          .map(url => extractStoragePath(url, 'equipamentos-imagens'))
          .filter(Boolean);
        if (paths.length > 0) {
          await supabase.storage.from('equipamentos-imagens').remove(paths);
        }
      }
      // 2. Exclui registro (CASCADE: pecas_equipamento, agendamentos_preventivos)
      const { error } = await supabase
        .from('equipamentos')
        .delete()
        .eq('id', equipamento.id);
      if (error) throw error;
      onExcluido();
    } catch (err) {
      setErro(`Erro ao excluir: ${err.message}`);
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div style={ME.overlay} onClick={onClose}>
      <div style={ME.box} onClick={e => e.stopPropagation()}>
        <div style={ME.icone}><TrashIcon size={28} cor="#EF4444" /></div>
        <h3 style={ME.titulo}>Excluir equipamento?</h3>
        <p style={ME.sub}>
          <strong>{equipamento.nome}</strong> será removido permanentemente,
          incluindo todas as imagens e peças cadastradas.
          Esta ação não pode ser desfeita.
        </p>

        {!checado && (
          <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>Verificando dependências...</p>
        )}
        {aviso && (
          <div style={ME.avisoBox}>
            <AlertIcon cor="#92400E" /><span>{aviso}</span>
          </div>
        )}
        {erro && (
          <div style={{ ...ME.avisoBox, backgroundColor: '#FEF2F2', borderColor: '#FECACA', color: '#DC2626' }}>
            <AlertIcon cor="#DC2626" /><span>{erro}</span>
          </div>
        )}

        <div style={ME.botoes}>
          <button onClick={onClose} style={ME.btnCancelar} disabled={excluindo}>
            Cancelar
          </button>
          <button
            onClick={handleExcluir}
            disabled={excluindo || !!aviso || !checado}
            style={{ ...ME.btnExcluir, opacity: (excluindo || !!aviso || !checado) ? 0.5 : 1 }}
          >
            {excluindo ? <><SpinnerInline />Excluindo...</> : 'Confirmar exclusão'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tela principal ───────────────────────────────────────────
export default function Listagem() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuthStore();

  const [equipamentos, setEquipamentos] = useState([]);
  const [filtro,       setFiltro]       = useState('todos');
  const [busca,        setBusca]        = useState('');
  const [loading,      setLoading]      = useState(true);
  const [erro,         setErro]         = useState(null);
  const [modalExcluir, setModalExcluir] = useState(null);

  const fetchEquipamentos = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      let query = supabase
        .from('equipamentos')
        .select('id, nome, descricao, status, imagens_urls')
        .order('nome', { ascending: true });
      if (filtro !== 'todos') query = query.eq('status', filtro);
      const { data, error } = await query;
      if (error) throw error;
      setEquipamentos(data ?? []);
    } catch (err) {
      setErro('Não foi possível carregar os equipamentos. Tente novamente.');
      console.error('[Equipamentos] Erro ao buscar:', err.message);
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useEffect(() => { fetchEquipamentos(); }, [fetchEquipamentos]);

  const equipamentosFiltrados = equipamentos.filter((eq) =>
    eq.nome.toLowerCase().includes(busca.toLowerCase().trim())
  );
  const totalOperacao   = equipamentos.filter(e => e.status === 'em_operacao').length;
  const totalManutencao = equipamentos.filter(e => e.status === 'em_manutencao').length;

  return (
    <div style={S.page}>
      <style>{CSS_GLOBAL}</style>

      {modalExcluir && (
        <ModalExcluirEquipamento
          equipamento={modalExcluir}
          onClose={() => setModalExcluir(null)}
          onExcluido={() => { setModalExcluir(null); fetchEquipamentos(); }}
        />
      )}

      {/* ── Header ── */}
      <header style={S.header}>
        <div style={S.headerTop}>
          <div>
            <p style={S.eyebrow}>Módulo 1</p>
            <h1 style={S.pageTitle}>Equipamentos</h1>
          </div>
          {isSuperAdmin && (
            <button onClick={() => navigate('/equipamentos/novo')} style={S.btnPrimary}>
              <PlusIcon /> Cadastrar
            </button>
          )}
        </div>

        <div style={S.summaryRow}>
          <div style={S.summaryChip}>
            <span style={{ ...S.summaryDot, backgroundColor: '#10B981' }} />
            <span style={S.summaryLabel}>{totalOperacao} em operação</span>
          </div>
          <div style={S.summaryChip}>
            <span style={{ ...S.summaryDot, backgroundColor: '#F59E0B' }} />
            <span style={S.summaryLabel}>{totalManutencao} em manutenção</span>
          </div>
        </div>

        <div style={S.searchWrapper}>
          <SearchIcon />
          <input
            type="text"
            placeholder="Buscar equipamento..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={S.searchInput}
          />
          {busca && (
            <button onClick={() => setBusca('')} style={S.clearBtn} aria-label="Limpar busca">
              <CloseIcon />
            </button>
          )}
        </div>

        <div style={S.filterRow}>
          {FILTROS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltro(f.value)}
              style={{ ...S.filterChip, ...(filtro === f.value ? S.filterChipActive : {}) }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Conteúdo principal ── */}
      <main style={S.main}>
        {loading ? (
          <LoadingSkeleton />
        ) : erro ? (
          <ErrorState message={erro} onRetry={fetchEquipamentos} />
        ) : equipamentosFiltrados.length === 0 ? (
          <EmptyState busca={busca} filtro={filtro} isSuperAdmin={isSuperAdmin} />
        ) : (
          <div style={S.grid}>
            {equipamentosFiltrados.map((eq, i) => (
              <div key={eq.id} style={S.cardWrapper}>
                {/* Card padrão — clique navega para detalhes */}
                <CardEquipamento {...eq} index={i} />

                {/* ── Barra de ações (somente superadmin) ── */}
                {isSuperAdmin && (
                  <div style={S.adminBar}>
                    <button
                      onClick={() => navigate(`/equipamentos/${eq.id}`)}
                      style={S.adminBtnEdit}
                      title="Ver e editar equipamento"
                    >
                      <EditIcon cor="#20643F" /> Editar
                    </button>
                    <button
                      onClick={() => setModalExcluir(eq)}
                      style={S.adminBtnDelete}
                      title="Excluir equipamento"
                    >
                      <TrashIcon cor="#EF4444" /> Excluir
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Estados auxiliares ───────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div style={S.grid}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={S.skeleton}>
          <div style={S.skeletonImg} />
          <div style={S.skeletonBody}>
            <div style={{ ...S.skeletonLine, width: '70%' }} />
            <div style={{ ...S.skeletonLine, width: '50%', height: '11px' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
function ErrorState({ message, onRetry }) {
  return (
    <div style={S.stateBox}>
      <span style={{ fontSize: '40px' }}>⚠️</span>
      <p style={S.stateText}>{message}</p>
      <button onClick={onRetry} style={S.btnRetry}>Tentar novamente</button>
    </div>
  );
}
function EmptyState({ busca, isSuperAdmin }) {
  const msg = busca ? `Nenhum resultado para "${busca}"` : 'Nenhum equipamento cadastrado nesta categoria.';
  return (
    <div style={S.stateBox}>
      <GearEmptyIcon />
      <p style={S.stateText}>{msg}</p>
      {isSuperAdmin && !busca && (
        <p style={S.stateHint}>Use o botão "Cadastrar" para adicionar o primeiro equipamento.</p>
      )}
    </div>
  );
}

// ─── Ícones ───────────────────────────────────────────────────
function PlusIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>; }
function SearchIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'#94A3B8', pointerEvents:'none' }}><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function CloseIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function GearEmptyIcon() { return <svg width="56" height="56" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="#CBD5E1" strokeWidth="1.5"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#CBD5E1" strokeWidth="1.5"/></svg>; }
function EditIcon({ cor = '#20643F' }) { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke={cor} strokeWidth="2" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke={cor} strokeWidth="2" strokeLinecap="round"/></svg>; }
function TrashIcon({ cor = '#EF4444', size = 13 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><polyline points="3 6 5 6 21 6" stroke={cor} strokeWidth="2" strokeLinecap="round"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function AlertIcon({ cor = '#92400E' }) { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={cor} strokeWidth="2" strokeLinecap="round"/><path d="M12 9v4M12 17h.01" stroke={cor} strokeWidth="2" strokeLinecap="round"/></svg>; }
function SpinnerInline() { return <span style={{ display:'inline-block', width:14, height:14, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#FFF', borderRadius:'50%', animation:'spin .7s linear infinite', marginRight:7 }} />; }

// ─── Estilos ──────────────────────────────────────────────────
const CSS_GLOBAL = `
  @keyframes cardFadeIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes shimmer    { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
  @keyframes fadeIn     { from{opacity:0} to{opacity:1} }
  @keyframes spin       { to{transform:rotate(360deg)} }
`;
const ME = {
  overlay: { position:'fixed', inset:0, zIndex:100, backgroundColor:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, animation:'fadeIn .2s ease' },
  box: { backgroundColor:'#FFFFFF', borderRadius:16, padding:'32px 28px', width:'100%', maxWidth:400, display:'flex', flexDirection:'column', alignItems:'center', gap:14, boxShadow:'0 20px 50px rgba(0,0,0,0.2)' },
  icone: { width:56, height:56, borderRadius:'50%', backgroundColor:'rgba(239,68,68,0.1)', display:'flex', alignItems:'center', justifyContent:'center' },
  titulo: { margin:0, fontSize:18, fontWeight:800, color:'#0D1B2A', letterSpacing:'-0.3px' },
  sub: { margin:0, fontSize:13, color:'#64748B', textAlign:'center', lineHeight:1.6 },
  avisoBox: { width:'100%', boxSizing:'border-box', display:'flex', alignItems:'flex-start', gap:8, padding:'11px 13px', backgroundColor:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:9, fontSize:12, color:'#92400E', fontWeight:500, lineHeight:1.5 },
  botoes: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, width:'100%', marginTop:4 },
  btnCancelar: { padding:12, backgroundColor:'#F8FAFC', color:'#64748B', border:'1.5px solid #E2E8F0', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' },
  btnExcluir: { display:'flex', alignItems:'center', justifyContent:'center', padding:12, backgroundColor:'#EF4444', color:'#FFFFFF', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' },
};
const S = {
  page: { minHeight:'100dvh', backgroundColor:'#F4F7FA', fontFamily:"'DM Sans','Segoe UI',sans-serif" },
  header: { backgroundColor:'#FFFFFF', padding:'24px 20px 0', borderBottom:'1px solid #E8EDF2', position:'sticky', top:0, zIndex:10 },
  headerTop: { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'14px' },
  eyebrow: { margin:'0 0 2px 0', fontSize:'11px', fontWeight:'600', letterSpacing:'1.2px', textTransform:'uppercase', color:'#20643F' },
  pageTitle: { margin:0, fontSize:'26px', fontWeight:'800', color:'#0D1B2A', letterSpacing:'-0.5px' },
  btnPrimary: { display:'flex', alignItems:'center', padding:'10px 18px', backgroundColor:'#20643F', color:'#FFFFFF', border:'none', borderRadius:'10px', fontSize:'13px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit', flexShrink:0 },
  summaryRow: { display:'flex', gap:'12px', marginBottom:'14px', flexWrap:'wrap' },
  summaryChip: { display:'flex', alignItems:'center', gap:'6px' },
  summaryDot: { width:'8px', height:'8px', borderRadius:'50%', flexShrink:0 },
  summaryLabel: { fontSize:'12px', color:'#64748B', fontWeight:'500' },
  searchWrapper: { position:'relative', marginBottom:'12px' },
  searchInput: { width:'100%', padding:'11px 36px 11px 40px', fontSize:'14px', border:'1.5px solid #E2E8F0', borderRadius:'10px', backgroundColor:'#F8FAFC', color:'#0D1B2A', fontFamily:'inherit', boxSizing:'border-box', outline:'none' },
  clearBtn: { position:'absolute', right:'12px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#94A3B8', padding:'4px', display:'flex' },
  filterRow: { display:'flex', gap:'8px', overflowX:'auto', paddingBottom:'12px', scrollbarWidth:'none' },
  filterChip: { padding:'6px 14px', borderRadius:'20px', border:'1.5px solid #E2E8F0', backgroundColor:'#FFFFFF', fontSize:'12px', fontWeight:'600', color:'#64748B', cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit', flexShrink:0 },
  filterChipActive: { backgroundColor:'#20643F', borderColor:'#20643F', color:'#FFFFFF' },
  main: { padding:'20px', boxSizing:'border-box' },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(min(300px,100%),1fr))', gap:'16px' },
  cardWrapper: { display:'flex', flexDirection:'column' },
  adminBar: { display:'flex', gap:6, padding:'8px 10px', backgroundColor:'#FFFFFF', border:'1px solid #E8EDF2', borderTop:'none', borderRadius:'0 0 14px 14px', justifyContent:'flex-end' },
  adminBtnEdit: { display:'flex', alignItems:'center', gap:5, padding:'6px 12px', border:'1.5px solid rgba(32,100,63,0.3)', borderRadius:7, backgroundColor:'rgba(32,100,63,0.06)', color:'#20643F', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' },
  adminBtnDelete: { display:'flex', alignItems:'center', gap:5, padding:'6px 12px', border:'1.5px solid rgba(239,68,68,0.3)', borderRadius:7, backgroundColor:'rgba(239,68,68,0.06)', color:'#EF4444', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' },
  stateBox: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'60px 24px', gap:'12px', textAlign:'center' },
  stateText: { fontSize:'15px', color:'#64748B', margin:0, fontWeight:'500' },
  stateHint: { fontSize:'13px', color:'#94A3B8', margin:0 },
  btnRetry: { marginTop:'8px', padding:'10px 20px', backgroundColor:'#20643F', color:'#FFFFFF', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' },
  skeleton: { backgroundColor:'#FFFFFF', borderRadius:'14px', overflow:'hidden', border:'1px solid #E8EDF2' },
  skeletonImg: { height:'160px', background:'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize:'400px 100%', animation:'shimmer 1.4s infinite linear' },
  skeletonBody: { padding:'16px', display:'flex', flexDirection:'column', gap:'10px' },
  skeletonLine: { height:'14px', borderRadius:'6px', background:'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize:'400px 100%', animation:'shimmer 1.4s infinite linear' },
};
