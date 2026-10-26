/**
 * Reduz a foto no navegador antes de anexar ao chamado.
 *
 * Print de tela de monitor grande ou foto de celular passa facil de 5 MB; o
 * servidor aceita 3 MB por foto e a server action leva tudo em base64. Lado
 * maior de 1600 px e JPEG 0.85 mantem o texto da tela legivel e cabe folgado.
 */

const LADO_MAXIMO = 1600;
const QUALIDADE = 0.85;

export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

function carregar(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler a imagem.'));
    };
    img.src = url;
  });
}

/** Devolve a imagem como data URL JPEG, ja reduzida. */
export async function comprimirImagem(arquivo: File): Promise<string> {
  const img = await carregar(arquivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
  const largura = Math.max(1, Math.round(img.naturalWidth * escala));
  const altura = Math.max(1, Math.round(img.naturalHeight * escala));

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Navegador sem suporte a canvas.');

  // PNG com transparencia viraria fundo preto no JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(img, 0, 0, largura, altura);
  return canvas.toDataURL('image/jpeg', QUALIDADE);
}
