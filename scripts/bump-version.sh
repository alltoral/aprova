#!/bin/sh
# Marca uma versão nova do app (rodar antes de cada commit que mexe em public/).
# O app instalado compara com /version.json e se atualiza sozinho.
set -e
cd "$(dirname "$0")/.."
V=$(date -u +%Y%m%d%H%M%S)
printf '{"v":"%s"}\n' "$V" > public/version.json
sed -i -E "s/^const APP_VERSION = \"[0-9]*\";/const APP_VERSION = \"$V\";/" public/app.js
sed -i -E "s#/app.js(\?v=[0-9]*)?\"#/app.js?v=$V\"#; s#/plan.js(\?v=[0-9]*)?\"#/plan.js?v=$V\"#; s#/digital.js(\?v=[0-9]*)?\"#/digital.js?v=$V\"#; s#/guide.js(\?v=[0-9]*)?\"#/guide.js?v=$V\"#; s#/access.js(\?v=[0-9]*)?\"#/access.js?v=$V\"#; s#/style.css(\?v=[0-9]*)?\"#/style.css?v=$V\"#" public/index.html
sed -i -E "s#/style.css(\?v=[0-9]*)?\"#/style.css?v=$V\"#; s#/reunioes.css(\?v=[0-9]*)?\"#/reunioes.css?v=$V\"#; s#/reunioes.js(\?v=[0-9]*)?\"#/reunioes.js?v=$V\"#" public/reunioes.html
sed -i -E "s/^const CACHE = \"aprovacoes-[^\"]*\";/const CACHE = \"aprovacoes-$V\";/" public/sw.js
echo "versão $V"
