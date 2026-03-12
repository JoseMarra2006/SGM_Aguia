// src/pages/Corretivas/Detalhes.jsx

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import useAuthStore from '../../store/authStore';
import useAppStore from '../../store/appStore';

// ─── Helpers ──────────────────────────────────────────────────

function formatarDataHora(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
  em_andamento: { label: 'Em andamento', cor: '#0F4C81', bg: 'rgba(15,76,129,0.1)', borda: 'rgba(15,76,129,0.25)' },
  concluida:    { label: 'Concluída',    cor: '#10B981', bg: 'rgba(16,185,129,0.1)', borda: 'rgba(16,185,129,0.25)' },
  cancelada:    { label: 'Cancelada',    cor: '#94A3B8', bg: 'rgba(148,163,184,0.1)', borda: 'rgba(148,163,184,0.25)' },
};

// ─── Seção de Peças ───────────────────────────────────────────

function SecaoPecas({ osId, equipamentoId, status }) {
  const [pecasEquip, setPecasEquip]     = useState([]);
  const [pecasOficina, setPecasOficina] = useState([]);
  const [utilizadas, setUtilizadas]     = useState([]); // [{ tipo_peca, peca_id, quantidade, nome }]
  const [tipoPeca, setTipoPeca]         = useState('equipamento');
  const [pecaSel, setPecaSel]           = useState('');
  const [qtd, setQtd]                   = useState(1);
  const [salvando, setSalvando]         = useState(false);
  const [erro, setErro]                 = useState('');

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

      // Enriquece com nomes
      const todasPecas = [...(peqs ?? []), ...(pofs ?? [])];
      const enriquecidas = (usadas ?? []).map((u) => {
        const found = todasPecas.find((p) => p.id === u.peca_id);
        return { ...u, nome: found?.nome ?? '—' };
      });
      setUtilizadas(enriquecidas);
    }
    if (osId && equipamentoId) fetchPecas();
  }, [osId, equipamentoId]);

  const opcoes = tipoPeca === 'equipamento' ? pecasEquip : pecasOficina;

  const handleAdicionar = async () => {
    setErro('');
    if (!pecaSel) { setErro('Selecione uma peça.'); return; }
    if (qtd < 1)  { setErro('Quantidade deve ser ao menos 1.'); return; }

    // Verifica estoque se for peça de oficina
    if (tipoPeca === 'oficina') {
      const peca = pecasOficina.find((p) => p.id === pecaSel);
      if (peca && peca.quantidade_estoque < qtd) {
        setErro(`Estoque insuficiente. Disponível: ${peca.quantidade_estoque}`);
        return;
      }
    }

    setSalvando(true);
    try {
      const { error } = await supabase
        .from('os_pecas_utilizadas')
        .insert({ ordem_servico_id: osId, tipo_peca: tipoPeca, peca_id: pecaSel, quantidade: qtd });

      if (error) throw error;

      const nomePeca = opcoes.find((p) => p.id === pecaSel)?.nome ?? '—';
      setUtilizadas((prev) => [...prev, { tipo_peca: tipoPeca, peca_id: pecaSel, quantidade: qtd, nome: nomePeca }]);
      setPecaSel('');
      setQtd(1);

      // Atualiza estoque local para feedback imediato
      if (tipoPeca === 'oficina') {
        setPecasOficina((prev) => prev.map((p) =>
          p.id === pecaSel ? { ...p, quantidade_estoque: p.quantidade_estoque - qtd } : p
        ));
      }
    } catch (err) {
      setErro(`Erro ao adicionar peça: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={SP.wrapper}>
      <div style={SP.titulo}>
        <WrenchSmIcon />
        <span>Peças utilizadas</span>
        {utilizadas.length > 0 && <span style={SP.countBadge}>{utilizadas.length}</span>}
      </div>

      {/* Lista de peças já adicionadas */}
      {utilizadas.length > 0 && (
        <ul style={SP.lista}>
          {utilizadas.map((u, i) => (
            <li key={i} style={SP.item}>
              <div style={SP.itemInfo}>
                <span style={SP.itemNome}>{u.nome}</span>
                <span style={SP.itemTipo}>{u.tipo_peca === 'equipamento' ? 'Equip.' : 'Oficina'}</span>
              </div>
              <span style={SP.itemQtd}>× {u.quantidade}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Formulário de adição (só se em andamento) */}
      {!isFinalizada && (
        <div style={SP.addForm}>
          {/* Toggle tipo */}
          <div style={SP.tipoToggle}>
            {['equipamento', 'oficina'].map((t) => (
              <button
                key={t}
                onClick={() => { setTipoPeca(t); setPecaSel(''); }}
                style={{ ...SP.tipoBtn, ...(tipoPeca === t ? SP.tipoBtnAtivo : {}) }}
              >
                {t === 'equipamento' ? 'Do equipamento' : 'Da oficina'}
              </button>
            ))}
          </div>

          {/* Select + Qtd */}
          <div style={SP.addRow}>
            <select
              value={pecaSel}
              onChange={(e) => setPecaSel(e.target.value)}
              style={SP.select}
              disabled={salvando}
            >
              <option value="">Selecione...</option>
              {opcoes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}{p.quantidade_estoque !== undefined ? ` (estoque: ${p.quantidade_estoque})` : ''}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={qtd}
              onChange={(e) => setQtd(Number(e.target.value))}
              style={SP.qtdInput}
              disabled={salvando}
            />
            <button
              onClick={handleAdicionar}
              disabled={salvando}
              style={SP.addBtn}
            >
              {salvando ? '...' : '+'}
            </button>
          </div>

          {erro && <span style={SP.erro}>{erro}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Tela de Detalhes da OS ───────────────────────────────────

export default function DetalhesOS() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, isSuperAdmin } = useAuthStore();
  const { isOnline } = useAppStore();

  const [os, setOs]             = useState(null);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState(null);

  // Campos de edição
  const [causa, setCausa]                         = useState('');
  const [servicosExecutados, setServicosExecutados] = useState('');
  const [obs, setObs]                             = useState('');

  // Finalização
  const [finalizando, setFinalizando]   = useState(false);
  const [erroFinalizar, setErroFinalizar] = useState('');
  const [confirmando, setConfirmando]   = useState(false); // modal de confirmação

  // Timer ao vivo
  const [segundosDecorridos, setSegundosDecorridos] = useState(0);
  const timerRef = useRef(null);

  // ─── Carrega OS ───────────────────────────────────────────────
  useEffect(() => {
    async function fetchOS() {
      setLoading(true);
      setErro(null);
      try {
        const { data, error } = await supabase
          .from('ordens_servico')
          .select(`
            id, problema, causa, solicitante, hora_parada,
            servicos_executados, obs, status, inicio_em, fim_em,
            mecanico_id,
            equipamentos ( id, nome, status ),
            usuarios     ( id, nome_completo )
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

  // ─── Timer ao vivo (apenas se em_andamento) ───────────────────
  useEffect(() => {
    if (os?.status === 'em_andamento' && os?.inicio_em) {
      timerRef.current = setInterval(() => {
        setSegundosDecorridos(Math.floor((Date.now() - new Date(os.inicio_em).getTime()) / 1000));
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [os?.status, os?.inicio_em]);

  // ─── Salva campos intermediários ──────────────────────────────
  const salvarRascunho = async () => {
    if (!isOnline || os?.status !== 'em_andamento') return;
    await supabase
      .from('ordens_servico')
      .update({ causa: causa || null, servicos_executados: servicosExecutados || null, obs: obs || null })
      .eq('id', id);
  };

  // ─── Finalizar OS ─────────────────────────────────────────────
  const handleFinalizar = async () => {
    setErroFinalizar('');
    if (!servicosExecutados.trim()) {
      setErroFinalizar('Descreva os serviços executados antes de finalizar.');
      setConfirmando(false);
      return;
    }

    setFinalizando(true);
    setConfirmando(false);

    try {
      const { error } = await supabase
        .from('ordens_servico')
        .update({
          status:               'concluida',
          causa:                causa || null,
          servicos_executados:  servicosExecutados,
          obs:                  obs || null,
          fim_em:               new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      clearInterval(timerRef.current);
      setOs((prev) => ({ ...prev, status: 'concluida', fim_em: new Date().toISOString() }));

    } catch (err) {
      setErroFinalizar(`Erro ao finalizar OS: ${err.message}`);
      console.error('[DetalhesOS] Erro ao finalizar:', err.message);
    } finally {
      setFinalizando(false);
    }
  };

  // ─── Cancelar OS (apenas SuperAdmin) ─────────────────────────
  const handleCancelar = async () => {
    if (!isSuperAdmin) return;
    setFinalizando(true);
    try {
      const { error } = await supabase
        .from('ordens_servico')
        .update({ status: 'cancelada', fim_em: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      clearInterval(timerRef.current);
      setOs((prev) => ({ ...prev, status: 'cancelada' }));
    } catch (err) {
      setErroFinalizar(`Erro ao cancelar: ${err.message}`);
    } finally {
      setFinalizando(false);
    }
  };

  if (loading) return <TelaCarregando />;
  if (erro || !os) return <TelaErro message={erro} onBack={() => navigate('/corretivas')} />;

  const cfg = STATUS_CONFIG[os.status] ?? STATUS_CONFIG.em_andamento;
  const isEmAndamento = os.status === 'em_andamento';
  const isMeuOS = os.mecanico_id === profile?.id;
  const podeEditar = isEmAndamento && (isMeuOS || isSuperAdmin);

  // Duração final ou ao vivo
  const duracaoFinal = os.fim_em
    ? Math.floor((new Date(os.fim_em) - new Date(os.inicio_em)) / 1000)
    : null;

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {/* Topbar */}
      <header style={S.topbar}>
        <button onClick={() => navigate('/corretivas')} style={S.backBtn}>
          <BackIcon />
        </button>
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

      <main style={S.main}>

        {/* ── Card de status e info ── */}
        <section style={S.card}>
          <div style={S.statusRow}>
            <span style={{ ...S.statusPill, color: cfg.cor, backgroundColor: cfg.bg, border: `1px solid ${cfg.borda}` }}>
              {cfg.label}
            </span>
            {!isEmAndamento && duracaoFinal !== null && (
              <span style={S.duracaoChip}>
                <TimerIcon /> {formatarDuracao(duracaoFinal)}
              </span>
            )}
          </div>

          <div style={S.infoGrid}>
            <InfoItem label="Equipamento"  value={os.equipamentos?.nome} />
            <InfoItem label="Solicitante"  value={os.solicitante} />
            <InfoItem label="Mecânico"     value={os.usuarios?.nome_completo} />
            <InfoItem label="Abertura"     value={formatarDataHora(os.inicio_em)} />
            {os.hora_parada && <InfoItem label="Parada em"   value={formatarDataHora(os.hora_parada)} />}
            {os.fim_em       && <InfoItem label="Concluída"  value={formatarDataHora(os.fim_em)} />}
          </div>
        </section>

        {/* ── Problema reportado ── */}
        <section style={S.card}>
          <SectionTitle icon={<AlertIcon />} title="Problema reportado" />
          <p style={S.textoBloco}>{os.problema}</p>
        </section>

        {/* ── Causa (editável) ── */}
        <section style={S.card}>
          <SectionTitle icon={<SearchIcon />} title="Causa identificada" />
          {podeEditar ? (
            <textarea
              placeholder="Descreva a causa raiz do problema..."
              value={causa}
              onChange={(e) => setCausa(e.target.value)}
              onBlur={salvarRascunho}
              style={S.textarea}
              rows={3}
              maxLength={400}
              disabled={finalizando}
            />
          ) : (
            <p style={S.textoBloco}>{os.causa || <span style={S.semInfo}>Não informado</span>}</p>
          )}
        </section>

        {/* ── Serviços executados (editável) ── */}
        <section style={S.card}>
          <SectionTitle icon={<WrenchIcon />} title="Serviços executados" />
          {podeEditar ? (
            <>
              <textarea
                placeholder="Descreva todos os serviços realizados..."
                value={servicosExecutados}
                onChange={(e) => setServicosExecutados(e.target.value)}
                onBlur={salvarRascunho}
                style={S.textarea}
                rows={4}
                maxLength={800}
                disabled={finalizando}
              />
              <span style={S.charCount}>{servicosExecutados.length}/800</span>
            </>
          ) : (
            <p style={S.textoBloco}>{os.servicos_executados || <span style={S.semInfo}>Não informado</span>}</p>
          )}
        </section>

        {/* ── Peças utilizadas ── */}
        <section style={S.card}>
          <SecaoPecas
            osId={id}
            equipamentoId={os.equipamentos?.id}
            status={os.status}
          />
        </section>

        {/* ── Observações gerais ── */}
        <section style={S.card}>
          <SectionTitle icon={<ObsIcon />} title="Observações gerais" />
          {podeEditar ? (
            <textarea
              placeholder="Observações adicionais, recomendações de próximas manutenções..."
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              onBlur={salvarRascunho}
              style={S.textarea}
              rows={3}
              maxLength={400}
              disabled={finalizando}
            />
          ) : (
            <p style={S.textoBloco}>{os.obs || <span style={S.semInfo}>Nenhuma observação</span>}</p>
          )}
        </section>

        {/* ── Ações ── */}
        {podeEditar && (
          <>
            {erroFinalizar && (
              <div style={S.erroFinalizar}>
                <AlertIcon cor="#DC2626" /> {erroFinalizar}
              </div>
            )}

            <button
              onClick={() => setConfirmando(true)}
              disabled={finalizando}
              style={{ ...S.btnFinalizar, opacity: finalizando ? 0.7 : 1 }}
            >
              {finalizando ? <><Spinner /> Finalizando...</> : <><CheckIcon /> Finalizar OS</>}
            </button>

            {isSuperAdmin && (
              <button
                onClick={handleCancelar}
                disabled={finalizando}
                style={S.btnCancelar}
              >
                Cancelar OS
              </button>
            )}
          </>
        )}

      </main>

      {/* ── Modal de confirmação de finalização ── */}
      {confirmando && (
        <div style={S.modalOverlay} onClick={() => setConfirmando(false)}>
          <div style={S.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalIcone}>
              <CheckIcon cor="#0F4C81" size={28} />
            </div>
            <h3 style={S.modalTitulo}>Finalizar esta OS?</h3>
            <p style={S.modalSubtitulo}>
              Esta ação irá encerrar o timer e marcar a ordem de serviço como concluída.
              Esta operação não pode ser desfeita.
            </p>
            <div style={S.modalBotoes}>
              <button onClick={() => setConfirmando(false)} style={S.btnModalCancelar}>
                Voltar
              </button>
              <button onClick={handleFinalizar} style={S.btnModalConfirmar}>
                Confirmar finalização
              </button>
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
    <div style={{ minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans',sans-serif" }}>
      <style>{`@keyframes shimmer { 0% { background-position:-400px 0; } 100% { background-position:400px 0; } }`}</style>
      <div style={{ height: '56px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8EDF2' }} />
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[75, 55, 90, 65, 80].map((w, i) => (
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
      <button onClick={onBack} style={{ padding: '12px 24px', backgroundColor: '#0F4C81', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Voltar</button>
    </div>
  );
}

// ─── Ícones ───────────────────────────────────────────────────
function BackIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function TimerIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function AlertIcon({ cor = '#0F4C81' }) { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={cor} strokeWidth="2" strokeLinecap="round"/><path d="M12 9v4M12 17h.01" stroke={cor} strokeWidth="2" strokeLinecap="round"/></svg>; }
function WrenchIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="#0F4C81" strokeWidth="2" strokeLinecap="round"/></svg>; }
function WrenchSmIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="#0F4C81" strokeWidth="2" strokeLinecap="round"/></svg>; }
function SearchIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8" stroke="#0F4C81" strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke="#0F4C81" strokeWidth="2" strokeLinecap="round"/></svg>; }
function ObsIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#0F4C81" strokeWidth="2"/></svg>; }
function CheckIcon({ cor = '#FFFFFF', size = 16 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ marginRight: 7, flexShrink: 0 }}><path d="M20 6L9 17l-5-5" stroke={cor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function OfflineIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.8M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function Spinner() { return <span style={{ display: 'inline-block', width: '15px', height: '15px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFF', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: 8 }} />; }

// ─── Estilos SecaoPecas ───────────────────────────────────────
const SP = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: '12px' },
  titulo: { display: 'flex', alignItems: 'center', gap: '7px', fontSize: '14px', fontWeight: '700', color: '#0D1B2A' },
  countBadge: { marginLeft: 'auto', padding: '2px 8px', backgroundColor: '#EEF2FF', color: '#3B5BDB', borderRadius: '20px', fontSize: '11px', fontWeight: '700' },
  lista: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' },
  item: { display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E8EDF2' },
  itemInfo: { flex: 1, display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' },
  itemNome: { fontSize: '13px', fontWeight: '600', color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemTipo: { fontSize: '10px', fontWeight: '600', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#E8EDF2', color: '#64748B', flexShrink: 0 },
  itemQtd: { fontSize: '13px', fontWeight: '700', color: '#0F4C81', flexShrink: 0 },
  addForm: { display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' },
  tipoToggle: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' },
  tipoBtn: { padding: '8px', border: '1.5px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#FFFFFF', fontSize: '12px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' },
  tipoBtnAtivo: { backgroundColor: '#0F4C81', borderColor: '#0F4C81', color: '#FFFFFF' },
  addRow: { display: 'flex', gap: '6px' },
  select: { flex: 1, padding: '10px 12px', fontSize: '13px', border: '1.5px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#FAFBFC', fontFamily: 'inherit', color: '#0D1B2A', cursor: 'pointer', minWidth: 0 },
  qtdInput: { width: '56px', padding: '10px 8px', fontSize: '13px', border: '1.5px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#FAFBFC', fontFamily: 'inherit', textAlign: 'center', flexShrink: 0 },
  addBtn: { width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F4C81', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '20px', cursor: 'pointer', flexShrink: 0 },
  erro: { fontSize: '12px', color: '#EF4444', fontWeight: '500' },
};

// ─── CSS e Estilos ────────────────────────────────────────────
const CSS = `
  @keyframes spin   { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  textarea { resize: vertical; }
  select:focus, input:focus, textarea:focus { outline: none; border-color: #0F4C81 !important; box-shadow: 0 0 0 3px rgba(15,76,129,0.1) !important; }
`;
const S = {
  page: { minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  topbar: { position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: '10px', padding: '0 16px', height: '56px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8EDF2' },
  backBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: 'none', background: 'none', cursor: 'pointer', color: '#0D1B2A', borderRadius: '8px', flexShrink: 0 },
  topbarCenter: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  topbarSub: { fontSize: '11px', fontWeight: '600', color: '#0F4C81', letterSpacing: '1px', textTransform: 'uppercase' },
  topbarEquip: { fontSize: '15px', fontWeight: '700', color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  timerChip: { display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 11px', backgroundColor: '#0D1B2A', borderRadius: '20px', color: '#FFFFFF', flexShrink: 0 },
  timerTexto: { fontSize: '13px', fontWeight: '700', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.5px' },
  bannerOffline: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '12px', fontWeight: '500', borderBottom: '1px solid rgba(245,158,11,0.3)' },
  main: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '640px', margin: '0 auto', paddingBottom: '40px' },
  card: { backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8EDF2', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' },
  statusRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  statusPill: { padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700' },
  duracaoChip: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#64748B', fontWeight: '500' },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  infoItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  infoLabel: { fontSize: '10px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.4px' },
  infoValor: { fontSize: '13px', fontWeight: '600', color: '#0D1B2A' },
  sectionTitleRow: { display: 'flex', alignItems: 'center', gap: '7px', paddingBottom: '8px', borderBottom: '1px solid #F1F5F9' },
  sectionTitleText: { fontSize: '13px', fontWeight: '700', color: '#0D1B2A' },
  textoBloco: { margin: 0, fontSize: '14px', color: '#374151', lineHeight: 1.6 },
  semInfo: { color: '#94A3B8', fontStyle: 'italic', fontSize: '13px' },
  textarea: { padding: '12px', fontSize: '14px', border: '1.5px solid #E2E8F0', borderRadius: '9px', backgroundColor: '#F8FAFC', fontFamily: 'inherit', color: '#0D1B2A', width: '100%', boxSizing: 'border-box', lineHeight: 1.55 },
  charCount: { fontSize: '11px', color: '#94A3B8', textAlign: 'right', marginTop: '-6px' },
  erroFinalizar: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '9px', fontSize: '13px', color: '#DC2626' },
  btnFinalizar: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '15px', width: '100%', backgroundColor: '#0D1B2A', color: '#FFFFFF', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' },
  btnCancelar: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', width: '100%', backgroundColor: 'transparent', color: '#94A3B8', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
  // Modal
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '24px', animation: 'fadeIn 0.2s ease' },
  modalBox: { backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '32px 28px', width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' },
  modalIcone: { width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(15,76,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalTitulo: { margin: 0, fontSize: '18px', fontWeight: '800', color: '#0D1B2A', letterSpacing: '-0.3px' },
  modalSubtitulo: { margin: 0, fontSize: '13px', color: '#64748B', textAlign: 'center', lineHeight: 1.6 },
  modalBotoes: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%', marginTop: '4px' },
  btnModalCancelar: { padding: '12px', backgroundColor: '#F8FAFC', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
  btnModalConfirmar: { padding: '12px', backgroundColor: '#0F4C81', color: '#FFFFFF', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' },
};