'use client'

import { useConnect, useDisconnect, useEnsName } from 'wagmi'
import { WorldcoinButton } from './WorldcoinButton'
import { useSignInWithEmail, useSignOut } from '@coinbase/cdp-hooks'
import { SignInModal } from '@coinbase/cdp-react'
import { useState } from 'react'
import { useUnifiedWallet } from '@/hooks/useUnifiedWallet'

const CDP_PROJECT_ID = process.env.NEXT_PUBLIC_CDP_PROJECT_ID || ''

export function ConnectButton() {
  const { address: activeAddress, isConnected: activeIsConnected, isCDP: isCDPAuthenticated } = useUnifiedWallet()
  const { data: ensName, isLoading: ensLoading } = useEnsName({ 
    address: activeAddress,
    chainId: 11155111 // Sepolia
  })
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  
  // CDP Embedded Wallet hooks
  const { signOut: cdpSignOut } = useSignOut()
  const [showWalletOptions, setShowWalletOptions] = useState(false)
  const [showCDPSignIn, setShowCDPSignIn] = useState(false)

  const handleCDPConnect = () => {
    if (!CDP_PROJECT_ID) {
      alert('CDP Project ID not configured. Please set NEXT_PUBLIC_CDP_PROJECT_ID in your environment variables.')
      return
    }
    setShowCDPSignIn(true)
    setShowWalletOptions(false)
  }

  const handleDisconnect = async () => {
    if (isCDPAuthenticated) {
      await cdpSignOut()
    } else {
      disconnect()
    }
  }

  if (activeIsConnected) {
    return (
      <div className="flex flex-col items-end gap-3">
        <div className="flex flex-col items-end">
          {ensLoading ? (
            <span className="text-sm text-gray-500">Loading ENS...</span>
          ) : ensName ? (
            <span className="text-base font-semibold text-black">{ensName}</span>
          ) : (
            <span className="text-sm text-red-600 font-medium">No ENS name</span>
          )}
          <span className="text-xs text-gray-500 font-mono mt-1">
            {activeAddress?.slice(0, 6)}...{activeAddress?.slice(-4)}
          </span>
          {isCDPAuthenticated && (
            <span className="text-xs text-blue-600 font-medium mt-1">
              CDP Embedded Wallet
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <WorldcoinButton />
          <button
            onClick={handleDisconnect}
            className="px-4 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  if (showWalletOptions) {
    const metaMaskConnector = connectors.find(c => c.id === 'metaMask' || c.name === 'MetaMask')
    
    return (
      <div className="flex flex-col items-end gap-2">
        <button
          onClick={() => setShowWalletOptions(false)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          ← Back
        </button>
        <div className="flex flex-col gap-2">
          {metaMaskConnector && (
            <button
              onClick={() => {
                connect({ connector: metaMaskConnector })
                setShowWalletOptions(false)
              }}
              className="px-6 py-2.5 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Connect MetaMask
            </button>
          )}
          {CDP_PROJECT_ID && (
            <button
              onClick={handleCDPConnect}
              className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Connect with Email (CDP)
            </button>
          )}
        </div>
        {!CDP_PROJECT_ID && (
          <p className="text-xs text-gray-500 mt-1">
            CDP Embedded Wallet not configured
          </p>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowWalletOptions(true)}
        className="px-6 py-2.5 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
      >
        Connect Wallet
      </button>
      {showCDPSignIn && CDP_PROJECT_ID && (
        <SignInModal
          isOpen={showCDPSignIn}
          onClose={() => setShowCDPSignIn(false)}
        />
      )}
    </>
  )
}

