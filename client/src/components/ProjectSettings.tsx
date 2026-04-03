import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { membersApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  project: { id: string; key: string; name: string; is_public: number }
}

export function ProjectSettings({ project }: Props) {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')

  const { data: members = [] } = useQuery({
    queryKey: ['members', project.id],
    queryFn: () => membersApi.list(project.id),
  })

  const addMember = useMutation({
    mutationFn: () => membersApi.add(project.id, email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', project.id] })
      setEmail('')
    },
  })

  const removeMember = useMutation({
    mutationFn: (userId: number) => membersApi.remove(project.id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', project.id] }),
  })

  const togglePublic = useMutation({
    mutationFn: () =>
      fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_public: project.is_public ? 0 : 1 }),
      }).then(r => {
        if (!r.ok) throw new Error('Failed to update visibility')
        return r.json()
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  return (
    <div className="p-6 max-w-2xl space-y-8">
      {isAdmin && (
        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-3">Visibility</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => togglePublic.mutate()}
              className={`w-10 h-6 rounded-full transition-colors cursor-pointer ${project.is_public ? 'bg-teal-500' : 'bg-slate-300'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${project.is_public ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-slate-700">
              {project.is_public ? 'Public — visible to all logged-in users' : 'Private — members only'}
            </span>
          </label>
        </section>
      )}

      <section>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Members</h2>
        {isAdmin && (
          <div className="flex gap-2 mb-4">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 border border-slate-200 rounded-md px-3 py-2 text-sm"
            />
            <button
              onClick={() => addMember.mutate()}
              disabled={!email}
              className="bg-teal-600 text-white px-4 py-2 rounded-md text-sm hover:bg-teal-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              {m.avatar_url && <img src={m.avatar_url} alt={m.name} className="w-7 h-7 rounded-full" />}
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{m.name}</p>
                <p className="text-xs text-slate-500">{m.email}</p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => removeMember.mutate(m.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
