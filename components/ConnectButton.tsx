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
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end">
          {ensLoading ? (
            <span className="text-xs text-gray-500">Loading ENS...</span>
          ) : ensName ? (
            <span className="text-sm font-semibold text-gray-900">{ensName}</span>
          ) : (
            <span className="text-xs text-red-600 font-semibold">No ENS name</span>
          )}
          <span className="text-xs text-gray-500">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <WorldcoinButton />
          <button
            onClick={() => disconnect()}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
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
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Connect {connector.name}
        </button>
      ))}
    </div>
  )
}

