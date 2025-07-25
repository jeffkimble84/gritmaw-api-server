import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { Position, PositionInput, CapitalAllocation, ALLOCATION_TARGETS } from "@/types/core"

// ==========================================
// STYLING UTILITIES
// ==========================================

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ==========================================
// POSITION CALCULATIONS
// ==========================================

export class PositionUtils {
  static calculateMarketValue(position: Pick<Position, 'quantity' | 'currentPrice'>): number {
    return position.quantity * position.currentPrice
  }

  static calculateGainLoss(position: Pick<Position, 'quantity' | 'avgCost' | 'currentPrice'>): number {
    const marketValue = this.calculateMarketValue(position)
    const totalCost = position.quantity * position.avgCost
    return marketValue - totalCost
  }

  static calculateGainLossPercent(position: Pick<Position, 'quantity' | 'avgCost' | 'currentPrice'>): number {
    const gainLoss = this.calculateGainLoss(position)
    const totalCost = position.quantity * position.avgCost
    return totalCost > 0 ? (gainLoss / totalCost) * 100 : 0
  }

  static calculateAllocation(position: Pick<Position, 'quantity' | 'currentPrice'>, portfolioValue: number): number {
    const marketValue = this.calculateMarketValue(position)
    return portfolioValue > 0 ? (marketValue / portfolioValue) * 100 : 0
  }

  static createPosition(input: PositionInput & { currentPrice: number }, portfolioValue: number): Position {
    const basePosition = {
      id: `${input.symbol}_${Date.now()}`,
      symbol: input.symbol.toUpperCase(),
      name: input.name || input.symbol.toUpperCase(),
      quantity: input.quantity,
      avgCost: input.avgCost,
      currentPrice: input.currentPrice,
      category: input.category || 'tactical',
      timeHorizon: input.timeHorizon,
      notes: input.notes,
      lastUpdated: new Date().toISOString()
    } as const

    return {
      ...basePosition,
      marketValue: this.calculateMarketValue(basePosition),
      gainLoss: this.calculateGainLoss(basePosition),
      gainLossPercent: this.calculateGainLossPercent(basePosition),
      allocation: this.calculateAllocation(basePosition, portfolioValue)
    }
  }

  static updatePositionPrice(position: Position, newPrice: number, portfolioValue: number): Position {
    const updatedPosition = {
      ...position,
      currentPrice: newPrice,
      lastUpdated: new Date().toISOString()
    }

    return {
      ...updatedPosition,
      marketValue: this.calculateMarketValue(updatedPosition),
      gainLoss: this.calculateGainLoss(updatedPosition),
      gainLossPercent: this.calculateGainLossPercent(updatedPosition),
      allocation: this.calculateAllocation(updatedPosition, portfolioValue)
    }
  }
}

// ==========================================
// CAPITAL ALLOCATION UTILITIES
// ==========================================

export class AllocationUtils {
  static validateAllocation(allocation: CapitalAllocation): { valid: boolean; violations: string[] } {
    const violations: string[] = []
    const { core, tactical, warChest, totalCapital } = allocation

    // Check if allocations add up to total capital
    const totalAllocated = core.allocated + tactical.allocated + warChest.allocated
    if (Math.abs(totalAllocated - totalCapital) > 1) {
      violations.push(`Total allocation (${totalAllocated}) doesn't match total capital (${totalCapital})`)
    }

    // Check percentage targets (with 5% tolerance)
    const corePercent = (core.allocated / totalCapital) * 100
    const tacticalPercent = (tactical.allocated / totalCapital) * 100
    const warChestPercent = (warChest.allocated / totalCapital) * 100

    if (Math.abs(corePercent - ALLOCATION_TARGETS.CORE * 100) > 5) {
      violations.push(`Core allocation ${corePercent.toFixed(1)}% deviates from 60% target`)
    }
    if (Math.abs(tacticalPercent - ALLOCATION_TARGETS.TACTICAL * 100) > 5) {
      violations.push(`Tactical allocation ${tacticalPercent.toFixed(1)}% deviates from 25% target`)
    }
    if (Math.abs(warChestPercent - ALLOCATION_TARGETS.WAR_CHEST * 100) > 5) {
      violations.push(`War chest allocation ${warChestPercent.toFixed(1)}% deviates from 15% target`)
    }

    // Check for over-utilization
    if (core.used > core.allocated) {
      violations.push('Core holdings exceed allocated capital')
    }
    if (tactical.used > tactical.allocated) {
      violations.push('Tactical plays exceed allocated capital')
    }
    if (warChest.used > warChest.allocated) {
      violations.push('War chest usage exceeds allocated capital')
    }

    return {
      valid: violations.length === 0,
      violations
    }
  }

  static calculateAvailable(bucket: { allocated: number; used: number }): number {
    return Math.max(0, bucket.allocated - bucket.used)
  }

  static createDefaultAllocation(totalCapital: number): CapitalAllocation {
    return {
      core: {
        allocated: totalCapital * ALLOCATION_TARGETS.CORE,
        used: 0,
        available: totalCapital * ALLOCATION_TARGETS.CORE,
        positions: []
      },
      tactical: {
        allocated: totalCapital * ALLOCATION_TARGETS.TACTICAL,
        used: 0,
        available: totalCapital * ALLOCATION_TARGETS.TACTICAL,
        positions: []
      },
      warChest: {
        allocated: totalCapital * ALLOCATION_TARGETS.WAR_CHEST,
        used: 0,
        available: totalCapital * ALLOCATION_TARGETS.WAR_CHEST,
        positions: []
      },
      totalCapital
    }
  }
}

// ==========================================
// FORMATTING UTILITIES
// ==========================================

export class FormatUtils {
  static currency(amount: number, decimals: number = 2): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(amount)
  }

  static percentage(value: number, decimals: number = 1): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
  }

  static number(value: number, decimals: number = 0): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value)
  }

  static shortNumber(value: number): string {
    if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`
    return value.toString()
  }

  static relativeTime(date: Date): string {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)
    const diffDays = diffHours / 24

    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${Math.floor(diffHours)}h ago`
    if (diffDays < 7) return `${Math.floor(diffDays)}d ago`
    return date.toLocaleDateString()
  }
}

// ==========================================
// VALIDATION UTILITIES
// ==========================================

export class ValidationUtils {
  static isValidSymbol(symbol: string): boolean {
    return /^[A-Z]{1,5}$/.test(symbol.toUpperCase())
  }

  static isValidQuantity(quantity: number): boolean {
    return quantity > 0 && Number.isFinite(quantity)
  }

  static isValidPrice(price: number): boolean {
    return price > 0 && Number.isFinite(price)
  }

  static validatePositionInput(input: PositionInput): { valid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {}

    if (!input.symbol) {
      errors.symbol = 'Symbol is required'
    } else if (!this.isValidSymbol(input.symbol)) {
      errors.symbol = 'Invalid ticker symbol'
    }

    if (!input.quantity) {
      errors.quantity = 'Quantity is required'
    } else if (!this.isValidQuantity(input.quantity)) {
      errors.quantity = 'Quantity must be greater than 0'
    }

    if (!input.avgCost) {
      errors.avgCost = 'Average cost is required'
    } else if (!this.isValidPrice(input.avgCost)) {
      errors.avgCost = 'Average cost must be greater than 0'
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors
    }
  }
}

// ==========================================
// LOCAL STORAGE UTILITIES
// ==========================================

export class StorageUtils {
  static getItem<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') return defaultValue
    
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch {
      return defaultValue
    }
  }

  static setItem<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return
    
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.error('Failed to save to localStorage:', error)
    }
  }

  static removeItem(key: string): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(key)
  }
}

// ==========================================
// COLOR UTILITIES
// ==========================================

export class ColorUtils {
  static getGainLossColor(value: number): string {
    if (value > 0) return 'var(--success)'
    if (value < 0) return 'var(--danger)'
    return 'var(--text-muted)'
  }

  static getAlertColor(type: 'info' | 'warning' | 'critical' | 'opportunity'): string {
    switch (type) {
      case 'info': return 'var(--secondary)'
      case 'warning': return 'var(--warning)'
      case 'critical': return 'var(--danger)'
      case 'opportunity': return 'var(--success)'
      default: return 'var(--text-muted)'
    }
  }
}