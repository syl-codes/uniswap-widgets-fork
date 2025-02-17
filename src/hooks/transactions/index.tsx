import { TransactionReceipt } from '@ethersproject/abstract-provider'
import { Token } from '@uniswap/sdk-core'
import { useWeb3React } from '@web3-react/core'
import { useAtomValue, useUpdateAtom } from 'jotai/utils'
import ms from 'ms.macro'
import { useCallback, useEffect, useRef } from 'react'
import { Transaction, TransactionInfo, transactionsAtom, TransactionType } from 'state/transactions'
import invariant from 'tiny-invariant'

import useBlockNumber from '../useBlockNumber'
import Updater from './updater'

function isTransactionRecent(transaction: Transaction) {
  return Date.now() - transaction.addedTime < ms`1d`
}

export function usePendingTransactions() {
  const { chainId } = useWeb3React()
  const txs = useAtomValue(transactionsAtom)
  return (chainId ? txs[chainId] : null) ?? {}
}

export function useAddTransactionInfo() {
  const { chainId } = useWeb3React()
  const blockNumber = useBlockNumber()
  const updateTxs = useUpdateAtom(transactionsAtom)

  return useCallback(
    (info: TransactionInfo) => {
      invariant(chainId)
      const txChainId = chainId
      const { hash } = info.response

      updateTxs((chainTxs) => {
        const txs = chainTxs[txChainId] || {}
        txs[hash] = { addedTime: new Date().getTime(), lastCheckedBlockNumber: blockNumber, info }
        chainTxs[chainId] = txs
      })
    },
    [blockNumber, chainId, updateTxs]
  )
}

/** Returns the hash of a pending approval transaction, if it exists. */
export function usePendingApproval(token?: Token, spender?: string): string | undefined {
  const { chainId } = useWeb3React()
  const txs = useAtomValue(transactionsAtom)
  if (!chainId || !token || !spender) return undefined

  const chainTxs = txs[chainId]
  if (!chainTxs) return undefined

  return Object.values(chainTxs).find(
    (tx) =>
      tx &&
      tx.receipt === undefined &&
      tx.info.type === TransactionType.APPROVAL &&
      tx.info.tokenAddress === token.address &&
      tx.info.spenderAddress === spender &&
      isTransactionRecent(tx)
  )?.info.response.hash
}

export interface TransactionEventHandlers {
  onTxSubmit?: (txHash: string, tx: Transaction) => void
  onTxSuccess?: (txHash: string, receipt: TransactionReceipt) => void
  onTxFail?: (error: Error, receipt: TransactionReceipt) => void
}

export function TransactionsUpdater({ onTxSubmit, onTxSuccess, onTxFail }: TransactionEventHandlers) {
  const currentPendingTxs = usePendingTransactions()
  const updateTxs = useUpdateAtom(transactionsAtom)
  const onCheck = useCallback(
    ({ chainId, hash, blockNumber }) => {
      updateTxs((txs) => {
        const tx = txs[chainId]?.[hash]
        if (tx) {
          tx.lastCheckedBlockNumber = tx.lastCheckedBlockNumber
            ? Math.max(tx.lastCheckedBlockNumber, blockNumber)
            : blockNumber
        }
      })
    },
    [updateTxs]
  )
  const onReceipt = useCallback(
    ({ chainId, hash, receipt }) => {
      updateTxs((txs) => {
        const tx = txs[chainId]?.[hash]
        if (tx) {
          tx.receipt = receipt
        }
      })
      if (receipt?.status === 0) {
        onTxFail?.(new Error('Transaction failed'), receipt)
      } else {
        onTxSuccess?.(receipt.transactionHash, receipt)
      }
    },
    [updateTxs, onTxFail, onTxSuccess]
  )

  const oldPendingTxs = useRef({})
  useEffect(() => {
    const newPendingTxHashes = Object.keys(currentPendingTxs)
    const oldPendingTxHashes = new Set(Object.keys(oldPendingTxs.current))
    if (newPendingTxHashes.length !== oldPendingTxHashes.size) {
      // if added new tx
      newPendingTxHashes.forEach((txHash) => {
        if (!oldPendingTxHashes.has(txHash)) {
          onTxSubmit?.(txHash, currentPendingTxs[txHash])
        }
      })
      oldPendingTxs.current = currentPendingTxs
    }
  }, [currentPendingTxs, onTxSubmit])

  return <Updater pendingTransactions={currentPendingTxs} onCheck={onCheck} onReceipt={onReceipt} />
}
