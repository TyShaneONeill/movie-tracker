import { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticImpact } from '@/lib/haptics';

interface PasswordInputProps extends Omit<TextInputProps, 'secureTextEntry'> {
  containerStyle?: StyleProp<ViewStyle>;
  iconColor: string;
}

export function PasswordInput({
  containerStyle,
  iconColor,
  style,
  ...textInputProps
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  const toggle = () => {
    hapticImpact();
    setVisible((v) => !v);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        {...textInputProps}
        secureTextEntry={!visible}
        style={[style, styles.inputPadding]}
      />
      <Pressable
        onPress={toggle}
        style={styles.toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        accessibilityState={{ selected: visible }}
      >
        {({ pressed }) => (
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={iconColor}
            style={{ opacity: pressed ? 0.6 : 1 }}
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputPadding: {
    paddingRight: 48,
  },
  toggle: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
