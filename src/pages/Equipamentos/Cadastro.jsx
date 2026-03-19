// src/pages/Equipamentos/Cadastro.jsx
// ALTERAÇÕES v2:
//   • Manual PDF: upload de arquivo removido. Substituído por input type='url'
//     obrigatório para link externo (Google Drive, OneDrive, etc.).
//   • Bucket 'manuais' e função uploadArquivo não são mais chamados para PDF.
//   • Validação: manual_url é obrigatório para concluir o cadastro.
// INALTERADO: upload de imagens via Supabase Storage, paleta de cores, layout.

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import useAuthStore from '../../store/authStore';

// ─── Constantes ───────────────────────────────────────────────
const MAX_IMAGENS = 6;
const MAX_IMG_MB  = 5;

// ─── Helper: valida se a string parece uma URL ─────────────────
function isUrlValida(str) {
  try {
    const u = new URL(str.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function Cadastro() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();

  // ─── Campos do formulário ───────────────────────────────────
  const [nome,     setNome]     = useState('');
  const [descricao, setDescricao] = useState('');
  const [manualUrl, setManualUrl] = useState('');

  // Imagens: array de { file: File, preview: string }
  const [imagens, setImagens] = useState([]);

  // Peças: array de { id: string (local), nome: string }
  const [pecas, setPecas] = useState([{ id: crypto.randomUUID(), nome: '' }]);

  // ─── Estado de envio ────────────────────────────────────────
  const [enviando,   setEnviando]   = useState(false);
  const [progresso,  setProgresso]  = useState('');
  const [erros,      setErros]      = useState({});
  const [erroGlobal, setErroGlobal] = useState('');

  const imgInputRef = useRef(null);

  // ─── Manipulação de imagens ──────────────────────────────────
  const handleAddImagens = (e) => {
    const files = Array.from(e.target.files);
    const validas = [];
    const novosErros = {};

    files.forEach((f) => {
      if (!f.type.startsWith('image/')) {
        novosErros.imagens = 'Apenas arquivos de imagem são permitidos.';
        return;
      }
      if (f.size > MAX_IMG_MB * 1024 * 1024) {
        novosErros.imagens = `Imagem "${f.name}" excede ${MAX_IMG_MB}MB.`;
        return;
      }
      validas.push({ file: f, preview: URL.createObjectURL(f) });
    });

    setErros((prev) => ({ ...prev, ...novosErros }));
    setImagens((prev) => [...prev, ...validas].slice(0, MAX_IMAGENS));
    e.target.value = '';
  };

  const handleRemoverImagem = (index) => {
    setImagens((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  // ─── Manipulação de peças ─────────────────────────────────────
  const handlePecaNome  = (id, valor) =>
    setPecas((prev) => prev.map((p) => (p.id === id ? { ...p, nome: valor } : p)));
  const handleAddPeca   = () =>
    setPecas((prev) => [...prev, { id: crypto.randomUUID(), nome: '' }]);
  const handleRemoverPeca = (id) =>
    setPecas((prev) => prev.filter((p) => p.id !== id));

  // ─── Validação ────────────────────────────────────────────────
  const validar = () => {
    const e = {};

    if (!nome.trim())             e.nome = 'O nome do equipamento é obrigatório.';
    else if (nome.trim().length < 3) e.nome = 'Nome muito curto (mínimo 3 caracteres).';

    if (!manualUrl.trim())        e.manualUrl = 'O link do manual é obrigatório.';
    else if (!isUrlValida(manualUrl)) e.manualUrl = 'Insira uma URL válida (ex: https://...).';

    const pecasValidas = pecas.filter((p) => p.nome.trim());
    if (pecasValidas.length === 0) {
      e.pecas = 'Cadastre ao menos uma peça para o equipamento.';
    }
    const pecasDuplicadas = pecasValidas
      .map((p) => p.nome.trim().toLowerCase())
      .filter((n, i, arr) => arr.indexOf(n) !== i);
    if (pecasDuplicadas.length > 0) {
      e.pecas = `Peças duplicadas: ${pecasDuplicadas.join(', ')}.`;
    }

    setErros(e);
    return Object.keys(e).length === 0;
  };

  // ─── Upload de imagem para o Storage ──────────────────────────
  const uploadImagem = async (file, path) => {
    const { error } = await supabase.storage
      .from('equipamentos-imagens')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage
      .from('equipamentos-imagens')
      .getPublicUrl(path);
    return data.publicUrl;
  };

  // ─── Submissão ────────────────────────────────────────────────
  const handleSubmit = async () => {
    setErroGlobal('');
    if (!validar()) return;

    setEnviando(true);
    try {
      // 1. Upload das imagens
      const urlsImagens = [];
      for (let i = 0; i < imagens.length; i++) {
        setProgresso(`Enviando imagem ${i + 1} de ${imagens.length}...`);
        const ext  = imagens[i].file.name.split('.').pop();
        const path = `${profile.id}/${Date.now()}_${i}.${ext}`;
        urlsImagens.push(await uploadImagem(imagens[i].file, path));
      }

      // 2. Insere o equipamento (manual_url é a URL externa informada)
      setProgresso('Salvando equipamento...');
      const { data: eq, error: errEq } = await supabase
        .from('equipamentos')
        .insert({
          nome:         nome.trim(),
          descricao:    descricao.trim() || null,
          status:       'em_operacao',
          manual_url:   manualUrl.trim(),
          imagens_urls: urlsImagens,
          criado_por:   profile.id,
        })
        .select('id')
        .single();
      if (errEq) throw errEq;

      // 3. Insere as peças
      const pecasValidas = pecas.filter((p) => p.nome.trim());
      if (pecasValidas.length > 0) {
        setProgresso('Salvando peças...');
        const { error: errPecas } = await supabase
          .from('pecas_equipamento')
          .insert(pecasValidas.map((p) => ({
            equipamento_id: eq.id,
            nome:           p.nome.trim(),
          })));
        if (errPecas) throw errPecas;
      }

      setProgresso('Concluído!');
      navigate(`/equipamentos/${eq.id}`, { replace: true });

    } catch (err) {
      console.error('[Cadastro] Erro:', err);
      setErroGlobal(`Erro ao salvar: ${err.message ?? 'Tente novamente.'}`);
    } finally {
      setEnviando(false);
      setProgresso('');
    }
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {/* Topbar */}
      <header style={S.topbar}>
        <button onClick={() => navigate('/equipamentos')} style={S.backBtn} disabled={enviando}>
          <BackIcon />
        </button>
        <h1 style={S.topbarTitle}>Novo equipamento</h1>
      </header>

      <main style={S.main}>

        {/* ── Informações básicas ── */}
        <FormSection title="Informações básicas" icon={<InfoIcon />}>
          <FormField label="Nome do equipamento *" error={erros.nome}>
            <input
              type="text"
              placeholder="Ex: Torno CNC Romi T-240"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              style={{ ...S.input, ...(erros.nome ? S.inputError : {}) }}
              maxLength={100}
              disabled={enviando}
            />
          </FormField>

          <FormField label="Descrição (opcional)">
            <textarea
              placeholder="Descreva brevemente o equipamento, localização, função principal..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              style={S.textarea}
              rows={3}
              maxLength={500}
              disabled={enviando}
            />
            <span style={S.charCount}>{descricao.length}/500</span>
          </FormField>
        </FormSection>

        {/* ── Manual (link externo) ── */}
        <FormSection title="Manual do Equipamento *" icon={<PdfIcon />}>
          <FormField
            label="Link do manual (Google Drive, OneDrive, etc.) *"
            error={erros.manualUrl}
          >
            <input
              type="url"
              placeholder="https://drive.google.com/file/d/..."
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              style={{ ...S.input, ...(erros.manualUrl ? S.inputError : {}) }}
              disabled={enviando}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </FormField>

          {/* Texto de ajuda */}
          <div style={S.helpBox}>
            <InfoSmIcon />
            <div style={S.helpText}>
              <strong>Como obter o link do Google Drive:</strong>
              <ol style={S.helpList}>
                <li>Abra o arquivo no Google Drive</li>
                <li>Clique em <em>Compartilhar</em> → <em>Qualquer pessoa com o link</em></li>
                <li>Copie o link gerado e cole aqui</li>
              </ol>
              <span style={S.helpSub}>
                Links de OneDrive, Dropbox ou qualquer URL pública de PDF também são aceitos.
              </span>
            </div>
          </div>
        </FormSection>

        {/* ── Imagens ── */}
        <FormSection title={`Imagens (máx. ${MAX_IMAGENS})`} icon={<CameraIcon />}>
          <input
            ref={imgInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleAddImagens}
            style={{ display: 'none' }}
            disabled={enviando}
          />

          {imagens.length > 0 && (
            <div style={S.imagensGrid}>
              {imagens.map((img, i) => (
                <div key={i} style={S.imagemThumbWrapper}>
                  <img src={img.preview} alt="" style={S.imagemThumb} />
                  {i === 0 && <span style={S.capaBadge}>Capa</span>}
                  <button
                    onClick={() => handleRemoverImagem(i)}
                    style={S.removeImgBtn}
                    disabled={enviando}
                    aria-label="Remover imagem"
                  >
                    <CloseSmallIcon />
                  </button>
                </div>
              ))}
            </div>
          )}

          {imagens.length < MAX_IMAGENS && (
            <button
              onClick={() => imgInputRef.current?.click()}
              style={S.uploadBtn}
              disabled={enviando}
            >
              <PlusIcon />
              {imagens.length === 0 ? 'Adicionar imagens' : 'Adicionar mais'}
            </button>
          )}

          {erros.imagens && <span style={S.fieldError}>{erros.imagens}</span>}
          <p style={S.hint}>Primeira imagem será a capa. Máx. {MAX_IMG_MB}MB por arquivo.</p>
        </FormSection>

        {/* ── Peças ── */}
        <FormSection title="Peças do equipamento *" icon={<WrenchIcon />}>
          {erros.pecas && <div style={S.pecasErro}>{erros.pecas}</div>}

          <div style={S.pecasList}>
            {pecas.map((peca, i) => (
              <div key={peca.id} style={S.pecaRow}>
                <span style={S.pecaNum}>{String(i + 1).padStart(2, '0')}</span>
                <input
                  type="text"
                  placeholder="Ex: Rolamento 6205 ZZ"
                  value={peca.nome}
                  onChange={(e) => handlePecaNome(peca.id, e.target.value)}
                  style={{ ...S.input, flex: 1 }}
                  maxLength={80}
                  disabled={enviando}
                />
                {pecas.length > 1 && (
                  <button
                    onClick={() => handleRemoverPeca(peca.id)}
                    style={S.removePecaBtn}
                    disabled={enviando}
                    aria-label="Remover peça"
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button onClick={handleAddPeca} style={S.addPecaBtn} disabled={enviando}>
            <PlusIcon /> Adicionar peça
          </button>
        </FormSection>

        {/* ── Erro global ── */}
        {erroGlobal && (
          <div style={S.erroGlobal}>
            <AlertIcon />
            {erroGlobal}
          </div>
        )}

        {/* ── Progresso ── */}
        {enviando && (
          <div style={S.progressoBox}>
            <div style={S.progressoSpinner} />
            <span style={S.progressoTexto}>{progresso}</span>
          </div>
        )}

        {/* ── Botão submit ── */}
        <button
          onClick={handleSubmit}
          disabled={enviando}
          style={{ ...S.btnSubmit, opacity: enviando ? 0.7 : 1 }}
        >
          {enviando
            ? <><div style={S.spinnerInline} /> Salvando...</>
            : <><SaveIcon /> Cadastrar equipamento</>
          }
        </button>

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

// ─── Ícones ───────────────────────────────────────────────────
function BackIcon()       { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function InfoIcon()       { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#0F4C81" strokeWidth="2"/><path d="M12 16v-4M12 8h.01" stroke="#0F4C81" strokeWidth="2" strokeLinecap="round"/></svg>; }
function InfoSmIcon()     { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" stroke="#20643F" strokeWidth="2"/><path d="M12 16v-4M12 8h.01" stroke="#20643F" strokeWidth="2" strokeLinecap="round"/></svg>; }
function CameraIcon()     { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="#0F4C81" strokeWidth="2"/><circle cx="12" cy="13" r="4" stroke="#0F4C81" strokeWidth="2"/></svg>; }
function PdfIcon()        { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#EF4444" strokeWidth="2"/><path d="M14 2v6h6M9 13h6M9 17h4" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/></svg>; }
function WrenchIcon()     { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="#0F4C81" strokeWidth="2" strokeLinecap="round"/></svg>; }
function PlusIcon()       { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>; }
function CloseSmallIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>; }
function TrashIcon()      { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function SaveIcon()       { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: 7 }}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function AlertIcon()      { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" stroke="#EF4444" strokeWidth="2"/><path d="M12 8v4m0 4h.01" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/></svg>; }

// ─── CSS e Estilos ────────────────────────────────────────────
const CSS = `
  @keyframes spin { to { transform: rotate(360deg); } }
  textarea { resize: vertical; }
  input[type="url"]:focus, input[type="text"]:focus, textarea:focus {
    outline: none;
    border-color: #0F4C81 !important;
    box-shadow: 0 0 0 3px rgba(15,76,129,0.1) !important;
  }
`;

const S = {
  page:        { minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans', 'Segoe UI', sans-serif" },
  topbar:      { position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', height: '56px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8EDF2' },
  backBtn:     { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: 'none', background: 'none', cursor: 'pointer', color: '#0D1B2A', borderRadius: '8px', flexShrink: 0 },
  topbarTitle: { margin: 0, fontSize: '17px', fontWeight: '700', color: '#0D1B2A', letterSpacing: '-0.2px' },
  main:        { padding: '16px 16px 60px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '640px', margin: '0 auto' },
  section:     { backgroundColor: '#FFFFFF', borderRadius: '14px', overflow: 'hidden', border: '1px solid #E8EDF2' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 18px 12px', borderBottom: '1px solid #F1F5F9' },
  sectionTitle: { margin: 0, fontSize: '14px', fontWeight: '700', color: '#0D1B2A', letterSpacing: '-0.1px' },
  sectionBody: { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' },
  formField:   { display: 'flex', flexDirection: 'column', gap: '6px' },
  label:       { fontSize: '12px', fontWeight: '700', color: '#374151', letterSpacing: '0.2px', textTransform: 'uppercase' },
  input:       { padding: '12px 14px', fontSize: '14px', border: '1.5px solid #E2E8F0', borderRadius: '9px', backgroundColor: '#FAFBFC', color: '#0D1B2A', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%', transition: 'border-color 0.15s' },
  inputError:  { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  textarea:    { padding: '12px 14px', fontSize: '14px', border: '1.5px solid #E2E8F0', borderRadius: '9px', backgroundColor: '#FAFBFC', color: '#0D1B2A', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%', lineHeight: 1.55, transition: 'border-color 0.15s' },
  charCount:   { fontSize: '11px', color: '#94A3B8', textAlign: 'right', marginTop: '-8px' },
  fieldError:  { fontSize: '12px', color: '#EF4444', fontWeight: '500' },
  hint:        { margin: 0, fontSize: '11px', color: '#94A3B8', lineHeight: 1.4 },
  // Caixa de ajuda do link
  helpBox:     { display: 'flex', gap: '10px', padding: '12px 14px', backgroundColor: 'rgba(32,100,63,0.05)', border: '1px solid rgba(32,100,63,0.18)', borderRadius: '9px' },
  helpText:    { flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#374151', lineHeight: 1.5 },
  helpList:    { margin: '4px 0 0 0', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '3px' },
  helpSub:     { marginTop: '4px', fontSize: '11px', color: '#64748B' },
  // Imagens
  imagensGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '4px' },
  imagemThumbWrapper: { position: 'relative', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', border: '1.5px solid #E2E8F0' },
  imagemThumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  capaBadge:   { position: 'absolute', bottom: '6px', left: '6px', padding: '2px 6px', backgroundColor: 'rgba(15,76,129,0.85)', color: '#FFFFFF', fontSize: '9px', fontWeight: '700', borderRadius: '4px', letterSpacing: '0.5px' },
  removeImgBtn:{ position: 'absolute', top: '5px', right: '5px', width: '22px', height: '22px', borderRadius: '50%', border: 'none', backgroundColor: 'rgba(0,0,0,0.55)', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  uploadBtn:   { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', width: '100%', border: '1.5px dashed #CBD5E1', borderRadius: '9px', backgroundColor: '#F8FAFC', color: '#64748B', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.15s, background 0.15s' },
  // Peças
  pecasList:   { display: 'flex', flexDirection: 'column', gap: '8px' },
  pecaRow:     { display: 'flex', alignItems: 'center', gap: '8px' },
  pecaNum:     { fontSize: '11px', fontWeight: '700', color: '#94A3B8', minWidth: '22px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  removePecaBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', flexShrink: 0, background: 'none', border: '1.5px solid #FECACA', borderRadius: '7px', cursor: 'pointer', color: '#EF4444', transition: 'background 0.15s' },
  addPecaBtn:  { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', width: '100%', border: '1.5px dashed #C7D7E8', borderRadius: '9px', backgroundColor: 'transparent', color: '#0F4C81', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
  pecasErro:   { padding: '10px 12px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '7px', fontSize: '12px', color: '#DC2626' },
  // Submit
  btnSubmit:   { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '15px', width: '100%', backgroundColor: '#0F4C81', color: '#FFFFFF', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', marginTop: '8px', letterSpacing: '-0.1px' },
  spinnerInline: { width: '17px', height: '17px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFF', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: '8px' },
  erroGlobal:  { display: 'flex', alignItems: 'center', gap: '8px', padding: '13px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '9px', fontSize: '13px', color: '#DC2626' },
  progressoBox: { display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 16px', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '9px' },
  progressoSpinner: { width: '16px', height: '16px', border: '2px solid #93C5FD', borderTopColor: '#0F4C81', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 },
  progressoTexto: { fontSize: '13px', color: '#1E40AF', fontWeight: '500' },
};
