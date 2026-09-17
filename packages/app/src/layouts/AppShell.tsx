import { Outlet } from 'react-router-dom'
import { CommandRibbon } from '@/components/layout/CommandRibbon'
import { SideNav } from '@/components/layout/SideNav'
import { SmallScreenNotice } from '@/components/layout/SmallScreenNotice'
import { useMinViewportWidth } from '@/hooks/useMinViewportWidth'
import { CONSOLE_MIN_WIDTH_PX } from '@/layouts/consoleBreakpoint'

export function AppShell({ section }: { section: 'vessel' | 'shore' }) {
  const hasConsoleWidth = useMinViewportWidth(CONSOLE_MIN_WIDTH_PX)

  if (!hasConsoleWidth) {
    return <SmallScreenNotice />
  }

  return (
    <div className="flex h-screen flex-col bg-hull-950">
      <CommandRibbon />
      <div className="flex min-h-0 flex-1">
        <SideNav section={section} />
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
