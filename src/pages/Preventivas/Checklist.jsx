// src/pages/Preventivas/Checklist.jsx
// CORREÇÕES v3 → v4:
//   [FIX-1] iniciar(): setAg(…status:'em_andamento') após sucesso no DB
//           → impede que podeIniciar volte a ser true se o componente re-renderizar
//             antes do próximo fetch remoto.
//   [FIX-2] finalizar() online: setAg(…status:'concluido') + setFase('concluido')
//           → jaConcluido=true imediatamente, botão desaparece sem round-trip extra.
//   [FIX-3] finalizar() offline: setAg(…status:'concluido') antes de setFase
//           → mesmo sem rede, ag local reflete o estado real para a sessão atual.
//   [FIX-4] podeIniciar reforçado: exclui explicitamente 'em_andamento' sem
//           checklist aberto (guarda extra contra re-entradas).
//   [FIX-5] notificarAdmins: já existia; mantida como fire-and-forget.
// INALTERADO: cores, layout, responsividade, autenticação.

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import useAuthStore from '../../store/authStore';
import useAppStore from '../../store/appStore';

// ─── Helpers ─────────────────────────────────────────────────

function fmt(dateStr) {
  if (!dateStr) return '—';
  const [a, m, d] = dateStr.split('-');
  return `${d}/${m}/${a}`;
}
function diasPara(dateStr) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr + 'T00:00:00') - hoje) / 86400000);
}
function fmtDuracao(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = n => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}

// ─── Ícones inline ────────────────────────────────────────────
const IcoBack   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcoClock  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
const IcoPlay   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg>;
const IcoCheck  = ({ c = 'currentColor' }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcoAlert  = ({ c = '#EF4444' }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={c} strokeWidth="2" strokeLinecap="round"/><path d="M12 9v4M12 17h.01" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>;
const IcoObs    = ({ on }) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke={on ? '#20643F' : '#94A3B8'} strokeWidth="2" fill={on ? 'rgba(32,100,63,.08)' : 'none'}/></svg>;
const IcoWifi   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.8M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
const IcoList   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="#20643F" strokeWidth="2" strokeLinecap="round"/><path d="M9 12h6M9 16h4" stroke="#20643F" strokeWidth="2" strokeLinecap="round"/></svg>;
const IcoWrench = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="#20643F" strokeWidth="2" strokeLinecap="round"/></svg>;
const Spinner   = () => <span style={{ display: 'inline-block', width: 15, height: 15, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite', marginRight: 8 }}/>;

// ─── Aviso contextual ─────────────────────────────────────────
const AVISO_CORES = {
  sucesso: { bg: 'rgba(16,185,129,.08)',  bd: 'rgba(16,185,129,.25)', c: '#065F46' },
  alerta:  { bg: 'rgba(245,158,11,.08)', bd: 'rgba(245,158,11,.3)',  c: '#92400E' },
  erro:    { bg: 'rgba(239,68,68,.08)',   bd: 'rgba(239,68,68,.25)',  c: '#991B1B' },
  info:    { bg: 'rgba(32,100,63,.06)',   bd: 'rgba(32,100,63,.2)',   c: '#1A4A2E' },
};
function Aviso({ tipo, texto }) {
  const c = AVISO_CORES[tipo] ?? AVISO_CORES.info;
  return (
    <div style={{ padding: '13px 16px', backgroundColor: c.bg, border: `1px solid ${c.bd}`, borderRadius: 10, fontSize: 13, color: c.c, fontWeight: 500, lineHeight: 1.5 }}>
      {texto}
    </div>
  );
}

// ─── Item de Checklist de Peça (equipamento) ──────────────────
function ItemChecklistPeca({ peca, resposta, onMarcar, onObs, disabled }) {
  const [obsOpen, setObsOpen] = useState(false);
  const isOk  = resposta?.status === 'ok';
  const isNok = resposta?.status === 'correcao';
  const cor   = isOk ? '#10B981' : isNok ? '#EF4444' : '#E2E8F0';

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 10, border: '1px solid #E8EDF2', borderLeft: `4px solid ${cor}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#0D1B2A', flex: 1 }}>{peca.nome}</span>
        {resposta && (
          <button onClick={() => setObsOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: '1px solid #E2E8F0', borderRadius: 7, background: 'none', cursor: 'pointer' }}>
            <IcoObs on={!!resposta.observacao || obsOpen} />
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { s: 'ok',       label: 'Conforme',     ativo: isOk,  bgA: '#10B981', bdA: '#10B981', bgI: 'transparent', bdI: '#A7F3D0', cA: '#fff', cI: '#10B981' },
          { s: 'correcao', label: 'Não conforme', ativo: isNok, bgA: '#EF4444', bdA: '#EF4444', bgI: 'transparent', bdI: '#FECACA', cA: '#fff', cI: '#EF4444' },
        ].map(btn => (
          <button key={btn.s} onClick={() => onMarcar(peca.id, btn.s)} disabled={disabled}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '10px 8px', border: `1.5px solid ${btn.ativo ? btn.bdA : btn.bdI}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', backgroundColor: btn.ativo ? btn.bgA : btn.bgI, color: btn.ativo ? btn.cA : btn.cI, transition: 'all .15s' }}>
            {btn.s === 'ok' ? <IcoCheck c={btn.ativo ? '#fff' : '#10B981'} /> : <IcoAlert c={btn.ativo ? '#fff' : '#EF4444'} />}
            {btn.label}
          </button>
        ))}
      </div>
      {(obsOpen || resposta?.observacao) && resposta && (
        <textarea
          placeholder="Observação sobre esta peça (opcional)..."
          value={resposta.observacao ?? ''}
          onChange={e => onObs(peca.id, e.target.value)}
          style={{ padding: '10px 12px', fontSize: 13, border: '1.5px solid #E2E8F0', borderRadius: 8, backgroundColor: '#F8FAFC', fontFamily: 'inherit', color: '#374151', width: '100%', boxSizing: 'border-box', lineHeight: 1.5, resize: 'vertical' }}
          rows={2} maxLength={300} disabled={disabled}
        />
      )}
    </div>
  );
}

// ─── Item de Checklist do Admin (texto livre) ─────────────────
function ItemChecklistAdmin({ item, idx, resposta, onMarcar, onObs, disabled }) {
  const [obsOpen, setObsOpen] = useState(false);
  const isOk  = resposta?.status === 'ok';
  const isNok = resposta?.status === 'correcao';
  const cor   = isOk ? '#10B981' : isNok ? '#EF4444' : '#E2E8F0';

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 10, border: '1px solid #E8EDF2', borderLeft: `4px solid ${cor}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#0D1B2A', flex: 1 }}>{item}</span>
        {resposta && (
          <button onClick={() => setObsOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: '1px solid #E2E8F0', borderRadius: 7, background: 'none', cursor: 'pointer' }}>
            <IcoObs on={!!resposta.observacao || obsOpen} />
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { s: 'ok',       label: 'Conforme',     ativo: isOk,  bgA: '#10B981', bdA: '#10B981', bgI: 'transparent', bdI: '#A7F3D0', cA: '#fff', cI: '#10B981' },
          { s: 'correcao', label: 'Não conforme', ativo: isNok, bgA: '#EF4444', bdA: '#EF4444', bgI: 'transparent', bdI: '#FECACA', cA: '#fff', cI: '#EF4444' },
        ].map(btn => (
          <button key={btn.s} onClick={() => onMarcar(idx, btn.s)} disabled={disabled}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '10px 8px', border: `1.5px solid ${btn.ativo ? btn.bdA : btn.bdI}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', backgroundColor: btn.ativo ? btn.bgA : btn.bgI, color: btn.ativo ? btn.cA : btn.cI, transition: 'all .15s' }}>
            {btn.s === 'ok' ? <IcoCheck c={btn.ativo ? '#fff' : '#10B981'} /> : <IcoAlert c={btn.ativo ? '#fff' : '#EF4444'} />}
            {btn.label}
          </button>
        ))}
      </div>
      {(obsOpen || resposta?.observacao) && resposta && (
        <textarea
          placeholder="Observação sobre este item (opcional)..."
          value={resposta.observacao ?? ''}
          onChange={e => onObs(idx, e.target.value)}
          style={{ padding: '10px 12px', fontSize: 13, border: '1.5px solid #E2E8F0', borderRadius: 8, backgroundColor: '#F8FAFC', fontFamily: 'inherit', color: '#374151', width: '100%', boxSizing: 'border-box', lineHeight: 1.5, resize: 'vertical' }}
          rows={2} maxLength={300} disabled={disabled}
        />
      )}
    </div>
  );
}

// ─── Tela de Conclusão ────────────────────────────────────────
function TelaConcluido({ equipamento, duracao, naoConformes, offline, onVoltar }) {
  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F4F7FA', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ backgroundColor: '#fff', borderRadius: 20, border: '1px solid #E8EDF2', padding: '36px 28px', maxWidth: 420, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, animation: 'popIn .35s ease both' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IcoCheck c="#fff" />
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0D1B2A', letterSpacing: '-0.3px' }}>Preventiva concluída!</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#64748B', textAlign: 'center' }}>{equipamento}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '16px 0', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9', width: '100%', justifyContent: 'center' }}>
          {[
            { v: duracao,      l: 'Duração' },
            { v: naoConformes, l: 'Não conformes', cor: naoConformes > 0 ? '#EF4444' : '#10B981' },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 24, fontWeight: 800, color: s.cor ?? '#0D1B2A', fontVariantNumeric: 'tabular-nums' }}>{s.v}</span>
              <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.l}</span>
            </div>
          ))}
        </div>
        {offline && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 14px', backgroundColor: '#FEF3C7', border: '1px solid rgba(245,158,11,.3)', borderRadius: 8, fontSize: 12, color: '#92400E', fontWeight: 500, width: '100%', boxSizing: 'border-box' }}>
            <IcoWifi /> Salvo localmente. Será sincronizado ao reconectar.
          </div>
        )}
        {naoConformes > 0 && (
          <div style={{ padding: '12px 14px', backgroundColor: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 8, fontSize: 13, color: '#991B1B', width: '100%', boxSizing: 'border-box', textAlign: 'center' }}>
            ⚠ {naoConformes} item(ns) não conforme(s). Considere abrir uma OS corretiva.
          </div>
        )}
        <button onClick={onVoltar} style={{ padding: '13px 32px', backgroundColor: '#20643F', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
          Voltar para preventivas
        </button>
      </div>
    </div>
  );
}

// ─── Estados auxiliares ───────────────────────────────────────
function Carregando() {
  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans',sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ height: 56, backgroundColor: '#fff', borderBottom: '1px solid #E8EDF2' }} />
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[80, 60, 70, 50].map((w, i) => (
          <div key={i} style={{ height: 14, width: `${w}%`, borderRadius: 7, background: 'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize: '400px', animation: 'shimmer 1.4s infinite linear' }} />
        ))}
      </div>
    </div>
  );
}

function ErroTela({ msg, onBack }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: "'DM Sans',sans-serif", padding: 24, textAlign: 'center', backgroundColor: '#F4F7FA' }}>
      <span style={{ fontSize: 48 }}>⚠️</span>
      <p style={{ color: '#64748B', fontSize: 15, margin: 0 }}>{msg}</p>
      <button onClick={onBack} style={{ padding: '12px 24px', backgroundColor: '#20643F', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Voltar</button>
    </div>
  );
}

// ─── CSS global ───────────────────────────────────────────────
const CSS = `
  @keyframes spin    { to { transform:rotate(360deg); } }
  @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
  @keyframes popIn   { from{opacity:0;transform:scale(.85)} to{opacity:1;transform:scale(1)} }
  textarea{resize:vertical;}
  textarea:focus,input:focus{outline:none;border-color:#20643F!important;box-shadow:0 0 0 3px rgba(32,100,63,.1)!important;}
`;

// ─── Componente principal ─────────────────────────────────────
export default function Checklist() {
  const { agendamentoId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { isOnline, addChecklistToQueue } = useAppStore();

  const [ag,       setAg]       = useState(null);
  const [pecas,    setPecas]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [erro,     setErro]     = useState(null);

  // Fase: 'pre' | 'execucao' | 'concluido'
  const [fase,        setFase]     = useState('pre');
  const [checklistId, setChkId]    = useState(null);
  const [salvando,    setSalvando] = useState(false);
  const [erroSalv,    setErroSalv] = useState('');
  const [segundos,    setSegundos] = useState(0);

  // { [pecaId]: { status, observacao } }
  const [respostas,      setRespostas]      = useState({});
  // { [idx]: { status, observacao } }
  const [respostasAdmin, setRespostasAdmin] = useState({});
  const [obsGeral,       setObsGeral]       = useState('');

  const timerRef  = useRef(null);
  const inicioRef = useRef(null);

  // ─── Carrega dados ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true); setErro(null);
      try {
        const { data: agdRaw, error: e1 } = await supabase
          .from('agendamentos_preventivos')
          .select(`
            id, data_agendada, status, mecanico_id, itens_checklist,
            equipamentos ( id, nome, descricao ),
            mecanico:usuarios!mecanico_id ( id, nome_completo )
          `)
          .eq('id', agendamentoId)
          .single();
        if (e1) throw e1;

        // ── Auto-healing ──────────────────────────────────────────────────────
        // Se existe um checklist com fim_em preenchido (concluído) mas o
        // agendamento ainda está como pendente/em_andamento (falha parcial
        // anterior), corrige o status silenciosamente antes de continuar.
        let agd = agdRaw;
        if (agd.status !== 'concluido') {
          const { data: chkFinalizado } = await supabase
            .from('checklists')
            .select('id')
            .eq('agendamento_id', agendamentoId)
            .not('fim_em', 'is', null)
            .maybeSingle();

          if (chkFinalizado) {
            await supabase
              .from('agendamentos_preventivos')
              .update({ status: 'concluido' })
              .eq('id', agendamentoId);
            // [FIX-4] Atualiza agd local junto com o banco
            agd = { ...agd, status: 'concluido' };
          }
        }
        setAg(agd);

        const { data: ps, error: e2 } = await supabase
          .from('pecas_equipamento')
          .select('id, nome')
          .eq('equipamento_id', agd.equipamentos.id)
          .order('nome');
        if (e2) throw e2;
        setPecas(ps ?? []);

        // Verifica checklist em andamento para continuação.
        // [FIX-4] Só entra em execucao se status ainda não for 'concluido'.
        if (agd.status !== 'concluido') {
          const { data: chkEx } = await supabase
            .from('checklists')
            .select('id, inicio_em, obs_geral')
            .eq('agendamento_id', agendamentoId)
            .is('fim_em', null)
            .maybeSingle();

          if (chkEx) {
            setChkId(chkEx.id);
            inicioRef.current = new Date(chkEx.inicio_em).getTime();
            setFase('execucao');

            const { data: rr } = await supabase
              .from('checklist_respostas')
              .select('peca_equipamento_id, status_resposta, observacao')
              .eq('checklist_id', chkEx.id);
            if (rr) {
              const m = {};
              rr.forEach(r => { m[r.peca_equipamento_id] = { status: r.status_resposta, observacao: r.observacao ?? '' }; });
              setRespostas(m);
            }

            if (chkEx.obs_geral) {
              try {
                const parsed = JSON.parse(chkEx.obs_geral);
                if (parsed._itens_admin) {
                  const mAdmin = {};
                  parsed._itens_admin.forEach((it, idx) => { mAdmin[idx] = { status: it.status, observacao: it.obs ?? '' }; });
                  setRespostasAdmin(mAdmin);
                }
                if (parsed._obs_usuario) setObsGeral(parsed._obs_usuario);
              } catch {
                setObsGeral(chkEx.obs_geral ?? '');
              }
            }
          }
        }
      } catch (err) {
        setErro('Não foi possível carregar os dados da preventiva.');
        console.error('[Checklist]', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [agendamentoId]);

  // ─── Timer ────────────────────────────────────────────────
  useEffect(() => {
    if (fase === 'execucao') {
      timerRef.current = setInterval(() => {
        setSegundos(Math.floor((Date.now() - inicioRef.current) / 1000));
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [fase]);

  // ─── Computed ─────────────────────────────────────────────
  const hoje        = new Date().toISOString().split('T')[0];
  const diasR       = ag ? diasPara(ag.data_agendada) : null;
  const isMeu       = ag?.mecanico_id === profile?.id;

  // [FIX-4] jaConcluido considera também 'em_andamento' SEM checklist aberto
  // como caso já iniciado — mas a tela já entra direto em execucao nesses casos.
  const jaConcluido = ag?.status === 'concluido';

  // [FIX-4] podeIniciar: exige status estritamente 'pendente'.
  // 'em_andamento' só aparece aqui se o checklist foi perdido (raro),
  // e nesse caso não deve permitir re-início — deve mostrar aviso de contato.
  const podeIniciar = ag?.data_agendada <= hoje && ag?.status === 'pendente';

  const itensAdmin = ag?.itens_checklist ?? [];
  const temItens   = itensAdmin.length > 0;
  const temPecas   = pecas.length > 0;

  const semRespostaPecas = pecas.filter(p => !respostas[p.id]?.status);
  const semRespostaAdmin = itensAdmin.filter((_, idx) => !respostasAdmin[idx]?.status);
  const totalItens       = pecas.length + itensAdmin.length;
  const totalRespondidos = Object.values(respostas).filter(r => r.status).length +
                           Object.values(respostasAdmin).filter(r => r.status).length;
  const progresso        = totalItens > 0 ? Math.round(totalRespondidos / totalItens * 100) : 0;
  const podeFinz         = semRespostaPecas.length === 0 && semRespostaAdmin.length === 0 && totalItens > 0;

  // ─── Ações de resposta ────────────────────────────────────
  const marcarPeca  = (id, status)  => setRespostas(p => ({ ...p, [id]:  { ...p[id],  status, observacao: p[id]?.observacao  ?? '' } }));
  const setObsPeca  = (id, obs)     => setRespostas(p => ({ ...p, [id]:  { ...p[id],  observacao: obs } }));
  const marcarAdmin = (idx, status) => setRespostasAdmin(p => ({ ...p, [idx]: { ...p[idx], status, observacao: p[idx]?.observacao ?? '' } }));
  const setObsAdmin = (idx, obs)    => setRespostasAdmin(p => ({ ...p, [idx]: { ...p[idx], observacao: obs } }));

  // ─── Serializa obs_geral ──────────────────────────────────
  function buildObsGeral() {
    const payload = {};
    if (obsGeral.trim()) payload._obs_usuario = obsGeral.trim();
    if (itensAdmin.length > 0) {
      payload._itens_admin = itensAdmin.map((item, idx) => ({
        item,
        status: respostasAdmin[idx]?.status ?? 'ok',
        obs:    respostasAdmin[idx]?.observacao ?? '',
      }));
    }
    return Object.keys(payload).length > 0 ? JSON.stringify(payload) : null;
  }

  // ─── Notifica superadmins ─────────────────────────────────
  // Fire-and-forget: falha interna não propaga para o fluxo principal.
  const notificarAdmins = async () => {
    try {
      const { data: admins } = await supabase
        .from('usuarios')
        .select('id')
        .eq('role', 'superadmin');

      if (!admins || admins.length === 0) return;

      const equipNome = ag?.equipamentos?.nome ?? 'Equipamento';
      const mecNome   = ag?.mecanico?.nome_completo ?? profile?.nome_completo ?? 'Mecânico';
      const naoConf   = [
        ...Object.values(respostas),
        ...Object.values(respostasAdmin),
      ].filter(r => r.status === 'correcao').length;

      const mensagem = naoConf > 0
        ? `${mecNome} concluiu a preventiva de "${equipNome}" com ${naoConf} item(ns) não conforme(s).`
        : `${mecNome} concluiu a preventiva de "${equipNome}" com sucesso.`;

      await supabase.from('notificacoes').insert(
        admins.map(admin => ({
          user_id:  admin.id,
          tipo:     'preventiva_concluida',
          titulo:   'Preventiva concluída',
          mensagem,
          link:     '/preventivas',
          lida:     false,
        }))
      );
    } catch (err) {
      console.warn('[Checklist] Falha ao notificar admins:', err.message);
    }
  };

  // ─── Iniciar checklist ───────────────────────────────────
  const iniciar = async () => {
    setSalvando(true); setErroSalv('');
    try {
      if (!isOnline) {
        inicioRef.current = Date.now();
        setChkId(`offline-${crypto.randomUUID()}`);
        // [FIX-1] Atualiza ag local → impede que o botão reapareça
        setAg(prev => prev ? { ...prev, status: 'em_andamento' } : prev);
        setFase('execucao');
        setSalvando(false);
        return;
      }
      const { data, error } = await supabase
        .from('checklists')
        .insert({ agendamento_id: agendamentoId, mecanico_id: profile.id })
        .select('id, inicio_em')
        .single();
      if (error) throw error;
      setChkId(data.id);
      inicioRef.current = new Date(data.inicio_em).getTime();

      // [FIX-1] Marca agendamento como 'em_andamento' no banco e localmente
      await supabase
        .from('agendamentos_preventivos')
        .update({ status: 'em_andamento' })
        .eq('id', agendamentoId);
      setAg(prev => prev ? { ...prev, status: 'em_andamento' } : prev);

      setFase('execucao');
    } catch (e) {
      setErroSalv('Erro ao iniciar o checklist. Tente novamente.');
      console.error('[Checklist] iniciar:', e.message);
    } finally {
      setSalvando(false);
    }
  };

  // ─── Finalizar checklist ─────────────────────────────────
  //
  // ORDEM CRÍTICA DE OPERAÇÕES:
  //   1. Marcar agendamento como 'concluido' → PRIORITÁRIO.
  //   2. Atualizar fim_em no registro do checklist.
  //   3. Inserir respostas das peças (INSERT simples).
  //   4. Notificar admins (fire-and-forget).
  //   5. [FIX-2] Atualizar ag local → jaConcluido=true imediatamente.
  const finalizar = async () => {
    if (!podeFinz) {
      setErroSalv(`Responda todos os itens. Faltam ${semRespostaPecas.length + semRespostaAdmin.length}.`);
      return;
    }
    if (salvando) return; // guard duplo-submit

    setSalvando(true); setErroSalv('');
    clearInterval(timerRef.current);

    const obsGeralFinal = buildObsGeral();
    const isOffline     = !isOnline || String(checklistId).startsWith('offline-');

    if (isOffline) {
      const localId = String(checklistId).startsWith('offline-')
        ? checklistId.replace('offline-', '')
        : crypto.randomUUID();
      await addChecklistToQueue({
        localId,
        type:      'checklist_completo',
        createdAt: Date.now(),
        payload: {
          checklist: {
            agendamento_id: agendamentoId,
            mecanico_id:    profile.id,
            obs_geral:      obsGeralFinal,
            fim_em:         new Date().toISOString(),
          },
          respostas: pecas.map(p => ({
            peca_equipamento_id: p.id,
            status_resposta:     respostas[p.id]?.status ?? 'ok',
            observacao:          respostas[p.id]?.observacao ?? null,
          })),
          _meta: {
            equip_nome: ag?.equipamentos?.nome ?? '',
            mec_nome:   ag?.mecanico?.nome_completo ?? profile?.nome_completo ?? '',
          },
        },
      });

      // [FIX-3] Atualiza ag local mesmo offline → bloqueia re-início na sessão atual
      setAg(prev => prev ? { ...prev, status: 'concluido' } : prev);

      setSalvando(false);
      setFase('concluido');
      return;
    }

    try {
      // ── 1. Agendamento → 'concluido' (operação prioritária) ───────────────
      const { error: eAg } = await supabase
        .from('agendamentos_preventivos')
        .update({ status: 'concluido' })
        .eq('id', agendamentoId);
      if (eAg) throw eAg;

      // ── 2. Checklist → fim_em + obs_geral ─────────────────────────────────
      const { error: eChk } = await supabase
        .from('checklists')
        .update({ fim_em: new Date().toISOString(), obs_geral: obsGeralFinal })
        .eq('id', checklistId);
      if (eChk) throw eChk;

      // ── 3. Respostas das peças (INSERT simples) ────────────────────────────
      if (pecas.length > 0) {
        const { error: eRes } = await supabase
          .from('checklist_respostas')
          .insert(
            pecas.map(p => ({
              checklist_id:        checklistId,
              peca_equipamento_id: p.id,
              status_resposta:     respostas[p.id]?.status ?? 'ok',
              observacao:          respostas[p.id]?.observacao ?? null,
            }))
          );
        if (eRes) throw eRes;
      }

      // ── 4. Notificação para admins (fire-and-forget) ───────────────────────
      notificarAdmins();

      // ── 5. [FIX-2] Atualiza ag local → jaConcluido=true sem novo fetch ─────
      setAg(prev => prev ? { ...prev, status: 'concluido' } : prev);

      setFase('concluido');
    } catch (e) {
      console.error('[Checklist] finalizar:', e.message);
      setErroSalv(`Erro ao finalizar: ${e.message}`);
      // Reinicia timer para que o usuário possa tentar novamente
      timerRef.current = setInterval(() => {
        setSegundos(Math.floor((Date.now() - inicioRef.current) / 1000));
      }, 1000);
    } finally {
      setSalvando(false);
    }
  };

  // ─── Renders de estados ───────────────────────────────────
  if (loading) return <Carregando />;
  if (erro)    return <ErroTela msg={erro} onBack={() => navigate('/preventivas')} />;

  if (fase === 'concluido') {
    const nok = [...Object.values(respostas), ...Object.values(respostasAdmin)]
      .filter(r => r.status === 'correcao').length;
    return (
      <TelaConcluido
        equipamento={ag?.equipamentos?.nome}
        duracao={fmtDuracao(segundos)}
        naoConformes={nok}
        offline={!isOnline}
        onVoltar={() => navigate('/preventivas')}
      />
    );
  }

  // ─── Render principal ────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <style>{CSS}</style>

      {/* Topbar */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 56, backgroundColor: '#fff', borderBottom: '1px solid #E8EDF2' }}>
        <button onClick={() => navigate('/preventivas')} disabled={salvando}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer', color: '#0D1B2A', borderRadius: 8, flexShrink: 0 }}>
          <IcoBack />
        </button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#20643F', letterSpacing: 1, textTransform: 'uppercase' }}>Preventiva</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ag?.equipamentos?.nome}</span>
        </div>
        {fase === 'execucao' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', backgroundColor: '#20643F', borderRadius: 20, color: '#fff', flexShrink: 0 }}>
            <IcoClock />
            <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.5px' }}>{fmtDuracao(segundos)}</span>
          </div>
        )}
      </header>

      {!isOnline && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', backgroundColor: '#FEF3C7', color: '#92400E', fontSize: 12, fontWeight: 500, borderBottom: '1px solid rgba(245,158,11,.3)' }}>
          <IcoWifi /> Sem conexão — os dados serão salvos e enviados ao reconectar.
        </div>
      )}

      <main style={{ padding: 16, maxWidth: 640, margin: '0 auto', boxSizing: 'border-box', paddingBottom: 40 }}>

        {/* ═══ FASE PRÉ ═══ */}
        {fase === 'pre' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #E8EDF2', overflow: 'hidden' }}>
              {[
                ['Equipamento',       ag?.equipamentos?.nome],
                ['Data agendada',     fmt(ag?.data_agendada)],
                ['Mecânico',          ag?.mecanico?.nome_completo],
                ['Peças a verificar', pecas.length],
                ['Itens do Admin',    itensAdmin.length > 0 ? `${itensAdmin.length} item(ns)` : 'Nenhum'],
              ].map(([l, v], i, arr) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : 'none', gap: 12 }}>
                  <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', flexShrink: 0 }}>{l}</span>
                  <span style={{ fontSize: 14, color: '#0D1B2A', fontWeight: 600, textAlign: 'right' }}>{v}</span>
                </div>
              ))}
            </div>

            {itensAdmin.length > 0 && (
              <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #E8EDF2', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #F1F5F9' }}>
                  <IcoList />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A' }}>Itens definidos pelo Admin</span>
                  <span style={{ marginLeft: 'auto', padding: '2px 8px', backgroundColor: 'rgba(32,100,63,0.08)', color: '#20643F', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{itensAdmin.length}</span>
                </div>
                <ul style={{ margin: 0, padding: '8px 16px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {itensAdmin.map((item, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', padding: '4px 0' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#20643F', flexShrink: 0 }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* [FIX-4] Avisos de estado — ordem de prioridade */}
            {jaConcluido && <Aviso tipo="sucesso" texto="Esta preventiva já foi concluída com sucesso." />}
            {!jaConcluido && !isMeu && <Aviso tipo="info" texto="Este agendamento foi atribuído a outro mecânico." />}

            {/* [FIX-4] 'em_andamento' sem checklist aberto = estado inconsistente */}
            {!jaConcluido && isMeu && ag?.status === 'em_andamento' && (
              <Aviso tipo="alerta" texto="Esta preventiva está em andamento. Retorne à tela anterior e acesse novamente para continuar." />
            )}

            {!jaConcluido && isMeu && ag?.status === 'pendente' && diasR !== null && diasR > 0 && (
              <Aviso tipo={diasR <= 3 ? 'alerta' : 'info'} texto={`O checklist só pode ser iniciado em ${fmt(ag?.data_agendada)}. Faltam ${diasR} dia(s).`} />
            )}
            {!jaConcluido && isMeu && ag?.status === 'pendente' && diasR !== null && diasR < 0 && (
              <Aviso tipo="erro" texto={`Atrasado ${Math.abs(diasR)} dia(s). Inicie imediatamente.`} />
            )}
            {!jaConcluido && isMeu && totalItens === 0 && ag?.status === 'pendente' && (
              <Aviso tipo="alerta" texto="Nenhum item de checklist cadastrado para este agendamento." />
            )}

            {/* [FIX-4] Botão de início: só aparece quando status === 'pendente' */}
            {!jaConcluido && isMeu && podeIniciar && totalItens > 0 && (
              <>
                {erroSalv && (
                  <div style={{ padding: '12px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 9, fontSize: 13, color: '#DC2626' }}>
                    {erroSalv}
                  </div>
                )}
                <button onClick={iniciar} disabled={salvando}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15, width: '100%', backgroundColor: '#20643F', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: salvando ? 0.7 : 1 }}>
                  {salvando ? <><Spinner />Iniciando...</> : <><IcoPlay />Iniciar checklist</>}
                </button>
              </>
            )}
          </div>
        )}

        {/* ═══ FASE EXECUÇÃO ═══ */}
        {fase === 'execucao' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Barra de progresso */}
            <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #E8EDF2', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Progresso</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#20643F' }}>{progresso}%</span>
              </div>
              <div style={{ height: 8, backgroundColor: '#E8EDF2', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', backgroundColor: '#20643F', borderRadius: 4, width: `${progresso}%`, transition: 'width .3s ease' }} />
              </div>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>{totalRespondidos} de {totalItens} respondidos</span>
            </div>

            {/* Itens do Admin */}
            {temItens && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 14px', backgroundColor: 'rgba(32,100,63,0.06)', borderRadius: 10, border: '1px solid rgba(32,100,63,0.15)' }}>
                  <IcoList />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#20643F' }}>Pontos do Checklist ({itensAdmin.length})</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#20643F', fontWeight: 600 }}>
                    {Object.values(respostasAdmin).filter(r => r.status).length}/{itensAdmin.length} ✓
                  </span>
                </div>
                {itensAdmin.map((item, idx) => (
                  <ItemChecklistAdmin
                    key={idx} item={item} idx={idx}
                    resposta={respostasAdmin[idx]}
                    onMarcar={marcarAdmin} onObs={setObsAdmin}
                    disabled={salvando}
                  />
                ))}
              </div>
            )}

            {/* Peças do equipamento */}
            {temPecas && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 14px', backgroundColor: 'rgba(32,100,63,0.06)', borderRadius: 10, border: '1px solid rgba(32,100,63,0.15)' }}>
                  <IcoWrench />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#20643F' }}>Peças do Equipamento ({pecas.length})</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#20643F', fontWeight: 600 }}>
                    {Object.values(respostas).filter(r => r.status).length}/{pecas.length} ✓
                  </span>
                </div>
                {pecas.map(p => (
                  <ItemChecklistPeca
                    key={p.id} peca={p}
                    resposta={respostas[p.id]}
                    onMarcar={marcarPeca} onObs={setObsPeca}
                    disabled={salvando}
                  />
                ))}
              </div>
            )}

            {!temItens && !temPecas && (
              <Aviso tipo="alerta" texto="Nenhum item de checklist ou peça cadastrada para este agendamento." />
            )}

            {/* Observação geral */}
            <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #E8EDF2', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                Observações gerais (opcional)
              </label>
              <textarea
                placeholder="Registre qualquer observação geral sobre a preventiva..."
                value={obsGeral}
                onChange={e => setObsGeral(e.target.value)}
                style={{ padding: 12, fontSize: 14, border: '1.5px solid #E2E8F0', borderRadius: 8, backgroundColor: '#F8FAFC', fontFamily: 'inherit', color: '#0D1B2A', width: '100%', boxSizing: 'border-box', lineHeight: 1.55 }}
                rows={3} maxLength={500} disabled={salvando}
              />
            </div>

            {erroSalv && (
              <div style={{ padding: '12px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 9, fontSize: 13, color: '#DC2626' }}>
                {erroSalv}
              </div>
            )}

            {!podeFinz && totalItens > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', backgroundColor: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 9, fontSize: 13, color: '#92400E', fontWeight: 500 }}>
                <IcoAlert c="#92400E" />
                Responda todos os itens. Faltam {semRespostaPecas.length + semRespostaAdmin.length}.
              </div>
            )}

            <button
              onClick={finalizar}
              disabled={salvando || !podeFinz}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15, width: '100%', backgroundColor: '#20643F', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', opacity: (salvando || !podeFinz) ? 0.5 : 1, cursor: (salvando || !podeFinz) ? 'not-allowed' : 'pointer' }}>
              {salvando ? <><Spinner />Salvando...</> : <><IcoCheck c="#fff" />Finalizar preventiva</>}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
