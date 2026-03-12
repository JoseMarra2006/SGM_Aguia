// src/pages/Dashboard/Pecas.jsx

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';

// ─── Modal de Cadastro/Edição ─────────────────────────────────

function ModalPeca({ peca, onClose, onSucesso }) {
  const editando = !!peca;
  const [nome, setNome]     = useState(peca?.nome ?? '');
  const [qtd, setQtd]       = useState(peca?.quantidade_estoque ?? 0);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros]   = useState({});
  const [erroGlobal, setErroGlobal] = useState('');

  const validar = () => {
    const e = {};
    if (!nome.trim())   e.nome = 'Nome da peça é obrigatório.';
    if (nome.trim().length < 2) e.nome = 'Nome muito curto.';
    if (qtd < 0)        e.qtd  = 'Quantidade não pode ser negativa.';
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const handleSalvar = async () => {
    setErroGlobal('');
    if (!validar()) return;

    setSalvando(true);
    try {
      if (editando) {
        const { error } = await supabase
          .from('pecas_oficina')
          .update({ nome: nome.trim(), quantidade_estoque: qtd })
          .eq('id', peca.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('pecas_oficina')
          .insert({ nome: nome.trim(), quantidade_estoque: qtd });
        if (error) throw error;
      }
      onSucesso();
    } catch (err) {
      setErroGlobal(`Erro ao salvar: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modalBox} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHeader}>
          <h3 style={S.modalTitulo}>{editando ? 'Editar peça' : 'Nova peça'}</h3>
          <button onClick={onClose} style={S.modalCloseBtn} disabled={salvando}>
            <CloseIcon />
          </button>
        </div>

        <div style={S.modalCorpo}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={S.fieldLabel}>Nome da peça *</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              style={{ ...S.input, ...(erros.nome ? S.inputErr : {}) }}
              placeholder="Ex: Rolamento 6205 ZZ"
              maxLength={100}
              disabled={salvando}
              autoFocus
            />
            {erros.nome && <span style={S.fieldError}>{erros.nome}</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={S.fieldLabel}>Quantidade em estoque *</label>
            <div style={S.qtdRow}>
              <button
                onClick={() => setQtd((v) => Math.max(0, v - 1))}
                style={S.qtdBtn}
                disabled={salvando || qtd <= 0}
              >−</button>
              <input
                type="number"
                min={0}
                value={qtd}
                onChange={(e) => setQtd(Math.max(0, Number(e.target.value)))}
                style={{ ...S.input, ...S.qtdInput, ...(erros.qtd ? S.inputErr : {}) }}
                disabled={salvando}
              />
              <button
                onClick={() => setQtd((v) => v + 1)}
                style={S.qtdBtn}
                disabled={salvando}
              >+</button>
            </div>
            {erros.qtd && <span style={S.fieldError}>{erros.qtd}</span>}
          </div>

          {erroGlobal && <div style={S.erroGlobal}>{erroGlobal}</div>}
        </div>

        <div style={S.modalFooter}>
          <button onClick={onClose} style={S.btnSecundario} disabled={salvando}>Cancelar</button>
          <button onClick={handleSalvar} disabled={salvando} style={{ ...S.btnPrimario, opacity: salvando ? 0.7 : 1 }}>
            {salvando ? <><Spinner /> Salvando...</> : editando ? 'Salvar alterações' : 'Cadastrar peça'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card de Peça ─────────────────────────────────────────────

function CardPeca({ peca, index, onEditar }) {
  const semEstoque  = peca.quantidade_estoque === 0;
  const estoqueB    = peca.quantidade_estoque <= 3 && peca.quantidade_estoque > 0;

  return (
    <div style={{ ...S.cardPeca, animationDelay: `${index * 45}ms` }}>
      <div style={S.cardPecaLeft}>
        <div style={{ ...S.estoqueCirculo, backgroundColor: semEstoque ? 'rgba(239,68,68,0.1)' : estoqueB ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)', border: `1px solid ${semEstoque ? 'rgba(239,68,68,0.25)' : estoqueB ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)'}` }}>
          <span style={{ ...S.estoqueNum, color: semEstoque ? '#EF4444' : estoqueB ? '#D97706' : '#10B981' }}>
            {peca.quantidade_estoque}
          </span>
        </div>
        <div style={S.pecaInfoTextos}>
          <span style={S.pecaNome}>{peca.nome}</span>
          <span style={{ ...S.estoqueStatus, color: semEstoque ? '#EF4444' : estoqueB ? '#D97706' : '#10B981' }}>
            {semEstoque ? '⚠ Sem estoque' : estoqueB ? '⚠ Estoque baixo' : 'Disponível'}
          </span>
        </div>
      </div>
      <button onClick={() => onEditar(peca)} style={S.editBtn}>
        <EditIcon />
      </button>
    </div>
  );
}

// ─── Tela principal ───────────────────────────────────────────

export default function Pecas() {
  const navigate = useNavigate();
  const [pecas, setPecas]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [busca, setBusca]             = useState('');
  const [filtroEstoque, setFiltroEstoque] = useState('todos'); // todos | baixo | zerado
  const [modalPeca, setModalPeca]     = useState(null); // null | {} (nova) | { peca } (editar)

  const fetchPecas = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pecas_oficina')
        .select('id, nome, quantidade_estoque, criado_em, atualizado_em')
        .order('nome');
      if (error) throw error;
      setPecas(data ?? []);
    } catch (err) {
      console.error('[Pecas] Erro:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPecas(); }, [fetchPecas]);

  const filtradas = pecas.filter((p) => {
    const buscaOk = p.nome.toLowerCase().includes(busca.toLowerCase());
    if (!buscaOk) return false;
    if (filtroEstoque === 'zerado') return p.quantidade_estoque === 0;
    if (filtroEstoque === 'baixo')  return p.quantidade_estoque > 0 && p.quantidade_estoque <= 3;
    return true;
  });

  const totalPecas   = pecas.length;
  const totalZeradas = pecas.filter((p) => p.quantidade_estoque === 0).length;
  const totalBaixo   = pecas.filter((p) => p.quantidade_estoque > 0 && p.quantidade_estoque <= 3).length;
  const totalItens   = pecas.reduce((acc, p) => acc + p.quantidade_estoque, 0);

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {/* Topbar */}
      <header style={S.topbar}>
        <button onClick={() => navigate('/dashboard')} style={S.backBtn}><BackIcon /></button>
        <h1 style={S.topbarTitulo}>Estoque de Peças</h1>
        <button onClick={() => setModalPeca({})} style={S.btnNovoHeader}>
          <PlusIcon /> Nova
        </button>
      </header>

      <main style={S.main}>
        {/* Cards de métricas */}
        <div style={S.metricasGrid}>
          {[
            { label: 'Tipos de peça',  valor: totalPecas,   cor: '#0F4C81', bg: 'rgba(15,76,129,0.08)' },
            { label: 'Itens em estoque', valor: totalItens, cor: '#10B981', bg: 'rgba(16,185,129,0.08)' },
            { label: 'Estoque baixo',  valor: totalBaixo,   cor: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
            { label: 'Sem estoque',    valor: totalZeradas, cor: totalZeradas > 0 ? '#EF4444' : '#10B981', bg: totalZeradas > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)' },
          ].map((m, i) => (
            <div key={i} style={{ ...S.metCard, animationDelay: `${i * 60}ms` }}>
              <span style={{ ...S.metValor, color: m.cor }}>{m.valor}</span>
              <span style={S.metLabel}>{m.label}</span>
            </div>
          ))}
        </div>

        {/* Busca */}
        <div style={S.buscaWrapper}>
          <SearchIcon />
          <input
            type="text"
            placeholder="Buscar peça..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={S.buscaInput}
          />
          {busca && <button onClick={() => setBusca('')} style={S.clearBtn}><CloseSmIcon /></button>}
        </div>

        {/* Filtros de estoque */}
        <div style={S.filtrosRow}>
          {[
            { v: 'todos',  l: 'Todas' },
            { v: 'baixo',  l: `Estoque baixo ${totalBaixo > 0 ? `(${totalBaixo})` : ''}` },
            { v: 'zerado', l: `Sem estoque ${totalZeradas > 0 ? `(${totalZeradas})` : ''}` },
          ].map((f) => (
            <button
              key={f.v}
              onClick={() => setFiltroEstoque(f.v)}
              style={{ ...S.filtroBtn, ...(filtroEstoque === f.v ? S.filtroBtnAtivo : {}) }}
            >
              {f.l}
            </button>
          ))}
        </div>

        {/* Lista de peças */}
        {loading ? (
          <SkeletonCards />
        ) : filtradas.length === 0 ? (
          <div style={S.estadoVazio}>
            <span style={{ fontSize: '40px' }}>📦</span>
            <p style={S.estadoTexto}>
              {busca ? `Nenhuma peça encontrada para "${busca}"` : 'Nenhuma peça corresponde ao filtro.'}
            </p>
          </div>
        ) : (
          <div style={S.gridPecas}>
            {filtradas.map((p, i) => (
              <CardPeca key={p.id} peca={p} index={i} onEditar={(peca) => setModalPeca({ peca })} />
            ))}
          </div>
        )}
      </main>

      {/* Modal */}
      {modalPeca !== null && (
        <ModalPeca
          peca={modalPeca?.peca ?? null}
          onClose={() => setModalPeca(null)}
          onSucesso={() => { setModalPeca(null); fetchPecas(); }}
        />
      )}
    </div>
  );
}

// ─── Auxiliares ───────────────────────────────────────────────
function SkeletonCards() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ height: '68px', borderRadius: '12px', background: 'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize: '400px', animation: 'shimmer 1.4s infinite linear' }} />
      ))}
    </div>
  );
}

// ─── Ícones ───────────────────────────────────────────────────
function BackIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function PlusIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginRight: 5 }}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>; }
function CloseIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function CloseSmIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function EditIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function SearchIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function Spinner() { return <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFF', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: 7 }} />; }

const CSS = `
  @keyframes cardFadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes shimmer    { 0% { background-position:-400px 0; } 100% { background-position:400px 0; } }
  @keyframes spin       { to { transform: rotate(360deg); } }
  @keyframes fadeIn     { from { opacity:0; } to { opacity:1; } }
  input:focus { outline:none; border-color:#0F4C81 !important; box-shadow:0 0 0 3px rgba(15,76,129,0.1) !important; }
`;
const S = {
  page: { minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  topbar: { position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', height: '56px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8EDF2' },
  backBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: 'none', background: 'none', cursor: 'pointer', color: '#0D1B2A', borderRadius: '8px', flexShrink: 0 },
  topbarTitulo: { flex: 1, margin: 0, fontSize: '17px', fontWeight: '700', color: '#0D1B2A', letterSpacing: '-0.2px' },
  btnNovoHeader: { display: 'flex', alignItems: 'center', padding: '8px 14px', backgroundColor: '#0F4C81', color: '#FFFFFF', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
  main: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '640px', margin: '0 auto', paddingBottom: '32px' },
  metricasGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' },
  metCard: { backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E8EDF2', padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', animation: 'cardFadeIn 0.35s ease both' },
  metValor: { fontSize: '22px', fontWeight: '800', letterSpacing: '-0.5px' },
  metLabel: { fontSize: '9px', color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'center', lineHeight: 1.3 },
  buscaWrapper: { position: 'relative' },
  buscaInput: { width: '100%', padding: '11px 36px 11px 38px', fontSize: '14px', border: '1.5px solid #E2E8F0', borderRadius: '10px', backgroundColor: '#FFFFFF', color: '#0D1B2A', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' },
  clearBtn: { position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px', display: 'flex' },
  filtrosRow: { display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none' },
  filtroBtn: { padding: '6px 13px', borderRadius: '20px', border: '1.5px solid #E2E8F0', backgroundColor: '#FFFFFF', fontSize: '12px', fontWeight: '600', color: '#64748B', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', flexShrink: 0 },
  filtroBtnAtivo: { backgroundColor: '#0F4C81', borderColor: '#0F4C81', color: '#FFFFFF' },
  gridPecas: { display: 'flex', flexDirection: 'column', gap: '8px' },
  cardPeca: { display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8EDF2', padding: '12px 14px', animation: 'cardFadeIn 0.3s ease both' },
  cardPecaLeft: { display: 'flex', alignItems: 'center', gap: '12px', flex: 1, overflow: 'hidden' },
  estoqueCirculo: { width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  estoqueNum: { fontSize: '20px', fontWeight: '800', letterSpacing: '-0.5px' },
  pecaInfoTextos: { flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', overflow: 'hidden' },
  pecaNome: { fontSize: '14px', fontWeight: '700', color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  estoqueStatus: { fontSize: '11px', fontWeight: '600' },
  editBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: '1.5px solid #E2E8F0', borderRadius: '8px', background: '#F8FAFC', cursor: 'pointer', color: '#64748B', flexShrink: 0 },
  estadoVazio: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', gap: '12px', textAlign: 'center' },
  estadoTexto: { margin: 0, fontSize: '14px', color: '#64748B', fontWeight: '500' },
  // Modal
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100, animation: 'fadeIn 0.2s ease' },
  modalBox: { backgroundColor: '#FFFFFF', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '640px', overflow: 'hidden' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #F1F5F9' },
  modalTitulo: { margin: 0, fontSize: '17px', fontWeight: '700', color: '#0D1B2A' },
  modalCloseBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#F8FAFC', cursor: 'pointer', color: '#64748B' },
  modalCorpo: { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' },
  modalFooter: { padding: '16px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '8px' },
  fieldLabel: { fontSize: '11px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.3px' },
  input: { padding: '11px 13px', fontSize: '14px', border: '1.5px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#FAFBFC', color: '#0D1B2A', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' },
  inputErr: { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  fieldError: { fontSize: '11px', color: '#EF4444', fontWeight: '500' },
  qtdRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  qtdBtn: { width: '42px', height: '42px', border: '1.5px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#F8FAFC', fontSize: '20px', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'inherit' },
  qtdInput: { textAlign: 'center', width: '80px', flex: 'none' },
  erroGlobal: { padding: '11px 13px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', fontSize: '13px', color: '#DC2626' },
  btnSecundario: { flex: 1, padding: '12px', backgroundColor: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
  btnPrimario: { flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backgroundColor: '#0F4C81', color: '#FFFFFF', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' },
};