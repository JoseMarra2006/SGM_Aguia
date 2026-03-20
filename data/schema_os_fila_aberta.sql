-- ============================================================
-- SGM Águia — schema_os_fila_aberta.sql  (v2 — com correções de conflito)
-- MIGRAÇÃO: Modelo de Fila Aberta para Ordens de Serviço
--
-- Executar APÓS schema.sql, schema_checklist_fix.sql,
-- schema_notification.sql e schema_historico_os.sql
-- ============================================================


-- ─── 1. mecanico_id passa a NULLABLE ─────────────────────────────────────────
ALTER TABLE public.ordens_servico
  ALTER COLUMN mecanico_id DROP NOT NULL;


-- ─── 2. Colunas aberto_por e finalizado_por ───────────────────────────────────
ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS aberto_por     UUID
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS finalizado_por UUID
    REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ordens_servico.aberto_por
  IS 'Usuário que abriu a O.S. Preenchido automaticamente no frontend.';
COMMENT ON COLUMN public.ordens_servico.finalizado_por
  IS 'Usuário que concluiu ou cancelou a O.S. Preenchido automaticamente no frontend.';

CREATE INDEX IF NOT EXISTS idx_os_aberto_por
  ON public.ordens_servico(aberto_por);
CREATE INDEX IF NOT EXISTS idx_os_finalizado_por
  ON public.ordens_servico(finalizado_por);


-- ═══════════════════════════════════════════════════════════════
-- 3. RLS — ordens_servico
--    Fila aberta: qualquer autenticado vê, abre e edita O.S.
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "os_select"                  ON public.ordens_servico;
DROP POLICY IF EXISTS "os_insert_mecanico"         ON public.ordens_servico;
DROP POLICY IF EXISTS "os_update_proprio_ou_admin" ON public.ordens_servico;

CREATE POLICY "os_select_auth" ON public.ordens_servico
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "os_insert_auth" ON public.ordens_servico
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "os_update_auth" ON public.ordens_servico
  FOR UPDATE USING (auth.uid() IS NOT NULL);


-- ═══════════════════════════════════════════════════════════════
-- 4. RLS — os_pecas_utilizadas  [CORREÇÃO DE CONFLITO #1]
--    Política antiga filtrava por mecanico_id = auth.uid(),
--    que agora é NULL em todas as novas O.S. Resultado: nenhum
--    mecânico conseguia adicionar ou ver peças. Corrigido para
--    verificar apenas que o usuário está autenticado.
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "os_pecas_select"           ON public.os_pecas_utilizadas;
DROP POLICY IF EXISTS "os_pecas_insert"           ON public.os_pecas_utilizadas;
DROP POLICY IF EXISTS "os_pecas_delete_superadmin" ON public.os_pecas_utilizadas;

CREATE POLICY "os_pecas_select_auth" ON public.os_pecas_utilizadas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.ordens_servico os
      WHERE os.id = ordem_servico_id
        AND auth.uid() IS NOT NULL
    )
  );

CREATE POLICY "os_pecas_insert_auth" ON public.os_pecas_utilizadas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ordens_servico os
      WHERE os.id = ordem_servico_id
        AND auth.uid() IS NOT NULL
    )
  );

CREATE POLICY "os_pecas_delete_superadmin" ON public.os_pecas_utilizadas
  FOR DELETE USING (public.fn_get_minha_role() = 'superadmin');


-- ═══════════════════════════════════════════════════════════════
-- 5. RLS — historico_os  [CORREÇÃO DE CONFLITO #2]
--    Política "historico_os_select_mecanico" filtrava por
--    mecanico_id = auth.uid(). Com fila aberta, mecânicos não
--    veriam o histórico de nenhuma O.S. Corrigido para qualquer
--    autenticado ver o histórico de qualquer O.S.
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "historico_os_select_mecanico" ON public.historico_os;

CREATE POLICY "historico_os_select_mecanico" ON public.historico_os
  FOR SELECT USING (
    -- superadmin: regra própria já existente (historico_os_select_admin)
    -- mecânico/admin: vê histórico de qualquer O.S. (fila aberta)
    auth.uid() IS NOT NULL
  );


-- ═══════════════════════════════════════════════════════════════
-- 6. Triggers de LOG atualizados
--    Usa aberto_por/finalizado_por em vez de mecanico_id
-- ═══════════════════════════════════════════════════════════════

-- 6a. Log na criação
CREATE OR REPLACE FUNCTION public.fn_log_os_criada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_aberto_nome TEXT;
  v_equip_nome  TEXT;
BEGIN
  SELECT nome_completo INTO v_aberto_nome
    FROM public.usuarios
    WHERE id = COALESCE(NEW.aberto_por, NEW.mecanico_id);
  SELECT nome INTO v_equip_nome
    FROM public.equipamentos WHERE id = NEW.equipamento_id;

  INSERT INTO public.historico_os(os_id, usuario_id, acao, descricao)
  VALUES (
    NEW.id,
    COALESCE(NEW.aberto_por, NEW.mecanico_id),
    'criada',
    'O.S. aberta por ' || COALESCE(v_aberto_nome, '—') ||
    '. Solicitante: ' || COALESCE(NEW.solicitante, '—') ||
    '. Equipamento: ' || COALESCE(v_equip_nome, '—') || '.'
  );
  RETURN NEW;
END;
$$;

-- 6b. Log na mudança de status
CREATE OR REPLACE FUNCTION public.fn_log_os_status_mudanca()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_duracao_seg BIGINT;
  v_desc        TEXT;
  v_usuario_id  UUID;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_usuario_id := CASE
    WHEN NEW.status IN ('concluida', 'cancelada')
      THEN COALESCE(NEW.finalizado_por, auth.uid())
    ELSE auth.uid()
  END;

  IF NEW.status = 'concluida' AND NEW.fim_em IS NOT NULL AND NEW.inicio_em IS NOT NULL THEN
    v_duracao_seg := EXTRACT(EPOCH FROM (NEW.fim_em - NEW.inicio_em))::BIGINT;
    v_desc := 'O.S. finalizada. Duração total: ' ||
      (v_duracao_seg / 3600)::INT || 'h ' ||
      ((v_duracao_seg % 3600) / 60)::INT || 'm ' ||
      (v_duracao_seg % 60)::INT || 's.';
  ELSIF NEW.status = 'cancelada' THEN
    v_desc := 'O.S. cancelada.';
  ELSE
    v_desc := 'Status alterado para: ' || NEW.status || '.';
  END IF;

  INSERT INTO public.historico_os(os_id, usuario_id, acao, descricao)
  VALUES (
    NEW.id,
    v_usuario_id,
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


-- ═══════════════════════════════════════════════════════════════
-- 7. Triggers de NOTIFICAÇÃO atualizados
--    Novas mensagens: "X abriu uma O.S. solicitada por Y"
--                     "Z finalizou a O.S. do equipamento W"
-- ═══════════════════════════════════════════════════════════════

-- 7a. OS aberta
CREATE OR REPLACE FUNCTION fn_notif_os_aberta()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  admin_rec   RECORD;
  equip_nome  TEXT;
  aberto_nome TEXT;
BEGIN
  SELECT nome INTO equip_nome FROM equipamentos WHERE id = NEW.equipamento_id;
  SELECT nome_completo INTO aberto_nome
    FROM usuarios WHERE id = COALESCE(NEW.aberto_por, NEW.mecanico_id);

  FOR admin_rec IN SELECT id FROM usuarios WHERE role = 'superadmin'
  LOOP
    INSERT INTO notificacoes(user_id, titulo, mensagem, link, tipo)
    VALUES (
      admin_rec.id,
      'Nova OS Aberta',
      COALESCE(aberto_nome, '—') ||
        ' abriu uma O.S. solicitada por ' ||
        COALESCE(NEW.solicitante, '—') ||
        ' · ' || COALESCE(equip_nome, '—'),
      '/corretivas/' || NEW.id::text,
      'os_aberta'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

-- 7b. OS concluída
CREATE OR REPLACE FUNCTION fn_notif_os_concluida()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  admin_rec       RECORD;
  equip_nome      TEXT;
  finalizado_nome TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.status <> 'concluida' THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO equip_nome FROM equipamentos WHERE id = NEW.equipamento_id;
  SELECT nome_completo INTO finalizado_nome
    FROM usuarios
    WHERE id = COALESCE(NEW.finalizado_por, NEW.mecanico_id);

  FOR admin_rec IN SELECT id FROM usuarios WHERE role = 'superadmin'
  LOOP
    INSERT INTO notificacoes(user_id, titulo, mensagem, link, tipo)
    VALUES (
      admin_rec.id,
      'OS Finalizada',
      COALESCE(finalizado_nome, '—') ||
        ' finalizou a O.S. do equipamento ' ||
        COALESCE(equip_nome, '—'),
      '/corretivas/' || NEW.id::text,
      'os_concluida'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

-- 7c. OS atualizada (campos técnicos)
CREATE OR REPLACE FUNCTION public.fn_notif_os_atualizada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  admin_rec  RECORD;
  equip_nome TEXT;
BEGIN
  IF NOT (
    NEW.causa               IS DISTINCT FROM OLD.causa OR
    NEW.servicos_executados IS DISTINCT FROM OLD.servicos_executados OR
    NEW.obs                 IS DISTINCT FROM OLD.obs
  ) THEN RETURN NEW; END IF;

  IF NEW.status <> 'em_andamento' THEN RETURN NEW; END IF;

  SELECT nome INTO equip_nome FROM public.equipamentos WHERE id = NEW.equipamento_id;

  FOR admin_rec IN SELECT id FROM public.usuarios WHERE role = 'superadmin'
  LOOP
    INSERT INTO public.notificacoes(user_id, titulo, mensagem, link, tipo)
    VALUES (
      admin_rec.id,
      'O.S. Atualizada',
      COALESCE(equip_nome, '—') || ' · Campos técnicos atualizados',
      '/corretivas/' || NEW.id::text,
      'os_atualizada'
    );
  END LOOP;
  RETURN NEW;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 8. Backfill: OS existentes herdam aberto_por de mecanico_id
-- ═══════════════════════════════════════════════════════════════
UPDATE public.ordens_servico
  SET aberto_por = mecanico_id
  WHERE aberto_por IS NULL AND mecanico_id IS NOT NULL;


-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
