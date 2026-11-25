import { AUDIO_SAMPLE_RATE, encodeWav, inspectWav } from './wav'

export async function normalizeAudio(file: Blob, maximumSeconds: number): Promise<Blob> {
  if (file.size > 10 * 1024 * 1024 || file.size < 16 || !/^(audio\/|video\/mp4)/.test(file.type)) throw new Error('invalid_audio')
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer())
    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.duration > maximumSeconds) throw new Error('audio_too_long')
    const frames = Math.floor(decoded.duration * AUDIO_SAMPLE_RATE)
    const renderer = new OfflineAudioContext(1, frames, AUDIO_SAMPLE_RATE)
    const source = renderer.createBufferSource(); source.buffer = decoded; source.connect(renderer.destination); source.start()
    const mono = await renderer.startRendering()
    const bytes = encodeWav(mono.getChannelData(0)); inspectWav(bytes, maximumSeconds)
    return new Blob([bytes], { type: 'audio/wav' })
  } catch (error) { if (error instanceof Error && error.message === 'audio_too_long') throw error; throw new Error('invalid_audio',{cause:error}) }
  finally { await context.close() }
}
