'use client'

import { WagmiProvider, createConfig, http } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { baseSepolia } from 'wagmi/chains'
import { metaMask } from '@wagmi/connectors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { CDPReactProvider } from '@coinbase/cdp-react'

// Create config with conditional MetaMask connector to avoid SSR issues
function createWagmiConfig() {
  const connectors = typeof window !== 'undefined' 
    ? [
        metaMask({
          dAppMetadata: {
            name: 'AskMe',
            url: window.location.origin,
          },
        }),
      ]
    : []

  return createConfig({
    chains: [sepolia, baseSepolia],
    connectors,
    transports: {
      [sepolia.id]: http(),
      [baseSepolia.id]: http(),
    },
  })
}

const wagmiConfig = createWagmiConfig()

// Get CDP project ID from environment variable
const CDP_PROJECT_ID = process.env.NEXT_PUBLIC_CDP_PROJECT_ID || ''

// CDP configuration - always provide config, but use empty string if not configured
// This allows hooks to work but CDP features will be disabled
const cdpConfig = {
  projectId: CDP_PROJECT_ID,
  appName: 'AskMe',
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <CDPReactProvider config={cdpConfig}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    </CDPReactProvider>
  )
}

