declare module 'qrcode' {
  export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

  export type QrCreateOptions = {
    errorCorrectionLevel?: QrErrorCorrectionLevel;
    margin?: number;
  };

  export type QrCodeModel = {
    modules: {
      size: number;
      data: Uint8Array | boolean[];
    };
  };

  export function create(content: string, options?: QrCreateOptions): QrCodeModel;
}
