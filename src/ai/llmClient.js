import { LM_STUDIO_URL, EXPECTED_MODEL } from './lmStudio.js'

// streamChat: POST /v1/chat/completions with stream:true and yield content deltas as they arrive.
// Returns an async iterator of strings (each yield is one delta of `choices[0].delta.content`).
// Throws on network error or HTTP error. AbortController can be passed via `signal`.
//
// Options:
//   messages: [{role, content}]
//   model: model id (default EXPECTED_MODEL)
//   temperature, max_tokens, response_format: passthrough
//   signal: AbortSignal
export async function* streamChat({
  messages,
  model = EXPECTED_MODEL,
  temperature = 0.7,
  max_tokens = 2048,
  response_format,
  signal,
}) {
  const body = {
    model,
    messages,
    temperature,
    max_tokens,
    stream: true,
  }
  if (response_format) body.response_format = response_format

  const resp = await fetch(`${LM_STUDIO_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`LM Studio HTTP ${resp.status}: ${text.slice(0, 200)}`)
  }
  if (!resp.body) {
    throw new Error('LM Studio response has no body (streaming not supported?)')
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // LM Studio with Qwen3 reasoning models emits reasoning tokens via `delta.reasoning_content`
  // (an OpenAI-compatible extension) instead of inlining `<think>...</think>` in `delta.content`.
  // We synthesize the open/close tags here so the downstream splitter works uniformly.
  let inReasoning = false
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sepIdx
      while ((sepIdx = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, sepIdx)
        buffer = buffer.slice(sepIdx + 2)
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') {
            if (inReasoning) { yield '</think>'; inReasoning = false }
            return
          }
          let obj
          try { obj = JSON.parse(data) } catch { continue }
          const delta = obj?.choices?.[0]?.delta
          if (!delta) continue
          const reasoning = delta.reasoning_content
          const content = delta.content
          if (typeof reasoning === 'string' && reasoning.length > 0) {
            if (!inReasoning) { yield '<think>'; inReasoning = true }
            yield reasoning
          }
          if (typeof content === 'string' && content.length > 0) {
            if (inReasoning) { yield '</think>'; inReasoning = false }
            yield content
          }
        }
      }
    }
    if (inReasoning) yield '</think>'
  } finally {
    try { reader.releaseLock() } catch { /* ignore */ }
  }
}
