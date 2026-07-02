declare module 'exceljs/dist/exceljs.min.js';
declare module 'docx-preview' {
  export function renderAsync(data: Blob | ArrayBuffer, bodyContainer: HTMLElement, styleContainer?: HTMLElement, options?: Record<string, unknown>): Promise<void>;
}
