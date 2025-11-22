'use client'

import { useState, useEffect } from 'react'
import React from 'react'
import { useAccount, useSignTypedData, useEnsName, useSwitchChain, useWalletClient, useChainId } from 'wagmi'
import { keccak256, isHexString } from 'viem'
import { stringToBytes } from 'viem/utils'
import { baseSepolia, sepolia } from 'wagmi/chains'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ConnectButton } from '@/components/ConnectButton'
import { IDKitWidget, VerificationLevel } from '@worldcoin/idkit'
import { EAS, SchemaEncoder } from '@ethereum-attestation-service/eas-sdk'
import { BrowserProvider } from 'ethers'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const WORLDCOIN_APP_ID = process.env.NEXT_PUBLIC_WORLDCOIN_APP_ID || 'app_staging_...'

const DOMAIN_NAME = 'VerifyENS'
const DOMAIN_VERSION = '1'

export default function VerifyPage() {
  const { address, isConnected } = useAccount()
  const { data: ensName } = useEnsName({ 
    address: address as `0x${string}` | undefined,
    chainId: 11155111 // Sepolia
  })
  const searchParams = useSearchParams()
  const [subjectEns, setSubjectEns] = useState('')
  const [field, setField] = useState('full_name')
  const [rawValue, setRawValue] = useState('')
  const [fieldHash, setFieldHash] = useState('')
  const [methodUrl, setMethodUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copied, setCopied] = useState(false)
  const [worldVerifying, setWorldVerifying] = useState(false)
  const [createOnChain, setCreateOnChain] = useState(true)
  const [mounted, setMounted] = useState(false)

  const { signTypedDataAsync } = useSignTypedData()
  const { switchChain } = useSwitchChain()
  const { data: walletClient } = useWalletClient()
  const chainId = useChainId()

  useEffect(() => {
    setMounted(true)
  }, [])

  const computeFieldHash = (value: string, fieldType: string): string => {
    if (!value.trim()) return ''
    const normalized = value.trim().toLowerCase()
    const valueHash = keccak256(stringToBytes(normalized))
    const fieldHashInput = `VerifyENS:${fieldType}:${valueHash}`
    return keccak256(stringToBytes(fieldHashInput))
  }

  React.useEffect(() => {
    if (rawValue.trim()) {
      const computed = computeFieldHash(rawValue, field)
      setFieldHash(computed)
    } else {
      setFieldHash('')
    }
  }, [rawValue, field])

  const [requestId, setRequestId] = useState<string | null>(null)
  const [requestRevealMode, setRequestRevealMode] = useState<string | null>(null)
  const [valueVerified, setValueVerified] = useState(false)
  const [verifyingValue, setVerifyingValue] = useState(false)

  useEffect(() => {
    const requestIdParam = searchParams.get('requestId')
    if (requestIdParam && isConnected && address) {
      setRequestId(requestIdParam)
      fetch(`${API_URL}/api/requests/${requestIdParam}/reveal?verifierAddress=${address}`)
        .then(res => {
          if (res.ok) {
            return res.json().then(data => {
              setSubjectEns(data.verifiedEns)
              setField(data.field)
              setRawValue(data.value)
              setRequestRevealMode('reveal')
              setValueVerified(true)
            })
          } else {
            return fetch(`${API_URL}/api/requests/id/${requestIdParam}`)
              .then(reqRes => {
                if (!reqRes.ok) return null
                return reqRes.json()
              })
              .then(reqData => {
                setSubjectEns(reqData.verifiedEns)
                setField(reqData.field)
                setRequestRevealMode(reqData.revealMode || 'no-reveal')
                setValueVerified(false)
              })
          }
        })
        .catch(err => {
          console.error('Failed to load from request:', err)
        })
    }
  }, [searchParams, isConnected, address])

  const handleVerifyValue = async () => {
    if (!requestId || !rawValue.trim() || !address) return

    setVerifyingValue(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/api/requests/${requestId}/verify-value`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verifierAddress: address,
          typedValue: rawValue,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Value verification failed')
      }

      if (data.matches) {
        setValueVerified(true)
        setSuccess('Value verified! You can now create the attestation.')
        if (data.fieldHash) {
          setFieldHash(data.fieldHash)
        }
      } else {
        throw new Error('Value does not match. Please check and try again.')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify value')
    } finally {
      setVerifyingValue(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (!isConnected || !address) {
        throw new Error('Please connect your wallet')
      }

      if (!ensName) {
        throw new Error('You must own an ENS name to use this verification method. Use "Verify with World ID" button for World ID verification.')
      }

      if (!subjectEns || !rawValue.trim() || !fieldHash) {
        throw new Error('Please fill in all required fields')
      }

      if (requestId && requestRevealMode === 'no-reveal' && !valueVerified) {
        throw new Error('Please verify the value first by clicking "Verify Value" button')
      }

      let currentWalletClient = walletClient
      if (!currentWalletClient && typeof window !== 'undefined' && window.ethereum) {
        await new Promise(resolve => setTimeout(resolve, 500))
        currentWalletClient = walletClient
      }

      let currentChainId: number | undefined
      if (currentWalletClient) {
        currentChainId = await currentWalletClient.getChainId()
      } else {
        currentChainId = chainId
      }
      if (currentChainId !== sepolia.id) {
        if (!currentWalletClient) {
          throw new Error('Wallet client not available. Please refresh the page and try again.')
        }
        
        try {
          try {
            await switchChain({ chainId: sepolia.id })
          } catch (switchErr: any) {
            if (switchErr.message?.includes('rejected') || switchErr.message?.includes('denied') || switchErr.message?.includes('User rejected')) {
              throw new Error('Chain switch was rejected. Please switch to Sepolia testnet manually in MetaMask and try again.')
            }
            throw switchErr
          }
          
          let retries = 0
          const maxRetries = 40
          let switched = false
          
          while (retries < maxRetries && !switched) {
            await new Promise(resolve => setTimeout(resolve, 500))
            try {
              if (!currentWalletClient) {
                currentWalletClient = walletClient
              }
              if (currentWalletClient) {
                const checkChainId = await currentWalletClient.getChainId()
                if (checkChainId === sepolia.id) {
                  switched = true
                  await new Promise(resolve => setTimeout(resolve, 1000))
                  break
                }
              }
            } catch (err) {
            }
            retries++
          }
          
          if (!currentWalletClient) {
            currentWalletClient = walletClient
          }
          if (!currentWalletClient) {
            throw new Error('Wallet client not available. Please refresh the page and try again.')
          }
          
          const finalCheckChainId = await currentWalletClient.getChainId()
          if (finalCheckChainId !== sepolia.id) {
            throw new Error(`Chain switch did not complete. Current chain: ${finalCheckChainId}, Required: ${sepolia.id}. Please switch to Sepolia testnet manually in MetaMask and try again.`)
          }
          
          currentChainId = finalCheckChainId
        } catch (err: any) {
          if (err.message?.includes('rejected') || err.message?.includes('denied')) {
            throw err
          }
          throw new Error(`Failed to switch to Sepolia: ${err.message || 'Unknown error'}. Please switch to Sepolia testnet manually in MetaMask and try again.`)
        }
      }

      if (!currentWalletClient) {
        currentWalletClient = walletClient
      }
      
      let finalChainId: number
      if (currentWalletClient) {
        finalChainId = await currentWalletClient.getChainId()
      } else {
        finalChainId = chainId
      }
      
      if (finalChainId !== sepolia.id) {
        throw new Error(`Wallet is on chain ${finalChainId}, but Sepolia (${sepolia.id}) is required. Please switch to Sepolia testnet and try again.`)
      }
      
      await new Promise(resolve => setTimeout(resolve, 500))

      const valueHashBytes = fieldHash as `0x${string}`

      const expiryTimestamp = expiresAt
        ? BigInt(Math.floor(new Date(expiresAt).getTime() / 1000))
        : BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60)

      let signingChainId = finalChainId
      if (currentWalletClient) {
        signingChainId = await currentWalletClient.getChainId()
      } else {
        signingChainId = chainId
      }
      
      if (signingChainId !== sepolia.id) {
        throw new Error(`Wallet is on chain ${signingChainId}, but Sepolia (${sepolia.id}) is required. Please switch to Sepolia testnet and try again.`)
      }

      const domain = {
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        chainId: signingChainId,
        verifyingContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      }

      const types = {
        Verification: [
          { name: 'verifierAddress', type: 'address' },
          { name: 'verifiedEns', type: 'string' },
          { name: 'field', type: 'string' },
          { name: 'valueHash', type: 'bytes32' },
          { name: 'methodUrl', type: 'string' },
          { name: 'expiresAt', type: 'uint256' },
        ],
      }

      const message = {
        verifierAddress: address,
        verifiedEns: subjectEns,
        field,
        valueHash: valueHashBytes,
        methodUrl: methodUrl || '',
        expiresAt: expiryTimestamp,
      }

      const signature = await signTypedDataAsync({
        domain,
        types,
        primaryType: 'Verification',
        message,
      })

      let attestationUid: string | null = null
      let attestationError: string | null = null

      if (createOnChain) {
        try {
          if (walletClient && typeof window !== 'undefined' && window.ethereum) {
            const currentChainId = await walletClient.getChainId()
            if (currentChainId !== baseSepolia.id) {
              await switchChain({ chainId: baseSepolia.id })
              await new Promise(resolve => setTimeout(resolve, 1000))
            }

            const provider = new BrowserProvider(window.ethereum)
            const signer = await provider.getSigner()

            const EAS_CONTRACT_ADDRESS = '0xC2679fBD37d54388Ce493F1DB75320D236e1815e'
            const eas = new EAS(EAS_CONTRACT_ADDRESS)
            eas.connect(signer)

            const schema = 'string verifiedEns,string field,bytes32 fieldHash,string verifierType,string verifierId,string ensName,string methodUrl'
            const schemaEncoder = new SchemaEncoder(schema)
            const encodedData = schemaEncoder.encodeData([
              { name: 'verifiedEns', value: subjectEns.toLowerCase(), type: 'string' },
              { name: 'field', value: field, type: 'string' },
              { name: 'fieldHash', value: fieldHash, type: 'bytes32' },
              { name: 'verifierType', value: 'ens', type: 'string' },
              { name: 'verifierId', value: address.toLowerCase(), type: 'string' },
              { name: 'ensName', value: ensName || '', type: 'string' },
              { name: 'methodUrl', value: methodUrl || '', type: 'string' },
            ])

            const tx = await eas.attest({
              schema: '',
              data: {
                recipient: '0x0000000000000000000000000000000000000000' as `0x${string}`,
                expirationTime: BigInt(0),
                revocable: true,
                data: encodedData,
              },
            })

            attestationUid = await tx.wait()
            console.log('EAS attestation created:', attestationUid)
          } else {
            attestationError = 'Wallet client not available for on-chain attestation. Verification will be off-chain only.'
          }
        } catch (err: any) {
          console.error('Failed to create EAS attestation:', err)
          attestationError = err.message || 'Failed to create on-chain attestation'
        }
      }

      const response = await fetch(`${API_URL}/api/verifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verifierAddress: address,
          verifiedEns: subjectEns,
          field,
          fieldHash: fieldHash,
          methodUrl: methodUrl || undefined,
          expiresAt: expiresAt || undefined,
          sig: signature,
          attestationUid: attestationUid || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create verification')
      }

      const requestIdParam = searchParams.get('requestId')
      if (requestIdParam) {
        await fetch(`${API_URL}/api/requests/${requestIdParam}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ verifierAddress: address }),
        }).catch(err => console.error('Failed to mark request as completed:', err))
      }

      if (attestationUid) {
        setSuccess('Verification created successfully with on-chain attestation on Base!')
      } else if (attestationError) {
        setSuccess(`Verification created successfully (off-chain only). On-chain attestation failed: ${attestationError}`)
      } else {
        setSuccess('Verification created successfully (off-chain only). You can add on-chain attestation later.')
      }
      
      setSubjectEns('')
      setRawValue('')
      setFieldHash('')
      setMethodUrl('')
      setExpiresAt('')
      setRequestId(null)
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
          <h1 className="text-4xl font-bold mb-8 text-gray-900">Create Verification</h1>
          <p className="text-gray-600">Loading...</p>
        </div>
      </main>
    )
  }

  if (!isConnected) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">Create Verification</h1>
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
          <h1 className="text-4xl font-bold text-gray-900">Create Verification</h1>
          <ConnectButton />
        </div>
        
        <Link href="/" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Search
        </Link>

        {isConnected && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-blue-800">
              <strong>ℹ️ Verification Required:</strong> You must be Worldcoin verified OR own an ENS name to verify ENS fields. 
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
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Field *
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

          <div>
            <label className="block text-sm font-medium mb-1">
              Field Value *
            </label>
            <input
              type="text"
              value={rawValue}
              onChange={(e) => {
                setRawValue(e.target.value)
                if (requestRevealMode === 'no-reveal') {
                  setValueVerified(false)
                }
              }}
              placeholder="Enter the field value to verify"
              className="w-full px-4 py-2 border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              {requestRevealMode === 'no-reveal' 
                ? 'Type the value you want to verify. It will be checked against the user\'s hash.'
                : 'Enter the actual value (e.g., name, DOB, passport ID). It will be normalized and hashed.'}
            </p>
            {requestId && requestRevealMode === 'no-reveal' && !valueVerified && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={handleVerifyValue}
                  disabled={verifyingValue || !rawValue.trim()}
                  className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {verifyingValue ? 'Verifying...' : 'Verify Value'}
                </button>
              </div>
            )}
            {requestRevealMode === 'no-reveal' && valueVerified && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                ✅ Value verified! You can now create the attestation.
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Computed Field Hash
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={fieldHash}
                readOnly
                placeholder="Hash will appear here..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded font-mono text-sm bg-gray-50 text-gray-900 placeholder-gray-500"
              />
              {fieldHash && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(fieldHash)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Method URL (optional)
            </label>
            <input
              type="url"
              value={methodUrl}
              onChange={(e) => setMethodUrl(e.target.value)}
              placeholder="https://example.com/verification-process"
              className="w-full px-4 py-2 border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Expires At (optional, defaults to 1 year)
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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

          <div className="p-4 bg-blue-50 rounded border border-blue-200">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={createOnChain}
                onChange={(e) => setCreateOnChain(e.target.checked)}
                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-blue-900">Create On-Chain Attestation on Base</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
                    Recommended
                  </span>
                </div>
                <p className="text-sm text-blue-800">
                  ✅ Permanent, verifiable proof on Base blockchain<br/>
                  ❌ Skip: Off-chain only (faster, no gas fees)
                </p>
              </div>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !ensName || (requestRevealMode === 'no-reveal' && !valueVerified)}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing & Submitting...' : 'Attest with ENS'}
          </button>
        </form>

        {WORLDCOIN_APP_ID && WORLDCOIN_APP_ID !== 'app_staging_...' && (
          <div className="mt-8 p-6 border-t border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Or Verify with World ID</h3>
            <p className="text-sm text-gray-600 mb-4">
              <strong>World ID users (individuals):</strong> If you're verified with World ID, you can verify ENS fields without needing an ENS name yourself.
            </p>
            
            {!subjectEns || !fieldHash ? (
              <p className="text-sm text-gray-500 italic">
                Please enter Subject ENS and compute fieldHash above first.
              </p>
            ) : (
              <>
                <div className="mb-4 p-4 bg-blue-50 rounded border border-blue-200">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createOnChain}
                      onChange={(e) => setCreateOnChain(e.target.checked)}
                      className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-blue-900">Create On-Chain Attestation on Base</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
                          Recommended
                        </span>
                      </div>
                      <p className="text-sm text-blue-800">
                        ✅ Permanent, verifiable proof on Base blockchain<br/>
                        ❌ Skip: Off-chain only (faster, no gas fees)
                      </p>
                    </div>
                  </label>
                </div>
                <IDKitWidget
                  app_id={WORLDCOIN_APP_ID}
                  action="verify-ens"
                  signal={`${subjectEns}:${fieldHash}`}
                  verification_level={VerificationLevel.Orb}
                  onSuccess={async (proof) => {
                    setWorldVerifying(true)
                    setError('')
                    
                    try {
                      let attestationUid: string | null = null
                      let attestationError: string | null = null

                      if (createOnChain && walletClient && typeof window !== 'undefined' && window.ethereum) {
                        try {
                          const currentChainId = await walletClient.getChainId()
                          if (currentChainId !== baseSepolia.id) {
                            await switchChain({ chainId: baseSepolia.id })
                            await new Promise(resolve => setTimeout(resolve, 1000))
                          }

                          const provider = new BrowserProvider(window.ethereum)
                          const signer = await provider.getSigner()

                          const EAS_CONTRACT_ADDRESS = '0xC2679fBD37d54388Ce493F1DB75320D236e1815e'
                          const eas = new EAS(EAS_CONTRACT_ADDRESS)
                          eas.connect(signer)

                          const schema = 'string verifiedEns,string field,bytes32 fieldHash,string verifierType,string verifierId,string ensName,string methodUrl'
                          const schemaEncoder = new SchemaEncoder(schema)
                          const encodedData = schemaEncoder.encodeData([
                            { name: 'verifiedEns', value: subjectEns.toLowerCase(), type: 'string' },
                            { name: 'field', value: field, type: 'string' },
                            { name: 'fieldHash', value: fieldHash, type: 'bytes32' },
                            { name: 'verifierType', value: 'world', type: 'string' },
                            { name: 'verifierId', value: proof.nullifier_hash, type: 'string' },
                            { name: 'ensName', value: '', type: 'string' },
                            { name: 'methodUrl', value: methodUrl || '', type: 'string' },
                          ])

                          const tx = await eas.attest({
                            schema: '',
                            data: {
                              recipient: '0x0000000000000000000000000000000000000000' as `0x${string}`,
                              expirationTime: BigInt(0),
                              revocable: true,
                              data: encodedData,
                            },
                          })

                          attestationUid = await tx.wait()
                        } catch (err: any) {
                          console.error('Failed to create EAS attestation:', err)
                          attestationError = err.message || 'Failed to create on-chain attestation'
                        }
                      }

                      const response = await fetch(`${API_URL}/verify/world`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          verifiedEns: subjectEns,
                          field,
                          fieldHash,
                          worldProof: {
                            merkleRoot: proof.merkle_root,
                            nullifierHash: proof.nullifier_hash,
                            proof: proof.proof,
                            signal: proof.signal || `${subjectEns}:${fieldHash}`,
                          },
                          methodUrl: methodUrl || undefined,
                          attestationUid: attestationUid || undefined,
                        }),
                      })

                      if (!response.ok) {
                        const data = await response.json()
                        throw new Error(data.error || 'Verification failed')
                      }

                      if (attestationUid) {
                        setSuccess('Successfully verified with World ID and created on-chain attestation on Base!')
                      } else if (attestationError) {
                        setSuccess(`Successfully verified with World ID (off-chain only). On-chain attestation failed: ${attestationError}`)
                      } else {
                        setSuccess('Successfully verified with World ID (off-chain only). You can add on-chain attestation later.')
                      }
                      setSubjectEns('')
                      setRawValue('')
                      setFieldHash('')
                    } catch (err: any) {
                      setError(err.message || 'Failed to verify with World ID')
                    } finally {
                      setWorldVerifying(false)
                    }
                  }}
                  enableTelemetry={false}
                >
                  {({ open }) => (
                    <button
                      type="button"
                      onClick={open}
                      disabled={worldVerifying}
                      className="w-full px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {worldVerifying ? 'Verifying...' : 'Verify with World ID'}
                    </button>
                  )}
                </IDKitWidget>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

