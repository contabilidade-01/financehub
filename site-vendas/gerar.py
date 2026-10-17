import os, sys, html

# Gera as páginas em site-vendas/public: python gerar.py public
OUT = sys.argv[1] if len(sys.argv) > 1 else "public"
APP = "https://app.controledinheiro.com.br"

# Cada página de vendas tem o seu subdomínio (nginx.conf escolhe a página pela raiz do host).
URL = {
    "pf": "https://pf.gestaoempresa.com/",
    "mei": "https://controle.gestaoempresa.com/",
    "pj": "https://pj.gestaoempresa.com/",
    "planos": "https://controle.gestaoempresa.com/planos/",
}

def cad(mod):
    return f"{APP}/register?modalidade={mod}"

def head(titulo, desc, url):
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{titulo}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:title" content="{titulo}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="{url}">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
"""

def topo(ativa):
    abas = [(URL["pf"], "Pessoa Física", "pf"), (URL["mei"], "PJ MEI", "mei"), (URL["pj"], "PJ Empresa", "pj")]
    links = "".join(f'<a class="aba{" ativa" if k == ativa else ""}" href="{h}">{t}</a>' for h, t, k in abas)
    return f"""<header class="topo"><div class="wrap">
<a class="marca" href="/"><img src="/assets/logo-light.png" alt="">Khesef</a>
<nav class="menu">{links}<a class="btn btn-contorno btn-pequeno" href="{APP}/">Entrar</a></nav>
</div></header>
"""

RODAPE = f"""<footer><div class="wrap">
<span>© 2026 Khesef by XPIRIA. Todos os direitos reservados.</span>
<span><a href="{URL['pf']}">Pessoa Física</a> · <a href="{URL['mei']}">PJ MEI</a> · <a href="{URL['pj']}">PJ Empresa</a> · <a href="{APP}/">Entrar</a></span>
</div></footer>
</body>
</html>
"""

CONFIANCA = """<div class="confianca alt"><div class="wrap">
<span><i>●</i>Pagamento seguro via Pix, boleto ou cartão</span>
<span><i>●</i>Cancele quando quiser, sem burocracia</span>
<span><i>●</i>Dados protegidos conforme a LGPD</span>
</div></div>
"""

FAQ_COMUM = [
    ("Preciso saber contabilidade para usar?", "Não. Você manda o lançamento pelo WhatsApp (texto, áudio, foto ou PDF) e a IA organiza e categoriza automaticamente. O painel mostra tudo de forma simples."),
    ("Funciona com o WhatsApp normal?", "Sim. Funciona com o WhatsApp que você já usa no dia a dia, sem precisar de conta comercial."),
    ("Como funcionam os 15 dias grátis?", "Você cria a conta e usa tudo por 15 dias, sem cartão de crédito. Só assina se gostar."),
    ("Posso cancelar quando quiser?", "Sim. Você cancela a qualquer momento e o acesso continua até o fim do período já pago."),
    ("Meus dados estão seguros?", "Sim. Seguimos a LGPD e você pode pedir a exportação ou a exclusão dos seus dados quando quiser. Nunca pedimos senha, dados de conta bancária ou de cartão pelo WhatsApp."),
]

def faq(itens):
    corpo = "".join(f"<details><summary>{html.escape(p)}</summary><p>{html.escape(r)}</p></details>" for p, r in itens)
    return f"""<section><div class="wrap">
<div class="titulo"><h2>Perguntas frequentes</h2></div>
<div class="faq">{corpo}</div>
</div></section>
"""

def cards(itens, classe):
    out = []
    for i, (ic, t, d) in enumerate(itens):
        passo = f'<div class="passo">Passo {i+1}</div>' if classe == "c4" else ""
        out.append(f'<div class="card"><div class="ic">{ic}</div>{passo}<h3>{t}</h3><p>{d}</p></div>')
    return f'<div class="cards {classe}">' + "".join(out) + "</div>"

def plano_card(tag, nome, para, preco, itens, mod, destaque=True):
    inteiro, cent = preco.split(",")
    lis = "".join(f"<li>{html.escape(x)}</li>" for x in itens)
    return f"""<div class="plano{' destaque' if destaque else ''}">
<span class="tag">{tag}</span>
<h3>{nome}</h3>
<p class="para">{para}</p>
<div class="preco"><span class="rs">R$</span><span class="valor">{inteiro},{cent}</span><span class="mes">/mês</span></div>
<ul class="lista">{lis}</ul>
<a class="btn btn-primario btn-bloco" href="{cad(mod)}">Começar com 15 dias grátis</a>
<p class="rodape">Sem cartão para começar. Cancele quando quiser.</p>
</div>"""

PAGINAS = {
    "pf": dict(
        mod="pf",
        titulo="Khesef Pessoa Física: suas finanças pelo WhatsApp",
        desc="Organize receitas, despesas, cartões e metas mandando mensagem no WhatsApp. 15 dias grátis.",
        selo="Para você, pessoa física",
        h1="Sua vida financeira organizada direto pelo WhatsApp",
        sub="Mande uma mensagem, um áudio ou a foto do cupom. A IA lança e categoriza, e você acompanha saldo, cartões e metas no painel.",
        av="PF", conversa="Meu Financeiro",
        msgs=[("eu", "Mercado R$ 87,50 no cartão"), ("bot", "Lançado ✅ Alimentação · Cartão Nubank"), ("eu", "🎤 0:07"), ("bot", "Recebi seu salário de R$ 3.500 e já atualizei o saldo.")],
        passos=[("💬", "Mande no WhatsApp", "Texto, áudio, foto do cupom ou PDF, do jeito mais fácil na hora."),
                ("✨", "A IA organiza", "Ela identifica valor, data, categoria e forma de pagamento sozinha."),
                ("📊", "Acompanhe no painel", "Saldo, gastos por categoria e por cartão, sempre atualizados."),
                ("🎯", "Metas e lembretes", "Defina metas e receba lembretes das contas a vencer.")],
        recursos_titulo="Recursos para o seu dia a dia",
        recursos=[("👛", "Receitas e despesas", "Tudo o que entra e sai, em um só lugar."),
                  ("💳", "Cartões e faturas", "Controle de cada cartão, parcelas e fatura do mês."),
                  ("🏷️", "Categorias e carteiras ilimitadas", "Organize contas e categorias do seu jeito."),
                  ("🎯", "Metas financeiras", "Acompanhe quanto falta para cada objetivo."),
                  ("🔔", "Lembretes", "Aviso das contas antes do vencimento."),
                  ("📈", "Relatórios e gráficos", "Visão por período, categoria e forma de pagamento.")],
        plano=("Plano Pessoa Física", "Pessoa Física", "Para organizar as finanças pessoais e da família.", "39,90",
               ["Lançamentos por WhatsApp (texto, áudio, foto e PDF)", "Carteiras, cartões e categorias ilimitados", "Metas e lembretes de contas", "Relatórios e gráficos", "Exportação dos lançamentos", "15 dias de degustação grátis"]),
        faq_extra=[("E se eu tiver MEI ou empresa?", "O plano Pessoa Física é para as finanças pessoais. Para o financeiro do seu CNPJ, veja os planos PJ MEI e PJ Empresa.")],
        cta="Comece a organizar sua vida financeira hoje",
    ),
    "mei": dict(
        mod="pj_mei",
        titulo="Khesef PJ MEI: o financeiro do seu MEI pelo WhatsApp",
        desc="Controle o caixa do seu MEI, separe as contas pessoais das da empresa e acompanhe contas a pagar pelo WhatsApp. 15 dias grátis.",
        selo="Para Microempreendedor Individual",
        h1="O financeiro do seu MEI em dia, sem planilha",
        sub="Mande o comprovante, o áudio ou a nota pelo WhatsApp. A IA lança no caixa da empresa, separado do seu pessoal, e você vê quanto entrou, saiu e sobrou.",
        av="MEI", conversa="Financeiro do MEI",
        msgs=[("eu", "Vendi R$ 450 no Pix pro cliente Ana"), ("bot", "Lançado ✅ Receita de vendas · Pix"), ("eu", "📎 boleto-fornecedor.pdf"), ("bot", "Conta a pagar de R$ 620 criada para 25/10.")],
        passos=[("💬", "Mande no WhatsApp", "Venda, compra, boleto ou comprovante: do jeito que vier."),
                ("✨", "A IA separa PF e PJ", "Os lançamentos do CNPJ ficam no caixa da empresa, longe das contas pessoais."),
                ("📅", "Contas a pagar", "Vencimentos organizados e baixa automática quando você paga."),
                ("📊", "Veja o resultado", "Quanto entrou, quanto saiu e quanto sobrou no mês.")],
        recursos_titulo="Recursos para o seu MEI",
        recursos=[("🏢", "Caixa da empresa", "Receitas e despesas do CNPJ organizadas em um painel próprio."),
                  ("🔀", "Pessoal separado do MEI", "Inclui também o controle das suas finanças pessoais."),
                  ("📅", "Contas a pagar", "Vencimentos, lembretes e baixa dos pagamentos."),
                  ("🏦", "Conciliação bancária", "Importe o extrato e confira com os lançamentos."),
                  ("📈", "DRE e fluxo de caixa", "Resultado do mês e projeção do caixa, prontos."),
                  ("🧾", "Comprovantes por foto", "Mande a foto ou o PDF e a IA lê os dados.")],
        plano=("Plano PJ MEI", "PJ MEI", "Para o microempreendedor que quer o caixa do CNPJ organizado.", "79,90",
               ["Tudo do plano Pessoa Física", "Caixa da empresa separado do pessoal", "Contas a pagar com lembretes", "Conciliação bancária por extrato", "DRE e fluxo de caixa projetado", "15 dias de degustação grátis"]),
        faq_extra=[("O plano substitui o meu contador?", "Não. Ele organiza o financeiro do MEI no dia a dia, mas não substitui a contabilidade nem as obrigações do MEI."),
                   ("Minha empresa cresceu e deixou de ser MEI. E agora?", "Você pode passar para o plano PJ Empresa, com contas a receber, centros de custo e DRE completo.")],
        cta="Organize o financeiro do seu MEI hoje",
    ),
    "pj": dict(
        mod="pj_me",
        titulo="Khesef PJ Empresa: gestão financeira completa da sua empresa",
        desc="Gestão financeira completa para microempresas: contas a pagar e a receber, conciliação bancária, centros de custo e DRE, com lançamentos pelo WhatsApp. 15 dias grátis.",
        selo="Para microempresas (ME)",
        h1="A gestão financeira completa da sua empresa, com lançamento pelo WhatsApp",
        sub="Contas a pagar e a receber, conciliação bancária, centros de custo e DRE completo em um só lugar. A equipe lança pelo WhatsApp e você decide com números atualizados.",
        av="PJ", conversa="Financeiro da Empresa",
        msgs=[("eu", "Paguei fornecedor XYZ, R$ 1.240,00 hoje"), ("bot", "Lançado ✅ Fornecedores · conta a pagar baixada"), ("eu", "Cliente Beta pagou a NF 312"), ("bot", "Recebimento de R$ 3.500 baixado em Contas a Receber.")],
        passos=[("💬", "Lance pelo WhatsApp", "Você e a equipe mandam comprovantes, notas e boletos."),
                ("✨", "A IA classifica", "Plano de contas e centro de custo sugeridos automaticamente."),
                ("🏦", "Concilie com o banco", "Importe o extrato e feche o caixa sem retrabalho."),
                ("📊", "Feche o mês com DRE", "DRE completo e fluxo de caixa projetado para decidir.")],
        recursos_titulo="Recursos para a sua empresa",
        recursos=[("📅", "Contas a pagar e a receber", "Vencimentos, cobranças e baixas em um só painel."),
                  ("🏦", "Conciliação bancária", "Extrato do banco conferido com os lançamentos."),
                  ("🗂️", "Centros de custo", "Veja o resultado por área, unidade ou projeto."),
                  ("📈", "DRE completo", "Demonstrativo de resultado pronto, mês a mês."),
                  ("🔮", "Fluxo de caixa projetado", "Saiba hoje como o caixa estará nas próximas semanas."),
                  ("🧾", "Plano de contas gerencial", "Estrutura pensada para gestão, pronta para usar.")],
        plano=("Plano PJ Empresa", "PJ Empresa (ME)", "Para microempresas que querem a gestão financeira completa.", "79,90",
               ["Contas a pagar e a receber", "Conciliação bancária por extrato", "Centros de custo", "DRE completo e fluxo de caixa projetado", "Lançamentos pelo WhatsApp para a equipe", "15 dias de degustação grátis"]),
        faq_extra=[("O plano substitui o meu contador?", "Não. Ele organiza a gestão financeira da empresa, mas não substitui a contabilidade formal."),
                   ("Sou MEI. Este é o plano certo?", "Para MEI, o plano PJ MEI costuma bastar. O PJ Empresa é para quem precisa de contas a receber, centros de custo e DRE completo.")],
        cta="Organize o financeiro da sua empresa hoje",
    ),
}

def pagina(chave, p):
    msgs = "".join(f'<div class="msg {q}">{html.escape(t)}</div>' for q, t in p["msgs"])
    tag, nome, para, preco, itens = p["plano"]
    s = head(p["titulo"], p["desc"], URL[chave]) + topo(chave)
    s += f"""<main>
<section class="hero"><div class="wrap grade">
<div>
<span class="selo">{p['selo']}</span>
<h1>{p['h1']}</h1>
<p class="sub">{p['sub']}</p>
<div class="acoes"><a class="btn btn-primario" href="{cad(p['mod'])}">Começar com 15 dias grátis</a><a class="btn btn-contorno" href="#planos">Ver preço</a></div>
<p class="nota">Sem cartão de crédito para começar. Cancele quando quiser.</p>
</div>
<div class="zap" aria-hidden="true"><div class="zap-topo"><div class="av">{p['av']}</div><div><b>{p['conversa']}</b><small>online</small></div></div><div class="zap-corpo">{msgs}</div></div>
</div></section>
{CONFIANCA}
<section><div class="wrap">
<div class="titulo"><h2>Como funciona</h2><p>Do lançamento no WhatsApp ao controle no painel.</p></div>
{cards(p['passos'], 'c4')}
</div></section>
<section class="alt"><div class="wrap">
<div class="titulo"><h2>{p['recursos_titulo']}</h2></div>
{cards(p['recursos'], 'c3')}
</div></section>
<section id="planos"><div class="wrap">
<div class="titulo"><h2>Plano e preço</h2><p>15 dias grátis para testar, sem compromisso.</p></div>
<div class="planos" style="max-width:440px;margin:0 auto">{plano_card(tag, nome, para, preco, itens, p['mod'])}</div>
<p class="nota" style="text-align:center;margin-top:20px">Não é o seu caso? Veja também <a href="{URL['pf']}">Pessoa Física</a>, <a href="{URL['mei']}">PJ MEI</a> ou <a href="{URL['pj']}">PJ Empresa</a>.</p>
</div></section>
<div class="alt">{faq(FAQ_COMUM + p['faq_extra'])}</div>
<section class="cta"><div class="wrap"><div class="caixa">
<h2>{p['cta']}</h2>
<p>15 dias grátis. Sem cartão de crédito para começar.</p>
<div class="acoes"><a class="btn btn-primario" href="{cad(p['mod'])}">Começar agora</a><a class="btn btn-contorno" href="{APP}/">Já tenho conta</a></div>
</div></div></section>
</main>
"""
    return s + RODAPE

def inicio():
    s = head("Khesef: gestão financeira pelo WhatsApp para você e sua empresa",
             "Controle financeiro pelo WhatsApp com IA para pessoa física, MEI e microempresa. 15 dias grátis.", URL["planos"]) + topo("")
    ops = [(URL["pf"], "👤", "Pessoa Física", "Minhas finanças pessoais e da família.", "R$ 39,90/mês"),
           (URL["mei"], "🧑‍💼", "PJ MEI", "Caixa do meu MEI separado das contas pessoais.", "R$ 79,90/mês"),
           (URL["pj"], "🏢", "PJ Empresa", "Gestão financeira completa da microempresa.", "R$ 79,90/mês")]
    cards_ = "".join(f'<a class="opcao" href="{h}"><div class="ic">{ic}</div><h3>{t}</h3><p>{d}</p><span class="de">{pr} · Ver plano →</span></a>' for h, ic, t, d, pr in ops)
    s += f"""<main>
<section class="hero"><div class="wrap grade">
<div>
<span class="selo">Gestão financeira com IA</span>
<h1>Seu financeiro organizado direto pelo WhatsApp</h1>
<p class="sub">Mande uma mensagem, um áudio ou a foto do comprovante. A IA lança e categoriza, e você acompanha tudo no painel, seja da sua vida pessoal ou da sua empresa.</p>
<div class="acoes"><a class="btn btn-primario" href="#planos">Escolher meu plano</a><a class="btn btn-contorno" href="{APP}/">Já tenho conta</a></div>
<p class="nota">15 dias grátis em todos os planos. Sem cartão de crédito para começar.</p>
</div>
<div class="zap" aria-hidden="true"><div class="zap-topo"><div class="av">K</div><div><b>Khesef</b><small>online</small></div></div><div class="zap-corpo">
<div class="msg eu">Almoço R$ 42 no débito</div><div class="msg bot">Lançado ✅ Alimentação · Débito</div>
<div class="msg eu">📎 nota-fornecedor.pdf</div><div class="msg bot">Conta a pagar de R$ 1.240 criada na empresa.</div>
</div></div>
</div></section>
{CONFIANCA}
<section id="planos"><div class="wrap">
<div class="titulo"><h2>Qual é o seu caso?</h2><p>Escolha o plano e teste 15 dias grátis.</p></div>
<div class="escolha">{cards_}</div>
</div></section>
<section class="alt"><div class="wrap">
<div class="titulo"><h2>Como funciona</h2></div>
{cards([("💬", "Mande no WhatsApp", "Texto, áudio, foto ou PDF."), ("✨", "A IA organiza", "Valor, data e categoria identificados sozinhos."), ("📊", "Acompanhe no painel", "Relatórios sempre atualizados."), ("🔔", "Não perca prazos", "Lembretes de contas e metas.")], 'c4')}
</div></section>
{faq(FAQ_COMUM)}
</main>
"""
    return s + RODAPE

def grava(rel, conteudo):
    caminho = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8", newline="\n") as f:
        f.write(conteudo)

grava("planos/index.html", inicio())
for k, p in PAGINAS.items():
    grava(f"{k}/index.html", pagina(k, p))
print("ok")
