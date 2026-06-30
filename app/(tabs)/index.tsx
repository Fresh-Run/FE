import React from 'react';
import { View } from 'react-native';

import { Icon, Screen, Text } from '@/components/ui';
import { useTheme } from '@/contexts/theme';

export default function HomeScreen() {
  const { colors } = useTheme();
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Icon name="home" size={48} color={colors.primary} />
        <Text variant="headlineMd" center>홈</Text>
        <Text variant="bodyMd" color="onSurfaceVariant" center>Foundation ✓</Text>
      </View>
    </Screen>
  );
}
