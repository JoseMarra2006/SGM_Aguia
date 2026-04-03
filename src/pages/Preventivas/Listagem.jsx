// src/pages/Preventivas/Listagem.jsx
// ADIÇÕES v3 (admin CRUD): ModalEditarAgendamento, cancelamento, ModalConfirmarCancelamento
// ADIÇÕES v4 (QR / Atalhos): defaultEquipamentoId, ?agendar=true&equipamento_id=[ID]
// INALTERADO: lógica de agendamento, checklist, filtros, abas.
// CORREÇÃO VISUAL (ícones invisíveis):
//   • Todos os SVGs têm display:'block' + flexShrink:0 explícito.
//   • EditIcon e BanIcon dentro de btnAcaoAdmin usam stroke explícito
//     compatível com a cor do botão (não dependem de herança CSS).
//   • CloseIcon, CloseSmIcon, CheckSmIcon: stroke explícito + display:'block'.
//   • BanIcon do modal de cancelamento: stroke vermelho explícito (#EF4444).
//   • Botões de apenas-ícone têm lineHeight:0 + padding:0.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  hoje.setHours(0,0,0,0);
  const alvo = new Date(dateStr + 'T00:00:00');
  return Math.round((alvo - hoje) / (1000*60*60*24));
}

function getStatusInfo(ag) {
  if (ag.status === 'concluido')    return { label:'Concluído',    cor:'#10B981', bg:'rgba(16,185,129,0.1)',  borda:'rgba(16,185,129,0.25)' };
  if (ag.status === 'cancelado')    return { label:'Cancelado',    cor:'#EF4444', bg:'rgba(239,68,68,0.1)',   borda:'rgba(239,68,68,0.25)' };
  if (ag.status === 'em_andamento') return { label:'Em andamento', cor:'#0F4C81', bg:'rgba(15,76,129,0.08)', borda:'rgba(15,76,129,0.2)' };
  const dias = diasParaData(ag.data_agendada);
  if (dias < 0)   return { label:'Atrasado',   cor:'#EF4444', bg:'rgba(239,68,68,0.08)',    borda:'rgba(239,68,68,0.2)' };
  if (dias === 0) return { label:'Hoje',        cor:'#20643F', bg:'rgba(32,100,63,0.1)',     borda:'rgba(32,100,63,0.25)' };
  if (dias <= 3)  return { label:`Em ${dias}d`, cor:'#F59E0B', bg:'rgba(245,158,11,0.1)',   borda:'rgba(245,158,11,0.25)' };
  return              { label:`Em ${dias}d`,    cor:'#64748B', bg:'rgba(100,116,139,0.08)', borda:'rgba(100,116,139,0.2)' };
}

const SUGESTOES_CHECKLIST = [
  'Verificar nível de óleo','Trocar filtro de ar','Inspecionar correias',
  'Checar sistema de refrigeração','Lubrificar rolamentos','Verificar tensão de correntes',
  'Inspecionar freios','Checar apertos e parafusos','Limpar filtros',
  'Verificar sistema elétrico','Inspecionar mangueiras','Calibrar pressão',
];

// ─── Modal: Agendar Preventiva (novo agendamento) ─────────────
function ModalAgendarPreventiva({ onClose, onSucesso, defaultEquipamentoId = '' }) {
  const [equipamentos,   setEquipamentos]   = useState([]);
  const [mecanicos,      setMecanicos]      = useState([]);
  const [equipamentoId,  setEquipamentoId]  = useState(defaultEquipamentoId);
  const [mecanicoId,     setMecanicoId]     = useState('');
  const [dataAgendada,   setDataAgendada]   = useState('');
  const [itens,          setItens]          = useState([]);
  const [novoItem,       setNovoItem]       = useState('');
  const [salvando,       setSalvando]       = useState(false);
  const [loadingDados,   setLoadingDados]   = useState(true);
  const [erros,          setErros]          = useState({});
  const [erroGlobal,     setErroGlobal]     = useState('');
  const inputItemRef = useRef(null);

  const dataMinStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    (async () => {
      setLoadingDados(true);
      try {
        const [{ data: eqs }, { data: mecs }] = await Promise.all([
          supabase.from('equipamentos').select('id, nome, status').order('nome'),
          supabase.from('usuarios').select('id, nome_completo').eq('role','mecanico').order('nome_completo'),
        ]);
        setEquipamentos(eqs ?? []);
        setMecanicos(mecs ?? []);
      } catch { setErroGlobal('Erro ao carregar dados.'); }
      finally { setLoadingDados(false); }
    })();
  }, []);

  const adicionarItem = (texto) => {
    const item = (texto ?? novoItem).trim();
    if (!item) return;
    if (itens.map(i => i.toLowerCase()).includes(item.toLowerCase())) { setNovoItem(''); return; }
    setItens(prev => [...prev, item]);
    setNovoItem('');
    inputItemRef.current?.focus();
  };

  const validar = () => {
    const e = {};
    if (!equipamentoId) e.equipamento = 'Selecione o equipamento.';
    if (!mecanicoId)    e.mecanico    = 'Selecione o mecânico.';
    if (!dataAgendada)  e.data        = 'Informe a data.';
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const handleSalvar = async () => {
    setErroGlobal('');
    if (!validar()) return;
    setSalvando(true);
    try {
      const { error } = await supabase.from('agendamentos_preventivos').insert({
        equipamento_id: equipamentoId, mecanico_id: mecanicoId,
        data_agendada: dataAgendada, status: 'pendente', itens_checklist: itens,
      });
      if (error) throw error;
      onSucesso();
    } catch (err) { setErroGlobal(`Erro ao agendar: ${err.message}`); }
    finally { setSalvando(false); }
  };

  const sugestoesFiltradas = SUGESTOES_CHECKLIST.filter(
    s => !itens.map(i => i.toLowerCase()).includes(s.toLowerCase())
  );

  return (
    <div style={M.overlay} onClick={onClose}>
      <div style={M.box} onClick={e => e.stopPropagation()}>
        <style>{CSS_MODAL}</style>
        <div style={M.header}>
          <div style={M.headerLeft}><CalendarPlusIcon /><h3 style={M.titulo}>Agendar Preventiva</h3></div>
          <button onClick={onClose} style={M.btnFechar} disabled={salvando}><CloseIcon /></button>
        </div>
        <div style={M.corpo}>
          {loadingDados ? (
            <div style={M.loading}><div style={M.spinner} /><span style={{ color:'#94A3B8', fontSize:13 }}>Carregando...</span></div>
          ) : (
            <>
              <Campo label="Equipamento *" erro={erros.equipamento}>
                <select value={equipamentoId} onChange={e => setEquipamentoId(e.target.value)}
                  style={{ ...M.select, ...(erros.equipamento ? M.inputErr : {}) }} disabled={salvando}>
                  <option value="">Selecione...</option>
                  {equipamentos.map(eq => <option key={eq.id} value={eq.id}>{eq.nome}{eq.status==='em_manutencao'?' ⚠ Em manutenção':''}</option>)}
                </select>
              </Campo>
              <Campo label="Mecânico *" erro={erros.mecanico}>
                <select value={mecanicoId} onChange={e => setMecanicoId(e.target.value)}
                  style={{ ...M.select, ...(erros.mecanico ? M.inputErr : {}) }} disabled={salvando}>
                  <option value="">Selecione...</option>
                  {mecanicos.map(m => <option key={m.id} value={m.id}>{m.nome_completo}</option>)}
                </select>
              </Campo>
              <Campo label="Data *" erro={erros.data}>
                <input type="date" value={dataAgendada} min={dataMinStr}
                  onChange={e => setDataAgendada(e.target.value)}
                  style={{ ...M.input, ...(erros.data ? M.inputErr : {}) }} disabled={salvando} />
              </Campo>
              <ItensChecklistEditor
                itens={itens} setItens={setItens}
                novoItem={novoItem} setNovoItem={setNovoItem}
                adicionarItem={adicionarItem}
                sugestoesFiltradas={sugestoesFiltradas}
                inputItemRef={inputItemRef}
                salvando={salvando}
              />
              {erroGlobal && <div style={M.erroGlobal}><AlertIcon />{erroGlobal}</div>}
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

// ─── Modal: Editar Agendamento (superadmin) ───────────────────
function ModalEditarAgendamento({ agendamento, onClose, onSucesso }) {
  if (!agendamento) return null;

  const [mecanicos,    setMecanicos]    = useState([]);
  const [mecanicoId,   setMecanicoId]   = useState(agendamento.tecnico?.id ?? '');
  const [dataAgendada, setDataAgendada] = useState(agendamento.data_agendada ?? '');
  const [itens,        setItens]        = useState(agendamento.itens_checklist ?? []);
  const [novoItem,     setNovoItem]     = useState('');
  const [salvando,     setSalvando]     = useState(false);
  const [loadingDados, setLoadingDados] = useState(true);
  const [erros,        setErros]        = useState({});
  const [erroGlobal,   setErroGlobal]   = useState('');
  const inputItemRef = useRef(null);

  useEffect(() => {
    (async () => {
      setLoadingDados(true);
      try {
        const { data: mecs } = await supabase
          .from('usuarios').select('id, nome_completo').eq('role','mecanico').order('nome_completo');
        setMecanicos(mecs ?? []);
      } catch { setErroGlobal('Erro ao carregar mecânicos.'); }
      finally { setLoadingDados(false); }
    })();
  }, []);

  const adicionarItem = (texto) => {
    const item = (texto ?? novoItem).trim();
    if (!item) return;
    if (itens.map(i => i.toLowerCase()).includes(item.toLowerCase())) { setNovoItem(''); return; }
    setItens(prev => [...prev, item]);
    setNovoItem('');
    inputItemRef.current?.focus();
  };

  const validar = () => {
    const e = {};
    if (!mecanicoId)   e.mecanico = 'Selecione o mecânico.';
    if (!dataAgendada) e.data     = 'Informe a data.';
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
        .update({ mecanico_id: mecanicoId, data_agendada: dataAgendada, itens_checklist: itens })
        .eq('id', agendamento.id);
      if (error) throw error;
      onSucesso();
    } catch (err) {
      setErroGlobal(`Erro ao salvar: ${err.message}`);
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
            <EditIcon size={16} />
            <h3 style={M.titulo}>Editar Agendamento</h3>
          </div>
          <button onClick={onClose} style={M.btnFechar} disabled={salvando}><CloseIcon /></button>
        </div>
        <div style={M.corpo}>
          <div style={M.campo}>
            <label style={M.label}>Equipamento</label>
            <div style={M.campoFixo}>{agendamento.equipamentos?.nome ?? '—'}</div>
          </div>
          {loadingDados ? (
            <div style={M.loading}><div style={M.spinner} /></div>
          ) : (
            <>
              <Campo label="Mecânico responsável *" erro={erros.mecanico}>
                <select value={mecanicoId} onChange={e => setMecanicoId(e.target.value)}
                  style={{ ...M.select, ...(erros.mecanico ? M.inputErr : {}) }} disabled={salvando}>
                  <option value="">Selecione...</option>
                  {mecanicos.map(m => <option key={m.id} value={m.id}>{m.nome_completo}</option>)}
                </select>
              </Campo>
              <Campo label="Nova data *" erro={erros.data}>
                <input type="date" value={dataAgendada}
                  onChange={e => setDataAgendada(e.target.value)}
                  style={{ ...M.input, ...(erros.data ? M.inputErr : {}) }} disabled={salvando} />
              </Campo>
              <ItensChecklistEditor
                itens={itens} setItens={setItens}
                novoItem={novoItem} setNovoItem={setNovoItem}
                adicionarItem={adicionarItem}
                sugestoesFiltradas={sugestoesFiltradas}
                inputItemRef={inputItemRef}
                salvando={salvando}
              />
              {erroGlobal && <div style={M.erroGlobal}><AlertIcon />{erroGlobal}</div>}
            </>
          )}
        </div>
        {!loadingDados && (
          <div style={M.footer}>
            <button onClick={onClose} style={M.btnSecundario} disabled={salvando}>Cancelar</button>
            <button onClick={handleSalvar} style={{ ...M.btnPrimario, opacity: salvando ? 0.7 : 1 }} disabled={salvando}>
              {salvando ? <><Spinner /> Salvando...</> : 'Salvar alterações'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal: Confirmar Cancelamento ────────────────────────────
function ModalConfirmarCancelamento({ agendamento, cancelando, onClose, onConfirmar }) {
  if (!agendamento) return null;
  const isEmAndamento = agendamento.status === 'em_andamento';
  return (
    <div style={MC.overlay} onClick={() => !cancelando && onClose()}>
      <div style={MC.box} onClick={e => e.stopPropagation()}>
        <div style={MC.icone}><BanIcon size={28} /></div>
        <h3 style={MC.titulo}>Cancelar agendamento?</h3>
        <p style={MC.subtitulo}>
          A preventiva de <strong>{agendamento.equipamentos?.nome ?? '—'}</strong>
          {' '}em{' '}<strong>{formatarData(agendamento.data_agendada)}</strong> será cancelada.
          {isEmAndamento && (
            <><br /><span style={{ color:'#F59E0B', fontWeight:600 }}>
              ⚠ Esta preventiva já está em andamento.
            </span></>
          )}
          <br /><span style={{ color:'#EF4444', fontWeight:600 }}>Esta ação não pode ser desfeita.</span>
        </p>
        <div style={MC.botoes}>
          <button onClick={onClose} style={MC.btnVoltar} disabled={cancelando}>Voltar</button>
          <button onClick={onConfirmar} disabled={cancelando}
            style={{ ...MC.btnCancelar, opacity: cancelando ? 0.7 : 1 }}>
            {cancelando ? <><Spinner /> Cancelando...</> : 'Confirmar cancelamento'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente: Editor de Itens de Checklist ─────────────────
function ItensChecklistEditor({ itens, setItens, novoItem, setNovoItem, adicionarItem, sugestoesFiltradas, inputItemRef, salvando }) {
  return (
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
              <button onClick={() => setItens(prev => prev.filter((_,i) => i !== idx))}
                style={M.btnRemoverItem} disabled={salvando} type="button"><CloseSmIcon /></button>
            </li>
          ))}
        </ul>
      )}
      <div style={M.addItemRow}>
        <input ref={inputItemRef} type="text" placeholder="Ex: Verificar nível de óleo..."
          value={novoItem}
          onChange={e => setNovoItem(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter') { e.preventDefault(); adicionarItem(); } }}
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
  );
}

// ─── Campo auxiliar ────────────────────────────────────────────
function Campo({ label, erro, children }) {
  return (
    <div style={M.campo}>
      <label style={M.label}>{label}</label>
      {children}
      {erro && <span style={M.fieldError}>{erro}</span>}
    </div>
  );
}

// ─── Card de Agendamento ──────────────────────────────────────
function CardAgendamento({ agendamento, onClick, index, isSuperAdmin, onEditar, onCancelar }) {
  const statusInfo = getStatusInfo(agendamento);
  const dias       = diasParaData(agendamento.data_agendada);

  const isConcluido   = agendamento.status === 'concluido';
  const isEmAndamento = agendamento.status === 'em_andamento';
  const isPendente    = agendamento.status === 'pendente';
  const isCancelado   = agendamento.status === 'cancelado';

  const isHoje     = dias === 0 && isPendente;
  const isAlerta   = dias > 0 && dias <= 3 && isPendente;
  const isAtrasado = dias < 0 && isPendente;
  const podeIniciar = isPendente && dias <= 0;

  const mecanicoNome = agendamento.tecnico?.nome_completo ?? '—';
  const numItens     = agendamento.itens_checklist?.length ?? 0;

  const labelAcao = () => {
    if (isConcluido || isCancelado) return null;
    if (isEmAndamento) return '▶ Continuar';
    if (isPendente && podeIniciar && !isSuperAdmin) return '▶ Iniciar checklist';
    if (isPendente && isHoje) return 'Iniciar checklist';
    if (isPendente) return 'Ver detalhes';
    return null;
  };

  const acaoLabel = labelAcao();
  const podeEditar   = isSuperAdmin && isPendente;
  const podeCancelar = isSuperAdmin && (isPendente || isEmAndamento);

  return (
    <article
      onClick={onClick}
      style={{ ...S.card, animationDelay:`${index*55}ms`, borderLeft:`4px solid ${statusInfo.cor}`, opacity:(isConcluido||isCancelado) ? 0.75 : 1 }}
      role="button" tabIndex={0} onKeyDown={e => e.key==='Enter' && onClick()}
    >
      <div style={S.cardTop}>
        <div style={S.equipInfo}>
          <GearIcon cor={statusInfo.cor} />
          <span style={S.equipNome}>{agendamento.equipamentos?.nome ?? '—'}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <span style={{ ...S.statusPill, color:statusInfo.cor, backgroundColor:statusInfo.bg, border:`1px solid ${statusInfo.borda}` }}>
            {statusInfo.label}
          </span>
          {isSuperAdmin && (podeEditar || podeCancelar) && (
            <div style={S.acoesAdmin} onClick={e => e.stopPropagation()}>
              {podeEditar && (
                <button onClick={() => onEditar(agendamento)} style={S.btnAcaoAdmin}
                  title="Editar agendamento" aria-label="Editar">
                  <EditIcon size={13} />
                </button>
              )}
              {podeCancelar && (
                <button onClick={() => onCancelar(agendamento)}
                  style={{ ...S.btnAcaoAdmin, ...S.btnAcaoAdminCancel }}
                  title="Cancelar agendamento" aria-label="Cancelar">
                  <BanIcon size={13} cor="#EF4444" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={S.cardMid}>
        <CalendarIcon />
        <span style={S.dataTexto}>
          {isHoje ? <strong>Hoje — </strong> : null}
          {formatarData(agendamento.data_agendada)}
        </span>
        {isAlerta   && <span style={S.alertaTag}><BellIcon /> Alerta</span>}
        {isAtrasado && <span style={{ ...S.alertaTag, backgroundColor:'rgba(239,68,68,0.1)', color:'#EF4444', borderColor:'rgba(239,68,68,0.25)' }}>⚠ Atrasado</span>}
        {numItens > 0 && <span style={S.itensBadge}><ChecklistIcon /> {numItens} {numItens===1?'item':'itens'}</span>}
      </div>

      <div style={S.cardBot}>
        <UserIcon />
        <span style={S.mecanicoNome}>{mecanicoNome}</span>
        {acaoLabel !== null && (
          <span style={{ ...S.verBtn, ...(podeIniciar&&!isSuperAdmin?S.verBtnIniciar:{}), ...(isEmAndamento?S.verBtnContinuar:{}) }}>
            {acaoLabel}<ChevronIcon />
          </span>
        )}
        {(isConcluido||isCancelado) && (
          <span style={S.leituraTag}>{isCancelado?'Cancelado':'Somente leitura'}</span>
        )}
      </div>
    </article>
  );
}

// ─── Tela principal ───────────────────────────────────────────
const ABAS = [
  { label:'Pendentes',  value:'pendente' },
  { label:'Concluídos', value:'concluido' },
];

export default function ListagemPreventivas() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isSuperAdmin, profile } = useAuthStore();

  const [agendamentos,  setAgendamentos]  = useState([]);
  const [abaAtiva,      setAbaAtiva]      = useState('pendente');
  const [loading,       setLoading]       = useState(true);
  const [erro,          setErro]          = useState(null);
  const [modalAberto,   setModalAberto]   = useState(false);

  const [modalEditar,      setModalEditar]      = useState(null);
  const [modalCancelar,    setModalCancelar]    = useState(null);
  const [cancelando,       setCancelando]       = useState(false);
  const [erroCancelamento, setErroCancelamento] = useState('');

  useEffect(() => {
    if (searchParams.get('agendar') === 'true' && isSuperAdmin) {
      setModalAberto(true);
    }
  }, [searchParams, isSuperAdmin]);

  const fetchAgendamentos = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      let query = supabase
        .from('agendamentos_preventivos')
        .select(`
          id, data_agendada, status, itens_checklist,
          equipamentos ( id, nome ),
          tecnico:usuarios!mecanico_id ( id, nome_completo )
        `)
        .order('data_agendada', { ascending: abaAtiva === 'pendente' });

      if (!isSuperAdmin) query = query.eq('mecanico_id', profile.id);

      if (abaAtiva === 'pendente') {
        query = query.in('status', ['pendente','em_andamento']);
      } else {
        query = query.in('status', ['concluido','cancelado']);
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

  const handleCancelar = async () => {
    if (!modalCancelar) return;
    setCancelando(true);
    setErroCancelamento('');
    try {
      const { error } = await supabase
        .from('agendamentos_preventivos')
        .update({ status: 'cancelado' })
        .eq('id', modalCancelar.id);
      if (error) throw error;
      setModalCancelar(null);
      fetchAgendamentos();
    } catch (err) {
      setErroCancelamento(`Erro ao cancelar: ${err.message}`);
      console.error('[Preventivas] Cancelamento:', err.message);
    } finally {
      setCancelando(false);
    }
  };

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
          defaultEquipamentoId={searchParams.get('equipamento_id') ?? ''}
        />
      )}
      {modalEditar && (
        <ModalEditarAgendamento
          agendamento={modalEditar}
          onClose={() => setModalEditar(null)}
          onSucesso={() => { setModalEditar(null); fetchAgendamentos(); }}
        />
      )}
      {modalCancelar && (
        <ModalConfirmarCancelamento
          agendamento={modalCancelar}
          cancelando={cancelando}
          onClose={() => setModalCancelar(null)}
          onConfirmar={handleCancelar}
        />
      )}

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
                <span>{totalAlertas} alerta{totalAlertas>1?'s':''}</span>
              </div>
            )}
            {isSuperAdmin && (
              <button onClick={() => setModalAberto(true)} style={S.btnAgendar}>
                <CalendarPlusIcon size={15} /> Agendar
              </button>
            )}
          </div>
        </div>

        {isSuperAdmin && (
          <div style={S.resumoRow}>
            <div style={S.resumoChip}>
              <span style={{ ...S.resumoNum, color:'#20643F' }}>
                {agendamentos.filter(a => a.status==='pendente'||a.status==='em_andamento').length}
              </span>
              <span style={S.resumoLabel}>Pendentes</span>
            </div>
            <div style={S.resumoDiv} />
            <div style={S.resumoChip}>
              <span style={{ ...S.resumoNum, color:'#10B981' }}>
                {agendamentos.filter(a => a.status==='concluido').length}
              </span>
              <span style={S.resumoLabel}>Concluídas</span>
            </div>
            <div style={S.resumoDiv} />
            <div style={S.resumoChip}>
              <span style={{ ...S.resumoNum, color:'#EF4444' }}>
                {agendamentos.filter(a => diasParaData(a.data_agendada)<0 && a.status==='pendente').length}
              </span>
              <span style={S.resumoLabel}>Atrasadas</span>
            </div>
          </div>
        )}

        <div style={S.abasRow}>
          {ABAS.map(aba => (
            <button key={aba.value} onClick={() => setAbaAtiva(aba.value)}
              style={{ ...S.abaBtn, ...(abaAtiva===aba.value ? S.abaBtnAtiva : {}) }}>
              {aba.label}
            </button>
          ))}
        </div>
      </header>

      <main style={S.main}>
        {loading ? (
          <SkeletonList />
        ) : erro ? (
          <EstadoVazio icone="⚠️" texto={erro} acao={{ label:'Tentar novamente', fn:fetchAgendamentos }} />
        ) : agendamentos.length === 0 ? (
          <EstadoVazio
            icone={abaAtiva==='pendente'?'📋':'✅'}
            texto={abaAtiva==='pendente'
              ? isSuperAdmin ? 'Nenhuma preventiva pendente.' : 'Nenhuma preventiva atribuída a você.'
              : 'Nenhum registro ainda.'}
            acao={isSuperAdmin && abaAtiva==='pendente'
              ? { label:'Agendar preventiva', fn:() => setModalAberto(true) } : null}
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
                onEditar={a => setModalEditar(a)}
                onCancelar={a => { setErroCancelamento(''); setModalCancelar(a); }}
              />
            ))}
          </div>
        )}

        {erroCancelamento && <div style={S.erroToast}>{erroCancelamento}</div>}
      </main>
    </div>
  );
}

// ─── Auxiliares ───────────────────────────────────────────────
function SkeletonList() {
  return (
    <div style={S.lista}>
      {Array.from({length:4}).map((_,i) => (
        <div key={i} style={S.skeleton}>
          {['60%','40%','50%'].map((w,j) => (
            <div key={j} style={{ ...S.skeletonLine, width:w, height:j===0?'14px':'11px' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function EstadoVazio({ icone, texto, acao }) {
  return (
    <div style={S.estadoVazio}>
      <span style={{ fontSize:'44px' }}>{icone}</span>
      <p style={S.estadoTexto}>{texto}</p>
      {acao && <button onClick={acao.fn} style={S.btnRetry}>{acao.label}</button>}
    </div>
  );
}

// ─── Ícones ───────────────────────────────────────────────────
// CORREÇÃO: display:'block' + flexShrink:0 em todos os SVGs.
// Strokes explícitos (sem currentColor) nos ícones de botões críticos.

function GearIcon({ cor='#64748B' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      style={{ display:'block', flexShrink:0 }}>
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke={cor} strokeWidth="1.8" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={cor} strokeWidth="1.8" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      style={{ display:'block', flexShrink:0 }}>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="#94A3B8" strokeWidth="2" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon({ cor='#92400E', size=13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ display:'block', flexShrink:0 }}>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
        stroke={cor} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      style={{ display:'block', flexShrink:0 }}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="7" r="4" stroke="#94A3B8" strokeWidth="2" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      style={{ display:'block', flexShrink:0 }}>
      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// CORREÇÃO: stroke escuro explícito — aparece sobre fundo claro dos modais
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      style={{ display:'block', flexShrink:0 }}>
      <path d="M18 6 6 18M6 6l12 12" stroke="#64748B" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// CORREÇÃO: stroke vermelho explícito no botão de remover item
function CloseSmIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      style={{ display:'block', flexShrink:0 }}>
      <path d="M18 6 6 18M6 6l12 12" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      style={{ display:'block', flexShrink:0 }}>
      <circle cx="12" cy="12" r="10" stroke="#EF4444" strokeWidth="2" />
      <path d="M12 8v4m0 4h.01" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <span style={{ display:'inline-block', width:14, height:14, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin .7s linear infinite', marginRight:7, flexShrink:0 }} />
  );
}

function CalendarPlusIcon({ size=16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ display:'block', flexShrink:0, marginRight:6 }}>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChecklistIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
      style={{ display:'block', flexShrink:0 }}>
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// CORREÇÃO: stroke verde explícito — não depende de herança CSS
function CheckSmIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      style={{ display:'block', flexShrink:0 }}>
      <path d="M20 6L9 17l-5-5" stroke="#20643F" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// CORREÇÃO: EditIcon — stroke cinza padrão no tamanho normal,
// passa `cor` para usar dentro dos botões de CRUD onde a cor varia
function EditIcon({ size=14, cor='#64748B' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ display:'block', flexShrink:0 }}>
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
        stroke={cor} strokeWidth="2" strokeLinecap="round" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke={cor} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// CORREÇÃO: BanIcon — aceita prop `cor` para contexto (modal usa vermelho, badge usa currentColor)
function BanIcon({ size=14, cor='currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ display:'block', flexShrink:0 }}>
      <circle cx="12" cy="12" r="10" stroke={cor} strokeWidth="2" />
      <path d="M4.93 4.93l14.14 14.14" stroke={cor} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ─── CSS Global ───────────────────────────────────────────────
const CSS = `
  @keyframes cardFadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes shimmer    { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
  @keyframes spin       { to { transform:rotate(360deg); } }
  @keyframes slideUp    { from { transform:translateY(100%); opacity:0; } to { transform:translateY(0); opacity:1; } }
  @keyframes fadeIn     { from { opacity:0; } to { opacity:1; } }
`;

const CSS_MODAL = `
  select:focus, input:focus, textarea:focus {
    outline:none; border-color:#20643F!important;
    box-shadow:0 0 0 3px rgba(32,100,63,0.12)!important;
  }
`;

// ─── Estilos Modal ────────────────────────────────────────────
const M = {
  overlay:    { position:'fixed', inset:0, zIndex:50, backgroundColor:'rgba(0,0,0,0.5)', backdropFilter:'blur(3px)', display:'flex', alignItems:'flex-end', justifyContent:'center', animation:'fadeIn 0.2s ease' },
  box:        { width:'100%', maxWidth:'640px', maxHeight:'92dvh', backgroundColor:'#FFFFFF', borderRadius:'20px 20px 0 0', display:'flex', flexDirection:'column', overflow:'hidden', animation:'slideUp 0.28s ease', boxShadow:'0 -8px 40px rgba(0,0,0,0.15)', fontFamily:"'DM Sans','Segoe UI',sans-serif" },
  header:     { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px 14px', borderBottom:'1px solid #F1F5F9', flexShrink:0 },
  headerLeft: { display:'flex', alignItems:'center', gap:'8px' },
  titulo:     { margin:0, fontSize:'17px', fontWeight:'800', color:'#0D1B2A', letterSpacing:'-0.2px' },
  // CORREÇÃO: lineHeight:0 + padding:0 eliminam espaço fantasma
  btnFechar:  { display:'flex', alignItems:'center', justifyContent:'center', width:'32px', height:'32px', padding:0, border:'1px solid #E2E8F0', borderRadius:'8px', background:'#F8FAFC', cursor:'pointer', lineHeight:0, flexShrink:0 },
  corpo:      { padding:'16px 20px', display:'flex', flexDirection:'column', gap:'14px', overflowY:'auto', flex:1 },
  campo:      { display:'flex', flexDirection:'column', gap:'6px' },
  label:      { fontSize:'11px', fontWeight:'700', color:'#374151', textTransform:'uppercase', letterSpacing:'0.4px', display:'flex', alignItems:'center', gap:'6px' },
  select:     { padding:'11px 13px', fontSize:'14px', border:'1.5px solid #E2E8F0', borderRadius:'9px', backgroundColor:'#FAFBFC', color:'#0D1B2A', fontFamily:'inherit', boxSizing:'border-box', width:'100%', cursor:'pointer' },
  input:      { padding:'11px 13px', fontSize:'14px', border:'1.5px solid #E2E8F0', borderRadius:'9px', backgroundColor:'#FAFBFC', color:'#0D1B2A', fontFamily:'inherit', boxSizing:'border-box', width:'100%' },
  inputErr:   { borderColor:'#FCA5A5', backgroundColor:'#FFF5F5' },
  fieldError: { fontSize:'11px', color:'#EF4444', fontWeight:'500' },
  campoFixo:  { padding:'11px 13px', fontSize:'14px', backgroundColor:'#F1F5F9', color:'#64748B', borderRadius:'9px', border:'1.5px solid transparent', fontWeight:'600' },
  checklistHeader: { display:'flex', flexDirection:'column', gap:'2px', marginBottom:'2px' },
  checklistHint:   { fontSize:'11px', color:'#94A3B8', fontWeight:'400' },
  countBadge: { padding:'1px 7px', backgroundColor:'rgba(32,100,63,0.1)', color:'#20643F', borderRadius:'20px', fontSize:'10px', fontWeight:'700', marginLeft:'4px' },
  itensList:  { margin:'0 0 8px 0', padding:0, listStyle:'none', display:'flex', flexDirection:'column', gap:'5px' },
  itemRow:    { display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', backgroundColor:'rgba(32,100,63,0.04)', borderRadius:'8px', border:'1px solid rgba(32,100,63,0.15)' },
  itemTexto:  { flex:1, fontSize:'13px', color:'#0D1B2A', fontWeight:'500' },
  // CORREÇÃO: lineHeight:0 + padding:0 no botão de remover item
  btnRemoverItem: { display:'flex', alignItems:'center', justifyContent:'center', width:'22px', height:'22px', padding:0, border:'none', background:'rgba(239,68,68,0.08)', borderRadius:'5px', cursor:'pointer', lineHeight:0, flexShrink:0 },
  addItemRow: { display:'flex', gap:'6px' },
  inputItem:  { flex:1, padding:'10px 12px', fontSize:'13px', border:'1.5px solid #E2E8F0', borderRadius:'8px', backgroundColor:'#FAFBFC', color:'#0D1B2A', fontFamily:'inherit' },
  btnAddItem: { width:'40px', height:'40px', backgroundColor:'#20643F', color:'#FFFFFF', border:'none', borderRadius:'8px', fontSize:'20px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, lineHeight:0 },
  sugestoesLabel: { fontSize:'11px', color:'#94A3B8', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.3px', marginTop:'4px' },
  sugestoesRow:   { display:'flex', flexWrap:'wrap', gap:'6px' },
  chipSugestao:   { padding:'5px 10px', border:'1.5px solid #E2E8F0', borderRadius:'20px', backgroundColor:'#FFFFFF', fontSize:'11px', fontWeight:'600', color:'#64748B', cursor:'pointer', fontFamily:'inherit', flexShrink:0 },
  erroGlobal: { display:'flex', alignItems:'center', gap:'8px', padding:'11px 13px', backgroundColor:'#FEF2F2', border:'1px solid #FECACA', borderRadius:'8px', fontSize:'13px', color:'#DC2626' },
  footer:     { padding:'14px 20px', borderTop:'1px solid #F1F5F9', display:'flex', gap:'8px', flexShrink:0 },
  btnSecundario: { flex:1, padding:'12px', backgroundColor:'#F1F5F9', color:'#64748B', border:'none', borderRadius:'9px', fontSize:'14px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' },
  btnPrimario:   { flex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'12px', backgroundColor:'#20643F', color:'#FFFFFF', border:'none', borderRadius:'9px', fontSize:'14px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' },
  loading:    { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'12px', padding:'40px' },
  spinner:    { width:'24px', height:'24px', border:'3px solid #E8EDF2', borderTopColor:'#20643F', borderRadius:'50%', animation:'spin 0.7s linear infinite' },
};

// ─── Estilos Modal Cancelamento ───────────────────────────────
const MC = {
  overlay: { position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:'24px', animation:'fadeIn 0.2s ease' },
  box:     { backgroundColor:'#FFFFFF', borderRadius:'16px', padding:'32px 28px', width:'100%', maxWidth:'380px', display:'flex', flexDirection:'column', alignItems:'center', gap:'14px', boxShadow:'0 20px 50px rgba(0,0,0,0.2)', fontFamily:"'DM Sans','Segoe UI',sans-serif" },
  icone:   { width:'60px', height:'60px', borderRadius:'50%', backgroundColor:'rgba(239,68,68,0.1)', display:'flex', alignItems:'center', justifyContent:'center' },
  titulo:  { margin:0, fontSize:'18px', fontWeight:'800', color:'#0D1B2A', textAlign:'center' },
  subtitulo: { margin:0, fontSize:'13px', color:'#64748B', textAlign:'center', lineHeight:1.6 },
  botoes:  { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', width:'100%', marginTop:'4px' },
  btnVoltar:  { padding:'12px', backgroundColor:'#F8FAFC', color:'#64748B', border:'1.5px solid #E2E8F0', borderRadius:'9px', fontSize:'13px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' },
  btnCancelar:{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'12px', backgroundColor:'#EF4444', color:'#FFFFFF', border:'none', borderRadius:'9px', fontSize:'13px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' },
};

// ─── Estilos Listagem ─────────────────────────────────────────
const S = {
  page:         { minHeight:'100dvh', backgroundColor:'#F4F7FA', fontFamily:"'DM Sans','Segoe UI',sans-serif" },
  header:       { backgroundColor:'#FFFFFF', padding:'24px 20px 0', borderBottom:'1px solid #E8EDF2', position:'sticky', top:0, zIndex:10 },
  headerTop:    { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'14px' },
  headerAcoes:  { display:'flex', alignItems:'center', gap:'8px', flexShrink:0 },
  eyebrow:      { margin:'0 0 2px', fontSize:'11px', fontWeight:'600', letterSpacing:'1.2px', textTransform:'uppercase', color:'#20643F' },
  pageTitle:    { margin:0, fontSize:'26px', fontWeight:'800', color:'#0D1B2A', letterSpacing:'-0.5px' },
  alertaBadge:  { display:'flex', alignItems:'center', gap:'5px', padding:'6px 12px', backgroundColor:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'20px', fontSize:'12px', fontWeight:'700', color:'#92400E' },
  btnAgendar:   { display:'flex', alignItems:'center', gap:'6px', padding:'9px 16px', backgroundColor:'#20643F', color:'#FFFFFF', border:'none', borderRadius:'10px', fontSize:'13px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit', flexShrink:0 },
  resumoRow:    { display:'flex', alignItems:'center', backgroundColor:'#F8FAFC', border:'1px solid #E8EDF2', borderRadius:'10px', padding:'10px 0', marginBottom:'14px', overflow:'hidden' },
  resumoChip:   { flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'2px' },
  resumoNum:    { fontSize:'20px', fontWeight:'800', letterSpacing:'-0.5px' },
  resumoLabel:  { fontSize:'10px', color:'#94A3B8', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.4px' },
  resumoDiv:    { width:'1px', backgroundColor:'#E8EDF2', alignSelf:'stretch' },
  abasRow:      { display:'flex', gap:'4px' },
  abaBtn:       { padding:'10px 20px', border:'none', background:'none', fontSize:'14px', fontWeight:'600', color:'#94A3B8', cursor:'pointer', borderBottom:'2px solid transparent', fontFamily:'inherit', transition:'color 0.15s, border-color 0.15s' },
  abaBtnAtiva:  { color:'#20643F', borderBottomColor:'#20643F' },
  main:         { padding:'16px', boxSizing:'border-box', position:'relative' },
  lista:        { display:'flex', flexDirection:'column', gap:'10px' },
  card:         { backgroundColor:'#FFFFFF', borderRadius:'12px', border:'1px solid #E8EDF2', padding:'16px', cursor:'pointer', display:'flex', flexDirection:'column', gap:'10px', animation:'cardFadeIn 0.3s ease both', WebkitTapHighlightColor:'transparent', outline:'none', minWidth:0 },
  cardTop:      { display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px' },
  equipInfo:    { display:'flex', alignItems:'center', gap:'7px', overflow:'hidden', minWidth:0 },
  equipNome:    { fontSize:'15px', fontWeight:'700', color:'#0D1B2A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', letterSpacing:'-0.1px' },
  statusPill:   { padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'700', flexShrink:0 },
  acoesAdmin:   { display:'flex', gap:'4px', flexShrink:0 },
  // CORREÇÃO: lineHeight:0 + padding:0 nos botões de CRUD do card
  btnAcaoAdmin: { display:'flex', alignItems:'center', justifyContent:'center', width:'28px', height:'28px', padding:0, backgroundColor:'rgba(13,27,42,0.07)', border:'1.5px solid #E2E8F0', borderRadius:'7px', cursor:'pointer', lineHeight:0 },
  btnAcaoAdminCancel: { backgroundColor:'rgba(239,68,68,0.08)', borderColor:'rgba(239,68,68,0.3)' },
  cardMid:      { display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' },
  dataTexto:    { fontSize:'13px', color:'#475569' },
  alertaTag:    { display:'flex', alignItems:'center', gap:'4px', padding:'2px 8px', backgroundColor:'rgba(245,158,11,0.1)', color:'#92400E', border:'1px solid rgba(245,158,11,0.25)', borderRadius:'10px', fontSize:'11px', fontWeight:'600' },
  itensBadge:   { display:'flex', alignItems:'center', gap:'4px', padding:'2px 7px', backgroundColor:'rgba(32,100,63,0.08)', color:'#20643F', border:'1px solid rgba(32,100,63,0.2)', borderRadius:'10px', fontSize:'11px', fontWeight:'600' },
  cardBot:      { display:'flex', alignItems:'center', gap:'6px' },
  mecanicoNome: { fontSize:'12px', color:'#94A3B8', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  verBtn:       { display:'flex', alignItems:'center', gap:'2px', fontSize:'12px', fontWeight:'700', color:'#20643F', flexShrink:0 },
  verBtnIniciar:{ backgroundColor:'rgba(32,100,63,0.08)', padding:'3px 8px', borderRadius:'6px' },
  verBtnContinuar:{ backgroundColor:'rgba(15,76,129,0.08)', color:'#0F4C81', padding:'3px 8px', borderRadius:'6px' },
  leituraTag:   { marginLeft:'auto', fontSize:'10px', color:'#94A3B8', fontWeight:'600', padding:'2px 7px', backgroundColor:'#F1F5F9', borderRadius:'6px', flexShrink:0 },
  estadoVazio:  { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'64px 24px', gap:'12px', textAlign:'center' },
  estadoTexto:  { margin:0, fontSize:'15px', color:'#64748B', fontWeight:'500' },
  btnRetry:     { padding:'10px 20px', backgroundColor:'#20643F', color:'#FFFFFF', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' },
  erroToast:    { position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)', backgroundColor:'#FEF2F2', border:'1px solid #FECACA', borderRadius:'10px', padding:'12px 20px', fontSize:'13px', color:'#DC2626', zIndex:200, boxShadow:'0 4px 16px rgba(0,0,0,0.12)', whiteSpace:'nowrap' },
  skeleton:     { backgroundColor:'#FFFFFF', borderRadius:'12px', border:'1px solid #E8EDF2', padding:'16px', display:'flex', flexDirection:'column', gap:'10px' },
  skeletonLine: { height:'14px', borderRadius:'6px', background:'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize:'400px 100%', animation:'shimmer 1.4s infinite linear' },
};
