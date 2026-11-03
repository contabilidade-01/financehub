"""Junta narracao/<versao>-<n>.mp3 no tempo de roteiro.json e grava narracao-<versao>.mp3.
Cada cena do vídeo é esticada para caber a fala (grava tempos-<versao>.json, que o gravar.mjs usa).
Depois rode `node gravar.mjs [--versao geral]`: o MP4 sai com o áudio."""
import json, os, subprocess

aqui = os.path.dirname(os.path.abspath(__file__))
ORIG = [0, 6, 11, 24, 32, 42, 50, 58, 66]  # início de cada cena em video.html + fim
# Com voz gravada (fala mais rápida) a cena também pode encolher até esta fração do original
ENCOLHE = {"geral-jeandson": 0.6}

def dur(f):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).strip())

for versao, trechos in json.load(open(os.path.join(aqui, "roteiro.json"), encoding="utf-8")).items():
    ent, filtros, novo = [], [], [0.0]
    for n, _ in enumerate(trechos):
        f = os.path.join(aqui, "narracao", f"{versao}-{n}.mp3")
        if not os.path.exists(f):
            break
        d = dur(f)
        t = novo[n] + 0.4
        novo.append(round(novo[n] + max((ORIG[n + 1] - ORIG[n]) * ENCOLHE.get(versao, 1.0), d + 0.9), 2))
        ent += ["-i", f]
        filtros.append(f"[{n}:a]adelay={int(t*1000)}:all=1[a{n}]")
        print(versao, n, f"{d:.1f}s", f"cena {novo[n]:.1f}-{novo[n+1]:.1f}")
    else:
        TOTAL = novo[-1]
        json.dump({"orig": ORIG, "novo": novo, "capa": novo[4] + (novo[5] - novo[4]) * 0.6},
                  open(os.path.join(aqui, f"tempos-{versao}.json"), "w"))
        mix = "".join(f"[a{i}]" for i in range(len(trechos)))
        filtros.append(f"{mix}amix=inputs={len(trechos)}:normalize=0,apad,atrim=0:{TOTAL}[s]")
        subprocess.check_call(["ffmpeg", "-y", "-loglevel", "error", *ent, "-filter_complex", ";".join(filtros),
                               "-map", "[s]", "-b:a", "128k", os.path.join(aqui, f"narracao-{versao}.mp3")])
        print("ok", versao)
