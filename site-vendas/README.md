# Site de vendas (controle.gestaoempresa.com)

Site estático, separado do app. Páginas: `/` (escolha do plano), `/pf/`, `/mei/` e `/pj/`.
Os botões de cadastro só apontam para `https://app.controledinheiro.com.br/register?modalidade=...`;
nada aqui altera o app.

- Editar textos e preços: `gerar.py`, depois `python gerar.py` (regrava `public/`).
- Estilo: `public/assets/style.css`.
- Deploy: serviço próprio no EasyPanel com build por `Dockerfile` nesta pasta (nginx, porta 80).
