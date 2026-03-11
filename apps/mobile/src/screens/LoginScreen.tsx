import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "../stores/auth-store";

interface LoginScreenProps {
  onBack: () => void;
}

export function LoginScreen({ onBack }: LoginScreenProps) {
  const { login, register, error, isLoading } = useAuthStore();
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const validate = (): boolean => {
    if (!username.trim()) {
      setValidationError("ユーザー名を入力してください");
      return false;
    }
    if (username.trim().length < 3) {
      setValidationError("ユーザー名は3文字以上で入力してください");
      return false;
    }
    if (!password) {
      setValidationError("パスワードを入力してください");
      return false;
    }
    if (password.length < 6) {
      setValidationError("パスワードは6文字以上で入力してください");
      return false;
    }
    if (isRegistering && !displayName.trim()) {
      setValidationError("表示名を入力してください");
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    if (isRegistering) {
      register(username.trim(), password, displayName.trim());
    } else {
      login(username.trim(), password);
    }
  };

  const displayError = validationError || error;

  return (
    <LinearGradient
      colors={["#0a1628", "#122440", "#1a3358"] as const}
      style={styles.container}
    >
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>‹ メニュー</Text>
        </TouchableOpacity>

        <View style={styles.form}>
          <Text style={styles.title}>麻雀</Text>
          <Text style={styles.subtitle}>
            {isRegistering ? "アカウント登録" : "ログイン"}
          </Text>

          <TextInput
            style={styles.input}
            placeholder="ユーザー名 (3文字以上)"
            placeholderTextColor="#4a6070"
            value={username}
            onChangeText={(t) => { setUsername(t); setValidationError(null); }}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder="パスワード (6文字以上)"
            placeholderTextColor="#4a6070"
            value={password}
            onChangeText={(t) => { setPassword(t); setValidationError(null); }}
            secureTextEntry
          />

          {isRegistering && (
            <TextInput
              style={styles.input}
              placeholder="表示名"
              placeholderTextColor="#4a6070"
              value={displayName}
              onChangeText={(t) => { setDisplayName(t); setValidationError(null); }}
            />
          )}

          {displayError && <Text style={styles.error}>{displayError}</Text>}

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading
                ? "処理中..."
                : isRegistering
                  ? "登録"
                  : "ログイン"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setIsRegistering(!isRegistering);
              setValidationError(null);
            }}
          >
            <Text style={styles.toggleText}>
              {isRegistering
                ? "既にアカウントをお持ちの方"
                : "新規アカウント登録"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
    justifyContent: "center",
  },
  backBtn: {
    position: "absolute",
    top: 54,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  backText: {
    color: "#1a7888",
    fontSize: 16,
  },
  form: {
    alignSelf: "center",
    width: "85%",
    maxWidth: 400,
    padding: 28,
    backgroundColor: "rgba(14, 28, 50, 0.85)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(26, 120, 136, 0.3)",
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    color: "#ffd600",
    textAlign: "center",
    letterSpacing: 4,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: "#6a8fa0",
    textAlign: "center",
    marginBottom: 28,
  },
  input: {
    backgroundColor: "rgba(10, 22, 40, 0.8)",
    borderRadius: 10,
    padding: 14,
    color: "#e0f0f5",
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(26, 120, 136, 0.25)",
  },
  button: {
    backgroundColor: "#1a7888",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#20a0b0",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  error: {
    color: "#ff6b6b",
    textAlign: "center",
    marginBottom: 8,
    fontSize: 13,
  },
  toggleText: {
    color: "#4fc3f7",
    textAlign: "center",
    marginTop: 18,
    fontSize: 14,
  },
});
