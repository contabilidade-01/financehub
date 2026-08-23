from meta_tools import MetaManager
import re

class AgentConfig:
    def __init__(self):
        self.meta_manager = MetaManager()

        # Mapeamento robusto de intenções
        self.intent_map = {
            "AJUSTAR": ["atualizar", "ajustar", "mudar para", "ficar com", "definir como", "setar", "valor atual para", "atualize"],
            "DEPOSITAR": ["depositar", "colocar", "adicionar", "somar", "estou colocando", "aporte"],
            "SACAR": ["sacar", "tirar", "remover", "subtrair", "retirar"],
            "PROGRESSO": ["progresso", "valor atual", "quanto tenho", "saldo", "como está", "extrato"],
            "EXCLUIR": ["excluir", "apagar", "deletar", "remover a meta", "cancelar meta"]
        }

    def _extract_value(self, text: str) -> float:
        """Extrai o primeiro valor numérico da string, tratando vírgulas e pontos."""
        # Remove pontos de milhar e troca vírgula decimal por ponto
        # Ex: "1.500,00" -> "1500.00"
        cleaned_text = text.replace(".", "").replace(",", ".")
        numbers = re.findall(r"[-+]?\d*\.\d+|\d+", cleaned_text)
        return float(numbers[0]) if numbers else 0.0

    def _extract_meta_title(self, text: str) -> str:
        """Tenta extrair o nome da meta após a palavra 'meta'."""
        # Procura por "meta [nome]" até encontrar um número ou palavra de comando
        match = re.search(r"meta\s+([\w\s]+?)(?=\s+para|\s+de|\s+em|\s+com|\d|$)", text, re.IGNORECASE)
        if match:
            return match.group(1).strip().title()
        return "Meta Padrão"

    def handle_user_request(self, user_input: str) -> str:
        text = user_input.lower()

        # 1. Identificar a intenção
        intent = None
        for action, keywords in self.intent_map.items():
            if any(word in text for word in keywords):
                intent = action
                break

        # 2. Executar a ação baseada na intenção
        try:
            valor = self._extract_value(text)
            titulo = self._extract_meta_title(text)

            if intent == "AJUSTAR":
                return self.meta_manager.ajustar_saldo_meta(titulo, valor)
            elif intent == "DEPOSITAR":
                return self.meta_manager.depositar_meta(titulo, valor)
            elif intent == "SACAR":
                return self.meta_manager.sacar_meta(titulo, valor)
            elif intent == "PROGRESSO":
                return self.meta_manager.get_progresso(titulo)
            elif intent == "EXCLUIR":
                return self.meta_manager.excluir_meta(titulo)

        except Exception as e:
            return f"Tive um problema ao processar os valores: {str(e)}. Tente dizer 'Ajustar Meta Viagem para 30000'."

        # 3. Fallback Educativo (Crucial para a experiência do usuário)
        return (
            "Não consegui identificar exatamente o que você deseja fazer com a sua meta. 😕\n\n"
            "Para eu te ajudar, escolha uma das opções:\n"
            "1️⃣ **Depositar**: Somar um valor ao saldo atual.\n"
            "2️⃣ **Ajustar Saldo**: Definir o valor total da meta (ex: 'Ajustar Meta Viagem para 30000').\n"
            "3️⃣ **Sacar**: Remover um valor do saldo.\n"
            "4️⃣ **Ver Progresso**: Saber quanto você já economizou.\n"
            "5️⃣ **Excluir Meta**: Remover a meta completamente.\n\n"
            "Qual dessas você prefere?"
        )

if __name__ == "__main__":
    agent = AgentConfig()
    # Testando os casos críticos
    print(f"Pedido: 'Atualize a Meta Viagem para 30000' -> {agent.handle_user_request('Atualize a Meta Viagem para 30000')}")
    print(f"Pedido: 'Tire 500 da Meta Viagem' -> {agent.handle_user_request('Tire 500 da Meta Viagem')}")
    print(f"Pedido: 'Quanto tenho na Meta Viagem?' -> {agent.handle_user_request('Quanto tenho na Meta Viagem?')}")
    print(f"Pedido: 'Algo aleatório' -> {agent.handle_user_request('Alguma coisa aqui')}")
