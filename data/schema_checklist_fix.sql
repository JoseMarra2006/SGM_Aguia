-- ============================================================
-- SGM Águia — schema_checklist_fix.sql
-- CORREÇÃO CRÍTICA: Status do agendamento após conclusão de checklist
--
-- CAUSA RAIZ: A política RLS "agend_update_superadmin" bloqueava
-- silenciosamente o UPDATE em agendamentos_preventivos feito pelo
-- mecânico (retornava 0 linhas sem lançar erro). O frontend
-- interpretava isso como sucesso e exibia TelaConcluido, mas o banco
-- permanecia com status:'pendente'. Ao recarregar a listagem, o
-- registro reaparecia como pendente.
--
-- SOLUÇÃO: Triggers com SECURITY DEFINER que atualizam
-- agendamentos_preventivos de forma atômica, independente de quem
-- disparou o evento no checklists. O banco passa a ser a fonte
-- de verdade para transições de estado.
--
-- Execute no Supabase SQL Editor APÓS schema.sql e schema_notification.sql
-- ============================================================


-- ─── 1. Coluna itens_checklist (ausente do schema original) ────────────────
ALTER TABLE public.agendamentos_preventivos
  ADD COLUMN IF NOT EXISTS itens_checklist TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.agendamentos_preventivos.itens_checklist
  IS 'Itens de checklist definidos pelo SuperAdmin para cada preventiva.';


-- ─── 2. Corrige fn_marcar_equipamento_em_manutencao ─────────────────────────
--        Sem SECURITY DEFINER a função rodava como o usuário chamador
--        (mecânico) e era bloqueada pela política equipamentos_update_superadmin.
CREATE OR REPLACE FUNCTION public.fn_marcar_equipamento_em_manutencao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_equipamento_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'ordens_servico' THEN
        v_equipamento_id := NEW.equipamento_id;
    END IF;

    IF TG_TABLE_NAME = 'checklists' THEN
        SELECT equipamento_id INTO v_equipamento_id
        FROM public.agendamentos_preventivos
        WHERE id = NEW.agendamento_id;
    END IF;

    UPDATE public.equipamentos
    SET status = 'em_manutencao'
    WHERE id = v_equipamento_id;

    RETURN NEW;
END;
$$;


-- ─── 3. Corrige fn_liberar_equipamento ──────────────────────────────────────
--        Mesmo problema: sem SECURITY DEFINER, o UPDATE em equipamentos
--        era bloqueado pelo RLS quando disparado por mecânico.
CREATE OR REPLACE FUNCTION public.fn_liberar_equipamento()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_equipamento_id UUID;
    v_os_ativas      INTEGER;
    v_chk_ativos     INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'ordens_servico' THEN
        v_equipamento_id := NEW.equipamento_id;
    END IF;

    IF TG_TABLE_NAME = 'checklists' THEN
        SELECT equipamento_id INTO v_equipamento_id
        FROM public.agendamentos_preventivos
        WHERE id = NEW.agendamento_id;
    END IF;

    SELECT COUNT(*) INTO v_os_ativas
    FROM public.ordens_servico
    WHERE equipamento_id = v_equipamento_id
      AND status = 'em_andamento';

    SELECT COUNT(*) INTO v_chk_ativos
    FROM public.checklists c
    JOIN public.agendamentos_preventivos ap ON ap.id = c.agendamento_id
    WHERE ap.equipamento_id = v_equipamento_id
      AND c.fim_em IS NULL;

    IF v_os_ativas = 0 AND v_chk_ativos = 0 THEN
        UPDATE public.equipamentos
        SET status = 'em_operacao'
        WHERE id = v_equipamento_id;
    END IF;

    RETURN NEW;
END;
$$;


-- ─── 4. Nova função: transição automática de status do agendamento ───────────
--
--  Dispara em INSERT na tabela checklists (SECURITY DEFINER).
--  Dois cenários cobertos:
--    a) INSERT com fim_em = NULL  → online iniciar()  → 'em_andamento'
--    b) INSERT com fim_em IS NOT NULL → sync offline  → 'concluido' direto
--       (o mecânico sincroniza o checklist já finalizado; sem este caso
--        o agendamento ficaria preso em 'pendente' após o sync.)
--
CREATE OR REPLACE FUNCTION public.fn_auto_status_agendamento_por_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.fim_em IS NOT NULL THEN
        -- Caso offline: checklist inserido já concluído — vai direto para 'concluido'
        UPDATE public.agendamentos_preventivos
        SET   status       = 'concluido',
              atualizado_em = NOW()
        WHERE id = NEW.agendamento_id;
    ELSE
        -- Caso online normal: inicio do checklist — marca como 'em_andamento'
        UPDATE public.agendamentos_preventivos
        SET   status       = 'em_andamento',
              atualizado_em = NOW()
        WHERE id     = NEW.agendamento_id
          AND status = 'pendente';   -- idempotente: só avança se ainda pendente
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_status_agendamento_por_insert ON public.checklists;
CREATE TRIGGER trg_auto_status_agendamento_por_insert
    AFTER INSERT ON public.checklists
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auto_status_agendamento_por_insert();

COMMENT ON FUNCTION public.fn_auto_status_agendamento_por_insert()
  IS 'SECURITY DEFINER: garante transição de status do agendamento ao criar checklist, independente do role do chamador.';


-- ─── 5. Nova função: conclusão automática do agendamento ────────────────────
--
--  FIX PRINCIPAL — dispara em UPDATE OF fim_em na tabela checklists
--  (SECURITY DEFINER).
--
--  Quando o mecânico chama finalizar() online:
--    1. Atualiza checklists.fim_em → este trigger dispara
--    2. Trigger atualiza agendamentos_preventivos.status → 'concluido'
--         mesmo que o frontend não tenha permissão RLS para fazê-lo.
--
--  Sem este trigger, o UPDATE direto do frontend era silenciosamente
--  bloqueado pela política "agend_update_superadmin" (0 rows, sem erro).
--
CREATE OR REPLACE FUNCTION public.fn_auto_concluir_agendamento()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Só age quando fim_em muda de NULL para um valor (conclusão real)
    IF NEW.fim_em IS NOT NULL AND OLD.fim_em IS NULL THEN
        UPDATE public.agendamentos_preventivos
        SET   status       = 'concluido',
              atualizado_em = NOW()
        WHERE id     = NEW.agendamento_id
          AND status != 'concluido';   -- idempotente: não regredi estado
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_concluir_agendamento ON public.checklists;
CREATE TRIGGER trg_auto_concluir_agendamento
    AFTER UPDATE OF fim_em ON public.checklists
    FOR EACH ROW
    WHEN (NEW.fim_em IS NOT NULL AND OLD.fim_em IS NULL)
    EXECUTE FUNCTION public.fn_auto_concluir_agendamento();

COMMENT ON FUNCTION public.fn_auto_concluir_agendamento()
  IS 'SECURITY DEFINER: garante que agendamento vá para concluido quando checklist.fim_em é preenchido, independente do role do chamador.';


-- ─── 6. Política RLS complementar: mecânico pode avançar status ─────────────
--
--  Camada adicional de defesa em profundidade.
--  Os triggers acima (itens 4 e 5) são a correção primária e suficiente.
--  Esta política garante que chamadas diretas do frontend também funcionem
--  corretamente caso os triggers sejam removidos futuramente.
--
--  Restrições:
--    - USING: mecânico só pode ver/editar agendamentos onde é responsável
--    - WITH CHECK: mecânico só pode definir status 'em_andamento' ou 'concluido'
--      (não pode cancelar, não pode regredir para 'pendente')
--
DROP POLICY IF EXISTS "agend_update_mecanico" ON public.agendamentos_preventivos;
CREATE POLICY "agend_update_mecanico" ON public.agendamentos_preventivos
    FOR UPDATE
    USING  (mecanico_id = auth.uid())
    WITH CHECK (
        mecanico_id = auth.uid()
        AND status IN ('em_andamento', 'concluido')
    );

COMMENT ON POLICY "agend_update_mecanico" ON public.agendamentos_preventivos
  IS 'Permite ao mecânico responsável avançar o status do seu próprio agendamento para em_andamento ou concluido.';


-- ============================================================
-- VERIFICAÇÃO RÁPIDA (executar separadamente se quiser conferir)
-- ============================================================
-- SELECT tgname, tgenabled, proname, prosecdef
-- FROM pg_trigger t
-- JOIN pg_proc p ON t.tgfoid = p.oid
-- WHERE tgrelid = 'public.checklists'::regclass
-- ORDER BY tgname;
-- ============================================================
-- FIM DO SCRIPT DE CORREÇÃO
-- ============================================================
