# Aprova All Toral

Central de aprovação de posts e anúncios da ALL TORAL, com os stickers do Larot.

- **Painel do estúdio** (`/admin`): protegido por senha. Você cadastra clientes (nome, @, redes, cor e logo), sobe artes, vídeos e capas, legenda e, nos anúncios, a segmentação.
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
wrangler.toml    configuração do Cloudflare
```

Para trocar os stickers, substitua os PNG em `public/stickers/` mantendo os nomes (`aprovado.png`, `alteracao.png`, `reprovado.png`).

## Testar no computador (opcional)

```
npm install
echo "ADMIN_PASSWORD=teste" > .dev.vars
npm run dev
```
