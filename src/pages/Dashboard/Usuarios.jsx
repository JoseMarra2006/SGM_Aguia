// src/pages/Dashboard/Usuarios.jsx
// ALTERAÇÕES v4 (E-mail opcional — Dummy Email):
//   • Campo "E-mail" no ModalCadastro agora é opcional
//   • Validação de e-mail removida do bloco obrigatório
//   • Hint exibido abaixo do campo explicando o comportamento dummy
//   • Se e-mail vier vazio, a Edge Function gerará [CPF]@aguia.com.br
//   • Exibição na lista: e-mails dummy ficam ocultos (mostra "—") para não
//     confundir o admin — e-mails reais continuam sendo exibidos normalmente
// INALTERADO: ModalEditarUsuario, ModalExcluirUsuario, layout, paleta verde.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';

// ─── Helpers ──────────────────────────────────────────────────
function formatarCPF(v) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

// Identifica se um e-mail é dummy gerado automaticamente pelo sistema
function isDummyEmail(email) {
  if (!email) return true;
  return email.trim().toLowerCase().endsWith('@aguia.com.br');
}

async function extrairMensagemErro(fnError) {
  try {
    if (fnError?.context instanceof Response) {
      const json = await fnError.context.clone().json();
      if (json?.error)   return json.error;
      if (json?.message) return json.message;
    }
  } catch(_err) { 
    console.warn('[Usuarios] Erro ignorado:', _err);
  }
  return fnError?.message ?? 'Erro ao contactar o servidor.';
}

// ─── Modal Cadastro ───────────────────────────────────────────
// ALTERAÇÃO v4: campo e-mail agora é opcional.
// Se deixado vazio, a Edge Function gera [CPF]@aguia.com.br automaticamente.
function ModalCadastro({ onClose, onSucesso }) {
  const [nome,     setNome]     = useState('');
  const [cpf,      setCPF]      = useState('');
  const [rg,       setRG]       = useState('');
  const [nomeMae,  setNomeMae]  = useState('');
  const [email,    setEmail]    = useState('');
  const [senha,    setSenha]    = useState('');
  const [role,     setRole]     = useState('mecanico');
  const [salvando, setSalvando] = useState(false);
  const [erros,    setErros]    = useState({});
  const [erroGlobal, setErroGlobal] = useState('');

  const validar = () => {
    const e = {};
    if (!nome.trim() || nome.trim().length < 3)
      e.nome = 'Nome obrigatório (mín. 3 caracteres).';
    if (cpf.replace(/\D/g, '').length !== 11)
      e.cpf = 'CPF inválido. Digite os 11 dígitos.';
    // E-mail é OPCIONAL — só valida formato se o admin preencheu algo
    if (email.trim() && !email.includes('@'))
      e.email = 'E-mail inválido. Verifique o formato.';
    if (senha.length < 8)
      e.senha = 'Senha deve ter no mínimo 8 caracteres.';
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const handleCadastrar = async () => {
    setErroGlobal(''); setErros({});
    if (!validar()) return;
    setSalvando(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-user', {
        body: {
          // E-mail enviado como string vazia se não preenchido.
          // A Edge Function aplica a lógica dummy internamente.
          email:         email.trim().toLowerCase() || '',
          password:      senha,
          nome_completo: nome.trim(),
          cpf:           cpf.replace(/\D/g, ''),
          rg:            rg.trim() || null,
          nome_mae:      nomeMae.trim() || null,
          role,
        },
      });
      if (fnError) { setErroGlobal(await extrairMensagemErro(fnError)); return; }
      if (data?.error) { setErroGlobal(data.error); return; }
      onSucesso();
    } catch (err) {
      setErroGlobal(`Erro inesperado: ${err?.message ?? 'Tente novamente.'}`);
    } finally { setSalvando(false); }
  };

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modalBox} onClick={e => e.stopPropagation()}>
        <div style={S.modalHeader}>
          <h3 style={S.modalTitulo}>Novo usuário</h3>
          <button onClick={onClose} style={S.modalCloseBtn} disabled={salvando}>
            <CloseIcon />
          </button>
        </div>
        <div style={S.modalCorpo}>
          {/* Role toggle */}
          <div style={S.toggleRow}>
            {[{ v: 'mecanico', l: 'Mecânico' }, { v: 'superadmin', l: 'SuperAdmin' }].map(r => (
              <button key={r.v} onClick={() => setRole(r.v)} disabled={salvando}
                style={{ ...S.toggleBtn, ...(role === r.v ? S.toggleBtnAtivo : {}) }}>
                {r.l}
              </button>
            ))}
          </div>

          <FormField label="Nome completo *" error={erros.nome}>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)}
              style={{ ...S.input, ...(erros.nome ? S.inputErr : {}) }}
              placeholder="Ex: João da Silva" maxLength={80} disabled={salvando} />
          </FormField>

          <FormField label="CPF *" error={erros.cpf}>
            <input type="text" inputMode="numeric" value={cpf}
              onChange={e => setCPF(formatarCPF(e.target.value))}
              style={{ ...S.input, ...(erros.cpf ? S.inputErr : {}) }}
              placeholder="000.000.000-00" disabled={salvando} />
          </FormField>

          <div style={S.doisCols}>
            <FormField label="RG">
              <input type="text" value={rg} onChange={e => setRG(e.target.value)}
                style={S.input} placeholder="0000000" maxLength={20} disabled={salvando} />
            </FormField>
            <FormField label="Nome da mãe">
              <input type="text" value={nomeMae} onChange={e => setNomeMae(e.target.value)}
                style={S.input} placeholder="Nome completo" maxLength={80} disabled={salvando} />
            </FormField>
          </div>

          {/* ── E-mail opcional (v4) ── */}
          <FormField label="E-mail (opcional)" error={erros.email}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              style={{ ...S.input, ...(erros.email ? S.inputErr : {}) }}
              placeholder="usuario@empresa.com" disabled={salvando} />
          </FormField>
          {/* Hint explicativo — só aparece se o campo estiver vazio */}
          {!email.trim() && (
            <div style={S.dummyHint}>
              <InfoIcon />
              <span>
                Sem e-mail, o sistema gera automaticamente{' '}
                <strong>{cpf.replace(/\D/g, '') || '00000000000'}@aguia.com.br</strong>.
                O usuário faz login apenas com CPF e senha.
              </span>
            </div>
          )}

          <FormField label="Senha provisória *" error={erros.senha}>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
              style={{ ...S.input, ...(erros.senha ? S.inputErr : {}) }}
              placeholder="Mínimo 8 caracteres" disabled={salvando} />
          </FormField>

          <div style={S.senhaHint}>
            🔒 O usuário será obrigado a trocar a senha no primeiro acesso.
          </div>

          {erroGlobal && (
            <div style={S.erroGlobal}><AlertIcon /><span>{erroGlobal}</span></div>
          )}
        </div>
        <div style={S.modalFooter}>
          <button onClick={onClose} style={S.btnSecundario} disabled={salvando}>
            Cancelar
          </button>
          <button onClick={handleCadastrar} disabled={salvando}
            style={{ ...S.btnPrimario, opacity: salvando ? 0.7 : 1 }}>
            {salvando ? <><Spinner />Cadastrando...</> : 'Cadastrar usuário'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Editar Usuário (inalterado) ────────────────────────
function ModalEditarUsuario({ usuario, onClose, onSucesso }) {
  const [nome,     setNome]     = useState(usuario.nome_completo ?? '');
  const [cpf,      setCPF]      = useState(
    (usuario.cpf ?? '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  );
  const [rg,       setRG]       = useState(usuario.rg ?? '');
  const [nomeMae,  setNomeMae]  = useState(usuario.nome_mae ?? '');
  const [role,     setRole]     = useState(usuario.role ?? 'mecanico');
  const [salvando, setSalvando] = useState(false);
  const [erros,    setErros]    = useState({});
  const [erroGlobal, setErroGlobal] = useState('');

  const validar = () => {
    const e = {};
    if (!nome.trim() || nome.trim().length < 3) e.nome = 'Nome obrigatório (mín. 3 caracteres).';
    if (cpf.replace(/\D/g, '').length !== 11)   e.cpf  = 'CPF inválido. Digite os 11 dígitos.';
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const handleSalvar = async () => {
    setErroGlobal('');
    if (!validar()) return;
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('usuarios')
        .update({
          nome_completo: nome.trim(),
          cpf:           cpf.replace(/\D/g, ''),
          rg:            rg.trim() || null,
          nome_mae:      nomeMae.trim() || null,
          role,
        })
        .eq('id', usuario.id);
      if (error) throw error;
      onSucesso();
    } catch (err) {
      setErroGlobal(`Erro ao salvar: ${err.message}`);
    } finally { setSalvando(false); }
  };

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modalBox} onClick={e => e.stopPropagation()}>
        <div style={S.modalHeader}>
          <h3 style={S.modalTitulo}>Editar usuário</h3>
          <button onClick={onClose} style={S.modalCloseBtn} disabled={salvando}>
            <CloseIcon />
          </button>
        </div>
        <div style={S.modalCorpo}>
          <div style={S.toggleRow}>
            {[{ v: 'mecanico', l: 'Mecânico' }, { v: 'superadmin', l: 'SuperAdmin' }].map(r => (
              <button key={r.v} onClick={() => setRole(r.v)} disabled={salvando}
                style={{ ...S.toggleBtn, ...(role === r.v ? S.toggleBtnAtivo : {}) }}>
                {r.l}
              </button>
            ))}
          </div>
          <FormField label="Nome completo *" error={erros.nome}>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)}
              style={{ ...S.input, ...(erros.nome ? S.inputErr : {}) }}
              maxLength={80} disabled={salvando} />
          </FormField>
          <FormField label="CPF *" error={erros.cpf}>
            <input type="text" inputMode="numeric" value={cpf}
              onChange={e => setCPF(formatarCPF(e.target.value))}
              style={{ ...S.input, ...(erros.cpf ? S.inputErr : {}) }}
              placeholder="000.000.000-00" disabled={salvando} />
          </FormField>
          <div style={S.doisCols}>
            <FormField label="RG">
              <input type="text" value={rg} onChange={e => setRG(e.target.value)}
                style={S.input} maxLength={20} disabled={salvando} />
            </FormField>
            <FormField label="Nome da mãe">
              <input type="text" value={nomeMae} onChange={e => setNomeMae(e.target.value)}
                style={S.input} maxLength={80} disabled={salvando} />
            </FormField>
          </div>
          <div style={S.senhaHint}>
            ℹ️ Para alterar e-mail ou senha, use o painel do Supabase.
          </div>
          {erroGlobal && (
            <div style={S.erroGlobal}><AlertIcon /><span>{erroGlobal}</span></div>
          )}
        </div>
        <div style={S.modalFooter}>
          <button onClick={onClose} style={S.btnSecundario} disabled={salvando}>Cancelar</button>
          <button onClick={handleSalvar} disabled={salvando}
            style={{ ...S.btnPrimario, opacity: salvando ? 0.7 : 1 }}>
            {salvando ? <><Spinner />Salvando...</> : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Excluir Usuário (inalterado) ───────────────────────
function ModalExcluirUsuario({ usuario, onClose, onExcluido }) {
  const [excluindo, setExcluindo] = useState(false);
  const [erro,      setErro]      = useState('');

  const handleExcluir = async () => {
    setErro(''); setExcluindo(true);
    try {
      const { error } = await supabase.from('usuarios').delete().eq('id', usuario.id);
      if (error) throw error;
      onExcluido();
    } catch (err) {
      setErro(`Erro ao excluir: ${err.message}`);
    } finally { setExcluindo(false); }
  };

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{
        ...S.modalBox, padding: '32px 28px', alignItems: 'center',
        gap: 14, display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          backgroundColor: 'rgba(239,68,68,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <TrashIcon cor="#EF4444" size={28} />
        </div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0D1B2A' }}>
          Excluir usuário?
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 1.6 }}>
          O perfil de <strong>{usuario.nome_completo}</strong> será removido.
          O acesso ao aplicativo será bloqueado imediatamente.
        </p>
        <div style={{
          width: '100%', padding: '11px 13px',
          backgroundColor: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.3)', borderRadius: 9,
          fontSize: 12, color: '#92400E', fontWeight: 500,
        }}>
          ⚠️ O.S. e checklists deste usuário serão preservados no histórico.
        </div>
        {erro && (
          <div style={{
            width: '100%', padding: '11px 13px', backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA', borderRadius: 9, fontSize: 12, color: '#DC2626',
          }}>{erro}</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', marginTop: 4 }}>
          <button onClick={onClose} disabled={excluindo} style={{
            padding: 12, backgroundColor: '#F8FAFC', color: '#64748B',
            border: '1.5px solid #E2E8F0', borderRadius: 9,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Cancelar
          </button>
          <button onClick={handleExcluir} disabled={excluindo} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 12, backgroundColor: '#EF4444', color: '#FFFFFF',
            border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', opacity: excluindo ? 0.7 : 1,
          }}>
            {excluindo ? <><Spinner />Excluindo...</> : 'Confirmar exclusão'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Linha de Usuário ─────────────────────────────────────────
// ALTERAÇÃO v4: e-mails dummy (@aguia.com.br) são exibidos como "—"
// para não expor o formato técnico interno ao admin.
function LinhaUsuario({ usuario, index, onEditar, onExcluir }) {
  const isAdmin = usuario.role === 'superadmin';
  // Oculta e-mails dummy gerados automaticamente
  const emailExibido = isDummyEmail(usuario.email) ? '—' : usuario.email;

  return (
    <div style={{ ...S.linhaUsuario, animationDelay: `${index * 50}ms` }}>
      <div style={S.avatarCirculo}>
        <span style={{ ...S.avatarLetra, backgroundColor: isAdmin ? '#20643F' : '#64748B' }}>
          {usuario.nome_completo?.charAt(0)?.toUpperCase() ?? '?'}
        </span>
      </div>
      <div style={S.usuarioInfo}>
        <span style={S.usuarioNome}>{usuario.nome_completo}</span>
        <span style={S.usuarioMeta}>
          {usuario.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
          <span style={S.metaDot} />
          {emailExibido}
        </span>
      </div>
      <div style={S.usuarioDir}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ ...S.roleBadge, ...(isAdmin ? S.roleBadgeAdmin : S.roleBadgeMec) }}>
            {isAdmin ? 'Admin' : 'Mecânico'}
          </span>
          {!usuario.senha_alterada && <span style={S.senhaTag}>1º acesso</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 5, justifyContent: 'flex-end' }}>
          <button onClick={() => onEditar(usuario)} style={S.acaoBtn} title="Editar usuário">
            <EditIcon />
          </button>
          <button onClick={() => onExcluir(usuario)}
            style={{ ...S.acaoBtn, borderColor: 'rgba(239,68,68,0.3)', color: '#EF4444' }}
            title="Excluir usuário">
            <TrashIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tela principal (inalterada) ──────────────────────────────
export default function Usuarios() {
  const navigate = useNavigate();
  const [usuarios,     setUsuarios]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [busca,        setBusca]        = useState('');
  const [modalAberto,  setModalAberto]  = useState(false);
  const [modalEditar,  setModalEditar]  = useState(null);
  const [modalExcluir, setModalExcluir] = useState(null);

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome_completo, cpf, rg, nome_mae, email, role, senha_alterada, criado_em')
        .order('nome_completo');
      if (error) throw error;
      setUsuarios(data ?? []);
    } catch (err) {
      console.error('[Usuarios] Erro ao buscar:', err.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsuarios(); }, [fetchUsuarios]);

  const filtrados = usuarios.filter(u =>
    u.nome_completo.toLowerCase().includes(busca.toLowerCase()) ||
    u.email.toLowerCase().includes(busca.toLowerCase()) ||
    u.cpf.includes(busca.replace(/\D/g, ''))
  );

  const totalAdmins    = usuarios.filter(u => u.role === 'superadmin').length;
  const totalMecanicos = usuarios.filter(u => u.role === 'mecanico').length;

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {modalAberto && (
        <ModalCadastro
          onClose={() => setModalAberto(false)}
          onSucesso={() => { setModalAberto(false); fetchUsuarios(); }}
        />
      )}
      {modalEditar && (
        <ModalEditarUsuario
          usuario={modalEditar}
          onClose={() => setModalEditar(null)}
          onSucesso={() => { setModalEditar(null); fetchUsuarios(); }}
        />
      )}
      {modalExcluir && (
        <ModalExcluirUsuario
          usuario={modalExcluir}
          onClose={() => setModalExcluir(null)}
          onExcluido={() => { setModalExcluir(null); fetchUsuarios(); }}
        />
      )}

      <header style={S.topbar}>
        <button onClick={() => navigate('/dashboard')} style={S.backBtn}><BackIcon /></button>
        <h1 style={S.topbarTitulo}>Usuários</h1>
        <button onClick={() => setModalAberto(true)} style={S.btnNovoHeader}>
          <PlusIcon /> Novo
        </button>
      </header>

      <main style={S.main}>
        <div style={S.resumoRow}>
          <div style={S.resumoChip}>
            <span style={{ ...S.resumoNum, color: '#20643F' }}>{totalAdmins}</span>
            <span style={S.resumoLabel}>Administradores</span>
          </div>
          <div style={S.resumoDiv} />
          <div style={S.resumoChip}>
            <span style={{ ...S.resumoNum, color: '#64748B' }}>{totalMecanicos}</span>
            <span style={S.resumoLabel}>Mecânicos</span>
          </div>
        </div>

        <div style={S.buscaWrapper}>
          <SearchIcon />
          <input type="text" placeholder="Buscar por nome, CPF ou e-mail..."
            value={busca} onChange={e => setBusca(e.target.value)} style={S.buscaInput} />
          {busca && (
            <button onClick={() => setBusca('')} style={S.clearBtn}><CloseSmIcon /></button>
          )}
        </div>

        {loading ? <SkeletonLista /> : filtrados.length === 0 ? (
          <div style={S.estadoVazio}>
            <span style={{ fontSize: '40px' }}>👤</span>
            <p style={S.estadoTexto}>
              {busca ? `Nenhum resultado para "${busca}"` : 'Nenhum usuário cadastrado.'}
            </p>
          </div>
        ) : (
          <div style={S.listaCard}>
            {filtrados.map((u, i) => (
              <LinhaUsuario key={u.id} usuario={u} index={i}
                onEditar={usr => setModalEditar(usr)}
                onExcluir={usr => setModalExcluir(usr)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Auxiliares ───────────────────────────────────────────────
function FormField({ label, error, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 }}>
      <label style={S.fieldLabel}>{label}</label>
      {children}
      {error && <span style={S.fieldError}>{error}</span>}
    </div>
  );
}
function SkeletonLista() {
  return (
    <div style={S.listaCard}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          padding: '14px 16px', display: 'flex', alignItems: 'center',
          gap: '12px', borderBottom: '1px solid #F1F5F9',
        }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', ...skBg, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <div style={{ height: 13, width: '55%', borderRadius: 5, ...skBg }} />
            <div style={{ height: 11, width: '75%', borderRadius: 5, ...skBg }} />
          </div>
        </div>
      ))}
    </div>
  );
}
const skBg = {
  background: 'linear-gradient(90deg,#F0F4F8 25%,#E8EDF2 50%,#F0F4F8 75%)',
  backgroundSize: '400px', animation: 'shimmer 1.4s infinite linear',
};

// ─── Ícones ───────────────────────────────────────────────────
function BackIcon()  { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function PlusIcon()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginRight: 5 }}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>; }
function CloseIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function CloseSmIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function SearchIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function AlertIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" stroke="#EF4444" strokeWidth="2"/><path d="M12 8v4m0 4h.01" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/></svg>; }
function InfoIcon()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" stroke="#0F4C81" strokeWidth="2"/><path d="M12 16v-4M12 8h.01" stroke="#0F4C81" strokeWidth="2" strokeLinecap="round"/></svg>; }
function Spinner()   { return <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFF', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: 7 }} />; }
function EditIcon({ cor = '#475569' }) { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function TrashIcon({ cor = '#EF4444', size = 15 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}><polyline points="3 6 5 6 21 6" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }

// ─── CSS e Estilos ────────────────────────────────────────────
const CSS = `
  @keyframes cardFadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes shimmer    { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
  @keyframes spin       { to{transform:rotate(360deg)} }
  @keyframes fadeIn     { from{opacity:0} to{opacity:1} }
  select:focus,input:focus,textarea:focus{outline:none;border-color:#20643F!important;box-shadow:0 0 0 3px rgba(32,100,63,0.1)!important;}
`;

const S = {
  page:          { minHeight: '100dvh', backgroundColor: '#F4F7FA', fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  topbar:        { position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', height: '56px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8EDF2' },
  backBtn:       { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: 'none', background: 'none', cursor: 'pointer', color: '#0D1B2A', borderRadius: '8px', flexShrink: 0 },
  topbarTitulo:  { flex: 1, margin: 0, fontSize: '17px', fontWeight: '700', color: '#0D1B2A', letterSpacing: '-0.2px' },
  btnNovoHeader: { display: 'flex', alignItems: 'center', padding: '8px 14px', backgroundColor: '#20643F', color: '#FFFFFF', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
  main:          { padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '640px', margin: '0 auto', width: '100%', boxSizing: 'border-box' },
  resumoRow:     { display: 'flex', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8EDF2', padding: '14px 0' },
  resumoChip:    { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' },
  resumoNum:     { fontSize: '24px', fontWeight: '800', letterSpacing: '-0.5px' },
  resumoLabel:   { fontSize: '11px', color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px' },
  resumoDiv:     { width: '1px', backgroundColor: '#E8EDF2', alignSelf: 'stretch' },
  buscaWrapper:  { position: 'relative' },
  buscaInput:    { width: '100%', padding: '11px 36px 11px 38px', fontSize: '14px', border: '1.5px solid #E2E8F0', borderRadius: '10px', backgroundColor: '#FFFFFF', color: '#0D1B2A', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' },
  clearBtn:      { position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px', display: 'flex' },
  listaCard:     { backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8EDF2', overflow: 'hidden' },
  linhaUsuario:  { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '1px solid #F1F5F9', animation: 'cardFadeIn 0.3s ease both' },
  avatarCirculo: { flexShrink: 0 },
  avatarLetra:   { width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', color: '#FFFFFF' },
  usuarioInfo:   { flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', overflow: 'hidden', minWidth: 0 },
  usuarioNome:   { fontSize: '14px', fontWeight: '700', color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  usuarioMeta:   { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#94A3B8', overflow: 'hidden' },
  metaDot:       { width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#CBD5E1', flexShrink: 0 },
  usuarioDir:    { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 },
  roleBadge:     { padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' },
  roleBadgeAdmin:{ backgroundColor: 'rgba(32,100,63,0.1)', color: '#20643F' },
  roleBadgeMec:  { backgroundColor: '#F1F5F9', color: '#64748B' },
  senhaTag:      { padding: '2px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: '600', backgroundColor: 'rgba(245,158,11,0.1)', color: '#92400E' },
  acaoBtn:       { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: '1.5px solid #E2E8F0', borderRadius: 6, background: '#F8FAFC', cursor: 'pointer', color: '#64748B' },
  estadoVazio:   { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', gap: '12px', textAlign: 'center' },
  estadoTexto:   { margin: 0, fontSize: '14px', color: '#64748B', fontWeight: '500' },
  // Modal
  modalOverlay:  { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100, animation: 'fadeIn 0.2s ease' },
  modalBox:      { backgroundColor: '#FFFFFF', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '640px', maxHeight: '92dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  modalHeader:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 },
  modalTitulo:   { margin: 0, fontSize: '17px', fontWeight: '700', color: '#0D1B2A' },
  modalCloseBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#F8FAFC', cursor: 'pointer', color: '#64748B' },
  modalCorpo:    { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '13px', overflowY: 'auto', flex: 1 },
  modalFooter:   { padding: '16px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '8px', flexShrink: 0 },
  toggleRow:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' },
  toggleBtn:     { padding: '10px', border: '1.5px solid #E2E8F0', borderRadius: '9px', backgroundColor: '#F8FAFC', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' },
  toggleBtnAtivo:{ backgroundColor: '#20643F', borderColor: '#20643F', color: '#FFFFFF' },
  doisCols:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', minWidth: 0 },
  fieldLabel:    { fontSize: '11px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.3px' },
  input:         { padding: '11px 13px', fontSize: '14px', border: '1.5px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#FAFBFC', color: '#0D1B2A', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' },
  inputErr:      { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  fieldError:    { fontSize: '11px', color: '#EF4444', fontWeight: '500' },
  senhaHint:     { padding: '10px 12px', backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', fontSize: '12px', color: '#92400E', fontWeight: '500' },
  // Hint do e-mail dummy (novo)
  dummyHint:     { display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', backgroundColor: 'rgba(15,76,129,0.06)', border: '1px solid rgba(15,76,129,0.18)', borderRadius: '8px', fontSize: '12px', color: '#1E3A5F', lineHeight: 1.5 },
  erroGlobal:    { display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '11px 13px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', fontSize: '13px', color: '#DC2626' },
  btnSecundario: { flex: 1, padding: '12px', backgroundColor: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
  btnPrimario:   { flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backgroundColor: '#20643F', color: '#FFFFFF', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' },
};