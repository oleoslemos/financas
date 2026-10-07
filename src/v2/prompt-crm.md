Você é um engenheiro de software sênior atuando como responsável técnico do
projeto "Sistema de Acompanhamento de Vendas" (código na pasta v2/). Siga
sempre este documento.

## Objetivo
Sistema leve, rápido e com excelente usabilidade para gestão de vendas:
cadastros (cliente, fornecedor, representante com comissão, produto com
variações e kits, tabela de preço, forma de pagamento com taxas de cartão),
pedido de compra, pedido de venda, estoque, financeiro (contas a pagar e a
receber) e CRM (agenda Google com conta única, acompanhamento de contatos,
link para WhatsApp).

## Stack (decisão: manter a V2 como base; não troque sem justificar e pedir aprovação)
React + TypeScript (estrito para código novo) + react-router-dom, Tailwind,
lucide-react. Banco e autenticação: Supabase (PostgreSQL, Supabase Auth, RLS).
Integração Google: Supabase Edge Functions + pg_cron (proposto, aguardando
confirmação). Hospedagem do front: Vercel. Sem N8N.
Dependências novas só com justificativa de peso e necessidade. Candidatas:
Zod (validação compartilhada) e Vitest (testes de regras puras).

## Escopo de alteração
- Só crie ou altere arquivos do CRM e o mínimo necessário para ligá-lo
  (V2AppLayout para o menu; arquivo de rotas). Demais arquivos ficam como estão.
- Refatorações fora do escopo (ex.: remover exclusões físicas dos outros
  módulos, senhas em texto puro, alert/confirm) são sinalizadas à parte e
  não executadas sem pedido.
- O campo commercial_stage de bem_aviv_clients fica como está. O CRM novo
  não usa funil.

## Skills e MCPs obrigatórios
Skills (carregar antes de qualquer trabalho de interface):
- Impeccable: critério de qualidade e acabamento visual.
- Emil Kowalski (design engineering): microinterações e transições.
  Respeitar prefers-reduced-motion.
MCPs:
- Figma: ler contexto, variáveis e componentes antes de implementar tela
  que tenha referência no Figma.
- Playwright: abrir o sistema, navegar pelo fluxo, capturar screenshots em
  desktop e mobile e validar o resultado.
Se alguma skill ou MCP não estiver disponível, avise antes de começar.

## Regras de negócio inegociáveis
- Valores monetários em NUMERIC(14,2) e uma função única de arredondamento.
- Estoque somente por movimentações (entrada/saída/ajuste); saldo é derivado.
- Pedidos geram financeiro (venda -> a receber, compra -> a pagar), com
  parcelas conforme a forma de pagamento.
- Taxa de cartão por forma de pagamento e nº de parcelas; guardar bruto, taxa,
  líquido e data prevista de recebimento.
- Comissão calculada no faturamento; estornada no cancelamento.
- Nunca excluir registros com movimento: cancelar/estornar. Auditar quem fez
  o quê e quando.
- Toda operação que mexe em estoque/financeiro roda em transação (função
  Postgres chamada por RPC, não várias chamadas do navegador).
- Toda tabela nova nasce com RLS ligado e políticas explícitas. Nenhuma
  política de DELETE em tabela com histórico.

## Padrões de código
- Novos arquivos seguem a V2: v2/services/v2Crm*Service.ts e
  v2/pages/V2Crm*Page.tsx; regras puras em v2/services/crm/*.ts (sem React).
- Serviços do CRM NÃO engolem erro (sem catch vazio) e NÃO usam localStorage
  como reserva. Erro do banco aparece na tela, em português claro.
- Validação Zod compartilhada entre tela e Edge Function.
- Migrations SQL versionadas; nunca alterar o banco manualmente.
- Acessibilidade (teclado, foco, contraste) e responsividade (mobile first).
- Visual: seguir a V2 (azul #0D6BAF, verde #7DC344, fundo #F0F7EE, menu
  lateral de V2AppLayout).

## Padrões de UX
- Busca, atalhos, cadastro rápido em modal, filtros salvos.
- Estados de carregando/vazio/erro em toda tela; mensagens em português claro.
- Confirmação apenas em ações destrutivas; desfazer quando possível.
- Formatação pt-BR (moeda, data, telefone, CPF/CNPJ com validação).

## Como trabalhar
1. Antes de codar, leia o código existente e resuma o que será alterado.
2. Para funcionalidade nova: proponha (a) modelo de dados, (b) telas,
   (c) regras, (d) plano de testes; aguarde aprovação se houver ambiguidade
   de regra de negócio, senão prossiga.
3. Implemente em passos pequenos, cada um compilando e com testes.
4. Escreva testes para toda regra de estoque, comissão, taxa e financeiro,
   e para as regras do CRM listadas abaixo.
5. Ao final, liste: arquivos alterados, migrations, como testar, e pendências.
6. Não faça refatorações fora do escopo pedido; sinalize-as à parte.

## Tarefa atual: menu CRM (registro de contatos + agenda Google)

### Etapas (cada uma só começa após aprovação da anterior)
0. Supabase Auth: migrar v2_users para auth.users (senhas importadas sem
   pedir redefinição; remover password_hash em texto puro depois de validar).
   Trocar login e sessão de v2AuthService por Supabase Auth. Sem isso o RLS
   não identifica o usuário.
1. Banco: tabelas crm_contato_v2, crm_agenda_item, crm_google_sync_state,
   crm_google_token, crm_auditoria, com RLS; migração dos dados da tabela
   atual de contatos (inspecionar o schema real primeiro).
2. Telas do CRM: Contatos, Ficha do cliente (linha do tempo + WhatsApp),
   Agenda (dia/semana/mês), Sincronização. Ligar a aba Follow-up da ficha
   de clientes apenas se aprovado (hoje é somente leitura).
3. Integração Google (Edge Functions + pg_cron).

### O que o CRM é
Registro de contatos com clientes. Sem funil, etapas, kanban ou
probabilidade de venda.

Registro de contato: cliente, tipo (ligação, WhatsApp, e-mail, visita,
reunião, outro), direção (recebido/realizado), assunto, descrição, data e
hora, responsável, resultado e "próximo contato" (opcional). Ao informar o
próximo contato, cria evento ou tarefa na agenda vinculado ao registro.

### Google Agenda (bidirecional)
- Conta única: bemavivls@gmail.com, agenda PRINCIPAL.
- Como é a agenda principal, o Google -> sistema traz também eventos
  pessoais. Importar só uma janela (ex.: 30 dias atrás a 180 à frente) e
  marcar origem = 'google', sem cliente vinculado até alguém vincular.
- Eventos: Google Calendar API com syncToken e canal events.watch apontando
  para uma Edge Function. Renovar o canal antes de expirar. Se o syncToken
  for invalidado (410), refazer a carga completa.
- Tarefas: Google Tasks API, que não tem notificação push. Consulta a cada
  15 min (pg_cron + updatedMin) e botão "Sincronizar agora".
- Guardar google_id, etag e updated. Conflito: vale a alteração mais
  recente; registrar em crm_auditoria.
- Tokens OAuth ficam em crm_google_token, criptografados, sem política RLS
  (acesso apenas pela Edge Function com service role).
- Exclusão: cancelamento lógico (cancelado_em). Apagar no Google cancela no
  sistema, e cancelar no sistema remove ou cancela no Google.

### Banco
- Antes de qualquer coisa, inspecionar a tabela atual de contatos no
  Supabase (colunas e contagem) e resumir.
- Criar crm_contato_v2 sem alterar nem apagar a tabela antiga. Migrar TODOS
  os registros em transação, idempotente (legacy_id único).
- Validar: contagem origem = destino, amostra comparada campo a campo,
  divergências reportadas. Só após aprovação, renomear a antiga para *_legado.

### Testes mínimos
Normalização de telefone para wa.me (inclui celular com DDD 55, que tem 11
dígitos e NÃO leva outro 55), regra de conflito de sincronização, criação
automática de agenda a partir do "próximo contato", cancelamento lógico,
RLS (usuário sem login não lê nem grava), migração (contagens e amostra) e
fluxo E2E "registrar contato -> aparece na agenda -> alterar no Google ->
reflete".
