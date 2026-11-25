export function localDateTime(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const value = (name: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === name)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`
}

export function utcDateTime(value: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('invalid_date')
  const wall = Date.parse(`${value}:00Z`)
  if (!Number.isFinite(wall)) throw new Error('invalid_date')
  let instant = wall
  for (let iteration = 0; iteration < 3; iteration++) {
    const rendered = Date.parse(`${localDateTime(new Date(instant).toISOString(), timezone)}:00Z`)
    instant += wall - rendered
  }
  const iso = new Date(instant).toISOString()
  if (localDateTime(iso, timezone) !== value) throw new Error('invalid_date')
  return iso
}
