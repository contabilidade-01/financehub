# Site de vendas (*.gestaoempresa.com)

Site estático, separado do app. Cada página tem o seu subdomínio (veja `nginx.conf`):

- https://pf.gestaoempresa.com: Pessoa Física (`/pf/`)
- https://controle.gestaoempresa.com: PJ MEI (`/mei/`)
- https://pj.gestaoempresa.com: PJ Empresa/ME (`/pj/`)
- https://controle.gestaoempresa.com/planos/: escolha do plano

Os botões de cadastro só apontam para `https://app.controledinheiro.com.br/register?modalidade=...`;
nada aqui altera o app.

- Editar textos e preços: `gerar.py`, depois `python gerar.py` (regrava `public/`).
- Estilo: `public/assets/style.css`.
- Deploy: serviço próprio no EasyPanel com build por `Dockerfile` nesta pasta (nginx, porta 80).
