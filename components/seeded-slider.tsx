/**
 * SeededSlider — the slider thumb/value mismatch class fix (8/3 owner field
 * report: 말하기 속도 thumb HARD RIGHT while reading x1.0, which is
 * MID-range 0.6–1.6 — the decisive sighting; 코스 거리 questionable).
 *
 * MECHANISM (the class): @react-native-community/slider is NOT a controlled
 * component — `value` seeds the native thumb, and the seating is exposed to
 * two known iOS defects: ① the initial thumb position can be computed
 * against a pre-layout width / the native default 0–1 range depending on
 * prop-application order (a value ≥ the stale max pins the thumb hard
 * right — the exact 말하기-속도 signature); ② dynamic min/max changes
 * reclamp against a stale value (코스 거리's mode/unit-dependent floor).
 * Post-mount `value` updates (store hydration, server seeds) ride the same
 * unreliable native setValue path.
 *
 * FIX — one-shot RESEAT by key-remount, three triggers, drags never fight:
 *  a) after the FIRST onLayout (the fresh mount seats against the real
 *     width and the current value/range);
 *  b) when min/max CHANGE while idle (the reclamp defense);
 *  c) when `value` changes EXTERNALLY while idle (hydration landing late —
 *     distinguished from slider-originated changes via lastNative).
 * Prop order min → max → step → value is kept explicit as the documented
 * ordering defense. Desk-diagnosed; the field glance judges.
 */
import Slider, { type SliderProps } from '@react-native-community/slider';
import React, { useEffect, useRef, useState } from 'react';

export function SeededSlider(props: SliderProps) {
  const { value, minimumValue, maximumValue, step, onValueChange, onSlidingStart, onSlidingComplete, ...rest } = props;
  const [seed, setSeed] = useState(0);
  const laidOut = useRef(false);
  const sliding = useRef(false);
  const lastNative = useRef<number | undefined>(value);

  // (c) external value change while idle → reseat
  useEffect(() => {
    if (sliding.current || value == null) { lastNative.current = value; return; }
    if (lastNative.current == null || Math.abs(value - lastNative.current) > 1e-6) {
      lastNative.current = value;
      setSeed(s => s + 1);
    }
  }, [value]);

  // (b) range change while idle → reseat
  const rangeKey = `${minimumValue}:${maximumValue}`;
  const prevRange = useRef(rangeKey);
  useEffect(() => {
    if (prevRange.current === rangeKey) return;
    prevRange.current = rangeKey;
    if (!sliding.current) setSeed(s => s + 1);
  }, [rangeKey]);

  return (
    <Slider
      key={seed}
      {...rest}
      minimumValue={minimumValue}
      maximumValue={maximumValue}
      step={step}
      value={value}
      onLayout={e => {
        // (a) one-shot: the ref survives the remount, so the second mount's
        // onLayout does not loop
        if (!laidOut.current) { laidOut.current = true; setSeed(s => s + 1); }
        rest.onLayout?.(e);
      }}
      onSlidingStart={v => { sliding.current = true; onSlidingStart?.(v); }}
      onValueChange={v => { lastNative.current = v; onValueChange?.(v); }}
      onSlidingComplete={v => { sliding.current = false; lastNative.current = v; onSlidingComplete?.(v); }}
    />
  );
}
