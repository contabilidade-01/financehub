from meta_tools import MetaManager

class AgentConfig:
    def __init__(self):
        self.meta_manager = MetaManager()

    def handle_user_request(self, user_input: str) -> str:
        # Exemplo de lógica para lidar com a entrada do usuário
        if "depositar" in user_input.lower():
            # Extrair título e valor da entrada do usuário
            # Esta é uma lógica simplificada; você pode precisar de uma abordagem mais robusta
            parts = user_input.split()
            titulo = parts[1] if len(parts) > 1 else "Meta Padrão"
            valor = float(parts[2]) if len(parts) > 2 else 0.0
            return self.meta_manager.depositar_meta(titulo, valor)
        elif "ajustar saldo" in user_input.lower():
            parts = user_input.split()
            titulo = parts[2] if len(parts) > 2 else "Meta Padrão"
            valor_total = float(parts[3]) if len(parts) > 3 else 0.0
            return self.meta_manager.ajustar_saldo_meta(titulo, valor_total)
        elif "sacar" in user_input.lower():
            parts = user_input.split()
            titulo = parts[1] if len(parts) > 1 else "Meta Padrão"
            valor = float(parts[2]) if len(parts) > 2 else 0.0
            return self.meta_manager.sacar_meta(titulo, valor)
        elif "excluir" in user_input.lower():
            parts = user_input.split()
            titulo = parts[1] if len(parts) > 1 else "Meta Padrão"
            return self.meta_manager.excluir_meta(titulo)
        elif "progresso" in user_input.lower():
            parts = user_input.split()
            titulo = parts[1] if len(parts) > 1 else "Meta Padrão"
            return self.meta_manager.get_progresso(titulo)
        else:
            return "Desculpe, não entendi sua solicitação. Por favor, use termos como 'depositar', 'ajustar saldo', 'sacar', 'excluir' ou 'progresso'."

# Exemplo de uso
if __name__ == "__main__":
    agent = AgentConfig()
    print(agent.handle_user_request("depositar Meta 100 mil 10000"))
    print(agent.handle_user_request("ajustar saldo Meta 100 mil 30000"))
    print(agent.handle_user_request("sacar Meta 100 mil 5000"))
    print(agent.handle_user_request("progresso Meta 100 mil"))
    print(agent.handle_user_request("excluir Meta 100 mil"))