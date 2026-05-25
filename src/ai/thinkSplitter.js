// Streaming splitter that separates `<think>...</think>` reasoning blocks from regular content.
// Input: an async iterator of string deltas (any chunking).
// Output: an async iterator of {type: 'think'|'content', text} events.
//
// Handles tag boundaries split across chunks: each delta is appended to a small carry-over buffer,
// and we only emit text that we are sure is on one side of the boundary.

const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>'

export async function* splitThink(deltaIter) {
  let buf = ''
  let mode = 'content' // 'content' | 'think'

  function emitSafe(text) {
    // We can emit up to the point where a partial tag might start. Hold back at most
    // (max-tag-length - 1) characters in case the next chunk completes a tag.
    const safeTag = mode === 'content' ? THINK_OPEN : THINK_CLOSE
    const holdBack = safeTag.length - 1
    if (text.length <= holdBack) return { emit: '', rest: text }
    return { emit: text.slice(0, text.length - holdBack), rest: text.slice(text.length - holdBack) }
  }

  for await (const delta of deltaIter) {
    buf += delta
    while (true) {
      const target = mode === 'content' ? THINK_OPEN : THINK_CLOSE
      const idx = buf.indexOf(target)
      if (idx >= 0) {
        // Emit everything before the tag in the current mode.
        const before = buf.slice(0, idx)
        if (before.length > 0) yield { type: mode, text: before }
        // Flip mode and consume the tag.
        mode = mode === 'content' ? 'think' : 'content'
        buf = buf.slice(idx + target.length)
        continue
      }
      // No tag in buffer; emit safe portion and keep the tail.
      const { emit, rest } = emitSafe(buf)
      if (emit.length > 0) yield { type: mode, text: emit }
      buf = rest
      break
    }
  }
  // Flush remaining buffer (no further deltas can complete a tag).
  if (buf.length > 0) yield { type: mode, text: buf }
}
