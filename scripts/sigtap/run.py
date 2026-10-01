import os, json, time, urllib.request, urllib.error

BASE = os.path.dirname(os.path.abspath(__file__))
SQLD = os.path.join(BASE, "sql")
URL = "https://api.supabase.com/v1/projects/qxtzlorofhuuxzqkbpli/database/query"
TOKEN = os.environ["SB_TOKEN"]

files = sorted(os.listdir(SQLD))
print(f"Total de lotes: {len(files)}", flush=True)
ok = 0
for i, f in enumerate(files, 1):
    sql = open(os.path.join(SQLD, f), encoding="utf-8").read()
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(URL, data=body, method="POST", headers={
        "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            resp = r.read().decode("utf-8", "replace")
            # sucesso de INSERT geralmente retorna [] ; erro vem com "message"/"error"
            low = resp.lower()
            if '"message"' in low or '"error"' in low:
                print(f"[{i}/{len(files)}] ERRO em {f}: {resp[:400]}", flush=True)
                break
            ok += 1
            if i == 1 or i % 10 == 0 or i == len(files):
                print(f"[{i}/{len(files)}] OK {f}", flush=True)
    except urllib.error.HTTPError as e:
        print(f"[{i}/{len(files)}] HTTP {e.code} em {f}: {e.read().decode('utf-8','replace')[:400]}", flush=True)
        break
    except Exception as e:
        print(f"[{i}/{len(files)}] FALHA em {f}: {e}", flush=True)
        break
    time.sleep(0.25)
print(f"\nConcluído: {ok}/{len(files)} lotes aplicados.", flush=True)
