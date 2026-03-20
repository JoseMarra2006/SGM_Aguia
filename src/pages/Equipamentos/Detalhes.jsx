// src/pages/Equipamentos/Detalhes.jsx
// ALTERAÇÕES v2:
//   • Visualizador de manual: modal com <iframe> e buildIframeSrc()
// ADIÇÕES v3 (QR / Atalhos operacionais):
//   • Botão QR Code na topbar → ModalQRCode com impressão de etiqueta
//   • Seção "Ações rápidas" no final da página:
//       – "Abrir O.S. Corretiva" → /corretivas/nova?equipamento_id=[ID]
//       – Admin: "Agendar Preventiva" → /preventivas?agendar=true&equipamento_id=[ID]
//       – Mecânico: "Iniciar Preventiva de Hoje" (condicional — só se houver
//         agendamento pendente/em_andamento para hoje neste equipamento)
//   • Deep link nativo: QR Code encoda window.location.origin + /equipamentos/[ID]
// INALTERADO: galeria, lightbox, peças, manual, autenticação, cores.

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import useAuthStore from '../../store/authStore';

// ─── Helper: monta a URL de incorporação do iframe ────────────
function buildIframeSrc(rawUrl) {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl.trim());
    const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    if ((url.hostname === 'drive.google.com') && fileMatch) {
      return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
    }
    const idParam = url.searchParams.get('id');
    if (url.hostname === 'drive.google.com' && idParam) {
      return `https://drive.google.com/file/d/${idParam}/preview`;
    }
    if (url.hostname === 'docs.google.com') {
      return rawUrl.replace(/\/edit(\?.*)?$/, '/preview');
    }
    return `https://docs.google.com/viewer?url=${encodeURIComponent(rawUrl.trim())}&embedded=true`;
  } catch {
    return '';
  }
}

// ─── Modal de Visualização do Manual ─────────────────────────
function ModalManual({ manualUrl, onClose }) {
  const iframeSrc = buildIframeSrc(manualUrl);
  return (
    <div style={M.overlay} onClick={onClose}>
      <div style={M.box} onClick={(e) => e.stopPropagation()}>
        <div style={M.header}>
          <div style={M.headerLeft}>
            <PdfIcon color="#20643F" size={18} />
            <span style={M.titulo}>Manual do Equipamento</span>
          </div>
          <div style={M.headerAcoes}>
            <a href={manualUrl} target="_blank" rel="noopener noreferrer" style={M.linkExterno} title="Abrir em nova aba">
              <ExternalIcon />
              <span>Abrir em nova aba</span>
            </a>
            <button onClick={onClose} style={M.btnFechar} aria-label="Fechar"><CloseIcon /></button>
          </div>
        </div>
        <div style={M.corpo}>
          {iframeSrc ? (
            <iframe src={iframeSrc} style={M.iframe} title="Manual do Equipamento"
              allow="autoplay" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
          ) : (
            <div style={M.semSrc}>
              <span style={{ fontSize: '36px' }}>⚠️</span>
              <p style={{ margin: 0, fontSize: '14px', color: '#64748B' }}>Não foi possível gerar o link de visualização.</p>
              <a href={manualUrl} target="_blank" rel="noopener noreferrer"
                style={{ color: '#20643F', fontWeight: '600', fontSize: '13px' }}>
                Clique aqui para abrir diretamente
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal de QR Code ─────────────────────────────────────────
function ModalQRCode({ equipamento, onClose }) {
  const url = `${window.location.origin}/equipamentos/${equipamento.id}`;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}&margin=8&color=0D1B2A&bgcolor=FFFFFF`;

  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=440,height=580');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <title>${equipamento.nome}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{font-family:Arial,sans-serif;display:flex;flex-direction:column;align-items:center;
          justify-content:center;min-height:100vh;padding:20px;background:#fff;}
        .nome{font-size:18px;font-weight:700;color:#0D1B2A;margin-bottom:14px;text-align:center;
          max-width:280px;word-break:break-word;}
        .qr-frame{border:2.5px solid #0D1B2A;border-radius:10px;padding:8px;display:inline-flex;}
        .qr-frame img{display:block;border-radius:4px;}
        .url{margin-top:10px;font-size:9px;color:#888;word-break:break-all;
          text-align:center;max-width:280px;line-height:1.4;}
        @media print{@page{size:90mm 110mm;margin:6mm;}}
      </style>
    </head><body>
      <p class="nome">${equipamento.nome}</p>
      <div class="qr-frame">
        <img src="${qrApiUrl}" width="260" height="260" />
      </div>
      <p class="url">${url}</p>
      <script>
        var img=document.querySelector('img');
        function doPrint(){setTimeout(function(){window.print();window.close();},300);}
        img.onload=doPrint; img.onerror=doPrint;
      </script>
    </body></html>`);
    w.document.close();
  };

  return (
    <div style={QRS.overlay} onClick={onClose}>
      <div style={QRS.box} onClick={e => e.stopPropagation()}>
        <div style={QRS.header}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <QRCodeIcon />
            <span style={QRS.titulo}>QR Code — {equipamento.nome}</span>
          </div>
          <button onClick={onClose} style={QRS.btnFechar}><CloseIcon /></button>
        </div>
        <div style={QRS.corpo}>
          <div style={QRS.qrFrame}>
            <img
              src={qrApiUrl}
              alt={`QR Code — ${equipamento.nome}`}
              width={220} height={220}
              style={{ display: 'block', borderRadius: '6px' }}
            />
          </div>
          <p style={QRS.hint}>
            Aponte a câmera do celular para abrir a página deste equipamento diretamente.
          </p>
          <p style={QRS.urlTexto}>{url}</p>
        </div>
        <div style={QRS.footer}>
          <button onClick={onClose} style={QRS.btnCancelar}>Fechar</button>
          <button onClick={handlePrint} style={QRS.btnPrint}>
            <PrintIcon /> Imprimir etiqueta
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tela principal ───────────────────────────────────────────
export default function Detalhes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isSuperAdmin, profile } = useAuthStore();

  const [equipamento,       setEquipamento]       = useState(null);
  const [pecas,             setPecas]             = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [erro,              setErro]              = useState(null);
  const [imagemAtiva,       setImagemAtiva]       = useState(0);
  const [lightboxAberto,    setLightboxAberto]    = useState(false);
  const [modalManualAberto, setModalManualAberto] = useState(false);

  // ── Novo: QR Code e atalho de preventiva ─────────────────────
  const [qrModalOpen,    setQrModalOpen]    = useState(false);
  const [agendamentoHoje, setAgendamentoHoje] = useState(null); // para mecânicos

  // ─── Busca dados do equipamento ───────────────────────────────
  useEffect(() => {
    async function fetchDados() {
      setLoading(true); setErro(null);
      try {
        const [{ data: eq, error: errEq }, { data: ps }] = await Promise.all([
          supabase.from('equipamentos')
            .select('id, nome, descricao, status, manual_url, imagens_urls')
            .eq('id', id).single(),
          supabase.from('pecas_equipamento')
            .select('id, nome').eq('equipamento_id', id).order('nome'),
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

  // ─── Verifica agendamento de hoje (apenas para mecânicos) ─────
  // Exibe o botão "Iniciar Preventiva de Hoje" condicionalmente.
  useEffect(() => {
    if (!id || !profile?.id || isSuperAdmin) return;
    const hoje = new Date().toISOString().split('T')[0];
    supabase
      .from('agendamentos_preventivos')
      .select('id, status')
      .eq('equipamento_id', id)
      .eq('mecanico_id', profile.id)
      .eq('data_agendada', hoje)
      .in('status', ['pendente', 'em_andamento'])
      .maybeSingle()
      .then(({ data }) => setAgendamentoHoje(data ?? null));
  }, [id, profile?.id, isSuperAdmin]);

  if (loading) return <DetalhesLoading />;
  if (erro || !equipamento) return <ErroDetalhes message={erro} onBack={() => navigate('/equipamentos')} />;

  const imagens      = equipamento.imagens_urls ?? [];
  const isManutencao = equipamento.status === 'em_manutencao';
  const temManual    = !!equipamento.manual_url;

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {/* ── Topbar ── */}
      <header style={S.topbar}>
        <button onClick={() => navigate('/equipamentos')} style={S.backBtn} aria-label="Voltar">
          <BackIcon />
        </button>
        <span style={S.topbarTitle} title={equipamento.nome}>{equipamento.nome}</span>
        {/* Botão QR Code — visível para todos */}
        <button onClick={() => setQrModalOpen(true)} style={S.qrBtn} title="Ver QR Code" aria-label="QR Code">
          <QRCodeIcon />
        </button>
        {isSuperAdmin && (
          <button onClick={() => navigate(`/equipamentos/novo?editar=${id}`)} style={S.editBtn}>
            <EditIcon />
          </button>
        )}
      </header>

      <main style={S.main}>

        {/* ── Galeria de imagens ── */}
        {imagens.length > 0 ? (
          <section style={S.galeriaSection}>
            <div style={S.imagemPrincipalWrapper} onClick={() => setLightboxAberto(true)}
              role="button" aria-label="Ampliar imagem">
              <img src={imagens[imagemAtiva]} alt={`${equipamento.nome} - imagem ${imagemAtiva + 1}`}
                style={S.imagemPrincipal} />
              <div style={S.ampliarHint}><ZoomIcon /><span>Toque para ampliar</span></div>
              <span style={{ ...S.statusBadge, ...(isManutencao ? S.badgeManutencao : S.badgeOperacao) }}>
                <span style={S.statusDot} />
                {isManutencao ? 'Em manutenção' : 'Em operação'}
              </span>
            </div>
            {imagens.length > 1 && (
              <div style={S.thumbnailRow}>
                {imagens.map((url, i) => (
                  <button key={i} onClick={() => setImagemAtiva(i)}
                    style={{ ...S.thumbnail, ...(i === imagemAtiva ? S.thumbnailActive : {}) }}
                    aria-label={`Imagem ${i + 1}`}>
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

        {/* ── Informações ── */}
        <section style={S.card}>
          <h2 style={S.nomeEquipamento}>{equipamento.nome}</h2>
          {equipamento.descricao && <p style={S.descricao}>{equipamento.descricao}</p>}
        </section>

        {/* ── Manual ── */}
        {temManual && (
          <section style={S.card}>
            <div style={S.sectionHeader}>
              <PdfIcon color="#20643F" size={18} />
              <h3 style={S.sectionTitle}>Manual do Equipamento</h3>
            </div>
            <button onClick={() => setModalManualAberto(true)} style={S.btnAbrirManual}>
              <PdfIcon color="#FFFFFF" size={16} />
              Visualizar manual
            </button>
            <p style={S.manualHint}>
              O manual abrirá em uma janela de visualização. Se tiver dificuldade,{' '}
              <a href={equipamento.manual_url} target="_blank" rel="noopener noreferrer"
                style={{ color: '#20643F', fontWeight: '600' }}>acesse diretamente aqui</a>.
            </p>
          </section>
        )}

        {/* ── Peças ── */}
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
                <li key={peca.id}
                  style={{ ...S.pecaItem, ...(i < pecas.length - 1 ? S.pecaItemBorder : {}) }}>
                  <span style={S.pecaIndex}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={S.pecaNome}>{peca.nome}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Ações Rápidas ── */}
        <section style={S.card}>
          <div style={S.sectionHeader}>
            <BoltIcon />
            <h3 style={S.sectionTitle}>Ações rápidas</h3>
          </div>
          <div style={AR.btnGroup}>

            {/* Abrir O.S. Corretiva — disponível para todos */}
            <button
              onClick={() => navigate(`/corretivas/nova?equipamento_id=${equipamento.id}`)}
              style={AR.btnOS}
            >
              <WrenchActionIcon />
              <div style={AR.btnTextos}>
                <span style={AR.btnLabel}>Abrir O.S. Corretiva</span>
                <span style={AR.btnSub}>Registrar defeito neste equipamento</span>
              </div>
              <ChevronRightIcon cor="#20643F" />
            </button>

            {/* Admin: Agendar Preventiva */}
            {isSuperAdmin && (
              <button
                onClick={() => navigate(`/preventivas?agendar=true&equipamento_id=${equipamento.id}`)}
                style={AR.btnPrev}
              >
                <CalendarActionIcon />
                <div style={AR.btnTextos}>
                  <span style={AR.btnLabel}>Agendar Preventiva</span>
                  <span style={AR.btnSub}>Criar agendamento para este equipamento</span>
                </div>
                <ChevronRightIcon cor="#0F4C81" />
              </button>
            )}

            {/* Mecânico: Iniciar Preventiva de Hoje (condicional) */}
            {!isSuperAdmin && agendamentoHoje && (
              <button
                onClick={() => navigate(`/preventivas/${agendamentoHoje.id}/checklist`)}
                style={AR.btnIniciar}
              >
                <PlayIcon />
                <div style={AR.btnTextos}>
                  <span style={{ ...AR.btnLabel, color: '#FFFFFF' }}>Iniciar Preventiva de Hoje</span>
                  <span style={{ ...AR.btnSub, color: 'rgba(255,255,255,0.75)' }}>
                    {agendamentoHoje.status === 'em_andamento' ? 'Continuar checklist em andamento' : 'Checklist agendado para hoje'}
                  </span>
                </div>
                <ChevronRightIcon cor="rgba(255,255,255,0.8)" />
              </button>
            )}

            {/* Mecânico sem agendamento hoje: info sutil */}
            {!isSuperAdmin && !agendamentoHoje && (
              <div style={AR.semAgendamento}>
                <span style={{ fontSize: '14px' }}>📋</span>
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                  Nenhuma preventiva agendada para você hoje neste equipamento.
                </span>
              </div>
            )}

          </div>
        </section>

      </main>

      {/* ── Modal QR Code ── */}
      {qrModalOpen && (
        <ModalQRCode equipamento={equipamento} onClose={() => setQrModalOpen(false)} />
      )}

      {/* ── Modal de visualização do manual ── */}
      {modalManualAberto && (
        <ModalManual manualUrl={equipamento.manual_url} onClose={() => setModalManualAberto(false)} />
      )}

      {/* ── Lightbox de imagem ampliada ── */}
      {lightboxAberto && (
        <div style={S.lightboxOverlay} onClick={() => setLightboxAberto(false)}
          role="dialog" aria-modal="true" aria-label="Imagem ampliada">
          <button style={S.lightboxClose} onClick={() => setLightboxAberto(false)} aria-label="Fechar">
            <CloseIcon />
          </button>
          <img src={imagens[imagemAtiva]} alt={equipamento.nome} style={S.lightboxImg}
            onClick={(e) => e.stopPropagation()} />
          {imagens.length > 1 && (
            <div style={S.lightboxCounter}>{imagemAtiva + 1} / {imagens.length}</div>
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
      <div style={{ height: '260px', background: 'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize: '400px', animation: 'shimmer 1.4s infinite linear' }} />
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {[90, 60, 80].map((w, i) => (
          <div key={i} style={{ height: '16px', width: `${w}%`, borderRadius: '8px', background: 'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)', backgroundSize: '400px', animation: 'shimmer 1.4s infinite linear' }} />
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
function BackIcon()     { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function EditIcon()     { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function ZoomIcon()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function PdfIcon({ color = '#EF4444', size = 18 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={color} strokeWidth="2" strokeLinecap="round"/><path d="M14 2v6h6M9 13h6M9 17h4" stroke={color} strokeWidth="2" strokeLinecap="round"/></svg>; }
function WrenchIcon()   { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="#0F4C81" strokeWidth="2" strokeLinecap="round"/></svg>; }
function CloseIcon()    { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function ExternalIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14 21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function GearIcon()     { return <svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="#CBD5E1" strokeWidth="1.5"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#CBD5E1" strokeWidth="1.5"/></svg>; }

// ── Novos ícones para QR / Ações ─────────────────────────────
function QRCodeIcon()   { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ display:'block', flexShrink:0 }}><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#0D1B2A" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#0D1B2A" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#0D1B2A" strokeWidth="2"/><path d="M14 14h3v3M17 21h3M21 17v3" stroke="#0D1B2A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function PrintIcon()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M6 14h12v8H6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function BoltIcon()     { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#20643F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function WrenchActionIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="#20643F" strokeWidth="2" strokeLinecap="round"/></svg>; }
function CalendarActionIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><rect x="3" y="4" width="18" height="18" rx="2" stroke="#0F4C81" strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" stroke="#0F4C81" strokeWidth="2" strokeLinecap="round"/></svg>; }
function PlayIcon()     { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><polygon points="5 3 19 12 5 21 5 3" fill="rgba(255,255,255,0.9)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function ChevronRightIcon({ cor = '#64748B' }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}><path d="M9 18l6-6-6-6" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }

// ─── Estilos do Modal de Manual ───────────────────────────────
const M = {
  overlay:    { position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', animation: 'fadeIn 0.2s ease' },
  box:        { backgroundColor: '#FFFFFF', borderRadius: '14px', width: '100%', maxWidth: '860px', height: 'min(90dvh, 720px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', animation: 'scaleIn 0.22s ease both' },
  header:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #E8EDF2', flexShrink: 0, gap: '12px' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' },
  titulo:     { fontSize: '15px', fontWeight: '700', color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  headerAcoes:{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 },
  linkExterno:{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', backgroundColor: 'rgba(32,100,63,0.07)', border: '1px solid rgba(32,100,63,0.2)', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: '#20643F', textDecoration: 'none', flexShrink: 0 },
  btnFechar:  { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: '1.5px solid #E2E8F0', borderRadius: '8px', background: '#F8FAFC', cursor: 'pointer', color: '#64748B', flexShrink: 0 },
  corpo:      { flex: 1, overflow: 'hidden', backgroundColor: '#F4F7FA' },
  iframe:     { width: '100%', height: '100%', border: 'none', display: 'block', backgroundColor: '#F4F7FA' },
  semSrc:     { height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '24px', textAlign: 'center' },
};

// ─── Estilos do Modal de QR Code ──────────────────────────────
const QRS = {
  overlay:   { position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', animation: 'fadeIn 0.2s ease' },
  box:       { backgroundColor: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', animation: 'scaleIn 0.22s ease both' },
  header:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid #F1F5F9', gap: '8px' },
  titulo:    { fontSize: '14px', fontWeight: '700', color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  btnFechar: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', border: '1px solid #E2E8F0', borderRadius: '7px', background: '#F8FAFC', cursor: 'pointer', color: '#64748B', flexShrink: 0 },
  corpo:     { padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' },
  qrFrame:   { padding: '10px', backgroundColor: '#FFFFFF', border: '2.5px solid #0D1B2A', borderRadius: '12px', display: 'inline-flex' },
  hint:      { margin: 0, fontSize: '12px', color: '#64748B', textAlign: 'center', lineHeight: 1.55 },
  urlTexto:  { margin: 0, fontSize: '9.5px', color: '#94A3B8', wordBreak: 'break-all', textAlign: 'center', maxWidth: '280px' },
  footer:    { padding: '14px 18px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '8px' },
  btnCancelar:{ flex: 1, padding: '11px', backgroundColor: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
  btnPrint:  { flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '11px', backgroundColor: '#0D1B2A', color: '#FFFFFF', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' },
};

// ─── Estilos das Ações Rápidas ────────────────────────────────
const AR = {
  btnGroup:       { display: 'flex', flexDirection: 'column', gap: '8px' },
  btnOS:          { display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 14px', backgroundColor: 'rgba(32,100,63,0.06)', border: '1.5px solid rgba(32,100,63,0.2)', borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },
  btnPrev:        { display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 14px', backgroundColor: 'rgba(15,76,129,0.06)', border: '1.5px solid rgba(15,76,129,0.2)', borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },
  btnIniciar:     { display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 14px', backgroundColor: '#20643F', border: '1.5px solid #20643F', borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },
  btnTextos:      { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  btnLabel:       { fontSize: '14px', fontWeight: '700', color: '#0D1B2A', letterSpacing: '-0.1px' },
  btnSub:         { fontSize: '11px', color: '#64748B', fontWeight: '400' },
  semAgendamento: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', backgroundColor: '#F8FAFC', border: '1px solid #E8EDF2', borderRadius: '10px' },
};

// ─── CSS e Estilos principais ─────────────────────────────────
const CSS = `
  @keyframes shimmer  { 0% { background-position:-400px 0; } 100% { background-position:400px 0; } }
  @keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
  @keyframes scaleIn  { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
`;

const S = {
  page:       { minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans', 'Segoe UI', sans-serif" },
  topbar:     { position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px', height: '56px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8EDF2' },
  backBtn:    { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: 'none', background: 'none', cursor: 'pointer', color: '#0D1B2A', borderRadius: '8px', flexShrink: 0 },
  topbarTitle:{ flex: 1, fontSize: '16px', fontWeight: '700', color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.2px' },
  qrBtn:      { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: '1.5px solid #E2E8F0', background: '#FFFFFF', cursor: 'pointer', color: '#0D1B2A', borderRadius: '8px', flexShrink: 0 },
  editBtn:    { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: '1.5px solid #E2E8F0', background: '#FFFFFF', cursor: 'pointer', color: '#0F4C81', borderRadius: '8px', flexShrink: 0 },
  main:       { padding: '0 0 40px 0', display: 'flex', flexDirection: 'column', gap: '0' },
  // Galeria
  galeriaSection:         { backgroundColor: '#FFFFFF', marginBottom: '12px' },
  imagemPrincipalWrapper: { position: 'relative', height: '260px', overflow: 'hidden', cursor: 'zoom-in' },
  imagemPrincipal:        { width: '100%', height: '100%', objectFit: 'cover' },
  ampliarHint:            { position: 'absolute', bottom: '12px', right: '12px', display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '20px', backgroundColor: 'rgba(0,0,0,0.5)', color: '#FFFFFF', fontSize: '11px', fontWeight: '500' },
  statusBadge:            { position: 'absolute', top: '14px', left: '14px', display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', backdropFilter: 'blur(8px)' },
  badgeOperacao:          { backgroundColor: 'rgba(16,185,129,0.15)', color: '#065F46', border: '1px solid rgba(16,185,129,0.3)' },
  badgeManutencao:        { backgroundColor: 'rgba(245,158,11,0.2)', color: '#92400E', border: '1px solid rgba(245,158,11,0.35)' },
  statusDot:              { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'currentColor', display: 'inline-block' },
  thumbnailRow:           { display: 'flex', gap: '8px', padding: '12px 16px', overflowX: 'auto', scrollbarWidth: 'none' },
  thumbnail:              { width: '60px', height: '60px', flexShrink: 0, border: '2px solid transparent', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', padding: 0, backgroundColor: 'transparent' },
  thumbnailActive:        { borderColor: '#0F4C81' },
  thumbnailImg:           { width: '100%', height: '100%', objectFit: 'cover' },
  semImagem:              { height: '180px', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '12px' },
  // Cards
  card:           { backgroundColor: '#FFFFFF', margin: '0 0 8px 0', padding: '20px' },
  sectionHeader:  { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' },
  sectionTitle:   { margin: 0, fontSize: '15px', fontWeight: '700', color: '#0D1B2A', letterSpacing: '-0.1px' },
  countBadge:     { marginLeft: 'auto', padding: '2px 8px', backgroundColor: '#EEF2FF', color: '#3B5BDB', borderRadius: '20px', fontSize: '11px', fontWeight: '700' },
  nomeEquipamento:{ margin: '0 0 10px 0', fontSize: '22px', fontWeight: '800', color: '#0D1B2A', letterSpacing: '-0.4px' },
  descricao:      { margin: 0, fontSize: '14px', color: '#64748B', lineHeight: 1.65 },
  btnAbrirManual: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px 20px', width: '100%', backgroundColor: '#20643F', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
  manualHint:     { margin: '10px 0 0 0', fontSize: '12px', color: '#94A3B8', textAlign: 'center', lineHeight: 1.5 },
  // Peças
  pecasList:      { margin: 0, padding: 0, listStyle: 'none' },
  pecaItem:       { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0' },
  pecaItemBorder: { borderBottom: '1px solid #F1F5F9' },
  pecaIndex:      { fontSize: '11px', fontWeight: '700', color: '#94A3B8', fontVariantNumeric: 'tabular-nums', minWidth: '22px' },
  pecaNome:       { fontSize: '14px', color: '#0D1B2A', fontWeight: '500' },
  emptyPecas:     { margin: 0, fontSize: '13px', color: '#94A3B8', fontStyle: 'italic' },
  // Lightbox
  lightboxOverlay:{ position: 'fixed', inset: 0, zIndex: 200, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.2s ease' },
  lightboxClose:  { position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#FFFFFF', zIndex: 201 },
  lightboxImg:    { maxWidth: '96vw', maxHeight: '90dvh', objectFit: 'contain', borderRadius: '8px' },
  lightboxCounter:{ position: 'absolute', bottom: '20px', padding: '5px 14px', backgroundColor: 'rgba(0,0,0,0.5)', color: '#FFFFFF', borderRadius: '20px', fontSize: '13px', fontWeight: '600' },
};
