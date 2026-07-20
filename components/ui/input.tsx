import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import { md3 } from '@/lib/theme';
import { Icon } from './icon';
import { Text } from './text';

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  autoCorrect = false,
  error,
  returnKeyType,
  onSubmitEditing,
  inputRef,
  editable = true,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  error?: string | null;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  editable?: boolean;
}) {
  const [showText, setShowText] = useState(false);
  const { colors, radius } = md3;
  const c = colors;

  const hasError = !!error;

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text variant="labelLg" style={styles.label}>{label}</Text>
      ) : null}
      <View
        style={[
          styles.field,
          {
            backgroundColor: c.surfaceContainerLow,
            borderColor: hasError ? c.error : c.outlineVariant,
            borderRadius: radius.lg,
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.onSurfaceVariant + '66'}
          secureTextEntry={secureTextEntry && !showText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          editable={editable}
          style={[styles.input, { color: c.onSurface }]}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setShowText((s) => !s)}
            hitSlop={10}
            style={styles.eyeBtn}
          >
            <Icon
              name={showText ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={c.onSurfaceVariant}
            />
          </Pressable>
        ) : null}
      </View>
      {hasError ? (
        <Text variant="labelSm" color="error" style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { marginLeft: 4 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    padding: 0,
    margin: 0,
  },
  eyeBtn: { padding: 2 },
  errorText: { marginLeft: 4 },
});
