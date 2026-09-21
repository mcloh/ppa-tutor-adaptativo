export const ENV = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // LLM: cliente compatível com a API de Chat Completions da OpenAI.
  // OPENAI_BASE_URL permite apontar para um endpoint compatível alternativo;
  // por padrão usa a API oficial da OpenAI.
  llmApiUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  llmApiKey: process.env.OPENAI_API_KEY ?? "",
  llmModel: process.env.OPENAI_MODEL ?? "gpt-5-mini",
  // Armazenamento de objetos: AWS S3 direto.
  awsRegion: process.env.AWS_REGION ?? "",
  s3Bucket: process.env.AWS_S3_BUCKET ?? "",
  // Base pública opcional (ex.: domínio de CDN/CloudFront) para servir objetos
  // sem redirect assinado. Quando ausente, o proxy de storage usa URLs
  // pré-assinadas de curta duração via GetObjectCommand.
  s3PublicBaseUrl: process.env.AWS_S3_PUBLIC_BASE_URL ?? "",
};
