from typing import Dict, List

class MetaManager:
    def __init__(self):
        self.metas: Dict[str, float] = {}
        self.valores: Dict[str, List[float]] = {}

    def depositar_meta(self, titulo: str, valor: float) -> str:
        if titulo not in self.metas:
            self.metas[titulo] = 0.0
            self.valores[titulo] = []
        self.valores[titulo].append(valor)
        total = sum(self.valores[titulo])
        self.metas[titulo] = total
        return f"Depósito de R$ {valor} na meta '{titulo}'. Novo saldo: R$ {total}"

    def ajustar_saldo_meta(self, titulo: str, valor_total: float) -> str:
        if titulo not in self.metas:
            self.metas[titulo] = valor_total
            self.valores[titulo] = [valor_total]
        else:
            self.metas[titulo] = valor_total
            self.valores[titulo] = [valor_total]
        return f"Saldo da meta '{titulo}' ajustado para R$ {valor_total}"

    def sacar_meta(self, titulo: str, valor: float) -> str:
        if titulo not in self.metas:
            return f"Meta '{titulo}' não encontrada."
        if valor > self.metas[titulo]:
            return f"Valor de saque R$ {valor} excede o saldo da meta '{titulo}'. Saldo atual: R$ {self.metas[titulo]}"
        self.metas[titulo] -= valor
        self.valores[titulo].append(-valor)  # Registra o saque como um valor negativo
        return f"Saque de R$ {valor} da meta '{titulo}'. Novo saldo: R$ {self.metas[titulo]}"

    def excluir_meta(self, titulo: str) -> str:
        if titulo in self.metas:
            del self.metas[titulo]
            del self.valores[titulo]
            return f"Meta '{titulo}' excluída com sucesso."
        else:
            return f"Meta '{titulo}' não encontrada."

    def get_progresso(self, titulo: str) -> str:
        if titulo not in self.metas:
            return f"Meta '{titulo}' não encontrada."
        total = sum(self.valores[titulo])
        return f"Progresso da meta '{titulo}': R$ {total}"

# Exemplo de uso
if __name__ == "__main__":
    manager = MetaManager()
    print(manager.depositar_meta("Meta 100 mil", 10000))
    print(manager.ajustar_saldo_meta("Meta 100 mil", 30000))
    print(manager.sacar_meta("Meta 100 mil", 5000))
    print(manager.get_progresso("Meta 100 mil"))
    print(manager.excluir_meta("Meta 100 mil"))