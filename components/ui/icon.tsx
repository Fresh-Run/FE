import { Ionicons } from '@expo/vector-icons';
import React from 'react';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export type IconName = IoniconName;

export function Icon({
  name,
  size = 24,
  color = '#000000',
  filled,
}: {
  name: string;
  size?: number;
  color?: string;
  filled?: boolean;
}) {
  // filled is a hint — callers supply the exact name variant they want
  void filled;
  return <Ionicons name={name as IoniconName} size={size} color={color} />;
}
