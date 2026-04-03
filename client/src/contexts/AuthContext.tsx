import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '../lib/api'
import type { User } from '../lib/api'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAdmin: boolean
  isPending: boolean
  refetch: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading, refetch: queryRefetch } = useQuery<User | null>({
    queryKey: ['auth', 'me'],
    queryFn: () => authApi.me().catch(() => null),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <AuthContext.Provider value={{
      user: user ?? null,
      isLoading,
      isAdmin: user?.role === 'admin',
      isPending: user?.status === 'pending',
      refetch: () => { void queryRefetch() },
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
