// Edge Function: enhance-listing-images
// Melhora as fotos de um anúncio via OpenAI API própria (gpt-image-1 edits)
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// imagescript removido: baixava wasm remoto em runtime e falhava (Connection refused) na Edge.
// Como pedimos size=1536x1024 direto para a OpenAI, a resposta já vem em 3:2 e não precisamos
// re-encaixar em canvas nem detectar faixas brancas via decodificação de pixel.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const BUCKET = "olx-images";
const PROMPT = "Melhore esta foto de imóvel mantendo aparência de FOTOGRAFIA REAL de celular tirada por um corretor de imóveis comum — NÃO uma foto profissional de catálogo, NÃO Airbnb Plus, NÃO revista de arquitetura, NÃO render 3D. A referência mental correta é 'foto honesta de celular em visita ao imóvel', não 'ensaio profissional'. Preserve 100% do ambiente, móveis, layout, texturas, cores das paredes, piso e todos os elementos da cena original. REALISMO FOTOGRÁFICO (CRÍTICO): TEXTURAS devem ser preservadas exatamente como estão — poros e imperfeições da pintura da parede, veios e nós da madeira, trama do tecido de sofá/cama/cortina, riscos e marcas de uso no piso, pequenas manchas, pó, rugosidade natural. PROIBIDO alisar, 'limpar', idealizar ou dar aparência de cerâmica, plástico, vinil brilhante ou superfície nova de loja. ILUMINAÇÃO deve ser mantida IDÊNTICA à original: mesma temperatura de cor (quente/fria), mesma direção e intensidade da luz, mesmas sombras, mesma exposição das janelas. PROIBIDO iluminar áreas escuras, preencher sombras, realçar entrada de luz pelas janelas, aplicar HDR, tone-mapping, golden hour artificial, halos luminosos ou aparência de iluminação de estúdio. Se a foto original está com pouca luz, permanece com pouca luz. CORES devem ser fiéis ao original: mesma saturação, mesmo balanço de branco. Correção só é permitida se houver dominante amarela/azul CLARAMENTE errada, e ainda assim de forma sutil. PROIBIDO deixar cores 'vivas', turbinar verde de plantas, deixar céu mais azul, madeira mais rica, azulejo mais branco ou realçar qualquer cor. RUÍDO FOTOGRÁFICO original (grão de câmera/celular) deve ser preservado — proibido denoise agressivo que deixe a imagem 'lavada'. GEOMETRIA E PROPORÇÕES (CRÍTICO): a saída deve parecer a MESMA foto, apenas mais limpa — não uma reinterpretação. Preserve 100% a geometria original: linhas retas continuam PERFEITAMENTE RETAS (paredes, cantos, rodapés, batentes, molduras de janela e porta, quadros, TV, prateleiras, colunas, vigas, réguas do piso). PROIBIDO curvar, entortar, arquear, inclinar, ondular ou distorcer qualquer aresta reta. Janelas, portas, quadros, TVs, espelhos e móveis retangulares devem manter retângulos perfeitos com cantos a 90° e lados paralelos. Móveis (sofá, cama, poltrona, mesa, cadeira, armário, rack, cômoda) devem manter EXATAMENTE o mesmo formato, proporção, tamanho relativo, número de almofadas/gavetas/portas/pernas, ângulo dos braços/encostos e posição no ambiente — PROIBIDO alongar, encolher, curvar encosto, entortar pernas, mudar ângulo, fundir peças ou trocar por outro modelo. Perspectiva, ponto de vista, altura e lente aparente da câmera devem ser IDÊNTICOS aos da foto original — proibido reenquadrar, girar, mudar a linha do horizonte ou a distorção de lente. Piso mantém o mesmo padrão, direção e alinhamento das réguas/placas, incluindo brilho natural (proibido brilho especular exagerado tipo 'piso encerado de showroom'). Reflexos em vidros, TVs, espelhos e superfícies polidas devem ser sutis e realistas — proibido reflexos irreais adicionados. Pessoas, plantas, animais e objetos decorativos mantêm anatomia e forma corretas — proibido membros/dedos extras, olhos deformados, folhas derretidas ou objetos amassados. REMOÇÃO DE MARCA D'ÁGUA: se houver logo, selo, marca d'água, carimbo ou texto sobreposto dos portais OLX, OLX Brasil, ZAP, ZAP Imóveis, Viva Real ou qualquer portal imobiliário (em qualquer canto, faixa, centro, com transparência ou opaco) — remova COMPLETAMENTE reconstruindo de forma fotorrealista a parte do ambiente que estava coberta (parede, piso, teto, móvel, céu, fachada etc.), respeitando as linhas retas, a perspectiva, a textura e a iluminação já existentes, sem deixar borrão, mancha, contorno, halo ou fantasma da logo original. O resultado não pode conter nenhum vestígio de marca d'água. NITIDEZ CRÍTICA: preserve nitidez total de TODOS os objetos da cena, inclusive itens pequenos e ao fundo (garrafas, utensílios, panelas, eletrodomésticos, decoração, relógios, quadros, maçanetas, interruptores, tomadas, texturas de piso e parede). Nenhum item pode ficar desfocado, borrado, com contornos suavizados ou perder detalhes. PROIBIDO: blur, bokeh, profundidade de campo artificial, suavização de fundo, motion blur, qualquer tipo de desfoque seletivo. Ajustes permitidos (todos SUTIS): correção leve de exposição só se estiver muito escura ou estourada, correção sutil de balanço de branco só se houver dominante clara de cor, remoção de leve desfoque de câmera (aumentando nitidez, nunca reduzindo) e endireitamento sutil de horizonte torto. PROIBIDO TAMBÉM (lista negativa reforçada): HDR, tone-mapping, saturação artificial, contraste excessivo, superfícies plásticas/cerâmicas/idealizadas, aparência de render 3D (Lumion, V-Ray, Enscape, D5, Blender), staging virtual, look Airbnb Plus, look de e-commerce, look de revista de decoração, iluminação de estúdio, rebatedores virtuais, céu substituído, plantas adicionadas, decoração adicionada, mobília trocada, textura de piso 'perfeita', brilho especular exagerado. O objetivo é que uma pessoa comparando lado a lado a foto original e a tratada perceba APENAS uma pequena melhora de exposição/nitidez — nunca 'nossa, virou outra foto'. Entregue no formato HORIZONTAL (paisagem 3:2). Se a foto original for vertical, faça outpainting fotorrealista e NÍTIDO estendendo naturalmente parede, piso, teto e iluminação para preencher as laterais, mantendo linhas retas, perspectiva, textura, cor e iluminação coerentes com a área original — NUNCA deixe faixas brancas, cinzas, bordas ou áreas desfocadas. A imagem inteira deve parecer UMA FOTO ÚNICA de celular, real, nítida em toda a extensão, geometricamente correta, texturalmente autêntica e sem qualquer marca d'água.";
const WATERMARK_ONLY_PROMPT = "Sua ÚNICA tarefa é remover marcas d'água, logos, selos, carimbos e textos sobrepostos dos portais imobiliários (OLX, OLX Brasil, ZAP, ZAP Imóveis, Viva Real, ImovelWeb, QuintoAndar ou qualquer outro) que apareçam sobre esta foto, em qualquer canto, faixa, centro, com transparência ou opacos. Reconstrua de forma fotorrealista APENAS a parte do ambiente que estava coberta pela logo (parede, piso, teto, móvel, céu, fachada, textura etc.), respeitando as linhas retas, cantos a 90° e a perspectiva já existentes ao redor, sem deixar borrão, mancha, contorno, halo ou fantasma da marca original. PRESERVE 100% do restante da imagem EXATAMENTE como está: mesmo enquadramento, mesma composição, mesma perspectiva, mesmas cores, mesma exposição, mesmo balanço de branco, mesmo nível de nitidez, mesmos móveis, mesmos objetos, mesma iluminação, mesmas sombras, mesmas texturas, mesmo ruído fotográfico. GEOMETRIA (CRÍTICO): PROIBIDO curvar, entortar, arquear, inclinar ou distorcer qualquer aresta reta (paredes, rodapés, batentes, molduras de janela e porta, quadros, TV, prateleiras, réguas do piso). PROIBIDO alterar formato, proporção, tamanho, ângulo ou posição de QUALQUER móvel, objeto, pessoa, planta ou elemento arquitetônico — nada pode ser alongado, encolhido, curvado, redesenhado, movido, adicionado ou removido. Janelas, portas, quadros e TVs continuam retângulos perfeitos com cantos a 90°. Anatomia de pessoas, animais e plantas permanece correta e idêntica à original. PROIBIDO: alterar cores, aumentar saturação, mudar contraste, aplicar HDR, aplicar blur ou bokeh, mudar a proporção/formato, recortar, girar, endireitar, adicionar ou remover objetos, mover móveis, mudar a hora do dia, mudar o clima, adicionar iluminação de estúdio, deixar com aparência de render 3D ou revista. Não é uma edição estética — é APENAS remoção de marca d'água com reconstrução invisível do fundo por trás dela. O resultado deve ser indistinguível da foto original a olho nu, exceto pela ausência total de qualquer logo ou marca d'água.";
const MODEL = "gpt-image-1";
const IMAGE_SIZE = "1536x1024"; // horizontal 3:2 (modo enhance)
const TARGET_W = 1536;
const TARGET_H = 1024;

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, { headers: { "Referer": "https://www.olx.com.br/" } });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch { return null; }
}

// Fallback removido — dependia de imagescript. Se a OpenAI devolver aspect fora do 3:2,
// aceitamos a imagem como veio e marcamos was_corrected=false para auditoria.



async function callOpenAiImageEdit(imageBytes: Uint8Array, promptText: string, sizeOverride?: string, quality: "low" | "medium" = "low"): Promise<Uint8Array> {
  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", promptText);
  form.append("size", sizeOverride || IMAGE_SIZE);
  form.append("quality", quality);
  form.append("n", "1");

  form.append("image", new Blob([imageBytes], { type: "image/png" }), "input.png");

  const r = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    if (r.status === 401) throw new Error("Chave OpenAI inválida (401). Verifique a OPENAI_API_KEY.");
    if (r.status === 403) {
      if (/verified|verification/i.test(text)) {
        throw new Error("Sua organização OpenAI precisa ser verificada para usar gpt-image-1. Vá em platform.openai.com/settings/organization/general e clique em Verify.");
      }
      throw new Error(`OpenAI 403: ${text.slice(0, 400)}`);
    }
    if (r.status === 429) throw new Error("Limite de requisições OpenAI atingido (429). Tente em instantes.");
    if (r.status === 400 && /billing|quota|hard_limit/i.test(text)) {
      throw new Error("Sem créditos na conta OpenAI. Adicione saldo em platform.openai.com/settings/organization/billing.");
    }
    throw new Error(`OpenAI error ${r.status}: ${text.slice(0, 400)}`);
  }
  const json = await r.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Resposta sem imagem gerada");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Detecção de faixas brancas removida — dependia de imagescript. Como pedimos outpainting
// no prompt e size=1536x1024 direto, se aparecerem faixas o usuário pode "Retratar" a foto.


// Lê width/height direto do header PNG.
function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

function readJpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 2;
  while (i < bytes.length) {
    while (i < bytes.length && bytes[i] !== 0xff) i++;
    while (i < bytes.length && bytes[i] === 0xff) i++;
    if (i >= bytes.length) return null;
    const marker = bytes[i]; i++;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x00) continue;
    if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 7 > bytes.length) return null;
      const h = dv.getUint16(i + 3);
      const w = dv.getUint16(i + 5);
      return { width: w, height: h };
    }
    if (i + 2 > bytes.length) return null;
    const seg = dv.getUint16(i);
    i += seg;
  }
  return null;
}

function pickSizeForOriginal(bytes: Uint8Array): string {
  const size = readPngSize(bytes) ?? readJpegSize(bytes);
  if (!size || size.height === 0) return "1024x1024";
  const ratio = size.width / size.height;
  if (ratio >= 1.2) return "1536x1024";
  if (ratio <= 0.83) return "1024x1536";
  return "1024x1024";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const listingId = body?.listing_id as string | undefined;
    const batchId = body?.batch_id as string | undefined;
    const imageIds = Array.isArray(body?.image_ids) ? (body.image_ids as string[]) : null;
    const mode = (body?.mode === "watermark_only" ? "watermark_only" : "enhance") as "enhance" | "watermark_only";
    const quality = (body?.quality === "medium" ? "medium" : "low") as "low" | "medium";
    const activePrompt = mode === "watermark_only" ? WATERMARK_ONLY_PROMPT : PROMPT;


    // Fluxo 2: lote de upload avulso ------------------------------------------------
    if (batchId) {
      const { data: batch, error: berr } = await admin.from("photo_batches").select("id,user_id").eq("id", batchId).maybeSingle();
      if (berr || !batch || batch.user_id !== userId) {
        return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      let q = admin.from("photo_batch_images").select("id,original_storage_path,enhancement_status").eq("batch_id", batchId);
      if (imageIds && imageIds.length) q = q.in("id", imageIds);
      const { data: imgs } = await q;
      const allTargets = (imgs ?? []).filter((i: any) => i.original_storage_path);
      const MAX_PER_CALL = 2;
      const targets = allTargets.slice(0, MAX_PER_CALL);
      const remaining_ids = allTargets.slice(MAX_PER_CALL).map((t: any) => t.id);

      await admin.from("photo_batch_images")
        .update({ enhancement_status: "processing" })
        .in("id", targets.map((t: any) => t.id));

      const results: Array<{ id: string; ok: boolean; error?: string; mode?: string }> = [];
      for (const img of targets) {
        try {
          const { data: dl, error: dlErr } = await admin.storage.from(BUCKET).download(img.original_storage_path!);
          if (dlErr || !dl) throw new Error(dlErr?.message || "Falha ao baixar original do storage");
          const srcBytes = new Uint8Array(await dl.arrayBuffer());
          const sizeArg = mode === "watermark_only" ? pickSizeForOriginal(srcBytes) : IMAGE_SIZE;
          const bytes = await callOpenAiImageEdit(srcBytes, activePrompt, sizeArg);
          const path = `${userId}/uploads/${batchId}/enhanced/${img.id}.png`;
          const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", upsert: true });
          if (upErr) throw new Error(upErr.message);
          await admin.from("photo_batch_images").update({
            enhanced_storage_path: path,
            enhancement_status: "done",
            enhanced_at: new Date().toISOString(),
            error_message: null,
          }).eq("id", img.id);
          results.push({ id: img.id, ok: true, mode });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await admin.from("photo_batch_images").update({
            enhancement_status: "failed",
            error_message: msg.slice(0, 500),
          }).eq("id", img.id);
          results.push({ id: img.id, ok: false, error: msg });
        }
      }

      try {
        await admin.from("processing_logs").insert({
          user_id: userId,
          type: mode === "watermark_only" ? "remove_watermark_upload" : "enhance_upload",
          status: "done",
          message: `enhance batch (${mode}): ${results.filter(r => r.ok).length}/${results.length}`,
          metadata_json: { model: MODEL, mode, batch_id: batchId, results },
        });
      } catch { /* noop */ }

      return new Response(JSON.stringify({ results, remaining_ids }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fluxo 1: anúncio importado ---------------------------------------------------
    if (!listingId) return new Response(JSON.stringify({ error: "listing_id or batch_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: listing, error: lerr } = await admin.from("olx_listings").select("id,user_id").eq("id", listingId).maybeSingle();
    if (lerr || !listing || listing.user_id !== userId) {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let q = admin.from("listing_images").select("id,original_external_url,enhancement_status").eq("listing_id", listingId);
    if (imageIds && imageIds.length) q = q.in("id", imageIds);
    const { data: imgs } = await q;
    const allTargets = (imgs ?? []).filter((i: any) => i.original_external_url);

    const MAX_PER_CALL = 2;
    const targets = allTargets.slice(0, MAX_PER_CALL);
    const remaining_ids = allTargets.slice(MAX_PER_CALL).map((t: any) => t.id);

    await admin.from("listing_images")
      .update({ enhancement_status: "processing", enhancement_prompt: activePrompt })
      .in("id", targets.map((t: any) => t.id));

    const results: Array<{ id: string; ok: boolean; error?: string; original_ratio?: number; final_ratio?: number; was_corrected?: boolean; white_bars_detected?: boolean; retried?: boolean; mode?: string }> = [];
    for (const img of targets) {
      try {
        const srcBytes = await fetchBytes(img.original_external_url!);
        if (!srcBytes) throw new Error("Falha ao baixar imagem original");

        const sizeArg = mode === "watermark_only" ? pickSizeForOriginal(srcBytes) : IMAGE_SIZE;
        let bytes = await callOpenAiImageEdit(srcBytes, activePrompt, sizeArg);

        const whiteBars = false;
        const retried = false;
        let originalRatio: number | undefined;
        let finalRatio: number | undefined;
        const wasCorrected = false;
        const size = readPngSize(bytes);
        if (size && size.height > 0) {
          originalRatio = size.width / size.height;
          finalRatio = originalRatio;
        }

        const path = `${userId}/enhanced/${listingId}/${img.id}.png`;
        const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
          contentType: "image/png",
          upsert: true,
        });
        if (upErr) throw new Error(upErr.message);
        await admin.from("listing_images").update({
          enhanced_storage_path: path,
          enhancement_status: "done",
          enhanced_at: new Date().toISOString(),
          error_message: null,
        }).eq("id", img.id);
        results.push({ id: img.id, ok: true, original_ratio: originalRatio, final_ratio: finalRatio, was_corrected: wasCorrected, white_bars_detected: whiteBars, retried, mode });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from("listing_images").update({
          enhancement_status: "failed",
          error_message: msg.slice(0, 500),
        }).eq("id", img.id);
        results.push({ id: img.id, ok: false, error: msg });
      }
    }

    try {
      await admin.from("processing_logs").insert({
        user_id: userId,
        listing_id: listingId,
        type: mode === "watermark_only" ? "remove_watermark" : "enhance_images",
        status: "done",
        message: `enhance-listing-images (${MODEL}, mode=${mode}): ${results.filter(r => r.ok).length}/${results.length} sucesso`,
        metadata_json: { model: MODEL, mode, results },
      });
    } catch { /* noop */ }

    return new Response(JSON.stringify({ results, remaining_ids }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });


  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
