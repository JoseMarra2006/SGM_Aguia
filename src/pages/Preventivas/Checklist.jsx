// src/pages/Preventivas/Checklist.jsx
// ALTERAÇÕES VISUAIS (sessão anterior — confirmadas OK):
//   • #0F4C81 → #20643F em: label topbar, botão iniciar, barra de progresso, % progresso, IcoObs, botões de retorno
//   • #0D1B2A → #20643F nos fundos do timer chip e botão finalizar
//   • AVISO info: rgba(15,76,129,…) → rgba(32,100,63,…), #1E3A5F → #1A4A2E
//   • CSS de focus → verde
// AUDITORIA DE VISIBILIDADE (confirmada OK):
//   • Timer chip: backgroundColor=#20643F, color do parent=#fff → IcoClock herda white → OK
//   • Botão iniciar: #20643F bg + white text + IcoPlay fill=currentColor(white) → OK
//   • Botão finalizar: #20643F bg + white text + IcoCheck c="#fff" → OK
//   • Barra de progresso: #20643F sobre #E8EDF2 → OK
//   • IcoObs: stroke #20643F quando ativo, #94A3B8 quando inativo → OK sobre branco
//   • Aviso info: rgba(32,100,63,.06) bg + #1A4A2E text → OK
//   • IcoBack, topbar back button: color=#0D1B2A sobre fundo branco → OK

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import useAuthStore from '../../store/authStore';
import useAppStore from '../../store/appStore';

// ─── Helpers ───────────────────────────────────────────────
function fmt(dateStr) {
  if (!dateStr) return '—';
  const [a, m, d] = dateStr.split('-');
  return `${d}/${m}/${a}`;
}
function diasPara(dateStr) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  return Math.round((new Date(dateStr+'T00:00:00') - hoje) / 86400000);
}
function fmtDuracao(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
  const p = (n) => String(n).padStart(2,'0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}

// ─── Ícones inline ─────────────────────────────────────────
const IcoBack  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcoClock = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
const IcoPlay  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg>;
const IcoCheck = ({c='currentColor'}) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcoAlert = ({c='#EF4444'}) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={c} strokeWidth="2" strokeLinecap="round"/><path d="M12 9v4M12 17h.01" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>;
// IcoObs: stroke #20643F quando ativo (visível sobre branco), #94A3B8 inativo
const IcoObs   = ({on}) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke={on?'#20643F':'#94A3B8'} strokeWidth="2" fill={on?'rgba(32,100,63,.08)':'none'}/></svg>;
const IcoWifi  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.8M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
const Spinner  = () => <span style={{display:'inline-block',width:15,height:15,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite',marginRight:8}}/>;

// ─── Aviso contextual ───────────────────────────────────────
const AVISO_CORES = {
  sucesso: { bg:'rgba(16,185,129,.08)',  bd:'rgba(16,185,129,.25)', c:'#065F46' },
  alerta:  { bg:'rgba(245,158,11,.08)', bd:'rgba(245,158,11,.3)',  c:'#92400E' },
  erro:    { bg:'rgba(239,68,68,.08)',   bd:'rgba(239,68,68,.25)',  c:'#991B1B' },
  // info: verde escuro no lugar do azul anterior
  info:    { bg:'rgba(32,100,63,.06)',   bd:'rgba(32,100,63,.2)',   c:'#1A4A2E' },
};
function Aviso({ tipo, texto }) {
  const c = AVISO_CORES[tipo] ?? AVISO_CORES.info;
  return <div style={{padding:'13px 16px',backgroundColor:c.bg,border:`1px solid ${c.bd}`,borderRadius:10,fontSize:13,color:c.c,fontWeight:500,lineHeight:1.5}}>{texto}</div>;
}

// ─── Item do Checklist ──────────────────────────────────────
function ItemChecklist({ peca, resposta, onMarcar, onObs, disabled }) {
  const [obsOpen, setObsOpen] = useState(false);
  const isOk  = resposta?.status === 'ok';
  const isNok = resposta?.status === 'correcao';
  const cor   = isOk ? '#10B981' : isNok ? '#EF4444' : '#E2E8F0';

  return (
    <div style={{backgroundColor:'#fff',borderRadius:10,border:'1px solid #E8EDF2',borderLeft:`4px solid ${cor}`,padding:14,display:'flex',flexDirection:'column',gap:10}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
        <span style={{fontSize:14,fontWeight:600,color:'#0D1B2A',flex:1}}>{peca.nome}</span>
        {resposta && (
          <button onClick={() => setObsOpen(v=>!v)} style={{display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,border:'1px solid #E2E8F0',borderRadius:7,background:'none',cursor:'pointer'}}>
            <IcoObs on={!!resposta.observacao || obsOpen}/>
          </button>
        )}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        {[
          { s:'ok',       label:'Conforme',     ativo:isOk,  bgA:'#10B981', bdA:'#10B981', bgI:'transparent', bdI:'#A7F3D0', cA:'#fff', cI:'#10B981' },
          { s:'correcao', label:'Não conforme', ativo:isNok, bgA:'#EF4444', bdA:'#EF4444', bgI:'transparent', bdI:'#FECACA', cA:'#fff', cI:'#EF4444' },
        ].map(btn => (
          <button key={btn.s} onClick={() => onMarcar(peca.id, btn.s)} disabled={disabled}
            style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4,padding:'10px 8px',border:`1.5px solid ${btn.ativo?btn.bdA:btn.bdI}`,borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',backgroundColor:btn.ativo?btn.bgA:btn.bgI,color:btn.ativo?btn.cA:btn.cI,transition:'all .15s'}}>
            {btn.s === 'ok' ? <IcoCheck c={btn.ativo?'#fff':'#10B981'}/> : <IcoAlert c={btn.ativo?'#fff':'#EF4444'}/>}
            {btn.label}
          </button>
        ))}
      </div>

      {(obsOpen || resposta?.observacao) && resposta && (
        <textarea placeholder="Observação sobre esta peça (opcional)..." value={resposta.observacao??''} onChange={e=>onObs(peca.id,e.target.value)}
          style={{padding:'10px 12px',fontSize:13,border:'1.5px solid #E2E8F0',borderRadius:8,backgroundColor:'#F8FAFC',fontFamily:'inherit',color:'#374151',width:'100%',boxSizing:'border-box',lineHeight:1.5,resize:'vertical'}}
          rows={2} maxLength={300} disabled={disabled}/>
      )}
    </div>
  );
}

// ─── Tela de Conclusão ──────────────────────────────────────
function TelaConcluido({ equipamento, duracao, naoConformes, offline, onVoltar }) {
  return (
    <div style={{minHeight:'100dvh',backgroundColor:'#F4F7FA',display:'flex',alignItems:'center',justifyContent:'center',padding:24,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <style>{CSS}</style>
      <div style={{backgroundColor:'#fff',borderRadius:20,border:'1px solid #E8EDF2',padding:'36px 28px',maxWidth:420,width:'100%',display:'flex',flexDirection:'column',alignItems:'center',gap:16,animation:'popIn .35s ease both'}}>
        <div style={{width:72,height:72,borderRadius:'50%',backgroundColor:'#10B981',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <IcoCheck c="#fff"/>
        </div>
        <h2 style={{margin:0,fontSize:22,fontWeight:800,color:'#0D1B2A',letterSpacing:'-0.3px'}}>Preventiva concluída!</h2>
        <p style={{margin:0,fontSize:14,color:'#64748B',textAlign:'center'}}>{equipamento}</p>

        <div style={{display:'flex',alignItems:'center',gap:24,padding:'16px 0',borderTop:'1px solid #F1F5F9',borderBottom:'1px solid #F1F5F9',width:'100%',justifyContent:'center'}}>
          {[{v:duracao,l:'Duração'},{v:naoConformes,l:'Não conformes',cor:naoConformes>0?'#EF4444':'#10B981'}].map((s,i) => (
            <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
              <span style={{fontSize:24,fontWeight:800,color:s.cor??'#0D1B2A',fontVariantNumeric:'tabular-nums'}}>{s.v}</span>
              <span style={{fontSize:11,color:'#94A3B8',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px'}}>{s.l}</span>
            </div>
          ))}
        </div>

        {offline && (
          <div style={{display:'flex',alignItems:'center',gap:7,padding:'10px 14px',backgroundColor:'#FEF3C7',border:'1px solid rgba(245,158,11,.3)',borderRadius:8,fontSize:12,color:'#92400E',fontWeight:500,width:'100%',boxSizing:'border-box'}}>
            <IcoWifi/> Salvo localmente. Será sincronizado ao reconectar.
          </div>
        )}
        {naoConformes > 0 && (
          <div style={{padding:'12px 14px',backgroundColor:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.2)',borderRadius:8,fontSize:13,color:'#991B1B',width:'100%',boxSizing:'border-box',textAlign:'center'}}>
            ⚠ {naoConformes} item(ns) não conforme(s). Considere abrir uma OS corretiva.
          </div>
        )}
        <button onClick={onVoltar} style={{padding:'13px 32px',backgroundColor:'#20643F',color:'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',width:'100%'}}>
          Voltar para preventivas
        </button>
      </div>
    </div>
  );
}

// ─── Telas de carregamento/erro ─────────────────────────────
function Carregando() {
  return (
    <div style={{minHeight:'100dvh',backgroundColor:'#F4F7FA',fontFamily:"'DM Sans',sans-serif"}}>
      <style>{CSS}</style>
      <div style={{height:56,backgroundColor:'#fff',borderBottom:'1px solid #E8EDF2'}}/>
      <div style={{padding:20,display:'flex',flexDirection:'column',gap:12}}>
        {[80,60,70,50].map((w,i) => <div key={i} style={{height:14,width:`${w}%`,borderRadius:7,background:'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)',backgroundSize:'400px',animation:'shimmer 1.4s infinite linear'}}/>)}
      </div>
    </div>
  );
}
function Erro({ msg, onBack }) {
  return (
    <div style={{minHeight:'100dvh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,fontFamily:"'DM Sans',sans-serif",padding:24,textAlign:'center',backgroundColor:'#F4F7FA'}}>
      <span style={{fontSize:48}}>⚠️</span>
      <p style={{color:'#64748B',fontSize:15,margin:0}}>{msg}</p>
      <button onClick={onBack} style={{padding:'12px 24px',backgroundColor:'#20643F',color:'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:600,cursor:'pointer'}}>Voltar</button>
    </div>
  );
}

// ─── CSS global ─────────────────────────────────────────────
const CSS = `
  @keyframes spin    { to { transform:rotate(360deg); } }
  @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
  @keyframes popIn   { from{opacity:0;transform:scale(.85)} to{opacity:1;transform:scale(1)} }
  textarea{resize:vertical;}
  textarea:focus,input:focus{outline:none;border-color:#20643F!important;box-shadow:0 0 0 3px rgba(32,100,63,.1)!important;}
`;

// ─── Componente principal ───────────────────────────────────
export default function Checklist() {
  const { agendamentoId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { isOnline, addChecklistToQueue } = useAppStore();

  const [ag, setAg]           = useState(null);
  const [pecas, setPecas]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState(null);

  const [fase, setFase]           = useState('pre');
  const [checklistId, setChkId]   = useState(null);
  const [respostas, setRespostas] = useState({});
  const [obsGeral, setObsGeral]   = useState('');
  const [salvando, setSalvando]   = useState(false);
  const [erroSalv, setErroSalv]   = useState('');
  const [segundos, setSegundos]   = useState(0);

  const timerRef  = useRef(null);
  const inicioRef = useRef(null);

  // Busca dados
  useEffect(() => {
    (async () => {
      setLoading(true); setErro(null);
      try {
        const { data: agd, error: e1 } = await supabase
          .from('agendamentos_preventivos')
          .select('id,data_agendada,status,mecanico_id,equipamentos(id,nome,descricao),usuarios(id,nome_completo)')
          .eq('id', agendamentoId).single();
        if (e1) throw e1;
        setAg(agd);

        const { data: ps, error: e2 } = await supabase
          .from('pecas_equipamento').select('id,nome')
          .eq('equipamento_id', agd.equipamentos.id).order('nome');
        if (e2) throw e2;
        setPecas(ps ?? []);

        const { data: chkEx } = await supabase
          .from('checklists').select('id,inicio_em')
          .eq('agendamento_id', agendamentoId).is('fim_em', null).maybeSingle();

        if (chkEx) {
          setChkId(chkEx.id);
          inicioRef.current = new Date(chkEx.inicio_em).getTime();
          setFase('execucao');
          const { data: rr } = await supabase
            .from('checklist_respostas').select('peca_equipamento_id,status_resposta,observacao')
            .eq('checklist_id', chkEx.id);
          if (rr) {
            const m = {};
            rr.forEach(r => { m[r.peca_equipamento_id] = { status: r.status_resposta, observacao: r.observacao??'' }; });
            setRespostas(m);
          }
        }
      } catch(err) {
        setErro('Não foi possível carregar os dados da preventiva.');
      } finally { setLoading(false); }
    })();
  }, [agendamentoId]);

  // Timer
  useEffect(() => {
    if (fase === 'execucao') {
      timerRef.current = setInterval(() => {
        setSegundos(Math.floor((Date.now() - inicioRef.current) / 1000));
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [fase]);

  const hoje        = new Date().toISOString().split('T')[0];
  const diasR       = ag ? diasPara(ag.data_agendada) : null;
  const isMeu       = ag?.mecanico_id === profile?.id;
  const jaConcluido = ag?.status === 'concluido';
  const podeIniciar = ag?.data_agendada === hoje && ag?.status === 'pendente';

  const marcar = (id, status) => setRespostas(p => ({ ...p, [id]: { ...p[id], status, observacao: p[id]?.observacao??'' } }));
  const setObs = (id, obs)    => setRespostas(p => ({ ...p, [id]: { ...p[id], observacao: obs } }));

  const semResposta = pecas.filter(p => !respostas[p.id]?.status);
  const podeFinz    = semResposta.length === 0;
  const progresso   = pecas.length > 0
    ? Math.round(Object.values(respostas).filter(r=>r.status).length / pecas.length * 100) : 0;

  // Iniciar
  const iniciar = async () => {
    setSalvando(true); setErroSalv('');
    try {
      if (!isOnline) {
        inicioRef.current = Date.now();
        setChkId(`offline-${crypto.randomUUID()}`);
        setFase('execucao'); setSalvando(false); return;
      }
      const { data, error } = await supabase.from('checklists')
        .insert({ agendamento_id: agendamentoId, mecanico_id: profile.id })
        .select('id,inicio_em').single();
      if (error) throw error;
      setChkId(data.id);
      inicioRef.current = new Date(data.inicio_em).getTime();
      setFase('execucao');
      await supabase.from('agendamentos_preventivos').update({ status:'em_andamento' }).eq('id', agendamentoId);
    } catch(e) {
      setErroSalv('Erro ao iniciar o checklist. Tente novamente.');
    } finally { setSalvando(false); }
  };

  // Finalizar
  const finalizar = async () => {
    if (!podeFinz) { setErroSalv(`Responda todas as peças. Faltam ${semResposta.length}.`); return; }
    setSalvando(true); setErroSalv('');
    clearInterval(timerRef.current);

    const isOffline = !isOnline || String(checklistId).startsWith('offline-');

    if (isOffline) {
      const localId = String(checklistId).startsWith('offline-')
        ? checklistId.replace('offline-','') : crypto.randomUUID();
      await addChecklistToQueue({
        localId, type:'checklist_completo', createdAt: Date.now(),
        payload: {
          checklist: { agendamento_id: agendamentoId, mecanico_id: profile.id, obs_geral: obsGeral||null, fim_em: new Date().toISOString() },
          respostas: pecas.map(p => ({ peca_equipamento_id: p.id, status_resposta: respostas[p.id].status, observacao: respostas[p.id].observacao||null })),
        },
      });
      setSalvando(false); setFase('concluido'); return;
    }

    try {
      const { error: e1 } = await supabase.from('checklists')
        .update({ fim_em: new Date().toISOString(), obs_geral: obsGeral||null }).eq('id', checklistId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('checklist_respostas').upsert(
        pecas.map(p => ({ checklist_id: checklistId, peca_equipamento_id: p.id, status_resposta: respostas[p.id].status, observacao: respostas[p.id].observacao||null })),
        { onConflict: 'checklist_id,peca_equipamento_id' }
      );
      if (e2) throw e2;
      const { error: e3 } = await supabase.from('agendamentos_preventivos').update({ status:'concluido' }).eq('id', agendamentoId);
      if (e3) throw e3;
      setFase('concluido');
    } catch(e) {
      setErroSalv(`Erro ao finalizar: ${e.message}`);
    } finally { setSalvando(false); }
  };

  // ─── Renders ───────────────────────────────────────────────
  if (loading) return <Carregando/>;
  if (erro)    return <Erro msg={erro} onBack={() => navigate('/preventivas')}/>;

  if (fase === 'concluido') {
    const nok = Object.values(respostas).filter(r=>r.status==='correcao').length;
    return <TelaConcluido equipamento={ag?.equipamentos?.nome} duracao={fmtDuracao(segundos)} naoConformes={nok} offline={!isOnline} onVoltar={() => navigate('/preventivas')}/>;
  }

  return (
    <div style={{minHeight:'100dvh',backgroundColor:'#F4F7FA',fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <style>{CSS}</style>

      {/* Topbar */}
      <header style={{position:'sticky',top:0,zIndex:20,display:'flex',alignItems:'center',gap:10,padding:'0 16px',height:56,backgroundColor:'#fff',borderBottom:'1px solid #E8EDF2'}}>
        <button onClick={() => navigate('/preventivas')} disabled={salvando}
          style={{display:'flex',alignItems:'center',justifyContent:'center',width:36,height:36,border:'none',background:'none',cursor:'pointer',color:'#0D1B2A',borderRadius:8,flexShrink:0}}>
          <IcoBack/>
        </button>
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>
          {/* Label 'Preventiva' em verde — visível sobre fundo branco */}
          <span style={{fontSize:11,fontWeight:600,color:'#20643F',letterSpacing:1,textTransform:'uppercase'}}>Preventiva</span>
          <span style={{fontSize:15,fontWeight:700,color:'#0D1B2A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ag?.equipamentos?.nome}</span>
        </div>
        {fase === 'execucao' && (
          // Timer chip verde — IcoClock herda color:#fff do container
          <div style={{display:'flex',alignItems:'center',gap:5,padding:'5px 11px',backgroundColor:'#20643F',borderRadius:20,color:'#fff',flexShrink:0}}>
            <IcoClock/>
            <span style={{fontSize:13,fontWeight:700,fontVariantNumeric:'tabular-nums',letterSpacing:'0.5px'}}>{fmtDuracao(segundos)}</span>
          </div>
        )}
      </header>

      {/* Banner offline */}
      {!isOnline && (
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',backgroundColor:'#FEF3C7',color:'#92400E',fontSize:12,fontWeight:500,borderBottom:'1px solid rgba(245,158,11,.3)'}}>
          <IcoWifi/> Sem conexão — os dados serão salvos e enviados ao reconectar.
        </div>
      )}

      <main style={{padding:16,maxWidth:640,margin:'0 auto',boxSizing:'border-box'}}>

        {/* FASE PRÉ */}
        {fase === 'pre' && (
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{backgroundColor:'#fff',borderRadius:12,border:'1px solid #E8EDF2',overflow:'hidden'}}>
              {[
                ['Equipamento',       ag?.equipamentos?.nome],
                ['Data agendada',     fmt(ag?.data_agendada)],
                ['Mecânico',          ag?.usuarios?.nome_completo],
                ['Peças a verificar', pecas.length],
              ].map(([l,v],i,arr) => (
                <div key={l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'13px 16px',borderBottom: i<arr.length-1 ? '1px solid #F1F5F9':'none',gap:12}}>
                  <span style={{fontSize:12,color:'#94A3B8',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.3px',flexShrink:0}}>{l}</span>
                  <span style={{fontSize:14,color:'#0D1B2A',fontWeight:600,textAlign:'right'}}>{v}</span>
                </div>
              ))}
            </div>

            {jaConcluido && <Aviso tipo="sucesso" texto="Esta preventiva já foi concluída com sucesso."/>}
            {!jaConcluido && !isMeu && <Aviso tipo="info" texto="Este agendamento foi atribuído a outro mecânico."/>}
            {!jaConcluido && isMeu && diasR > 0 && <Aviso tipo={diasR<=3?'alerta':'info'} texto={`O checklist só pode ser iniciado em ${fmt(ag?.data_agendada)}. Faltam ${diasR} dia(s).`}/>}
            {!jaConcluido && isMeu && diasR < 0 && <Aviso tipo="erro" texto={`Atrasado ${Math.abs(diasR)} dia(s). Inicie imediatamente.`}/>}
            {pecas.length === 0 && <Aviso tipo="alerta" texto="Nenhuma peça cadastrada para este equipamento."/>}

            {!jaConcluido && isMeu && (podeIniciar || diasR < 0) && pecas.length > 0 && (
              <>
                {erroSalv && <div style={{padding:'12px 14px',backgroundColor:'#FEF2F2',border:'1px solid #FECACA',borderRadius:9,fontSize:13,color:'#DC2626'}}>{erroSalv}</div>}
                {/* Botão iniciar: #20643F bg + white text + IcoPlay fill=currentColor(white) */}
                <button onClick={iniciar} disabled={salvando}
                  style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:15,width:'100%',backgroundColor:'#20643F',color:'#fff',border:'none',borderRadius:12,fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:'inherit',opacity:salvando?.7:1}}>
                  {salvando ? <><Spinner/>Iniciando...</> : <><IcoPlay/>Iniciar checklist</>}
                </button>
              </>
            )}
          </div>
        )}

        {/* FASE EXECUÇÃO */}
        {fase === 'execucao' && (
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {/* Progresso */}
            <div style={{backgroundColor:'#fff',borderRadius:12,border:'1px solid #E8EDF2',padding:16,display:'flex',flexDirection:'column',gap:8}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:12,fontWeight:700,color:'#374151',textTransform:'uppercase',letterSpacing:'0.3px'}}>Progresso</span>
                {/* Percentual em verde — visível sobre branco */}
                <span style={{fontSize:18,fontWeight:800,color:'#20643F'}}>{progresso}%</span>
              </div>
              <div style={{height:8,backgroundColor:'#E8EDF2',borderRadius:4,overflow:'hidden'}}>
                {/* Barra verde sobre cinza claro — contraste OK */}
                <div style={{height:'100%',backgroundColor:'#20643F',borderRadius:4,width:`${progresso}%`,transition:'width .3s ease'}}/>
              </div>
              <span style={{fontSize:11,color:'#94A3B8'}}>{Object.values(respostas).filter(r=>r.status).length} de {pecas.length} respondidos</span>
            </div>

            {/* Itens */}
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {pecas.map(p => <ItemChecklist key={p.id} peca={p} resposta={respostas[p.id]} onMarcar={marcar} onObs={setObs} disabled={salvando}/>)}
            </div>

            {/* Obs geral */}
            <div style={{backgroundColor:'#fff',borderRadius:12,border:'1px solid #E8EDF2',padding:16,display:'flex',flexDirection:'column',gap:8}}>
              <label style={{fontSize:12,fontWeight:700,color:'#374151',textTransform:'uppercase',letterSpacing:'0.3px'}}>Observações gerais (opcional)</label>
              <textarea placeholder="Registre qualquer observação sobre a preventiva..." value={obsGeral} onChange={e=>setObsGeral(e.target.value)}
                style={{padding:12,fontSize:14,border:'1.5px solid #E2E8F0',borderRadius:8,backgroundColor:'#F8FAFC',fontFamily:'inherit',color:'#0D1B2A',width:'100%',boxSizing:'border-box',lineHeight:1.55}}
                rows={3} maxLength={500} disabled={salvando}/>
            </div>

            {erroSalv && <div style={{padding:'12px 14px',backgroundColor:'#FEF2F2',border:'1px solid #FECACA',borderRadius:9,fontSize:13,color:'#DC2626'}}>{erroSalv}</div>}

            {!podeFinz && (
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'12px 14px',backgroundColor:'rgba(245,158,11,.08)',border:'1px solid rgba(245,158,11,.25)',borderRadius:9,fontSize:13,color:'#92400E',fontWeight:500}}>
                <IcoAlert c="#92400E"/> Responda todos os itens. Faltam {semResposta.length}.
              </div>
            )}

            {/* Botão finalizar: #20643F bg + white text + IcoCheck c="#fff" */}
            <button onClick={finalizar} disabled={salvando || !podeFinz}
              style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:15,width:'100%',backgroundColor:'#20643F',color:'#fff',border:'none',borderRadius:12,fontSize:15,fontWeight:700,fontFamily:'inherit',opacity:(salvando||!podeFinz)?.5:1,cursor:(salvando||!podeFinz)?'not-allowed':'pointer'}}>
              {salvando ? <><Spinner/>Salvando...</> : <><IcoCheck c="#fff"/>Finalizar preventiva</>}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
