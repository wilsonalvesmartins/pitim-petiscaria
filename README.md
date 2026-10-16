# 🍢 Pitim Petiscaria & Espetos - Sistema TV Box & Painel Remoto

Sistema desenvolvido sob medida para a **Petiscaria do Pitim**, projetado para rodar em **TV BOX (Smart TV / Navegador em 1080p)** e ser controlado em tempo real via smartphone ou computador pelo link `/acesso`.

---

## 📺 1. Funcionalidades da TV (`/`)

- **Exibição Widescreen (1080p 16:9)**: Otimizada para navegadores de TV BOX (Android TV, Chrome, Silk).
- **Destaques da Casa (Carrossel de Propagandas em Loop)**:
  - Suporta **Vídeos** (MP4, WebM) e **Fotos** (PNG, JPEG, WebP).
  - **Se for vídeo**: Reproduz até o final do vídeo automaticamente antes de passar para o próximo.
  - **Se for foto**: Fica na tela pelo tempo em segundos configurado no painel.
  - Barra de progresso visual em tempo real na base do card de propaganda.
- **Player de Música & Clipes do YouTube**:
  - Integração nativa com a API oficial do YouTube IFrame.
  - Reproduz os links/músicas adicionados na fila de reprodução.
  - Quando a fila esvazia, entra automaticamente em loop na playlist ambiente da petiscaria sem interrupções.
  - Barra animada de equalizador de áudio e identificação da música tocando no momento.
- **Logo Animada do Pitim**:
  - Logo circular oficial com **fundo removido** e borda dourada.
  - Efeito suave de levitação (`float`), respiração e aura neon de fogo com brasas flutuantes subindo na tela.
- **Cardápio Digital & QR Code**:
  - QR Code dinâmico em alta definição apontando para o cardápio digital / WhatsApp.
  - Título customizável (Padrão: *"Faça seu pedido:"*).
- **Letreiro Rodapé (Ticker)**:
  - Mensagem contínua animada com avisos, senha do Wi-Fi e novidades da casa.
  - Relógio digital com horário de Brasília atualizado a cada segundo.

---

## 📱 2. Controle Remoto & Painel Admin (`/acesso`)

- **Acesso Seguro**:
  - **Usuário**: `admin`
  - **Senha**: `admin123`
- **Controle da Música em Tempo Real (WebSockets)**:
  - Botão **⏭️ Pular Música**: Avança imediatamente para o próximo vídeo da fila na TV.
  - Botão **⏸️ Pausar / ▶️ Retomar**.
  - **Controle de Volume da TV (0 a 100%)**: Ajusta o volume da televisão diretamente pelo celular.
  - **Adicionar à Fila**: Basta colar qualquer link do YouTube (vídeo, shorts ou playlist).
  - Lista da fila com opção de remover itens.
- **Gerenciador de Propagandas**:
  - Upload de arquivos de vídeo e fotos direto para o servidor.
  - Definição de tempo de exibição em segundos para imagens.
  - Botão de pausar/ativar ou excluir propagandas.
- **Configurações Gerais**:
  - Alterar o link do QR Code (Cardápio Anota AI, iFood, WhatsApp, etc.).
  - Alterar texto acima do QR Code.
  - Alterar o texto do letreiro rodapé.
  - Alterar a playlist padrão do YouTube.
  - Alterar a senha de acesso.

---

## 🚀 3. Deploy no Coolify (VPS)

O projeto está configurado para o Coolify (`coolify.cajuru.cloud`) no projeto **Pitim Petiscaria**:
- Servidor: `187.77.41.37` (localhost host)
- Script de Deploy Automatizado: `python deploy_to_coolify.py`
- Docker Compose: `docker-compose.yml`

Para rodar localmente com Docker:
```bash
docker compose up -d
```
Acesse:
- **TV**: http://localhost:8000
- **Controle Remoto**: http://localhost:8000/acesso
