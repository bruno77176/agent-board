import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate, useParams } from 'react-router-dom'

async function fetchDocList(project?: string): Promise<string[]> {
  const url = project ? `/api/docs?project=${encodeURIComponent(project)}` : '/api/docs'
  const res = await fetch(url)
  if (!res.ok) return []
  return res.json()
}

async function fetchDocContent(filePath: string): Promise<string> {
  const res = await fetch(`/api/docs/${encodeURIComponent(filePath)}`)
  if (!res.ok) throw new Error('Failed to load document')
  return res.text()
}

interface DocsViewProps {
  projectKey?: string
}

export function DocsView({ projectKey }: DocsViewProps) {
  const { docSlug } = useParams<{ docSlug?: string }>()
  const navigate = useNavigate()
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  const { data: files = [] } = useQuery({
    queryKey: ['docs', projectKey],
    queryFn: () => fetchDocList(projectKey),
  })

  const selected = (files as string[]).find(f => {
    const name = f.split('/').pop()?.replace(/\.md$/, '')
    return name === docSlug
  }) ?? null

  const handleSync = async () => {
    if (!selected) return
    setSyncStatus('Syncing...')
    try {
      const res = await fetch('/api/docs/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: selected }),
      })
      const data = await res.json()
      setSyncStatus(data.message)
      setTimeout(() => setSyncStatus(null), 4000)
    } catch {
      setSyncStatus('Sync failed')
      setTimeout(() => setSyncStatus(null), 3000)
    }
  }

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
    <div className="h-full flex flex-col md:flex-row">
      {/* File list */}
      <div className="w-full md:w-56 md:flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-200 overflow-y-auto py-4 max-h-44 md:max-h-none">
        {projectKey && (
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold px-4 mb-1">
            {projectKey}
          </p>
        )}
        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold px-4 mb-3">Documents</p>
        {Object.entries(grouped).map(([dir, dirFiles]) => (
          <div key={dir} className="mb-2">
            {dir && <p className="text-[10px] text-slate-400 px-4 mb-1">{dir}/</p>}
            {dirFiles.map(f => {
              const name = f.split('/').pop()!.replace(/\.md$/, '')
              return (
                <button key={f} onClick={() => {
                  const slug = f.split('/').pop()!.replace(/\.md$/, '')
                  navigate(projectKey ? `/${projectKey}/docs/${slug}` : `/docs/${slug}`)
                }}
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
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        {selected && (
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={handleSync}
              className="text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
              title="Create board items from this doc"
            >
              ⚡ Sync to board
            </button>
            {syncStatus && (
              <span className="text-xs text-slate-500">{syncStatus}</span>
            )}
          </div>
        )}
        {!selected && (
          <p className="text-sm text-slate-400">Select a document from the list.</p>
        )}
        {selected && isLoading && (
          <p className="text-sm text-slate-400">Loading...</p>
        )}
        {selected && content && (
          <div className="max-w-3xl text-sm text-slate-800 space-y-4 leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="text-2xl font-bold text-slate-900 mb-4 mt-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-xl font-semibold text-slate-800 mb-3 mt-6">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold text-slate-700 mb-2 mt-4">{children}</h3>,
                h4: ({ children }) => <h4 className="text-sm font-semibold text-slate-700 mb-1 mt-3">{children}</h4>,
                p: ({ children }) => <p className="mb-3 text-slate-700 leading-relaxed">{children}</p>,
                code: ({ children }) => <code className="bg-slate-100 rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
                pre: ({ children }) => <pre className="bg-slate-100 rounded-lg p-4 overflow-x-auto text-xs mb-3">{children}</pre>,
                li: ({ children }) => <li className="ml-4 list-disc text-slate-700 mb-1">{children}</li>,
                ul: ({ children }) => <ul className="mb-3">{children}</ul>,
                ol: ({ children }) => <ol className="mb-3 list-decimal ml-4">{children}</ol>,
                a: ({ href, children }) => <a href={href} className="text-blue-600 hover:underline">{children}</a>,
                hr: () => <hr className="border-slate-200 my-6" />,
                blockquote: ({ children }) => <blockquote className="border-l-4 border-slate-300 pl-4 italic text-slate-600 mb-3">{children}</blockquote>,
                strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                table: ({ children }) => (
                  <div className="overflow-x-auto my-4">
                    <table className="min-w-full border-collapse text-sm">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
                tbody: ({ children }) => <tbody className="divide-y divide-slate-100">{children}</tbody>,
                tr: ({ children }) => <tr className="divide-x divide-slate-100">{children}</tr>,
                th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-slate-700 border border-slate-200">{children}</th>,
                td: ({ children }) => <td className="px-3 py-2 text-slate-600 border border-slate-100">{children}</td>,
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
