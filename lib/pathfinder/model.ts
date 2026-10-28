import type { CalibrationFile, Category, Destination, Placement, Point, RoadNetwork } from './types'
import type { DetailLayer, ExtendedImage } from './detailLayer'

/** One campground map of a hub, as stored at hubs/{hubId}/pathfinder/campgrounds/{id}. */
export interface CampgroundRecord {
  id: string
  name: string
  public: boolean
  /** Address of the map image (https). Uploaded through the image host, never stored inside the database. */
  mapImage: string
  mapWidth: number
  mapHeight: number
  centerLat: number
  centerLon: number
  /** Optional second image covering part of the campground. */
  detail?: DetailLayer
  /** Second image with surrounding artwork, shown past the first image's edges. */
  extended?: ExtendedImage
  /** ISO time of the last save, set by the server. */
  updatedAt?: string
}

/** What the campground form sends. Image fields are only sent when a new picture was chosen. */
export interface CampgroundInput {
  name: string
  public: boolean
  centerLat: number
  centerLon: number
  image?: { url: string; width: number; height: number }
}

export interface Pin extends Destination {
  /** GPS position, stored once the map is calibrated. */
  lng?: number
  lat?: number
}

export interface Walkway {
  id: string
  points: { lng: number; lat: number }[]
}

/** Pins, walkways, obstacles and roads for one map. Saved as one JSON document (nested lists are safest as text). */
export interface Network {
  pins: Pin[]
  walkways: Walkway[]
  /** Closed outlines (image pixels) that walking routes must avoid. */
  obstacles: Point[][]
  /** Drawn road network. Absent until a road is saved. */
  roads?: RoadNetwork
}

export const EMPTY_NETWORK: Network = { pins: [], walkways: [], obstacles: [] }

/** Everything the editors need for one map. */
export interface MapSet {
  id: string
  label: string
  title: string
  imageUrl: string
  width: number
  height: number
  calibration: CalibrationFile
  destinations: Destination[]
  network: RoadNetwork
  detail?: DetailLayer
  extended?: ExtendedImage
}

/**
 * Turns a stored campground into the map shape the editors use. Until it is calibrated the georeference
 * starts at the centre entered on the campground form, with a 120 m wide map.
 */
export function campgroundMapSet(c: CampgroundRecord): MapSet {
  return {
    id: c.id,
    label: c.name,
    title: c.name,
    imageUrl: c.mapImage,
    width: c.mapWidth,
    height: c.mapHeight,
    detail: c.detail ?? undefined,
    extended: c.extended ?? undefined,
    calibration: {
      version: 1,
      notes: 'Not calibrated yet',
      controlPoints: [],
      checkpoints: [],
      georef: { lat: c.centerLat, lon: c.centerLon, widthM: 120 },
    },
    destinations: [],
    network: { nodes: [], edges: [] },
  }
}

export const CATEGORIES: Category[] = ['campsite', 'building', 'amenity']
export const PLACEMENTS: Placement[] = ['estimated', 'verified']

/** What a map screen is given by the server for one map. */
export interface MapBundle {
  record: CampgroundRecord
  network: Network
  calibration: CalibrationFile | null
}

/** The result of a save from a map screen. */
export type SaveResult = { ok: true; id?: string; updatedAt?: string } | { ok: false; error: string }
