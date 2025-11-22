'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { IDKitWidget, VerificationLevel } from '@worldcoin/idkit'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const WORLDCOIN_APP_ID = process.env.NEXT_PUBLIC_WORLDCOIN_APP_ID || 'app_staging_...'

export function WorldcoinButton() {
  const { address, isConnected } = useAccount()
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')

  const checkStatus = async () => {
    if (!address) return
    
    try {
      const res = await fetch(`${API_URL}/api/worldcoin/${address}`)
      if (res.ok) {
        const data = await res.json()
        setVerified(data.verified || false)
      } else {
        setVerified(false)
      }
    } catch (err) {
      console.error('Error checking Worldcoin status:', err)
      setVerified(false)
    }
  }

  const handleVerify = async (proof: any) => {
    setVerified(true)
  }

  useEffect(() => {
    if (isConnected && address) {
      checkStatus()
    }
  }, [isConnected, address])

  if (!isConnected) {
    return null
  }

  if (verified) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-900 text-sm font-medium border border-amber-200">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        Worldcoin Verified
      </span>
    )
  }

  if (!WORLDCOIN_APP_ID || WORLDCOIN_APP_ID === 'app_staging_...') {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs text-gray-500">
          Worldcoin App ID not configured
        </p>
      </div>
    )
  }

  return (
    <>
      <IDKitWidget
        app_id={WORLDCOIN_APP_ID}
        action="verify-ens"
        signal={address || ''}
        verification_level={VerificationLevel.Orb}
        onSuccess={handleVerify}
        enableTelemetry={false}
      >
        {({ open }) => (
          <button
            onClick={open}
            className="px-4 py-2 bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            Verify with Worldcoin
          </button>
        )}
      </IDKitWidget>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </>
  )
}

