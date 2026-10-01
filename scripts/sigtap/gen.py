import io, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
SQLD = os.path.join(BASE, "sql")
os.makedirs(SQLD, exist_ok=True)
for f in os.listdir(SQLD):
    os.remove(os.path.join(SQLD, f))

COMPS = [("202608", "u608"), ("202609", "u609")]
LATEST = "u609"  # referências: snapshot mais recente
MAXB = 450_000   # ~450KB por arquivo/POST

def esc(s):
    return s.replace("'", "''")

def rd(path):
    return io.open(os.path.join(BASE, path), encoding="latin-1")

counts = {}
chunk_idx = [0]

def emit(order, table, header_sql, rows, conflict):
    """rows: lista de strings '(...)'. Gera arquivos <order>_<table>_NNN.sql com INSERT multi-linha."""
    counts[table] = counts.get(table, 0) + len(rows)
    buf, blen, part = [], 0, 0
    def flush():
        nonlocal buf, blen, part
        if not buf:
            return
        part += 1
        chunk_idx[0] += 1
        fn = f"{order:02d}_{table}_{part:03d}.sql"
        with open(os.path.join(SQLD, fn), "w", encoding="utf-8") as o:
            o.write(header_sql + "\nVALUES\n" + ",\n".join(buf) + "\n" + conflict + ";\n")
        buf, blen = [], 0
    for r in rows:
        if blen + len(r) > MAXB and buf:
            flush()
        buf.append(r); blen += len(r) + 2
    flush()

def sexo_ok(c):
    c = (c or "").strip().upper()
    return c if c in ("M", "F", "I", "N") else "N"

# ---------- Referências (snapshot 202609) ----------
# 1 ocupacoes
seen = set(); rows = []
for ln in rd(f"{LATEST}/tb_ocupacao.txt"):
    co = ln[0:6].strip(); no = ln[6:156].strip()
    if not co or co in seen: continue
    seen.add(co); rows.append(f"('{esc(co)}','{esc(no)}')")
emit(1, "ocupacoes_sigtap", "INSERT INTO ocupacoes_sigtap (codigo,nome)", rows,
     "ON CONFLICT (codigo) DO UPDATE SET nome=excluded.nome, updated_at=now()")

# 2 cid
seen = set(); rows = []
for ln in rd(f"{LATEST}/tb_cid.txt"):
    co = ln[0:4].strip(); no = ln[4:104].strip(); sx = sexo_ok(ln[105:106])
    if not co or co in seen: continue
    seen.add(co); rows.append(f"('{esc(co)}','{esc(no)}','{sx}')")
emit(2, "cid_sigtap", "INSERT INTO cid_sigtap (codigo,nome,sexo)", rows,
     "ON CONFLICT (codigo) DO UPDATE SET nome=excluded.nome, sexo=excluded.sexo, updated_at=now()")

# 3 servicos
seen = set(); rows = []
for ln in rd(f"{LATEST}/tb_servico.txt"):
    co = ln[0:3].strip(); no = ln[3:123].strip()
    if not co or co in seen: continue
    seen.add(co); rows.append(f"('{esc(co)}','{esc(no)}')")
emit(3, "servicos_sigtap", "INSERT INTO servicos_sigtap (codigo,nome)", rows,
     "ON CONFLICT (codigo) DO UPDATE SET nome=excluded.nome, updated_at=now()")

# 4 servico_classificacao
seen = set(); rows = []
for ln in rd(f"{LATEST}/tb_servico_classificacao.txt"):
    sv = ln[0:3].strip(); cl = ln[3:6].strip(); no = ln[6:156].strip()
    k = (sv, cl)
    if not sv or k in seen: continue
    seen.add(k); rows.append(f"('{esc(sv)}','{esc(cl)}','{esc(no)}')")
emit(4, "servico_classificacao_sigtap", "INSERT INTO servico_classificacao_sigtap (servico,classificacao,nome)", rows,
     "ON CONFLICT (servico,classificacao) DO UPDATE SET nome=excluded.nome, updated_at=now()")

# ---------- Versionadas por competência ----------
resumo = {}
for comp, u in COMPS:
    # procedimentos
    seen = set(); rows = []
    for ln in rd(f"{u}/tb_procedimento.txt"):
        co = ln[0:10].strip()
        if not co or co in seen: continue
        seen.add(co)
        no = ln[10:260].strip(); sx = sexo_ok(ln[261:262])
        qt = int(ln[262:266] or 0); imin = int(ln[274:278] or 0); imax = int(ln[278:282] or 0)
        rows.append(f"('{esc(co)}','{esc(no)}','{sx}',{qt},{imin},{imax},'{comp}')")
    nproc = len(rows)
    emit(5, f"procedimentos_sigtap_{comp}", "INSERT INTO procedimentos_sigtap (codigo,nome,sexo,qt_maxima_execucao,idade_minima_meses,idade_maxima_meses,competencia)", rows,
         "ON CONFLICT (codigo,competencia) DO NOTHING")
    # ocupacao
    seen = set(); rows = []
    for ln in rd(f"{u}/rl_procedimento_ocupacao.txt"):
        p = ln[0:10].strip(); c = ln[10:16].strip(); k = (p, c)
        if not p or k in seen: continue
        seen.add(k); rows.append(f"('{esc(p)}','{esc(c)}','{comp}')")
    nocu = len(rows)
    emit(6, f"procedimento_ocupacao_{comp}", "INSERT INTO procedimento_ocupacao (procedimento,cbo,competencia)", rows,
         "ON CONFLICT (procedimento,cbo,competencia) DO NOTHING")
    # cid
    seen = set(); rows = []
    for ln in rd(f"{u}/rl_procedimento_cid.txt"):
        p = ln[0:10].strip(); c = ln[10:14].strip(); pr = "true" if ln[14:15].strip().upper() == "S" else "false"; k = (p, c)
        if not p or k in seen: continue
        seen.add(k); rows.append(f"('{esc(p)}','{esc(c)}',{pr},'{comp}')")
    ncid = len(rows)
    emit(7, f"procedimento_cid_{comp}", "INSERT INTO procedimento_cid (procedimento,cid,principal,competencia)", rows,
         "ON CONFLICT (procedimento,cid,competencia) DO NOTHING")
    # servico
    seen = set(); rows = []
    for ln in rd(f"{u}/rl_procedimento_servico.txt"):
        p = ln[0:10].strip(); sv = ln[10:13].strip(); cl = ln[13:16].strip(); k = (p, sv, cl)
        if not p or k in seen: continue
        seen.add(k); rows.append(f"('{esc(p)}','{esc(sv)}','{esc(cl)}','{comp}')")
    nserv = len(rows)
    emit(8, f"procedimento_servico_{comp}", "INSERT INTO procedimento_servico (procedimento,servico,classificacao,competencia)", rows,
         "ON CONFLICT (procedimento,servico,classificacao,competencia) DO NOTHING")
    resumo[comp] = (nproc, nocu, ncid, nserv)

# 9 sigtap_competencias
rows = []
for comp, _ in COMPS:
    p, o, c, s = resumo[comp]
    rows.append(f"('{comp}',now(),{p},{o},{c},{s})")
emit(9, "sigtap_competencias", "INSERT INTO sigtap_competencias (competencia,importado_em,qtd_procedimentos,qtd_relacoes_ocupacao,qtd_relacoes_cid,qtd_relacoes_servico)", rows,
     "ON CONFLICT (competencia) DO UPDATE SET importado_em=now(), qtd_procedimentos=excluded.qtd_procedimentos, qtd_relacoes_ocupacao=excluded.qtd_relacoes_ocupacao, qtd_relacoes_cid=excluded.qtd_relacoes_cid, qtd_relacoes_servico=excluded.qtd_relacoes_servico")

files = sorted(os.listdir(SQLD))
total_bytes = sum(os.path.getsize(os.path.join(SQLD, f)) for f in files)
print("=== CONTAGEM DE LINHAS A INSERIR ===")
for k in sorted(counts):
    print(f"  {k}: {counts[k]}")
print(f"\nTOTAL linhas: {sum(counts.values())}")
print(f"Arquivos SQL (POSTs): {len(files)}  |  Tamanho total: {total_bytes/1_048_576:.1f} MB")
print("\n=== RESUMO POR COMPETÊNCIA (proc, cbo, cid, servico) ===")
for comp in resumo:
    print(f"  {comp}: {resumo[comp]}")
print("\n=== AMOSTRA (primeira linha de 2 arquivos) ===")
for f in files[:1] + files[5:6]:
    with open(os.path.join(SQLD, f)) as fh:
        head = fh.read(400)
    print(f"--- {f} ---\n{head}\n")
