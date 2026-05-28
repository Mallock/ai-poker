import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

// Dev-server middleware that proxies Microsoft's free Edge neural TTS endpoint.
// The browser can't reach that endpoint directly — it needs a signed Sec-MS-GEC token
// and sends no CORS headers — so synthesis happens here in Node, mirroring the `/lm`
// LM Studio proxy. The browser requests `GET /tts?voice=<id>&text=<utterance>` and gets
// back `audio/mpeg`.

// Voice ids look like `en-US-GuyNeural`; the value is interpolated into an SSML template
// server-side, so constrain it to a safe character set to avoid SSML injection.
const VOICE_RE = /^[a-zA-Z0-9-]+$/
const MAX_TEXT_LEN = 1000
// Used when the requested voice is unrecognized by Edge (synthesis returns no audio).
const DEFAULT_VOICE = 'en-US-AriaNeural'

// Synthesize `text` in `voice` and return the full MP3 as a Buffer. An unrecognized voice
// makes Edge return zero audio rather than an error, so we buffer to detect that case and
// fall back before any response headers are sent.
async function synthesize(voice, text) {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const { audioStream } = tts.toStream(text)
  const chunks = []
  try {
    await new Promise((resolve, reject) => {
      audioStream.on('data', (chunk) => chunks.push(chunk))
      audioStream.on('end', resolve)
      audioStream.on('error', reject)
    })
  } finally {
    tts.close?.()
  }
  return Buffer.concat(chunks)
}

export default function edgeTtsPlugin() {
  return {
    name: 'edge-tts',
    configureServer(server) {
      server.middlewares.use('/tts', async (req, res) => {
        const url = new URL(req.url, 'http://localhost')
        const voice = (url.searchParams.get('voice') || '').trim()
        const text = (url.searchParams.get('text') || '').trim()

        if (!voice || !VOICE_RE.test(voice) || !text || text.length > MAX_TEXT_LEN) {
          res.statusCode = 400
          res.end('Invalid voice or text')
          return
        }

        try {
          let audio = await synthesize(voice, text)
          // Unrecognized voice → no audio; retry once with the default voice. Warn so a
          // typo'd/unavailable voiceId surfaces instead of silently becoming the default.
          if (audio.length === 0 && voice !== DEFAULT_VOICE) {
            console.warn(`[edge-tts] voice "${voice}" produced no audio; falling back to ${DEFAULT_VOICE}`)
            audio = await synthesize(DEFAULT_VOICE, text)
          }
          if (audio.length === 0) {
            res.statusCode = 502
            res.end('No audio synthesized')
            return
          }
          res.statusCode = 200
          res.setHeader('Content-Type', 'audio/mpeg')
          res.setHeader('Content-Length', audio.length)
          res.end(audio)
        } catch (err) {
          res.statusCode = 502
          res.end(`TTS synthesis failed: ${err?.message ?? 'unknown error'}`)
        }
      })
    },
  }
}
