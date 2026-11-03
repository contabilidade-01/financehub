# Site de vendas (*.tudocontado.com.br)

Site estático, separado do app. Cada página tem o seu subdomínio (veja `nginx.conf`):

- https://pf.tudocontado.com.br: Pessoa Física (`/pf/`)
- https://mei.tudocontado.com.br: PJ MEI (`/mei/`)
- https://pj.tudocontado.com.br: PJ Empresa/ME (`/pj/`)
- https://mordomo.tudocontado.com.br: Mordomia, plano PF com dízimo e ofertas (`/mordomia/`, tema creme/dourado)
- https://mei.tudocontado.com.br/planos/: escolha do plano

Os domínios antigos (pf/controle/pj.gestaoempresa.com) continuam servindo as mesmas páginas.

Os botões de cadastro só apontam para `https://app.tudocontado.com.br/register?modalidade=...`;
nada aqui altera o app.

- Editar textos e preços: `gerar.py`, depois `python gerar.py` (regrava `public/`).
- Estilo: `public/assets/style.css`.
- Deploy: serviço próprio no EasyPanel com build por `Dockerfile` nesta pasta (nginx, porta 80).
