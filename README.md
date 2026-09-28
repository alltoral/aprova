# Aprova All Toral

App para os clientes aprovarem posts e anúncios com os stickers do Larot.

- **Painel do estúdio** (`/admin`): protegido por senha. Você cadastra clientes (nome, @, segmento, cor e logo), sobe as artes com legenda e, nos anúncios, a segmentação.
- **Página do cliente** (`/c/<link-secreto>`): cada cliente recebe um link próprio que abre só a página dele. Ele toca no sticker e o status muda na hora. Em "Precisa de ajustes" abre a caixa de comentário.
- A separação é feita no servidor: um link nunca devolve dados de outro cliente. Se precisar cortar o acesso, use "gere um link novo" na página do cliente, e o link antigo para de funcionar.

## Como publicar (Netlify)

1. Suba esta pasta para um repositório no GitHub.
2. No Netlify: **Add new site → Import an existing project** e escolha o repositório. As configurações de build já vêm do `netlify.toml`, não precisa mudar nada.
3. Em **Site configuration → Environment variables**, crie `ADMIN_PASSWORD` com a senha do painel.
4. Faça o deploy de novo (Deploys → Trigger deploy) para a senha valer.
5. Acesse `https://seu-site.netlify.app/admin` e entre com a senha.

Os dados e as imagens ficam guardados no Netlify Blobs do próprio site. Não precisa de banco de dados externo.

## Uso no dia a dia

1. No painel, clique em **Novo cliente**, preencha e salve. Depois envie o logo.
2. Clique em **+ Nova peça**: tipo (Instagram ou Anúncio), formato, artes, legenda, hashtags e, se for anúncio, a segmentação.
3. **Salvar rascunho** deixa a peça escondida do cliente. **Enviar para o cliente** publica.
4. Clique em **Copiar link do cliente** e mande para ele.
5. Quando o cliente pedir ajuste, edite a peça e use **Enviar nova versão para aprovação**.

## Limites

- Cada arquivo pode ter até 5,5 MB. Imagens maiores são reduzidas automaticamente antes do envio. Vídeos precisam estar abaixo desse tamanho.
- Até 10 artes por peça.

## Estrutura

```
public/            página (index.html, app.js, style.css, stickers, logo)
netlify/functions/ api.mjs: toda a lógica do servidor
netlify.toml       rotas e configuração
```

Para trocar os stickers, substitua os PNG em `public/stickers/` mantendo os nomes (`aprovado.png`, `alteracao.png`, `reprovado.png`).

## Instalar como app

O site já vem pronto para ser instalado (PWA):

- **Computador (Chrome ou Edge):** abra o painel e clique no ícone de instalar na barra de endereço, ou no menu ⋮ → "Instalar Aprova All Toral". Ele vira um app com ícone do Larot, abre em janela própria e fica no Dock ou menu Iniciar.
- **iPhone:** no Safari, Compartilhar → "Adicionar à Tela de Início".
- **Android:** no Chrome, menu ⋮ → "Instalar app".

O app instalado abre direto na última página usada: o painel para você, a página dele para o cliente.
