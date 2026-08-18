/**
 * Plano de contas pessoal — template base.
 * Criado como CÓPIA PESSOAL para cada novo usuário (usuario_id preenchido, global=false).
 * Cada cliente pode editar/excluir sem afetar outros.
 *
 * Estrutura otimizada para classificação por IA:
 * - Granular o suficiente para a IA alocar com precisão
 * - Sem redundância (cada categoria tem domínio claro)
 * - Classificação fixa/variável embutida no descritivo para o agente entender
 *
 * Fluxo: Renda → Dízimos/Ofertas → Sonhos/Metas → Despesas Fixas → Despesas Variáveis → Sobra
 */

export interface PlanoContaTemplate {
  nome: string;
  tipo: 'Receita' | 'Despesa';
  cor: string;
  icone: string;
  descricao: string;
  classificacao: 'fixa' | 'variavel' | null; // para despesas — ajuda a IA
}

export const PLANO_CONTAS_BASE: PlanoContaTemplate[] = [
  // ═══════════════════════════════════════════
  // RECEITAS
  // ═══════════════════════════════════════════
  { nome: 'Salário', tipo: 'Receita', cor: '#4CAF50', icone: '💼', descricao: 'Salário CLT, pró-labore, remuneração fixa', classificacao: null },
  { nome: 'Freelance / Renda Extra', tipo: 'Receita', cor: '#8BC34A', icone: '💻', descricao: 'Trabalhos avulsos, bicos, freelas, comissões', classificacao: null },
  { nome: 'Investimentos', tipo: 'Receita', cor: '#FFC107', icone: '📈', descricao: 'Rendimentos, dividendos, juros, aluguéis recebidos', classificacao: null },
  { nome: 'Vendas', tipo: 'Receita', cor: '#00BCD4', icone: '🛒', descricao: 'Venda de produtos, itens usados, marketplace', classificacao: null },
  { nome: 'Presentes Recebidos', tipo: 'Receita', cor: '#E91E63', icone: '🎁', descricao: 'Dinheiro recebido de presente, doação recebida', classificacao: null },
  { nome: 'Reembolso', tipo: 'Receita', cor: '#9C27B0', icone: '💸', descricao: 'Reembolsos, estornos, devoluções', classificacao: null },
  { nome: 'Outras Receitas', tipo: 'Receita', cor: '#607D8B', icone: '📦', descricao: 'Receitas que não se encaixam nas anteriores', classificacao: null },

  // ═══════════════════════════════════════════
  // DESPESAS FIXAS (recorrentes mensais)
  // ═══════════════════════════════════════════
  { nome: 'Moradia', tipo: 'Despesa', cor: '#45B7D1', icone: '🏠', descricao: 'Aluguel, condomínio, IPTU, financiamento imobiliário. DESPESA FIXA.', classificacao: 'fixa' },
  { nome: 'Energia / Água / Gás', tipo: 'Despesa', cor: '#FF9800', icone: '💡', descricao: 'Contas de energia elétrica, água, gás. DESPESA FIXA.', classificacao: 'fixa' },
  { nome: 'Internet / Telefone', tipo: 'Despesa', cor: '#2196F3', icone: '📱', descricao: 'Plano de celular, internet fixa, TV a cabo. DESPESA FIXA.', classificacao: 'fixa' },
  { nome: 'Educação', tipo: 'Despesa', cor: '#FFEAA7', icone: '📚', descricao: 'Escola, faculdade, cursos com mensalidade, material escolar fixo. DESPESA FIXA.', classificacao: 'fixa' },
  { nome: 'Plano de Saúde', tipo: 'Despesa', cor: '#4DB6AC', icone: '🏥', descricao: 'Plano de saúde, plano dental, seguro saúde mensal. DESPESA FIXA.', classificacao: 'fixa' },
  { nome: 'Seguros', tipo: 'Despesa', cor: '#78909C', icone: '🛡️', descricao: 'Seguro do carro, seguro de vida, seguro residencial. DESPESA FIXA.', classificacao: 'fixa' },
  { nome: 'Assinaturas / Streaming', tipo: 'Despesa', cor: '#AB47BC', icone: '📺', descricao: 'Netflix, Spotify, Disney+, iCloud, apps com mensalidade. DESPESA FIXA.', classificacao: 'fixa' },
  { nome: 'Financiamentos / Parcelas Fixas', tipo: 'Despesa', cor: '#5C6BC0', icone: '🏦', descricao: 'Parcela do carro, empréstimo, consórcio, prestação fixa. DESPESA FIXA.', classificacao: 'fixa' },
  { nome: 'Dízimos e Ofertas', tipo: 'Despesa', cor: '#7E57C2', icone: '⛪', descricao: 'Dízimos, ofertas, contribuições religiosas. DESPESA FIXA.', classificacao: 'fixa' },

  // ═══════════════════════════════════════════
  // DESPESAS VARIÁVEIS (oscilam mês a mês)
  // ═══════════════════════════════════════════
  { nome: 'Alimentação', tipo: 'Despesa', cor: '#FF6B6B', icone: '🍽️', descricao: 'Supermercado, feira, açougue, padaria, hortifrúti. DESPESA VARIÁVEL.', classificacao: 'variavel' },
  { nome: 'Restaurante / Delivery', tipo: 'Despesa', cor: '#FF8A65', icone: '🍕', descricao: 'Restaurantes, lanchonetes, iFood, Rappi, cafés. DESPESA VARIÁVEL.', classificacao: 'variavel' },
  { nome: 'Transporte', tipo: 'Despesa', cor: '#4ECDC4', icone: '🚗', descricao: 'Combustível, Uber, 99, estacionamento, pedágio, manutenção carro. DESPESA VARIÁVEL.', classificacao: 'variavel' },
  { nome: 'Saúde', tipo: 'Despesa', cor: '#96CEB4', icone: '💊', descricao: 'Farmácia, consulta avulsa, exame, dentista pontual. DESPESA VARIÁVEL.', classificacao: 'variavel' },
  { nome: 'Vestuário', tipo: 'Despesa', cor: '#F8BBD9', icone: '👕', descricao: 'Roupas, calçados, acessórios. DESPESA VARIÁVEL.', classificacao: 'variavel' },
  { nome: 'Lazer / Entretenimento', tipo: 'Despesa', cor: '#DDA0DD', icone: '🎮', descricao: 'Cinema, shows, jogos, viagens curtas, hobbies. DESPESA VARIÁVEL.', classificacao: 'variavel' },
  { nome: 'Cuidados Pessoais', tipo: 'Despesa', cor: '#F48FB1', icone: '💇', descricao: 'Cabelereiro, barbearia, estética, academia avulsa. DESPESA VARIÁVEL.', classificacao: 'variavel' },
  { nome: 'Pets', tipo: 'Despesa', cor: '#A1887F', icone: '🐾', descricao: 'Ração, veterinário, petshop, acessórios pet. DESPESA VARIÁVEL.', classificacao: 'variavel' },
  { nome: 'Doações', tipo: 'Despesa', cor: '#EC407A', icone: '🤝', descricao: 'Doações para ONGs, vaquinhas, ajuda a terceiros. DESPESA VARIÁVEL.', classificacao: 'variavel' },
  { nome: 'Impostos / Taxas', tipo: 'Despesa', cor: '#A1887F', icone: '💰', descricao: 'IPVA, IRPF, taxas diversas, multas. DESPESA VARIÁVEL.', classificacao: 'variavel' },
  { nome: 'Compras Diversas', tipo: 'Despesa', cor: '#90A4AE', icone: '🛍️', descricao: 'Eletrônicos, casa, presentes para outros, itens pontuais. DESPESA VARIÁVEL.', classificacao: 'variavel' },
  { nome: 'Outras Despesas', tipo: 'Despesa', cor: '#78909C', icone: '📦', descricao: 'Gastos que não se encaixam nas categorias acima. DESPESA VARIÁVEL.', classificacao: 'variavel' },
];
