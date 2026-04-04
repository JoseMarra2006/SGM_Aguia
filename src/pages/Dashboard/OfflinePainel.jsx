// src/pages/Dashboard/OfflinePainel.jsx
//
// Tela de Emergência Offline — exibida quando !isOnline no Painel.jsx.
// Restringe o mecânico apenas às ações vitais que funcionam sem rede:
//   • Abrir OS Corretiva (gravada na fila offline do appStore)
//   • Acessar Minhas Preventivas (leitura do cache local)
//
// Paleta: herda #20643F (verde primário) e #F4F7FA (bg) do design system.

import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import useAppStore  from '../../store/appStore';

// ─── Ícones ───────────────────────────────────────────────────

function WifiOffIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
      style={{ display: 'block', flexShrink: 0 }}>
      <path
        d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.8M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"
        stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function OSIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      style={{ display: 'block', flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
        stroke="#FFFFFF" strokeWidth="2" />
      <path d="M14 2v6h6M12 18v-6M9 15h6"
        stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      style={{ display: 'block', flexShrink: 0 }}>
      <polyline points="1 4 1 10 7 10"
        stroke="#92400E" strokeWidth="2" strokeLinecap="round" />
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10"
        stroke="#92400E" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ─── Componente principal ─────────────────────────────────────

export default function OfflinePainel() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { checklistQueue, osQueue } = useAppStore();

  const pendentes = checklistQueue.length + osQueue.length;
  const primeiroNome = profile?.nome_completo?.split(' ')[0] ?? 'usuário';

  return (
    <div style={S.page}>

      {/* ── Header compacto ── */}
      <header style={S.header}>
        <span style={S.headerTitulo}>SGM Águia</span>
        <span style={S.headerNome}>Olá, {primeiroNome}</span>
      </header>

      {/* ── Área central ── */}
      <main style={S.main}>

        {/* Ícone + título */}
        <div style={S.heroSection}>
          <div style={S.iconWrapper}>
            <WifiOffIcon />
          </div>
          <h1 style={S.titulo}>Modo de Emergência</h1>
          <p style={S.subtitulo}>
            Sem conexão com a internet
          </p>
          <p style={S.descricao}>
            O sistema está offline. Você ainda pode registrar ocorrências —
            os dados serão salvos no dispositivo e sincronizados automaticamente
            quando a conexão for restaurada.
          </p>
        </div>

        {/* Banner de pendentes (exibe somente se houver itens na fila) */}
        {pendentes > 0 && (
          <div style={S.syncBanner}>
            <SyncIcon />
            <span>
              {pendentes} {pendentes === 1 ? 'registro aguarda' : 'registros aguardam'} sincronização.
            </span>
          </div>
        )}

        {/* ── Ações disponíveis ── */}
        <div style={S.acoesSection}>
          <p style={S.acoesLabel}>Ações disponíveis offline</p>

          {/* OS Corretiva */}
          <button
            style={S.btnPrimario}
            onClick={() => navigate('/corretivas/nova')}
          >
            <div style={S.btnIcone}><OSIcon /></div>
            <div style={S.btnTextos}>
              <span style={S.btnTitulo}>Abrir O.S. Corretiva</span>
              <span style={S.btnSub}>Registrar falha ou defeito em equipamento</span>
            </div>
            <ChevronIcon cor="#FFFFFF" />
          </button>
        </div>

        {/* Nota de rodapé */}
        <p style={S.nota}>
          Outros módulos (Equipamentos, Usuários, Estoque) requerem conexão com o servidor.
        </p>

      </main>
    </div>
  );
}

// ─── Ícone auxiliar ───────────────────────────────────────────

function ChevronIcon({ cor }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      style={{ display: 'block', flexShrink: 0 }}>
      <path d="M9 18l6-6-6-6" stroke={cor} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ─── Estilos ──────────────────────────────────────────────────

const S = {
  page: {
    minHeight:       '100dvh',
    backgroundColor: '#F4F7FA',
    fontFamily:      "'DM Sans','Segoe UI',sans-serif",
    display:         'flex',
    flexDirection:   'column',
  },
  header: {
    backgroundColor: '#20643F',
    padding:         '14px 20px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
  },
  headerTitulo: {
    fontSize:   '16px',
    fontWeight: '800',
    color:      '#FFFFFF',
    letterSpacing: '-0.3px',
  },
  headerNome: {
    fontSize:   '13px',
    color:      'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },
  main: {
    flex:          1,
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    padding:       '32px 20px 40px',
    maxWidth:      '480px',
    margin:        '0 auto',
    width:         '100%',
    boxSizing:     'border-box',
    gap:           '20px',
  },
  heroSection: {
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    textAlign:     'center',
    gap:           '8px',
    width:         '100%',
  },
  iconWrapper: {
    width:           '80px',
    height:          '80px',
    borderRadius:    '24px',
    backgroundColor: 'rgba(239,68,68,0.08)',
    border:          '1.5px solid rgba(239,68,68,0.2)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    '8px',
  },
  titulo: {
    margin:        0,
    fontSize:      '22px',
    fontWeight:    '800',
    color:         '#0D1B2A',
    letterSpacing: '-0.4px',
  },
  subtitulo: {
    margin:     0,
    fontSize:   '14px',
    fontWeight: '600',
    color:      '#EF4444',
  },
  descricao: {
    margin:     '4px 0 0',
    fontSize:   '13px',
    color:      '#64748B',
    lineHeight: 1.6,
  },
  syncBanner: {
    display:         'flex',
    alignItems:      'center',
    gap:             '8px',
    padding:         '10px 14px',
    backgroundColor: '#FEF3C7',
    border:          '1px solid #FDE68A',
    borderRadius:    '10px',
    fontSize:        '13px',
    color:           '#92400E',
    fontWeight:      '600',
    width:           '100%',
    boxSizing:       'border-box',
  },
  acoesSection: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '10px',
    width:         '100%',
  },
  acoesLabel: {
    margin:        '0 0 2px 2px',
    fontSize:      '11px',
    fontWeight:    '700',
    color:         '#94A3B8',
    letterSpacing: '1.2px',
    textTransform: 'uppercase',
  },
  btnPrimario: {
    display:         'flex',
    alignItems:      'center',
    gap:             '14px',
    padding:         '16px',
    backgroundColor: '#20643F',
    border:          'none',
    borderRadius:    '14px',
    cursor:          'pointer',
    fontFamily:      'inherit',
    width:           '100%',
    textAlign:       'left',
    WebkitTapHighlightColor: 'transparent',
  },
  btnIcone: {
    width:           '44px',
    height:          '44px',
    borderRadius:    '10px',
    backgroundColor: 'rgba(255,255,255,0.15)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  btnTextos: {
    flex:          1,
    display:       'flex',
    flexDirection: 'column',
    gap:           '2px',
    minWidth:      0,
  },
  btnTitulo: {
    fontSize:   '15px',
    fontWeight: '700',
    color:      '#FFFFFF',
    lineHeight: 1.3,
  },
  btnSub: {
    fontSize:   '12px',
    color:      'rgba(255,255,255,0.65)',
    lineHeight: 1.4,
  },
  nota: {
    margin:     0,
    fontSize:   '12px',
    color:      '#94A3B8',
    textAlign:  'center',
    lineHeight: 1.5,
  },
};