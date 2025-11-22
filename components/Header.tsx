'use client'

import { usePathname } from 'next/navigation'
import { ConnectButton } from './ConnectButton'

const pageTitles: Record<string, string> = {
  '/': 'Search',
  '/request': 'Request',
  '/verify': 'Verify',
  '/mine': 'My Verifications',
}

export function Header() {
  const pathname = usePathname()
  const title = pageTitles[pathname] || 'AskMe'

  return (
    <div className="border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-8 py-6">
        <div className="flex justify-between items-center">
          <div className="flex-1">
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold text-black leading-none tracking-tight mb-4">
              {title}
            </h1>
          </div>
          <div className="flex-shrink-0">
            <ConnectButton />
          </div>
        </div>
        <p className="text-lg md:text-xl text-gray-600 mt-6 max-w-2xl">
          Ask for verification of any field. Users control their data and choose what to share.
        </p>
      </div>
    </div>
  )
}

