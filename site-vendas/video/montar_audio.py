"""Junta narracao/<versao>-<n>.mp3 no tempo de roteiro.json e grava narracao-<versao>.mp3.
Se um trecho passar do início do próximo, ele é acelerado (até 1,25x) para caber.
Depois rode `node gravar.mjs [--versao geral]`: o MP4 sai com o áudio."""
import json, os, subprocess

aqui = os.path.dirname(os.path.abspath(__file__))
TOTAL = 66.0

def dur(f):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).strip())

for versao, trechos in json.load(open(os.path.join(aqui, "roteiro.json"), encoding="utf-8")).items():
    ent, filtros = [], []
    for n, (t, _) in enumerate(trechos):
        f = os.path.join(aqui, "narracao", f"{versao}-{n}.mp3")
        if not os.path.exists(f):
            break
        fim = trechos[n + 1][0] - 0.25 if n + 1 < len(trechos) else TOTAL - 0.3
        vel = min(1.25, max(1.0, dur(f) / (fim - t)))
        ent += ["-i", f]
        filtros.append(f"[{n}:a]atempo={vel:.3f},adelay={int(t*1000)}:all=1[a{n}]")
        print(versao, n, f"{dur(f):.1f}s", f"vel {vel:.2f}")
    else:
        mix = "".join(f"[a{i}]" for i in range(len(trechos)))
        filtros.append(f"{mix}amix=inputs={len(trechos)}:normalize=0,apad,atrim=0:{TOTAL}[s]")
        subprocess.check_call(["ffmpeg", "-y", "-loglevel", "error", *ent, "-filter_complex", ";".join(filtros),
                               "-map", "[s]", "-b:a", "128k", os.path.join(aqui, f"narracao-{versao}.mp3")])
        print("ok", versao)
