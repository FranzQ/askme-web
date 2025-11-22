'use client'

import { useAccount } from 'wagmi'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Navigation() {
  const { isConnected } = useAccount()
  const pathname = usePathname()

  const isActive = (path: string) => pathname === path

  return (
    <nav className="border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-8">
        <div className="flex gap-8">
          <Link 
            href="/" 
            className={`px-1 py-6 text-base font-medium transition-colors ${
              isActive('/') 
                ? 'text-black border-b-2 border-black' 
                : 'text-gray-600 hover:text-black border-b-2 border-transparent hover:border-gray-300'
            }`}
          >
            Search
          </Link>
          <Link 
            href="/request" 
            className={`px-1 py-6 text-base font-medium transition-colors ${
              isActive('/request') 
                ? 'text-black border-b-2 border-black' 
                : 'text-gray-600 hover:text-black border-b-2 border-transparent hover:border-gray-300'
            }`}
          >
            Request
          </Link>
          <Link 
            href="/verify" 
            className={`px-1 py-6 text-base font-medium transition-colors ${
              isActive('/verify') 
                ? 'text-black border-b-2 border-black' 
                : 'text-gray-600 hover:text-black border-b-2 border-transparent hover:border-gray-300'
            }`}
          >
            Verify
          </Link>
          {isConnected && (
            <Link 
              href="/mine" 
              className={`px-1 py-6 text-base font-medium transition-colors ${
                isActive('/mine') 
                  ? 'text-black border-b-2 border-black' 
                  : 'text-gray-600 hover:text-black border-b-2 border-transparent hover:border-gray-300'
              }`}
            >
              My Verifications
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}

