import { TradeType } from '@uniswap/sdk-core'
import { SupportedChainId } from 'constants/chains'
import { DAI, UNI, USDC_MAINNET } from 'constants/tokens'
import { useAtomValue } from 'jotai/utils'
import { controlledAtom, Field, stateAtom, Swap, swapAtom, swapEventHandlersAtom } from 'state/swap'
import { renderHook } from 'test'

import { useSwapAmount, useSwapCurrency, useSwitchSwapCurrencies } from './'

const DAI_MAINNET = DAI
const UNI_MAINNET = UNI[SupportedChainId.MAINNET]

const INITIAL_SWAP: Swap = {
  independentField: Field.INPUT,
  amount: '42',
  [Field.INPUT]: DAI_MAINNET,
  [Field.OUTPUT]: USDC_MAINNET,
}

describe('swap state', () => {
  describe('useSwitchSwapCurrencies', () => {
    const SWITCHED_SWAP = {
      amount: INITIAL_SWAP.amount,
      type: TradeType.EXACT_OUTPUT,
      inputToken: INITIAL_SWAP[Field.OUTPUT],
      outputToken: INITIAL_SWAP[Field.INPUT],
    }

    it('swaps currencies', () => {
      const spy = jest.fn()
      const { rerender } = renderHook(
        () => {
          const switchSwapCurrencies = useSwitchSwapCurrencies()
          switchSwapCurrencies()
        },
        {
          initialAtomValues: [
            [stateAtom, INITIAL_SWAP],
            [swapEventHandlersAtom, { onSwitchTokens: spy }],
          ],
        }
      )
      expect(spy).toHaveBeenCalledWith(SWITCHED_SWAP)

      const { result } = rerender(() => useAtomValue(swapAtom))
      expect(result.current).toMatchObject({
        ...INITIAL_SWAP,
        independentField: Field.OUTPUT,
        [Field.INPUT]: INITIAL_SWAP[Field.OUTPUT],
        [Field.OUTPUT]: INITIAL_SWAP[Field.INPUT],
      })
    })

    it('does not swap if controlled', () => {
      const spy = jest.fn()
      const { rerender } = renderHook(
        () => {
          const switchSwapCurrencies = useSwitchSwapCurrencies()
          switchSwapCurrencies()
        },
        {
          initialAtomValues: [
            [stateAtom, INITIAL_SWAP],
            [swapEventHandlersAtom, { onSwitchTokens: spy }],
            [controlledAtom, INITIAL_SWAP],
          ],
        }
      )
      expect(spy).toHaveBeenCalledWith(SWITCHED_SWAP)

      const { result } = rerender(() => useAtomValue(swapAtom))
      expect(result.current).toMatchObject(INITIAL_SWAP)
    })
  })

  describe('useSwapCurrency', () => {
    it('sets currency', () => {
      const spy = jest.fn()
      const { rerender } = renderHook(
        () => {
          const [, setCurrency] = useSwapCurrency(Field.INPUT)
          setCurrency(UNI_MAINNET)
        },
        {
          initialAtomValues: [
            [stateAtom, INITIAL_SWAP],
            [swapEventHandlersAtom, { onTokenChange: spy }],
          ],
        }
      )
      expect(spy).toHaveBeenCalledWith(Field.INPUT, UNI_MAINNET)

      const { result } = rerender(() => useAtomValue(swapAtom))
      expect(result.current).toMatchObject({ ...INITIAL_SWAP, [Field.INPUT]: UNI_MAINNET })
    })

    it('does not set currency if controlled', () => {
      const spy = jest.fn()
      const { rerender } = renderHook(
        () => {
          const [, setCurrency] = useSwapCurrency(Field.INPUT)
          setCurrency(UNI_MAINNET)
        },
        {
          initialAtomValues: [
            [stateAtom, INITIAL_SWAP],
            [swapEventHandlersAtom, { onTokenChange: spy }],
            [controlledAtom, INITIAL_SWAP],
          ],
        }
      )
      expect(spy).toHaveBeenCalledWith(Field.INPUT, UNI_MAINNET)

      const { result } = rerender(() => useAtomValue(swapAtom))
      expect(result.current).toMatchObject(INITIAL_SWAP)
    })
  })

  describe('useSwapAmount', () => {
    it('sets currency amount', () => {
      const spy = jest.fn()
      const { rerender } = renderHook(
        () => {
          const [, setAmount] = useSwapAmount(Field.OUTPUT)
          setAmount('123')
        },
        {
          initialAtomValues: [
            [stateAtom, INITIAL_SWAP],
            [swapEventHandlersAtom, { onAmountChange: spy }],
          ],
        }
      )
      expect(spy).toHaveBeenCalledWith(Field.OUTPUT, '123')

      const { result } = rerender(() => useAtomValue(swapAtom))
      expect(result.current).toMatchObject({ ...INITIAL_SWAP, amount: '123', independentField: Field.OUTPUT })
    })

    it('calls onAmountChange if present', () => {
      const spy = jest.fn()
      const { rerender } = renderHook(
        () => {
          const [, setAmount] = useSwapAmount(Field.OUTPUT)
          setAmount('123')
        },
        {
          initialAtomValues: [
            [stateAtom, INITIAL_SWAP],
            [swapEventHandlersAtom, { onAmountChange: spy }],
            [controlledAtom, INITIAL_SWAP],
          ],
        }
      )
      expect(spy).toHaveBeenCalledWith(Field.OUTPUT, '123')

      const { result } = rerender(() => useAtomValue(swapAtom))
      expect(result.current).toMatchObject(INITIAL_SWAP)
    })
  })
})
