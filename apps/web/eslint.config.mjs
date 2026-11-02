import { FlatCompat } from '@eslint/eslintrc'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({ baseDirectory: __dirname })

// ── Design-contract guards ──────────────────────────────────────────────────
// These block the two classes of drift that made the UI inconsistent:
// arbitrary font sizes (text-[10px] …) and raw hex colours in class names.
// The existing backlog has been migrated, so these are now ERRORS — a new
// violation fails `npm run lint` (and CI). See the design contract in AGENTS.md.
const UX_GUARDS = [
  {
    selector: "JSXAttribute[name.name='className'] Literal[value=/text-\\[\\d+px\\]/]",
    message:
      'Arbitrary font sizes are banned. Use a scale step (text-2xs, text-xs, text-sm, text-base…). See the design contract in AGENTS.md.',
  },
  {
    selector:
      "JSXAttribute[name.name='className'] JSXExpressionContainer TemplateLiteral > TemplateElement[value.raw=/text-\\[\\d+px\\]/]",
    message:
      'Arbitrary font sizes are banned. Use a scale step (text-2xs, text-xs, text-sm, text-base…). See the design contract in AGENTS.md.',
  },
  {
    selector: "JSXAttribute[name.name='className'] Literal[value=/\\[[a-z]?#[0-9a-fA-F]{3,8}\\]/]",
    message:
      'Raw hex colours are banned in class names. Use a design token (bg-grey-dark, border-grey-mid, text-grey-light…). See the design contract in AGENTS.md.',
  },
]

const config = [
  { ignores: ['**/.next/**', '**/node_modules/**', '**/dist/**'] },
  ...compat.extends('next/core-web-vitals'),
  {
    files: ['**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...UX_GUARDS],
    },
  },
]

export default config
