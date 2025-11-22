'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import Link from 'next/link'
import { SearchVerifications } from '@/components/SearchVerifications'
import { ConnectButton } from '@/components/ConnectButton'

export default function Home() {
  const { address, isConnected } = useAccount()

  return (
    <main className="min-h-screen p-8 bg-white">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">AskMe</h1>
            <p className="text-gray-600 mt-2">
              Ask for verification of any field. Users control their data and choose what to share.
            </p>
          </div>
          <ConnectButton />
        </div>
        
        <nav className="mb-8 flex gap-4">
          <Link href="/" className="text-blue-600 hover:underline">
            Search
          </Link>
          <Link href="/request" className="text-blue-600 hover:underline">
            Request
          </Link>
          <Link href="/verify" className="text-blue-600 hover:underline">
            Verify
          </Link>
          {isConnected && (
            <Link href="/mine" className="text-blue-600 hover:underline">
              My Verifications
            </Link>
          )}
        </nav>

        <SearchVerifications />
      </div>
    </main>
  )
}

