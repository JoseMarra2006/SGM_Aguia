// src/pages/Equipamentos/Detalhes.jsx

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import useAuthStore from '../../store/authStore';

export default function Detalhes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuthStore();

  const [equipamento, setEquipamento] = useState(null);
  const [pecas, setPecas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  // Controle da galeria
  const [imagemAtiva, setImagemAtiva] = useState(0);
  const [lightboxAberto, setLightboxAberto] = useState(false);

  // Controle do leitor de PDF
  const [pdfAberto, setPdfAberto] = useState(false);

  // ─── Busca dados ─────────────────────────────────────────────
  useEffect(() => {
    async function fetchDados() {
      setLoading(true);
      setErro(null);
      try {
        const [{ data: eq, error: errEq }, { data: ps, error: errPs }] = await Promise.all([
          supabase
            .from('equipamentos')
            .select('id, nome, descricao, status, manual_url, imagens_urls')
            .eq('id', id)
            .single(),
          supabase
            .from('pecas_equipamento')
            .select('id, nome')
            .eq('equipamento_id', id)
            .order('nome'),
        ]);

        if (errEq) throw errEq;
        setEquipamento(eq);
        setPecas(ps ?? []);
      } catch (err) {
        setErro('Equipamento não encontrado ou erro ao carregar dados.');
        console.error('[Detalhes] Erro:', err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchDados();
  }, [id]);

  if (loading) return <DetalhesLoading />;
  if (erro || !equipamento) return <ErroDetalhes message={erro} onBack={() => navigate('/equipamentos')} />;

  const imagens = equipamento.imagens_urls ?? [];
  const isManutencao = equipamento.status === 'em_manutencao';

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {/* ── Topbar ── */}
      <header style={S.topbar}>
        <button onClick={() => navigate('/equipamentos')} style={S.backBtn} aria-label="Voltar">
          <BackIcon />
        </button>
        <span style={S.topbarTitle} title={equipamento.nome}>{equipamento.nome}</span>
        {isSuperAdmin && (
          <button
            onClick={() => navigate(`/equipamentos/novo?editar=${id}`)}
            style={S.editBtn}
          >
            <EditIcon />
          </button>
        )}
      </header>

      <main style={S.main}>
        {/* ── Galeria de imagens ── */}
        {imagens.length > 0 ? (
          <section style={S.galeriaSection}>
            {/* Imagem principal */}
            <div
              style={S.imagemPrincipalWrapper}
              onClick={() => setLightboxAberto(true)}
              role="button"
              aria-label="Ampliar imagem"
            >
              <img
                src={imagens[imagemAtiva]}
                alt={`${equipamento.nome} - imagem ${imagemAtiva + 1}`}
                style={S.imagemPrincipal}
              />
              <div style={S.ampliarHint}>
                <ZoomIcon />
                <span>Toque para ampliar</span>
              </div>
              <span style={{ ...S.statusBadge, ...(isManutencao ? S.badgeManutencao : S.badgeOperacao) }}>
                <span style={S.statusDot} />
                {isManutencao ? 'Em manutenção' : 'Em operação'}
              </span>
            </div>

            {/* Miniaturas */}
            {imagens.length > 1 && (
              <div style={S.thumbnailRow}>
                {imagens.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setImagemAtiva(i)}
                    style={{
                      ...S.thumbnail,
                      ...(i === imagemAtiva ? S.thumbnailActive : {}),
                    }}
                    aria-label={`Imagem ${i + 1}`}
                  >
                    <img src={url} alt="" style={S.thumbnailImg} />
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <div style={S.semImagem}>
            <GearIcon />
            <span style={{ color: '#94A3B8', fontSize: '13px' }}>Sem imagens cadastradas</span>
          </div>
        )}

        {/* ── Informações do equipamento ── */}
        <section style={S.card}>
          <h2 style={S.nomeEquipamento}>{equipamento.nome}</h2>
          {equipamento.descricao && (
            <p style={S.descricao}>{equipamento.descricao}</p>
          )}
        </section>

        {/* ── Manual PDF ── */}
        {equipamento.manual_url && (
          <section style={S.card}>
            <div style={S.sectionHeader}>
              <PdfIcon />
              <h3 style={S.sectionTitle}>Manual do Equipamento</h3>
            </div>

            {!pdfAberto ? (
              <button onClick={() => setPdfAberto(true)} style={S.btnAbrirPdf}>
                <PdfIcon color="#FFFFFF" />
                Abrir manual em PDF
              </button>
            ) : (
              <div style={S.pdfWrapper}>
                <div style={S.pdfTopbar}>
                  <span style={S.pdfLabel}>Manual.pdf</span>
                  <div style={S.pdfActions}>
                    {/* Correção 1: Tag <a> aberta corretamente */}
                    <a
                      href={equipamento.manual_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={S.pdfExternalLink}
                    >
                      <ExternalIcon /> Abrir em nova aba
                    </a>
                    <button onClick={() => setPdfAberto(false)} style={S.pdfCloseBtn}>
                      <CloseIcon />
                    </button>
                  </div>
                </div>
                <embed
                  src={`${equipamento.manual_url}#toolbar=0&navpanes=0&scrollbar=1`}
                  type="application/pdf"
                  style={S.pdfEmbed}
                  title={`Manual de ${equipamento.nome}`}
                />
                <p style={S.pdfFallback}>
                  Se o PDF não carregar,{' '}
                  {/* Correção 2: Tag <a> aberta corretamente */}
                  <a
                    href={equipamento.manual_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#0F4C81', fontWeight: '600' }}
                  >
                    clique aqui para abrir em nova aba
                  </a>.
                </p>
              </div>
            )}
        </section>
        )}

        {/* ── Peças do equipamento ── */}
        <section style={S.card}>
          <div style={S.sectionHeader}>
            <WrenchIcon />
            <h3 style={S.sectionTitle}>Peças do equipamento</h3>
            <span style={S.countBadge}>{pecas.length}</span>
          </div>

          {pecas.length === 0 ? (
            <p style={S.emptyPecas}>Nenhuma peça cadastrada para este equipamento.</p>
          ) : (
            <ul style={S.pecasList}>
              {pecas.map((peca, i) => (
                <li key={peca.id} style={{ ...S.pecaItem, ...(i < pecas.length - 1 ? S.pecaItemBorder : {}) }}>
                  <span style={S.pecaIndex}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={S.pecaNome}>{peca.nome}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* ── Lightbox de imagem ampliada ── */}
      {lightboxAberto && (
        <div
          style={S.lightboxOverlay}
          onClick={() => setLightboxAberto(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Imagem ampliada"
        >
          <button
            style={S.lightboxClose}
            onClick={() => setLightboxAberto(false)}
            aria-label="Fechar"
          >
            <CloseIcon />
          </button>
          <img
            src={imagens[imagemAtiva]}
            alt={equipamento.nome}
            style={S.lightboxImg}
            onClick={(e) => e.stopPropagation()}
          />
          {imagens.length > 1 && (
            <div style={S.lightboxCounter}>
              {imagemAtiva + 1} / {imagens.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Estados auxiliares ───────────────────────────────────────

function DetalhesLoading() {
  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ height: '56px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8EDF2' }} />
      <div style={{ height: '260px', background: 'linear-gradient(90deg, #F0F4F8 25%, #E8EDF2 50%, #F0F4F8 75%)', backgroundSize: '400px', animation: 'shimmer 1.4s infinite linear' }} />
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {[90, 60, 80].map((w, i) => (
          <div key={i} style={{ height: '16px', width: `${w}%`, borderRadius: '8px', background: 'linear-gradient(90deg, #F0F4F8 25%, #E8EDF2 50%, #F0F4F8 75%)', backgroundSize: '400px', animation: 'shimmer 1.4s infinite linear' }} />
        ))}
      </div>
    </div>
  );
}

function ErroDetalhes({ message, onBack }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', fontFamily: "'DM Sans', sans-serif", padding: '24px', textAlign: 'center' }}>
      <span style={{ fontSize: '48px' }}>⚠️</span>
      <p style={{ color: '#64748B', fontSize: '15px', margin: 0 }}>{message}</p>
      <button onClick={onBack} style={{ padding: '12px 24px', backgroundColor: '#0F4C81', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
        Voltar para a lista
      </button>
    </div>
  );
}

// ─── Ícones ───────────────────────────────────────────────────
function BackIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function EditIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function ZoomIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function PdfIcon({ color = '#EF4444' }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={color} strokeWidth="2" strokeLinecap="round"/><path d="M14 2v6h6M9 13h6M9 17h4" stroke={color} strokeWidth="2" strokeLinecap="round"/></svg>;
}
function WrenchIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="#0F4C81" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function CloseIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function ExternalIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ marginRight: 4 }}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14 21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function GearIcon() {
  return <svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="#CBD5E1" strokeWidth="1.5"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#CBD5E1" strokeWidth="1.5"/></svg>;
}

// ─── CSS e Estilos ────────────────────────────────────────────
const CSS = `
  @keyframes shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
  @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
`;

const S = {
  page: { minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans', 'Segoe UI', sans-serif" },
  topbar: {
    position: 'sticky', top: 0, zIndex: 20,
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '0 16px', height: '56px',
    backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8EDF2',
  },
  backBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: 'none', background: 'none', cursor: 'pointer', color: '#0D1B2A', borderRadius: '8px', flexShrink: 0 },
  topbarTitle: { flex: 1, fontSize: '16px', fontWeight: '700', color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.2px' },
  editBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: '1.5px solid #E2E8F0', background: '#FFFFFF', cursor: 'pointer', color: '#0F4C81', borderRadius: '8px', flexShrink: 0 },
  main: { padding: '0 0 40px 0', display: 'flex', flexDirection: 'column', gap: '0' },
  galeriaSection: { backgroundColor: '#FFFFFF', marginBottom: '12px' },
  imagemPrincipalWrapper: { position: 'relative', height: '260px', overflow: 'hidden', cursor: 'zoom-in' },
  imagemPrincipal: { width: '100%', height: '100%', objectFit: 'cover' },
  ampliarHint: {
    position: 'absolute', bottom: '12px', right: '12px',
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '5px 10px', borderRadius: '20px',
    backgroundColor: 'rgba(0,0,0,0.5)', color: '#FFFFFF',
    fontSize: '11px', fontWeight: '500',
  },
  statusBadge: {
    position: 'absolute', top: '14px', left: '14px',
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '5px 12px', borderRadius: '20px',
    fontSize: '12px', fontWeight: '600', backdropFilter: 'blur(8px)',
  },
  badgeOperacao: { backgroundColor: 'rgba(16,185,129,0.15)', color: '#065F46', border: '1px solid rgba(16,185,129,0.3)' },
  badgeManutencao: { backgroundColor: 'rgba(245,158,11,0.2)', color: '#92400E', border: '1px solid rgba(245,158,11,0.35)' },
  statusDot: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'currentColor', display: 'inline-block' },
  thumbnailRow: { display: 'flex', gap: '8px', padding: '12px 16px', overflowX: 'auto', scrollbarWidth: 'none' },
  thumbnail: { width: '60px', height: '60px', flexShrink: 0, border: '2px solid transparent', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', padding: 0, backgroundColor: 'transparent' },
  thumbnailActive: { borderColor: '#0F4C81' },
  thumbnailImg: { width: '100%', height: '100%', objectFit: 'cover' },
  semImagem: { height: '180px', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '12px' },
  card: { backgroundColor: '#FFFFFF', margin: '0 0 8px 0', padding: '20px' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' },
  sectionTitle: { margin: 0, fontSize: '15px', fontWeight: '700', color: '#0D1B2A', letterSpacing: '-0.1px' },
  countBadge: { marginLeft: 'auto', padding: '2px 8px', backgroundColor: '#EEF2FF', color: '#3B5BDB', borderRadius: '20px', fontSize: '11px', fontWeight: '700' },
  nomeEquipamento: { margin: '0 0 10px 0', fontSize: '22px', fontWeight: '800', color: '#0D1B2A', letterSpacing: '-0.4px' },
  descricao: { margin: 0, fontSize: '14px', color: '#64748B', lineHeight: 1.65 },
  btnAbrirPdf: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '13px 20px', width: '100%', justifyContent: 'center',
    backgroundColor: '#0D1B2A', color: '#FFFFFF',
    border: 'none', borderRadius: '10px',
    fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit',
  },
  pdfWrapper: { borderRadius: '10px', overflow: 'hidden', border: '1.5px solid #E2E8F0' },
  pdfTopbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', backgroundColor: '#1C2B3A',
  },
  pdfLabel: { fontSize: '13px', color: '#94A3B8', fontWeight: '500' },
  pdfActions: { display: 'flex', alignItems: 'center', gap: '12px' },
  pdfExternalLink: {
    display: 'flex', alignItems: 'center', fontSize: '12px',
    color: '#60A5FA', fontWeight: '600', textDecoration: 'none',
  },
  pdfCloseBtn: { display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '2px' },
  pdfEmbed: { width: '100%', height: '520px', display: 'block', border: 'none', backgroundColor: '#F4F7FA' },
  pdfFallback: { margin: 0, padding: '10px 14px', fontSize: '12px', color: '#94A3B8', backgroundColor: '#F8FAFC', textAlign: 'center' },
  pecasList: { margin: 0, padding: 0, listStyle: 'none' },
  pecaItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0' },
  pecaItemBorder: { borderBottom: '1px solid #F1F5F9' },
  pecaIndex: { fontSize: '11px', fontWeight: '700', color: '#94A3B8', fontVariantNumeric: 'tabular-nums', minWidth: '22px' },
  pecaNome: { fontSize: '14px', color: '#0D1B2A', fontWeight: '500' },
  emptyPecas: { margin: 0, fontSize: '13px', color: '#94A3B8', fontStyle: 'italic' },
  // Lightbox
  lightboxOverlay: {
    position: 'fixed', inset: 0, zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.92)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    animation: 'fadeIn 0.2s ease',
  },
  lightboxClose: {
    position: 'absolute', top: '16px', right: '16px',
    background: 'rgba(255,255,255,0.15)', border: 'none',
    borderRadius: '50%', width: '40px', height: '40px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: '#FFFFFF', zIndex: 101,
  },
  lightboxImg: { maxWidth: '96vw', maxHeight: '90dvh', objectFit: 'contain', borderRadius: '8px' },
  lightboxCounter: {
    position: 'absolute', bottom: '20px',
    padding: '5px 14px', backgroundColor: 'rgba(0,0,0,0.5)',
    color: '#FFFFFF', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
  },
};