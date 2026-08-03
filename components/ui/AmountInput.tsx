import { type ChangeEvent, type FC } from 'react'

import { Button } from './Button'

import amountInputStyles from './AmountInput.module.css'

interface AmountInputProps {
  value: string
  onChange: (value: string) => void
  onMax?: () => void
  symbol: string
  disabled?: boolean
}

// Digits and at most one `.`; everything else dropped. Empty string is allowed so the field
// can be cleared. A bare leading `.` is grown into `0.` - viem's `parseUnits` throws on ".5",
// which the caller can only surface as a silently disabled button.
const sanitize = (raw: string): string => {
  const stripped = raw.replace(/[^0-9.]/g, '')
  const firstDot = stripped.indexOf('.')

  if (firstDot === -1) return stripped

  const single =
    stripped.slice(0, firstDot + 1) + stripped.slice(firstDot + 1).replace(/\./g, '')

  return single.startsWith('.') ? `0${single}` : single
}

/**
 * Minimal controlled decimal-amount input. Presentational only: no balance knowledge, no
 * validation, no parsing to `bigint` - that lives in whatever screen owns the amount.
 */
export const AmountInput: FC<AmountInputProps> = ({ value, onChange, onMax, symbol, disabled }) => {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(sanitize(event.target.value))
  }

  return (
    <div className={amountInputStyles.wrapper}>
      <input
        className={amountInputStyles.input}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={`Amount in ${symbol}`}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        placeholder="0.0"
      />
      <span className={amountInputStyles.symbol}>{symbol}</span>
      {onMax ? (
        <Button
          variant="secondarySmall"
          className={amountInputStyles.maxButton}
          disabled={disabled}
          onClick={onMax}
        >
          Max
        </Button>
      ) : null}
    </div>
  )
}
