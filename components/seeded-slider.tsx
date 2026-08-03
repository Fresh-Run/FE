/**
 * SeededSlider v2 — the slider thumb/value mismatch class (8/3 field, two
 * rounds).
 *
 * ROUND 1 (single-screen mis-seat): @react-native-community/slider is a
 * non-controlled component; the native thumb's initial seating is exposed
 * to pre-layout width / stale-range clamping (말하기 속도 hard-right at
 * x1.0 = mid-range 0.6–1.6). Fix: reseat-by-remount.
 *
 * ROUND 2 (cross-screen bleed, owner repro: course-gen ↔ 오디오 설정 —
 * second screen hard-right): MECHANISM VERDICT — NOT React reconciliation.
 * `key` is sibling-scoped and the two screens' sliders live in different
 * navigator subtrees; React cannot merge instances across parents, so the
 * wrapper's per-instance refs are always fresh on a screen mount. The
 * bleed is BENEATH React: Fabric (newArchEnabled) recycles native views BY
 * TYPE — a discarded RCTSlider returns to a pool and the next mount draws
 * it; incomplete recycle-reset leaves the PREVIOUS site's min/max/value
 * normalization in the native view (the known community-slider new-arch
 * class). Round 1's remounts amplified it: every key-flip fed a slider
 * into the pool, so cross-navigation reliably drew a stale view — exactly
 * "cold entry correct, second screen wrong".
 *
 * v2 INVARIANT — a slider can never render seated against another site's
 * range, regardless of what native view Fabric hands us:
 *  ① `siteId` REQUIRED (compile-enforced): key = `${siteId}:${seed}` —
 *     globally distinct keys, no sibling-scope edge anywhere.
 *  ② seatedRange guard: the seat cycle is keyed to the CURRENT range —
 *     any mismatch (incl. dynamic min/max) always forces a fresh reseat.
 *  ③ post-attach value assertion: after the reseated mount lays out, the
 *     value prop is re-applied with an invisible epsilon nudge (a fresh
 *     native setValue AFTER the view — recycled or not — is fully
 *     attached; step quantization snaps the epsilon away). Stale recycled
 *     normalization is overwritten every seat cycle.
 * Drags are never fought (sliding ref gates every trigger). Desk-proven;
 * the field glance judges.
 */
import Slider, { type SliderProps } from '@react-native-community/slider';
import React, { useEffect, useRef, useState } from 'react';

/** invisible re-assert nudge — far below every site's step grid */
const ASSERT_EPS = 1e-6;

export function SeededSlider(props: SliderProps & { siteId: string }) {
  const { siteId, value, minimumValue, maximumValue, step, onValueChange, onSlidingStart, onSlidingComplete, ...rest } = props;
  const [seed, setSeed] = useState(0);
  const [assertTick, setAssertTick] = useState(0);
  const seatedRange = useRef<string | null>(null); // null = never seated
  const assertedSeed = useRef(-1);                 // one assertion per seat cycle
  const sliding = useRef(false);
  const lastNative = useRef<number | undefined>(value);
  const rangeKey = `${minimumValue}:${maximumValue}`;

  // external value change while idle (late hydration / server seed) → reseat
  useEffect(() => {
    if (sliding.current || value == null) { lastNative.current = value; return; }
    if (lastNative.current == null || Math.abs(value - lastNative.current) > 1e-6) {
      lastNative.current = value;
      setSeed(s => s + 1);
    }
  }, [value]);

  // range change while idle → the seatedRange guard in onLayout reseats;
  // this effect just wakes a layout pass when the range flips with no
  // other render cause
  useEffect(() => {
    if (!sliding.current && seatedRange.current != null && seatedRange.current !== rangeKey) {
      setSeed(s => s + 1);
    }
  }, [rangeKey]);

  return (
    <Slider
      key={`${siteId}:${seed}`}
      {...rest}
      minimumValue={minimumValue}
      maximumValue={maximumValue}
      step={step}
      value={value == null ? value : value + (assertTick % 2 === 1 ? ASSERT_EPS : 0)}
      onLayout={e => {
        if (seatedRange.current !== rangeKey) {
          // seat (or re-seat) against THIS site's range — a fresh mount
          seatedRange.current = rangeKey;
          setSeed(s => s + 1);
        } else if (assertedSeed.current !== seed) {
          // post-attach assertion: one fresh native setValue per seat cycle
          assertedSeed.current = seed;
          setAssertTick(t => t + 1);
        }
        rest.onLayout?.(e);
      }}
      onSlidingStart={v => { sliding.current = true; onSlidingStart?.(v); }}
      onValueChange={v => { lastNative.current = v; onValueChange?.(v); }}
      onSlidingComplete={v => { sliding.current = false; lastNative.current = v; onSlidingComplete?.(v); }}
    />
  );
}
