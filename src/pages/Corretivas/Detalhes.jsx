// src/pages/Corretivas/Detalhes.jsx
// ALTERAÇÕES v3 (Fila Aberta):
//   • podeEditar: qualquer usuário autenticado pode editar O.S. em andamento
//     (era restrito ao mecânico designado)
//   • Query: inclui aberto_usuario e finalizado_usuario via FK hints
//   • handleFinalizar/handleCancelar: grava finalizado_por = profile.id
//   • salvarProgresso: registra nome do usuário atual no histórico
//   • InfoGrid: exibe "Aberto por" + "Solicitante" + "Finalizado por" (quando aplicável)
//   • Banner "Fila Aberta": exibido quando O.S. ainda não tem mecânico designado
// PRESERVADO: Linha do Tempo, SecaoPecas, timer, offline, notificações, design.

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import useAuthStore from '../../store/authStore';
import useAppStore from '../../store/appStore';

// ─── Helpers ──────────────────────────────────────────────────

function formatarDataHora(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

function formatarDuracao(segundos) {
  if (!segundos || segundos < 0) return '—';
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const STATUS_CONFIG = {
  em_andamento: { label:'Em andamento', cor:'#20643F', bg:'rgba(32,100,63,0.1)',   borda:'rgba(32,100,63,0.25)' },
  concluida:    { label:'Concluída',    cor:'#10B981', bg:'rgba(16,185,129,0.1)',  borda:'rgba(16,185,129,0.25)' },
  cancelada:    { label:'Cancelada',    cor:'#94A3B8', bg:'rgba(148,163,184,0.1)', borda:'rgba(148,163,184,0.25)' },
};

const ACAO_CONFIG = {
  criada:          { emoji:'🔧', label:'O.S. Criada',     cor:'#20643F', bg:'rgba(32,100,63,0.10)' },
  atualizada:      { emoji:'✏️',  label:'Progresso Salvo',  cor:'#0F4C81', bg:'rgba(15,76,129,0.10)' },
  concluida:       { emoji:'✅', label:'O.S. Concluída',   cor:'#10B981', bg:'rgba(16,185,129,0.10)' },
  cancelada:       { emoji:'🚫', label:'O.S. Cancelada',   cor:'#94A3B8', bg:'rgba(148,163,184,0.10)' },
  peca_adicionada: { emoji:'⚙️', label:'Peça Adicionada',  cor:'#F59E0B', bg:'rgba(245,158,11,0.10)' },
  reaberta:        { emoji:'🔄', label:'O.S. Reaberta',    cor:'#8B5CF6', bg:'rgba(139,92,246,0.10)' },
};

// ─── Seção de Peças ───────────────────────────────────────────

function SecaoPecas({ osId, equipamentoId, status, userId, onPecaAdicionada }) {
  const [pecasEquip,   setPecasEquip]   = useState([]);
  const [pecasOficina, setPecasOficina] = useState([]);
  const [utilizadas,   setUtilizadas]   = useState([]);
  const [tipoPeca,     setTipoPeca]     = useState('equipamento');
  const [pecaSel,      setPecaSel]      = useState('');
  const [qtd,          setQtd]          = useState(1);
  const [salvando,     setSalvando]     = useState(false);
  const [erro,         setErro]         = useState('');

  const isFinalizada = status !== 'em_andamento';

  useEffect(() => {
    async function fetchPecas() {
      const [{ data: peqs }, { data: pofs }, { data: usadas }] = await Promise.all([
        supabase.from('pecas_equipamento').select('id, nome').eq('equipamento_id', equipamentoId).order('nome'),
        supabase.from('pecas_oficina').select('id, nome, quantidade_estoque').order('nome'),
        supabase.from('os_pecas_utilizadas').select('id, tipo_peca, peca_id, quantidade').eq('ordem_servico_id', osId),
      ]);
      setPecasEquip(peqs ?? []);
      setPecasOficina(pofs ?? []);
      const todas = [...(peqs ?? []), ...(pofs ?? [])];
      setUtilizadas((usadas ?? []).map(u => ({ ...u, nome: todas.find(p => p.id === u.peca_id)?.nome ?? '—' })));
    }
    if (osId && equipamentoId) fetchPecas();
  }, [osId, equipamentoId]);

  const opcoes = tipoPeca === 'equipamento' ? pecasEquip : pecasOficina;

  const handleAdicionar = async () => {
    setErro('');
    if (!pecaSel) { setErro('Selecione uma peça.'); return; }
    if (qtd < 1)  { setErro('Quantidade deve ser ao menos 1.'); return; }
    if (tipoPeca === 'oficina') {
      const peca = pecasOficina.find(p => p.id === pecaSel);
      if (peca && peca.quantidade_estoque < qtd) { setErro(`Estoque insuficiente. Disponível: ${peca.quantidade_estoque}`); return; }
    }
    setSalvando(true);
    try {
      const { error } = await supabase.from('os_pecas_utilizadas')
        .insert({ ordem_servico_id: osId, tipo_peca: tipoPeca, peca_id: pecaSel, quantidade: qtd });
      if (error) throw error;
      const nomePeca = opcoes.find(p => p.id === pecaSel)?.nome ?? '—';
      setUtilizadas(prev => [...prev, { tipo_peca: tipoPeca, peca_id: pecaSel, quantidade: qtd, nome: nomePeca }]);
      await supabase.from('historico_os').insert({
        os_id: osId, usuario_id: userId, acao: 'peca_adicionada',
        descricao: `Peça adicionada: ${nomePeca} (qtd: ${qtd}, tipo: ${tipoPeca}).`,
      });
      onPecaAdicionada?.();
      setPecaSel(''); setQtd(1);
      if (tipoPeca === 'oficina') {
        setPecasOficina(prev => prev.map(p => p.id === pecaSel ? { ...p, quantidade_estoque: p.quantidade_estoque - qtd } : p));
      }
    } catch (err) { setErro(`Erro ao adicionar peça: ${err.message}`); }
    finally { setSalvando(false); }
  };

  return (
    <div style={SP.wrapper}>
      <div style={SP.titulo}><WrenchSmIcon /><span>Peças utilizadas</span>{utilizadas.length > 0 && <span style={SP.countBadge}>{utilizadas.length}</span>}</div>
      {utilizadas.length > 0 && (
        <ul style={SP.lista}>
          {utilizadas.map((u, i) => (
            <li key={i} style={SP.item}>
              <div style={SP.itemInfo}><span style={SP.itemNome}>{u.nome}</span><span style={SP.itemTipo}>{u.tipo_peca === 'equipamento' ? 'Equip.' : 'Oficina'}</span></div>
              <span style={SP.itemQtd}>× {u.quantidade}</span>
            </li>
          ))}
        </ul>
      )}
      {!isFinalizada && (
        <div style={SP.addForm}>
          <div style={SP.tipoToggle}>
            {['equipamento','oficina'].map(t => (
              <button key={t} onClick={() => { setTipoPeca(t); setPecaSel(''); }}
                style={{ ...SP.tipoBtn, ...(tipoPeca===t ? SP.tipoBtnAtivo : {}) }}>
                {t === 'equipamento' ? 'Do equipamento' : 'Da oficina'}
              </button>
            ))}
          </div>
          <div style={SP.addRow}>
            <select value={pecaSel} onChange={e => setPecaSel(e.target.value)} style={SP.select} disabled={salvando}>
              <option value="">Selecione...</option>
              {opcoes.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nome}{p.quantidade_estoque !== undefined ? ` (estoque: ${p.quantidade_estoque})` : ''}
                </option>
              ))}
            </select>
            <input type="number" min={1} value={qtd} onChange={e => setQtd(Number(e.target.value))} style={SP.qtdInput} disabled={salvando} />
            <button onClick={handleAdicionar} disabled={salvando} style={SP.addBtn}>{salvando ? '...' : '+'}</button>
          </div>
          {erro && <span style={SP.erro}>{erro}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Linha do Tempo ───────────────────────────────────────────

function Timeline({ historico, loading }) {
  if (loading) {
    return (
      <div style={TL.skeletonWrapper}>
        {[80,60,75].map((w,i) => (
          <div key={i} style={{ display:'flex', gap:12, marginBottom:18 }}>
            <div style={{ width:36, height:36, borderRadius:'50%', flexShrink:0, background:'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize:'400px', animation:'shimmer 1.4s infinite linear' }} />
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6, paddingTop:4 }}>
              <div style={{ height:13, width:`${w}%`, borderRadius:6, background:'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize:'400px', animation:'shimmer 1.4s infinite linear' }} />
              <div style={{ height:11, width:'40%', borderRadius:6, background:'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize:'400px', animation:'shimmer 1.4s infinite linear' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (historico.length === 0) return <p style={{ margin:0, fontSize:13, color:'#94A3B8', fontStyle:'italic' }}>Nenhum evento registrado ainda.</p>;

  return (
    <div style={TL.wrapper}>
      {historico.map((item, i) => {
        const cfg = ACAO_CONFIG[item.acao] ?? { emoji:'📝', label:item.acao, cor:'#64748B', bg:'#F8FAFC' };
        const isLast = i === historico.length - 1;
        return (
          <div key={item.id} style={TL.item}>
            <div style={TL.leftCol}>
              <div style={{ ...TL.ponto, backgroundColor:cfg.bg, border:`2px solid ${cfg.cor}` }}>
                <span style={{ fontSize:14, lineHeight:1 }}>{cfg.emoji}</span>
              </div>
              {!isLast && <div style={TL.linhaVert} />}
            </div>
            <div style={{ ...TL.corpo, marginBottom: isLast ? 0 : 20 }}>
              <div style={TL.cabecalho}>
                <span style={{ ...TL.acaoLabel, color:cfg.cor }}>{cfg.label}</span>
                <span style={TL.tempo}>{formatarDataHora(item.data_registro)}</span>
              </div>
              {item.descricao && <p style={TL.descricao}>{item.descricao}</p>}
              {item.usuarios?.nome_completo && <span style={TL.autor}>por {item.usuarios.nome_completo}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tela de Detalhes da OS ───────────────────────────────────

export default function DetalhesOS() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, isSuperAdmin } = useAuthStore();
  const { isOnline } = useAppStore();

  const [os,      setOs]      = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro,    setErro]    = useState(null);

  const [causa,               setCausa]               = useState('');
  const [servicosExecutados,  setServicosExecutados]  = useState('');
  const [obs,                 setObs]                 = useState('');

  const [finalizando,     setFinalizando]     = useState(false);
  const [erroFinalizar,   setErroFinalizar]   = useState('');
  const [confirmando,     setConfirmando]     = useState(false);

  const [salvandoRascunho, setSalvandoRascunho] = useState(false);
  const [salvouOk,         setSalvouOk]         = useState(false);

  const [historico,        setHistorico]        = useState([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  const [segundosDecorridos, setSegundosDecorridos] = useState(0);
  const timerRef = useRef(null);

  // ─── Carrega OS ──────────────────────────────────────────────
  useEffect(() => {
    async function fetchOS() {
      setLoading(true); setErro(null);
      try {
        const { data, error } = await supabase
          .from('ordens_servico')
          .select(`
            id, problema, causa, solicitante, hora_parada,
            servicos_executados, obs, status, inicio_em, fim_em,
            aberto_por, finalizado_por, mecanico_id, atualizado_em,
            equipamentos ( id, nome, status ),
            aberto_usuario:usuarios!aberto_por ( id, nome_completo ),
            finalizado_usuario:usuarios!finalizado_por ( id, nome_completo )
          `)
          .eq('id', id)
          .single();
        if (error) throw error;
        setOs(data);
        setCausa(data.causa ?? '');
        setServicosExecutados(data.servicos_executados ?? '');
        setObs(data.obs ?? '');
      } catch (err) {
        setErro('Não foi possível carregar a OS.');
        console.error('[DetalhesOS] Erro:', err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchOS();
  }, [id]);

  // ─── Histórico (superadmin) ───────────────────────────────────
  const loadHistorico = async () => {
    if (!isSuperAdmin) return;
    setLoadingHistorico(true);
    try {
      const { data, error } = await supabase
        .from('historico_os')
        .select('id, acao, descricao, data_registro, usuarios(nome_completo)')
        .eq('os_id', id)
        .order('data_registro', { ascending: true });
      if (error) throw error;
      setHistorico(data ?? []);
    } catch (err) {
      console.error('[DetalhesOS] Histórico:', err.message);
    } finally {
      setLoadingHistorico(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin && id) loadHistorico();
  }, [isSuperAdmin, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Timer ───────────────────────────────────────────────────
  useEffect(() => {
    if (os?.status === 'em_andamento' && os?.inicio_em) {
      timerRef.current = setInterval(() => {
        setSegundosDecorridos(Math.floor((Date.now() - new Date(os.inicio_em).getTime()) / 1000));
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [os?.status, os?.inicio_em]);

  // ─── Auto-save silencioso ─────────────────────────────────────
  const salvarRascunho = async () => {
    if (!isOnline || os?.status !== 'em_andamento') return;
    await supabase.from('ordens_servico')
      .update({ causa: causa || null, servicos_executados: servicosExecutados || null, obs: obs || null })
      .eq('id', id);
  };

  // ─── Salvar progresso (com log) ───────────────────────────────
  const salvarProgresso = async () => {
    if (!isOnline || os?.status !== 'em_andamento' || salvandoRascunho) return;
    setSalvandoRascunho(true); setSalvouOk(false);
    try {
      const { error } = await supabase.from('ordens_servico')
        .update({ causa: causa || null, servicos_executados: servicosExecutados || null, obs: obs || null })
        .eq('id', id);
      if (error) throw error;

      const camposAtualizados = [
        causa              ? 'causa'    : null,
        servicosExecutados ? 'serviços' : null,
        obs                ? 'obs'      : null,
      ].filter(Boolean).join(', ');

      await supabase.from('historico_os').insert({
        os_id:      id,
        usuario_id: profile?.id,
        acao:       'atualizada',
        descricao:  `Progresso salvo por ${profile?.nome_completo ?? '—'}. Campos atualizados: ${camposAtualizados || '(nenhum)' }.`,
      });

      if (isSuperAdmin) loadHistorico();
      setSalvouOk(true);
      setTimeout(() => setSalvouOk(false), 3000);
    } catch (err) {
      console.error('[DetalhesOS] salvarProgresso:', err.message);
    } finally {
      setSalvandoRascunho(false);
    }
  };

  // ─── Finalizar ────────────────────────────────────────────────
  const handleFinalizar = async () => {
    setErroFinalizar('');
    if (!servicosExecutados.trim()) {
      setErroFinalizar('Descreva os serviços executados antes de finalizar.');
      setConfirmando(false);
      return;
    }
    setFinalizando(true); setConfirmando(false);
    try {
      const { error } = await supabase.from('ordens_servico')
        .update({
          status:              'concluida',
          causa:               causa || null,
          servicos_executados: servicosExecutados,
          obs:                 obs || null,
          fim_em:              new Date().toISOString(),
          finalizado_por:      profile?.id ?? null,
        })
        .eq('id', id);
      if (error) throw error;
      clearInterval(timerRef.current);
      const fim = new Date().toISOString();
      setOs(prev => ({ ...prev, status: 'concluida', fim_em: fim, finalizado_por: profile?.id }));
      if (isSuperAdmin) setTimeout(() => loadHistorico(), 800);
    } catch (err) {
      setErroFinalizar(`Erro ao finalizar OS: ${err.message}`);
    } finally {
      setFinalizando(false);
    }
  };

  // ─── Cancelar (somente admin) ─────────────────────────────────
  const handleCancelar = async () => {
    if (!isSuperAdmin) return;
    setFinalizando(true);
    try {
      const { error } = await supabase.from('ordens_servico')
        .update({ status:'cancelada', fim_em: new Date().toISOString(), finalizado_por: profile?.id ?? null })
        .eq('id', id);
      if (error) throw error;
      clearInterval(timerRef.current);
      setOs(prev => ({ ...prev, status: 'cancelada', finalizado_por: profile?.id }));
      if (isSuperAdmin) setTimeout(() => loadHistorico(), 800);
    } catch (err) {
      setErroFinalizar(`Erro ao cancelar: ${err.message}`);
    } finally {
      setFinalizando(false);
    }
  };

  // ─── Excluir OS (somente SuperAdmin) ─────────────────────────
  const handleExcluirOS = async () => {
    const confirmou = window.confirm(
      'Tem certeza que deseja excluir permanentemente esta O.S.? Esta ação não pode ser desfeita.'
    );
    if (!confirmou) return;
    try {
      const { error } = await supabase.from('ordens_servico').delete().eq('id', id);
      if (error) throw error;
      navigate('/corretivas', { replace: true });
    } catch (err) {
      console.error('[DetalhesOS] handleExcluirOS:', err.message);
      window.alert(`Erro ao excluir O.S.: ${err.message}`);
    }
  };

  if (loading) return <TelaCarregando />;
  if (erro || !os) return <TelaErro message={erro} onBack={() => navigate('/corretivas')} />;

  const cfg = STATUS_CONFIG[os.status] ?? STATUS_CONFIG.em_andamento;
  const isEmAndamento = os.status === 'em_andamento';

  // FILA ABERTA: qualquer usuário autenticado pode editar O.S. em andamento
  const podeEditar   = isEmAndamento && !!profile?.id;
  const duracaoFinal = os.fim_em
    ? Math.floor((new Date(os.fim_em) - new Date(os.inicio_em)) / 1000)
    : null;

  // Nome de quem abriu (aberto_usuario ou fallback para mecanico_id legado)
  const abertoPorNome = os.aberto_usuario?.nome_completo ?? '—';
  // Nome de quem finalizou
  const finalizadoPorNome = os.finalizado_usuario?.nome_completo;

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {/* Topbar */}
      <header style={S.topbar}>
        <button onClick={() => navigate('/corretivas')} style={S.backBtn}><BackIcon /></button>
        <div style={S.topbarCenter}>
          <span style={S.topbarSub}>Ordem de Serviço</span>
          <span style={S.topbarEquip}>{os.equipamentos?.nome}</span>
        </div>
        {isEmAndamento && (
          <div style={S.timerChip}>
            <TimerIcon />
            <span style={S.timerTexto}>{formatarDuracao(segundosDecorridos)}</span>
          </div>
        )}
      </header>

      {/* Banner offline */}
      {!isOnline && (
        <div style={S.bannerOffline}>
          <OfflineIcon /> Offline — edições serão sincronizadas ao reconectar.
        </div>
      )}

      {/* Banner fila aberta (quando não há mecânico designado) */}
      {isEmAndamento && !os.mecanico_id && (
        <div style={S.bannerFila}>
          <QueueIcon />
          Fila aberta — qualquer mecânico pode registrar o atendimento e finalizar esta O.S.
        </div>
      )}

      <main style={S.main}>

        {/* Card de status */}
        <section style={S.card}>
          <div style={S.statusRow}>
            <span style={{ ...S.statusPill, color:cfg.cor, backgroundColor:cfg.bg, border:`1px solid ${cfg.borda}` }}>
              {cfg.label}
            </span>
            {!isEmAndamento && duracaoFinal !== null && (
              <span style={S.duracaoChip}><TimerIcon /> {formatarDuracao(duracaoFinal)}</span>
            )}
            {os.atualizado_em && !isEmAndamento && (
              <span style={S.atualizadoChip}>Atualizado {formatarDataHora(os.atualizado_em)}</span>
            )}
          </div>
          <div style={S.infoGrid}>
            <InfoItem label="Equipamento" value={os.equipamentos?.nome} />
            <InfoItem label="Solicitante"  value={os.solicitante} />
            <InfoItem label="Aberto por"   value={abertoPorNome} />
            <InfoItem label="Abertura"     value={formatarDataHora(os.inicio_em)} />
            {os.hora_parada && <InfoItem label="Parada em" value={formatarDataHora(os.hora_parada)} />}
            {os.fim_em      && <InfoItem label="Encerrado" value={formatarDataHora(os.fim_em)} />}
            {finalizadoPorNome && (
              <InfoItem label="Finalizado por" value={finalizadoPorNome} />
            )}
          </div>
        </section>

        {/* Problema */}
        <section style={S.card}>
          <SectionTitle icon={<AlertIcon />} title="Problema reportado" />
          <p style={S.textoBloco}>{os.problema}</p>
        </section>

        {/* Causa */}
        <section style={S.card}>
          <SectionTitle icon={<SearchIcon />} title="Causa identificada" />
          {podeEditar ? (
            <textarea placeholder="Descreva a causa raiz do problema..." value={causa}
              onChange={e => setCausa(e.target.value)} onBlur={salvarRascunho}
              style={S.textarea} rows={3} maxLength={400} disabled={finalizando || salvandoRascunho} />
          ) : (
            <p style={S.textoBloco}>{os.causa || <span style={S.semInfo}>Não informado</span>}</p>
          )}
        </section>

        {/* Serviços executados */}
        <section style={S.card}>
          <SectionTitle icon={<WrenchIcon />} title="Serviços executados" />
          {podeEditar ? (
            <>
              <textarea placeholder="Descreva todos os serviços realizados..." value={servicosExecutados}
                onChange={e => setServicosExecutados(e.target.value)} onBlur={salvarRascunho}
                style={S.textarea} rows={4} maxLength={800} disabled={finalizando || salvandoRascunho} />
              <span style={S.charCount}>{servicosExecutados.length}/800</span>
            </>
          ) : (
            <p style={S.textoBloco}>{os.servicos_executados || <span style={S.semInfo}>Não informado</span>}</p>
          )}
        </section>

        {/* Peças */}
        <section style={S.card}>
          <SecaoPecas
            osId={id}
            equipamentoId={os.equipamentos?.id}
            status={os.status}
            userId={profile?.id}
            onPecaAdicionada={isSuperAdmin ? loadHistorico : undefined}
          />
        </section>

        {/* Observações */}
        <section style={S.card}>
          <SectionTitle icon={<ObsIcon />} title="Observações gerais" />
          {podeEditar ? (
            <textarea placeholder="Observações adicionais, recomendações de próximas manutenções..."
              value={obs} onChange={e => setObs(e.target.value)} onBlur={salvarRascunho}
              style={S.textarea} rows={3} maxLength={400} disabled={finalizando || salvandoRascunho} />
          ) : (
            <p style={S.textoBloco}>{os.obs || <span style={S.semInfo}>Nenhuma observação</span>}</p>
          )}
        </section>

        {/* Linha do Tempo (superadmin) */}
        {isSuperAdmin && (
          <section style={S.card}>
            <SectionTitle icon={<TimelineIcon />} title="Linha do Tempo" />
            <p style={S.timelineSubtitle}>Histórico completo de eventos desta O.S.</p>
            <Timeline historico={historico} loading={loadingHistorico} />
          </section>
        )}

        {/* Botão Excluir OS (somente SuperAdmin) */}
        {isSuperAdmin && (
          <button
            onClick={handleExcluirOS}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '13px', width: '100%',
              backgroundColor: 'transparent',
              color: '#DC2626',
              border: '1.5px solid #DC2626',
              borderRadius: '12px',
              fontSize: '14px', fontWeight: '700',
              cursor: 'pointer', fontFamily: 'inherit',
              marginTop: '4px',
            }}
          >
            <TrashIcon cor="#DC2626" size={16} />
            Excluir O.S. permanentemente
          </button>
        )}

        {/* Botão salvar progresso */}
        {podeEditar && (
          <button
            onClick={salvarProgresso}
            disabled={salvandoRascunho || finalizando || !isOnline}
            style={{ ...S.btnSalvar, opacity: (salvandoRascunho || !isOnline) ? 0.6 : 1 }}
          >
            {salvandoRascunho
              ? <><Spinner /> Salvando...</>
              : salvouOk
              ? <><CheckIcon cor="#10B981" /> Progresso salvo!</>
              : <><SaveIcon /> Salvar progresso</>
            }
          </button>
        )}

        {/* Ações de finalização */}
        {podeEditar && (
          <>
            {erroFinalizar && (
              <div style={S.erroFinalizar}>
                <AlertIcon cor="#DC2626" /> {erroFinalizar}
              </div>
            )}
            <button onClick={() => setConfirmando(true)} disabled={finalizando}
              style={{ ...S.btnFinalizar, opacity: finalizando ? 0.7 : 1 }}>
              {finalizando ? <><Spinner /> Finalizando...</> : <><CheckIcon /> Finalizar OS</>}
            </button>
            {isSuperAdmin && (
              <button onClick={handleCancelar} disabled={finalizando} style={S.btnCancelar}>
                Cancelar OS
              </button>
            )}
          </>
        )}
      </main>

      {/* Modal de confirmação */}
      {confirmando && (
        <div style={S.modalOverlay} onClick={() => setConfirmando(false)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={S.modalIcone}><CheckIcon cor="#20643F" size={28} /></div>
            <h3 style={S.modalTitulo}>Finalizar esta OS?</h3>
            <p style={S.modalSubtitulo}>
              Esta ação irá encerrar o timer e registrar{' '}
              <strong>{profile?.nome_completo}</strong> como responsável pela conclusão.
              Não pode ser desfeita.
            </p>
            <div style={S.modalBotoes}>
              <button onClick={() => setConfirmando(false)} style={S.btnModalCancelar}>Voltar</button>
              <button onClick={handleFinalizar} style={S.btnModalConfirmar}>Confirmar finalização</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componentes auxiliares ───────────────────────────────────

function InfoItem({ label, value }) {
  return (
    <div style={S.infoItem}>
      <span style={S.infoLabel}>{label}</span>
      <span style={S.infoValor}>{value ?? '—'}</span>
    </div>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <div style={S.sectionTitleRow}>
      {icon}
      <span style={S.sectionTitleText}>{title}</span>
    </div>
  );
}

function TelaCarregando() {
  return (
    <div style={{ minHeight:'100dvh', backgroundColor:'#F4F7FA', fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`@keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}`}</style>
      <div style={{ height:'56px', backgroundColor:'#FFFFFF', borderBottom:'1px solid #E8EDF2' }} />
      <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:'12px' }}>
        {[75,55,90,65,80].map((w,i) => (
          <div key={i} style={{ height:'14px', width:`${w}%`, borderRadius:'7px', background:'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize:'400px', animation:'shimmer 1.4s infinite linear' }} />
        ))}
      </div>
    </div>
  );
}

function TelaErro({ message, onBack }) {
  return (
    <div style={{ minHeight:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'16px', fontFamily:"'DM Sans',sans-serif", padding:'24px', textAlign:'center', backgroundColor:'#F4F7FA' }}>
      <span style={{ fontSize:'48px' }}>⚠️</span>
      <p style={{ color:'#64748B', fontSize:'15px', margin:0 }}>{message}</p>
      <button onClick={onBack} style={{ padding:'12px 24px', backgroundColor:'#20643F', color:'#FFFFFF', border:'none', borderRadius:'10px', fontSize:'14px', fontWeight:'600', cursor:'pointer' }}>Voltar</button>
    </div>
  );
}

// ─── Ícones ───────────────────────────────────────────────────
function BackIcon()     { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function TimerIcon()    { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function AlertIcon({ cor='#20643F' }) { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={cor} strokeWidth="2" strokeLinecap="round"/><path d="M12 9v4M12 17h.01" stroke={cor} strokeWidth="2" strokeLinecap="round"/></svg>; }
function WrenchIcon()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="#20643F" strokeWidth="2" strokeLinecap="round"/></svg>; }
function WrenchSmIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="#20643F" strokeWidth="2" strokeLinecap="round"/></svg>; }
function SearchIcon()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><circle cx="11" cy="11" r="8" stroke="#20643F" strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke="#20643F" strokeWidth="2" strokeLinecap="round"/></svg>; }
function ObsIcon()      { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#20643F" strokeWidth="2"/></svg>; }
function TimelineIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#20643F" strokeWidth="2" strokeLinecap="round"/></svg>; }
function SaveIcon()     { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ marginRight:7, flexShrink:0 }}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function TrashIcon({ cor = 'currentColor', size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginRight: '6px' }}>
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function CheckIcon({ cor='#FFFFFF', size=16 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ marginRight:7, flexShrink:0 }}><path d="M20 6L9 17l-5-5" stroke={cor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function OfflineIcon()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.8M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function QueueIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#92400E" strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke="#92400E" strokeWidth="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="#92400E" strokeWidth="2" strokeLinecap="round"/></svg>; }
function Spinner()      { return <span style={{ display:'inline-block', width:'15px', height:'15px', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#FFF', borderRadius:'50%', animation:'spin 0.7s linear infinite', marginRight:8 }} />; }

// ─── Estilos SecaoPecas ───────────────────────────────────────
const SP = {
  wrapper:     { display:'flex', flexDirection:'column', gap:'12px' },
  titulo:      { display:'flex', alignItems:'center', gap:'7px', fontSize:'14px', fontWeight:'700', color:'#0D1B2A' },
  countBadge:  { marginLeft:'auto', padding:'2px 8px', backgroundColor:'rgba(32,100,63,0.08)', color:'#20643F', borderRadius:'20px', fontSize:'11px', fontWeight:'700' },
  lista:       { margin:0, padding:0, listStyle:'none', display:'flex', flexDirection:'column', gap:'6px' },
  item:        { display:'flex', alignItems:'center', gap:'8px', padding:'9px 12px', backgroundColor:'#F8FAFC', borderRadius:'8px', border:'1px solid #E8EDF2' },
  itemInfo:    { flex:1, display:'flex', alignItems:'center', gap:'6px', overflow:'hidden' },
  itemNome:    { fontSize:'13px', fontWeight:'600', color:'#0D1B2A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  itemTipo:    { fontSize:'10px', fontWeight:'600', padding:'2px 6px', borderRadius:'4px', backgroundColor:'#E8EDF2', color:'#64748B', flexShrink:0 },
  itemQtd:     { fontSize:'13px', fontWeight:'700', color:'#20643F', flexShrink:0 },
  addForm:     { display:'flex', flexDirection:'column', gap:'8px', paddingTop:'8px', borderTop:'1px solid #F1F5F9' },
  tipoToggle:  { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' },
  tipoBtn:     { padding:'8px', border:'1.5px solid #E2E8F0', borderRadius:'8px', backgroundColor:'#FFFFFF', fontSize:'12px', fontWeight:'600', color:'#64748B', cursor:'pointer', fontFamily:'inherit' },
  tipoBtnAtivo:{ backgroundColor:'#20643F', borderColor:'#20643F', color:'#FFFFFF' },
  addRow:      { display:'flex', gap:'6px' },
  select:      { flex:1, padding:'10px 12px', fontSize:'13px', border:'1.5px solid #E2E8F0', borderRadius:'8px', backgroundColor:'#FAFBFC', fontFamily:'inherit', color:'#0D1B2A', cursor:'pointer', minWidth:0 },
  qtdInput:    { width:'56px', padding:'10px 8px', fontSize:'13px', border:'1.5px solid #E2E8F0', borderRadius:'8px', backgroundColor:'#FAFBFC', fontFamily:'inherit', textAlign:'center', flexShrink:0 },
  addBtn:      { width:'40px', height:'40px', display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'#20643F', color:'#FFFFFF', border:'none', borderRadius:'8px', fontSize:'20px', cursor:'pointer', flexShrink:0 },
  erro:        { fontSize:'12px', color:'#EF4444', fontWeight:'500' },
};

// ─── Estilos Timeline ─────────────────────────────────────────
const TL = {
  wrapper:         { display:'flex', flexDirection:'column', paddingTop:4 },
  skeletonWrapper: { display:'flex', flexDirection:'column', paddingTop:4 },
  item:            { display:'flex', gap:12, alignItems:'flex-start' },
  leftCol:         { display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 },
  ponto:           { width:36, height:36, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  linhaVert:       { width:2, flex:1, minHeight:16, backgroundColor:'#E8EDF2', marginTop:4, marginBottom:4 },
  corpo:           { flex:1, paddingBottom:0 },
  cabecalho:       { display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:4 },
  acaoLabel:       { fontSize:13, fontWeight:700, lineHeight:1.3 },
  tempo:           { fontSize:11, color:'#94A3B8', fontWeight:500, flexShrink:0 },
  descricao:       { margin:'0 0 4px 0', fontSize:12, color:'#475569', lineHeight:1.55 },
  autor:           { fontSize:11, color:'#94A3B8', fontStyle:'italic' },
};

// ─── CSS e Estilos ────────────────────────────────────────────
const CSS = `
  @keyframes spin    { to { transform: rotate(360deg); } }
  @keyframes fadeIn  { from { opacity:0; } to { opacity:1; } }
  @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
  textarea { resize: vertical; }
  select:focus, input:focus, textarea:focus { outline: none; border-color: #20643F !important; box-shadow: 0 0 0 3px rgba(32,100,63,0.1) !important; }
`;

const S = {
  page:             { minHeight:'100dvh', backgroundColor:'#F4F7FA', fontFamily:"'DM Sans','Segoe UI',sans-serif" },
  topbar:           { position:'sticky', top:0, zIndex:20, display:'flex', alignItems:'center', gap:'10px', padding:'0 16px', height:'56px', backgroundColor:'#FFFFFF', borderBottom:'1px solid #E8EDF2' },
  backBtn:          { display:'flex', alignItems:'center', justifyContent:'center', width:'36px', height:'36px', border:'none', background:'none', cursor:'pointer', color:'#0D1B2A', borderRadius:'8px', flexShrink:0 },
  topbarCenter:     { flex:1, display:'flex', flexDirection:'column', overflow:'hidden' },
  topbarSub:        { fontSize:'11px', fontWeight:'600', color:'#20643F', letterSpacing:'1px', textTransform:'uppercase' },
  topbarEquip:      { fontSize:'15px', fontWeight:'700', color:'#0D1B2A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  timerChip:        { display:'flex', alignItems:'center', gap:'5px', padding:'5px 11px', backgroundColor:'#0D1B2A', borderRadius:'20px', color:'#FFFFFF', flexShrink:0 },
  timerTexto:       { fontSize:'13px', fontWeight:'700', fontVariantNumeric:'tabular-nums', letterSpacing:'0.5px' },
  bannerOffline:    { display:'flex', alignItems:'center', gap:'8px', padding:'10px 16px', backgroundColor:'#FEF3C7', color:'#92400E', fontSize:'12px', fontWeight:'500', borderBottom:'1px solid rgba(245,158,11,0.3)' },
  bannerFila:       { display:'flex', alignItems:'center', gap:'8px', padding:'10px 16px', backgroundColor:'rgba(245,158,11,0.07)', color:'#92400E', fontSize:'12px', fontWeight:'500', borderBottom:'1px solid rgba(245,158,11,0.2)' },
  main:             { padding:'16px', display:'flex', flexDirection:'column', gap:'10px', maxWidth:'640px', margin:'0 auto', paddingBottom:'40px', boxSizing:'border-box' },
  card:             { backgroundColor:'#FFFFFF', borderRadius:'12px', border:'1px solid #E8EDF2', padding:'16px', display:'flex', flexDirection:'column', gap:'12px' },
  statusRow:        { display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' },
  statusPill:       { padding:'4px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:'700' },
  duracaoChip:      { display:'flex', alignItems:'center', gap:'4px', fontSize:'12px', color:'#64748B', fontWeight:'500' },
  atualizadoChip:   { fontSize:'11px', color:'#94A3B8', fontWeight:'500', marginLeft:'auto' },
  infoGrid:         { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' },
  infoItem:         { display:'flex', flexDirection:'column', gap:'2px' },
  infoLabel:        { fontSize:'10px', fontWeight:'600', color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.4px' },
  infoValor:        { fontSize:'13px', fontWeight:'600', color:'#0D1B2A' },
  sectionTitleRow:  { display:'flex', alignItems:'center', gap:'7px', paddingBottom:'8px', borderBottom:'1px solid #F1F5F9' },
  sectionTitleText: { fontSize:'13px', fontWeight:'700', color:'#0D1B2A' },
  timelineSubtitle: { margin:'-4px 0 6px', fontSize:'12px', color:'#94A3B8' },
  textoBloco:       { margin:0, fontSize:'14px', color:'#374151', lineHeight:1.6 },
  semInfo:          { color:'#94A3B8', fontStyle:'italic', fontSize:'13px' },
  textarea:         { padding:'12px', fontSize:'14px', border:'1.5px solid #E2E8F0', borderRadius:'9px', backgroundColor:'#F8FAFC', fontFamily:'inherit', color:'#0D1B2A', width:'100%', boxSizing:'border-box', lineHeight:1.55 },
  charCount:        { fontSize:'11px', color:'#94A3B8', textAlign:'right', marginTop:'-6px' },
  erroFinalizar:    { display:'flex', alignItems:'center', gap:'8px', padding:'12px 14px', backgroundColor:'#FEF2F2', border:'1px solid #FECACA', borderRadius:'9px', fontSize:'13px', color:'#DC2626' },
  btnSalvar:        { display:'flex', alignItems:'center', justifyContent:'center', padding:'13px', width:'100%', backgroundColor:'#FFFFFF', color:'#20643F', border:'1.5px solid #20643F', borderRadius:'12px', fontSize:'14px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' },
  btnFinalizar:     { display:'flex', alignItems:'center', justifyContent:'center', padding:'15px', width:'100%', backgroundColor:'#0D1B2A', color:'#FFFFFF', border:'none', borderRadius:'12px', fontSize:'15px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' },
  btnCancelar:      { display:'flex', alignItems:'center', justifyContent:'center', padding:'12px', width:'100%', backgroundColor:'transparent', color:'#94A3B8', border:'1.5px solid #E2E8F0', borderRadius:'10px', fontSize:'13px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' },
  modalOverlay:     { position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:'24px', animation:'fadeIn 0.2s ease' },
  modalBox:         { backgroundColor:'#FFFFFF', borderRadius:'16px', padding:'32px 28px', width:'100%', maxWidth:'380px', display:'flex', flexDirection:'column', alignItems:'center', gap:'14px', boxShadow:'0 20px 50px rgba(0,0,0,0.2)' },
  modalIcone:       { width:'56px', height:'56px', borderRadius:'50%', backgroundColor:'rgba(32,100,63,0.1)', display:'flex', alignItems:'center', justifyContent:'center' },
  modalTitulo:      { margin:0, fontSize:'18px', fontWeight:'800', color:'#0D1B2A', letterSpacing:'-0.3px' },
  modalSubtitulo:   { margin:0, fontSize:'13px', color:'#64748B', textAlign:'center', lineHeight:1.6 },
  modalBotoes:      { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', width:'100%', marginTop:'4px' },
  btnModalCancelar: { padding:'12px', backgroundColor:'#F8FAFC', color:'#64748B', border:'1.5px solid #E2E8F0', borderRadius:'9px', fontSize:'13px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' },
  btnModalConfirmar:{ padding:'12px', backgroundColor:'#20643F', color:'#FFFFFF', border:'none', borderRadius:'9px', fontSize:'13px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' },
};