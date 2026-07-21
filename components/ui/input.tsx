import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import { md3 } from '@/lib/theme';
import { useTokens } from '@/hooks/use-tokens';
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
  // md3-colors retired (batch 4) — app tokens; radius stays legacy layout.
  const C = useTokens();
  const { radius } = md3;

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
            backgroundColor: C.surfaceAlt,
            borderColor: hasError ? C.danger : C.border,
            borderRadius: radius.lg,
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.faint}
          secureTextEntry={secureTextEntry && !showText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          editable={editable}
          style={[styles.input, { color: C.text }]}
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
              color={C.sub}
            />
          </Pressable>
        ) : null}
      </View>
      {hasError ? (
        <Text variant="labelSm" color="danger" style={styles.errorText}>
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
