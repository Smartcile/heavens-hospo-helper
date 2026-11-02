/**
 * Copy-paste LLM prompt builder for ingredient density lookups.
 *
 * Pure and deterministic — the operator copies the prompt into whatever LLM
 * they already use (no API keys, no backend calls) and pastes the answer back.
 * The prompt is customised per item name so the model answers for the exact
 * product.
 */

export type DensityPromptOptions = {
  /** e.g. "FLOUR - 00" — the item being set up */
  itemName: string
  /** Show the count → weight question (items sold/used as a whole) */
  includePerUnit?: boolean
}

export function buildDensityPrompt({ itemName, includePerUnit = true }: DensityPromptOptions): string {
  return [
    `I'm setting up an ingredient called "${itemName}" in a hospitality inventory system.`,
    `I need standard kitchen conversion data for it. Please reply with:`,
    ``,
    `1. Its density in grams per millilitre (g/mL) — this is the single number I need most. If you don't know it exactly, give the best common cooking reference value and mark it as an estimate.`,
    `2. Its weight in grams of one METRIC cup (250 mL), one metric tablespoon (20 mL), and one metric teaspoon (5 mL).`,
    `3. Whether it behaves as a liquid, a dry/powdered good, or an item sold as whole units.`,
    includePerUnit ? `4. If it's typically sold or used as a whole unit (eggs, lemons, potatoes, avocados...), the average weight in grams of one unit. If it's not, say "N/A".` : ``,
    ``,
    `Format your answer as a short list like:`,
    `DENSITY: 0.528 g/mL (ESTIMATE)`,
    `1 CUP: 132 g`,
    `1 TABLESPOON: 11 g`,
    `1 TEASPOON: 3 g`,
    `TYPE: DRY`,
    includePerUnit ? `1 UNIT: N/A` : ``,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Best-effort parse of a pasted LLM answer for the density figure.
 * Accepts "DENSITY: 0.528 g/mL", "0.528", "density = 0.53" — anything that
 * contains a number near a g/mL density line. Returns null when nothing
 * parseable is found (the user just edits the fields manually).
 */
export function parseDensityFromAnswer(answer: string): number | null {
  if (!answer) return null
  const lines = answer.split(/\r?\n/)
  for (const line of lines) {
    if (!/density|g\/ml|g per ml/i.test(line)) continue
    const m = line.match(/(\d+(?:\.\d+)?)/)
    if (!m) continue
    const v = parseFloat(m[1])
    if (v > 0 && v <= 4) return v
  }
  const any = answer.match(/(\d+(?:\.\d+)?)\s*g\/ml/i)
  const v = any ? parseFloat(any[1]) : null
  return v != null && v > 0 && v <= 4 ? v : null
}
