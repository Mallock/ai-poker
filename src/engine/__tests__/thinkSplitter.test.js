import { describe, it, expect } from 'vitest'
import { splitThink } from '../../ai/thinkSplitter.js'

async function collect(iter) {
  const out = []
  for await (const evt of iter) out.push(evt)
  return out
}

async function* fromChunks(chunks) {
  for (const c of chunks) yield c
}

function consolidate(events) {
  const out = []
  for (const e of events) {
    const last = out[out.length - 1]
    if (last && last.type === e.type) last.text += e.text
    else out.push({ ...e })
  }
  return out
}

describe('splitThink', () => {
  it('passes plain content through unchanged', async () => {
    const out = await collect(splitThink(fromChunks(['hello ', 'world'])))
    expect(consolidate(out)).toEqual([{ type: 'content', text: 'hello world' }])
  })

  it('extracts a single think block', async () => {
    const out = await collect(splitThink(fromChunks([
      'before <think>my reasoning</think> after',
    ])))
    expect(consolidate(out)).toEqual([
      { type: 'content', text: 'before ' },
      { type: 'think', text: 'my reasoning' },
      { type: 'content', text: ' after' },
    ])
  })

  it('handles tag split across chunk boundary (open)', async () => {
    const out = await collect(splitThink(fromChunks(['before <thi', 'nk>r1</think> after'])))
    expect(consolidate(out)).toEqual([
      { type: 'content', text: 'before ' },
      { type: 'think', text: 'r1' },
      { type: 'content', text: ' after' },
    ])
  })

  it('handles tag split across chunk boundary (close)', async () => {
    const out = await collect(splitThink(fromChunks(['<think>foo</thi', 'nk>bar'])))
    expect(consolidate(out)).toEqual([
      { type: 'think', text: 'foo' },
      { type: 'content', text: 'bar' },
    ])
  })

  it('handles a stream that ends inside a think block', async () => {
    const out = await collect(splitThink(fromChunks(['<think>unfinished'])))
    expect(consolidate(out)).toEqual([
      { type: 'think', text: 'unfinished' },
    ])
  })

  it('handles multiple think blocks', async () => {
    const out = await collect(splitThink(fromChunks([
      '<think>a</think>between<think>b</think>end',
    ])))
    expect(consolidate(out)).toEqual([
      { type: 'think', text: 'a' },
      { type: 'content', text: 'between' },
      { type: 'think', text: 'b' },
      { type: 'content', text: 'end' },
    ])
  })

  it('handles per-character streaming', async () => {
    const text = 'hi <think>x</think> bye'
    const chunks = [...text]
    const out = await collect(splitThink(fromChunks(chunks)))
    expect(consolidate(out)).toEqual([
      { type: 'content', text: 'hi ' },
      { type: 'think', text: 'x' },
      { type: 'content', text: ' bye' },
    ])
  })
})
