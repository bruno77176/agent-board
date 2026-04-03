import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export function useBoard() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let ws: WebSocket | null = null
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let dead = false

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

      ws.onmessage = (e) => {
        const event = JSON.parse(e.data)
        if (event.type?.startsWith('story.')) {
          queryClient.invalidateQueries({ queryKey: ['stories'] })
          if (event.data?.id) queryClient.invalidateQueries({ queryKey: ['story', event.data.id] })
        }
        if (event.type?.startsWith('epic.')) queryClient.invalidateQueries({ queryKey: ['epics'] })
        if (event.type?.startsWith('feature.')) queryClient.invalidateQueries({ queryKey: ['features'] })
        if (event.type?.startsWith('project.')) queryClient.invalidateQueries({ queryKey: ['projects'] })
        if (event.type?.startsWith('event.')) queryClient.invalidateQueries({ queryKey: ['events'] })
      }

      ws.onclose = () => {
        if (!dead) {
          retryTimeout = setTimeout(connect, 2000)
        }
      }
    }

    connect()

    return () => {
      dead = true
      if (retryTimeout) clearTimeout(retryTimeout)
      ws?.close()
    }
  }, [queryClient])
}
