// Canonical, metadata-free PCM. Shared by the browser encoder and Edge validator.
export const AUDIO_SAMPLE_RATE = 16_000
export function encodeWav(samples: Float32Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i) }
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, AUDIO_SAMPLE_RATE, true); view.setUint32(28, AUDIO_SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) { const sample = Math.max(-1, Math.min(1, samples[i] ?? 0)); view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true) }
  return bytes
}

export function inspectWav(bytes: Uint8Array, maximumSeconds = 120): number {
  const fail = (): never => { throw new Error('invalid_audio') }
  if (bytes.length < 46 || bytes.length > 3_840_044) return fail()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  if (text(0) !== 'RIFF' || text(8) !== 'WAVE' || text(12) !== 'fmt ' || text(36) !== 'data'
    || view.getUint32(4, true) !== bytes.length - 8 || view.getUint32(16, true) !== 16
    || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1
    || view.getUint32(24, true) !== AUDIO_SAMPLE_RATE || view.getUint32(28, true) !== AUDIO_SAMPLE_RATE * 2
    || view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16
    || view.getUint32(40, true) !== bytes.length - 44 || (bytes.length - 44) % 2 !== 0) return fail()
  const duration = (bytes.length - 44) / (AUDIO_SAMPLE_RATE * 2)
  if (!Number.isFinite(maximumSeconds) || duration <= 0 || duration > Math.min(120, maximumSeconds)) return fail()
  return duration
}
