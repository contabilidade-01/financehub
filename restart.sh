#!/bin/bash

echo "🔄 Parando processos nas portas 5000 e 5001..."

# Função para matar processos em uma porta
kill_port() {
    local PORT=$1
    local PID=$(lsof -ti:$PORT)

    if [ ! -z "$PID" ]; then
        echo "📍 Processo encontrado na porta $PORT (PID: $PID)"
        kill -9 $PID 2>/dev/null || true
        echo "✅ Processo $PID finalizado"

        # Aguardar um momento para garantir que o processo foi encerrado
        sleep 1

        # Verificar se ainda há processos na porta
        REMAINING=$(lsof -ti:$PORT)
        if [ ! -z "$REMAINING" ]; then
            echo "⚠️  Ainda há processos na porta $PORT, forçando encerramento..."
            kill -9 $REMAINING 2>/dev/null || true
            sleep 1
        fi
    else
        echo "ℹ️  Nenhum processo encontrado na porta $PORT"
    fi
}

# Matar processos nas portas 5000 e 5001
kill_port 5000
kill_port 5001

echo "🚀 Iniciando servidor..."
npm run dev