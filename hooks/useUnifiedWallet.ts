'use client'

import { useAccount } from 'wagmi'
import { useIsSignedIn, useEvmAddress } from '@coinbase/cdp-hooks'

/**
 * Unified wallet hook that works with both wagmi (MetaMask) and CDP Embedded Wallets
 * This ensures the app works seamlessly regardless of which wallet connection method is used
 * Note: CDP hooks will only work if CDPReactProvider is present in the component tree
 */
export function useUnifiedWallet() {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount()
  
  // CDP hooks - will return default values if provider is not present
  const { isSignedIn: cdpAuthenticated } = useIsSignedIn()
  const { evmAddress: cdpAddress } = useEvmAddress()

  // Prefer CDP address if available, otherwise use wagmi address
  const address = cdpAddress || wagmiAddress
  const isConnected = cdpAuthenticated || wagmiConnected
  const walletType = cdpAuthenticated ? 'cdp' : (wagmiConnected ? 'wagmi' : null)

  return {
    address: address as `0x${string}` | undefined,
    isConnected,
    walletType,
    isCDP: cdpAuthenticated,
    isWagmi: wagmiConnected,
  }
}

