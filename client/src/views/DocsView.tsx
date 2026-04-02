import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'

async function fetchDocList(): Promise<string[]> {
  const res = await fetch('/api/docs')
  if (!res.ok) return []
  return res.json()
}

async function fetchDocContent(filePath: string): Promise<string> {
  const res = await fetch(`/api/docs/${encodeURIComponent(filePath)}`)
  if (!res.ok) throw new Error('Failed to load document')
  return res.text()
}

export function DocsView() {
  const [selected, setSelected] = useState<string | null>(null)

  const { data: files = [] } = useQuery({
    queryKey: ['docs'],
    queryFn: fetchDocList,
  })

  const { data: content, isLoading } = useQuery({
    queryKey: ['doc', selected],
    queryFn: () => fetchDocContent(selected!),
    enabled: !!selected,
  })

  // Group files by directory
  const grouped = files.reduce<Record<string, string[]>>((acc, f) => {
    const parts = f.split('/')
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    ;(acc[dir] ??= []).push(f)
    return acc
  }, {})

  return (
    <div className="h-full flex">
      {/* File list */}
      <div className="w-56 flex-shrink-0 border-r border-slate-200 overflow-y-auto py-4">
        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold px-4 mb-3">Documents</p>
        {Object.entries(grouped).map(([dir, dirFiles]) => (
          <div key={dir} className="mb-2">
            {dir && <p className="text-[10px] text-slate-400 px-4 mb-1">{dir}/</p>}
            {dirFiles.map(f => {
              const name = f.split('/').pop()!.replace(/\.md$/, '')
              return (
                <button key={f} onClick={() => setSelected(f)}
                  className={`w-full text-left px-4 py-1.5 text-xs transition-colors ${
                    selected === f
                      ? 'bg-slate-100 text-slate-900 font-medium'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}>
                  {name}
                </button>
              )
            })}
          </div>
        ))}
        {files.length === 0 && <p className="text-xs text-slate-400 px-4">No documents found.</p>}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {!selected && (
          <p className="text-sm text-slate-400">Select a document from the list.</p>
        )}
        {selected && isLoading && (
          <p className="text-sm text-slate-400">Loading...</p>
        )}
        {selected && content && (
          <div className="max-w-3xl text-sm text-slate-800 space-y-4 leading-relaxed">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-2xl font-bold text-slate-900 mb-4 mt-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-xl font-semibold text-slate-800 mb-3 mt-6">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold text-slate-700 mb-2 mt-4">{children}</h3>,
                h4: ({ children }) => <h4 className="text-sm font-semibold text-slate-700 mb-1 mt-3">{children}</h4>,
                p: ({ children }) => <p className="mb-3 text-slate-700">{children}</p>,
                code: ({ children }) => <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
                pre: ({ children }) => <pre className="bg-slate-100 rounded-lg p-4 overflow-x-auto text-xs mb-3">{children}</pre>,
                li: ({ children }) => <li className="ml-4 list-disc text-slate-700 mb-1">{children}</li>,
                ul: ({ children }) => <ul className="mb-3">{children}</ul>,
                ol: ({ children }) => <ol className="mb-3 list-decimal ml-4">{children}</ol>,
                a: ({ href, children }) => <a href={href} className="text-blue-600 hover:underline">{children}</a>,
                hr: () => <hr className="border-slate-200 my-6" />,
                blockquote: ({ children }) => <blockquote className="border-l-4 border-slate-300 pl-4 italic text-slate-600 mb-3">{children}</blockquote>,
                strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
