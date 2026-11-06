import { sanitiseRichText } from '@/lib/rich-text'

// One read-only renderer for sanitised rich text. Used anywhere a task
// description is shown to staff (worker task detail, reference popups).
// The server sanitises on write; this sanitises again on render.
export function RichTextContent({
  html,
  className,
}: {
  html: string | null | undefined
  className?: string
}) {
  const clean = sanitiseRichText(html)
  if (!clean) return null
  return (
    <div
      className={`font-sans text-sm text-grey-light whitespace-pre-wrap [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-bold [&_a]:underline ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
