import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  children: string
  className?: string
}

export function MarkdownContent({ children, className = '' }: Props) {
  return (
    <div className={`prose-sm ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-sm font-semibold text-slate-900 mt-4 mb-1 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xs font-semibold text-slate-800 uppercase tracking-wide mt-4 mb-1 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-xs font-semibold text-slate-700 mt-3 mb-0.5">{children}</h3>,
          p: ({ children }) => <p className="text-sm text-slate-600 leading-relaxed mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-slate-800">{children}</strong>,
          em: ({ children }) => <em className="italic text-slate-600">{children}</em>,
          ul: ({ children }) => <ul className="list-disc ml-4 mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal ml-4 mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-sm text-slate-600">{children}</li>,
          code: ({ children }) => <code className="bg-slate-100 rounded px-1 py-0.5 text-xs font-mono text-slate-700">{children}</code>,
          pre: ({ children }) => <pre className="bg-slate-100 rounded-lg p-3 overflow-x-auto text-xs mb-2">{children}</pre>,
          hr: () => <hr className="border-slate-200 my-3" />,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-slate-300 pl-3 text-slate-500 italic mb-2">{children}</blockquote>,
          a: ({ href, children }) => <a href={href} className="text-blue-600 hover:underline">{children}</a>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

/** Strip markdown syntax for use in plain-text truncated previews */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
}
