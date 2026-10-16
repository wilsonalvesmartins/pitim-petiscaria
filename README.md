# 🍢 Petiscaria Pitim - Comanda Presencial na Mesa & Delivery Integrados

Sistema unificado e moderno de **Comanda Digital Presencial por Mesas**, **Cardápio Delivery com Autocomplete** e **Painel Master Integrado** com alertas sonoros e impressão de comanda para a **Pitim Petiscaria & Espetos**.

---

## 🌐 Links de Acesso Rápido

| Canal de Atendimento | Link Direto | Descrição |
| :--- | :--- | :--- |
| 🪑 **Comanda Presencial (Mesa)** | [comanda-pitim.187.77.41.37.sslip.io](http://comanda-pitim.187.77.41.37.sslip.io) ou [/comanda](http://pitim.187.77.41.37.sslip.io/comanda) | Para os clientes sentados nas mesas do estabelecimento |
| 🛵 **Delivery & Balcão** | [pitim.187.77.41.37.sslip.io](http://pitim.187.77.41.37.sslip.io) ou [/delivery](http://pitim.187.77.41.37.sslip.io/delivery) | Para pedidos de entrega em domicílio e retirada |
| 🔒 **Painel Master / Caixa** | [pitim.187.77.41.37.sslip.io/acesso](http://pitim.187.77.41.37.sslip.io/acesso) | **Login:** `admin` \| **Senha:** `admin123` |
| 📦 **Repositório GitHub** | [wilsonalvesmartins/pitim-petiscaria](https://github.com/wilsonalvesmartins/pitim-petiscaria) | Integração contínua e deploy automático via Coolify |

*(Domínios oficiais pré-configurados: `https://comanda.cajuru.cloud` e `https://pitim.cajuru.cloud`).*

---

## 📋 Visão Geral da Arquitetura Unificada

O sistema unifica os dois fluxos de vendas em um único backend Node.js de alta performance e banco de dados SQLite WAL persistente:

1. **Cardápio e Preços Compartilhados:** A alteração de preço ou ativação/pausa de qualquer item (espetos, porções, bolinhos e bebidas) no Painel Master reflete em tempo real tanto no consumo presencial nas mesas quanto no delivery.
2. **Mesmo Painel Master (`/acesso`):**
   - Gerencia mesas ativas presenciais (comandas por cliente, totais e fechamento de conta).
   - Gerencia pedidos de delivery (kanban de status, despachar entrega, WhatsApp e comanda térmica 80mm).
   - Notificação sonora unificada (**Web Audio API Chime Synth**) para novos pedidos de delivery, pedidos de mesa e chamados de garçom.
   - Banner de chamados urgentes no topo com alerta pulsante quando qualquer mesa pede o fechamento da conta.

---

## ✨ Funcionalidades Detalhadas

### 1. 🪑 Comanda Presencial na Mesa (`/comanda` ou `comanda-pitim...`)
- **Identificação da Mesa:** O cliente escolhe sua mesa (Mesa 01 a 15, Balcão ou personalizada) e digita seu nome.
- **Comandas Separadas na Mesma Mesa:** Várias pessoas podem sentar na mesma mesa e ter comandas separadas com total privacidade sobre o que cada um consumiu.
- **Janela Deslizante de 12 Horas:** Histórico de consumo filtra as últimas 12 horas, garantindo segurança na virada de turnos e clientes na madrugada.
- **Acompanhamento de Status:** O cliente acompanha o status de cada item em tempo real (*Recebido*, *Em preparo*, *Entregue*).
- **Opções de Fechamento da Conta:**
  - **"Fechar Minha Comanda":** Solicita a presença do garçom para cobrar o valor individual daquele cliente.
  - **"Fechar Comanda da Mesa Inteira":** Consolida todos os clientes da mesa e notifica o caixa com o valor total da mesa toda.
- **Navegação Rápida:** Botão no topo para alternar para a modalidade Delivery com um clique.

### 2. 🛵 Cardápio Delivery & Retirada (`/delivery` ou `pitim...`)
- **Autocomplete por WhatsApp:** O cliente digita o telefone `(XX) XXXXX-XXXX` e o sistema preenche automaticamente Nome, Rua, Bairro, Número e Complemento salvos em pedidos anteriores.
- **Modalidade Flexível:** Alternância entre Entrega em Domicílio (com taxa configurável) ou Retirada no Balcão (taxa R$ 0,00).
- **Formas de Pagamento:** PIX, Dinheiro (com campo de troco) e Cartões.
- **Disparo HTTP Direto (Chatwoot):** Envio nativo imediato de notificações webhook/HTTP sem intermediários.
- **Meus Pedidos:** Consulta em tempo real do status do pedido (*Pendente*, *Em Preparo*, *Saiu para Entrega*, *Concluído*).
- **Navegação Rápida:** Botão no topo para alternar para Comanda na Mesa com um clique.

### 3. 🔒 Painel Master Integrado (`/acesso`)
- **Autenticação Segura:** Usuário `admin` / Senha `admin123`.
- **Alerta Sonoro em Tempo Real:** Sintetizador Web Audio API multi-tom (D5/A5) que toca automaticamente ao entrar novos pedidos de mesa, delivery ou chamados de garçom.
- **Banner de Chamadas Urgentes:** Notificação em destaque pulsante no topo para solicitações de fechamento de mesa ou chamados de garçom com botões de atendimento direto.
- **Abas do Painel:**
  - 🪑 **Mesas & Comandas:** Grid de mesas ativas, comandas individuais por cliente, visualização de itens, botões para dar baixa em comanda individual ou fechar mesa completa com registro de forma de pagamento (PIX, Dinheiro, Débito, Crédito).
  - 🛵 **Delivery & Balcão:** Kanban de pedidos de entrega com atalho direto para WhatsApp do cliente e impressão térmica (80mm).
  - 📋 **Feed Geral:** Linha do tempo unificada de todos os pedidos realizados no dia.
  - ➕ **Lançamento Manual:** Garçom ou operador do caixa pode lançar pedidos diretamente para qualquer mesa ou delivery.
  - 🍢 **Cardápio & Preços:** Edição de preços em tempo real com atualização imediata no cardápio público, adição de novos itens e pausa/ativação.
  - ⚙️ **Configurações:** Controle de abertura/fechamento da casa, taxa de entrega, chave PIX e configuração de disparo HTTP.
