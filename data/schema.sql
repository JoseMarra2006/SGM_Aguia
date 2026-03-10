-- ============================================================
-- MANUTENÇÃO INDUSTRIAL - SCRIPT COMPLETO DE BANCO DE DADOS
-- Supabase / PostgreSQL
-- Executar no SQL Editor do Supabase (em ordem)
-- ============================================================

-- ============================================================
-- 0. EXTENSÕES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- 1. TABELA: usuarios
-- Estende auth.users do Supabase com dados adicionais
-- ============================================================
CREATE TABLE public.usuarios (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role          TEXT NOT NULL DEFAULT 'mecanico' CHECK (role IN ('superadmin', 'mecanico')),
    nome_completo TEXT NOT NULL,
    cpf           TEXT NOT NULL UNIQUE,
    rg            TEXT,
    nome_mae      TEXT,
    email         TEXT NOT NULL,
    senha_alterada BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.usuarios IS 'Perfis de usuários, estendendo auth.users do Supabase.';
COMMENT ON COLUMN public.usuarios.senha_alterada IS 'FALSE força troca de senha no primeiro login.';


-- ============================================================
-- 2. TABELA: equipamentos
-- ============================================================
CREATE TABLE public.equipamentos (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome         TEXT NOT NULL,
    descricao    TEXT,
    status       TEXT NOT NULL DEFAULT 'em_operacao' CHECK (status IN ('em_operacao', 'em_manutencao')),
    manual_url   TEXT,        -- URL do PDF no Supabase Storage
    imagens_urls TEXT[],      -- Array de URLs de imagens
    criado_por   UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.equipamentos.status IS 'em_manutencao é setado automaticamente ao abrir OS ou Checklist ativo.';
COMMENT ON COLUMN public.equipamentos.imagens_urls IS 'Array de URLs públicas do Supabase Storage.';


-- ============================================================
-- 3. TABELA: pecas_equipamento
-- Peças vinculadas a um equipamento específico
-- ============================================================
CREATE TABLE public.pecas_equipamento (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipamento_id UUID NOT NULL REFERENCES public.equipamentos(id) ON DELETE CASCADE,
    nome           TEXT NOT NULL,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.pecas_equipamento IS 'Peças específicas de cada equipamento, usadas em checklists e OS.';


-- ============================================================
-- 4. TABELA: pecas_oficina
-- Estoque geral da oficina (consumíveis, etc.)
-- ============================================================
CREATE TABLE public.pecas_oficina (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome              TEXT NOT NULL,
    quantidade_estoque INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_estoque >= 0),
    criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.pecas_oficina IS 'Estoque de peças e insumos gerais da oficina.';


-- ============================================================
-- 5. TABELA: agendamentos_preventivos
-- ============================================================
CREATE TABLE public.agendamentos_preventivos (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipamento_id UUID NOT NULL REFERENCES public.equipamentos(id) ON DELETE CASCADE,
    mecanico_id    UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    data_agendada  DATE NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluido', 'cancelado')),
    criado_por     UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.agendamentos_preventivos.data_agendada IS 'Checklist só pode ser iniciado neste dia exato.';


-- ============================================================
-- 6. TABELA: checklists
-- Execução de uma manutenção preventiva
-- ============================================================
CREATE TABLE public.checklists (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agendamento_id  UUID NOT NULL REFERENCES public.agendamentos_preventivos(id) ON DELETE RESTRICT,
    mecanico_id     UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    inicio_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- Capturado pelo servidor (antifraud)
    fim_em          TIMESTAMPTZ,
    obs_geral       TEXT,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.checklists.inicio_em IS 'Timestamp do servidor, nunca do cliente, para evitar fraudes.';


-- ============================================================
-- 7. TABELA: checklist_respostas
-- Resposta por peça em um checklist
-- ============================================================
CREATE TABLE public.checklist_respostas (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    checklist_id        UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
    peca_equipamento_id UUID NOT NULL REFERENCES public.pecas_equipamento(id) ON DELETE RESTRICT,
    status_resposta     TEXT NOT NULL CHECK (status_resposta IN ('ok', 'correcao')),
    observacao          TEXT,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.checklist_respostas.status_resposta IS 'ok = sem problemas; correcao = requer atenção/OS.';


-- ============================================================
-- 8. TABELA: ordens_servico (Corretivas)
-- ============================================================
CREATE TABLE public.ordens_servico (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipamento_id      UUID NOT NULL REFERENCES public.equipamentos(id) ON DELETE RESTRICT,
    mecanico_id         UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    solicitante         TEXT NOT NULL,
    problema            TEXT NOT NULL,
    causa               TEXT,
    hora_parada         TIMESTAMPTZ,           -- Quando o equipamento parou
    servicos_executados TEXT,
    obs                 TEXT,
    inicio_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Timer inicia aqui (servidor)
    fim_em              TIMESTAMPTZ,
    status              TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluida', 'cancelada')),
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.ordens_servico.inicio_em IS 'Timestamp do servidor. Timer de duração calculado como fim_em - inicio_em.';
COMMENT ON COLUMN public.ordens_servico.hora_parada IS 'Momento em que o equipamento parou (informado pelo solicitante).';


-- ============================================================
-- 9. TABELA: os_pecas_utilizadas
-- Peças consumidas em uma OS (de equipamento ou de oficina)
-- ============================================================
CREATE TABLE public.os_pecas_utilizadas (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ordem_servico_id UUID NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
    tipo_peca        TEXT NOT NULL CHECK (tipo_peca IN ('equipamento', 'oficina')),
    peca_id          UUID NOT NULL,   -- FK polimórfica: aponta para pecas_equipamento ou pecas_oficina
    quantidade       INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.os_pecas_utilizadas.peca_id IS 'FK polimórfica. Use tipo_peca para saber qual tabela referenciar.';
COMMENT ON COLUMN public.os_pecas_utilizadas.tipo_peca IS 'equipamento → pecas_equipamento | oficina → pecas_oficina';


-- ============================================================
-- 10. ÍNDICES para performance
-- ============================================================
CREATE INDEX idx_pecas_equipamento_equip_id   ON public.pecas_equipamento(equipamento_id);
CREATE INDEX idx_agend_prev_equipamento_id     ON public.agendamentos_preventivos(equipamento_id);
CREATE INDEX idx_agend_prev_mecanico_id        ON public.agendamentos_preventivos(mecanico_id);
CREATE INDEX idx_agend_prev_data               ON public.agendamentos_preventivos(data_agendada);
CREATE INDEX idx_checklists_agendamento_id     ON public.checklists(agendamento_id);
CREATE INDEX idx_checklists_mecanico_id        ON public.checklists(mecanico_id);
CREATE INDEX idx_checklist_resp_checklist_id   ON public.checklist_respostas(checklist_id);
CREATE INDEX idx_os_equipamento_id             ON public.ordens_servico(equipamento_id);
CREATE INDEX idx_os_mecanico_id                ON public.ordens_servico(mecanico_id);
CREATE INDEX idx_os_status                     ON public.ordens_servico(status);
CREATE INDEX idx_os_pecas_os_id                ON public.os_pecas_utilizadas(ordem_servico_id);


-- ============================================================
-- 11. FUNCTION: atualizar timestamp automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 12. TRIGGERS de atualização automática
-- ============================================================
CREATE TRIGGER trg_usuarios_atualizado_em
    BEFORE UPDATE ON public.usuarios
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp();

CREATE TRIGGER trg_equipamentos_atualizado_em
    BEFORE UPDATE ON public.equipamentos
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp();

CREATE TRIGGER trg_pecas_oficina_atualizado_em
    BEFORE UPDATE ON public.pecas_oficina
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp();

CREATE TRIGGER trg_agend_prev_atualizado_em
    BEFORE UPDATE ON public.agendamentos_preventivos
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp();

CREATE TRIGGER trg_os_atualizado_em
    BEFORE UPDATE ON public.ordens_servico
    FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp();


-- ============================================================
-- 13. FUNCTION: decrementar estoque ao usar peça da oficina
-- Chamada via trigger ao inserir em os_pecas_utilizadas
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_decrementar_estoque_oficina()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tipo_peca = 'oficina' THEN
        UPDATE public.pecas_oficina
        SET quantidade_estoque = quantidade_estoque - NEW.quantidade
        WHERE id = NEW.peca_id;

        -- Garante que não ficou negativo (constraint já protege, mas valida aqui)
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Peça de oficina não encontrada: %', NEW.peca_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_decrementar_estoque_oficina
    AFTER INSERT ON public.os_pecas_utilizadas
    FOR EACH ROW EXECUTE FUNCTION public.fn_decrementar_estoque_oficina();


-- ============================================================
-- 14. FUNCTION: marcar equipamento como "em_manutencao"
-- Disparada ao abrir OS ou Checklist
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_marcar_equipamento_em_manutencao()
RETURNS TRIGGER AS $$
DECLARE
    v_equipamento_id UUID;
BEGIN
    -- Para ordens_servico
    IF TG_TABLE_NAME = 'ordens_servico' THEN
        v_equipamento_id := NEW.equipamento_id;
    END IF;

    -- Para checklists, busca via agendamento
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_os_marca_em_manutencao
    AFTER INSERT ON public.ordens_servico
    FOR EACH ROW EXECUTE FUNCTION public.fn_marcar_equipamento_em_manutencao();

CREATE TRIGGER trg_checklist_marca_em_manutencao
    AFTER INSERT ON public.checklists
    FOR EACH ROW EXECUTE FUNCTION public.fn_marcar_equipamento_em_manutencao();


-- ============================================================
-- 15. FUNCTION: liberar equipamento ao fechar OS ou Checklist
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_liberar_equipamento()
RETURNS TRIGGER AS $$
DECLARE
    v_equipamento_id UUID;
    v_os_ativas      INTEGER;
    v_chk_ativos     INTEGER;
BEGIN
    -- Determina o equipamento afetado
    IF TG_TABLE_NAME = 'ordens_servico' THEN
        v_equipamento_id := NEW.equipamento_id;
    END IF;

    IF TG_TABLE_NAME = 'checklists' THEN
        SELECT equipamento_id INTO v_equipamento_id
        FROM public.agendamentos_preventivos
        WHERE id = NEW.agendamento_id;
    END IF;

    -- Só libera se não há mais OS em andamento
    SELECT COUNT(*) INTO v_os_ativas
    FROM public.ordens_servico
    WHERE equipamento_id = v_equipamento_id
      AND status = 'em_andamento';

    -- Só libera se não há mais checklists abertos
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_os_libera_equipamento
    AFTER UPDATE OF status ON public.ordens_servico
    FOR EACH ROW
    WHEN (NEW.status IN ('concluida', 'cancelada'))
    EXECUTE FUNCTION public.fn_liberar_equipamento();

CREATE TRIGGER trg_checklist_libera_equipamento
    AFTER UPDATE OF fim_em ON public.checklists
    FOR EACH ROW
    WHEN (NEW.fim_em IS NOT NULL)
    EXECUTE FUNCTION public.fn_liberar_equipamento();


-- ============================================================
-- 16. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.usuarios                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipamentos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pecas_equipamento         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pecas_oficina             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos_preventivos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_respostas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordens_servico            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_pecas_utilizadas       ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- HELPER FUNCTION: retorna role do usuário autenticado
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_get_minha_role()
RETURNS TEXT AS $$
    SELECT role FROM public.usuarios WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ============================================================
-- POLÍTICAS RLS: usuarios
-- ============================================================
-- Superadmin vê todos; mecânico vê apenas o próprio perfil
CREATE POLICY "usuarios_select" ON public.usuarios
    FOR SELECT USING (
        id = auth.uid()
        OR public.fn_get_minha_role() = 'superadmin'
    );

CREATE POLICY "usuarios_insert" ON public.usuarios
    FOR INSERT WITH CHECK (
        public.fn_get_minha_role() = 'superadmin'
    );

CREATE POLICY "usuarios_update" ON public.usuarios
    FOR UPDATE USING (
        id = auth.uid()  -- mecânico pode editar o próprio perfil (ex: trocar senha)
        OR public.fn_get_minha_role() = 'superadmin'
    );

CREATE POLICY "usuarios_delete" ON public.usuarios
    FOR DELETE USING (
        public.fn_get_minha_role() = 'superadmin'
    );


-- ============================================================
-- POLÍTICAS RLS: equipamentos
-- ============================================================
CREATE POLICY "equipamentos_select_todos" ON public.equipamentos
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "equipamentos_insert_superadmin" ON public.equipamentos
    FOR INSERT WITH CHECK (public.fn_get_minha_role() = 'superadmin');

CREATE POLICY "equipamentos_update_superadmin" ON public.equipamentos
    FOR UPDATE USING (public.fn_get_minha_role() = 'superadmin');

CREATE POLICY "equipamentos_delete_superadmin" ON public.equipamentos
    FOR DELETE USING (public.fn_get_minha_role() = 'superadmin');


-- ============================================================
-- POLÍTICAS RLS: pecas_equipamento
-- ============================================================
CREATE POLICY "pecas_equip_select_todos" ON public.pecas_equipamento
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "pecas_equip_write_superadmin" ON public.pecas_equipamento
    FOR ALL USING (public.fn_get_minha_role() = 'superadmin');


-- ============================================================
-- POLÍTICAS RLS: pecas_oficina
-- ============================================================
CREATE POLICY "pecas_oficina_select_todos" ON public.pecas_oficina
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "pecas_oficina_write_superadmin" ON public.pecas_oficina
    FOR ALL USING (public.fn_get_minha_role() = 'superadmin');

-- Mecânicos podem decrementar estoque via OS (UPDATE apenas quantidade)
CREATE POLICY "pecas_oficina_update_mecanico" ON public.pecas_oficina
    FOR UPDATE USING (auth.uid() IS NOT NULL);


-- ============================================================
-- POLÍTICAS RLS: agendamentos_preventivos
-- ============================================================
CREATE POLICY "agend_select" ON public.agendamentos_preventivos
    FOR SELECT USING (
        mecanico_id = auth.uid()
        OR public.fn_get_minha_role() = 'superadmin'
    );

CREATE POLICY "agend_insert_superadmin" ON public.agendamentos_preventivos
    FOR INSERT WITH CHECK (public.fn_get_minha_role() = 'superadmin');

CREATE POLICY "agend_update_superadmin" ON public.agendamentos_preventivos
    FOR UPDATE USING (public.fn_get_minha_role() = 'superadmin');

CREATE POLICY "agend_delete_superadmin" ON public.agendamentos_preventivos
    FOR DELETE USING (public.fn_get_minha_role() = 'superadmin');


-- ============================================================
-- POLÍTICAS RLS: checklists
-- ============================================================
CREATE POLICY "checklist_select" ON public.checklists
    FOR SELECT USING (
        mecanico_id = auth.uid()
        OR public.fn_get_minha_role() = 'superadmin'
    );

CREATE POLICY "checklist_insert_mecanico" ON public.checklists
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "checklist_update_proprio" ON public.checklists
    FOR UPDATE USING (
        mecanico_id = auth.uid()
        OR public.fn_get_minha_role() = 'superadmin'
    );


-- ============================================================
-- POLÍTICAS RLS: checklist_respostas
-- ============================================================
CREATE POLICY "checklist_resp_select" ON public.checklist_respostas
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.checklists c
            WHERE c.id = checklist_id
              AND (c.mecanico_id = auth.uid() OR public.fn_get_minha_role() = 'superadmin')
        )
    );

CREATE POLICY "checklist_resp_insert" ON public.checklist_respostas
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.checklists c
            WHERE c.id = checklist_id
              AND c.mecanico_id = auth.uid()
        )
    );

CREATE POLICY "checklist_resp_update" ON public.checklist_respostas
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.checklists c
            WHERE c.id = checklist_id
              AND (c.mecanico_id = auth.uid() OR public.fn_get_minha_role() = 'superadmin')
        )
    );


-- ============================================================
-- POLÍTICAS RLS: ordens_servico
-- ============================================================
CREATE POLICY "os_select" ON public.ordens_servico
    FOR SELECT USING (
        mecanico_id = auth.uid()
        OR public.fn_get_minha_role() = 'superadmin'
    );

CREATE POLICY "os_insert_mecanico" ON public.ordens_servico
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "os_update_proprio_ou_admin" ON public.ordens_servico
    FOR UPDATE USING (
        mecanico_id = auth.uid()
        OR public.fn_get_minha_role() = 'superadmin'
    );

CREATE POLICY "os_delete_superadmin" ON public.ordens_servico
    FOR DELETE USING (public.fn_get_minha_role() = 'superadmin');


-- ============================================================
-- POLÍTICAS RLS: os_pecas_utilizadas
-- ============================================================
CREATE POLICY "os_pecas_select" ON public.os_pecas_utilizadas
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.ordens_servico os
            WHERE os.id = ordem_servico_id
              AND (os.mecanico_id = auth.uid() OR public.fn_get_minha_role() = 'superadmin')
        )
    );

CREATE POLICY "os_pecas_insert" ON public.os_pecas_utilizadas
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.ordens_servico os
            WHERE os.id = ordem_servico_id
              AND os.mecanico_id = auth.uid()
        )
    );

CREATE POLICY "os_pecas_delete_superadmin" ON public.os_pecas_utilizadas
    FOR DELETE USING (public.fn_get_minha_role() = 'superadmin');


-- ============================================================
-- 17. STORAGE BUCKETS (executar via Supabase Dashboard ou SQL)
-- ============================================================
-- Bucket para manuais PDF dos equipamentos (público para leitura)
INSERT INTO storage.buckets (id, name, public)
VALUES ('manuais', 'manuais', true)
ON CONFLICT DO NOTHING;

-- Bucket para imagens dos equipamentos (público para leitura)
INSERT INTO storage.buckets (id, name, public)
VALUES ('equipamentos-imagens', 'equipamentos-imagens', true)
ON CONFLICT DO NOTHING;

-- Bucket para distribuição do APK (acesso restrito)
INSERT INTO storage.buckets (id, name, public)
VALUES ('apk-releases', 'apk-releases', false)
ON CONFLICT DO NOTHING;

-- Políticas de Storage: apenas superadmin faz upload
CREATE POLICY "storage_manuais_upload_superadmin"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'manuais'
        AND public.fn_get_minha_role() = 'superadmin'
    );

CREATE POLICY "storage_imagens_upload_superadmin"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'equipamentos-imagens'
        AND public.fn_get_minha_role() = 'superadmin'
    );

-- Leitura pública nos buckets públicos (auth requerida)
CREATE POLICY "storage_manuais_read_auth"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'manuais' AND auth.uid() IS NOT NULL);

CREATE POLICY "storage_imagens_read_auth"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'equipamentos-imagens' AND auth.uid() IS NOT NULL);


-- ============================================================
-- FIM DO SCRIPT
-- ============================================================