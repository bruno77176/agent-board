import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export function useBoard() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}`)

    ws.onmessage = (e) => {
      const event = JSON.parse(e.data)
      if (event.type?.startsWith('story.')) queryClient.invalidateQueries({ queryKey: ['stories'] })
      if (event.type?.startsWith('epic.')) queryClient.invalidateQueries({ queryKey: ['epics'] })
      if (event.type?.startsWith('project.')) queryClient.invalidateQueries({ queryKey: ['projects'] })
      if (event.type?.startsWith('event.')) queryClient.invalidateQueries({ queryKey: ['events'] })
    }

    return () => ws.close()
  }, [queryClient])
}
