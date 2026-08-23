import random
from meta_tools import MetaManager

class MetaDiagnosticBot:
    def __init__(self):
        self.manager = MetaManager()
        # Banco de dados de simulações para diagnóstico
        self.scenarios = [
            {
                "input": "Depositar 500 reais na Meta Viagem",
                "expected": "DEPOSITAR",
                "desc": "Depósito simples"
            },
            {
                "input": "Atualize o saldo da Meta Viagem para 2000 reais",
                "expected": "AJUSTAR_SALDO",
                "desc": "Atualização de saldo (Sair de 500 para 2000)"
            },
            {
                "input": "Ajuste a Meta Viagem para 1000 reais",
                "expected": "AJUSTAR_SALDO",
                "desc": "Ajuste de saldo (Sair de 2000 para 1000)"
            },
            {
                "input": "Tire 200 reais da Meta Viagem",
                "expected": "SACAR",
                "desc": "Saque/Remoção de valor"
            },
            {
                "input": "Qual o progresso da Meta Viagem?",
                "expected": "PROGRESSO",
                "desc": "Consulta de saldo"
            },
            {
                "input": "Exclua a meta de viagem",
                "expected": "EXCLUIR",
                "desc": "Exclusão de meta"
            }
        ]

    def simulate_agent_logic(self, text):
        """Simula a lógica de decisão do agente para diagnóstico"""
        text_lower = text.lower()

        # Lógica de decisão (Refletindo a correção feita no agent_config)
        if any(word in text_lower for word in ["depositar", "colocar", "adicionar"]):
            return "ACTION: DEPOSITAR", self.manager.depositar_meta("Meta Viagem", 500)

        if any(word in text_lower for word in ["atualizar", "ajustar", "mudar para", "ficar com"]):
            return "ACTION: AJUSTAR_SALDO", self.manager.ajustar_saldo_meta("Meta Viagem", 2000)

        if any(word in text_lower for word in ["sacar", "tirar", "remover"]):
            return "ACTION: SACAR", self.manager.sacar_meta("Meta Viagem", 200)

        if any(word in text_lower for word in ["progresso", "valor atual", "quanto tenho"]):
            return "ACTION: PROGRESSO", self.manager.get_progresso("Meta Viagem")

        if any(word in text_lower for word in ["excluir", "apagar", "deletar"]):
            return "ACTION: EXCLUIR", self.manager.excluir_meta("Meta Viagem")

        return "ACTION: DESCONHECIDA", "Não entendi o comando"

    def run_audit(self):
        print("="*60)
        print(" DIAGNOSTICO DE COMPORTAMENTO DE METAS AO VIVO")
        print("="*60)

        for i, s in enumerate(self.scenarios, 1):
            print(f"\nCenario {i}: {s['desc']}")
            print(f"Usuario: \"{s['input']}\"")

            action, result = self.simulate_agent_logic(s['input'])

            print(f"Agente interpretou como: {action}")
            print(f"Resultado: {result}")

            if s['expected'] in action:
                print("SUCESSO: A intencao foi capturada corretamente.")
            else:
                print("FALHA: O agente confundiu a acao.")
            print("-" * 30)

if __name__ == "__main__":
    bot = MetaDiagnosticBot()
    bot.run_audit()