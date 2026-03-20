// src/pages/Corretivas/NovaOS.jsx
// ADIÇÕES v3 (QR / Atalhos operacionais):
//   • Lê ?equipamento_id=[ID] da URL para pré-selecionar o equipamento
//   • Permite abertura direta via QR Code escaneado na máquina
// INALTERADO: toda a lógica de criação de OS, validação, offline, layout.

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import useAuthStore from '../../store/authStore';
import useAppStore from '../../store/appStore';

export default function NovaOS() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, isSuperAdmin } = useAuthStore();
  const { isOnline, addOSToQueue } = useAppStore();

  const [equipamentoId, setEquipamentoId] = useState('');
  const [solicitante, setSolicitante]     = useState('');
  const [problema, setProblema]           = useState('');
  const [horaParada, setHoraParada]       = useState('');
  const [mecanicoId, setMecanicoId]       = useState('');
  const [mecanicos, setMecanicos]         = useState([]);
  const [equipamentos, setEquipamentos]   = useState([]);
  const [loadingDados, setLoadingDados]   = useState(true);
  const [salvando, setSalvando]           = useState(false);
  const [erros, setErros]                 = useState({});
  const [erroGlobal, setErroGlobal]       = useState('');

  // ─── Lê equipamento_id da URL (vindo do QR ou do botão de atalho) ──────────
  const equipFromUrl = searchParams.get('equipamento_id') ?? '';

  // ─── Carrega selects ─────────────────────────────────────────
  useEffect(() => {
    async function fetchDados() {
      setLoadingDados(true);
      try {
        const queries = [
          supabase.from('equipamentos').select('id, nome, status').order('nome'),
        ];
        if (isSuperAdmin) {
          queries.push(
            supabase.from('usuarios').select('id, nome_completo').eq('role', 'mecanico').order('nome_completo')
          );
        }
        const [{ data: eqs }, mecResult] = await Promise.all(queries);
        setEquipamentos(eqs ?? []);
        if (mecResult?.data) setMecanicos(mecResult.data);
        setSolicitante(profile?.nome_completo ?? '');
        if (!isSuperAdmin) setMecanicoId(profile?.id ?? '');

        // Pré-seleciona equipamento vindo da URL (QR Code / botão de atalho)
        if (equipFromUrl) setEquipamentoId(equipFromUrl);

      } catch (err) {
        console.error('[NovaOS] Erro ao carregar dados:', err.message);
      } finally {
        setLoadingDados(false);
      }
    }
    fetchDados();
  }, [isSuperAdmin, profile, equipFromUrl]);

  // ─── Validação ────────────────────────────────────────────────
  const validar = () => {
    const e = {};
    if (!equipamentoId)      e.equipamento = 'Selecione o equipamento.';
    if (!solicitante.trim()) e.solicitante  = 'Informe o nome do solicitante.';
    if (!problema.trim())    e.problema     = 'Descreva o problema.';
    if (problema.trim().length < 10) e.problema = 'Descrição muito curta (mín. 10 caracteres).';
    if (isSuperAdmin && !mecanicoId) e.mecanico = 'Atribua um mecânico responsável.';
    setErros(e);
    return Object.keys(e).length === 0;
  };

  // ─── Submissão ────────────────────────────────────────────────
  const handleSubmit = async () => {
    setErroGlobal('');
    if (!validar()) return;

    setSalvando(true);
    const responsavelId = isSuperAdmin ? mecanicoId : profile.id;

    const payload = {
      equipamento_id: equipamentoId,
      mecanico_id:    responsavelId,
      solicitante:    solicitante.trim(),
      problema:       problema.trim(),
      hora_parada:    horaParada ? new Date(horaParada).toISOString() : null,
      status:         'em_andamento',
    };

    try {
      if (!isOnline) {
        const localId = crypto.randomUUID();
        await addOSToQueue({ localId, type: 'os_iniciada', createdAt: Date.now(), payload: { os: payload } });
        navigate('/corretivas', { replace: true });
        return;
      }
      const { data, error } = await supabase
        .from('ordens_servico').insert(payload).select('id').single();
      if (error) throw error;
      navigate(`/corretivas/${data.id}`, { replace: true });
    } catch (err) {
      setErroGlobal(`Erro ao abrir OS: ${err.message}`);
      console.error('[NovaOS] Erro:', err.message);
    } finally {
      setSalvando(false);
    }
  };

  if (loadingDados) return <TelaCarregando />;

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {/* Topbar */}
      <header style={S.topbar}>
        <button onClick={() => navigate('/corretivas')} style={S.backBtn} disabled={salvando}>
          <BackIcon />
        </button>
        <h1 style={S.topbarTitle}>Nova Ordem de Serviço</h1>
      </header>

      {/* Banner offline */}
      {!isOnline && (
        <div style={S.bannerOffline}>
          <OfflineIcon /> Sem conexão — a OS será salva localmente e enviada ao reconectar.
        </div>
      )}

      {/* Banner de pré-seleção via QR */}
      {equipFromUrl && equipamentos.find(e => e.id === equipFromUrl) && (
        <div style={S.bannerQR}>
          <QRSmIcon />
          Equipamento pré-selecionado via QR Code. Confirme e preencha os demais dados.
        </div>
      )}

      <main style={S.main}>

        {/* Equipamento */}
        <FormSection title="Equipamento" icon={<GearIcon />}>
          <FormField label="Equipamento com defeito *" error={erros.equipamento}>
            <select value={equipamentoId} onChange={(e) => setEquipamentoId(e.target.value)}
              style={{ ...S.select, ...(erros.equipamento ? S.inputError : {}) }} disabled={salvando}>
              <option value="">Selecione o equipamento...</option>
              {equipamentos.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.nome}{eq.status === 'em_manutencao' ? ' ⚠ Em manutenção' : ''}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Hora em que o equipamento parou (opcional)">
            <input type="datetime-local" value={horaParada} onChange={(e) => setHoraParada(e.target.value)}
              style={S.input} disabled={salvando} max={new Date().toISOString().slice(0, 16)} />
          </FormField>
        </FormSection>

        {/* Responsável */}
        <FormSection title="Responsável" icon={<UserIcon />}>
          <FormField label="Solicitante *" error={erros.solicitante}>
            <input type="text" placeholder="Nome de quem está abrindo o chamado"
              value={solicitante} onChange={(e) => setSolicitante(e.target.value)}
              style={{ ...S.input, ...(erros.solicitante ? S.inputError : {}) }}
              maxLength={80} disabled={salvando} />
          </FormField>
          {isSuperAdmin && (
            <FormField label="Mecânico responsável *" error={erros.mecanico}>
              <select value={mecanicoId} onChange={(e) => setMecanicoId(e.target.value)}
                style={{ ...S.select, ...(erros.mecanico ? S.inputError : {}) }} disabled={salvando}>
                <option value="">Selecione o mecânico...</option>
                {mecanicos.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome_completo}</option>
                ))}
              </select>
            </FormField>
          )}
        </FormSection>

        {/* Problema */}
        <FormSection title="Descrição do Problema" icon={<AlertIcon />}>
          <FormField label="Descreva o defeito / ocorrência *" error={erros.problema}>
            <textarea
              placeholder="Ex: Equipamento emite ruído anormal ao ligar, travando após 5 minutos de operação..."
              value={problema} onChange={(e) => setProblema(e.target.value)}
              style={{ ...S.textarea, ...(erros.problema ? S.inputError : {}) }}
              rows={4} maxLength={600} disabled={salvando} />
            <span style={S.charCount}>{problema.length}/600</span>
          </FormField>
        </FormSection>

        {/* Erro global */}
        {erroGlobal && (
          <div style={S.erroGlobal}>
            <AlertIcon cor="#DC2626" /> {erroGlobal}
          </div>
        )}

        {/* Botão */}
        <button onClick={handleSubmit} disabled={salvando}
          style={{ ...S.btnSubmit, opacity: salvando ? 0.7 : 1 }}>
          {salvando ? <><Spinner /> Abrindo OS...</> : <><OSIcon /> Abrir Ordem de Serviço</>}
        </button>

        <p style={S.aviso}>
          O timer inicia ao salvar · O histórico e as notificações são registrados automaticamente.
        </p>
      </main>
    </div>
  );
}

// ─── Componentes auxiliares ───────────────────────────────────

function FormSection({ title, icon, children }) {
  return (
    <section style={S.section}>
      <div style={S.sectionHeader}>
        {icon}
        <h2 style={S.sectionTitle}>{title}</h2>
      </div>
      <div style={S.sectionBody}>{children}</div>
    </section>
  );
}

function FormField({ label, error, children }) {
  return (
    <div style={S.formField}>
      <label style={S.label}>{label}</label>
      {children}
      {error && <span style={S.fieldError}>{error}</span>}
    </div>
  );
}

function TelaCarregando() {
  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans',sans-serif" }}>
      <style>{`@keyframes shimmer { 0% { background-position:-400px 0; } 100% { background-position:400px 0; } }`}</style>
      <div style={{ height: '56px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8EDF2' }} />
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[70, 50, 85, 60].map((w, i) => (
          <div key={i} style={{ height: '14px', width: `${w}%`, borderRadius: '7px', background: 'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize: '400px', animation: 'shimmer 1.4s infinite linear' }} />
        ))}
      </div>
    </div>
  );
}

// ─── Ícones ───────────────────────────────────────────────────
function BackIcon()    { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function GearIcon()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="#20643F" strokeWidth="1.8"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#20643F" strokeWidth="1.8"/></svg>; }
function UserIcon()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="#20643F" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="7" r="4" stroke="#20643F" strokeWidth="2"/></svg>; }
function AlertIcon({ cor = '#20643F' }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={cor} strokeWidth="2" strokeLinecap="round"/><path d="M12 9v4M12 17h.01" stroke={cor} strokeWidth="2" strokeLinecap="round"/></svg>; }
function OSIcon()      { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: 7 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M14 2v6h6M12 18v-6M9 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function OfflineIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.8M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function QRSmIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><path d="M14 14h3v3M17 20h3M20 17v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function Spinner()     { return <span style={{ display: 'inline-block', width: '15px', height: '15px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFF', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: 8 }} />; }

// ─── CSS e Estilos ────────────────────────────────────────────
const CSS = `
  @keyframes spin { to { transform: rotate(360deg); } }
  textarea { resize: vertical; }
  select:focus, input:focus, textarea:focus { outline: none; border-color: #20643F !important; box-shadow: 0 0 0 3px rgba(32,100,63,0.1) !important; }
`;
const S = {
  page:         { minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  topbar:       { position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', height: '56px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8EDF2' },
  backBtn:      { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: 'none', background: 'none', cursor: 'pointer', color: '#0D1B2A', borderRadius: '8px', flexShrink: 0 },
  topbarTitle:  { margin: 0, fontSize: '17px', fontWeight: '700', color: '#0D1B2A', letterSpacing: '-0.2px' },
  bannerOffline:{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '12px', fontWeight: '500', borderBottom: '1px solid rgba(245,158,11,0.3)' },
  bannerQR:     { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: 'rgba(32,100,63,0.07)', color: '#20643F', fontSize: '12px', fontWeight: '500', borderBottom: '1px solid rgba(32,100,63,0.2)' },
  main:         { padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '640px', margin: '0 auto', boxSizing: 'border-box' },
  section:      { backgroundColor: '#FFFFFF', borderRadius: '14px', overflow: 'hidden', border: '1px solid #E8EDF2' },
  sectionHeader:{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 18px', borderBottom: '1px solid #F1F5F9' },
  sectionTitle: { margin: 0, fontSize: '14px', fontWeight: '700', color: '#0D1B2A' },
  sectionBody:  { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' },
  formField:    { display: 'flex', flexDirection: 'column', gap: '6px' },
  label:        { fontSize: '12px', fontWeight: '700', color: '#374151', letterSpacing: '0.2px', textTransform: 'uppercase' },
  input:        { padding: '12px 14px', fontSize: '14px', border: '1.5px solid #E2E8F0', borderRadius: '9px', backgroundColor: '#FAFBFC', color: '#0D1B2A', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' },
  select:       { padding: '12px 14px', fontSize: '14px', border: '1.5px solid #E2E8F0', borderRadius: '9px', backgroundColor: '#FAFBFC', color: '#0D1B2A', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%', cursor: 'pointer' },
  textarea:     { padding: '12px 14px', fontSize: '14px', border: '1.5px solid #E2E8F0', borderRadius: '9px', backgroundColor: '#FAFBFC', color: '#0D1B2A', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%', lineHeight: 1.55 },
  inputError:   { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  fieldError:   { fontSize: '12px', color: '#EF4444', fontWeight: '500' },
  charCount:    { fontSize: '11px', color: '#94A3B8', textAlign: 'right', marginTop: '-8px' },
  erroGlobal:   { display: 'flex', alignItems: 'center', gap: '8px', padding: '13px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '9px', fontSize: '13px', color: '#DC2626' },
  btnSubmit:    { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '15px', width: '100%', backgroundColor: '#20643F', color: '#FFFFFF', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' },
  aviso:        { margin: 0, textAlign: 'center', fontSize: '12px', color: '#94A3B8', paddingBottom: '16px' },
};
