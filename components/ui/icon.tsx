import { Ionicons } from '@expo/vector-icons';
import React from 'react';

import { useTokens } from '@/hooks/use-tokens';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export type IconName = IoniconName;

export function Icon({
  name,
  size = 24,
  color,
  filled,
}: {
  name: string;
  size?: number;
  color?: string;
  filled?: boolean;
}) {
  // filled is a hint — callers supply the exact name variant they want
  void filled;
  // T7 (dark-mode phase 2): default = the active text token, not static black
  const C = useTokens();
  return <Ionicons name={name as IoniconName} size={size} color={color ?? C.text} />;
}
