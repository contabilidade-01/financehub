-- Script para resetar o usuário bruno@xpiria.com.br
-- Mantém apenas o usuário, senha e um token de API

-- Primeiro, obter o ID do usuário bruno
DO $$
DECLARE
    bruno_user_id INTEGER;
    bruno_wallet_id INTEGER;
BEGIN
    -- Buscar o ID do usuário bruno
    SELECT id INTO bruno_user_id 
    FROM usuarios 
    WHERE email = 'bruno@xpiria.com.br';
    
    IF bruno_user_id IS NULL THEN
        RAISE NOTICE 'Usuário bruno@xpiria.com.br não encontrado';
        RETURN;
    END IF;
    
    RAISE NOTICE 'ID do usuário bruno: %', bruno_user_id;
    
    -- Buscar ID da carteira do bruno
    SELECT id INTO bruno_wallet_id 
    FROM carteiras 
    WHERE usuario_id = bruno_user_id;
    
    IF bruno_wallet_id IS NOT NULL THEN
        RAISE NOTICE 'ID da carteira do bruno: %', bruno_wallet_id;
        
        -- 1. Deletar todas as transações do bruno
        DELETE FROM transacoes WHERE carteira_id = bruno_wallet_id;
        RAISE NOTICE 'Transações deletadas';
    END IF;
    
    -- 2. Deletar todos os lembretes do bruno
    DELETE FROM lembretes WHERE usuario_id = bruno_user_id;
    RAISE NOTICE 'Lembretes deletados';
    
    -- 3. Deletar sessões de administração relacionadas ao bruno
    DELETE FROM user_sessions_admin WHERE target_user_id = bruno_user_id;
    RAISE NOTICE 'Sessões de admin deletadas';
    
    -- 4. Deletar categorias personalizadas do bruno (manter apenas globais)
    DELETE FROM categorias WHERE usuario_id = bruno_user_id;
    RAISE NOTICE 'Categorias personalizadas deletadas';
    
    -- 5. Deletar todos os tokens de API exceto um
    -- Primeiro, manter apenas o token mais recente
    DELETE FROM api_tokens 
    WHERE usuario_id = bruno_user_id 
    AND id NOT IN (
        SELECT id 
        FROM api_tokens 
        WHERE usuario_id = bruno_user_id 
        ORDER BY data_criacao DESC 
        LIMIT 1
    );
    RAISE NOTICE 'Tokens de API extras deletados';
    
    -- 6. Resetar o saldo da carteira para 0
    IF bruno_wallet_id IS NOT NULL THEN
        UPDATE carteiras 
        SET saldo_atual = '0.00' 
        WHERE id = bruno_wallet_id;
        RAISE NOTICE 'Saldo da carteira resetado para 0';
    END IF;
    
    -- 7. Atualizar dados do usuário (manter apenas email, senha e campos essenciais)
    UPDATE usuarios 
    SET 
        ultimo_acesso = CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo',
        ativo = true,
        tipo_usuario = 'usuario'
    WHERE id = bruno_user_id;
    RAISE NOTICE 'Dados do usuário atualizados';
    
    RAISE NOTICE 'Reset do usuário bruno@xpiria.com.br concluído com sucesso!';
    
END $$;

-- Verificar o estado final
SELECT 
    u.id,
    u.email,
    u.nome,
    u.ativo,
    u.tipo_usuario,
    w.saldo_atual as saldo_carteira,
    (SELECT COUNT(*) FROM transacoes t WHERE t.carteira_id = w.id) as total_transacoes,
    (SELECT COUNT(*) FROM lembretes l WHERE l.usuario_id = u.id) as total_lembretes,
    (SELECT COUNT(*) FROM categorias c WHERE c.usuario_id = u.id) as total_categorias,
    (SELECT COUNT(*) FROM api_tokens at WHERE at.usuario_id = u.id) as total_tokens
FROM usuarios u
LEFT JOIN carteiras w ON w.usuario_id = u.id
WHERE u.email = 'bruno@xpiria.com.br';