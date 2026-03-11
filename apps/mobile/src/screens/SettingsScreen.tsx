import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Switch,
  Alert,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "../stores/auth-store";

interface SettingsScreenProps {
  onBack: () => void;
  onLogout: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
}

export function SettingsScreen({
  onBack,
  onLogout,
  onPrivacy,
  onTerms,
}: SettingsScreenProps) {
  const { user, updateDisplayName, changePassword } = useAuthStore();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  // Profile edit state
  const [editingName, setEditingName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(user?.displayName || "");
  const [nameLoading, setNameLoading] = useState(false);

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleLogout = () => {
    Alert.alert("ログアウト", "ログアウトしますか？", [
      { text: "キャンセル", style: "cancel" },
      { text: "ログアウト", style: "destructive", onPress: onLogout },
    ]);
  };

  const handleSaveDisplayName = async () => {
    const trimmed = newDisplayName.trim();
    if (!trimmed) {
      Alert.alert("エラー", "表示名を入力してください");
      return;
    }
    if (trimmed === user?.displayName) {
      setEditingName(false);
      return;
    }
    setNameLoading(true);
    try {
      await updateDisplayName(trimmed);
      setEditingName(false);
      Alert.alert("完了", "表示名を変更しました");
    } catch (err) {
      Alert.alert(
        "エラー",
        err instanceof Error ? err.message : "変更に失敗しました"
      );
    } finally {
      setNameLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      Alert.alert("エラー", "現在のパスワードを入力してください");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("エラー", "新しいパスワードは6文字以上で入力してください");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("エラー", "新しいパスワードが一致しません");
      return;
    }
    setPasswordLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setShowPasswordForm(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("完了", "パスワードを変更しました");
    } catch (err) {
      Alert.alert(
        "エラー",
        err instanceof Error ? err.message : "変更に失敗しました"
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={["#0a1628", "#122440", "#1a3358"] as const}
      style={styles.container}
    >
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>‹ 戻る</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>設定</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.content}>
          {/* Account section */}
          <Text style={styles.sectionTitle}>アカウント</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>ユーザー名</Text>
              <Text style={styles.settingValue}>@{user?.username}</Text>
            </View>
            <View style={styles.divider} />

            {/* Display name - editable */}
            {editingName ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.textInput}
                  value={newDisplayName}
                  onChangeText={setNewDisplayName}
                  placeholder="表示名"
                  placeholderTextColor="#4a5a6a"
                  autoFocus
                  maxLength={20}
                />
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => {
                      setEditingName(false);
                      setNewDisplayName(user?.displayName || "");
                    }}
                  >
                    <Text style={styles.cancelBtnText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleSaveDisplayName}
                    disabled={nameLoading}
                  >
                    {nameLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.saveBtnText}>保存</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => setEditingName(true)}
              >
                <Text style={styles.settingLabel}>表示名</Text>
                <View style={styles.editableValue}>
                  <Text style={styles.settingValue}>{user?.displayName}</Text>
                  <Text style={styles.editIcon}>✎</Text>
                </View>
              </TouchableOpacity>
            )}

            <View style={styles.divider} />

            {/* Password change */}
            {showPasswordForm ? (
              <View style={styles.passwordForm}>
                <TextInput
                  style={styles.textInput}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="現在のパスワード"
                  placeholderTextColor="#4a5a6a"
                  secureTextEntry
                />
                <TextInput
                  style={[styles.textInput, { marginTop: 8 }]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="新しいパスワード (6文字以上)"
                  placeholderTextColor="#4a5a6a"
                  secureTextEntry
                />
                <TextInput
                  style={[styles.textInput, { marginTop: 8 }]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="新しいパスワード (確認)"
                  placeholderTextColor="#4a5a6a"
                  secureTextEntry
                />
                <View style={styles.passwordActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => {
                      setShowPasswordForm(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                  >
                    <Text style={styles.cancelBtnText}>キャンセル</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleChangePassword}
                    disabled={passwordLoading}
                  >
                    {passwordLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.saveBtnText}>変更</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => setShowPasswordForm(true)}
              >
                <Text style={styles.settingLabel}>パスワード変更</Text>
                <Text style={styles.settingArrow}>›</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Game settings */}
          <Text style={styles.sectionTitle}>ゲーム設定</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>効果音</Text>
              <Switch
                value={soundEnabled}
                onValueChange={setSoundEnabled}
                trackColor={{
                  false: "#2a3a4a",
                  true: "rgba(26, 120, 136, 0.5)",
                }}
                thumbColor={soundEnabled ? "#1a7888" : "#5a6a7a"}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>バイブレーション</Text>
              <Switch
                value={vibrationEnabled}
                onValueChange={setVibrationEnabled}
                trackColor={{
                  false: "#2a3a4a",
                  true: "rgba(26, 120, 136, 0.5)",
                }}
                thumbColor={vibrationEnabled ? "#1a7888" : "#5a6a7a"}
              />
            </View>
          </View>

          {/* Info & Legal */}
          <Text style={styles.sectionTitle}>情報</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.settingRow} onPress={onPrivacy}>
              <Text style={styles.settingLabel}>プライバシーポリシー</Text>
              <Text style={styles.settingArrow}>›</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.settingRow} onPress={onTerms}>
              <Text style={styles.settingLabel}>利用規約</Text>
              <Text style={styles.settingArrow}>›</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>バージョン</Text>
              <Text style={styles.settingValue}>1.0.0</Text>
            </View>
          </View>

          {/* Logout */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutText}>ログアウト</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(26, 120, 136, 0.2)",
  },
  backBtn: { paddingRight: 12 },
  backText: { color: "#1a7888", fontSize: 16 },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "bold",
    color: "#e0f0f5",
    textAlign: "center",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#6a8fa0",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "rgba(14, 28, 50, 0.7)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(26, 120, 136, 0.15)",
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  settingLabel: {
    color: "#e0f0f5",
    fontSize: 15,
  },
  settingValue: {
    color: "#6a8fa0",
    fontSize: 14,
  },
  settingArrow: {
    color: "#1a7888",
    fontSize: 22,
    fontWeight: "300",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    marginHorizontal: 14,
  },
  editableValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  editIcon: {
    color: "#1a7888",
    fontSize: 14,
  },
  editRow: {
    padding: 14,
  },
  textInput: {
    backgroundColor: "rgba(10, 22, 40, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(26, 120, 136, 0.3)",
    borderRadius: 8,
    color: "#e0f0f5",
    fontSize: 15,
    padding: 10,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 10,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cancelBtnText: {
    color: "#6a8fa0",
    fontSize: 14,
  },
  saveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#1a7888",
    minWidth: 60,
    alignItems: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  passwordForm: {
    padding: 14,
  },
  passwordActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  logoutBtn: {
    alignItems: "center",
    padding: 14,
    marginTop: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(214, 48, 49, 0.3)",
  },
  logoutText: {
    color: "#d63031",
    fontSize: 15,
    fontWeight: "bold",
  },
});
