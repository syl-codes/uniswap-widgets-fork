import { JsonRpcProvider } from '@ethersproject/providers'
import { skipToken } from '@reduxjs/toolkit/query/react'
import { Currency, CurrencyAmount, TradeType } from '@uniswap/sdk-core'
// Importing just the type, so smart-order-router is lazy-loaded
// eslint-disable-next-line no-restricted-imports
import type { ChainId } from '@uniswap/smart-order-router'
import { useWeb3React } from '@web3-react/core'
import { useRouterArguments } from 'hooks/routing/useRouterArguments'
import useDebounce from 'hooks/useDebounce'
import useIsValidBlock from 'hooks/useIsValidBlock'
import useIsWindowVisible from 'hooks/useIsWindowVisible'
import { useStablecoinAmountFromFiatValue } from 'hooks/useStablecoinAmountFromFiatValue'
import ms from 'ms.macro'
import { useMemo } from 'react'
import { useGetQuoteQuery } from 'state/routing/slice'
import { GetQuoteResult, InterfaceTrade, TradeState } from 'state/routing/types'
import { computeRoutes, transformRoutesToTrade } from 'state/routing/utils'

import { isAutoRouterSupportedChain } from './clientSideSmartOrderRouter'

export const INVALID_TRADE = { state: TradeState.INVALID, trade: undefined }

/**
 * Returns the best trade by invoking the routing api or the smart order router on the client
 * @param tradeType whether the swap is an exact in/out
 * @param routerUrl the base URL of the integrator's auto router API
 * @param amountSpecified the exact amount to swap in/out
 * @param otherCurrency the desired output/payment currency
 */
export function useRouterTrade<TTradeType extends TradeType>(
  tradeType: TTradeType,
  routerUrl?: string,
  amountSpecified?: CurrencyAmount<Currency>,
  otherCurrency?: Currency
): {
  state: TradeState
  trade: InterfaceTrade<Currency, Currency, TTradeType> | undefined
} {
  const { chainId, provider } = useWeb3React()
  const autoRouterSupported = isAutoRouterSupportedChain(chainId)
  const isWindowVisible = useIsWindowVisible()
  // Debounce is used to prevent excessive requests to SOR, as it is data intensive.
  // Fast user actions (ie updating the input) should be debounced, but currency changes should not.
  const [debouncedAmount, debouncedOtherCurrency] = useDebounce(
    useMemo(() => [amountSpecified, otherCurrency], [amountSpecified, otherCurrency]),
    200
  )
  const isDebouncing = amountSpecified !== debouncedAmount && otherCurrency === debouncedOtherCurrency
  const debouncedAmountSpecified = autoRouterSupported && isWindowVisible ? debouncedAmount : undefined

  const [currencyIn, currencyOut]: [Currency | undefined, Currency | undefined] = useMemo(
    () =>
      tradeType === TradeType.EXACT_INPUT
        ? [debouncedAmountSpecified?.currency, debouncedOtherCurrency]
        : [debouncedOtherCurrency, debouncedAmountSpecified?.currency],
    [debouncedAmountSpecified, debouncedOtherCurrency, tradeType]
  )

  const currencyChainId = currencyIn?.chainId as ChainId
  if (currencyChainId && !isAutoRouterSupportedChain(currencyChainId)) {
    throw new Error(`Router does not support this token's chain (chainId: ${currencyChainId}).`)
  }

  const queryArgs = useRouterArguments({
    tokenIn: currencyIn,
    tokenOut: currencyOut,
    amount: debouncedAmountSpecified,
    tradeType,
    routerUrl,
    provider: provider as JsonRpcProvider,
  })

  const { isError, data, currentData } = useGetQuoteQuery(queryArgs ?? skipToken, {
    pollingInterval: ms`15s`,
    refetchOnFocus: true,
  })

  const quoteResult: GetQuoteResult | undefined = useIsValidBlock(Number(data?.blockNumber) || 0) ? data : undefined

  const route = useMemo(
    () => computeRoutes(currencyIn, currencyOut, tradeType, quoteResult),
    [currencyIn, currencyOut, quoteResult, tradeType]
  )

  // get USD gas cost of trade in active chains stablecoin amount
  const gasUseEstimateUSD = useStablecoinAmountFromFiatValue(quoteResult?.gasUseEstimateUSD) ?? null

  const isSyncing = currentData !== data

  const trade = useMemo(() => {
    if (!route) return
    try {
      return transformRoutesToTrade(route, tradeType, gasUseEstimateUSD)
    } catch (e: unknown) {
      console.debug('transformRoutesToTrade failed: ', e)
      return
    }
  }, [gasUseEstimateUSD, route, tradeType])

  return useMemo(() => {
    if (!currencyIn || !currencyOut) return INVALID_TRADE

    if (!trade && !isError) {
      return { state: isDebouncing ? TradeState.SYNCING : TradeState.LOADING, trade: undefined }
    }

    let otherAmount = undefined
    if (quoteResult) {
      otherAmount = CurrencyAmount.fromRawAmount(
        tradeType === TradeType.EXACT_INPUT ? currencyOut : currencyIn,
        quoteResult.quote
      )
    }

    if (isError || !otherAmount || !route || route.length === 0 || !queryArgs) {
      return {
        state: TradeState.NO_ROUTE_FOUND,
        trade: undefined,
      }
    }

    if (trade) {
      return { state: isSyncing ? TradeState.SYNCING : TradeState.VALID, trade }
    }
    return INVALID_TRADE
  }, [currencyIn, currencyOut, quoteResult, trade, tradeType, isError, route, queryArgs, isDebouncing, isSyncing])
}
