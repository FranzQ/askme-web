'use client'

import { useState, useEffect } from 'react'
import { useAccount, useEnsName } from 'wagmi'

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
      <div className="max-w-4xl mx-auto px-8 py-16">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-16">
        <p className="text-red-600 text-lg">Please connect your wallet to continue.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-16">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-base font-medium mb-2 text-black">
              Subject ENS Name *
            </label>
            <input
              type="text"
              value={subjectEns}
              onChange={(e) => setSubjectEns(e.target.value)}
              placeholder="example.eth"
              className="w-full px-5 py-3.5 border border-gray-300 bg-white text-base text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all"
              required
            />
            <p className="text-sm text-gray-600 mt-2">
              The ENS name of the user you want to verify
            </p>
          </div>

          <div>
            <label className="block text-base font-medium mb-2 text-black">
              Field to Verify *
            </label>
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="w-full px-5 py-3.5 border border-gray-300 bg-white text-base text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all"
            >
              <option value="full_name">Full Name</option>
              <option value="dob">Date of Birth</option>
              <option value="passport_id">Passport/ID Number</option>
            </select>
          </div>

          {error && (
            <div className="p-5 bg-red-50 border border-red-200 text-red-900">
              {error}
            </div>
          )}

          {success && (
            <div className="p-5 bg-green-50 border border-green-200 text-green-900">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3.5 bg-black text-white text-base font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Creating Request...' : 'Create Request'}
          </button>
        </form>

        <div className="mt-12 p-6 bg-gray-50 border border-gray-200">
          <h3 className="font-bold text-lg mb-4 text-black">How it works:</h3>
          <ol className="list-decimal list-inside space-y-2 text-base text-gray-700">
            <li>Create a verification request for a user's ENS name</li>
            <li>The user will see your request in their app</li>
            <li>If approved, you'll get temporary access to the field value</li>
            <li>Use the value to create your attestation</li>
            <li>The value is automatically cleared after attestation or expiry</li>
          </ol>
        </div>
    </div>
  )
}

