interface Props { epicId: string; projectKey: string }

export function EpicDetailView({ epicId: _epicId, projectKey: _projectKey }: Props) {
  return (
    <div className="flex items-center justify-center h-full text-slate-400 text-sm">
      Epic detail view — coming soon (Task 10)
    </div>
  )
}
