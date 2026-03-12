// src/pages/Preventivas/Checklist.jsx

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import useAuthStore from '../../store/authStore';
import useAppStore from '../../store/appStore';

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

function formatarDuracao(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Componente: Item do Checklist ────────────────────────────

function ItemChecklist({ peca, resposta, onMarcar, onObs, disabled }) {
  const [obsAberta, setObsAberta] = useState(false);
  const isOk = resposta?.status === 'ok';
  const isNaoOk = resposta?.status === 'correcao';

  return (
    <div style={{
      ...S.item,
      borderLeft: `4px solid ${isOk ? '#10B981' : isNaoOk ? '#EF4444' : '#E2E8F0'}`,
    }}>
      {/* Nome da peça */}
      <div style={S.itemHeader}>
        <span style={S.itemNome}>{peca.nome}</span>
        {resposta && (
          <button
            onClick={() => setObsAberta((v) => !v)}
            style={S.obsToggleBtn}
            aria-label="Adicionar observação"
          >
            <ObsIcon ativa={!!resposta.observacao || obsAberta} />
          </button>
        )}
      </div>

      {/* Botões de resposta */}
      <div style={S.itemBotoes}>
        <button
          onClick={() => onMarcar(peca.id, 'ok')}
          disabled={disabled}
          style={{
            ...S.btnResposta,
            ...(isOk ? S.btnOkAtivo : S.btnOkInativo),
          }}
        >
          <CheckIcon cor={isOk ? '#FFFFFF' : '#10B981'} />
          Conforme
        </button>
        <button
          onClick={() => onMarcar(peca.id, 'correcao')}
          disabled={disabled}
          style={{
            ...S.btnResposta,
            ...(isNaoOk ? S.btnNaoOkAtivo : S.btnNaoOkInativo),
          }}
        >
          <AlertItemIcon cor={isNaoOk ? '#FFFFFF' : '#EF4444'} />
          Não conforme
        </button>
      </div>

      {/* Campo de observação */}
      {(obsAberta || resposta?.observacao) && resposta && (
        <textarea
          placeholder="Observação sobre esta peça (opcional)..."
          value={resposta.observacao ?? ''}
          onChange={(e) => onObs(peca.id, e.target.value)}
          style={S.obsInput}
          rows={2}
          maxLength={300}
          disabled={disabled}
        />
      )}
    </div>
  );
}

// ─── Tela de Execução do Checklist ───────────────────────────

export default function Checklist() {
  const { agendamentoId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { isOnline, addChecklistToQueue } = useAppStore();

  // Dados do agendamento e equipamento
  const [agendamento, setAgendamento] = useState(null);
  const [pecas, setPecas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  // Estado da execução
  const [fase, setFase] = useState('pre'); // 'pre' | 'execucao' | 'finalizando' | 'concluido'
  const [checklistId, setChecklistId] = useState(null);
  const [respostas, setRespostas] = useState({}); // { [pecaId]: { status, observacao } }
  const [obsGeral, setObsGeral] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');

  // Timer
  const [segundos, setSegundos] = useState(0);
  const timerRef = useRef(null);
  const inicioRef = useRef(null);

  // ─── Busca dados do agendamento ──────────────────────────────
  useEffect(() => {
    async function fetchDados() {
      setLoading(true);
      setErro(null);
      try {
        const { data: ag, error: errAg } = await supabase
          .from('agendamentos_preventivos')
          .select(`
            id, data_agendada, status, mecanico_id,
            equipamentos ( id, nome, descricao ),
            usuarios ( id, nome_completo )
          `)
          .eq('id', agendamentoId)
          .single();

        if (errAg) throw errAg;
        setAgendamento(ag);

        // Busca peças do equipamento para o checklist
        const { data: ps, error: errPs } = await supabase
          .from('pecas_equipamento')
          .select('id, nome')
          .eq('equipamento_id', ag.equipamentos.id)
          .order('nome');

        if (errPs) throw errPs;
        setPecas(ps ?? []);

        // Verifica se já existe checklist aberto para este agendamento
        const { data: chkExistente } = await supabase
          .from('checklists')
          .select('id, inicio_em')
          .eq('agendamento_id', agendamentoId)
          .is('fim_em', null)
          .maybeSingle();

        if (chkExistente) {
          // Retoma checklist em andamento
          setChecklistId(chkExistente.id);
          inicioRef.current = new Date(chkExistente.inicio_em).getTime();
          setFase('execucao');
          await carregarRespostasExistentes(chkExistente.id);
        }

      } catch (err) {
        setErro('Não foi possível carregar os dados da preventiva.');
        console.error('[Checklist] Erro:', err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchDados();
  }, [agendamentoId]);

  // ─── Carrega respostas já salvas (retomada) ──────────────────
  const carregarRespostasExistentes = async (chkId) => {
    const { data } = await supabase
      .from('checklist_respostas')
      .select('peca_equipamento_id, status_resposta, observacao')
      .eq('checklist_id', chkId);

    if (data) {
      const mapa = {};
      data.forEach((r) => {
        mapa[r.peca_equipamento_id] = {
          status: r.status_resposta,
          observacao: r.observacao ?? '',
        };
      });
      setRespostas(mapa);
    }
  };

  // ─── Timer ───────────────────────────────────────────────────
  useEffect(() => {
    if (fase === 'execucao') {
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - inicioRef.current) / 1000);
        setSegundos(elapsed);
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [fase]);

  // ─── Bloqueios de acesso ─────────────────────────────────────
  const hoje = new Date().toISOString().split('T')[0];
  const isMeuAgendamento = agendamento?.mecanico_id === profile?.id;
  const diasRestantes = agendamento ? diasParaData(agendamento.data_agendada) : null;
  const podeIniciar = agendamento?.data_agendada === hoje && agendamento?.status === 'pendente';
  const jaConcluido = agendamento?.status === 'concluido';

  // ─── Iniciar checklist ───────────────────────────────────────
  const handleIniciar = async () => {
    setSalvando(true);
    setErroSalvar('');
    try {
      if (!isOnline) {
        // Modo offline: usa timestamp local como aproximação
        // (será sobrescrito pelo servidor na sync)
        const localId = crypto.randomUUID();
        inicioRef.current = Date.now();
        setChecklistId(`offline-${localId}`);
        setFase('execucao');
        setSalvando(false);
        return;
      }

      // Cria o checklist — inicio_em é DEFAULT NOW() no servidor (antifraud)
      const { data, error } = await supabase
        .from('checklists')
        .insert({
          agendamento_id: agendamentoId,
          mecanico_id: profile.id,
        })
        .select('id, inicio_em')
        .single();

      if (error) throw error;

      setChecklistId(data.id);
      inicioRef.current = new Date(data.inicio_em).getTime();
      setFase('execucao');

      // Marca agendamento como em_andamento
      await supabase
        .from('agendamentos_preventivos')
        .update({ status: 'em_andamento' })
        .eq('id', agendamentoId);

    } catch (err) {
      setErroSalvar('Erro ao iniciar o checklist. Tente novamente.');
      console.error('[Checklist] Erro ao iniciar:', err.message);
    } finally {
      setSalvando(false);
    }
  };

  // ─── Marcar resposta de uma peça ─────────────────────────────
  const handleMarcar = (pecaId, status) => {
    setRespostas((prev) => ({
      ...prev,
      [pecaId]: { ...prev[pecaId], status, observacao: prev[pecaId]?.observacao ?? '' },
    }));
  };

  const handleObs = (pecaId, obs) => {
    setRespostas((prev) => ({
      ...prev,
      [pecaId]: { ...prev[pecaId], observacao: obs },
    }));
  };

  // ─── Validações para finalizar ───────────────────────────────
  const pecasNaoRespondidas = pecas.filter((p) => !respostas[p.id]?.status);
  const podeFinalizarChecklist = pecasNaoRespondidas.length === 0;
  const progresso = pecas.length > 0
    ? Math.round((Object.keys(respostas).filter((id) => respostas[id]?.status).length / pecas.length) * 100)
    : 0;

  // ─── Finalizar checklist ─────────────────────────────────────
  const handleFinalizar = async () => {
    if (!podeFinalizarChecklist) {
      setErroSalvar(`Responda todas as peças antes de finalizar. Faltam ${pecasNaoRespondidas.length}.`);
      return;
    }

    setSalvando(true);
    setErroSalvar('');
    clearInterval(timerRef.current);

    const respostasArray = pecas.map((p) => ({
      checklist_id: checklistId,
      peca_equipamento_id: p.id,
      status_resposta: respostas[p.id].status,
      observacao: respostas[p.id].observacao || null,
    }));

    // ── Modo OFFLINE ──────────────────────────────────────────
    if (!isOnline || String(checklistId).startsWith('offline-')) {
      const localId = String(checklistId).startsWith('offline-')
        ? checklistId.replace('offline-', '')
        : crypto.randomUUID();

      await addChecklistToQueue({
        localId,
        type: 'checklist_completo',
        createdAt: Date.now(),
        payload: {
          checklist: {
            agendamento_id: agendamentoId,
            mecanico_id: profile.id,
            obs_geral: obsGeral || null,
            fim_em: new Date().toISOString(),
          },
          respostas: pecas.map((p) => ({
            peca_equipamento_id: p.id,
            status_resposta: respostas[p.id].status,
            observacao: respostas[p.id].observacao || null,
          })),
        },
      });

      setSalvando(false);
      setFase('concluido');
      return;
    }

    // ── Modo ONLINE ───────────────────────────────────────────
    try {
      // 1. Finaliza o checklist (grava fim_em e obs_geral)
      const { error: errChk } = await supabase
        .from('checklists')
        .update({ fim_em: new Date().toISOString(), obs_geral: obsGeral || null })
        .eq('id', checklistId);
      if (errChk) throw errChk;

      // 2. Insere respostas (upsert para idempotência em caso de retry)
      const { error: errResp } = await supabase
        .from('checklist_respostas')
        .upsert(respostasArray, { onConflict: 'checklist_id,peca_equipamento_id' });
      if (errResp) throw errResp;

      // 3. Marca agendamento como concluído
      const { error: errAg } = await supabase
        .from('agendamentos_preventivos')
        .update({ status: 'concluido' })
        .eq('id', agendamentoId);
      if (errAg) throw errAg;

      setFase('concluido');

    } catch (err) {
      setErroSalvar(`Erro ao finalizar: ${err.message}`);
      console.error('[Checklist] Erro ao finalizar:', err.message);
    } finally {
      setSalvando(false);
    }
  };

  // ─── Renders condicionais ─────────────────────────────────────

  if (loading) return <TelaCarregando />;
  if (erro)    return <TelaErro message={erro} onBack={() => navigate('/preventivas')} />;

  // Tela de conclusão
  if (fase === 'concluido') {
    const naoConformes = Object.values(respostas).filter((r) => r.status === 'correcao').length;
    return (
      <TelaConcluido
        equipamento={agendamento?.equipamentos?.nome}
        duracao={formatarDuracao(segundos)}
        naoConformes={naoConformes}
        offline={!isOnline}
        onVoltar={() => navigate('/preventivas')}
      />
    );
  }

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {/* ── Topbar ── */}
      <header style={S.topbar}>
        <button onClick={() => navigate('/preventivas')} style={S.backBtn} disabled={salvando}>
          <BackIcon />
        </button>
        <div style={S.topbarCenter}>
          <span style={S.topbarTitulo}>Preventiva</span>
          <span style={S.topbarEquip} title={agendamento?.equipamentos?.nome}>
            {agendamento?.equipamentos?.nome}
          </span>
        </div>
        {fase === 'execucao' && (
          <div style={S.timerChip}>
            <TimerIcon />
            <span style={S.timerTexto}>{formatarDuracao(segundos)}</span>
          </div>
        )}
      </header>

      {/* ── Banner offline ── */}
      {!isOnline && (
        <div style={S.bannerOffline}>
          <OfflineIcon />
          Sem conexão — os dados serão salvos e enviados automaticamente ao reconectar.
        </div>
      )}

      <main style={S.main}>

        {/* ── FASE PRÉ: tela de informações antes de iniciar ── */}
        {fase === 'pre' && (
          <div style={S.preSection}>

            {/* Card de info do agendamento */}
            <div style={S.infoCard}>
              <div style={S.infoRow}>
                <span style={S.infoLabel}>Equipamento</span>
                <span style={S.infoValor}>{agendamento?.equipamentos?.nome}</span>
              </div>
              <div style={S.infoRow}>
                <span style={S.infoLabel}>Data agendada</span>
                <span style={S.infoValor}>{formatarData(agendamento?.data_agendada)}</span>
              </div>
              <div style={S.infoRow}>
                <span style={S.infoLabel}>Mecânico</span>
                <span style={S.infoValor}>{agendamento?.usuarios?.nome_completo}</span>
              </div>
              <div style={{ ...S.infoRow, borderBottom: 'none' }}>
                <span style={S.infoLabel}>Peças a verificar</span>
                <span style={S.infoValor}>{pecas.length}</span>
              </div>
            </div>

            {/* Bloqueios contextuais */}
            {jaConcluido && (
              <Aviso tipo="sucesso" texto="Esta preventiva já foi concluída com sucesso." />
            )}

            {!jaConcluido && !isMeuAgendamento && (
              <Aviso tipo="info" texto="Este agendamento foi atribuído a outro mecânico." />
            )}

            {!jaConcluido && isMeuAgendamento && diasRestantes !== null && diasRestantes > 0 && (
              <Aviso
                tipo={diasRestantes <= 3 ? 'alerta' : 'info'}
                texto={`O checklist só pode ser iniciado no dia ${formatarData(agendamento?.data_agendada)}. Faltam ${diasRestantes} dia${diasRestantes > 1 ? 's' : ''}.`}
              />
            )}

            {!jaConcluido && isMeuAgendamento && diasRestantes !== null && diasRestantes < 0 && (
              <Aviso tipo="erro" texto={`Este checklist está atrasado ${Math.abs(diasRestantes)} dia(s). Inicie imediatamente.`} />
            )}

            {pecas.length === 0 && (
              <Aviso tipo="alerta" texto="Nenhuma peça cadastrada para este equipamento. Contate o administrador." />
            )}

            {/* Botão de iniciar */}
            {!jaConcluido && isMeuAgendamento && (podeIniciar || diasRestantes < 0) && pecas.length > 0 && (
              <>
                {erroSalvar && <div style={S.erroInline}>{erroSalvar}</div>}
                <button
                  onClick={handleIniciar}
                  disabled={salvando}
                  style={{ ...S.btnIniciar, opacity: salvando ? 0.7 : 1 }}
                >
                  {salvando ? <><Spinner /> Iniciando...</> : <><PlayIcon /> Iniciar checklist</>}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── FASE EXECUÇÃO: lista de itens ── */}
        {fase === 'execucao' && (
          <div style={S.execSection}>

            {/* Barra de progresso */}
            <div style={S.progressoWrapper}>
              <div style={S.progressoHeader}>
                <span style={S.progressoLabel}>Progresso</span>
                <span style={S.progressoPct}>{progresso}%</span>
              </div>
              <div style={S.progressoBarBg}>
                <div style={{ ...S.progressoBarFill, width: `${progresso}%` }} />
              </div>
              <span style={S.progressoSub}>
                {Object.keys(respostas).filter((id) => respostas[id]?.status).length} de {pecas.length} itens respondidos
              </span>
            </div>

            {/* Lista de peças */}
            <div style={S.itensList}>
              {pecas.map((peca, i) => (
                <ItemChecklist
                  key={peca.id}
                  peca={peca}
                  resposta={respostas[peca.id]}
                  onMarcar={handleMarcar}
                  onObs={handleObs}
                  disabled={salvando}
                />
              ))}
            </div>

            {/* Observação geral */}
            <div style={S.obsGeralWrapper}>
              <label style={S.obsGeralLabel}>Observações gerais (opcional)</label>
              <textarea
                placeholder="Registre aqui qualquer observação geral sobre a preventiva..."
                value={obsGeral}
                onChange={(e) => setObsGeral(e.target.value)}
                style={S.obsGeralInput}
                rows={3}
                maxLength={500}
                disabled={salvando}
              />
            </div>

            {/* Erro e botão de finalizar */}
            {erroSalvar && <div style={S.erroInline}>{erroSalvar}</div>}

            {!podeFinalizarChecklist && (
              <div style={S.avisoFinalizar}>
                <AlertItemIcon cor="#92400E" />
                Responda todos os itens para finalizar. Faltam {pecasNaoRespondidas.length}.
              </div>
            )}

            <button
              onClick={handleFinalizar}
              disabled={salvando || !podeFinalizarChecklist}
              style={{
                ...S.btnFinalizar,
                opacity: (salvando || !podeFinalizarChecklist) ? 0.5 : 1,
                cursor: (salvando || !podeFinalizarChecklist) ? 'not-allowed' : 'pointer',
              }}
            >
              {salvando
                ? <><Spinner /> Salvando...</>
                : <><CheckFinalIcon /> Finalizar preventiva</>
              }
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Telas auxiliares ─────────────────────────────────────────

function TelaConcluido({ equipamento, duracao, naoConformes, offline, onVoltar }) {
  return (
    <div style={S.concluidoPage}>
      <style>{CSS}</style>
      <div style={S.concluidoCard}>
        <div style={S.concluidoIcone}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2 style={S.concluidoTitulo}>Preventiva concluída!</h2>
        <p style={S.concluidoEquip}>{equipamento}</p>

        <div style={S.concluidoStats}>
          <div style={S.statItem}>
            <span style={S.statValor}>{duracao}</span>
            <span style={S.statLabel}>Duração</span>
          </div>
          <div style={S.statDivider} />
          <div style={S.statItem}>
            <span style={{ ...S.statValor, color: naoConformes > 0 ? '#EF4444' : '#10B981' }}>
              {naoConformes}
            </span>
            <span style={S.statLabel}>Não conformes</span>
          </div>
        </div>

        {offline && (
          <div style={S.concluidoOfflineAviso}>
            <OfflineIcon />
            Salvo localmente. Será sincronizado ao reconectar.
          </div>
        )}

        {naoConformes > 0 && (
          <div style={S.concluidoAlerta}>
            ⚠ {naoConformes} item(ns) não conforme(s) detectado(s). Considere abrir uma OS corretiva.
          </div>
        )}

        <button onClick={onVoltar} style={S.btnVoltar}>
          Voltar para preventivas
        </button>
      </div>
    </div>
  );
}

function TelaCarregando() {
  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans',sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ height: '56px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8EDF2' }} />
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[80, 60, 70, 50].map((w, i) => (
          <div key={i} style={{ height: '14px', width: `${w}%`, borderRadius: '7px', background: 'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize: '400px', animation: 'shimmer 1.4s infinite linear' }} />
        ))}
      </div>
    </div>
  );
}

function TelaErro({ message, onBack }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', fontFamily: "'DM Sans',sans-serif", padding: '24px', textAlign: 'center', backgroundColor: '#F4F7FA' }}>
      <span style={{ fontSize: '48px' }}>⚠️</span>
      <p style={{ color: '#64748B', fontSize: '15px', margin: 0 }}>{message}</p>
      <button onClick={onBack} style={{ padding: '12px 24px', backgroundColor: '#0F4C81', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
        Voltar
      </button>
    </div>
  );
}

function Aviso({ tipo, texto }) {
  const cores = {
    sucesso: { bg: 'rgba(16,185,129,0.08)', borda: 'rgba(16,185,129,0.25)', cor: '#065F46' },
    alerta:  { bg: 'rgba(245,158,11,0.08)', borda: 'rgba(245,158,11,0.3)',  cor: '#92400E' },
    erro:    { bg: 'rgba(239,68,68,0.08)',  borda: 'rgba(239,68,68,0.25)',  cor: '#991B1B' },
    info:    { bg: 'rgba(15,76,129,0.06)',  borda: 'rgba(15,76,129,0.2)',   cor: '#1E3A5F' },
  };
  const c = cores[tipo] ?? cores.info;
  return (
    <div style={{ padding: '13px 16px', backgroundColor: c.bg, border: `1px solid ${c.borda}`, borderRadius: '10px', fontSize: '13px', color: c.cor, fontWeight: '500', lineHeight: 1.5 }}>
      {texto}
    </div>
  );
}

// ─── Ícones ───────────────────────────────────────────────────
function BackIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function TimerIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function PlayIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: 7 }}><polygon points="5 3 19 12 5 21 5 3" stroke="currentColor" fill="currentColor" strokeWidth="1"/></svg>; }
function CheckIcon({ cor }) { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginRight: 5 }}><path d="M20 6L9 17l-5-5" stroke={cor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function AlertItemIcon({ cor = '#EF4444' }) { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginRight: 5, flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={cor} strokeWidth="2" strokeLinecap="round"/><path d="M12 9v4M12 17h.01" stroke={cor} strokeWidth="2" strokeLinecap="round"/></svg>; }
function CheckFinalIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: 7 }}><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function ObsIcon({ ativa }) { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke={ativa ? '#0F4C81' : '#94A3B8'} strokeWidth="2" fill={ativa ? 'rgba(15,76,129,0.08)' : 'none'}/></svg>; }
function OfflineIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.8M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function Spinner() { return <span style={{ display: 'inline-block', width: '15px', height: '15px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFF', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: 8 }} />; }

// ─── CSS e Estilos ────────────────────────────────────────────
const CSS = `
  @keyframes cardFadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes shimmer    { 0% { background-position:-400px 0; } 100% { background-position:400px 0; } }
  @keyframes spin       { to { transform: rotate(360deg); } }
  @keyframes popIn      { from { opacity:0; transform:scale(0.85); } to { opacity:1; transform:scale(1); } }
  textarea { resize: vertical; }
  textarea:focus, input:focus { outline: none; border-color: #0F4C81 !important; box-shadow: 0 0 0 3px rgba(15,76,129,0.1) !important; }
`;

const S = {
  page: { minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  topbar: { position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: '10px', padding: '0 16px', height: '56px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8EDF2' },
  backBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: 'none', background: 'none', cursor: 'pointer', color: '#0D1B2A', borderRadius: '8px', flexShrink: 0 },
  topbarCenter: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  topbarTitulo: { fontSize: '11px', fontWeight: '600', color: '#0F4C81', letterSpacing: '1px', textTransform: 'uppercase' },
  topbarEquip: { fontSize: '15px', fontWeight: '700', color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  timerChip: { display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 11px', backgroundColor: '#0D1B2A', borderRadius: '20px', color: '#FFFFFF', flexShrink: 0 },
  timerTexto: { fontSize: '13px', fontWeight: '700', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.5px' },
  bannerOffline: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '12px', fontWeight: '500', borderBottom: '1px solid rgba(245,158,11,0.3)' },
  main: { padding: '16px', maxWidth: '640px', margin: '0 auto' },
  // Fase pré
  preSection: { display: 'flex', flexDirection: 'column', gap: '14px' },
  infoCard: { backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8EDF2', overflow: 'hidden' },
  infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', borderBottom: '1px solid #F1F5F9', gap: '12px' },
  infoLabel: { fontSize: '12px', color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px', flexShrink: 0 },
  infoValor: { fontSize: '14px', color: '#0D1B2A', fontWeight: '600', textAlign: 'right' },
  btnIniciar: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '15px', width: '100%', backgroundColor: '#0F4C81', color: '#FFFFFF', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' },
  // Fase execução
  execSection: { display: 'flex', flexDirection: 'column', gap: '14px' },
  progressoWrapper: { backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8EDF2', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' },
  progressoHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  progressoLabel: { fontSize: '12px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.3px' },
  progressoPct: { fontSize: '18px', fontWeight: '800', color: '#0F4C81' },
  progressoBarBg: { height: '8px', backgroundColor: '#E8EDF2', borderRadius: '4px', overflow: 'hidden' },
  progressoBarFill: { height: '100%', backgroundColor: '#0F4C81', borderRadius: '4px', transition: 'width 0.3s ease' },
  progressoSub: { fontSize: '11px', color: '#94A3B8' },
  itensList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  item: { backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E8EDF2', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', transition: 'border-color 0.15s' },
  itemHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  itemNome: { fontSize: '14px', fontWeight: '600', color: '#0D1B2A', flex: 1 },
  obsToggleBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', border: '1px solid #E2E8F0', borderRadius: '7px', background: 'none', cursor: 'pointer', flexShrink: 0 },
  itemBotoes: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  btnResposta: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 8px', border: '1.5px solid', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' },
  btnOkAtivo:     { backgroundColor: '#10B981', borderColor: '#10B981', color: '#FFFFFF' },
  btnOkInativo:   { backgroundColor: 'transparent', borderColor: '#A7F3D0', color: '#10B981' },
  btnNaoOkAtivo:  { backgroundColor: '#EF4444', borderColor: '#EF4444', color: '#FFFFFF' },
  btnNaoOkInativo:{ backgroundColor: 'transparent', borderColor: '#FECACA', color: '#EF4444' },
  obsInput: { padding: '10px 12px', fontSize: '13px', border: '1.5px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#F8FAFC', fontFamily: 'inherit', color: '#374151', width: '100%', boxSizing: 'border-box', lineHeight: 1.5 },
  obsGeralWrapper: { backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8EDF2', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' },
  obsGeralLabel: { fontSize: '12px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.3px' },
  obsGeralInput: { padding: '12px', fontSize: '14px', border: '1.5px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#F8FAFC', fontFamily: 'inherit', color: '#0D1B2A', width: '100%', boxSizing: 'border-box', lineHeight: 1.55 },
  erroInline: { padding: '12px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '9px', fontSize: '13px', color: '#DC2626' },
  avisoFinalizar: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px', backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '9px', fontSize: '13px', color: '#92400E', fontWeight: '500' },
  btnFinalizar: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '15px', width: '100%', backgroundColor: '#0D1B2A', color: '#FFFFFF', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', fontFamily: 'inherit' },
  // Tela concluído
  concluidoPage: { minHeight: '100dvh', backgroundColor: '#F4F7FA', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  concluidoCard: { backgroundColor: '#FFFFFF', borderRadius: '20px', border: '1px solid #E8EDF2', padding: '36px 28px', maxWidth: '420px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', animation: 'popIn 0.35s ease both' },
  concluidoIcone: { width: '72px', height: '72px', borderRadius: '50%', backgroundColor: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  concluidoTitulo: { margin: 0, fontSize: '22px', fontWeight: '800', color: '#0D1B2A', letterSpacing: '-0.3px' },
  concluidoEquip: { margin: 0, fontSize: '14px', color: '#64748B', textAlign: 'center' },
  concluidoStats: { display: 'flex', alignItems: 'center', gap: '24px', padding: '16px 0', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9', width: '100%', justifyContent: 'center' },
  statItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  statValor: { fontSize: '24px', fontWeight: '800', color: '#0D1B2A', fontVariantNumeric: 'tabular-nums' },
  statLabel: { fontSize: '11px', color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' },
  statDivider: { width: '1px', height: '40px', backgroundColor: '#E8EDF2' },
  concluidoOfflineAviso: { display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 14px', backgroundColor: '#FEF3C7', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', fontSize: '12px', color: '#92400E', fontWeight: '500', width: '100%', boxSizing: 'border-box' },
  concluidoAlerta: { padding: '12px 14px', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', fontSize: '13px', color: '#991B1B', width: '100%', boxSizing: 'border-box', textAlign: 'center' },
  btnVoltar: { padding: '13px 32px', backgroundColor: '#0F4C81', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', width: '100%' },
};