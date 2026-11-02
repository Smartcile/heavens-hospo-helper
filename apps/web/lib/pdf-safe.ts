// Shared ASCII-safety pass for the jsPDF exporters.
//
// jsPDF's built-in fonts (helvetica) only carry the standard Latin glyphs, so
// anything else prints as garbage — "→" becomes "!'", "▪" becomes "%%", smart
// quotes and dashes print as control junk. Every user-facing string a PDF draws
// is run through `pdfSafe` first, which maps the symbols operators actually type
// to a readable ASCII stand-in. Pure and Prisma-free (usable client or server).

const PDF_CHAR_MAP: Record<string, string> = {
  '\u2192': '->', '\u2190': '<-', '\u2191': '^', '\u2193': 'v',
  '\u21d2': '=>', '\u21d0': '<=',
  '\u2022': '-', '\u25aa': '-', '\u25ab': '-', '\u2023': '-', '\u2043': '-',
  '\u25cf': '-', '\u25e6': '-', '\u00b7': '-',
  '\u2012': '-', '\u2013': '-', '\u2014': '-', '\u2015': '-',
  '\u2018': "'", '\u2019': "'", '\u201a': "'", '\u201b': "'",
  '\u201c': '"', '\u201d': '"', '\u201e': '"', '\u201f': '"',
  '\u2026': '...', '\u00a0': ' ',
  '\u00d7': 'x', '\u2248': '~', '\u2264': '<=', '\u2265': '>=',
  '\u2713': '[x]', '\u2714': '[x]', '\u2717': '[ ]', '\u2718': '[ ]',
  '\u00b0': ' deg',
}

/** Replace glyphs the PDF font cannot draw with readable ASCII. */
export function pdfSafe(text: string): string {
  let out = ''
  for (const ch of text) {
    const mapped = PDF_CHAR_MAP[ch]
    if (mapped !== undefined) {
      out += mapped
      continue
    }
    const code = ch.codePointAt(0) ?? 0
    // Keep printable ASCII + tab/newline; anything else would render as junk.
    out += code > 0x7e ? '?' : ch
  }
  return out
}
