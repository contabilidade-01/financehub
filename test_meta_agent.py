from agent_config import AgentConfig

class TestMetaAgent:
    def __init__(self):
        self.agent = AgentConfig()

    def test_depositar_valor(self):
        response = self.agent.handle_user_request("depositar Meta Férias 5000")
        assert "Depósito de R$ 5000 na meta 'Meta Férias'. Novo saldo: R$ 5000" in response
        print("Teste 1: Depositar Valor — Passou")

    def test_ajustar_saldo(self):
        response = self.agent.handle_user_request("ajustar Meta Férias 10000")
        assert "Saldo da meta 'Meta Férias' ajustado para R$ 10000" in response
        print("Teste 2: Ajustar Saldo — Passou")

    def test_sacar_valor(self):
        response = self.agent.handle_user_request("sacar Meta Férias 2000")
        assert "Saque de R$ 2000 da meta 'Meta Férias'. Novo saldo: R$ 8000" in response
        print("Teste 3: Sacar Valor — Passou")

    def test_excluir_meta(self):
        response = self.agent.handle_user_request("excluir Meta Férias")
        assert "Meta 'Meta Férias' excluída com sucesso" in response
        print("Teste 4: Excluir Meta — Passou")

    def test_verificar_progresso(self):
        self.agent.handle_user_request("depositar Meta Férias 5000")
        response = self.agent.handle_user_request("progresso Meta Férias")
        assert "Progresso da meta 'Meta Férias': R$ 5000" in response
        print("Teste 5: Verificar Progresso — Passou")

    def test_atualizar_valor(self):
        response = self.agent.handle_user_request("atualizar Meta Férias 15000")
        assert "Saldo da meta 'Meta Férias' ajustado para R$ 15000" in response
        print("Teste 6: Atualizar Valor — Passou")

    def run_tests(self):
        self.test_depositar_valor()
        self.test_ajustar_saldo()
        self.test_sacar_valor()
        self.test_excluir_meta()
        self.test_verificar_progresso()
        self.test_atualizar_valor()

if __name__ == "__main__":
    test_agent = TestMetaAgent()
    test_agent.run_tests()