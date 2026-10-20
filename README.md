# Aprova All Toral

Central de aprovação de posts e anúncios do ALL TORAL, com os stickers do Larot.

- **Painel do estúdio** (`/admin`): protegido por senha. Você cadastra clientes de **redes sociais** (posts, anúncios e planejamento) ou de **produtos digitais** (sites, páginas de venda e apps), e o **guia visual** de cada um.
- **Página do cliente** (`/c/<link-secreto>`): cada cliente recebe um link que abre só a página dele. Ele toca no sticker e o status muda na hora. Em "Precisa de ajustes" abre a caixa de comentário.
- A separação é feita no servidor: um link nunca devolve dados de outro cliente. Para cortar o acesso, use "gere um link novo" na página do cliente.

Roda no **Cloudflare** (plano grátis): o servidor é um Worker e os dados, artes e vídeos ficam num banco D1.

## Como publicar (uma vez só)

1. **Crie a conta** grátis em [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Crie o banco:** no menu, **Storage & databases → D1 SQL database → Create database**. Nome: `aprova`. Depois de criar, copie o **Database ID**.
3. **Cole o ID:** no GitHub, abra o arquivo `wrangler.toml`, troque `COLE_AQUI_O_DATABASE_ID` pelo ID copiado e salve (Commit changes).
4. **Conecte o repositório:** no Cloudflare, **Workers & Pages → Create → Import a repository**, conecte o GitHub e escolha o repositório `aprova`. Deixe as configurações como vierem (o comando de deploy é `npx wrangler deploy`) e clique em **Deploy**.
5. **Crie a senha do painel:** acesse `https://aprova.<seu-subdominio>.workers.dev/admin`. No primeiro acesso aparece a tela **Crie a senha do painel**. Defina a senha e pronto, você já entra. Nos próximos acessos ela é pedida para entrar.

A partir daí, toda alteração enviada ao GitHub é publicada sozinha. A senha e o banco continuam intactos entre publicações.

## Uso no dia a dia

1. No painel, clique em **Novo cliente**, marque as redes que o estúdio cuida e salve. Depois envie o logo.
2. **+ Nova peça**: rede, orgânico ou anúncio pago, formato, artes ou vídeo (com capa), legenda e, se for anúncio, a segmentação.
3. **Salvar rascunho** deixa escondido do cliente. **Enviar para o cliente** publica.
4. **Copiar link do cliente** e mande para ele.
5. Quando pedirem ajuste, edite a peça e use **Enviar nova versão para aprovação**.

## Produtos digitais (sites, páginas de venda e apps)

1. Em **Novo cliente**, escolha **Produtos digitais** e marque o que o estúdio faz (site, página de vendas, aplicativo, sistema).
2. Na página do cliente, **+ Nova entrega**: tipo, nome e o **link do site no ar** (GitHub Pages, Netlify, Vercel ou Cloudflare). O link do repositório (github.com) não abre dentro de outra página; o Aprova sugere o endereço do GitHub Pages.
3. Opcional: envie **telas** (prints da página inteira). O cliente circula direto na imagem.
4. O cliente abre o projeto no modo **Computador** ou **Celular**, toca em **Circular e comentar**, circula o ponto e escreve a consideração. Você responde e marca como **resolvido**. Para mandar os ajustes, edite a entrega e use **Enviar nova versão**.
5. Para os círculos ficarem presos no lugar certo quando o cliente rola a página, cole no site, antes do `</body>`:

```
<script src="https://SEU-APROVA/embed.js" async></script>
```

Ele só funciona quando o site está aberto dentro do Aprova. Sem ele, o círculo fica marcado na parte do site que estava na tela.

## Automações do Instagram (comentário ou story → DM)

Em **`/automacoes`** (ou no botão **Automações do Instagram** do painel) cada cliente do Aprova ganha automações como as do ManyChat: a pessoa comenta uma palavra num post ou Reels, ou responde um story com ela, e recebe uma DM automática com texto e botão de link. Não há limite de automações nem de palavras.

1. **Configurar app** (uma vez só): crie um app em developers.facebook.com com o caso de uso de mensagens do Instagram, cole o ID e a chave secreta do app do Instagram, e copie para o painel da Meta a URL de redirecionamento, a URL de callback e o token de verificação que a tela mostra. Ative os webhooks `comments` e `messages`.
2. **Conectar Instagram** em cada cliente (conta profissional). O acesso vale 60 dias e é renovado sozinho todo dia às 6h14 (horário de Brasília).
3. Crie as automações. A aba **Atividade** mostra cada comentário ou resposta que chegou e se a DM foi enviada; a aba **Testar palavra** mostra qual automação responderia, sem enviar nada.

Enquanto o app da Meta não passa pela Análise do app, ele só responde a contas adicionadas como testadoras. Também dá para definir `IG_APP_ID`, `IG_APP_SECRET` e `IG_VERIFY_TOKEN` como variáveis no Cloudflare em vez de salvar pela tela.

## Guia visual (os dois tipos de cliente)

Na página do cliente, **+ Guia visual**: logo e versões, cores (nome, código e uso), fontes do Google Fonts (com exemplo na fonte de verdade), elementos e aplicações, tom de voz e o que pode e não pode. O cliente abre o guia, comenta cada parte e aprova com os stickers do Larot.

## Limites

- Arquivos de até 200 MB (vídeos são enviados em partes). Imagens grandes são reduzidas antes do envio.
- Até 10 artes por peça.
- Plano grátis do Cloudflare: 100 mil acessos por dia e 5 GB no banco D1 (artes e vídeos incluídos). Se um dia encher, apague clientes antigos ou migre os arquivos para o R2.

## Instalar como app

- **Computador (Chrome ou Edge):** ícone de instalar na barra de endereço, ou menu ⋮ → "Instalar Aprova All Toral".
- **iPhone:** Safari → Compartilhar → "Adicionar à Tela de Início".
- **Android:** Chrome → menu ⋮ → "Instalar app".

O app instalado abre direto na última página usada.

## Estrutura

```
public/          páginas, estilos, stickers e ícones
worker/index.js  servidor: senha, links dos clientes, banco e arquivos
worker/auto.js   automações do Instagram (webhook, conexão das contas, DMs)
wrangler.toml    configuração do Cloudflare
```

Para trocar os stickers, substitua os PNG em `public/stickers/` mantendo os nomes (`aprovado.png`, `alteracao.png`, `reprovado.png`).

## Testar no computador (opcional)

```
npm install
echo "ADMIN_PASSWORD=teste" > .dev.vars
npm run dev
```

## Atualizações do app

Antes de publicar uma mudança em `public/`, rode `./scripts/bump-version.sh`. Ele marca uma versão nova em `public/version.json`, e o app aberto nos aparelhos percebe em até 1 minuto e se atualiza sozinho (sem interromper quem estiver preenchendo algo).
