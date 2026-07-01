## Problema
Login falha com `email_not_confirmed`. O Supabase Auth exige confirmação por email, e a conta `dacmedia16@gmail.com` foi criada mas nunca confirmada.

## Solução
1. **Ativar `auto_confirm_email`** na config de Auth — novos cadastros passam a entrar direto, sem precisar de clique em email de confirmação.
2. **Confirmar manualmente a conta existente** `dacmedia16@gmail.com` marcando `email_confirmed_at = now()` em `auth.users` (via insert/update SQL na tabela de auth).

## Resultado
- Login imediato com a conta atual.
- Novos cadastros no `/auth` também entrarão direto sem etapa de confirmação por email.

## Observação
Isso reduz a barreira de segurança do fluxo de signup (qualquer email, mesmo inválido, cria conta ativa). Adequado para MVP; se depois quiser reforçar, basta reativar a confirmação.