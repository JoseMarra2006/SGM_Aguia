// src/components/common/CardEquipamento.jsx

import { useNavigate } from 'react-router-dom';

/**
 * CardEquipamento — Card reutilizável para listagem de equipamentos.
 *
 * @param {Object}  props
 * @param {string}  props.id
 * @param {string}  props.nome
 * @param {string}  props.descricao
 * @param {'em_operacao'|'em_manutencao'} props.status
 * @param {string[]} props.imagens_urls
 * @param {number}  [props.index]        - Para animação escalonada na listagem
 * @param {boolean} [props.compact]      - Variante menor para uso em outros módulos
 */
export default function CardEquipamento({
  id,
  nome,
  descricao,
  status,
  imagens_urls = [],
  index = 0,
  compact = false,
}) {
  const navigate = useNavigate();
  const coverImage = imagens_urls?.[0] ?? null;
  const isManutencao = status === 'em_manutencao';

  return (
    <article
      onClick={() => navigate(`/equipamentos/${id}`)}
      style={{
        ...S.card,
        animationDelay: `${index * 60}ms`,
        ...(compact ? S.cardCompact : {}),
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/equipamentos/${id}`)}
      aria-label={`Ver detalhes de ${nome}`}
    >
      {/* Imagem de capa */}
      <div style={compact ? S.imageWrapperCompact : S.imageWrapper}>
        {coverImage ? (
          <img
            src={coverImage}
            alt={nome}
            style={S.image}
            loading="lazy"
          />
        ) : (
          <div style={S.imagePlaceholder}>
            <GearIcon size={compact ? 28 : 40} color="#3D5A73" />
          </div>
        )}

        {/* Badge de status — sobreposto na imagem */}
        <span style={{ ...S.statusBadge, ...(isManutencao ? S.badgeManutencao : S.badgeOperacao) }}>
          <span style={S.statusDot} />
          {isManutencao ? 'Em manutenção' : 'Em operação'}
        </span>

        {/* Indicador de galeria */}
        {imagens_urls.length > 1 && (
          <span style={S.galleryCount}>
            <CameraIcon size={11} />
            {imagens_urls.length}
          </span>
        )}
      </div>

      {/* Conteúdo textual */}
      <div style={S.body}>
        <h3 style={compact ? S.nameCompact : S.name}>{nome}</h3>
        {!compact && descricao && (
          <p style={S.description}>{descricao}</p>
        )}
        <div style={S.footer}>
          <span style={S.detailLink}>
            Ver detalhes
            <ChevronIcon />
          </span>
        </div>
      </div>
    </article>
  );
}

// ─── Ícones inline (sem dependência externa) ──────────────────

function GearIcon({ size = 40, color = '#3D5A73' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke={color} strokeWidth="1.5"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 4 }}>
      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function CameraIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

// ─── Estilos ──────────────────────────────────────────────────
const S = {
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: '14px',
    overflow: 'hidden',
    border: '1px solid #E8EDF2',
    cursor: 'pointer',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
    animation: 'cardFadeIn 0.35s ease both',
    WebkitTapHighlightColor: 'transparent',
    outline: 'none',
  },
  cardCompact: {
    display: 'flex',
    flexDirection: 'row',
    borderRadius: '10px',
  },
  imageWrapper: {
    position: 'relative',
    height: '160px',
    backgroundColor: '#EDF2F7',
    overflow: 'hidden',
  },
  imageWrapperCompact: {
    position: 'relative',
    width: '90px',
    flexShrink: 0,
    backgroundColor: '#EDF2F7',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'transform 0.3s ease',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #EDF2F7 0%, #E2EBF3 100%)',
  },
  statusBadge: {
    position: 'absolute',
    top: '10px',
    left: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '4px 10px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.3px',
    backdropFilter: 'blur(8px)',
  },
  badgeOperacao: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#065F46',
    border: '1px solid rgba(16,185,129,0.3)',
  },
  badgeManutencao: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    color: '#92400E',
    border: '1px solid rgba(245,158,11,0.35)',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'currentColor',
    display: 'inline-block',
  },
  galleryCount: {
    position: 'absolute',
    bottom: '10px',
    right: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '20px',
    backgroundColor: 'rgba(0,0,0,0.5)',
    color: '#FFFFFF',
    fontSize: '11px',
    fontWeight: '600',
  },
  body: {
    padding: '16px',
  },
  name: {
    margin: '0 0 6px 0',
    fontSize: '16px',
    fontWeight: '700',
    color: '#0D1B2A',
    letterSpacing: '-0.2px',
    lineHeight: 1.3,
    fontFamily: "'DM Sans', sans-serif",
  },
  nameCompact: {
    margin: '0 0 4px 0',
    fontSize: '14px',
    fontWeight: '700',
    color: '#0D1B2A',
    letterSpacing: '-0.1px',
    lineHeight: 1.3,
    fontFamily: "'DM Sans', sans-serif",
  },
  description: {
    margin: '0 0 12px 0',
    fontSize: '13px',
    color: '#64748B',
    lineHeight: 1.55,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  detailLink: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
    fontWeight: '600',
    color: '#0F4C81',
    letterSpacing: '0.2px',
  },
};