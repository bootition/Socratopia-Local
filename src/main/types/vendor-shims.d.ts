/**
 * Vendor type shims for untyped importer dependencies.
 *
 * Only the small surface we use is declared; the runtime packages are
 * externalized by electron-vite and shipped in the packaged app.
 */

declare module 'mammoth' {
  export interface ExtractRawTextInput {
    buffer: Buffer
  }
  export interface ExtractRawTextResult {
    value: string
    messages: Array<{ type: string; message: string }>
  }
  export function extractRawText(
    input: ExtractRawTextInput
  ): Promise<ExtractRawTextResult>
}
