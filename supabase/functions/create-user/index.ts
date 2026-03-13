// supabase/functions/create-user/index.ts
// Deploy: npx supabase functions deploy create-user --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// ─── CORS ────────────────────────────────────────────────────────────────────
// Incluídos em TODOS os caminhos de saída, inclusive erros 4xx/5xx.
// Sem eles, o navegador bloqueia a resposta antes de o frontend lê-la.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Helper: resposta JSON com CORS garantido ─────────────────────────────────
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

// ─── Handler principal ────────────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {

  // 1. Preflight CORS — deve retornar 200 imediatamente, sem lógica de negócio.
  if (req.method === 'OPTIONS') {
    console.log('[create-user] OPTIONS preflight recebido.');
    return new Response('ok', { status: 200, headers: CORS_HEADERS });
  }

  console.log('[create-user] ── INÍCIO DA REQUISIÇÃO ──');

  // 2. Todo o restante fica num try/catch global.
  //    Qualquer exceção não tratada retorna 500 com CORS em vez de causar EarlyDrop.
  try {

    // ── 3. Variáveis de ambiente ──────────────────────────────────────────────
    // Verificação explícita antes de qualquer operação assíncrona.
    // Um `!url` na expressão de createClient já causaria crash silencioso.
    console.log('[create-user] Verificando variáveis de ambiente...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) {
      console.error('[create-user] ERRO: SUPABASE_URL não definida.');
      return jsonResponse({ error: 'Configuração do servidor incompleta: SUPABASE_URL ausente.' }, 500);
    }

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) {
      console.error('[create-user] ERRO: SUPABASE_SERVICE_ROLE_KEY não definida.');
      return jsonResponse({ error: 'Configuração do servidor incompleta: SERVICE_ROLE_KEY ausente.' }, 500);
    }

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!anonKey) {
      console.error('[create-user] ERRO: SUPABASE_ANON_KEY não definida.');
      return jsonResponse({ error: 'Configuração do servidor incompleta: ANON_KEY ausente.' }, 500);
    }

    console.log('[create-user] Variáveis de ambiente OK.');

    // ── 4. Extração manual do Bearer token ────────────────────────────────────
    // Como o deploy usa --no-verify-jwt, o Supabase Runtime NÃO valida o token
    // automaticamente. Precisamos extrair e verificar manualmente.
    const authHeader = req.headers.get('Authorization') ?? '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!bearerToken) {
      console.warn('[create-user] AVISO: Header Authorization ausente ou mal formatado.');
      return jsonResponse({ error: 'Autenticação necessária. Faça login novamente.' }, 401);
    }

    console.log('[create-user] Token extraído. Verificando identidade do chamador...');

    // ── 5. Identificação do chamador via getUser(token) ───────────────────────
    // Usamos o cliente anon apenas para validar o JWT e obter o user.id.
    // Isso evita criar um cliente admin desnecessário antes de confirmar a identidade.
    const supabaseAnon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user: caller }, error: callerErr } = await supabaseAnon.auth.getUser(bearerToken);

    if (callerErr || !caller) {
      console.error('[create-user] ERRO: Token inválido ou expirado.', callerErr?.message ?? '');
      return jsonResponse({ error: 'Sessão inválida ou expirada. Faça login novamente.' }, 401);
    }

    console.log(`[create-user] Chamador identificado: ${caller.id}`);

    // ── 6. Cliente admin (service_role) ───────────────────────────────────────
    // Criado DEPOIS de confirmar que há um usuário autenticado válido.
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 7. Verificação de permissão (role = superadmin) ───────────────────────
    console.log('[create-user] Verificando role do chamador na tabela usuarios...');

    const { data: callerProfile, error: profileErr } = await supabaseAdmin
      .from('usuarios')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (profileErr) {
      console.error('[create-user] ERRO ao buscar perfil do chamador:', profileErr.message);
      return jsonResponse({ error: 'Não foi possível verificar suas permissões.' }, 500);
    }

    if (callerProfile?.role !== 'superadmin') {
      console.warn(`[create-user] ACESSO NEGADO: role do chamador é '${callerProfile?.role}'.`);
      return jsonResponse({ error: 'Apenas administradores podem criar novos usuários.' }, 403);
    }

    console.log('[create-user] Permissão confirmada: superadmin.');

    // ── 8. Parse do body ──────────────────────────────────────────────────────
    let body: {
      email: string;
      password: string;
      nome_completo: string;
      cpf: string;
      rg?: string | null;
      nome_mae?: string | null;
      role: string;
    };

    try {
      body = await req.json();
    } catch {
      console.error('[create-user] ERRO: Body da requisição não é JSON válido.');
      return jsonResponse({ error: 'Dados da requisição inválidos.' }, 400);
    }

    // Validação básica dos campos obrigatórios
    if (!body.email || !body.password || !body.nome_completo || !body.cpf || !body.role) {
      console.error('[create-user] ERRO: Campos obrigatórios ausentes no body.');
      return jsonResponse({ error: 'Campos obrigatórios ausentes: email, password, nome_completo, cpf, role.' }, 400);
    }

    const emailNormalizado = body.email.trim().toLowerCase();
    const cpfNormalizado   = body.cpf.replace(/\D/g, '');

    console.log(`[create-user] Criando usuário no Auth: ${emailNormalizado}`);

    // ── 9. Criação no Supabase Auth ───────────────────────────────────────────
    const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email:         emailNormalizado,
      password:      body.password,
      email_confirm: true, // confirma automaticamente, sem e-mail de verificação
    });

    if (createErr) {
      console.error('[create-user] ERRO AUTH:', createErr.message);
      return jsonResponse({ error: createErr.message, step: 'auth' }, 400);
    }

    if (!authData?.user?.id) {
      console.error('[create-user] ERRO: Auth criou usuário mas não retornou ID.');
      return jsonResponse({ error: 'Erro inesperado: usuário criado sem ID.', step: 'auth' }, 500);
    }

    console.log(`[create-user] Usuário criado no Auth: ${authData.user.id}. Inserindo perfil no banco...`);

    // ── 10. Inserção do perfil na tabela usuarios ─────────────────────────────
    const { error: dbErr } = await supabaseAdmin
      .from('usuarios')
      .insert({
        id:            authData.user.id,
        nome_completo: body.nome_completo.trim(),
        cpf:           cpfNormalizado,
        email:         emailNormalizado,
        role:          body.role,
        rg:            body.rg?.trim()     || null,
        nome_mae:      body.nome_mae?.trim() || null,
        senha_alterada: false,
      });

    if (dbErr) {
      // Rollback: remove o usuário recém-criado do Auth para manter consistência
      console.error('[create-user] ERRO BANCO:', dbErr.message, '— Fazendo rollback do Auth...');
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      console.log('[create-user] Rollback concluído.');
      return jsonResponse({ error: `Erro ao salvar perfil: ${dbErr.message}`, step: 'database' }, 400);
    }

    console.log(`[create-user] ✅ SUCESSO: Usuário ${authData.user.id} criado e salvo.`);
    return jsonResponse({ success: true, userId: authData.user.id });

  } catch (unexpectedErr: unknown) {
    // ── Catch global: garante que nenhum erro causa EarlyDrop sem resposta ────
    const message = unexpectedErr instanceof Error
      ? unexpectedErr.message
      : String(unexpectedErr);

    console.error('[create-user] 🚨 ERRO NÃO TRATADO:', message);
    return jsonResponse({ error: `Erro inesperado no servidor: ${message}` }, 500);
  }
});
