-- ============================================================
-- SGM Águia — schema_historico_os.sql
-- Tabela de Histórico de O.S. + Triggers automáticos
-- Execute no Supabase SQL Editor (após schema.sql e schema_notification.sql)
-- ============================================================

-- ─── 1. TABELA historico_os ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.historico_os (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  os_id         UUID        NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  usuario_id    UUID        REFERENCES public.usuarios(id) ON DELETE SET NULL,
  acao          TEXT        NOT NULL CHECK (acao IN (
                              'criada',
                              'atualizada',
                              'concluida',
                              'cancelada',
                              'peca_adicionada',
                              'reaberta'
                            )),
  descricao     TEXT,
  data_registro TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.historico_os IS 'Linha do tempo auditável de cada Ordem de Serviço.';
COMMENT ON COLUMN public.historico_os.acao IS 'criada | atualizada | concluida | cancelada | peca_adicionada | reaberta';

-- ─── 2. ÍNDICES ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_historico_os_os_id
  ON public.historico_os(os_id);
CREATE INDEX IF NOT EXISTS idx_historico_os_data
  ON public.historico_os(data_registro DESC);

-- ─── 3. ROW LEVEL SECURITY ─────────────────────────────────────────────────
ALTER TABLE public.historico_os ENABLE ROW LEVEL SECURITY;

-- SuperAdmin vê todo histórico
DROP POLICY IF EXISTS "historico_os_select_admin"   ON public.historico_os;
CREATE POLICY "historico_os_select_admin" ON public.historico_os
  FOR SELECT USING (public.fn_get_minha_role() = 'superadmin');

-- Mecânico vê apenas histórico das suas próprias OS
DROP POLICY IF EXISTS "historico_os_select_mecanico" ON public.historico_os;
CREATE POLICY "historico_os_select_mecanico" ON public.historico_os
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.ordens_servico os
      WHERE os.id = os_id
        AND os.mecanico_id = auth.uid()
    )
  );

-- Qualquer autenticado pode inserir (o frontend e triggers fazem isso)
DROP POLICY IF EXISTS "historico_os_insert_auth" ON public.historico_os;
CREATE POLICY "historico_os_insert_auth" ON public.historico_os
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);


-- ============================================================
-- 4. TRIGGER — LOG AUTOMÁTICO NA CRIAÇÃO DA O.S.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_log_os_criada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_mecanico_nome TEXT;
  v_equip_nome    TEXT;
BEGIN
  SELECT nome_completo INTO v_mecanico_nome
    FROM public.usuarios WHERE id = NEW.mecanico_id;
  SELECT nome INTO v_equip_nome
    FROM public.equipamentos WHERE id = NEW.equipamento_id;

  INSERT INTO public.historico_os(os_id, usuario_id, acao, descricao)
  VALUES (
    NEW.id,
    NEW.mecanico_id,
    'criada',
    'O.S. aberta por ' || COALESCE(v_mecanico_nome, '—') ||
    '. Equipamento: ' || COALESCE(v_equip_nome, '—') ||
    '. Solicitante: ' || COALESCE(NEW.solicitante, '—') || '.'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_os_criada ON public.ordens_servico;
CREATE TRIGGER trg_log_os_criada
  AFTER INSERT ON public.ordens_servico
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_os_criada();


-- ============================================================
-- 5. TRIGGER — LOG AUTOMÁTICO NA MUDANÇA DE STATUS DA O.S.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_log_os_status_mudanca()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_duracao_seg BIGINT;
  v_desc        TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'concluida' AND NEW.fim_em IS NOT NULL AND NEW.inicio_em IS NOT NULL THEN
    v_duracao_seg := EXTRACT(EPOCH FROM (NEW.fim_em - NEW.inicio_em))::BIGINT;
    v_desc := 'O.S. finalizada. Duração total: ' ||
      (v_duracao_seg / 3600)::INT || 'h ' ||
      ((v_duracao_seg % 3600) / 60)::INT || 'm ' ||
      (v_duracao_seg % 60)::INT || 's.';
  ELSIF NEW.status = 'cancelada' THEN
    v_desc := 'O.S. cancelada pelo administrador.';
  ELSE
    v_desc := 'Status alterado para: ' || NEW.status || '.';
  END IF;

  INSERT INTO public.historico_os(os_id, usuario_id, acao, descricao)
  VALUES (
    NEW.id,
    auth.uid(),
    CASE NEW.status
      WHEN 'concluida' THEN 'concluida'
      WHEN 'cancelada' THEN 'cancelada'
      ELSE 'atualizada'
    END,
    v_desc
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_os_status_mudanca ON public.ordens_servico;
CREATE TRIGGER trg_log_os_status_mudanca
  AFTER UPDATE OF status ON public.ordens_servico
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_os_status_mudanca();


-- ============================================================
-- 6. TRIGGER — NOTIFICAÇÃO AO ADMIN QUANDO O.S. FOR ATUALIZADA
--    (campos técnicos: causa, servicos_executados, obs)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_notif_os_atualizada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  admin_rec  RECORD;
  equip_nome TEXT;
BEGIN
  -- Só dispara se algum campo técnico realmente mudou e a OS está em andamento
  IF NOT (
    NEW.causa                IS DISTINCT FROM OLD.causa OR
    NEW.servicos_executados  IS DISTINCT FROM OLD.servicos_executados OR
    NEW.obs                  IS DISTINCT FROM OLD.obs
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'em_andamento' THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO equip_nome FROM public.equipamentos WHERE id = NEW.equipamento_id;

  FOR admin_rec IN
    SELECT id FROM public.usuarios WHERE role = 'superadmin'
  LOOP
    INSERT INTO public.notificacoes(user_id, titulo, mensagem, link, tipo)
    VALUES (
      admin_rec.id,
      'O.S. Atualizada',
      COALESCE(equip_nome, '—') || ' · Campos técnicos atualizados pelo mecânico',
      '/corretivas/' || NEW.id::text,
      'os_atualizada'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_os_atualizada ON public.ordens_servico;
CREATE TRIGGER trg_notif_os_atualizada
  AFTER UPDATE ON public.ordens_servico
  FOR EACH ROW EXECUTE FUNCTION public.fn_notif_os_atualizada();


-- ============================================================
-- 7. FUNÇÃO UTILITÁRIA: fn_email_por_cpf
--    (caso ainda não exista no banco — necessária para o login por CPF)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_email_por_cpf(p_cpf TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT email FROM public.usuarios WHERE cpf = p_cpf LIMIT 1;
$$;


-- ============================================================
-- FIM DO SCRIPT
-- ============================================================
