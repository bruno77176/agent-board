import { WebSocketServer, WebSocket } from 'ws'
import { Server } from 'http'

export type Broadcast = (event: object) => void

export function createWsServer(server: Server): Broadcast {
  const wss = new WebSocketServer({ server })

  function broadcast(event: object): void {
    const data = JSON.stringify(event)
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    }
  }

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'connected' }))
  })

  return broadcast
}
