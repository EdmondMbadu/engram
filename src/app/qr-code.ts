import { create as createQrCode } from 'qrcode';

type QrOptions = {
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  margin?: number;
};

export function generateQrSvgDataUrl(content: string, options?: QrOptions): string {
  const svg = generateQrSvg(content, options);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function generateQrSvg(content: string, options: QrOptions = {}): string {
  const margin = Math.max(4, options.margin ?? 4);
  const qr = createQrCode(content, {
    errorCorrectionLevel: options.errorCorrectionLevel ?? 'H',
    margin: 0,
  });
  const size = qr.modules.size;
  const viewSize = size + margin * 2;
  const modules: string[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (qr.modules.data[y * size + x]) {
        modules.push(`M${x + margin} ${y + margin}h1v1h-1z`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><rect width="${viewSize}" height="${viewSize}" fill="#fff"/><path d="${modules.join('')}" fill="#000"/></svg>`;
}
