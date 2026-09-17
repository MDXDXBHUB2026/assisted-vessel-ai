import { Link } from 'react-router-dom'
import { Panel } from '@/components/ui/Panel'
import { Pill } from '@/components/ui/Badge'
import { ENGINEERING_ARTIFACTS } from '@ave/simulator/data/engineeringProgramme'
import type { ArtifactStatus } from '@/types'
import { FileCheck2, ArrowUpRight } from 'lucide-react'

const STATUS_LABEL: Record<ArtifactStatus, string> = { complete: 'Complete', in_progress: 'In Progress', planned: 'Planned' }
const STATUS_TONE: Record<ArtifactStatus, 'healthy' | 'warning' | 'neutral'> = { complete: 'healthy', in_progress: 'warning', planned: 'neutral' }

export function EngineeringAssurancePage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <FileCheck2 size={18} className="text-info-400" /> Engineering Assurance Programme
        </h1>
        <p className="text-sm text-ink-500">The engineering programme artifacts behind this POC, each with a status and its supporting evidence — this is what makes the demonstration an engineering programme, not only a UI prototype.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ENGINEERING_ARTIFACTS.map((a) => (
          <Panel key={a.id} dense title={a.title} action={<Pill tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Pill>}>
            <p className="text-xs text-ink-400">{a.summary}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              {a.route && (
                <Link to={a.route} className="flex items-center gap-1 text-info-400 hover:text-info-300">
                  Open live view <ArrowUpRight size={10} />
                </Link>
              )}
              {a.docPath && <span className="text-ink-700">docs/{a.docPath}</span>}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
