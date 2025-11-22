'use client'

import { WagmiProvider, createConfig, http } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { baseSepolia } from 'wagmi/chains'
import { metaMask } from '@wagmi/connectors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

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

const config = createWagmiConfig()

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}

