#!/usr/bin/env node
/**
 * Migração única dos ativos binários (logotipos, favicons, selo PagBank) do
 * bucket antigo hospedado pela plataforma Manus/Forge para o novo bucket AWS
 * S3 usado pela aplicação após a remoção da dependência da Manus.
 *
 * Esta aplicação NÃO chama mais o backend Forge em tempo de execução — este
 * script é a única exceção, e existe apenas para o operador migrar, uma única
 * vez, os arquivos que hoje só existem no bucket antigo. Depois de rodar com
 * sucesso, ele pode ser apagado ou arquivado.
 *
 * Uso:
 *   FORGE_API_URL=... FORGE_API_KEY=... \
 *   AWS_REGION=... AWS_S3_BUCKET=... \
 *   node docs/pre-release/migrate-brand-assets-to-s3.mjs
 *
 * Credenciais AWS são resolvidas pela cadeia padrão do SDK (variáveis de
 * ambiente, perfil compartilhado, role da instância, etc.) — não é necessário
 * passar AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY explicitamente se o ambiente
 * já estiver configurado.
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const ASSET_KEYS = [
  "ppa-teorico-logo-official-cropped_9d1ad595.webp",
  "ppa-teorico-logo-dark-official_c9eda981.png",
  "ppa-teorico-icon-192_3067ed54.png",
  "ppa-teorico-favicon-32_240295de.png",
  "ppa-teorico-favicon-48_f8561748.png",
  "ppa-teorico-apple-touch-icon_fc53d96c.png",
  "pagbank-secure-partner-badge_edb836ea.png",
];

const FORGE_API_URL = process.env.FORGE_API_URL;
const FORGE_API_KEY = process.env.FORGE_API_KEY;
const AWS_REGION = process.env.AWS_REGION;
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET;

function contentTypeFor(key) {
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

async function fetchFromForge(key) {
  const presignUrl = new URL("v1/storage/presign/get", `${FORGE_API_URL.replace(/\/+$/, "")}/`);
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${FORGE_API_KEY}` },
  });
  if (!presignResp.ok) {
    throw new Error(`Presign GET failed for ${key}: ${presignResp.status} ${await presignResp.text()}`);
  }
  const { url } = await presignResp.json();
  if (!url) throw new Error(`Empty presign URL for ${key}`);

  const fileResp = await fetch(url);
  if (!fileResp.ok) {
    throw new Error(`Download failed for ${key}: ${fileResp.status}`);
  }
  return Buffer.from(await fileResp.arrayBuffer());
}

async function main() {
  if (!FORGE_API_URL || !FORGE_API_KEY) {
    throw new Error("Defina FORGE_API_URL e FORGE_API_KEY (credenciais antigas, só para esta migração).");
  }
  if (!AWS_REGION || !AWS_S3_BUCKET) {
    throw new Error("Defina AWS_REGION e AWS_S3_BUCKET (destino da migração).");
  }

  const s3 = new S3Client({ region: AWS_REGION });

  for (const key of ASSET_KEYS) {
    process.stdout.write(`Migrando ${key} ... `);
    const body = await fetchFromForge(key);
    await s3.send(
      new PutObjectCommand({
        Bucket: AWS_S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentTypeFor(key),
      }),
    );
    console.log(`ok (${body.byteLength} bytes)`);
  }

  console.log("\nMigração concluída. Os caminhos /storage/<chave> referenciados no app já apontam para essas mesmas chaves no novo bucket.");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
