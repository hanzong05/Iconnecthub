import { describe, expect, it } from 'vitest'
import { createHistory, historyReducer } from './history'

const set = (s: ReturnType<typeof createHistory<number>>, value: number, key = 'a', at = 0) =>
  historyReducer(s, { type: 'set', update: value, key, at })

describe('history', () => {
  it('undoes and redoes one step at a time', () => {
    let s = createHistory(0)
    s = set(s, 1, 'a', 0)
    s = set(s, 2, 'a', 5000)
    expect(s.present).toBe(2)
    s = historyReducer(s, { type: 'undo' })
    expect(s.present).toBe(1)
    s = historyReducer(s, { type: 'redo' })
    expect(s.present).toBe(2)
  })

  it('treats quick edits under one key as a single step', () => {
    let s = createHistory(0)
    s = set(s, 1, 'drag', 0)
    s = set(s, 2, 'drag', 100)
    s = set(s, 3, 'drag', 200)
    s = historyReducer(s, { type: 'undo' })
    expect(s.present).toBe(0)
  })

  it('starts a new step for a different key or a pause', () => {
    let s = createHistory(0)
    s = set(s, 1, 'calibration', 0)
    s = set(s, 2, 'detail', 100)
    s = set(s, 3, 'detail', 2000)
    s = historyReducer(s, { type: 'undo' })
    expect(s.present).toBe(2)
    s = historyReducer(s, { type: 'undo' })
    expect(s.present).toBe(1)
  })

  it('clears redo after a new edit, and ignores undo with nothing to undo', () => {
    let s = createHistory(0)
    expect(historyReducer(s, { type: 'undo' })).toBe(s)
    s = set(s, 1, 'a', 0)
    s = historyReducer(s, { type: 'undo' })
    s = set(s, 5, 'a', 10000)
    expect(s.future).toHaveLength(0)
    expect(s.present).toBe(5)
  })

  it('applies a function update to the latest value', () => {
    let s = createHistory(10)
    s = historyReducer(s, { type: 'set', update: (p: number) => p + 1, key: 'a', at: 0 })
    expect(s.present).toBe(11)
  })
})
