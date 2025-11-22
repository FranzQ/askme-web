'use client'

import { useAccount, useConnect, useDisconnect, useEnsName } from 'wagmi'
import { WorldcoinButton } from './WorldcoinButton'

export function ConnectButton() {
  const { address, isConnected } = useAccount()
  const { data: ensName, isLoading: ensLoading } = useEnsName({ 
    address: address as `0x${string}` | undefined,
    chainId: 11155111 // Sepolia
  })
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected) {
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
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <WorldcoinButton />
          <button
            onClick={() => disconnect()}
            className="px-4 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      {connectors.map((connector) => (
        <button
          key={connector.uid}
          onClick={() => connect({ connector })}
          className="px-6 py-2.5 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Connect {connector.name}
        </button>
      ))}
    </div>
  )
}

