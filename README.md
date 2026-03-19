# SGM Águia — Sistema de Gestão de Manutenção

<p align="center">
  <img src="src/assets/logo_empresa.png" alt="SGM Águia" height="80"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite" />
  <img src="https://img.shields.io/badge/Capacitor-6-119EFF?logo=capacitor" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase" />
  <img src="https://img.shields.io/badge/Zustand-State-FF6B35" />
</p>

---

> 🇧🇷 **Português (pt-BR)** · [🇺🇸 English version below](#english-version)

---

## Índice

- [Visão Geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Stack Tecnológica](#stack-tecnológica)
- [Plugins Capacitor](#plugins-capacitor)
- [Banco de Dados](#banco-de-dados)
- [Estrutura de Pastas](#estrutura-de-pastas)
- [Perfis de Usuário](#perfis-de-usuário)
- [Fluxos Principais](#fluxos-principais)
- [Suporte Offline](#suporte-offline)
- [Notificações em Tempo Real](#notificações-em-tempo-real)
- [Instalação e Execução](#instalação-e-execução)
- [Variáveis de Ambiente](#variáveis-de-ambiente)

---

## Visão Geral

O **SGM Águia** é um aplicativo mobile-first (Android/iOS + Web PWA) de gestão de manutenção industrial, desenvolvido para oficinas e plantas fabris. Ele centraliza o controle de equipamentos, preventivas agendadas e ordens de serviço corretivas em uma única plataforma, com suporte total a operação offline e sincronização automática ao reconectar.

O sistema foi projetado para dois perfis: o **Mecânico**, que executa as tarefas em campo, e o **SuperAdmin**, que planeja, acompanha e gerencia toda a operação.

---

## Funcionalidades

### 🔐 Autenticação
- Login por **CPF + Senha** (sem exposição de e-mail para o usuário)
- Troca de senha obrigatória no **primeiro acesso**
- Logout automático por **inatividade de 24 horas**
- Persistência de sessão entre reloads (Zustand + Supabase Auth)
- Suporte a múltiplos usuários no mesmo dispositivo (limpeza completa de cache no logout)
- Alerta de segurança pós-login para dispositivos compartilhados

### 📊 Dashboard
- Métricas em tempo real: total de equipamentos, em manutenção, OS abertas e preventivas atrasadas
- Lista das OS em andamento com timer ao vivo
- Lista de preventivas atrasadas com dias de atraso
- Ações rápidas de administração (SuperAdmin)
- Painel lateral de notificações com badge de não-lidas
- Indicador de itens aguardando sincronização offline
- Bottom Navigation para acesso rápido aos módulos

### ⚙️ Módulo 1 — Equipamentos
- Listagem com filtro por status (em operação / em manutenção) e busca por nome
- Cards com imagem de capa, badge de status e contador de galeria
- Cadastro de equipamentos com:
  - Upload de até **6 imagens** (máx. 5 MB cada), armazenadas no Supabase Storage
  - Upload de **manual em PDF** (máx. 30 MB), com visualizador embutido (`<embed>`)
  - Cadastro de **peças específicas** do equipamento (com validação de duplicatas)
- Tela de detalhes com galeria interativa (lightbox), miniaturas e badge de status sobreposto

### 📋 Módulo 2 — Manutenções Preventivas
- Agendamento pelo SuperAdmin: equipamento, mecânico responsável, data e **itens de checklist personalizados** (salvo como JSONB no banco)
- Sugestões rápidas de itens de checklist para agilizar o preenchimento
- Listagem em abas: **Pendentes** (inclui em andamento) e **Concluídos**
- Controle de acesso: mecânico só inicia checklist na data programada ou após
- Checklist em duas seções:
  - **Itens do Admin** (texto livre, configurados no agendamento)
  - **Peças do Equipamento** (baseado no cadastro do equipamento)
- Cada item aceita resposta **Conforme / Não conforme** com campo de observação opcional
- Barra de progresso em tempo real durante a execução
- Timer cronômetro exibido na topbar durante a execução
- Tela de conclusão com duração total, contagem de não-conformes e aviso offline
- **Notificação automática** aos admins ao concluir, com detalhamento de não-conformidades
- **Auto-healing**: detecta e corrige agendamentos com status inconsistente ao carregar
- Bloqueio de re-execução: após conclusão, o botão de início some e exibe badge "Somente leitura"

### 🔧 Módulo 3 — Ordens de Serviço (Corretivas)
- Abertura de OS com: equipamento, solicitante, descrição do problema e hora de parada opcional
- Timer automático iniciado no momento da abertura
- Preenchimento técnico durante a execução: causa raiz, serviços executados, observações
- **Auto-save silencioso** no blur dos campos (sem log)
- **Salvar progresso explícito** com registro em `historico_os` e notificação ao admin
- Gestão de peças utilizadas:
  - Peças do próprio equipamento
  - Peças do estoque da oficina (com validação de quantidade disponível)
  - Desconto automático do estoque ao adicionar
- **Linha do Tempo** (Timeline) exclusiva para SuperAdmin: histórico completo de eventos da OS
- Finalização com modal de confirmação
- Cancelamento de OS (somente SuperAdmin)
- Trigger de banco (`trg_log_os_status_mudanca`) registra automaticamente mudanças de status

### 👥 Gestão de Usuários *(SuperAdmin)*
- Cadastro de novos usuários via **Supabase Edge Function** (`create-user`):
  - Define perfil de acesso: Mecânico ou SuperAdmin
  - Campos: nome completo, CPF (validado), RG, nome da mãe, e-mail, senha provisória
  - Senha provisória obriga troca no primeiro acesso (`senha_alterada = false`)
- Listagem com busca por nome, CPF ou e-mail
- Badge de "1º acesso" para usuários que ainda não trocaram a senha

### 📦 Gestão de Estoque *(SuperAdmin)*
- Cadastro e edição de peças da oficina com controle de quantidade
- Cards com indicadores visuais: disponível, estoque baixo (≤ 3) e sem estoque
- Busca por nome e filtros de estoque
- Métricas: tipos de peças, total de itens, estoque baixo e zerado

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                   React + Vite (PWA)                    │
│                  Capacitor Shell (APK)                  │
├──────────────┬──────────────────────────┬───────────────┤
│  authStore   │       appStore           │  React Router │
│  (Zustand)   │  (Zustand + Offline)     │      v6       │
├──────────────┴──────────────────────────┴───────────────┤
│                    Supabase Client                       │
├──────────┬──────────┬───────────┬────────────────────────┤
│   Auth   │ Database │ Realtime  │  Storage  │  Functions │
│  (JWT)   │(Postgres)│(WebSocket)│ (Buckets) │  (Deno)   │
└──────────┴──────────┴───────────┴────────────────────────┘
```

### Guardas de Rota
- **`PrivateRoute`** — exige `isAuthenticated`. Exibe SplashScreen durante `initAuth`.
- **`PublicOnlyRoute`** — redireciona para `/dashboard` se já autenticado com senha trocada.
- **`SuperAdminRoute`** — restringe rotas como `/dashboard/usuarios`, `/dashboard/pecas` e `/equipamentos/novo`.

### Tratamento do Botão Voltar (Android)
Componente `BackButtonHandler` registra listener do Capacitor com `useRef` para evitar closures obsoletos. Em rotas raiz (`/dashboard`, `/login`, `/`), exibe diálogo de confirmação de saída do app.

---

## Stack Tecnológica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| UI Framework | React | 18 |
| Build Tool | Vite | 5 |
| Mobile Shell | Capacitor | 6 |
| Roteamento | React Router | 6 |
| Estado Global | Zustand + subscribeWithSelector | 4 |
| Backend/BaaS | Supabase | 2 |
| Banco de Dados | PostgreSQL (via Supabase) | 15 |
| Armazenamento Local | @capacitor/preferences | 6 |
| Fontes | DM Sans (Google Fonts) | — |
| Estilização | CSS-in-JS (inline styles) | — |

---

## Plugins Capacitor

| Plugin | Funcionalidade |
|--------|---------------|
| `@capacitor/app` | Listener do botão Voltar do Android; `exitApp()` ao confirmar saída |
| `@capacitor/dialog` | Diálogo nativo de confirmação para saída do aplicativo |
| `@capacitor/network` | Detecção de conectividade; dispara sincronização ao reconectar |
| `@capacitor/preferences` | Persistência de filas offline e timestamp da última sincronização |
| `@capacitor/local-notifications` | Notificações push locais em dispositivos nativos ao receber notificações via Realtime |

---

## Banco de Dados

### Tabelas Principais

#### `usuarios`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | PK, vinculado ao Supabase Auth |
| `nome_completo` | TEXT | Nome completo |
| `cpf` | TEXT | CPF (11 dígitos, único) |
| `email` | TEXT | E-mail (único) |
| `role` | TEXT | `'mecanico'` ou `'superadmin'` |
| `senha_alterada` | BOOLEAN | `false` no cadastro; `true` após 1º acesso |

#### `equipamentos`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | PK |
| `nome` | TEXT | Nome do equipamento |
| `descricao` | TEXT | Descrição opcional |
| `status` | TEXT | `'em_operacao'` ou `'em_manutencao'` |
| `imagens_urls` | TEXT[] | Array de URLs públicas (Supabase Storage) |
| `manual_url` | TEXT | URL pública do PDF no Storage |
| `criado_por` | UUID | FK → `usuarios.id` |

#### `pecas_equipamento`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | PK |
| `equipamento_id` | UUID | FK → `equipamentos.id` |
| `nome` | TEXT | Nome da peça |

#### `pecas_oficina`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | PK |
| `nome` | TEXT | Nome da peça |
| `quantidade_estoque` | INTEGER | Quantidade disponível |

#### `agendamentos_preventivos`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | PK |
| `equipamento_id` | UUID | FK → `equipamentos.id` |
| `mecanico_id` | UUID | FK → `usuarios.id` |
| `data_agendada` | DATE | Data da manutenção |
| `status` | TEXT | `'pendente'`, `'em_andamento'`, `'concluido'`, `'cancelado'` |
| `itens_checklist` | JSONB | Array de strings com pontos definidos pelo Admin |

#### `checklists`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | PK |
| `agendamento_id` | UUID | FK → `agendamentos_preventivos.id` |
| `mecanico_id` | UUID | FK → `usuarios.id` |
| `inicio_em` | TIMESTAMPTZ | Início da execução |
| `fim_em` | TIMESTAMPTZ | Fim da execução (NULL se em andamento) |
| `obs_geral` | TEXT | JSON serializado com respostas dos itens admin + observação do mecânico |

#### `checklist_respostas`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | PK |
| `checklist_id` | UUID | FK → `checklists.id` |
| `peca_equipamento_id` | UUID | FK → `pecas_equipamento.id` |
| `status_resposta` | TEXT | `'ok'` ou `'correcao'` |
| `observacao` | TEXT | Observação opcional |

#### `ordens_servico`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | PK |
| `equipamento_id` | UUID | FK → `equipamentos.id` |
| `mecanico_id` | UUID | FK → `usuarios.id` |
| `solicitante` | TEXT | Nome de quem abriu o chamado |
| `problema` | TEXT | Descrição do defeito |
| `causa` | TEXT | Causa raiz identificada |
| `servicos_executados` | TEXT | Descrição dos serviços |
| `obs` | TEXT | Observações adicionais |
| `status` | TEXT | `'em_andamento'`, `'concluida'`, `'cancelada'` |
| `hora_parada` | TIMESTAMPTZ | Quando o equipamento parou |
| `inicio_em` | TIMESTAMPTZ | Abertura da OS |
| `fim_em` | TIMESTAMPTZ | Conclusão da OS |

#### `os_pecas_utilizadas`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | PK |
| `ordem_servico_id` | UUID | FK → `ordens_servico.id` |
| `tipo_peca` | TEXT | `'equipamento'` ou `'oficina'` |
| `peca_id` | UUID | FK polimórfico conforme `tipo_peca` |
| `quantidade` | INTEGER | Quantidade utilizada |

#### `historico_os`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | PK |
| `os_id` | UUID | FK → `ordens_servico.id` |
| `usuario_id` | UUID | FK → `usuarios.id` |
| `acao` | TEXT | `'criada'`, `'atualizada'`, `'concluida'`, `'cancelada'`, `'peca_adicionada'`, `'reaberta'` |
| `descricao` | TEXT | Descrição detalhada da ação |
| `data_registro` | TIMESTAMPTZ | Timestamp do evento |

#### `notificacoes`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → `usuarios.id` (destinatário) |
| `tipo` | TEXT | `'os_aberta'`, `'os_concluida'`, `'preventiva_concluida'`, `'preventiva_agendada'`, `'preventiva_lembrete'` |
| `titulo` | TEXT | Título da notificação |
| `mensagem` | TEXT | Corpo da mensagem |
| `link` | TEXT | Rota de destino ao clicar |
| `lida` | BOOLEAN | Status de leitura |
| `created_at` | TIMESTAMPTZ | Timestamp de criação |

### Triggers de Banco
| Trigger | Evento | Ação |
|---------|--------|------|
| `trg_log_os_criada` | INSERT em `ordens_servico` | Insere em `historico_os` com ação `'criada'` |
| `trg_log_os_status_mudanca` | UPDATE de `status` em `ordens_servico` | Insere em `historico_os` com ação correspondente |
| `trg_notif_os_aberta` | INSERT em `ordens_servico` | Notifica todos os SuperAdmins |
| `trg_notif_os_atualizada` | UPDATE em `ordens_servico` | Notifica todos os SuperAdmins |

### Funções RPC
| Função | Descrição |
|--------|-----------|
| `fn_email_por_cpf(p_cpf)` | Retorna e-mail do usuário pelo CPF (usado no login) |

### Supabase Storage Buckets
| Bucket | Conteúdo | Máx. |
|--------|----------|------|
| `equipamentos-imagens` | Fotos dos equipamentos | 5 MB/arquivo |
| `manuais` | Manuais em PDF | 30 MB/arquivo |

### Edge Functions
| Função | Descrição |
|--------|-----------|
| `create-user` | Cria usuário no Supabase Auth e insere perfil em `usuarios` de forma atômica, com rollback em caso de falha |

---

## Estrutura de Pastas

```
src/
├── assets/
│   └── logo_empresa.png
├── components/
│   └── common/
│       └── CardEquipamento.jsx     # Card reutilizável de equipamento
├── pages/
│   ├── Login/
│   │   └── Login.jsx               # Tela de login + modais de senha e segurança
│   ├── Dashboard/
│   │   ├── Painel.jsx              # Dashboard principal + notificações
│   │   ├── Usuarios.jsx            # Gestão de usuários (SuperAdmin)
│   │   └── Pecas.jsx               # Estoque de peças (SuperAdmin)
│   ├── Equipamentos/
│   │   ├── Listagem.jsx            # Lista de equipamentos
│   │   ├── Cadastro.jsx            # Cadastro de equipamento
│   │   └── Detalhes.jsx            # Detalhes, galeria e manual PDF
│   ├── Preventivas/
│   │   ├── Listagem.jsx            # Lista de agendamentos + modal de agendamento
│   │   └── Checklist.jsx           # Execução do checklist com timer
│   └── Corretivas/
│       ├── Listagem.jsx            # Lista de OS
│       ├── NovaOS.jsx              # Abertura de nova OS
│       └── Detalhes.jsx            # Detalhes da OS + timeline + peças
├── services/
│   ├── supabase.js                 # Cliente Supabase + helper queryOrThrow
│   ├── notifications.js            # CRUD de notificações + Realtime + Local Notif
│   ├── storage.js                  # Wrapper sobre @capacitor/preferences + filas offline
│   └── sync.js                     # Motor de sincronização offline→online
├── store/
│   ├── authStore.js                # Auth: login, logout, perfil, sessão, 24h inatividade
│   └── appStore.js                 # App: rede, filas offline, timers, notificações
├── App.jsx                         # Roteamento, guardas, back button, inicializadores
├── main.jsx
└── index.css
```

---

## Perfis de Usuário

| Funcionalidade | Mecânico | SuperAdmin |
|----------------|:--------:|:----------:|
| Ver dashboard | ✅ | ✅ |
| Ver equipamentos | ✅ | ✅ |
| Cadastrar equipamento | ❌ | ✅ |
| Ver preventivas atribuídas | ✅ | ✅ (todas) |
| Agendar preventiva | ❌ | ✅ |
| Executar checklist | ✅ | ✅ |
| Abrir OS | ✅ | ✅ |
| Editar OS própria | ✅ | ✅ (qualquer) |
| Cancelar OS | ❌ | ✅ |
| Ver Timeline da OS | ❌ | ✅ |
| Gerenciar usuários | ❌ | ✅ |
| Gerenciar estoque | ❌ | ✅ |
| Receber notificações | ✅ | ✅ |

---

## Fluxos Principais

### Login com CPF
```
Usuário digita CPF + Senha
  → fn_email_por_cpf(cpf) → e-mail interno
  → supabase.auth.signInWithPassword(email, senha)
  → _loadProfile(userId) → perfil, role, senha_alterada
  → senha_alterada = false? → Modal de troca obrigatória
  → senha_alterada = true?  → /dashboard + SecurityAlertModal
```

### Execução de Checklist Preventivo
```
Mecânico acessa agendamento com data ≤ hoje e status 'pendente'
  → Clica "Iniciar checklist"
  → INSERT checklists → status agendamento = 'em_andamento'
  → Timer inicia (cronômetro na topbar)
  → Responde itens do Admin (Conforme/Não conforme) + peças do equipamento
  → Clica "Finalizar preventiva" (todos respondidos)
  → UPDATE agendamento status = 'concluido' (operação prioritária)
  → UPDATE checklist fim_em + obs_geral
  → INSERT checklist_respostas
  → notificarAdmins() → INSERT notificacoes (fire-and-forget)
  → Tela de conclusão com duração e não-conformes
```

### Abertura e Execução de OS Corretiva
```
Usuário preenche formulário (equipamento, problema, solicitante)
  → INSERT ordens_servico (status 'em_andamento')
  → Trigger trg_log_os_criada → historico_os
  → Trigger trg_notif_os_aberta → notificacoes (SuperAdmins)
  → Mecânico preenche causa + serviços + observações (auto-save no blur)
  → Adiciona peças utilizadas (debita estoque da oficina)
  → Clica "Salvar progresso" → UPDATE OS + INSERT historico_os (ação 'atualizada')
  → Clica "Finalizar OS" → modal de confirmação
  → UPDATE status = 'concluida' + fim_em
  → Trigger trg_log_os_status_mudanca → historico_os
```

---

## Suporte Offline

O sistema suporta operação completa sem conexão:

### Fluxo Offline
1. `@capacitor/network` detecta perda de conexão → `isOnline = false`
2. Ações do usuário são enfileiradas via `@capacitor/preferences` com UUID local
3. Ao reconectar, `sync.js` processa as filas com **backoff exponencial** (2s base, dobra a cada falha)
4. Idempotência garantida por `localId` — itens já enviados são descartados (código `23505`)
5. Máximo de 5 tentativas por item

### Tipos de Fila

| Tipo | Conteúdo |
|------|----------|
| `checklist_completo` | Checklist + respostas das peças + metadados para notificação |
| `os_iniciada` | Nova OS em andamento |
| `os_completa` | OS finalizada com peças utilizadas |

### Indicadores Visuais
- Banner amarelo em todas as telas quando offline
- Badge no Dashboard indicando número de itens pendentes de sincronização

---

## Notificações em Tempo Real

```
Supabase Realtime (WebSocket)
  → Canal: notif_user_{userId}
  → Evento: INSERT na tabela notificacoes
  → appStore.addNotification(notif)    ← atualiza badge + lista
  → LocalNotifications.schedule(...)  ← push nativo (se mobile)
```

O painel lateral de notificações (`PainelNotificacoes`) desliza da direita com animação e exibe todas as notificações com tempo relativo ("há 3 min", "há 2h").

---

## Instalação e Execução

### Pré-requisitos
- Node.js ≥ 18
- npm ≥ 9
- Conta no [Supabase](https://supabase.com)
- Android Studio (para build nativo Android)

### Instalação

```bash
# Clone o repositório
git clone https://github.com/sua-org/sgm-aguia.git
cd sgm-aguia

# Instale as dependências
npm install
```

### Execução Web (desenvolvimento)

```bash
npm run dev
```

### Build para Android

```bash
# Gera o build de produção
npm run build

# Sincroniza com Capacitor
npx cap sync android

# Abre no Android Studio
npx cap open android
```

---

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-publica
VITE_APP_VERSION=1.0.0
```

> ⚠️ Nunca exponha a `service_role` key no frontend. Toda operação privilegiada (criação de usuários) é feita via Edge Function com a key do servidor.

---

<br/><br/>

---

<a name="english-version"></a>

# SGM Águia — Maintenance Management System

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite" />
  <img src="https://img.shields.io/badge/Capacitor-6-119EFF?logo=capacitor" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase" />
  <img src="https://img.shields.io/badge/Zustand-State-FF6B35" />
</p>

---

> 🇺🇸 **English** · [🇧🇷 Versão em Português acima](#sgm-águia--sistema-de-gestão-de-manutenção)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Capacitor Plugins](#capacitor-plugins)
- [Database](#database)
- [Folder Structure](#folder-structure)
- [User Roles](#user-roles)
- [Main Flows](#main-flows)
- [Offline Support](#offline-support)
- [Real-Time Notifications](#real-time-notifications)
- [Installation](#installation)
- [Environment Variables](#environment-variables)

---

## Overview

**SGM Águia** is a mobile-first (Android/iOS + Web PWA) industrial maintenance management application built for workshops and factory floors. It centralizes equipment control, scheduled preventive maintenance, and corrective service orders in a single platform, with full offline operation and automatic sync upon reconnection.

The system is designed for two roles: the **Mechanic**, who performs field tasks, and the **SuperAdmin**, who plans, monitors, and manages the entire operation.

---

## Features

### 🔐 Authentication
- Login via **CPF + Password** (no email exposed to the user)
- Mandatory password change on **first access**
- Automatic logout after **24 hours of inactivity**
- Session persistence across reloads (Zustand + Supabase Auth)
- Multi-user support on shared devices (complete cache cleanup on logout)
- Post-login security alert for shared devices

### 📊 Dashboard
- Real-time metrics: total equipment, under maintenance, open work orders, overdue preventives
- Live list of active work orders with running timers
- List of overdue preventive tasks with overdue days
- Quick admin actions (SuperAdmin only)
- Slide-in notification panel with unread badge
- Indicator for items awaiting offline sync
- Bottom Navigation for quick module access

### ⚙️ Module 1 — Equipment
- Listing with status filter (in operation / under maintenance) and name search
- Cards with cover image, status badge, and gallery counter
- Equipment registration with:
  - Upload of up to **6 images** (max. 5 MB each), stored in Supabase Storage
  - Upload of **PDF manual** (max. 30 MB) with embedded viewer (`<embed>`)
  - Registration of **equipment-specific parts** (with duplicate validation)
- Details page with interactive gallery (lightbox), thumbnails, and overlaid status badge

### 📋 Module 2 — Preventive Maintenance
- Scheduling by SuperAdmin: equipment, responsible mechanic, date, and **custom checklist items** (stored as JSONB in the database)
- Quick suggestions for checklist items to speed up scheduling
- Listing in tabs: **Pending** (includes in-progress) and **Completed**
- Access control: mechanic can only start a checklist on or after the scheduled date
- Checklist in two sections:
  - **Admin Items** (free text, configured at scheduling)
  - **Equipment Parts** (based on equipment registration)
- Each item accepts **Compliant / Non-compliant** response with an optional observation field
- Real-time progress bar during execution
- Stopwatch timer displayed in the top bar during execution
- Completion screen with total duration, non-conformity count, and offline warning
- **Automatic admin notification** upon completion, with non-conformity details
- **Auto-healing**: detects and fixes inconsistent status on load
- Re-execution blocked: after completion, the start button disappears and a "Read-only" badge is displayed

### 🔧 Module 3 — Service Orders (Corrective Maintenance)
- Open a work order with: equipment, requester, problem description, and optional stop time
- Automatic timer started at the moment of opening
- Technical field filling during execution: root cause, services performed, observations
- **Silent auto-save** on field blur (no log)
- **Explicit save progress** with entry in `historico_os` and admin notification
- Parts management:
  - Parts specific to the equipment
  - Parts from the workshop inventory (with available quantity validation)
  - Automatic stock deduction when adding
- **Timeline** exclusive to SuperAdmin: full event history of the work order
- Finalization with confirmation modal
- Work order cancellation (SuperAdmin only)
- Database trigger (`trg_log_os_status_mudanca`) automatically records status changes

### 👥 User Management *(SuperAdmin)*
- Create new users via **Supabase Edge Function** (`create-user`):
  - Sets access profile: Mechanic or SuperAdmin
  - Fields: full name, CPF (validated), ID, mother's name, email, provisional password
  - Provisional password forces change on first access (`senha_alterada = false`)
- Listing with search by name, CPF, or email
- "1st access" badge for users who haven't changed their password yet

### 📦 Inventory Management *(SuperAdmin)*
- Create and edit workshop parts with quantity control
- Cards with visual indicators: available, low stock (≤ 3), and out of stock
- Name search and stock filters
- Metrics: part types, total items, low stock, and out of stock

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   React + Vite (PWA)                    │
│                  Capacitor Shell (APK)                  │
├──────────────┬──────────────────────────┬───────────────┤
│  authStore   │       appStore           │  React Router │
│  (Zustand)   │  (Zustand + Offline)     │      v6       │
├──────────────┴──────────────────────────┴───────────────┤
│                    Supabase Client                       │
├──────────┬──────────┬───────────┬────────────────────────┤
│   Auth   │ Database │ Realtime  │  Storage  │  Functions │
│  (JWT)   │(Postgres)│(WebSocket)│ (Buckets) │  (Deno)   │
└──────────┴──────────┴───────────┴────────────────────────┘
```

### Route Guards
- **`PrivateRoute`** — requires `isAuthenticated`. Shows SplashScreen during `initAuth`.
- **`PublicOnlyRoute`** — redirects to `/dashboard` if already authenticated with password changed.
- **`SuperAdminRoute`** — restricts routes like `/dashboard/usuarios`, `/dashboard/pecas`, and `/equipamentos/novo`.

### Android Back Button Handling
`BackButtonHandler` component registers a Capacitor listener using `useRef` to avoid stale closures. On root routes (`/dashboard`, `/login`, `/`), shows a native exit confirmation dialog.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| UI Framework | React | 18 |
| Build Tool | Vite | 5 |
| Mobile Shell | Capacitor | 6 |
| Routing | React Router | 6 |
| Global State | Zustand + subscribeWithSelector | 4 |
| Backend/BaaS | Supabase | 2 |
| Database | PostgreSQL (via Supabase) | 15 |
| Local Storage | @capacitor/preferences | 6 |
| Fonts | DM Sans (Google Fonts) | — |
| Styling | CSS-in-JS (inline styles) | — |

---

## Capacitor Plugins

| Plugin | Purpose |
|--------|---------|
| `@capacitor/app` | Android Back button listener; `exitApp()` on confirmation |
| `@capacitor/dialog` | Native confirmation dialog for app exit |
| `@capacitor/network` | Connectivity detection; triggers sync on reconnect |
| `@capacitor/preferences` | Offline queue persistence and last sync timestamp |
| `@capacitor/local-notifications` | Native push notifications on mobile when receiving Realtime events |

---

## Database

### Main Tables

#### `usuarios`
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK, linked to Supabase Auth |
| `nome_completo` | TEXT | Full name |
| `cpf` | TEXT | CPF (11 digits, unique) |
| `email` | TEXT | Email (unique) |
| `role` | TEXT | `'mecanico'` or `'superadmin'` |
| `senha_alterada` | BOOLEAN | `false` on creation; `true` after first access |

#### `equipamentos`
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `nome` | TEXT | Equipment name |
| `descricao` | TEXT | Optional description |
| `status` | TEXT | `'em_operacao'` or `'em_manutencao'` |
| `imagens_urls` | TEXT[] | Array of public URLs (Supabase Storage) |
| `manual_url` | TEXT | Public PDF URL in Storage |
| `criado_por` | UUID | FK → `usuarios.id` |

#### `agendamentos_preventivos`
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `equipamento_id` | UUID | FK → `equipamentos.id` |
| `mecanico_id` | UUID | FK → `usuarios.id` |
| `data_agendada` | DATE | Maintenance date |
| `status` | TEXT | `'pendente'`, `'em_andamento'`, `'concluido'`, `'cancelado'` |
| `itens_checklist` | JSONB | Array of strings with Admin-defined checklist points |

#### `ordens_servico`
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `equipamento_id` | UUID | FK → `equipamentos.id` |
| `mecanico_id` | UUID | FK → `usuarios.id` |
| `solicitante` | TEXT | Name of person who opened the ticket |
| `problema` | TEXT | Fault description |
| `causa` | TEXT | Identified root cause |
| `servicos_executados` | TEXT | Description of services performed |
| `status` | TEXT | `'em_andamento'`, `'concluida'`, `'cancelada'` |
| `inicio_em` | TIMESTAMPTZ | Work order opening |
| `fim_em` | TIMESTAMPTZ | Work order completion |

#### `historico_os`
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `os_id` | UUID | FK → `ordens_servico.id` |
| `usuario_id` | UUID | FK → `usuarios.id` |
| `acao` | TEXT | `'criada'`, `'atualizada'`, `'concluida'`, `'cancelada'`, `'peca_adicionada'`, `'reaberta'` |
| `descricao` | TEXT | Detailed description of the action |
| `data_registro` | TIMESTAMPTZ | Event timestamp |

#### `notificacoes`
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → `usuarios.id` (recipient) |
| `tipo` | TEXT | `'os_aberta'`, `'os_concluida'`, `'preventiva_concluida'`, etc. |
| `titulo` | TEXT | Notification title |
| `mensagem` | TEXT | Message body |
| `link` | TEXT | Destination route on click |
| `lida` | BOOLEAN | Read status |

### Database Triggers
| Trigger | Event | Action |
|---------|-------|--------|
| `trg_log_os_criada` | INSERT on `ordens_servico` | Inserts into `historico_os` with action `'criada'` |
| `trg_log_os_status_mudanca` | UPDATE `status` on `ordens_servico` | Inserts into `historico_os` with the corresponding action |
| `trg_notif_os_aberta` | INSERT on `ordens_servico` | Notifies all SuperAdmins |
| `trg_notif_os_atualizada` | UPDATE on `ordens_servico` | Notifies all SuperAdmins |

### RPC Functions
| Function | Description |
|----------|-------------|
| `fn_email_por_cpf(p_cpf)` | Returns the user's email by CPF (used at login) |

### Supabase Storage Buckets
| Bucket | Content | Max size |
|--------|---------|----------|
| `equipamentos-imagens` | Equipment photos | 5 MB/file |
| `manuais` | PDF manuals | 30 MB/file |

### Edge Functions
| Function | Description |
|----------|-------------|
| `create-user` | Atomically creates user in Supabase Auth and inserts profile into `usuarios`, with rollback on failure |

---

## Folder Structure

```
src/
├── assets/
│   └── logo_empresa.png
├── components/
│   └── common/
│       └── CardEquipamento.jsx     # Reusable equipment card
├── pages/
│   ├── Login/
│   │   └── Login.jsx               # Login screen + password and security modals
│   ├── Dashboard/
│   │   ├── Painel.jsx              # Main dashboard + notifications
│   │   ├── Usuarios.jsx            # User management (SuperAdmin)
│   │   └── Pecas.jsx               # Parts inventory (SuperAdmin)
│   ├── Equipamentos/
│   │   ├── Listagem.jsx            # Equipment list
│   │   ├── Cadastro.jsx            # Equipment registration
│   │   └── Detalhes.jsx            # Details, gallery, and PDF manual
│   ├── Preventivas/
│   │   ├── Listagem.jsx            # Schedule list + scheduling modal
│   │   └── Checklist.jsx           # Checklist execution with timer
│   └── Corretivas/
│       ├── Listagem.jsx            # Work order list
│       ├── NovaOS.jsx              # Open new work order
│       └── Detalhes.jsx            # Work order details + timeline + parts
├── services/
│   ├── supabase.js                 # Supabase client + queryOrThrow helper
│   ├── notifications.js            # Notification CRUD + Realtime + Local Notif
│   ├── storage.js                  # Wrapper over @capacitor/preferences + offline queues
│   └── sync.js                     # Offline→online sync engine
├── store/
│   ├── authStore.js                # Auth: login, logout, profile, session, 24h inactivity
│   └── appStore.js                 # App: network, offline queues, timers, notifications
├── App.jsx                         # Routing, guards, back button, initializers
├── main.jsx
└── index.css
```

---

## User Roles

| Feature | Mechanic | SuperAdmin |
|---------|:--------:|:----------:|
| View dashboard | ✅ | ✅ |
| View equipment | ✅ | ✅ |
| Register equipment | ❌ | ✅ |
| View assigned preventives | ✅ | ✅ (all) |
| Schedule preventive | ❌ | ✅ |
| Execute checklist | ✅ | ✅ |
| Open work order | ✅ | ✅ |
| Edit own work order | ✅ | ✅ (any) |
| Cancel work order | ❌ | ✅ |
| View Work Order Timeline | ❌ | ✅ |
| Manage users | ❌ | ✅ |
| Manage inventory | ❌ | ✅ |
| Receive notifications | ✅ | ✅ |

---

## Main Flows

### CPF Login
```
User enters CPF + Password
  → fn_email_por_cpf(cpf) → internal email
  → supabase.auth.signInWithPassword(email, password)
  → _loadProfile(userId) → profile, role, senha_alterada
  → senha_alterada = false? → Mandatory password change modal
  → senha_alterada = true?  → /dashboard + SecurityAlertModal
```

### Preventive Checklist Execution
```
Mechanic opens schedule with date ≤ today and status 'pendente'
  → Clicks "Start checklist"
  → INSERT checklists → schedule status = 'em_andamento'
  → Timer starts (stopwatch in top bar)
  → Answers Admin items (Compliant/Non-compliant) + equipment parts
  → Clicks "Finalize preventive" (all items answered)
  → UPDATE schedule status = 'concluido' (priority operation)
  → UPDATE checklist fim_em + obs_geral
  → INSERT checklist_respostas
  → notifyAdmins() → INSERT notificacoes (fire-and-forget)
  → Completion screen with duration and non-conformities
```

### Opening and Executing a Corrective Work Order
```
User fills form (equipment, problem, requester)
  → INSERT ordens_servico (status 'em_andamento')
  → Trigger trg_log_os_criada → historico_os
  → Trigger trg_notif_os_aberta → notificacoes (SuperAdmins)
  → Mechanic fills root cause + services + observations (auto-save on blur)
  → Adds parts used (deducts from workshop stock)
  → Clicks "Save progress" → UPDATE OS + INSERT historico_os (action 'atualizada')
  → Clicks "Finalize Work Order" → confirmation modal
  → UPDATE status = 'concluida' + fim_em
  → Trigger trg_log_os_status_mudanca → historico_os
```

---

## Offline Support

The system supports full operation without a connection:

### Offline Flow
1. `@capacitor/network` detects connection loss → `isOnline = false`
2. User actions are queued via `@capacitor/preferences` with a local UUID
3. On reconnect, `sync.js` processes queues with **exponential backoff** (2s base, doubles on each failure)
4. Idempotency guaranteed by `localId` — already-sent items are discarded (code `23505`)
5. Maximum of 5 attempts per item

### Queue Types

| Type | Content |
|------|---------|
| `checklist_completo` | Checklist + part responses + metadata for notification |
| `os_iniciada` | New in-progress work order |
| `os_completa` | Completed work order with parts used |

### Visual Indicators
- Yellow banner on all screens when offline
- Badge on Dashboard indicating number of items pending sync

---

## Real-Time Notifications

```
Supabase Realtime (WebSocket)
  → Channel: notif_user_{userId}
  → Event: INSERT on notificacoes table
  → appStore.addNotification(notif)    ← updates badge + list
  → LocalNotifications.schedule(...)  ← native push (if mobile)
```

The slide-in notification panel (`PainelNotificacoes`) slides in from the right with animation and displays all notifications with relative time ("3 min ago", "2h ago").

---

## Installation

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9
- [Supabase](https://supabase.com) account
- Android Studio (for native Android build)

### Install

```bash
# Clone the repository
git clone https://github.com/your-org/sgm-aguia.git
cd sgm-aguia

# Install dependencies
npm install
```

### Run (Web Development)

```bash
npm run dev
```

### Build for Android

```bash
# Generate production build
npm run build

# Sync with Capacitor
npx cap sync android

# Open in Android Studio
npx cap open android
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_APP_VERSION=1.0.0
```

> ⚠️ Never expose the `service_role` key in the frontend. All privileged operations (user creation) are handled via Edge Function with the server-side key.

---

<p align="center">
  Built with ❤️ for industrial maintenance teams
</p>
