'use client'

import { useState, useEffect } from 'react'
import { useAccount, useSwitchChain, useWalletClient } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'
import Link from 'next/link'
import { EAS, SchemaEncoder } from '@ethereum-attestation-service/eas-sdk'
import { BrowserProvider } from 'ethers'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface Verification {
  id: string
  verifiedEns: string
  field: string
  valueHash: string
  methodUrl: string | null
  issuedAt: string
  expiresAt: string
  status: string
  attestationUid?: string | null
  attestationExplorerUrl?: string | null
  isValid?: boolean
  isExpired?: boolean
  isEnsValid?: boolean
}

interface VerificationRequest {
  id: string
  verifierAddress: string
  verifierEns: string | null
  verifiedEns: string
  field: string
  status: string
  revealMode?: string | null
  requestedAt: string
  approvedAt: string | null
  expiresAt: string | null
  completedAt: string | null
}

export default function MinePage() {
  const { address, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const { data: walletClient } = useWalletClient()
  const [verifications, setVerifications] = useState<Verification[]>([])
  const [requests, setRequests] = useState<VerificationRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [creatingAttestation, setCreatingAttestation] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'verifications' | 'requests'>('verifications')

  useEffect(() => {
    if (isConnected && address) {
      fetchVerifications()
      fetchRequests()
    }
  }, [isConnected, address])
  
  const fetchRequests = async () => {
    if (!address) return
    
    try {
      const response = await fetch(`${API_URL}/api/requests/verifier/${address}`)
      if (response.ok) {
        const data = await response.json()
        setRequests(data)
      }
    } catch (error) {
      console.error('Error fetching requests:', error)
    }
  }

  const fetchVerifications = async () => {
    if (!address) return
    
    try {
      const response = await fetch(`${API_URL}/api/verifications/verifier/ens/${address}`)
      if (response.ok) {
        const data = await response.json()
        setVerifications(data)
      }
    } catch (error) {
      console.error('Error fetching verifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRevoke = async (id: string) => {
    if (!address) return
    
    setRevoking(id)
    try {
      const response = await fetch(`${API_URL}/api/verifications/${id}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ verifierAddress: address }),
      })

      if (response.ok) {
        await fetchVerifications()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to revoke')
      }
    } catch (error) {
      console.error('Error revoking:', error)
      alert('Failed to revoke verification')
    } finally {
      setRevoking(null)
    }
  }

  const handleCreateAttestation = async (verification: Verification) => {
    if (!address || !walletClient) {
      alert('Please connect your wallet')
      return
    }

    setCreatingAttestation(verification.id)
    try {
      if (typeof window !== 'undefined' && window.ethereum) {
        // Check and switch to Base Sepolia if needed
        let currentChainId = await walletClient.getChainId()
        if (currentChainId !== baseSepolia.id) {
          try {
            await switchChain({ chainId: baseSepolia.id })
            // Wait for chain switch to complete
            await new Promise(resolve => setTimeout(resolve, 2000))
            // Verify the switch
            currentChainId = await walletClient.getChainId()
            if (currentChainId !== baseSepolia.id) {
              throw new Error('Failed to switch to Base Sepolia. Please switch manually in your wallet.')
            }
          } catch (switchError: any) {
            alert(`Failed to switch to Base Sepolia: ${switchError.message || switchError}`)
            setCreatingAttestation(null)
            return
          }
        }

        const provider = new BrowserProvider(window.ethereum)
        // Wait for provider to be ready
        await provider.ready
        const signer = await provider.getSigner()
        
        // Verify signer is on correct chain
        const signerChainId = (await signer.provider.getNetwork()).chainId
        if (Number(signerChainId) !== baseSepolia.id) {
          throw new Error(`Signer is on chain ${signerChainId}, but Base Sepolia (${baseSepolia.id}) is required`)
        }

        // EAS Contract Address on Base Sepolia
        // Official address from: https://github.com/ethereum-attestation-service/eas-contracts
        const EAS_CONTRACT_ADDRESS = '0x4200000000000000000000000000000000000021'
        const eas = new EAS(EAS_CONTRACT_ADDRESS)
        eas.connect(signer)

        const schema = 'string verifiedEns,string field,bytes32 fieldHash,string verifierType,string verifierId,string ensName,string methodUrl'
        const schemaEncoder = new SchemaEncoder(schema)
        const encodedData = schemaEncoder.encodeData([
          { name: 'verifiedEns', value: verification.verifiedEns.toLowerCase(), type: 'string' },
          { name: 'field', value: verification.field, type: 'string' },
          { name: 'fieldHash', value: verification.valueHash, type: 'bytes32' },
          { name: 'verifierType', value: 'ens', type: 'string' },
          { name: 'verifierId', value: address.toLowerCase(), type: 'string' },
          { name: 'ensName', value: '', type: 'string' },
          { name: 'methodUrl', value: verification.methodUrl || '', type: 'string' },
        ])

        // For off-chain schemas, use zero hash (32 bytes of zeros)
        const OFF_CHAIN_SCHEMA = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`
        
        const tx = await eas.attest({
          schema: OFF_CHAIN_SCHEMA,
          data: {
            recipient: '0x0000000000000000000000000000000000000000' as `0x${string}`,
            expirationTime: BigInt(0),
            revocable: true,
            data: encodedData,
          },
        })

        const attestationUid = await tx.wait()

        const response = await fetch(`${API_URL}/api/verifications/${verification.id}/attestation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            attestationUid,
            verifierAddress: address,
          }),
        })

        if (response.ok) {
          await fetchVerifications()
          alert('On-chain attestation created successfully!')
        } else {
          const data = await response.json()
          alert(data.error || 'Failed to update verification')
        }
      }
    } catch (error: any) {
      console.error('Error creating attestation:', error)
      alert(`Failed to create attestation: ${error.message || 'Unknown error'}`)
    } finally {
      setCreatingAttestation(null)
    }
  }

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-16">
        <p className="text-red-600 text-lg">Please connect your wallet to view your verifications.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-16">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  const activeVerifications = verifications.filter(v => v.status === 'active')
  const revokedVerifications = verifications.filter(v => v.status === 'revoked')

  const pendingRequests = requests.filter(r => r.status === 'pending' || r.status === 'approved')
  const completedRequests = requests.filter(r => r.status === 'completed' || r.status === 'rejected' || r.status === 'expired')

  return (
    <div className="max-w-4xl mx-auto px-8 py-16">
        <div className="mb-8 flex gap-8 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('verifications')}
            className={`px-1 py-4 text-base font-medium transition-colors ${
              activeTab === 'verifications' 
                ? 'border-b-2 border-black text-black' 
                : 'text-gray-600 hover:text-black border-b-2 border-transparent'
            }`}
          >
            Verifications ({verifications.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-1 py-4 text-base font-medium transition-colors ${
              activeTab === 'requests' 
                ? 'border-b-2 border-black text-black' 
                : 'text-gray-600 hover:text-black border-b-2 border-transparent'
            }`}
          >
            Requests ({requests.length})
          </button>
        </div>

        {activeTab === 'requests' && (
          <div className="space-y-8">
            {pendingRequests.length > 0 && (
              <div>
                <h2 className="text-3xl font-bold mb-6 text-black">Pending/Approved ({pendingRequests.length})</h2>
                <div className="space-y-4">
                  {pendingRequests.map((r) => (
                    <div key={r.id} className="p-5 border border-gray-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-lg text-black mb-1">{r.verifiedEns}</p>
                          <p className="text-sm text-gray-600 mb-2">Field: {r.field}</p>
                          <p className="text-xs text-gray-500">
                            Requested: {new Date(r.requestedAt).toLocaleString()}
                          </p>
                          {r.approvedAt && (
                            <p className="text-xs text-green-600 mt-1">
                              Approved: {new Date(r.approvedAt).toLocaleString()}
                            </p>
                          )}
                          {r.expiresAt && (
                            <p className="text-xs text-gray-500 mt-1">
                              Expires: {new Date(r.expiresAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <span className={`px-3 py-1.5 text-xs font-medium ${
                            r.status === 'approved' ? 'bg-green-50 text-green-900 border border-green-200' :
                            r.status === 'pending' ? 'bg-yellow-50 text-yellow-900 border border-yellow-200' :
                            'bg-gray-50 text-gray-900 border border-gray-200'
                          }`}>
                            {r.status}
                          </span>
                          {r.status === 'approved' && (
                            <Link
                              href={`/verify?requestId=${r.id}`}
                              className="px-4 py-1.5 bg-black text-white text-xs font-medium hover:bg-gray-800 text-center transition-colors"
                            >
                              Verify Now
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {completedRequests.length > 0 && (
              <div>
                <h2 className="text-3xl font-bold mb-6 text-black">Completed ({completedRequests.length})</h2>
                <div className="space-y-4">
                  {completedRequests.map((r) => (
                    <div key={r.id} className="p-5 border border-gray-200 opacity-60">
                      <p className="font-bold text-lg text-black mb-1">{r.verifiedEns}</p>
                      <p className="text-sm text-gray-600 mb-2">Field: {r.field}</p>
                      <p className="text-xs text-gray-500">
                        Status: {r.status} • {new Date(r.requestedAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {requests.length === 0 && (
              <p className="text-lg text-gray-500">No requests found</p>
            )}
          </div>
        )}

        {activeTab === 'verifications' && (
          <>
            <div className="mb-12">
              <h2 className="text-3xl font-bold mb-6 text-black">Active ({activeVerifications.length})</h2>
              {activeVerifications.length === 0 ? (
                <p className="text-lg text-gray-500">No active verifications</p>
              ) : (
                <div className="space-y-4">
                  {activeVerifications.map((v) => (
                    <div key={v.id} className="p-5 border border-gray-200">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-bold text-lg text-black mb-1">{v.verifiedEns}</p>
                          <p className="text-sm text-gray-600 mb-2">Field: {v.field}</p>
                          <p className="text-xs font-mono text-gray-500 mb-2">{v.valueHash}</p>
                          <p className="text-xs text-gray-500">
                            Issued: {new Date(v.issuedAt).toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500">
                            Expires: {new Date(v.expiresAt).toLocaleString()}
                          </p>
                          {v.methodUrl && (
                            <a href={v.methodUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                              Method: {v.methodUrl}
                            </a>
                          )}
                          {v.attestationUid ? (
                            <div className="mt-2 p-2 bg-purple-50 rounded border border-purple-200">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold mb-1">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                On-Chain (Base)
                              </span>
                              {v.attestationExplorerUrl && (
                                <a
                                  href={v.attestationExplorerUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-purple-600 hover:underline block mt-1"
                                >
                                  View on Base Explorer →
                                </a>
                              )}
                            </div>
                          ) : (
                            <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-200">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold mb-1">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                Off-Chain Only
                              </span>
                              <p className="text-xs text-amber-700 mb-2">
                                Add on-chain attestation for permanent proof on Base
                              </p>
                              <button
                                onClick={() => handleCreateAttestation(v)}
                                disabled={creatingAttestation === v.id || !isConnected}
                                className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                              >
                                {creatingAttestation === v.id ? 'Creating...' : 'Add On-Chain Attestation'}
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => handleRevoke(v.id)}
                            disabled={revoking === v.id}
                            className="px-4 py-2 bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {revoking === v.id ? 'Revoking...' : 'Revoke'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-3xl font-bold mb-6 text-black">Revoked ({revokedVerifications.length})</h2>
              {revokedVerifications.length === 0 ? (
                <p className="text-lg text-gray-500">No revoked verifications</p>
              ) : (
                <div className="space-y-4">
                  {revokedVerifications.map((v) => (
                    <div key={v.id} className="p-5 border border-gray-200 opacity-60">
                      <p className="font-bold text-lg text-black mb-1">{v.verifiedEns}</p>
                      <p className="text-sm text-gray-600 mb-2">Field: {v.field}</p>
                      <p className="text-xs font-mono text-gray-500 mb-2">{v.valueHash}</p>
                      <p className="text-xs text-gray-500">
                        Issued: {new Date(v.issuedAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
    </div>
  )
}

