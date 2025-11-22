'use client'

import { useState, useEffect } from 'react'
import { useAccount, useEnsName } from 'wagmi'
import Link from 'next/link'
import { ConnectButton } from '@/components/ConnectButton'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

export default function RequestPage() {
  const { address, isConnected } = useAccount()
  const { data: ensName } = useEnsName({ 
    address: address as `0x${string}` | undefined,
    chainId: 11155111 // Sepolia
  })
  const [subjectEns, setSubjectEns] = useState('')
  const [field, setField] = useState('full_name')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (!isConnected || !address) {
        throw new Error('Please connect your wallet')
      }

      const worldcoinCheck = await fetch(`${API_URL}/api/worldcoin/${address}`)
      const worldcoinData = await worldcoinCheck.json()
      const hasEns = ensName !== null && ensName !== undefined
      
      if (!worldcoinData.verified && !hasEns) {
        throw new Error('You must be Worldcoin verified OR own an ENS name to request verifications.')
      }

      if (!subjectEns) {
        throw new Error('Please enter a subject ENS name')
      }

      const response = await fetch(`${API_URL}/api/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verifierAddress: address,
          verifiedEns: subjectEns,
          field,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create request')
      }

      setSuccess('Verification request created! The user will be notified and can approve it.')
      setSubjectEns('')
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) {
    return (
      <main className="min-h-screen p-8 bg-white">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold mb-8 text-gray-900">Request Verification</h1>
          <p className="text-gray-600">Loading...</p>
        </div>
      </main>
    )
  }

  if (!isConnected) {
    return (
      <main className="min-h-screen p-8 bg-white">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold mb-8 text-gray-900">Request Verification</h1>
          <p className="text-red-600">Please connect your wallet to continue.</p>
          <Link href="/" className="text-blue-600 hover:underline mt-4 inline-block">
            ← Back to Search
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-8 bg-white">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Request Verification</h1>
          <ConnectButton />
        </div>
        
        <Link href="/" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Search
        </Link>

        {isConnected && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-blue-800">
              <strong>ℹ️ Verification Required:</strong> You must be Worldcoin verified OR own an ENS name to request verifications.
              {ensName && <span className="ml-1">✅ You have ENS: {ensName}</span>}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Subject ENS Name *
            </label>
            <input
              type="text"
              value={subjectEns}
              onChange={(e) => setSubjectEns(e.target.value)}
              placeholder="example.eth"
              className="w-full px-4 py-2 border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              The ENS name of the user you want to verify
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Field to Verify *
            </label>
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="full_name">Full Name</option>
              <option value="dob">Date of Birth</option>
              <option value="passport_id">Passport/ID Number</option>
            </select>
          </div>

          {error && (
            <div className="p-4 bg-red-100 text-red-700 rounded">
              {error}
            </div>
          )}

          {success && (
            <div className="p-4 bg-green-100 text-green-700 rounded">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Request...' : 'Create Request'}
          </button>
        </form>

        <div className="mt-8 p-4 bg-blue-50 rounded">
          <h3 className="font-semibold mb-2">How it works:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Create a verification request for a user's ENS name</li>
            <li>The user will see your request in their app</li>
            <li>If approved, you'll get temporary access to the field value</li>
            <li>Use the value to create your attestation</li>
            <li>The value is automatically cleared after attestation or expiry</li>
          </ol>
        </div>
      </div>
    </main>
  )
}

