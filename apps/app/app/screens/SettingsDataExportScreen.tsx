import { FC, useState } from "react"
import { ActivityIndicator, Pressable, ScrollView, View, ViewStyle } from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import { router } from "expo-router"
import * as FileSystem from "expo-file-system"
import * as Sharing from "expo-sharing"
import { DownloadSimple, ShareNetwork } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { apiGet } from "@/services/api/noopClient"
import { Toast } from "@/components/reactx/toast"
import { LOCAL_THEME } from "@/utils/localTheme"

export const SettingsDataExportScreen: FC = () => {
  const { colors } = LOCAL_THEME
  const insets = useSafeAreaInsets()
  const [busy, setBusy] = useState<"90" | "365" | null>(null)

  const exportWindow = async (windowDays: 90 | 365) => {
    setBusy(String(windowDays) as typeof busy)
    try {
      const dump = await apiGet(`/journal/export?windowDays=${windowDays}`)
      const json = JSON.stringify(dump, null, 2)
      const fileName = `noop-export-${windowDays}d-${new Date().toISOString().slice(0, 10)}.json`
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`
      await FileSystem.writeAsStringAsync(fileUri, json, {
        encoding: FileSystem.EncodingType.UTF8,
      })
      const canShare = await Sharing.isAvailableAsync()
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/json",
          dialogTitle: `noop export · ${windowDays} days`,
          UTI: "public.json",
        })
      } else {
        Toast.show(`Saved to ${fileUri}`, { type: "success", position: "top" })
      }
    } catch (e: any) {
      Toast.show(e?.message ?? "Export failed", { type: "error", position: "top" })
    } finally {
      setBusy(null)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={$navBar}>
        <Text
          text="Data Export"
          style={{
            color: colors.text,
            fontSize: 17,
            fontWeight: "700",
            letterSpacing: -0.2,
          }}
          onPress={() => router.back()}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
          gap: 14,
        }}
      >
        <Text
          text="Download your noop data as JSON. Contains daily scores, night features, daily metrics, and journal entries for the chosen window. Suitable for piping into a spreadsheet or sharing with a clinician."
          style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17, paddingHorizontal: 4 }}
        />

        <ExportRow
          label="Export · last 90 days"
          description="Recent window — typical doctor-visit horizon."
          busy={busy === "90"}
          onPress={() => exportWindow(90)}
        />
        <ExportRow
          label="Export · last 365 days"
          description="Full year of data. Larger file, slower to generate."
          busy={busy === "365"}
          onPress={() => exportWindow(365)}
        />

        <Text
          text="PDF report generation is on the roadmap. JSON is what's available today."
          style={{
            color: colors.textMuted,
            fontSize: 11,
            paddingHorizontal: 4,
            paddingTop: 8,
          }}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const ExportRow: FC<{
  label: string
  description: string
  busy: boolean
  onPress: () => void
}> = ({ label, description, busy, onPress }) => {
  const { colors } = LOCAL_THEME
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        $card,
        {
          backgroundColor: colors.surfaceCard,
          opacity: busy ? 0.55 : 1,
        },
        pressed && !busy ? { opacity: 0.85 } : null,
      ]}
    >
      <View style={$row}>
        <View
          style={[
            $iconWrap,
            { backgroundColor: colors.surfaceElevated },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <DownloadSimple size={18} color={colors.text} />
          )}
        </View>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text
            text={label}
            style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}
          />
          <Text
            text={description}
            style={{ color: colors.textDim, fontSize: 12, marginTop: 2, lineHeight: 17 }}
          />
        </View>
        <ShareNetwork size={16} color={colors.textMuted} />
      </View>
    </Pressable>
  )
}

const $navBar: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: 16,
  paddingVertical: 12,
}

const $card: ViewStyle = {
  borderRadius: 14,
}

const $row: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
  paddingHorizontal: 14,
  paddingVertical: 14,
}

const $iconWrap: ViewStyle = {
  alignItems: "center",
  borderRadius: 10,
  height: 36,
  justifyContent: "center",
  width: 36,
}
