// read-excel-file ships no wired-up type declarations (only "types.test").
// Minimal ambient types for the parts we use (Node entry, raw row output).

declare module 'read-excel-file' {
  export type RowCell = string | number | Date | boolean | null | { error: string }
  export type Row = RowCell[]
  export function readSheetNames(input: Buffer | ArrayBuffer | Uint8Array): Promise<string[]>
  function readXlsxFile(
    input: Buffer | ArrayBuffer | Uint8Array | Blob,
    options?: { sheet?: number | string; dateFormat?: string; parseTrue?: boolean }
  ): Promise<Row[]>
  export default readXlsxFile
}

declare module 'read-excel-file/node' {
  import type { Stream } from 'stream'
  export type RowCell = string | number | Date | boolean | null | { error: string }
  export type Row = RowCell[]
  function readXlsxFile(
    input: string | Stream | Buffer,
    options?: { sheet?: number | string; dateFormat?: string; parseTrue?: boolean }
  ): Promise<Row[]>
  export default readXlsxFile
}
