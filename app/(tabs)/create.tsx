import React from 'react';
import { View } from 'react-native';

import { Icon, Screen, Text } from '@/components/ui';
import { useTheme } from '@/contexts/theme';

export default function CreateScreen() {
  const { colors } = useTheme();
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Icon name="add-circle" size={48} color={colors.primary} />
        <Text variant="headlineMd" center>코스생성</Text>
        <Text variant="bodyMd" color="onSurfaceVariant" center>Coming soon</Text>
      </View>
    </Screen>
  );
}
