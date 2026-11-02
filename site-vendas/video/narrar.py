"""Gera os trechos de narração (voz neural pt-BR) a partir de roteiro.json.

Precisa de internet aberta (não roda no container da nuvem):
    pip install edge-tts
    python narrar.py            # voz padrão pt-BR-AntonioNeural
    python narrar.py --voz pt-BR-FranciscaNeural
Grava narracao/<versao>-<n>.mp3; depois `python montar_audio.py` junta tudo no tempo certo.
"""
import asyncio, json, os, sys
import edge_tts

aqui = os.path.dirname(os.path.abspath(__file__))
voz = sys.argv[sys.argv.index("--voz") + 1] if "--voz" in sys.argv else "pt-BR-AntonioNeural"

async def main():
    roteiro = json.load(open(os.path.join(aqui, "roteiro.json"), encoding="utf-8"))
    os.makedirs(os.path.join(aqui, "narracao"), exist_ok=True)
    for versao, trechos in roteiro.items():
        for n, (_, texto) in enumerate(trechos):
            destino = os.path.join(aqui, "narracao", f"{versao}-{n}.mp3")
            await edge_tts.Communicate(texto, voz, rate="+5%").save(destino)
            print("ok", destino)

asyncio.run(main())
