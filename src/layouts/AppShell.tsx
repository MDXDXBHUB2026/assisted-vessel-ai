import { Outlet } from 'react-router-dom'
import { CommandRibbon } from '@/components/layout/CommandRibbon'
import { SideNav } from '@/components/layout/SideNav'

export function AppShell({ section }: { section: 'vessel' | 'shore' }) {
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
