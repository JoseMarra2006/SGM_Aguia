// supabase/functions/create-user/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  console.log("🚀 [INÍCIO] Recebendo solicitação de cadastro...");

  try {
    // 1. Verificação das Variáveis de Ambiente (Onde o EarlyDrop costuma acontecer)
    const url = Deno.env.get('SUPABASE_URL');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!url || !serviceRole || !anonKey) {
      console.error("❌ [ERRO] Chaves do sistema não encontradas no ambiente da função.");
      return json({ error: 'Configuração do servidor incompleta (chaves ausentes).' }, 500);
    }

    const supabaseAdmin = createClient(url, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 2. Validação do Token do Chamador
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Sessão expirada ou inválida.' }, 401);

    const { data: { user: caller }, error: callerErr } = await createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } }
    }).auth.getUser();

    if (callerErr || !caller) {
      console.error("❌ [ERRO] Falha ao identificar quem está chamando:", callerErr?.message);
      return json({ error: 'Não foi possível validar seu login.' }, 401);
    }

    // 3. Verificação de Permissão na Tabela Usuarios
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('usuarios')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (profileErr || profile?.role !== 'superadmin') {
      console.error("❌ [ERRO] Usuário sem permissão de admin.");
      return json({ error: 'Apenas administradores podem criar novos usuários.' }, 403);
    }

    // 4. Criação do Usuário
    const body = await req.json();
    console.log(`👤 [LOG] Criando usuário: ${body.email}`);

    const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: body.email.trim().toLowerCase(),
      password: body.password,
      email_confirm: true,
    });

    if (createErr) {
      console.error("❌ [ERRO AUTH]:", createErr.message);
      return json({ error: createErr.message, step: 'auth' }, 400);
    }

    // 5. Inserção no Banco
    const { error: dbErr } = await supabaseAdmin.from('usuarios').insert({
      id: authData.user.id,
      nome_completo: body.nome_completo.trim(),
      cpf: body.cpf.replace(/\D/g, ''),
      email: body.email.trim().toLowerCase(),
      role: body.role,
      rg: body.rg || null,
      nome_mae: body.nome_mae || null,
      senha_alterada: false
    });

    if (dbErr) {
      console.error("❌ [ERRO BANCO]:", dbErr.message);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return json({ error: `Erro ao salvar perfil: ${dbErr.message}`, step: 'database' }, 400);
    }

    console.log("✅ [SUCESSO] Usuário criado e salvo!");
    return json({ success: true, userId: authData.user.id });

  } catch (err) {
    console.error("🚨 [CRASH]:", err.message);
    return json({ error: `Erro inesperado: ${err.message}` }, 500);
  }
});