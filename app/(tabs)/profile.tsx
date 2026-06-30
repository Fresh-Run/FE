import React from 'react';
import { View } from 'react-native';

import { Icon, Screen, Text } from '@/components/ui';
import { useTheme } from '@/contexts/theme';

export default function ProfileScreen() {
  const { colors } = useTheme();
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Icon name="person" size={48} color={colors.primary} />
        <Text variant="headlineMd" center>프로필</Text>
        <Text variant="bodyMd" color="onSurfaceVariant" center>Coming soon</Text>
      </View>
    </Screen>
  );
}
