// supabase/functions/create-user/index.ts
// ALTERAÇÕES v2 (Dummy Email — E-mail opcional):
//   • Campo `email` agora é opcional no body da requisição
//   • Se vazio, gera automaticamente: [CPF_LIMPO]@aguia.com.br
//   • emailFinal é usado tanto no Auth quanto na tabela public.usuarios
//   • Validação de formato de e-mail aplicada ANTES de gerar o dummy,
//     garantindo que um e-mail real inválido seja rejeitado com mensagem clara
// INALTERADO: CORS, validação de role, rollback em caso de falha no DB.
// Deploy: npx supabase functions deploy create-user --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// ─── CORS ────────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ─── Helper: valida formato de e-mail ────────────────────────────────────────
// Usado apenas quando o admin preencheu o campo (e-mail real).
// E-mails dummy são gerados internamente e não passam por esta validação.
function isEmailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

serve(async (req: Request): Promise<Response> => {

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS_HEADERS });
  }

  console.log('[create-user] ── INÍCIO ──', req.method, new Date().toISOString());

  try {

    // ── Variáveis de ambiente ──────────────────────────────────────────────
    const supabaseUrl    = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl)    return jsonResponse({ error: 'SUPABASE_URL ausente no servidor.'              }, 500);
    if (!serviceRoleKey) return jsonResponse({ error: 'SUPABASE_SERVICE_ROLE_KEY ausente no servidor.' }, 500);
    if (!anonKey)        return jsonResponse({ error: 'SUPABASE_ANON_KEY ausente no servidor.'         }, 500);

    // ── Extração do Bearer token ───────────────────────────────────────────
    const authHeader  = req.headers.get('Authorization') ?? '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!bearerToken) {
      console.warn('[create-user] Authorization header ausente.');
      return jsonResponse({ error: 'Autenticação necessária. Faça login novamente.' }, 401);
    }

    // ── Valida o JWT do chamador via cliente anon ──────────────────────────
    const supabaseAnon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user: caller }, error: callerErr } = await supabaseAnon.auth.getUser(bearerToken);

    if (callerErr || !caller) {
      console.error('[create-user] Token inválido:', callerErr?.message);
      return jsonResponse({ error: 'Sessão inválida ou expirada. Faça login novamente.' }, 401);
    }

    console.log('[create-user] Chamador validado:', caller.id);

    // ── Cliente admin (service_role) ───────────────────────────────────────
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Verifica se o chamador é superadmin ────────────────────────────────
    const { data: callerProfile, error: profileErr } = await supabaseAdmin
      .from('usuarios')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (profileErr) {
      console.error('[create-user] Erro ao buscar perfil:', profileErr.message);
      return jsonResponse({ error: 'Não foi possível verificar suas permissões.' }, 500);
    }

    if (callerProfile?.role !== 'superadmin') {
      console.warn('[create-user] Acesso negado, role:', callerProfile?.role);
      return jsonResponse({ error: 'Apenas administradores podem criar novos usuários.' }, 403);
    }

    // ── Parse do body ──────────────────────────────────────────────────────
    let body: {
      email?:         string | null;
      password:       string;
      nome_completo:  string;
      cpf:            string;
      rg?:            string | null;
      nome_mae?:      string | null;
      role:           string;
    };

    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Body da requisição não é JSON válido.' }, 400);
    }

    // ── Validação dos campos obrigatórios ──────────────────────────────────
    if (!body.password || !body.nome_completo || !body.cpf || !body.role) {
      return jsonResponse({
        error: 'Campos obrigatórios ausentes: password, nome_completo, cpf, role.',
      }, 400);
    }

    // ── Limpeza do CPF (remove pontos, traços e espaços) ──────────────────
    const cpfLimpo = body.cpf.replace(/\D/g, '');

    if (cpfLimpo.length !== 11) {
      return jsonResponse({ error: 'CPF inválido. Deve conter 11 dígitos.' }, 400);
    }

    // ── Lógica do Dummy Email ──────────────────────────────────────────────
    //
    // REGRA:
    //   1. Se o admin NÃO preencheu o e-mail → gera dummy: [CPF]@aguia.com.br
    //   2. Se o admin preencheu um e-mail → valida formato e usa o e-mail real
    //
    // O emailFinal é salvo TANTO no auth.users QUANTO em public.usuarios,
    // garantindo que a RPC fn_email_por_cpf continue funcionando para o login.

    const emailRaw = (body.email ?? '').trim().toLowerCase();

    let emailFinal: string;

    if (!emailRaw) {
      // Caso 1: E-mail não fornecido → gera dummy baseado no CPF
      emailFinal = `${cpfLimpo}@aguia.com.br`;
      console.log('[create-user] E-mail não fornecido. Usando dummy:', emailFinal);
    } else {
      // Caso 2: E-mail fornecido → valida formato antes de usar
      if (!isEmailValido(emailRaw)) {
        return jsonResponse({
          error: 'Formato de e-mail inválido. Verifique o campo e tente novamente.',
        }, 400);
      }
      emailFinal = emailRaw;
      console.log('[create-user] E-mail real fornecido:', emailFinal);
    }

    console.log('[create-user] Criando usuário no Auth:', emailFinal);

    // ── Criação no Supabase Auth ───────────────────────────────────────────
    const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email:         emailFinal,
      password:      body.password,
      email_confirm: true,
    });

    if (createErr) {
      console.error('[create-user] Erro no Auth:', createErr.message);

      // Traduz erros comuns para português
      if (createErr.message.includes('already been registered')) {
        return jsonResponse({
          error: 'Este e-mail já está cadastrado no sistema.',
          step: 'auth',
        }, 400);
      }

      return jsonResponse({ error: createErr.message, step: 'auth' }, 400);
    }

    if (!authData?.user?.id) {
      return jsonResponse({ error: 'Usuário criado sem ID retornado.', step: 'auth' }, 500);
    }

    console.log('[create-user] Auth OK, inserindo perfil:', authData.user.id);

    // ── Inserção na tabela usuarios ────────────────────────────────────────
    // emailFinal é salvo aqui: garante que fn_email_por_cpf retorne o valor
    // correto (dummy ou real) para o fluxo de login por CPF.
    const { error: dbErr } = await supabaseAdmin
      .from('usuarios')
      .insert({
        id:             authData.user.id,
        nome_completo:  body.nome_completo.trim(),
        cpf:            cpfLimpo,
        email:          emailFinal,          // sempre preenchido (dummy ou real)
        role:           body.role,
        rg:             body.rg?.trim()       || null,
        nome_mae:       body.nome_mae?.trim() || null,
        senha_alterada: false,
      });

    if (dbErr) {
      console.error('[create-user] Erro no banco:', dbErr.message, '— fazendo rollback...');
      // Rollback: remove o usuário criado no Auth para evitar órfão
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return jsonResponse({
        error: `Erro ao salvar perfil: ${dbErr.message}`,
        step: 'database',
      }, 400);
    }

    console.log('[create-user] ✅ Sucesso:', authData.user.id, '| email:', emailFinal);
    return jsonResponse({ success: true, userId: authData.user.id });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[create-user] 🚨 ERRO NÃO TRATADO:', msg);
    return jsonResponse({ error: `Erro inesperado no servidor: ${msg}` }, 500);
  }
});