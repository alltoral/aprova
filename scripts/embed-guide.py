#!/usr/bin/env python3
"""Embute os dados do guia visual numa imagem PNG para o Aprova preencher o guia sozinho.

Uso: python3 scripts/embed-guide.py prancha.png dados.json saida.png

dados.json: { "title", "intro", "colors": [{name, hex, role}], "fonts": [{name, role, weights, sample}],
  "voice", "dos": [..], "donts": [..],
  "logos": [{label, bg: light|dark|brand, box: [x, y, w, h]}],      # recortes em pixels da imagem
  "elements": [{label, box: [x, y, w, h]}] }
"""
import json, struct, sys, zlib

def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

src, meta, out = sys.argv[1:4]
png = open(src, "rb").read()
assert png[:8] == b"\x89PNG\r\n\x1a\n", "a imagem precisa ser PNG"
data = json.dumps(json.load(open(meta, encoding="utf-8")), ensure_ascii=False).encode("utf-8")
itxt = chunk(b"iTXt", b"aprova-guide\x00\x00\x00\x00\x00" + data)
# tira dados antigos e coloca o novo bloco logo depois do cabeçalho IHDR
pos, parts = 8, [png[:8]]
while pos < len(png):
    n = struct.unpack(">I", png[pos:pos + 4])[0]; kind = png[pos + 4:pos + 8]; raw = png[pos:pos + 12 + n]
    if not (kind in (b"iTXt", b"tEXt") and raw[8:21] == b"aprova-guide\x00"):
        parts.append(raw)
        if kind == b"IHDR": parts.append(itxt)
    pos += 12 + n
open(out, "wb").write(b"".join(parts))
print("ok", out)
