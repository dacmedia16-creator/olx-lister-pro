## Validação de aspect ratio 16:9 antes de salvar

Alterar `supabase/functions/enhance-listing-images/index.ts` para validar cada foto retornada pelo Gemini antes do upload no bucket.

### Fluxo
1. Após `callGeminiEdit` retornar o PNG, decodificar com `imagescript` e ler `width`/`height`.
2. Calcular `ratio = width / height` e comparar com `16/9 ≈ 1.777` (tolerância ±3%, ou seja `1.72` a `1.83`).
3. **Se estiver dentro da tolerância**: salva como está.
4. **Se estiver fora** (saída veio quadrada, vertical, ou proporção estranha): re-encaixa a imagem gerada num canvas horizontal 1536×864 com letterbox branco (reutiliza `toHorizontalCanvas` já existente) e salva a versão corrigida.
5. Registrar em `processing_logs` (metadata) o par `{original_ratio, final_ratio, was_corrected}` para auditoria.

### Extras
- Se decodificar falhar, marcar a imagem como `failed` com mensagem clara (evita salvar bytes corrompidos).
- Reaproveitar `toHorizontalCanvas(bytes)` — já existe no arquivo; sem novas dependências.
- Redeploy da função `enhance-listing-images`.

### Fora do escopo
- Não retrata fotos já salvas anteriormente (usuário reprocessa clicando "Tratar fotos com IA").
- Não altera o prompt nem o pipeline de entrada (letterbox já garante entrada horizontal).
