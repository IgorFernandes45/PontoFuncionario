/**
 * Reduz a foto antes de enviar.
 *
 * Câmera de celular entrega 3–5 MB por foto. Subir isso numa rede de
 * estabelecimento é o caminho mais curto para o ponto falhar bem na hora em
 * que a pessoa precisa dele — e o bucket tem teto de 2 MB.
 */
export async function reduzirImagem(
  arquivo: File,
  ladoMaximo = 800,
  qualidade = 0.7,
): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);

  const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    // Sem canvas, mandar o original é melhor que impedir a batida.
    return arquivo;
  }

  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", qualidade),
  );

  return blob ?? arquivo;
}
