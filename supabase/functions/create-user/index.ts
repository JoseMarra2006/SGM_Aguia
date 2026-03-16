// supabase/functions/create-user/index.ts
// Deploy: npx supabase functions deploy create-user --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// ─── CORS ────────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
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

    if (!supabaseUrl)    return jsonResponse({ error: 'SUPABASE_URL ausente no servidor.'          }, 500);
    if (!serviceRoleKey) return jsonResponse({ error: 'SUPABASE_SERVICE_ROLE_KEY ausente no servidor.' }, 500);
    if (!anonKey)        return jsonResponse({ error: 'SUPABASE_ANON_KEY ausente no servidor.'     }, 500);

    // ── Extração do Bearer token ───────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
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
      return jsonResponse({ error: 'Body da requisição não é JSON válido.' }, 400);
    }

    if (!body.email || !body.password || !body.nome_completo || !body.cpf || !body.role) {
      return jsonResponse({
        error: 'Campos obrigatórios ausentes: email, password, nome_completo, cpf, role.',
      }, 400);
    }

    const emailNorm = body.email.trim().toLowerCase();
    const cpfNorm   = body.cpf.replace(/\D/g, '');

    console.log('[create-user] Criando usuário no Auth:', emailNorm);

    // ── Criação no Supabase Auth ───────────────────────────────────────────
    const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email:         emailNorm,
      password:      body.password,
      email_confirm: true,
    });

    if (createErr) {
      console.error('[create-user] Erro no Auth:', createErr.message);
      return jsonResponse({ error: createErr.message, step: 'auth' }, 400);
    }

    if (!authData?.user?.id) {
      return jsonResponse({ error: 'Usuário criado sem ID retornado.', step: 'auth' }, 500);
    }

    console.log('[create-user] Auth OK, inserindo perfil:', authData.user.id);

    // ── Inserção na tabela usuarios ────────────────────────────────────────
    const { error: dbErr } = await supabaseAdmin
      .from('usuarios')
      .insert({
        id:             authData.user.id,
        nome_completo:  body.nome_completo.trim(),
        cpf:            cpfNorm,
        email:          emailNorm,
        role:           body.role,
        rg:             body.rg?.trim()      || null,
        nome_mae:       body.nome_mae?.trim() || null,
        senha_alterada: false,
      });

    if (dbErr) {
      console.error('[create-user] Erro no banco:', dbErr.message, '— fazendo rollback...');
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return jsonResponse({ error: `Erro ao salvar perfil: ${dbErr.message}`, step: 'database' }, 400);
    }

    console.log('[create-user] ✅ Sucesso:', authData.user.id);
    return jsonResponse({ success: true, userId: authData.user.id });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[create-user] 🚨 ERRO NÃO TRATADO:', msg);
    return jsonResponse({ error: `Erro inesperado no servidor: ${msg}` }, 500);
  }
});
