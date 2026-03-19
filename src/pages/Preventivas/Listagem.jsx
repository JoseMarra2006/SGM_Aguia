// src/pages/Preventivas/Listagem.jsx
// CORREÇÕES v4 → v5 (alinhadas com Checklist.jsx v5):
//   [FIX-A] podeIniciar: condição rígida — SOMENTE status === 'pendente' E dias <= 0.
//           Status 'em_andamento' ou 'concluido' NUNCA renderiza o botão "Iniciar".
//   [FIX-B] labelAcao(): reescrita defensiva — cada branch verifica explicitamente
//           agendamento.status antes de retornar qualquer label de ação.
//           O texto "Iniciar checklist" SÓ aparece quando status === 'pendente'.
//   [FIX-C] CardAgendamento: botão de ação desativado e não renderizado para
//           status 'concluido' (já existia, mantido e reforçado).
// INALTERADO: cores, layout, responsividade, modal de agendamento, autenticação.

import { useState, useEffect, useCallback, useRef } from 'react';
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

// Status info: 'em_andamento' tratado explicitamente
function getStatusInfo(ag) {
  if (ag.status === 'concluido')    return { label: 'Concluído',    cor: '#10B981', bg: 'rgba(16,185,129,0.1)',  borda: 'rgba(16,185,129,0.25)' };
  if (ag.status === 'cancelado')    return { label: 'Cancelado',    cor: '#EF4444', bg: 'rgba(239,68,68,0.1)',   borda: 'rgba(239,68,68,0.25)' };
  if (ag.status === 'em_andamento') return { label: 'Em andamento', cor: '#0F4C81', bg: 'rgba(15,76,129,0.08)', borda: 'rgba(15,76,129,0.2)' };
  // status === 'pendente': calcula por dias
  const dias = diasParaData(ag.data_agendada);
  if (dias < 0)   return { label: 'Atrasado',   cor: '#EF4444', bg: 'rgba(239,68,68,0.08)',    borda: 'rgba(239,68,68,0.2)' };
  if (dias === 0) return { label: 'Hoje',        cor: '#20643F', bg: 'rgba(32,100,63,0.1)',     borda: 'rgba(32,100,63,0.25)' };
  if (dias <= 3)  return { label: `Em ${dias}d`, cor: '#F59E0B', bg: 'rgba(245,158,11,0.1)',   borda: 'rgba(245,158,11,0.25)' };
  return              { label: `Em ${dias}d`,    cor: '#64748B', bg: 'rgba(100,116,139,0.08)', borda: 'rgba(100,116,139,0.2)' };
}

// Itens sugeridos para o checklist
const SUGESTOES_CHECKLIST = [
  'Verificar nível de óleo', 'Trocar filtro de ar', 'Inspecionar correias',
  'Checar sistema de refrigeração', 'Lubrificar rolamentos', 'Verificar tensão de correntes',
  'Inspecionar freios', 'Checar apertos e parafusos', 'Limpar filtros',
  'Verificar sistema elétrico', 'Inspecionar mangueiras', 'Calibrar pressão',
];

// ─── Modal de Agendamento (SuperAdmin) ───────────────────────

function ModalAgendarPreventiva({ onClose, onSucesso }) {
  const [equipamentos,    setEquipamentos]    = useState([]);
  const [mecanicos,       setMecanicos]       = useState([]);
  const [equipamentoId,   setEquipamentoId]   = useState('');
  const [mecanicoId,      setMecanicoId]      = useState('');
  const [dataAgendada,    setDataAgendada]    = useState('');
  const [itens,           setItens]           = useState([]);
  const [novoItem,        setNovoItem]        = useState('');
  const [salvando,        setSalvando]        = useState(false);
  const [loadingDados,    setLoadingDados]    = useState(true);
  const [erros,           setErros]           = useState({});
  const [erroGlobal,      setErroGlobal]      = useState('');
  const [sugestaoAberta,  setSugestaoAberta]  = useState(false);
  const inputItemRef = useRef(null);

  const dataMin = new Date();
  dataMin.setDate(dataMin.getDate());
  const dataMinStr = dataMin.toISOString().split('T')[0];

  useEffect(() => {
    async function fetchDados() {
      setLoadingDados(true);
      try {
        const [{ data: eqs }, { data: mecs }] = await Promise.all([
          supabase.from('equipamentos').select('id, nome, status').order('nome'),
          supabase.from('usuarios').select('id, nome_completo').eq('role', 'mecanico').order('nome_completo'),
        ]);
        setEquipamentos(eqs ?? []);
        setMecanicos(mecs ?? []);
      } catch {
        setErroGlobal('Erro ao carregar dados. Tente novamente.');
      } finally {
        setLoadingDados(false);
      }
    }
    fetchDados();
  }, []);

  const adicionarItem = (texto) => {
    const item = (texto ?? novoItem).trim();
    if (!item) return;
    if (itens.map(i => i.toLowerCase()).includes(item.toLowerCase())) {
      setNovoItem('');
      return;
    }
    setItens(prev => [...prev, item]);
    setNovoItem('');
    setSugestaoAberta(false);
    inputItemRef.current?.focus();
  };

  const removerItem = (idx) => setItens(prev => prev.filter((_, i) => i !== idx));

  const validar = () => {
    const e = {};
    if (!equipamentoId) e.equipamento = 'Selecione o equipamento.';
    if (!mecanicoId)    e.mecanico    = 'Selecione o mecânico responsável.';
    if (!dataAgendada)  e.data        = 'Informe a data da manutenção.';
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const handleSalvar = async () => {
    setErroGlobal('');
    if (!validar()) return;
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('agendamentos_preventivos')
        .insert({
          equipamento_id:   equipamentoId,
          mecanico_id:      mecanicoId,
          data_agendada:    dataAgendada,
          status:           'pendente',
          itens_checklist:  itens,
        });
      if (error) throw error;
      onSucesso();
    } catch (err) {
      setErroGlobal(`Erro ao agendar: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  const sugestoesFiltradas = SUGESTOES_CHECKLIST.filter(
    s => !itens.map(i => i.toLowerCase()).includes(s.toLowerCase())
  );

  return (
    <div style={M.overlay} onClick={onClose}>
      <div style={M.box} onClick={e => e.stopPropagation()}>
        <style>{CSS_MODAL}</style>

        <div style={M.header}>
          <div style={M.headerLeft}>
            <CalendarPlusIcon />
            <h3 style={M.titulo}>Agendar Preventiva</h3>
          </div>
          <button onClick={onClose} style={M.btnFechar} disabled={salvando}><CloseIcon /></button>
        </div>

        <div style={M.corpo}>
          {loadingDados ? (
            <div style={M.loading}>
              <div style={M.spinner} />
              <span style={{ color: '#94A3B8', fontSize: 13 }}>Carregando dados...</span>
            </div>
          ) : (
            <>
              <div style={M.campo}>
                <label style={M.label}>Equipamento *</label>
                <select value={equipamentoId} onChange={e => setEquipamentoId(e.target.value)}
                  style={{ ...M.select, ...(erros.equipamento ? M.inputErr : {}) }} disabled={salvando}>
                  <option value="">Selecione o equipamento...</option>
                  {equipamentos.map(eq => (
                    <option key={eq.id} value={eq.id}>
                      {eq.nome}{eq.status === 'em_manutencao' ? ' ⚠ Em manutenção' : ''}
                    </option>
                  ))}
                </select>
                {erros.equipamento && <span style={M.fieldError}>{erros.equipamento}</span>}
              </div>

              <div style={M.campo}>
                <label style={M.label}>Mecânico responsável *</label>
                <select value={mecanicoId} onChange={e => setMecanicoId(e.target.value)}
                  style={{ ...M.select, ...(erros.mecanico ? M.inputErr : {}) }} disabled={salvando}>
                  <option value="">Selecione o mecânico...</option>
                  {mecanicos.map(m => (
                    <option key={m.id} value={m.id}>{m.nome_completo}</option>
                  ))}
                </select>
                {erros.mecanico && <span style={M.fieldError}>{erros.mecanico}</span>}
              </div>

              <div style={M.campo}>
                <label style={M.label}>Data da manutenção *</label>
                <input type="date" value={dataAgendada} min={dataMinStr}
                  onChange={e => setDataAgendada(e.target.value)}
                  style={{ ...M.input, ...(erros.data ? M.inputErr : {}) }} disabled={salvando} />
                {erros.data && <span style={M.fieldError}>{erros.data}</span>}
              </div>

              <div style={M.campo}>
                <div style={M.checklistHeader}>
                  <label style={M.label}>
                    Itens do checklist
                    {itens.length > 0 && <span style={M.countBadge}>{itens.length}</span>}
                  </label>
                  <span style={M.checklistHint}>Pontos que o mecânico deve verificar</span>
                </div>

                {itens.length > 0 && (
                  <ul style={M.itensList}>
                    {itens.map((item, idx) => (
                      <li key={idx} style={M.itemRow}>
                        <CheckSmIcon />
                        <span style={M.itemTexto}>{item}</span>
                        <button onClick={() => removerItem(idx)} style={M.btnRemoverItem} disabled={salvando} type="button">
                          <CloseSmIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div style={M.addItemRow}>
                  <input ref={inputItemRef} type="text" placeholder="Ex: Verificar nível de óleo..."
                    value={novoItem}
                    onChange={e => { setNovoItem(e.target.value); setSugestaoAberta(e.target.value.length > 0); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarItem(); } }}
                    style={M.inputItem} disabled={salvando} maxLength={80} autoComplete="off" />
                  <button onClick={() => adicionarItem()} style={M.btnAddItem}
                    disabled={salvando || !novoItem.trim()} type="button">+</button>
                </div>

                <div style={M.sugestoesLabel}>Sugestões rápidas:</div>
                <div style={M.sugestoesRow}>
                  {sugestoesFiltradas.slice(0, 6).map((s, i) => (
                    <button key={i} onClick={() => adicionarItem(s)} style={M.chipSugestao}
                      disabled={salvando} type="button">+ {s}</button>
                  ))}
                </div>
              </div>

              {erroGlobal && (
                <div style={M.erroGlobal}><AlertIcon /> {erroGlobal}</div>
              )}
            </>
          )}
        </div>

        {!loadingDados && (
          <div style={M.footer}>
            <button onClick={onClose} style={M.btnSecundario} disabled={salvando}>Cancelar</button>
            <button onClick={handleSalvar} style={{ ...M.btnPrimario, opacity: salvando ? 0.7 : 1 }} disabled={salvando}>
              {salvando ? <><Spinner /> Agendando...</> : <><CalendarPlusIcon size={15} /> Agendar</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Card de Agendamento ──────────────────────────────────────

function CardAgendamento({ agendamento, onClick, index, isSuperAdmin }) {
  const statusInfo = getStatusInfo(agendamento);
  const dias = diasParaData(agendamento.data_agendada);

  // Flags de estado — derivadas EXCLUSIVAMENTE de agendamento.status
  const isConcluido   = agendamento.status === 'concluido';
  const isEmAndamento = agendamento.status === 'em_andamento';
  const isPendente    = agendamento.status === 'pendente';

  const isHoje    = dias === 0 && isPendente;
  const isAlerta  = dias > 0 && dias <= 3 && isPendente;
  const isAtrasado = dias < 0 && isPendente;

  // [FIX-A] podeIniciar: CONDIÇÃO RÍGIDA — exige status === 'pendente' E data já chegou.
  // 'em_andamento' e 'concluido' NUNCA satisfazem esta condição.
  const podeIniciar = isPendente && dias <= 0;

  const mecanicoNome = agendamento.tecnico?.nome_completo ?? '—';
  const numItens = agendamento.itens_checklist?.length ?? 0;

  // [FIX-B] labelAcao: reescrita defensiva com verificação explícita de status.
  // O texto "Iniciar checklist" SÓ aparece quando status === 'pendente'.
  const labelAcao = () => {
    // Concluído: sem botão de ação
    if (isConcluido) return null;

    // Em andamento: botão para continuar o checklist já aberto
    if (isEmAndamento) return '▶ Continuar';

    // Pendente + data já chegou + não é superadmin: botão de início direto
    if (isPendente && podeIniciar && !isSuperAdmin) return '▶ Iniciar checklist';

    // Pendente + hoje + superadmin: mostra ação de início (admin pode visualizar)
    if (isPendente && isHoje) return 'Iniciar checklist';

    // Pendente mas data futura ou passada sem ser hoje: apenas navegar
    if (isPendente) return 'Ver detalhes';

    // Fallback (não deve ocorrer com os status conhecidos)
    return null;
  };

  const acaoLabel = labelAcao();

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
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      {/* Linha superior */}
      <div style={S.cardTop}>
        <div style={S.equipInfo}>
          <GearIcon cor={statusInfo.cor} />
          <span style={S.equipNome}>{agendamento.equipamentos?.nome ?? '—'}</span>
        </div>
        <span style={{ ...S.statusPill, color: statusInfo.cor, backgroundColor: statusInfo.bg, border: `1px solid ${statusInfo.borda}` }}>
          {statusInfo.label}
        </span>
      </div>

      {/* Data */}
      <div style={S.cardMid}>
        <CalendarIcon />
        <span style={S.dataTexto}>
          {isHoje ? <strong>Hoje — </strong> : null}
          {formatarData(agendamento.data_agendada)}
        </span>
        {isAlerta && (
          <span style={S.alertaTag}><BellIcon /> Alerta</span>
        )}
        {isAtrasado && (
          <span style={{ ...S.alertaTag, backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444', borderColor: 'rgba(239,68,68,0.25)' }}>
            ⚠ Atrasado
          </span>
        )}
        {numItens > 0 && (
          <span style={S.itensBadge}>
            <ChecklistIcon /> {numItens} {numItens === 1 ? 'item' : 'itens'}
          </span>
        )}
      </div>

      {/* Mecânico + ação */}
      <div style={S.cardBot}>
        <UserIcon />
        <span style={S.mecanicoNome}>{mecanicoNome}</span>

        {/* [FIX-B] Botão de ação: renderizado SOMENTE quando acaoLabel !== null */}
        {acaoLabel !== null && (
          <span style={{
            ...S.verBtn,
            // Estilo especial para "Iniciar" — apenas quando status === 'pendente'
            ...(podeIniciar && !isSuperAdmin ? S.verBtnIniciar : {}),
            // Estilo especial para "Continuar" — apenas quando status === 'em_andamento'
            ...(isEmAndamento ? S.verBtnContinuar : {}),
          }}>
            {acaoLabel}
            <ChevronIcon />
          </span>
        )}

        {/* [FIX-C] Tag de somente leitura — exclusiva para status 'concluido' */}
        {isConcluido && (
          <span style={S.leituraTag}>Somente leitura</span>
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

  const [agendamentos,    setAgendamentos]    = useState([]);
  const [abaAtiva,        setAbaAtiva]        = useState('pendente');
  const [loading,         setLoading]         = useState(true);
  const [erro,            setErro]            = useState(null);
  const [modalAberto,     setModalAberto]     = useState(false);

  const fetchAgendamentos = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      let query = supabase
        .from('agendamentos_preventivos')
        .select(`
          id,
          data_agendada,
          status,
          itens_checklist,
          equipamentos ( id, nome ),
          tecnico:usuarios!mecanico_id ( id, nome_completo )
        `)
        .order('data_agendada', { ascending: abaAtiva === 'pendente' });

      if (!isSuperAdmin) query = query.eq('mecanico_id', profile.id);

      if (abaAtiva === 'pendente') {
        // Inclui 'em_andamento' na aba de pendentes (mecânico pode continuar)
        query = query.in('status', ['pendente', 'em_andamento']);
      } else {
        // Aba concluídos: somente 'concluido' — somente leitura
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

  const totalAlertas = agendamentos.filter(a => {
    const dias = diasParaData(a.data_agendada);
    return a.status === 'pendente' && dias >= 0 && dias <= 3;
  }).length;

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {modalAberto && (
        <ModalAgendarPreventiva
          onClose={() => setModalAberto(false)}
          onSucesso={() => { setModalAberto(false); fetchAgendamentos(); }}
        />
      )}

      {/* Header */}
      <header style={S.header}>
        <div style={S.headerTop}>
          <div>
            <p style={S.eyebrow}>Módulo 2</p>
            <h1 style={S.pageTitle}>Preventivas</h1>
          </div>
          <div style={S.headerAcoes}>
            {totalAlertas > 0 && (
              <div style={S.alertaBadge}>
                <BellIcon cor="#92400E" />
                <span>{totalAlertas} alerta{totalAlertas > 1 ? 's' : ''}</span>
              </div>
            )}
            {isSuperAdmin && (
              <button onClick={() => setModalAberto(true)} style={S.btnAgendar}>
                <CalendarPlusIcon size={15} />
                Agendar
              </button>
            )}
          </div>
        </div>

        {/* Resumo (SuperAdmin) */}
        {isSuperAdmin && (
          <div style={S.resumoRow}>
            <div style={S.resumoChip}>
              <span style={{ ...S.resumoNum, color: '#20643F' }}>
                {agendamentos.filter(a => a.status === 'pendente' || a.status === 'em_andamento').length}
              </span>
              <span style={S.resumoLabel}>Pendentes</span>
            </div>
            <div style={S.resumoDiv} />
            <div style={S.resumoChip}>
              <span style={{ ...S.resumoNum, color: '#10B981' }}>
                {agendamentos.filter(a => a.status === 'concluido').length}
              </span>
              <span style={S.resumoLabel}>Concluídas</span>
            </div>
            <div style={S.resumoDiv} />
            <div style={S.resumoChip}>
              <span style={{ ...S.resumoNum, color: '#EF4444' }}>
                {agendamentos.filter(a => diasParaData(a.data_agendada) < 0 && a.status === 'pendente').length}
              </span>
              <span style={S.resumoLabel}>Atrasadas</span>
            </div>
          </div>
        )}

        {/* Abas */}
        <div style={S.abasRow}>
          {ABAS.map(aba => (
            <button key={aba.value} onClick={() => setAbaAtiva(aba.value)}
              style={{ ...S.abaBtn, ...(abaAtiva === aba.value ? S.abaBtnAtiva : {}) }}>
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
            texto={abaAtiva === 'pendente'
              ? isSuperAdmin
                ? 'Nenhuma preventiva pendente. Use "Agendar" para criar uma.'
                : 'Nenhuma preventiva atribuída a você no momento.'
              : 'Nenhuma preventiva concluída ainda.'}
            acao={isSuperAdmin && abaAtiva === 'pendente'
              ? { label: 'Agendar preventiva', fn: () => setModalAberto(true) }
              : null}
          />
        ) : (
          <div style={S.lista}>
            {agendamentos.map((ag, i) => (
              <CardAgendamento
                key={ag.id}
                agendamento={ag}
                index={i}
                isSuperAdmin={isSuperAdmin}
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
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke={cor} strokeWidth="1.8"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke={cor} strokeWidth="1.8"/></svg>;
}
function CalendarIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2" stroke="#94A3B8" strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/></svg>; }
function BellIcon({ cor = '#92400E' }) { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke={cor} strokeWidth="2" strokeLinecap="round"/></svg>; }
function UserIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="7" r="4" stroke="#94A3B8" strokeWidth="2"/></svg>; }
function ChevronIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function CloseIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function CloseSmIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function AlertIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" stroke="#EF4444" strokeWidth="2"/><path d="M12 8v4m0 4h.01" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/></svg>; }
function Spinner() { return <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite', marginRight: 7 }} />; }
function CalendarPlusIcon({ size = 16 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ marginRight: 6, flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function ChecklistIcon() { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function CheckSmIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M20 6L9 17l-5-5" stroke="#20643F" strokeWidth="2.5" strokeLinecap="round"/></svg>; }

// ─── CSS Global ───────────────────────────────────────────────
const CSS = `
  @keyframes cardFadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes shimmer    { 0% { background-position:-400px 0; } 100% { background-position:400px 0; } }
  @keyframes spin       { to { transform:rotate(360deg); } }
  @keyframes slideUp    { from { transform:translateY(100%); opacity:0; } to { transform:translateY(0); opacity:1; } }
  @keyframes fadeIn     { from { opacity:0; } to { opacity:1; } }
`;

const CSS_MODAL = `
  select:focus, input:focus, textarea:focus {
    outline: none;
    border-color: #20643F !important;
    box-shadow: 0 0 0 3px rgba(32,100,63,0.12) !important;
  }
`;

// ─── Estilos Modal ────────────────────────────────────────────
const M = {
  overlay: { position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.2s ease' },
  box: { width: '100%', maxWidth: '640px', maxHeight: '92dvh', backgroundColor: '#FFFFFF', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideUp 0.28s ease', boxShadow: '0 -8px 40px rgba(0,0,0,0.15)', fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '8px' },
  titulo: { margin: 0, fontSize: '17px', fontWeight: '800', color: '#0D1B2A', letterSpacing: '-0.2px' },
  btnFechar: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#F8FAFC', cursor: 'pointer', color: '#64748B' },
  corpo: { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', flex: 1 },
  campo: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '11px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: '6px' },
  select: { padding: '11px 13px', fontSize: '14px', border: '1.5px solid #E2E8F0', borderRadius: '9px', backgroundColor: '#FAFBFC', color: '#0D1B2A', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%', cursor: 'pointer' },
  input: { padding: '11px 13px', fontSize: '14px', border: '1.5px solid #E2E8F0', borderRadius: '9px', backgroundColor: '#FAFBFC', color: '#0D1B2A', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' },
  inputErr: { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  fieldError: { fontSize: '11px', color: '#EF4444', fontWeight: '500' },
  checklistHeader: { display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '2px' },
  checklistHint: { fontSize: '11px', color: '#94A3B8', fontWeight: '400' },
  countBadge: { padding: '1px 7px', backgroundColor: 'rgba(32,100,63,0.1)', color: '#20643F', borderRadius: '20px', fontSize: '10px', fontWeight: '700', marginLeft: '4px' },
  itensList: { margin: '0 0 8px 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '5px' },
  itemRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', backgroundColor: 'rgba(32,100,63,0.04)', borderRadius: '8px', border: '1px solid rgba(32,100,63,0.15)' },
  itemTexto: { flex: 1, fontSize: '13px', color: '#0D1B2A', fontWeight: '500' },
  btnRemoverItem: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', border: 'none', background: 'rgba(239,68,68,0.08)', borderRadius: '5px', cursor: 'pointer', color: '#EF4444', flexShrink: 0 },
  addItemRow: { display: 'flex', gap: '6px' },
  inputItem: { flex: 1, padding: '10px 12px', fontSize: '13px', border: '1.5px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#FAFBFC', color: '#0D1B2A', fontFamily: 'inherit' },
  btnAddItem: { width: '40px', height: '40px', backgroundColor: '#20643F', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'opacity 0.15s' },
  sugestoesLabel: { fontSize: '11px', color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px', marginTop: '4px' },
  sugestoesRow: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  chipSugestao: { padding: '5px 10px', border: '1.5px solid #E2E8F0', borderRadius: '20px', backgroundColor: '#FFFFFF', fontSize: '11px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, transition: 'all 0.15s' },
  erroGlobal: { display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 13px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', fontSize: '13px', color: '#DC2626' },
  footer: { padding: '14px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '8px', flexShrink: 0 },
  btnSecundario: { flex: 1, padding: '12px', backgroundColor: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
  btnPrimario: { flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backgroundColor: '#20643F', color: '#FFFFFF', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' },
  loading: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '40px' },
  spinner: { width: '24px', height: '24px', border: '3px solid #E8EDF2', borderTopColor: '#20643F', borderRadius: '50%', animation: 'spin 0.7s linear infinite' },
};

// ─── Estilos Listagem ─────────────────────────────────────────
const S = {
  page: { minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  header: { backgroundColor: '#FFFFFF', padding: '24px 20px 0', borderBottom: '1px solid #E8EDF2', position: 'sticky', top: 0, zIndex: 10 },
  headerTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' },
  headerAcoes: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 },
  eyebrow: { margin: '0 0 2px', fontSize: '11px', fontWeight: '600', letterSpacing: '1.2px', textTransform: 'uppercase', color: '#20643F' },
  pageTitle: { margin: 0, fontSize: '26px', fontWeight: '800', color: '#0D1B2A', letterSpacing: '-0.5px' },
  alertaBadge: { display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', backgroundColor: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '20px', fontSize: '12px', fontWeight: '700', color: '#92400E' },
  btnAgendar: { display: 'flex', alignItems: 'center', padding: '9px 16px', backgroundColor: '#20643F', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
  resumoRow: { display: 'flex', alignItems: 'center', backgroundColor: '#F8FAFC', border: '1px solid #E8EDF2', borderRadius: '10px', padding: '10px 0', marginBottom: '14px', overflow: 'hidden' },
  resumoChip: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' },
  resumoNum: { fontSize: '20px', fontWeight: '800', letterSpacing: '-0.5px' },
  resumoLabel: { fontSize: '10px', color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px' },
  resumoDiv: { width: '1px', backgroundColor: '#E8EDF2', alignSelf: 'stretch' },
  abasRow: { display: 'flex', gap: '4px' },
  abaBtn: { padding: '10px 20px', border: 'none', background: 'none', fontSize: '14px', fontWeight: '600', color: '#94A3B8', cursor: 'pointer', borderBottom: '2px solid transparent', fontFamily: 'inherit', transition: 'color 0.15s, border-color 0.15s' },
  abaBtnAtiva: { color: '#20643F', borderBottomColor: '#20643F' },
  main: { padding: '16px', boxSizing: 'border-box' },
  lista: { display: 'flex', flexDirection: 'column', gap: '10px' },
  card: { backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8EDF2', padding: '16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px', animation: 'cardFadeIn 0.3s ease both', WebkitTapHighlightColor: 'transparent', outline: 'none', minWidth: 0 },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  equipInfo: { display: 'flex', alignItems: 'center', gap: '7px', overflow: 'hidden', minWidth: 0 },
  equipNome: { fontSize: '15px', fontWeight: '700', color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.1px' },
  statusPill: { padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', flexShrink: 0 },
  cardMid: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  dataTexto: { fontSize: '13px', color: '#475569' },
  alertaTag: { display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', backgroundColor: 'rgba(245,158,11,0.1)', color: '#92400E', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', fontSize: '11px', fontWeight: '600' },
  itensBadge: { display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 7px', backgroundColor: 'rgba(32,100,63,0.08)', color: '#20643F', border: '1px solid rgba(32,100,63,0.2)', borderRadius: '10px', fontSize: '11px', fontWeight: '600' },
  cardBot: { display: 'flex', alignItems: 'center', gap: '6px' },
  mecanicoNome: { fontSize: '12px', color: '#94A3B8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  verBtn: { display: 'flex', alignItems: 'center', gap: '2px', fontSize: '12px', fontWeight: '700', color: '#20643F', flexShrink: 0 },
  verBtnIniciar: { backgroundColor: 'rgba(32,100,63,0.08)', padding: '3px 8px', borderRadius: '6px' },
  verBtnContinuar: { backgroundColor: 'rgba(15,76,129,0.08)', color: '#0F4C81', padding: '3px 8px', borderRadius: '6px' },
  leituraTag: { marginLeft: 'auto', fontSize: '10px', color: '#94A3B8', fontWeight: '600', padding: '2px 7px', backgroundColor: '#F1F5F9', borderRadius: '6px', flexShrink: 0 },
  estadoVazio: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', gap: '12px', textAlign: 'center' },
  estadoTexto: { margin: 0, fontSize: '15px', color: '#64748B', fontWeight: '500' },
  btnRetry: { padding: '10px 20px', backgroundColor: '#20643F', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
  skeleton: { backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8EDF2', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' },
  skeletonLine: { height: '14px', borderRadius: '6px', background: 'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize: '400px 100%', animation: 'shimmer 1.4s infinite linear' },
};
