/** 设置控件：滑块、开关、分段单选（全部原生表单元素，键盘可用）。 */

import { useId } from 'react';
import type { ReactElement } from 'react';

/* ==========================================================================
 * 滑块
 * ========================================================================== */

export interface SliderProps {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly hint?: string;
  readonly format?: (value: number) => string;
  readonly disabled?: boolean;
}

/** 0..1 音量滑块。 */
export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  hint,
  format,
  disabled = false,
}: SliderProps): ReactElement {
  const id = useId();
  const text = format === undefined ? undefined : format(value);
  return (
    <div className="field field--slider">
      <div className="field__head">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        <output className="field__value" htmlFor={id}>
          {text ?? ''}
        </output>
      </div>
      <input
        id={id}
        className="field__range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={text}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      {hint !== undefined ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}

/* ==========================================================================
 * 开关
 * ========================================================================== */

export interface ToggleProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly hint?: string;
  readonly disabled?: boolean;
}

/** 复选框式开关。 */
export function Toggle({
  label,
  checked,
  onChange,
  hint,
  disabled = false,
}: ToggleProps): ReactElement {
  const id = useId();
  return (
    <div className="field field--toggle">
      <label className="toggle" htmlFor={id}>
        <input
          id={id}
          className="toggle__input"
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span className="toggle__track" aria-hidden="true">
          <span className="toggle__thumb" />
        </span>
        <span className="toggle__text">
          <span className="toggle__label">{label}</span>
          {hint !== undefined ? <span className="toggle__hint">{hint}</span> : null}
        </span>
      </label>
    </div>
  );
}

/* ==========================================================================
 * 分段单选
 * ========================================================================== */

export interface SegmentOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
}

export interface SegmentedProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly SegmentOption[];
  readonly onChange: (value: string) => void;
}

/** 分段单选（画质等 2–3 选项）。 */
export function Segmented({ label, value, options, onChange }: SegmentedProps): ReactElement {
  const name = useId();
  return (
    <fieldset className="field field--segmented">
      <legend className="field__label">{label}</legend>
      <div className="segmented">
        {options.map((option) => (
          <label key={option.value} className={`segmented__item ${value === option.value ? 'is-active' : ''}`}>
            <input
              className="segmented__input"
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className="segmented__label">{option.label}</span>
            {option.hint !== undefined ? <span className="segmented__hint">{option.hint}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
