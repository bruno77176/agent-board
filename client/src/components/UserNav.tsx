import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, adminApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

export function UserNav() {
  const { user, isAdmin, refetch } = useAuth()
  const queryClient = useQueryClient()

  const { data: pendingData } = useQuery({
    queryKey: ['admin', 'pending-count'],
    queryFn: () => adminApi.pendingCount(),
    enabled: isAdmin,
    refetchInterval: 30_000,
  })

  const handleLogout = async () => {
    await authApi.logout()
    queryClient.clear()
    refetch()
  }

  if (!user) return null

  return (
    <div className="border-t border-slate-200 p-3 space-y-1">
      {isAdmin && (
        <Link
          to="/admin/users"
          className="flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-slate-100 text-slate-700"
        >
          <span>Users</span>
          {(pendingData?.count ?? 0) > 0 && (
            <span className="bg-amber-500 text-white text-xs rounded-full px-2 py-0.5">
              {pendingData?.count}
            </span>
          )}
        </Link>
      )}
      <div className="flex items-center gap-3 px-3 py-2">
        {user.avatar_url && (
          <img src={user.avatar_url} alt={user.name} className="w-7 h-7 rounded-full" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{user.name}</p>
          <p className="text-xs text-slate-500 truncate">{user.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-slate-400 hover:text-slate-600"
          title="Sign out"
        >
          ↩
        </button>
      </div>
    </div>
  )
}
