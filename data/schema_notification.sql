-- ═══════════════════════════════════════════════════════════════
-- SGM Águia — schema.sql
-- Tabela de Notificações + Triggers automáticos
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. TABELA notificacoes ────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificacoes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo     TEXT        NOT NULL,
  mensagem   TEXT        NOT NULL,
  lida       BOOLEAN     NOT NULL DEFAULT FALSE,
  link       TEXT,
  tipo       TEXT        NOT NULL DEFAULT 'geral',
  -- tipos possíveis:
  --   'os_aberta' | 'os_concluida'
  --   'preventiva_concluida' | 'preventiva_agendada' | 'preventiva_lembrete'
  --   'geral'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. ÍNDICES ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notificacoes_user_lida
  ON notificacoes(user_id, lida);
CREATE INDEX IF NOT EXISTS idx_notificacoes_created_at
  ON notificacoes(created_at DESC);

-- ─── 3. ROW LEVEL SECURITY ─────────────────────────────────────
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notificacoes_select_own" ON notificacoes;
CREATE POLICY "notificacoes_select_own" ON notificacoes
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notificacoes_update_own" ON notificacoes;
CREATE POLICY "notificacoes_update_own" ON notificacoes
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notificacoes_insert_auth" ON notificacoes;
CREATE POLICY "notificacoes_insert_auth" ON notificacoes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Habilitar Realtime (necessário para subscription no front)
ALTER PUBLICATION supabase_realtime ADD TABLE notificacoes;


-- ═══════════════════════════════════════════════════════════════
-- 4. TRIGGER — OS ABERTA (notifica todos os SuperAdmins)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_notif_os_aberta()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  admin_rec  RECORD;
  equip_nome TEXT;
BEGIN
  SELECT nome INTO equip_nome FROM equipamentos WHERE id = NEW.equipamento_id;
  FOR admin_rec IN
    SELECT id FROM usuarios WHERE role = 'superadmin'
  LOOP
    INSERT INTO notificacoes(user_id, titulo, mensagem, link, tipo)
    VALUES (
      admin_rec.id,
      'Nova OS Aberta',
      COALESCE(equip_nome, '—') || ' · ' || LEFT(COALESCE(NEW.problema, ''), 80),
      '/corretivas/' || NEW.id::text,
      'os_aberta'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_os_aberta ON ordens_servico;
CREATE TRIGGER trg_notif_os_aberta
  AFTER INSERT ON ordens_servico
  FOR EACH ROW EXECUTE FUNCTION fn_notif_os_aberta();


-- ═══════════════════════════════════════════════════════════════
-- 5. TRIGGER — OS CONCLUÍDA (notifica todos os SuperAdmins)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_notif_os_concluida()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  admin_rec  RECORD;
  equip_nome TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.status <> 'concluida' THEN
    RETURN NEW;
  END IF;
  SELECT nome INTO equip_nome FROM equipamentos WHERE id = NEW.equipamento_id;
  FOR admin_rec IN
    SELECT id FROM usuarios WHERE role = 'superadmin'
  LOOP
    INSERT INTO notificacoes(user_id, titulo, mensagem, link, tipo)
    VALUES (
      admin_rec.id,
      'OS Finalizada',
      COALESCE(equip_nome, '—'),
      '/corretivas/' || NEW.id::text,
      'os_concluida'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_os_concluida ON ordens_servico;
CREATE TRIGGER trg_notif_os_concluida
  AFTER UPDATE ON ordens_servico
  FOR EACH ROW EXECUTE FUNCTION fn_notif_os_concluida();


-- ═══════════════════════════════════════════════════════════════
-- 6. TRIGGER — PREVENTIVA CONCLUÍDA (notifica todos os SuperAdmins)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_notif_preventiva_concluida()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  admin_rec  RECORD;
  equip_nome TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.status <> 'concluido' THEN
    RETURN NEW;
  END IF;
  SELECT e.nome INTO equip_nome FROM equipamentos e WHERE e.id = NEW.equipamento_id;
  FOR admin_rec IN
    SELECT id FROM usuarios WHERE role = 'superadmin'
  LOOP
    INSERT INTO notificacoes(user_id, titulo, mensagem, link, tipo)
    VALUES (
      admin_rec.id,
      'Preventiva Concluída',
      COALESCE(equip_nome, '—') || ' · ' || TO_CHAR(NEW.data_agendada, 'DD/MM/YYYY'),
      '/preventivas/' || NEW.id::text || '/checklist',
      'preventiva_concluida'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_preventiva_concluida ON agendamentos_preventivos;
CREATE TRIGGER trg_notif_preventiva_concluida
  AFTER UPDATE ON agendamentos_preventivos
  FOR EACH ROW EXECUTE FUNCTION fn_notif_preventiva_concluida();


-- ═══════════════════════════════════════════════════════════════
-- 7. TRIGGER — PREVENTIVA AGENDADA (notifica o mecânico responsável)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_notif_preventiva_agendada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  equip_nome TEXT;
BEGIN
  SELECT nome INTO equip_nome FROM equipamentos WHERE id = NEW.equipamento_id;
  INSERT INTO notificacoes(user_id, titulo, mensagem, link, tipo)
  VALUES (
    NEW.mecanico_id,
    'Nova Preventiva Agendada',
    COALESCE(equip_nome, '—') || ' · ' || TO_CHAR(NEW.data_agendada, 'DD/MM/YYYY'),
    '/preventivas/' || NEW.id::text || '/checklist',
    'preventiva_agendada'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_preventiva_agendada ON agendamentos_preventivos;
CREATE TRIGGER trg_notif_preventiva_agendada
  AFTER INSERT ON agendamentos_preventivos
  FOR EACH ROW EXECUTE FUNCTION fn_notif_preventiva_agendada();


-- ═══════════════════════════════════════════════════════════════
-- 8. FUNÇÃO — LEMBRETES 3 DIAS ANTES
--
--  Ativar pg_cron no Dashboard → Database → Extensions → pg_cron
--  Depois registrar o cron job:
--
--    SELECT cron.schedule(
--      'lembretes-preventivas',
--      '0 8 * * *',                           -- diariamente às 08h UTC
--      'SELECT fn_enviar_lembretes_preventivas()'
--    );
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_enviar_lembretes_preventivas()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  ag_rec    RECORD;
  ja_existe BOOLEAN;
  total     INTEGER := 0;
BEGIN
  FOR ag_rec IN
    SELECT ap.id, ap.mecanico_id, ap.data_agendada, e.nome AS equip_nome
    FROM   agendamentos_preventivos ap
    JOIN   equipamentos e ON e.id = ap.equipamento_id
    WHERE  ap.status = 'pendente'
      AND  ap.data_agendada = CURRENT_DATE + INTERVAL '3 days'
  LOOP
    -- Idempotência: ignora se lembrete já foi enviado hoje para este agendamento
    SELECT EXISTS(
      SELECT 1 FROM notificacoes
      WHERE  user_id = ag_rec.mecanico_id
        AND  tipo    = 'preventiva_lembrete'
        AND  link    = '/preventivas/' || ag_rec.id::text || '/checklist'
        AND  created_at::date = CURRENT_DATE
    ) INTO ja_existe;

    IF NOT ja_existe THEN
      INSERT INTO notificacoes(user_id, titulo, mensagem, link, tipo)
      VALUES (
        ag_rec.mecanico_id,
        'Preventiva em 3 dias',
        ag_rec.equip_nome || ' · ' || TO_CHAR(ag_rec.data_agendada, 'DD/MM/YYYY'),
        '/preventivas/' || ag_rec.id::text || '/checklist',
        'preventiva_lembrete'
      );
      total := total + 1;
    END IF;
  END LOOP;
  RETURN total;
END;
$$;
