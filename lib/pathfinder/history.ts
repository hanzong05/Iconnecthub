import { useCallback, useReducer } from 'react'

/**
 * Undo and redo for an editor. Edits made in quick succession under the same key (a drag, a slider,
 * a run of keystrokes) count as one step, so one undo reverts one gesture rather than one pixel.
 */

const COALESCE_MS = 600
const LIMIT = 100

export interface History<T> {
  past: T[]
  present: T
  future: T[]
  lastKey: string | null
  lastAt: number
}

export type Update<T> = T | ((prev: T) => T)

export type HistoryAction<T> =
  | { type: 'set'; update: Update<T>; key: string; at: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; value: T }

export function createHistory<T>(value: T): History<T> {
  return { past: [], present: value, future: [], lastKey: null, lastAt: 0 }
}

export function historyReducer<T>(state: History<T>, action: HistoryAction<T>): History<T> {
  switch (action.type) {
    case 'set': {
      const next = typeof action.update === 'function' ? (action.update as (prev: T) => T)(state.present) : action.update
      if (Object.is(next, state.present)) return state
      // Same gesture: keep the step that started it, and only move the present value.
      const sameGesture = state.lastKey === action.key && action.at - state.lastAt < COALESCE_MS
      if (sameGesture) return { ...state, present: next, future: [], lastAt: action.at }
      return {
        past: [...state.past, state.present].slice(-LIMIT),
        present: next,
        future: [],
        lastKey: action.key,
        lastAt: action.at,
      }
    }
    case 'undo': {
      if (state.past.length === 0) return state
      const prev = state.past[state.past.length - 1]
      return { past: state.past.slice(0, -1), present: prev, future: [state.present, ...state.future], lastKey: null, lastAt: 0 }
    }
    case 'redo': {
      if (state.future.length === 0) return state
      const [next, ...rest] = state.future
      return { past: [...state.past, state.present], present: next, future: rest, lastKey: null, lastAt: 0 }
    }
    case 'reset':
      return createHistory(action.value)
  }
}

export function useHistory<T>(initial: T) {
  const [state, dispatch] = useReducer(historyReducer<T>, initial, createHistory<T>)
  const set = useCallback((update: Update<T>, key: string) => dispatch({ type: 'set', update, key, at: Date.now() }), [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  const reset = useCallback((value: T) => dispatch({ type: 'reset', value }), [])
  return {
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    set,
    undo,
    redo,
    reset,
  }
}
