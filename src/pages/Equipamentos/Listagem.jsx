// src/pages/Equipamentos/Listagem.jsx

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import CardEquipamento from '../../components/common/CardEquipamento';
import useAuthStore from '../../store/authStore';

// ─── Constantes ───────────────────────────────────────────────
const FILTROS = [
  { label: 'Todos', value: 'todos' },
  { label: 'Em operação', value: 'em_operacao' },
  { label: 'Em manutenção', value: 'em_manutencao' },
];

export default function Listagem() {
  const navigate = useNavigate();
  const { isSuperAdmin, profile } = useAuthStore();

  const [equipamentos, setEquipamentos] = useState([]);
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  // ─── Busca dados do Supabase ────────────────────────────────
  const fetchEquipamentos = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      let query = supabase
        .from('equipamentos')
        .select('id, nome, descricao, status, imagens_urls')
        .order('nome', { ascending: true });

      if (filtro !== 'todos') {
        query = query.eq('status', filtro);
      }

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

  useEffect(() => {
    fetchEquipamentos();
  }, [fetchEquipamentos]);

  // ─── Filtragem local por nome (busca) ───────────────────────
  const equipamentosFiltrados = equipamentos.filter((eq) =>
    eq.nome.toLowerCase().includes(busca.toLowerCase().trim())
  );

  // ─── Contadores para os filtros ─────────────────────────────
  const totalOperacao = equipamentos.filter((e) => e.status === 'em_operacao').length;
  const totalManutencao = equipamentos.filter((e) => e.status === 'em_manutencao').length;

  return (
    <div style={S.page}>
      <style>{CSS_GLOBAL}</style>

      {/* ── Header ── */}
      <header style={S.header}>
        <div style={S.headerTop}>
          <div>
            <p style={S.eyebrow}>Módulo 1</p>
            <h1 style={S.pageTitle}>Equipamentos</h1>
          </div>
          {isSuperAdmin && (
            <button
              onClick={() => navigate('/equipamentos/novo')}
              style={S.btnPrimary}
            >
              <PlusIcon />
              Cadastrar
            </button>
          )}
        </div>

        {/* Sumário de status */}
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

        {/* Campo de busca */}
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

        {/* Filtros por status */}
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
              <CardEquipamento
                key={eq.id}
                {...eq}
                index={i}
              />
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

function EmptyState({ busca, filtro, isSuperAdmin }) {
  const msg = busca
    ? `Nenhum resultado para "${busca}"`
    : 'Nenhum equipamento cadastrado nesta categoria.';
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
function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'#94A3B8', pointerEvents:'none' }}>
      <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
      <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function GearEmptyIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="#CBD5E1" strokeWidth="1.5"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="#CBD5E1" strokeWidth="1.5"/>
    </svg>
  );
}

// ─── Estilos ──────────────────────────────────────────────────
const CSS_GLOBAL = `
  @keyframes cardFadeIn {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
`;

const S = {
  page: {
    minHeight: '100dvh',
    backgroundColor: '#F4F7FA',
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: '24px 20px 0',
    borderBottom: '1px solid #E8EDF2',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '14px',
  },
  eyebrow: {
    margin: '0 0 2px 0',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '1.2px',
    textTransform: 'uppercase',
    color: '#0F4C81',
  },
  pageTitle: {
    margin: 0,
    fontSize: '26px',
    fontWeight: '800',
    color: '#0D1B2A',
    letterSpacing: '-0.5px',
  },
  btnPrimary: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 18px',
    backgroundColor: '#0F4C81',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  summaryRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '14px',
  },
  summaryChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  summaryDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#64748B',
    fontWeight: '500',
  },
  searchWrapper: {
    position: 'relative',
    marginBottom: '12px',
  },
  searchInput: {
    width: '100%',
    padding: '11px 36px 11px 40px',
    fontSize: '14px',
    border: '1.5px solid #E2E8F0',
    borderRadius: '10px',
    backgroundColor: '#F8FAFC',
    color: '#0D1B2A',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    outline: 'none',
  },
  clearBtn: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94A3B8',
    padding: '4px',
    display: 'flex',
  },
  filterRow: {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto',
    paddingBottom: '12px',
    scrollbarWidth: 'none',
  },
  filterChip: {
    padding: '6px 14px',
    borderRadius: '20px',
    border: '1.5px solid #E2E8F0',
    backgroundColor: '#FFFFFF',
    fontSize: '12px',
    fontWeight: '600',
    color: '#64748B',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  filterChipActive: {
    backgroundColor: '#0F4C81',
    borderColor: '#0F4C81',
    color: '#FFFFFF',
  },
  main: {
    padding: '20px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
  },
  stateBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 24px',
    gap: '12px',
    textAlign: 'center',
  },
  stateText: {
    fontSize: '15px',
    color: '#64748B',
    margin: 0,
    fontWeight: '500',
  },
  stateHint: {
    fontSize: '13px',
    color: '#94A3B8',
    margin: 0,
  },
  btnRetry: {
    marginTop: '8px',
    padding: '10px 20px',
    backgroundColor: '#0F4C81',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  skeleton: {
    backgroundColor: '#FFFFFF',
    borderRadius: '14px',
    overflow: 'hidden',
    border: '1px solid #E8EDF2',
  },
  skeletonImg: {
    height: '160px',
    background: 'linear-gradient(90deg, #F0F4F8 25%, #E8EDF2 50%, #F0F4F8 75%)',
    backgroundSize: '400px 100%',
    animation: 'shimmer 1.4s infinite linear',
  },
  skeletonBody: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  skeletonLine: {
    height: '14px',
    borderRadius: '6px',
    background: 'linear-gradient(90deg, #F0F4F8 25%, #E8EDF2 50%, #F0F4F8 75%)',
    backgroundSize: '400px 100%',
    animation: 'shimmer 1.4s infinite linear',
  },
};