/**
 * WebSocket Service for Real-time Data
 * Handles price updates, order notifications, and system alerts
 */

export interface PriceUpdate {
  symbol: string
  price: number
  change: number
  changePercent: number
  volume: number
  timestamp: Date
  bid?: number
  ask?: number
  high?: number
  low?: number
}

export interface OrderNotification {
  orderId: string
  symbol: string
  side: 'BUY' | 'SELL'
  status: 'PENDING' | 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED'
  quantity: number
  filledQuantity: number
  price?: number
  averagePrice?: number
  timestamp: Date
  message: string
}

export interface SystemNotification {
  id: string
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS'
  title: string
  message: string
  timestamp: Date
  actionUrl?: string
}

export interface PortfolioUpdate {
  totalValue: number
  totalPnL: number
  totalPnLPercent: number
  dayPnL: number
  dayPnLPercent: number
  timestamp: Date
}

export type WebSocketMessage = 
  | { type: 'price_update'; data: PriceUpdate }
  | { type: 'order_notification'; data: OrderNotification }
  | { type: 'system_notification'; data: SystemNotification }
  | { type: 'portfolio_update'; data: PortfolioUpdate }
  | { type: 'heartbeat'; data: { timestamp: Date } }

type EventCallback<T = any> = (data: T) => void

class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectInterval = 1000
  private isConnecting = false
  private subscriptions = new Set<string>()
  private eventListeners = new Map<string, Set<EventCallback>>()

  // Connection state
  private _isConnected = false
  private _connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected'

  constructor() {
    // Auto-connect when browser comes back online
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (!this.isConnected) {
          this.connect()
        }
      })

      window.addEventListener('offline', () => {
        this.disconnect()
      })

      // Cleanup on page unload
      window.addEventListener('beforeunload', () => {
        this.disconnect()
      })
    }
  }

  get isConnected(): boolean {
    return this._isConnected && this.ws?.readyState === WebSocket.OPEN
  }

  get connectionStatus(): string {
    return this._connectionStatus
  }

  /**
   * Connect to WebSocket server
   */
  async connect(userId?: string): Promise<void> {
    if (this.isConnecting || this.isConnected) {
      return
    }

    this.isConnecting = true
    this._connectionStatus = 'connecting'

    try {
      // In a real implementation, this would be a proper WebSocket server
      // For now, we'll simulate the connection
      await this.simulateConnection(userId)
    } catch (error) {
      console.error('WebSocket connection failed:', error)
      this._connectionStatus = 'error'
      this.scheduleReconnect()
    } finally {
      this.isConnecting = false
    }
  }

  /**
   * Simulate WebSocket connection for development
   */
  private async simulateConnection(userId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Simulate connection delay
        setTimeout(() => {
          this._isConnected = true
          this._connectionStatus = 'connected'
          this.reconnectAttempts = 0
          
          // Start heartbeat
          this.startHeartbeat()
          
          // Start price simulation
          this.startPriceSimulation()
          
          // Emit connection event
          this.emit('connected', { timestamp: new Date() })
          
          console.log('WebSocket service connected (simulated)')
          resolve()
        }, 1000)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this._isConnected = false
    this._connectionStatus = 'disconnected'
    this.emit('disconnected', { timestamp: new Date() })
  }

  /**
   * Subscribe to price updates for symbols
   */
  subscribeToPrices(symbols: string[]): void {
    symbols.forEach(symbol => {
      this.subscriptions.add(`price:${symbol}`)
    })

    if (this.isConnected) {
      // In real implementation, send subscription message to server
      console.log('Subscribed to price updates:', symbols)
    }
  }

  /**
   * Unsubscribe from price updates
   */
  unsubscribeFromPrices(symbols: string[]): void {
    symbols.forEach(symbol => {
      this.subscriptions.delete(`price:${symbol}`)
    })

    if (this.isConnected) {
      console.log('Unsubscribed from price updates:', symbols)
    }
  }

  /**
   * Subscribe to order notifications
   */
  subscribeToOrders(): void {
    this.subscriptions.add('orders')
    console.log('Subscribed to order notifications')
  }

  /**
   * Subscribe to portfolio updates
   */
  subscribeToPortfolio(): void {
    this.subscriptions.add('portfolio')
    console.log('Subscribed to portfolio updates')
  }

  /**
   * Add event listener
   */
  on<T = any>(event: string, callback: EventCallback<T>): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)
  }

  /**
   * Remove event listener
   */
  off<T = any>(event: string, callback: EventCallback<T>): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.delete(callback)
      if (listeners.size === 0) {
        this.eventListeners.delete(event)
      }
    }
  }

  /**
   * Emit event to listeners
   */
  private emit<T = any>(event: string, data: T): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error('Error in WebSocket event listener:', error)
        }
      })
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      this._connectionStatus = 'error'
      return
    }

    const delay = Math.min(this.reconnectInterval * Math.pow(2, this.reconnectAttempts), 30000)
    this.reconnectAttempts++

    this.reconnectTimer = setTimeout(() => {
      console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`)
      this.connect()
    }, delay)
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.emit('heartbeat', { timestamp: new Date() })
      }
    }, 30000) // 30 seconds
  }

  /**
   * Start price simulation for development
   */
  private startPriceSimulation(): void {
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'SPY', 'QQQ']
    const basePrices: Record<string, number> = {
      'AAPL': 175.50,
      'MSFT': 338.20,
      'GOOGL': 142.80,
      'AMZN': 151.75,
      'TSLA': 248.50,
      'NVDA': 875.30,
      'META': 352.75,
      'SPY': 445.20,
      'QQQ': 378.90
    }

    // Generate initial prices
    symbols.forEach(symbol => {
      const basePrice = basePrices[symbol] || 100
      const change = (Math.random() - 0.5) * 4 // -2% to +2%
      const price = basePrice * (1 + change / 100)
      
      this.emit('price_update', {
        symbol,
        price: Number(price.toFixed(2)),
        change: Number((price - basePrice).toFixed(2)),
        changePercent: Number(change.toFixed(2)),
        volume: Math.floor(Math.random() * 10000000) + 1000000,
        timestamp: new Date(),
        bid: Number((price - 0.01).toFixed(2)),
        ask: Number((price + 0.01).toFixed(2)),
        high: Number((price * 1.015).toFixed(2)),
        low: Number((price * 0.985).toFixed(2))
      } as PriceUpdate)
    })

    // Update prices every 2-5 seconds
    const updatePrices = () => {
      if (!this.isConnected) return

      const symbol = symbols[Math.floor(Math.random() * symbols.length)]
      const basePrice = basePrices[symbol] || 100
      const volatility = Math.random() * 0.5 + 0.1 // 0.1% to 0.6% volatility
      const direction = Math.random() > 0.5 ? 1 : -1
      const changePercent = direction * volatility * (Math.random() + 0.5)
      const price = basePrice * (1 + changePercent / 100)

      this.emit('price_update', {
        symbol,
        price: Number(price.toFixed(2)),
        change: Number((price - basePrice).toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        volume: Math.floor(Math.random() * 1000000) + 100000,
        timestamp: new Date(),
        bid: Number((price - 0.01).toFixed(2)),
        ask: Number((price + 0.01).toFixed(2)),
        high: Number((price * 1.01).toFixed(2)),
        low: Number((price * 0.99).toFixed(2))
      } as PriceUpdate)

      // Schedule next update
      setTimeout(updatePrices, Math.random() * 3000 + 2000) // 2-5 seconds
    }

    // Start price updates
    updatePrices()

    // Simulate occasional order notifications
    setInterval(() => {
      if (!this.isConnected) return

      const symbol = symbols[Math.floor(Math.random() * symbols.length)]
      const statuses = ['FILLED', 'PARTIALLY_FILLED', 'CANCELLED'] as const
      const status = statuses[Math.floor(Math.random() * statuses.length)]
      const side = Math.random() > 0.5 ? 'BUY' : 'SELL'

      this.emit('order_notification', {
        orderId: `order_${Date.now()}`,
        symbol,
        side,
        status,
        quantity: Math.floor(Math.random() * 100) + 10,
        filledQuantity: status === 'FILLED' ? Math.floor(Math.random() * 100) + 10 : Math.floor(Math.random() * 50),
        price: basePrices[symbol] || 100,
        timestamp: new Date(),
        message: `Order ${status.toLowerCase().replace('_', ' ')} for ${symbol}`
      } as OrderNotification)
    }, 15000) // Every 15 seconds

    // Simulate portfolio updates
    setInterval(() => {
      if (!this.isConnected) return

      const totalValue = 50000 + (Math.random() - 0.5) * 10000
      const totalPnL = (Math.random() - 0.4) * 5000 // Slight bias toward gains
      const dayPnL = (Math.random() - 0.5) * 1000

      this.emit('portfolio_update', {
        totalValue,
        totalPnL,
        totalPnLPercent: (totalPnL / (totalValue - totalPnL)) * 100,
        dayPnL,
        dayPnLPercent: (dayPnL / totalValue) * 100,
        timestamp: new Date()
      } as PortfolioUpdate)
    }, 10000) // Every 10 seconds
  }

  /**
   * Send system notification
   */
  sendSystemNotification(notification: Omit<SystemNotification, 'id' | 'timestamp'>): void {
    const fullNotification: SystemNotification = {
      ...notification,
      id: `notif_${Date.now()}`,
      timestamp: new Date()
    }

    this.emit('system_notification', fullNotification)
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      isConnected: this.isConnected,
      connectionStatus: this._connectionStatus,
      reconnectAttempts: this.reconnectAttempts,
      subscriptions: Array.from(this.subscriptions),
      listeners: Object.fromEntries(
        Array.from(this.eventListeners.entries()).map(([event, listeners]) => [
          event,
          listeners.size
        ])
      )
    }
  }
}

// Export singleton instance
export const webSocketService = new WebSocketService()
export default webSocketService