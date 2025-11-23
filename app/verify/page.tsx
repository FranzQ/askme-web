'use client'

import { useState, useEffect } from 'react'
import React from 'react'
import { useAccount, useSignTypedData, useEnsName, useSwitchChain, useWalletClient, useChainId } from 'wagmi'
import { keccak256, isHexString } from 'viem'
import { stringToBytes } from 'viem/utils'
import { baseSepolia, sepolia } from 'wagmi/chains'
import { useSearchParams } from 'next/navigation'
import { IDKitWidget, VerificationLevel } from '@worldcoin/idkit'
import { EAS, SchemaEncoder, SchemaRegistry } from '@ethereum-attestation-service/eas-sdk'
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
              // Compute fieldHash from the revealed value
              if (data.value) {
                const computedHash = computeFieldHash(data.value, data.field)
                setFieldHash(computedHash)
              }
            }).catch(err => {
              console.error('Error parsing reveal response:', err)
            })
          } else {
            // Silently handle 400/404 - request might not be approved yet or not reveal mode
            // This is expected behavior, don't show error
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

      // Switch to Base Sepolia for signing (same chain as EAS attestation, server accepts both)
      let currentChainId: number | undefined
      if (currentWalletClient) {
        currentChainId = await currentWalletClient.getChainId()
      } else {
        currentChainId = chainId
      }
      
      if (currentChainId !== baseSepolia.id) {
        if (!currentWalletClient) {
          throw new Error('Wallet client not available. Please refresh the page and try again.')
        }
        
        try {
          await switchChain({ chainId: baseSepolia.id })
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          // Verify the switch
          currentChainId = await currentWalletClient.getChainId()
          if (currentChainId !== baseSepolia.id) {
            throw new Error('Failed to switch to Base Sepolia. Please switch manually in your wallet.')
          }
        } catch (err: any) {
          if (err.message?.includes('rejected') || err.message?.includes('denied')) {
            throw new Error('Chain switch was rejected. Please switch to Base Sepolia manually in MetaMask and try again.')
          }
          throw new Error(`Failed to switch to Base Sepolia: ${err.message || 'Unknown error'}. Please switch manually and try again.`)
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
      
      if (finalChainId !== baseSepolia.id) {
        throw new Error(`Wallet is on chain ${finalChainId}, but Base Sepolia (${baseSepolia.id}) is required. Please switch to Base Sepolia and try again.`)
      }
      
      await new Promise(resolve => setTimeout(resolve, 500))

      // Ensure fieldHash is set before signing
      if (!fieldHash || fieldHash === '') {
        if (rawValue) {
          const computedHash = computeFieldHash(rawValue, field)
          setFieldHash(computedHash)
          // Use computed hash for signing
          var valueHashBytes = computedHash as `0x${string}`
        } else {
          throw new Error('Field hash is required. Please verify the field value first.')
        }
      } else {
        var valueHashBytes = fieldHash as `0x${string}`
      }

      // Ensure fieldHash is a valid hex string
      if (!valueHashBytes.startsWith('0x') || valueHashBytes.length !== 66) {
        throw new Error(`Invalid fieldHash format: ${valueHashBytes}. Expected 0x-prefixed 64-character hex string.`)
      }

      const expiryTimestamp = expiresAt
        ? BigInt(Math.floor(new Date(expiresAt).getTime() / 1000))
        : BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60)

      // Use Base Sepolia for signature (same chain as EAS attestation, server accepts both)
      const signatureChainId = baseSepolia.id
      
      const domain = {
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        chainId: signatureChainId, // Use Base Sepolia
        verifyingContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      }

      console.log('Signing with domain:', { ...domain, chainId: signatureChainId })
      console.log('Current wallet chainId:', finalChainId)

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

      console.log('Signing message:', message)

      const signature = await signTypedDataAsync({
        domain,
        types,
        primaryType: 'Verification',
        message,
      })
      
      console.log('Signature created:', signature)

      let attestationUid: string | null = null
      let attestationError: string | null = null

      if (createOnChain) {
        try {
          if (walletClient && typeof window !== 'undefined' && window.ethereum) {
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
                attestationError = `Failed to switch to Base Sepolia: ${switchError.message || switchError}`
                throw new Error(attestationError)
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

            // Ensure all required fields are set
            if (!ensName || ensName.trim() === '') {
              throw new Error('ENS name is required for EAS attestation. Please ensure your wallet is connected and you own an ENS name.')
            }

            if (!subjectEns || subjectEns.trim() === '') {
              throw new Error('Subject ENS name is required for EAS attestation')
            }

            if (!field || field.trim() === '') {
              throw new Error('Field is required for EAS attestation')
            }

            if (!valueHashBytes || valueHashBytes === '0x' || valueHashBytes.length !== 66) {
              throw new Error('Invalid fieldHash for EAS attestation')
            }

            if (!address || address.trim() === '') {
              throw new Error('Wallet address is required for EAS attestation')
            }

            // Prepare all values with defaults to avoid empty strings
            const attestationData = {
              verifiedEns: subjectEns.toLowerCase().trim(),
              field: field.trim(),
              fieldHash: valueHashBytes as `0x${string}`,
              verifierType: 'ens',
              verifierId: address.toLowerCase().trim(),
              ensName: ensName.trim(),
              methodUrl: (methodUrl && methodUrl.trim()) || 'https://askme.eth',
            }

            // Final validation - ensure no empty strings
            if (!attestationData.verifiedEns || !attestationData.field || !attestationData.fieldHash || 
                !attestationData.verifierId || !attestationData.ensName || !attestationData.methodUrl) {
              console.error('Validation failed - missing fields:', attestationData)
              throw new Error('Missing required fields for EAS attestation')
            }

            console.log('EAS attestation data:', attestationData)

            // Log each field before encoding to debug
            console.log('Encoding EAS data with values:', {
              verifiedEns: attestationData.verifiedEns,
              field: attestationData.field,
              fieldHash: attestationData.fieldHash,
              verifierType: attestationData.verifierType,
              verifierId: attestationData.verifierId,
              ensName: attestationData.ensName,
              methodUrl: attestationData.methodUrl,
            })

            const schema = 'string verifiedEns,string field,bytes32 fieldHash,string verifierType,string verifierId,string ensName,string methodUrl'
            const schemaEncoder = new SchemaEncoder(schema)
            
            let encodedData: string
            try {
              encodedData = schemaEncoder.encodeData([
                { name: 'verifiedEns', value: attestationData.verifiedEns, type: 'string' },
                { name: 'field', value: attestationData.field, type: 'string' },
                { name: 'fieldHash', value: attestationData.fieldHash, type: 'bytes32' },
                { name: 'verifierType', value: attestationData.verifierType, type: 'string' },
                { name: 'verifierId', value: attestationData.verifierId, type: 'string' },
                { name: 'ensName', value: attestationData.ensName, type: 'string' },
                { name: 'methodUrl', value: attestationData.methodUrl, type: 'string' },
              ])
              console.log('EAS data encoded successfully')
            } catch (encodeError: any) {
              console.error('Error encoding EAS data:', encodeError)
              console.error('Field values that failed:', attestationData)
              throw new Error(`Failed to encode EAS data: ${encodeError.message}`)
            }

            // Register schema on-chain first, then use it for attestations
            // Schema Registry address on Base Sepolia
            const SCHEMA_REGISTRY_ADDRESS = '0x4200000000000000000000000000000000000020'
            const schemaRegistry = new SchemaRegistry(SCHEMA_REGISTRY_ADDRESS)
            schemaRegistry.connect(signer)

            // Register the schema (idempotent - will return existing schema if already registered)
            let schemaUid: string
            try {
              const schemaTx = await schemaRegistry.register({
                schema: schema,
                resolverAddress: '0x0000000000000000000000000000000000000000' as `0x${string}`, // No resolver for off-chain data
                revocable: true,
              })
              schemaUid = await schemaTx.wait()
              console.log('Schema registered:', schemaUid)
            } catch (registerError: any) {
              // If schema already exists, get the UID from the error or try to fetch it
              console.warn('Schema registration error (may already exist):', registerError)
              // Calculate schema UID from the schema string
              const { keccak256, toUtf8Bytes } = await import('ethers')
              schemaUid = keccak256(toUtf8Bytes(schema))
              console.log('Using calculated schema UID:', schemaUid)
            }
            
            // Use the registered schema for on-chain attestation
            const tx = await eas.attest({
              schema: schemaUid as `0x${string}`,
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
          expiresAt: expiryTimestamp.toString(), // Send the actual BigInt timestamp that was signed
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
          </div>

          <div>
            <label className="block text-base font-medium mb-2 text-black">
              Field *
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

          <div>
            <label className="block text-base font-medium mb-2 text-black">
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
              className="w-full px-5 py-3.5 border border-gray-300 bg-white text-base text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all"
              required
            />
            <p className="text-sm text-gray-600 mt-2">
              {requestRevealMode === 'no-reveal' 
                ? 'Type the value you want to verify. It will be checked against the user\'s hash.'
                : 'Enter the actual value (e.g., name, DOB, passport ID). It will be normalized and hashed.'}
            </p>
            {requestId && requestRevealMode === 'no-reveal' && !valueVerified && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleVerifyValue}
                  disabled={verifyingValue || !rawValue.trim()}
                  className="px-5 py-2.5 bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {verifyingValue ? 'Verifying...' : 'Verify Value'}
                </button>
              </div>
            )}
            {requestRevealMode === 'no-reveal' && valueVerified && (
              <div className="mt-3 p-4 bg-green-50 border border-green-200 text-sm text-green-900">
                ✅ Value verified! You can now create the attestation.
              </div>
            )}
          </div>

          <div>
            <label className="block text-base font-medium mb-2 text-black">
              Computed Field Hash
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={fieldHash}
                readOnly
                placeholder="Hash will appear here..."
                className="flex-1 px-5 py-3.5 border border-gray-300 font-mono text-sm bg-gray-50 text-black placeholder-gray-400"
              />
              {fieldHash && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(fieldHash)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="px-5 py-3.5 bg-gray-200 hover:bg-gray-300 text-sm font-medium transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-base font-medium mb-2 text-black">
              Method URL (optional)
            </label>
            <input
              type="url"
              value={methodUrl}
              onChange={(e) => setMethodUrl(e.target.value)}
              placeholder="https://example.com/verification-process"
              className="w-full px-5 py-3.5 border border-gray-300 bg-white text-base text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all"
            />
          </div>

          <div>
            <label className="block text-base font-medium mb-2 text-black">
              Expires At (optional, defaults to 1 year)
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-5 py-3.5 border border-gray-300 bg-white text-base text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all"
            />
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

          <div className="p-5 bg-blue-50 border border-blue-200">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={createOnChain}
                onChange={(e) => setCreateOnChain(e.target.checked)}
                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 focus:ring-black"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-blue-900">Create On-Chain Attestation on Base</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-900 border border-purple-200 text-xs font-medium">
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
            className="w-full px-6 py-3.5 bg-black text-white text-base font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing & Submitting...' : 'Attest with ENS'}
          </button>
        </form>

        {WORLDCOIN_APP_ID && WORLDCOIN_APP_ID !== 'app_staging_...' && (
          <div className="mt-12 pt-12 border-t border-gray-200">
            <h3 className="text-2xl font-bold mb-4 text-black">Or Verify with World ID</h3>
            <p className="text-base text-gray-700 mb-6">
              <strong>World ID users (individuals):</strong> If you're verified with World ID, you can verify ENS fields without needing an ENS name yourself.
            </p>
            
            {!subjectEns || !fieldHash ? (
              <p className="text-base text-gray-600 italic">
                Please enter Subject ENS and compute fieldHash above first.
              </p>
            ) : (
              <>
                <div className="mb-6 p-5 bg-blue-50 border border-blue-200">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createOnChain}
                      onChange={(e) => setCreateOnChain(e.target.checked)}
                      className="mt-1 w-4 h-4 text-blue-600 border-gray-300 focus:ring-black"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-blue-900">Create On-Chain Attestation on Base</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-900 border border-purple-200 text-xs font-medium">
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

                          // EAS Contract Address on Base Sepolia
                          // Official address from: https://github.com/ethereum-attestation-service/eas-contracts
                          const EAS_CONTRACT_ADDRESS = '0x4200000000000000000000000000000000000021'
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
                      className="w-full px-6 py-3.5 bg-amber-600 text-white text-base font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
  )
}

