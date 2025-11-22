'use client'

import { useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface Verification {
  id: string
  verifiedEns: string
  field: string
  fieldHash: string
  verifierType: string
  verifierId: string
  ensName: string | null
  methodUrl: string | null
  createdAt: string
  status: string
  attestationUid?: string | null
  attestationExplorerUrl?: string | null
  isValid?: boolean
  isEnsValid?: boolean
  isActive?: boolean
  ownershipMatches?: boolean
  expiryValid?: boolean
  verifierValid?: boolean
}

interface VerificationStats {
  subjectEns: string
  totalFields: number
  totalVerifiers: number
  ensVerifiers: number
  worldVerifiers: number
  byField: Record<string, {
    count: number
    verifiers: Array<{
      verifierType: string
      verifierId: string
      ensName: string | null
      verifiedAt: string
    }>
  }>
}

export function SearchVerifications() {
  const [ensName, setEnsName] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifications, setVerifications] = useState<Verification[]>([])
  const [stats, setStats] = useState<VerificationStats | null>(null)
  const [error, setError] = useState('')

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const [verificationsRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/verifications/${ensName}`),
        fetch(`${API_URL}/api/verifications/${ensName}/stats`),
      ])

      if (!verificationsRes.ok) {
        throw new Error('Failed to fetch verifications')
      }

      const verificationsData = await verificationsRes.json()
      setVerifications(verificationsData)

      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setStats(statsData)
      } else {
        setStats(null)
      }

    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setVerifications([])
      setStats(null)
    } finally {
      setLoading(false)
    }
  }

  const groupByField = (verifications: Verification[]) => {
    const grouped: Record<string, Verification[]> = {}
    verifications.forEach((v) => {
      if (!grouped[v.field]) {
        grouped[v.field] = []
      }
      grouped[v.field].push(v)
    })
    return grouped
  }

  const grouped = groupByField(verifications)
  const activeByField: Record<string, Verification[]> = {}
  const revokedByField: Record<string, Verification[]> = {}

  Object.keys(grouped).forEach((field) => {
    activeByField[field] = grouped[field].filter((v) => v.status === 'active' && v.isValid)
    revokedByField[field] = grouped[field].filter((v) => v.status === 'revoked' || !v.isValid)
  })

  return (
    <div>
      <form onSubmit={handleSearch} className="mb-8">
        <div className="mb-2">
          <p className="text-sm text-gray-600">
            See who has verified fields for an ENS name. Each field shows how many verifiers confirmed it.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={ensName}
            onChange={(e) => setEnsName(e.target.value)}
            placeholder="Enter ENS name (e.g., example.eth)"
            className="flex-1 px-4 py-2 border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded mb-4">
          {error}
        </div>
      )}

      {stats && (
        <div className="mb-6 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Verification Statistics for <span className="text-blue-600">{ensName}</span>
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            All verifiers below have verified <strong>this ENS owner's fields</strong>. 
            World ID users are provably human verifiers, while ENS verifiers are institutions/companies.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Total Fields Verified</div>
              <div className="text-3xl font-bold text-blue-600">{stats.totalFields}</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border-2 border-indigo-200">
              <div className="text-sm text-gray-600 mb-1">Total Verifiers</div>
              <div className="text-3xl font-bold text-indigo-600">{stats.totalVerifiers}</div>
              <div className="text-xs text-gray-500 mt-1">All verifying same fields</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border-2 border-amber-200">
              <div className="text-sm text-gray-600 mb-1 flex items-center gap-1">
                <span>World ID Verifiers</span>
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded" title="Provably human verifiers">Human</span>
              </div>
              <div className="text-3xl font-bold text-amber-600">{stats.worldVerifiers}</div>
              <div className="text-xs text-gray-500 mt-1">Individual verifiers</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border-2 border-blue-200">
              <div className="text-sm text-gray-600 mb-1 flex items-center gap-1">
                <span>ENS Verifiers</span>
                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded" title="Institutions/Companies">Institution</span>
              </div>
              <div className="text-3xl font-bold text-blue-600">{stats.ensVerifiers}</div>
              <div className="text-xs text-gray-500 mt-1">Company/Org verifiers</div>
            </div>
          </div>
          
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Verifiers by Field
              <span className="text-sm font-normal text-gray-600 ml-2">
                (All verifying {ensName}'s fields)
              </span>
            </h3>
            {Object.entries(stats.byField).map(([field, fieldStats]) => {
              const worldCount = fieldStats.verifiers.filter(v => v.verifierType === 'world').length
              const ensCount = fieldStats.verifiers.filter(v => v.verifierType === 'ens').length
              
              return (
              <div key={field} className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <h4 className="text-lg font-semibold capitalize text-gray-900">
                      {field.replace('_', ' ')}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Verified by {fieldStats.count} {fieldStats.count === 1 ? 'verifier' : 'verifiers'} 
                      {' '}({worldCount} World ID, {ensCount} ENS)
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                    {fieldStats.count} {fieldStats.count === 1 ? 'verifier' : 'verifiers'}
                  </span>
                </div>
                <div className="space-y-2">
                  {fieldStats.verifiers.map((verifier, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {verifier.ensName || (verifier.verifierType === 'world' 
                            ? `World ID: ${verifier.verifierId.slice(0, 8)}...${verifier.verifierId.slice(-6)}`
                            : `${verifier.verifierId.slice(0, 6)}...${verifier.verifierId.slice(-4)}`)}
                        </span>
                        {verifier.ensName && verifier.verifierType === 'ens' && (
                          <span className="text-xs text-gray-500">
                            ({verifier.verifierId.slice(0, 6)}...{verifier.verifierId.slice(-4)})
                          </span>
                        )}
                        {verifier.verifierType === 'world' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold" title="Verified individual (World ID)">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Individual
                          </span>
                        )}
                        {verifier.verifierType === 'ens' && verifier.ensName && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold" title="Institution/Company (ENS)">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                            </svg>
                            Institution
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(verifier.verifiedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              )
            })}
          </div>
        </div>
      )}

      {verifications.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Detailed Verifications</h2>
          {Object.keys(activeByField).map((field) => {
            const active = activeByField[field]
            const revoked = revokedByField[field] || []
            const fieldStats = stats?.byField[field]
            
            return (
              <div key={field} className="border rounded p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold capitalize text-gray-900">
                    {field.replace('_', ' ')}
                  </h3>
                  {fieldStats && (
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                        {fieldStats.count} {fieldStats.count === 1 ? 'verifier' : 'verifiers'} verified this
                      </span>
                    </div>
                  )}
                </div>

                {active.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium mb-2 text-green-700">Active Verifications</h4>
                    <div className="space-y-2">
                      {active.map((v) => (
                        <div key={v.id} className="p-3 bg-green-50 rounded">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-gray-900">
                                  Verifier: {
                                    v.verifierType === 'world' 
                                      ? `World ID (${v.verifierId.slice(0, 8)}...${v.verifierId.slice(-6)})`
                                      : (v.ensName || `${v.verifierId.slice(0, 6)}...${v.verifierId.slice(-4)}`)
                                  }
                                </p>
                                {v.verifierType === 'world' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold" title="Verified by World ID (Individual)">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    Individual
                                  </span>
                                )}
                                {v.verifierType === 'ens' && v.ensName && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold" title="Verified by ENS (Institution/Company)">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                                    </svg>
                                    Institution
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-mono text-gray-600 mt-1">Field Hash: {v.fieldHash}</p>
                              {v.methodUrl && (
                                <a
                                  href={v.methodUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  Method: {v.methodUrl}
                                </a>
                              )}
                              {v.attestationUid && (
                                <div className="mt-2 p-2 bg-purple-50 rounded border border-purple-200">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                      </svg>
                                      On-Chain (Base)
                                    </span>
                                  </div>
                                  <p className="text-xs font-semibold text-purple-900 mb-1">
                                    📜 On-Chain Receipt
                                  </p>
                                  <p className="text-xs font-mono text-purple-700 mb-1">
                                    UID: {v.attestationUid.slice(0, 20)}...{v.attestationUid.slice(-10)}
                                  </p>
                                  {v.attestationExplorerUrl && (
                                    <a
                                      href={v.attestationExplorerUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-purple-600 hover:underline font-medium inline-flex items-center gap-1"
                                    >
                                      View on Base Explorer
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                      </svg>
                                    </a>
                                  )}
                                </div>
                              )}
                              <p className="text-xs text-gray-500">
                                Created: {new Date(v.createdAt).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="px-2 py-1 bg-green-200 text-green-800 rounded text-xs font-medium">
                                ✓ Valid
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {revoked.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 text-gray-600">Revoked/Invalid</h4>
                    <div className="space-y-2">
                      {revoked.map((v) => (
                        <div key={v.id} className="p-3 bg-gray-50 rounded">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-medium">
                                Verifier: {v.ensName || v.verifierId}
                              </p>
                              <p className="text-xs font-mono text-gray-600">{v.fieldHash}</p>
                              <p className="text-xs text-gray-500">
                                Created: {new Date(v.createdAt).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="px-2 py-1 bg-red-200 text-red-800 rounded text-xs font-medium">
                                ✗ Invalid
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {verifications.length === 0 && !loading && ensName && (
        <p className="text-gray-600">No verifications found for {ensName}</p>
      )}
    </div>
  )
}

