export type UserRole = 'driver' | 'passenger' | 'both'
export type VehicleType = 'sedan' | 'suv' | 'hatchback'
export type RouteStatus = 'draft' | 'active' | 'completed' | 'cancelled'
export type RouteFrequency = 'once' | 'daily' | 'weekdays' | 'mwf' | 'custom'
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type BookingStatus = 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'disputed'

export interface UserProfile {
  id: string
  display_name: string | null
  phone: string | null
  phone_verified: boolean
  avatar_url: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Vehicle {
  id: string
  user_id: string
  type: VehicleType
  make_model: string | null
  plate_suffix: string | null
  seats_offered: number
  created_at: string
}

export interface DriverRoute {
  id: string
  driver_id: string
  vehicle_id: string | null
  status: RouteStatus
  frequency: RouteFrequency
  custom_days: number[] | null
  departure_time: string
  first_departure_date: string
  timezone: string
  origin_label: string | null
  destination_label: string | null
  route_geojson: GeoJSON.LineString | null
  distance_km: number | null
  duration_hours: number | null
  vehicle_type: VehicleType | null
  gas_price_php_per_l: number | null
  computed_fare_php: number | null
  override_fare_php: number | null
  fare_formula_version: string | null
  seats_available: number
  created_at: string
  updated_at: string
  // joined
  driver?: UserProfile
  vehicle?: Vehicle
}

export interface RideStopRequest {
  id: string
  driver_route_id: string
  passenger_id: string
  pickup_label: string | null
  dropoff_label: string | null
  pickup_fraction: number | null
  dropoff_fraction: number | null
  status: RequestStatus
  passenger_note: string | null
  driver_note: string | null
  decided_at: string | null
  created_at: string
  // joined
  driver_route?: DriverRoute
  passenger?: UserProfile
}

export interface RideBooking {
  id: string
  driver_route_id: string
  passenger_id: string
  linked_request_id: string | null
  pickup_label: string | null
  dropoff_label: string | null
  agreed_fare_php: number
  currency: string
  status: BookingStatus
  created_at: string
}

export interface FareInputs {
  vehicleType: VehicleType
  gasPricePHP: number
  distanceKm: number
  durationHours: number
  seats: number
}

export interface FareBreakdown {
  fuelCostPHP: number
  timeCostPHP: number
  totalCostPHP: number
  perSeatPHP: number
  roundedPerSeatPHP: number
}
