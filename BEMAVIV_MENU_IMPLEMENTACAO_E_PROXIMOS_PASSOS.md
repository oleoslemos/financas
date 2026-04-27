# Bem Aviv — Implementação do menu e próximos passos

Documento de referência do módulo **Bem Aviv** com:
- o que já está implementado no menu e nas telas;
- próximos passos recomendados para consolidar o fluxo.

## Visão geral do menu Bem Aviv

O menu principal **Bem Aviv** está implementado no layout global, com dropdown e navegação para:
- Visão geral
- Pedidos de vendas / orçamento
- Clientes
- Follow-up
- Produtividade follow-up
- Produtos (catálogo)
- Produtos old (todos)
- Cadastros
  - Categorias
  - Tabela de preço (catálogo)
  - Catálogos em grade

## O que já está implementado por item do menu

### 1) Visão geral
- Tela de entrada do módulo com cards de acesso rápido para todas as áreas.
- Cards separados para estrutura nova (catálogo) e estrutura legada (gold/old).

### 2) Clientes
- CRUD de clientes (cadastro, edição e exclusão).
- Campos de dados pessoais, contatos e endereço.
- Busca de CEP via ViaCEP para preenchimento de endereço.
- Persistência em `bem_aviv_clients` no Supabase.
- Normalização de texto e máscara de CPF/telefone/CEP no front.

### 3) Follow-up
- Listagem de clientes com filtros por:
  - texto (nome/telefone),
  - status do follow-up,
  - janela de data (todos, vencidos, hoje, próximos 7, sem agendamento).
- Registro de contato realizado (histórico em `bem_aviv_client_followups`).
- Agendamento de próximo follow-up com nota e status.
- Atualização de etapa comercial e status de cliente.
- Atalho para WhatsApp.

### 4) Produtividade follow-up
- Painel com métricas de follow-up (vencidos, hoje, próximos 7 dias).
- Filtro de período (mês atual/passado/próximo e janelas móveis).
- Distribuição por etapa comercial.
- Lista de prioridades com os próximos atendimentos.
- Modal de histórico por cliente com inclusão de novas interações.

### 5) Produtos (catálogo) — fluxo novo
- CRUD de produtos de catálogo em `bem_aviv_offer_products`.
- Modos de preço:
  - `UNICO`
  - `GRADE` (variações por código/dimensão/preço).
- Vinculação de produto a tabela de preço nova (`bem_aviv_offer_price_tables`).
- Sincronização automática de variações para itens da tabela (`bem_aviv_offer_price_table_items`).
- Filtros por nome, categoria, linha, tipo e modo.
- Recurso de duplicar produto.
- Tratamento explícito de erro quando migration de catálogo não está aplicada.

### 6) Produtos old (todos) — fluxo legado
- CRUD de produtos legados em `bem_aviv_products`.
- Filtros por categoria/linha/nome/dimensão/tabela.
- Estrutura por categorias tradicionais (plataforma, cabeceiras, bases/camas, acessórios).
- Rotas legadas segmentadas (`/plataforma-de-descanso`, `/cabeceiras`, etc.).

### 7) Pedidos de vendas / orçamento
- CRUD de documentos em `bem_aviv_sales_orders` com tipos:
  - orçamento,
  - pedido.
- Montagem de itens com base no catálogo (`bem_aviv_offer_products` + variações).
- Cálculo de totais, desconto, frete, entrada e parcelas.
- Opções de pagamento à vista / a prazo e meios de pagamento.
- Conversão e estados operacionais de orçamento/pedido.

### 8) Cadastros > Categorias
- CRUD básico de categorias em `bem_aviv_categories`.

### 9) Cadastros > Tabela de preço (catálogo) — fluxo novo
- CRUD de tabelas de preço em `bem_aviv_offer_price_tables`.
- Definição de tabela padrão (`is_default`).
- Clonagem de tabela e exclusão.
- Edição de preço por item.
- Edição em lote para produtos em grade (modal por variação).
- Ação para aplicar tabela em todos os produtos do catálogo com sincronização de payload.

### 10) Cadastros > Catálogos em grade
- CRUD de catálogos (`bem_aviv_price_catalogs`) com padrão (`is_default`).
- Abertura de detalhe por catálogo.
- Criação de blocos por catálogo (`bem_aviv_catalog_products`).
- Construção de matriz 2D por bloco:
  - eixos linha/coluna,
  - valores dos eixos,
  - células de preço (`bem_aviv_catalog_price_cells`),
  - opcionais/adicionais (`bem_aviv_catalog_addons`).

## Rotas já configuradas

As rotas do módulo estão registradas no app para todas as telas acima, incluindo:
- home do Bem Aviv;
- clientes, follow-up e produtividade;
- produtos catálogo e produtos legacy;
- pedidos;
- categorias;
- tabela de preço legacy e tabela de preço catálogo;
- catálogos em grade, detalhe de catálogo e matriz por bloco.

## Próximos passos recomendados para o menu Bem Aviv

### Prioridade alta (organização funcional)
1. **Unificar nomenclatura do menu**
   - Trocar rótulos temporários como `Produtos old (todos)` por nomes padronizados (ex.: “Produtos (legado)”).
   - Alinhar nomes entre menu superior e cards da home.

2. **Separar visualmente novo x legado**
   - Criar grupos explícitos no menu (ex.: “Fluxo atual” e “Legado”).
   - Reduzir risco de uso da tela errada por usuários operacionais.

3. **Definir rota canônica para produtos**
   - Hoje coexistem dois fluxos (`produtos-catalogo` e `produtos`).
   - Registrar decisão: manter ambos por transição ou descontinuar o legado.

### Prioridade média (consistência de dados)
4. **Plano de migração do legado para catálogo**
   - Mapear `bem_aviv_products` -> `bem_aviv_offer_products`.
   - Definir estratégia para reaproveitar tabelas e itens de preço legados.

5. **Validações cruzadas entre pedidos e preços**
   - Garantir que alterações de tabela não causem divergência em pedidos em aberto.
   - Definir regra de “snapshot” de preço no momento do orçamento/pedido.

6. **Governança de padrão de tabela/catálogo**
   - Revisar comportamento quando troca tabela padrão e catálogo padrão.
   - Criar regra operacional para evitar mudança acidental em produção.

### Prioridade média/baixa (UX e manutenção)
7. **Padronizar UX de edição**
   - Substituir prompts nativos por modais/formulários consistentes.
   - Uniformizar mensagens de confirmação, erro e sucesso.

8. **Melhorar telemetria operacional**
   - Adicionar indicadores na home do Bem Aviv (resumo de pendências e atalho para ações críticas).

9. **Cobertura de testes**
   - Incluir testes de regressão dos fluxos principais:
     - cadastro de produto catálogo,
     - sincronização de tabela de preço,
     - fluxo orçamento -> pedido.

### Próximo passo sugerido (execução rápida)
- Fazer uma primeira limpeza de menu em 1 PR curto:
  - renomear itens “old/legado”,
  - agrupar seções “Atual” e “Legado”,
  - ajustar textos da home para refletir a decisão de uso.

