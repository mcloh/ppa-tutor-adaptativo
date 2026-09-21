export type RagConcept = {
  id: string;
  name: string;
  matterName: string;
  chapterName: string;
  topicName: string;
};

export type RagEvidence = {
  sourceId: string;
  sourceChecksum: string;
  chunkIds: string[];
  context: string;
};

const stopWords = new Set("a ao aos as o os de da das do dos e em no na nos nas um uma uns umas por para com que se sua seu suas seus como mais menos entre sobre sem sob ja nao sim ou este esta isto esse essa isso aquele aquela aqueles aquelas meu minha nosso nossa vosso vossa ser estar ter haver sao foi foram era eram e".split(" "));

export function tokenizeForRetrieval(input: string) {
  const normalized = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  return Array.from(new Set((normalized.match(/[a-z0-9]{3,}/g) ?? []).filter(token => !stopWords.has(token)))).slice(0, 28);
}

export function buildRagQuery(concepts: RagConcept[]) {
  return concepts.map(concept => `${concept.matterName} ${concept.chapterName} ${concept.topicName} ${concept.name}`).join(" ");
}

export function composeRagContext(chunks: Array<{ id: string; sourcePath: string; content: string }>, maxCharacters = 5_400): RagEvidence | null {
  if (!chunks.length) return null;
  const selected: Array<{ id: string; sourcePath: string; content: string }> = [];
  let currentLength = 0;
  for (const chunk of chunks) {
    const excerpt = chunk.content.slice(0, 1_800).trim();
    if (!excerpt || currentLength + excerpt.length > maxCharacters) continue;
    selected.push({ ...chunk, content: excerpt });
    currentLength += excerpt.length;
    if (selected.length >= 3) break;
  }
  if (!selected.length) return null;
  return {
    sourceId: "",
    sourceChecksum: "",
    chunkIds: selected.map(chunk => chunk.id),
    context: selected.map((chunk, index) => `[Trecho técnico ${index + 1}; origem: ${chunk.sourcePath}]\n${chunk.content}`).join("\n\n"),
  };
}
