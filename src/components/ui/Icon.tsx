import House from 'lucide-react/icons/house'
import CalendarDays from 'lucide-react/icons/calendar-days'
import Settings from 'lucide-react/icons/settings'
import ArrowRight from 'lucide-react/icons/arrow-right'
import Check from 'lucide-react/icons/check'
import Plus from 'lucide-react/icons/plus'
import Sparkles from 'lucide-react/icons/sparkles'
import Globe from 'lucide-react/icons/globe'

const icons = { home: House, calendar: CalendarDays, settings: Settings, arrow: ArrowRight, check: Check, plus: Plus, spark: Sparkles, globe: Globe } as const
type IconName = keyof typeof icons

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const Symbol = icons[name]
  return <Symbol className={className} size={20} strokeWidth={1.7} aria-hidden="true" />
}
