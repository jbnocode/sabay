import type { FareInputs, FareBreakdown, VehicleType } from '@/types/database'
import { roundToNearest5 } from '@/lib/utils'

// km/L city estimates — conservative Manila traffic values
const FUEL_EFFICIENCY: Record<VehicleType, number> = {
  hatchback: 12,
  sedan: 10,
  suv: 8,
}

// PHP / hour time-value (driver opportunity cost default)
const ALPHA = 150

// Platform + maintenance multiplier
const BETA = 1.1

// Minimum allowed fare per seat
export const FARE_MIN_PHP = 20

// Soft-warn threshold: 3× computed
export const FARE_WARN_MULTIPLIER = 3

export function calculateFare(inputs: FareInputs): FareBreakdown {
  const { vehicleType, gasPricePHP, distanceKm, durationHours, seats } = inputs
  const eta = FUEL_EFFICIENCY[vehicleType]

  const fuelCostPHP = (distanceKm / eta) * gasPricePHP
  const timeCostPHP = ALPHA * durationHours
  const totalCostPHP = BETA * (fuelCostPHP + timeCostPHP)
  const perSeatPHP = totalCostPHP / Math.max(1, seats)
  const roundedPerSeatPHP = Math.max(FARE_MIN_PHP, roundToNearest5(perSeatPHP))

  return { fuelCostPHP, timeCostPHP, totalCostPHP, perSeatPHP, roundedPerSeatPHP }
}

export function effectiveFare(
  computedFarePHP: number | null,
  overrideFarePHP: number | null
): number {
  return overrideFarePHP ?? computedFarePHP ?? 0
}

export function isFareOverrideWarning(
  computedFarePHP: number,
  overrideFarePHP: number
): boolean {
  return overrideFarePHP > FARE_WARN_MULTIPLIER * computedFarePHP
}
