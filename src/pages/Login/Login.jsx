// src/pages/Login/Login.jsx
// ALTERAÇÕES VISUAIS (migração final azul → verde): paleta #20643F
// ADIÇÕES v2 (Toggle de visibilidade da senha):
//   • PasswordInput: wrapper com botão olho (EyeIcon / EyeOffIcon) posicionado absolutamente
//   • useState show local em PasswordInput — isolado, não interfere em authStore nem submit
//   • Toggle aplicado ao campo "Senha" do Login e a "Nova senha" / "Confirmar" do ChangePasswordModal
//   • EyeIcon (olho aberto): cor #94A3B8 — senha oculta
//   • EyeOffIcon (olho cortado): cor #20643F — senha visível
//   • paddingRight: '46px' no input garante que o texto não sobreponha o botão

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore.js';
import logoEmpresa from '../../assets/logo_empresa.png';

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatCPF(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

// ─── Ícones de olho ───────────────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="3"
        stroke="#94A3B8" strokeWidth="2"/>
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
        stroke="#20643F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
        stroke="#20643F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10.73 10.73a3 3 0 0 0 4.24 4.24"
        stroke="#20643F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1 1l22 22"
        stroke="#20643F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Campo de senha com toggle de visibilidade ────────────────────────────
// Estado `show` é local ao componente: não afeta o valor `senha` do pai
// nem a lógica de submit/authStore. O type do input é derivado de `show`.

function PasswordInput({ label, id, value, onChange, onKeyDown, error, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div style={styles.inputGroup}>
      <label htmlFor={id} style={styles.label}>{label}</label>
      <div style={styles.passwordWrapper}>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          style={{
            ...styles.input,
            ...(error ? styles.inputError : {}),
            paddingRight: '46px',
          }}
          autoComplete={id === 'senha' ? 'current-password' : 'new-password'}
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          style={styles.eyeBtn}
          tabIndex={-1}
          aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {error && <span style={styles.fieldError}>{error}</span>}
    </div>
  );
}

// ─── Componente de campo reutilizável (campos não-senha) ──────────────────

function Input({ label, id, error, ...props }) {
  return (
    <div style={styles.inputGroup}>
      <label htmlFor={id} style={styles.label}>{label}</label>
      <input
        id={id}
        style={{ ...styles.input, ...(error ? styles.inputError : {}) }}
        {...props}
      />
      {error && <span style={styles.fieldError}>{error}</span>}
    </div>
  );
}

// ─── Modal de alerta de segurança ─────────────────────────────────────────

export function SecurityAlertModal({ nomeUsuario, onConfirm }) {
  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modalBox, ...styles.securityBox }}>
        <div style={styles.securityIconWrapper}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
              stroke="#20643F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            />
            <path
              d="M9 12l2 2 4-4"
              stroke="#20643F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2 style={styles.securityTitle}>Bem-vindo, {nomeUsuario}!</h2>

        <p style={styles.securityMsg}>
          Assim que terminar suas tarefas,{' '}
          <strong>deslogue para mais segurança!</strong>
        </p>

        <p style={styles.securitySub}>
          Dispositivos compartilhados na oficina precisam de atenção extra.
          O sistema faz logout automático após 24 horas de inatividade.
        </p>

        <button onClick={onConfirm} style={styles.securityBtn}>
          Entendido, vamos lá!
        </button>
      </div>
    </div>
  );
}

// ─── Modal de troca obrigatória de senha ──────────────────────────────────

function ChangePasswordModal({ onSuccess }) {
  const { changePassword, isLoading, authError, clearAuthError } = useAuthStore();
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async () => {
    clearAuthError();
    setLocalError('');
    if (novaSenha.length < 8) { setLocalError('A senha deve ter no mínimo 8 caracteres.'); return; }
    if (novaSenha !== confirmar) { setLocalError('As senhas não coincidem.'); return; }
    const { success } = await changePassword(novaSenha);
    if (success) onSuccess();
  };

  const displayError = localError || authError;

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalBox}>
        <div style={styles.modalIcon}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 style={styles.modalTitle}>Troca de senha obrigatória</h2>
        <p style={styles.modalSubtitle}>
          Este é seu primeiro acesso. Por segurança, defina uma nova senha para continuar.
        </p>
        <div style={styles.modalForm}>
          <PasswordInput
            label="Nova senha"
            id="nova-senha"
            placeholder="Mínimo 8 caracteres"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
          />
          <PasswordInput
            label="Confirmar nova senha"
            id="confirmar-senha"
            placeholder="Repita a nova senha"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            error={displayError}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          style={{ ...styles.btn, opacity: isLoading ? 0.7 : 1 }}
        >
          {isLoading ? <span style={styles.spinner} /> : 'Definir nova senha e entrar'}
        </button>
      </div>
    </div>
  );
}

// ─── Tela principal de login ──────────────────────────────────────────────

export default function Login() {
  const navigate = useNavigate();
  const { loginWithCPF, isLoading, authError, clearAuthError, setShowSecurityAlert } = useAuthStore();

  const [cpf,   setCPF]   = useState('');
  const [senha, setSenha] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [modalAtivo, setModalAtivo] = useState(null);

  const validate = () => {
    const errors = {};
    const rawCPF = cpf.replace(/\D/g, '');
    if (rawCPF.length !== 11) errors.cpf = 'CPF inválido. Digite os 11 dígitos.';
    if (senha.length < 4)     errors.senha = 'Senha muito curta.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLogin = async () => {
    clearAuthError();
    setFieldErrors({});
    if (!validate()) return;
    const rawCPF = cpf.replace(/\D/g, '');
    const result = await loginWithCPF(rawCPF, senha);
    if (result?.success) {
      if (result.mustChangePassword) {
        setModalAtivo('changePassword');
      } else {
        setShowSecurityAlert(true);
        navigate('/dashboard', { replace: true });
      }
    }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleLogin(); };

  const handlePasswordChanged = () => {
    setShowSecurityAlert(true);
    navigate('/dashboard', { replace: true });
  };

  return (
    <div style={styles.page}>
      <div style={styles.sidePanel}>
        <div style={styles.sidePanelInner}>
          <div style={styles.logoMark}>
            <img src={logoEmpresa} alt="SGM Águia" style={styles.logoImgSide} />
          </div>
          <h1 style={styles.sideTitle}>Manutenção<br/>Industrial</h1>
          <p style={styles.sideSubtitle}>
            Controle completo de equipamentos, preventivas e ordens de serviço.
          </p>
          <div style={styles.sideDecoGrid}>
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} style={{ ...styles.sideDecoCell, opacity: (i % 5) * 0.1 + 0.1 }} />
            ))}
          </div>
        </div>
      </div>

      <div style={styles.formPanel}>
        <div style={styles.formCard}>

          <div style={styles.logoMobile}>
            <img src={logoEmpresa} alt="SGM Águia" style={styles.logoImgMobile} />
          </div>

          <div style={styles.formHeader}>
            <p style={styles.formEyebrow}>Acesso ao sistema</p>
            <h2 style={styles.formTitle}>Bem-vindo</h2>
          </div>

          <div style={styles.form}>
            <Input
              label="CPF"
              id="cpf"
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCPF(formatCPF(e.target.value))}
              onKeyDown={handleKeyDown}
              error={fieldErrors.cpf}
              autoComplete="username"
            />

            {/* Campo de senha com toggle de visibilidade */}
            <PasswordInput
              label="Senha"
              id="senha"
              placeholder="••••••••"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={handleKeyDown}
              error={fieldErrors.senha}
            />

            {authError && (
              <div style={styles.authError}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" stroke="#EF4444" strokeWidth="2"/>
                  <path d="M12 8v4m0 4h.01" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                {authError}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={isLoading}
              style={{ ...styles.btn, marginTop: '8px', opacity: isLoading ? 0.7 : 1 }}
            >
              {isLoading ? <span style={styles.spinner} /> : 'Entrar'}
            </button>
          </div>

          <p style={styles.footerNote}>
            Problemas para acessar? Fale com o administrador do sistema.
          </p>
        </div>
      </div>

      {modalAtivo === 'changePassword' && (
        <ChangePasswordModal onSuccess={handlePasswordChanged} />
      )}
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────
const isMobile = window.innerWidth <= 768;

const styles = {
  page: {
    display: 'flex',
    minHeight: '100dvh',
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    backgroundColor: '#F8F9FB',
  },

  sidePanel: {
    display: isMobile ? 'none' : 'flex',
    flex: '0 0 420px',
    background: 'linear-gradient(160deg, #0D2B1A 0%, #20643F 50%, #2E8B57 100%)',
    position: 'relative',
    overflow: 'hidden',
  },
  sidePanelInner: {
    display: isMobile ? 'none' : 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '60px 48px',
    position: 'relative',
    zIndex: 1,
  },

  logoMark: { marginBottom: '32px' },
  logoImgSide: {
    height: '60px', width: 'auto', objectFit: 'contain',
    filter: 'brightness(0) invert(1)',
  },
  sideTitle: {
    fontSize: '40px', fontWeight: '700', color: '#FFFFFF',
    lineHeight: 1.15, margin: '0 0 16px 0', letterSpacing: '-0.5px',
  },
  sideSubtitle: {
    fontSize: '15px', color: 'rgba(255,255,255,0.65)',
    lineHeight: 1.6, margin: 0, maxWidth: '280px',
  },
  sideDecoGrid: {
    position: 'absolute', bottom: '40px', right: '40px',
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px',
  },
  sideDecoCell: {
    width: '24px', height: '24px', borderRadius: '4px',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  formPanel: {
    flex: 1, display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: '40px 24px',
  },
  formCard: { width: '100%', maxWidth: '400px' },

  logoMobile: {
    display: isMobile ? 'flex' : 'none',
    justifyContent: 'center',
    marginBottom: '28px',
  },
  logoImgMobile: { height: '52px', width: 'auto', objectFit: 'contain' },

  formHeader: { marginBottom: '36px' },
  formEyebrow: {
    fontSize: '12px', fontWeight: '600', letterSpacing: '1.5px',
    textTransform: 'uppercase', color: '#20643F', margin: '0 0 8px 0',
  },
  formTitle: {
    fontSize: '32px', fontWeight: '700', color: '#0D1B2A',
    margin: 0, letterSpacing: '-0.5px',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: '600', color: '#374151', letterSpacing: '0.2px' },
  input: {
    padding: '13px 16px', fontSize: '15px',
    border: '1.5px solid #E2E8F0', borderRadius: '10px',
    backgroundColor: '#FFFFFF', color: '#0D1B2A',
    outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit', boxSizing: 'border-box', width: '100%',
  },
  inputError: { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  fieldError: { fontSize: '12px', color: '#EF4444', marginTop: '2px' },
  authError: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '12px 14px', backgroundColor: '#FEF2F2',
    border: '1px solid #FCA5A5', borderRadius: '8px',
    fontSize: '13px', color: '#DC2626',
  },

  // ── Novo: wrapper do campo de senha ──────────────────────────
  passwordWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  // Botão olho: posicionado absolutamente à direita, não empurra o layout
  eyeBtn: {
    position: 'absolute',
    right: '14px',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    background: 'none',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    padding: 0,
    WebkitTapHighlightColor: 'transparent',
  },

  btn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '100%', padding: '14px', fontSize: '15px', fontWeight: '600',
    color: '#FFFFFF', backgroundColor: '#20643F',
    border: 'none', borderRadius: '10px', cursor: 'pointer',
    fontFamily: 'inherit', letterSpacing: '0.2px',
    transition: 'background-color 0.2s, transform 0.1s',
    minHeight: '50px',
  },
  spinner: {
    display: 'inline-block', width: '18px', height: '18px',
    border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFFFFF',
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
  },
  footerNote: {
    marginTop: '32px', textAlign: 'center',
    fontSize: '12px', color: '#94A3B8', lineHeight: 1.5,
  },

  modalOverlay: {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: '24px',
  },
  modalBox: {
    backgroundColor: '#FFFFFF', borderRadius: '16px',
    padding: '40px 36px', width: '100%', maxWidth: '420px',
    boxShadow: '0 25px 60px rgba(0,0,0,0.2)',
  },
  modalIcon: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '56px', height: '56px', backgroundColor: '#FFFBEB',
    borderRadius: '50%', marginBottom: '20px',
  },
  modalTitle: {
    fontSize: '20px', fontWeight: '700', color: '#0D1B2A',
    margin: '0 0 8px 0', letterSpacing: '-0.3px',
  },
  modalSubtitle: {
    fontSize: '14px', color: '#64748B', margin: '0 0 28px 0', lineHeight: 1.6,
  },
  modalForm: { display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' },

  securityBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center', padding: '40px 32px',
  },
  securityIconWrapper: {
    width: '72px', height: '72px', borderRadius: '50%',
    backgroundColor: 'rgba(32,100,63,0.1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: '20px',
  },
  securityTitle: {
    fontSize: '22px', fontWeight: '800', color: '#0D1B2A',
    margin: '0 0 12px 0', letterSpacing: '-0.4px',
  },
  securityMsg: {
    fontSize: '16px', color: '#374151', margin: '0 0 10px 0', lineHeight: 1.55,
  },
  securitySub: {
    fontSize: '13px', color: '#94A3B8', margin: '0 0 28px 0', lineHeight: 1.6,
  },
  securityBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '100%', padding: '14px', fontSize: '15px', fontWeight: '700',
    color: '#FFFFFF', backgroundColor: '#20643F',
    border: 'none', borderRadius: '10px', cursor: 'pointer',
    fontFamily: 'inherit', letterSpacing: '0.2px',
  },
};
