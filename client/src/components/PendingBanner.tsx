import { useAuth } from '../contexts/AuthContext'

export function PendingBanner() {
  const { isPending } = useAuth()
  if (!isPending) return null
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800 text-center">
      Your account is pending approval by an admin. You can view public projects in the meantime.
    </div>
  )
}
