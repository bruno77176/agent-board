import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, type User } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'

export function AdminUsersPage() {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()

  const { data: users = [] } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => adminApi.listUsers(),
    enabled: isAdmin,
  })

  const approve = useMutation({
    mutationFn: (id: number) => adminApi.approveUser(id, { status: 'active' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'pending-count'] })
    },
  })

  if (!isAdmin) return <Navigate to="/" replace />

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Users</h1>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">User</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Provider</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u: User) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {u.avatar_url && <img src={u.avatar_url} alt={u.name} className="w-8 h-8 rounded-full" />}
                    <div>
                      <p className="font-medium text-slate-800">{u.name}</p>
                      <p className="text-slate-500 text-xs">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 capitalize text-slate-600">{u.provider}</td>
                <td className="px-4 py-3 capitalize text-slate-600">{u.role}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.status === 'pending' && (
                    <button
                      onClick={() => approve.mutate(u.id)}
                      className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-md hover:bg-teal-700"
                    >
                      Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
