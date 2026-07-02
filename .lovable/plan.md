## Problema

Navegar para `/tools/enhance/new` não abre a tela de novo lote — a URL muda mas a página continua mostrando a lista "Tratar fotos". Causa: no roteamento flat do TanStack, `tools.enhance.tsx` é pai de `tools.enhance.new.tsx` e `tools.enhance.$id.tsx`, mas o arquivo renderiza direto o conteúdo da lista em vez de um `<Outlet />`, então as rotas filhas nunca aparecem.

## Correção (somente frontend, roteamento)

1. Criar `src/routes/_authenticated/tools.enhance.index.tsx` com o conteúdo atual da lista (`BatchesList`) e rota `createFileRoute("/_authenticated/tools/enhance/")`.
2. Reescrever `src/routes/_authenticated/tools.enhance.tsx` para ser apenas um layout: `component: () => <Outlet />` (sem `head`, sem UI própria — os filhos já definem título e conteúdo).
3. Não mexer em `tools.enhance.new.tsx` nem `tools.enhance.$id.tsx`.

Resultado: `/tools/enhance` continua listando lotes, e `/tools/enhance/new` passa a renderizar o formulário de upload.
