import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface LegalScreenProps {
  type: "privacy" | "terms";
  onBack: () => void;
}

export function LegalScreen({ type, onBack }: LegalScreenProps) {
  const isPrivacy = type === "privacy";

  return (
    <LinearGradient
      colors={["#0a1628", "#122440", "#1a3358"] as const}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>{"\u2190"} {"\u623b\u308b"}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isPrivacy ? "\u30d7\u30e9\u30a4\u30d0\u30b7\u30fc\u30dd\u30ea\u30b7\u30fc" : "\u5229\u7528\u898f\u7d04"}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {isPrivacy ? <PrivacyPolicyContent /> : <TermsOfServiceContent />}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function PrivacyPolicyContent() {
  return (
    <>
      <Text style={styles.sectionTitle}>{"\u30d7\u30e9\u30a4\u30d0\u30b7\u30fc\u30dd\u30ea\u30b7\u30fc"}</Text>
      <Text style={styles.lastUpdated}>{"\u6700\u7d42\u66f4\u65b0\u65e5: 2026\u5e742\u670819\u65e5"}</Text>

      <Text style={styles.heading}>{"\u7b2c1\u6761 \u53ce\u96c6\u3059\u308b\u60c5\u5831"}</Text>
      <Text style={styles.body}>
        {"\u672c\u30a2\u30d7\u30ea\u30b1\u30fc\u30b7\u30e7\u30f3\uff08\u4ee5\u4e0b\u300c\u672c\u30a2\u30d7\u30ea\u300d\uff09\u3067\u306f\u3001\u4ee5\u4e0b\u306e\u60c5\u5831\u3092\u53ce\u96c6\u3059\u308b\u5834\u5408\u304c\u3042\u308a\u307e\u3059\u3002"}{"\n"}
        {"\u30fb\u30a2\u30ab\u30a6\u30f3\u30c8\u60c5\u5831\uff08\u30e6\u30fc\u30b6\u30fc\u540d\u3001\u8868\u793a\u540d\uff09"}{"\n"}
        {"\u30fb\u5bfe\u5c40\u5c65\u6b74\u30fb\u6210\u7e3e\u30c7\u30fc\u30bf"}{"\n"}
        {"\u30fb\u30c7\u30d0\u30a4\u30b9\u60c5\u5831\uff08OS\u30d0\u30fc\u30b8\u30e7\u30f3\u3001\u7aef\u672b\u30e2\u30c7\u30eb\uff09"}{"\n"}
        {"\u30fb\u4f4d\u7f6e\u60c5\u5831\uff08GPS\u8ddd\u96e2\u5236\u9650\u6a5f\u80fd\u4f7f\u7528\u6642\u306e\u307f\u3001\u30e6\u30fc\u30b6\u30fc\u306e\u540c\u610f\u304c\u5fc5\u8981\uff09"}
      </Text>

      <Text style={styles.heading}>{"\u7b2c2\u6761 \u60c5\u5831\u306e\u5229\u7528\u76ee\u7684"}</Text>
      <Text style={styles.body}>
        {"\u53ce\u96c6\u3057\u305f\u60c5\u5831\u306f\u4ee5\u4e0b\u306e\u76ee\u7684\u3067\u5229\u7528\u3057\u307e\u3059\u3002"}{"\n"}
        {"\u30fb\u30b5\u30fc\u30d3\u30b9\u306e\u63d0\u4f9b\u30fb\u904b\u55b6"}{"\n"}
        {"\u30fb\u5bfe\u5c40\u30de\u30c3\u30c1\u30f3\u30b0\u30fb\u4e0d\u6b63\u884c\u70ba\u306e\u9632\u6b62"}{"\n"}
        {"\u30fb\u30b5\u30fc\u30d3\u30b9\u306e\u6539\u5584\u30fb\u6a5f\u80fd\u958b\u767a"}
      </Text>

      <Text style={styles.heading}>{"\u7b2c3\u6761 \u60c5\u5831\u306e\u7b2c\u4e09\u8005\u63d0\u4f9b"}</Text>
      <Text style={styles.body}>
        {"\u53ce\u96c6\u3057\u305f\u60c5\u5831\u306f\u3001\u6cd5\u4ee4\u306b\u57fa\u3065\u304f\u5834\u5408\u3092\u9664\u304d\u3001\u30e6\u30fc\u30b6\u30fc\u306e\u540c\u610f\u306a\u304f\u7b2c\u4e09\u8005\u306b\u63d0\u4f9b\u3059\u308b\u3053\u3068\u306f\u3042\u308a\u307e\u305b\u3093\u3002"}
      </Text>

      <Text style={styles.heading}>{"\u7b2c4\u6761 \u30c7\u30fc\u30bf\u306e\u4fdd\u7ba1"}</Text>
      <Text style={styles.body}>
        {"\u53ce\u96c6\u3057\u305f\u60c5\u5831\u306f\u3001\u6697\u53f7\u5316\u3055\u308c\u305f\u30b5\u30fc\u30d0\u30fc\u4e0a\u306b\u5b89\u5168\u306b\u4fdd\u7ba1\u3055\u308c\u307e\u3059\u3002\u30a2\u30ab\u30a6\u30f3\u30c8\u524a\u9664\u306e\u8981\u6c42\u304c\u3042\u3063\u305f\u5834\u5408\u3001\u95a2\u9023\u3059\u308b\u500b\u4eba\u60c5\u5831\u3092\u901f\u3084\u304b\u306b\u524a\u9664\u3057\u307e\u3059\u3002"}
      </Text>

      <Text style={styles.heading}>{"\u7b2c5\u6761 \u304a\u554f\u3044\u5408\u308f\u305b"}</Text>
      <Text style={styles.body}>
        {"\u30d7\u30e9\u30a4\u30d0\u30b7\u30fc\u306b\u95a2\u3059\u308b\u304a\u554f\u3044\u5408\u308f\u305b\u306f\u3001\u30a2\u30d7\u30ea\u5185\u306e\u8a2d\u5b9a\u753b\u9762\u307e\u305f\u306f\u904b\u55b6\u5143\u3078\u3054\u9023\u7d61\u304f\u3060\u3055\u3044\u3002"}
      </Text>
    </>
  );
}

function TermsOfServiceContent() {
  return (
    <>
      <Text style={styles.sectionTitle}>{"\u5229\u7528\u898f\u7d04"}</Text>
      <Text style={styles.lastUpdated}>{"\u6700\u7d42\u66f4\u65b0\u65e5: 2026\u5e742\u670819\u65e5"}</Text>

      <Text style={styles.heading}>{"\u7b2c1\u6761 \u30b5\u30fc\u30d3\u30b9\u306e\u6982\u8981"}</Text>
      <Text style={styles.body}>
        {"\u672c\u30a2\u30d7\u30ea\u306f\u3001\u30a2\u30df\u30e5\u30fc\u30ba\u30e1\u30f3\u30c8\u76ee\u7684\u306e\u7121\u6599\u9ebb\u96c0\u30b2\u30fc\u30e0\u3067\u3059\u3002\u62db\u5f85\u5236\u306e\u30af\u30e9\u30d6\u5185\u3067\u30ea\u30a2\u30eb\u30bf\u30a4\u30e0\u306b\u5bfe\u5c40\u3092\u304a\u697d\u3057\u307f\u3044\u305f\u3060\u3051\u307e\u3059\u3002"}
      </Text>

      <Text style={styles.heading}>{"\u7b2c2\u6761 \u30a2\u30ab\u30a6\u30f3\u30c8"}</Text>
      <Text style={styles.body}>
        {"\u30fb\u30e6\u30fc\u30b6\u30fc\u306f\u6b63\u78ba\u306a\u60c5\u5831\u3092\u767b\u9332\u3059\u308b\u5fc5\u8981\u304c\u3042\u308a\u307e\u3059\u3002"}{"\n"}
        {"\u30fb\u30a2\u30ab\u30a6\u30f3\u30c8\u306e\u5171\u6709\u30fb\u8b72\u6e21\u306f\u7981\u6b62\u3067\u3059\u3002"}{"\n"}
        {"\u30fb\u904b\u55b6\u306f\u4e0d\u6b63\u884c\u70ba\u304c\u78ba\u8a8d\u3055\u308c\u305f\u5834\u5408\u3001\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u505c\u6b62\u3059\u308b\u6a29\u5229\u3092\u6709\u3057\u307e\u3059\u3002"}
      </Text>

      <Text style={styles.heading}>{"\u7b2c3\u6761 \u7981\u6b62\u884c\u70ba"}</Text>
      <Text style={styles.body}>
        {"\u4ee5\u4e0b\u306e\u884c\u70ba\u3092\u7981\u6b62\u3057\u307e\u3059\u3002"}{"\n"}
        {"\u30fb\u4e0d\u6b63\u30c4\u30fc\u30eb\u3084\u30dc\u30c3\u30c8\u306e\u4f7f\u7528"}{"\n"}
        {"\u30fb\u5171\u8b00\u30fb\u901a\u307c\u3057\u884c\u70ba"}{"\n"}
        {"\u30fb\u30b5\u30fc\u30d0\u30fc\u3078\u306e\u653b\u6483\u3084\u4e0d\u6b63\u30a2\u30af\u30bb\u30b9"}{"\n"}
        {"\u30fb\u4ed6\u306e\u30e6\u30fc\u30b6\u30fc\u3078\u306e\u5ac1\u304c\u3089\u305b\u30fb\u8a39\u8b17\u4e2d\u50b7"}
      </Text>

      <Text style={styles.heading}>{"\u7b2c4\u6761 \u514d\u8cac\u4e8b\u9805"}</Text>
      <Text style={styles.body}>
        {"\u30fb\u30b5\u30fc\u30d3\u30b9\u306e\u4e00\u6642\u505c\u6b62\u30fb\u4e2d\u65ad\u306b\u3088\u308b\u640d\u5bb3\u306b\u3064\u3044\u3066\u3001\u904b\u55b6\u306f\u8cac\u4efb\u3092\u8ca0\u3044\u307e\u305b\u3093\u3002"}{"\n"}
        {"\u30fb\u30e6\u30fc\u30b6\u30fc\u9593\u306e\u30c8\u30e9\u30d6\u30eb\u306b\u3064\u3044\u3066\u3001\u904b\u55b6\u306f\u4e00\u5207\u306e\u8cac\u4efb\u3092\u8ca0\u3044\u307e\u305b\u3093\u3002"}
      </Text>

      <Text style={styles.heading}>{"\u7b2c5\u6761 \u898f\u7d04\u306e\u5909\u66f4"}</Text>
      <Text style={styles.body}>
        {"\u672c\u898f\u7d04\u306f\u4e8b\u524d\u306e\u901a\u77e5\u306a\u304f\u5909\u66f4\u3055\u308c\u308b\u5834\u5408\u304c\u3042\u308a\u307e\u3059\u3002\u5909\u66f4\u5f8c\u3082\u7d99\u7d9a\u3057\u3066\u30b5\u30fc\u30d3\u30b9\u3092\u5229\u7528\u3059\u308b\u5834\u5408\u3001\u5909\u66f4\u5f8c\u306e\u898f\u7d04\u306b\u540c\u610f\u3057\u305f\u3082\u306e\u3068\u307f\u306a\u3057\u307e\u3059\u3002"}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  backBtn: { padding: 4 },
  backText: { color: "#1a7888", fontSize: 14 },
  headerTitle: { color: "#e0f0f5", fontSize: 16, fontWeight: "bold" },
  headerSpacer: { width: 50 },
  scrollView: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#e0f0f5",
    marginBottom: 4,
  },
  lastUpdated: {
    color: "#6a8fa0",
    fontSize: 12,
    marginBottom: 20,
  },
  heading: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#a0c8d5",
    marginTop: 18,
    marginBottom: 6,
  },
  body: {
    fontSize: 13,
    color: "#8aa0b0",
    lineHeight: 20,
  },
});
