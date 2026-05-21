import { FC, useCallback, useEffect, useState } from "react"
import { ScrollView, TouchableOpacity, View, ViewStyle } from "react-native"
import { Copy as CopyIcon, Export as ExportIcon, Trash as TrashIcon } from "phosphor-react-native"
import * as Clipboard from "expo-clipboard"
import * as Sharing from "expo-sharing"

import { Text } from "@/components/Text"
import {
  clearAllLogs,
  getTodayLogPath,
  readAllTodayLogLines,
} from "@/services/observability/persistentLog"
import { LOCAL_THEME } from "@/utils/localTheme"

import { InspectorCard } from "./InspectorCard"
import { StatusPill } from "./StatusPill"

export const LogsCard: FC = () => {
  const { colors } = LOCAL_THEME
  const [lines, setLines] = useState<string[]>([])
  const [busyKind, setBusyKind] = useState<"copy" | "export" | "clear" | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const tail = await readAllTodayLogLines()
      setLines(tail)
    } catch (err) {
      console.warn("[LogsCard] read failed", err)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 3_000)
    return () => clearInterval(id)
  }, [refresh])

  const flashToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 1500)
  }

  const onCopy = useCallback(async () => {
    setBusyKind("copy")
    try {
      await Clipboard.setStringAsync(lines.join("\n"))
      flashToast("Copied")
    } catch (err) {
      console.warn("[LogsCard] copy failed", err)
      flashToast("Couldn't copy")
    } finally {
      setBusyKind(null)
    }
  }, [lines])

  const onClear = useCallback(async () => {
    setBusyKind("clear")
    try {
      await clearAllLogs()
      setLines([])
      flashToast("Cleared")
    } catch (err) {
      console.warn("[LogsCard] clear failed", err)
      flashToast("Couldn't clear")
    } finally {
      setBusyKind(null)
    }
  }, [])

  const onExport = useCallback(async () => {
    setBusyKind("export")
    try {
      const path = await getTodayLogPath()
      if (!path) return
      const available = await Sharing.isAvailableAsync()
      if (!available) {
        flashToast("Sharing unavailable")
        return
      }
      await Sharing.shareAsync(path, {
        UTI: "public.plain-text",
        mimeType: "text/plain",
        dialogTitle: "Export noop log",
      })
    } catch (err) {
      console.warn("[LogsCard] export failed", err)
      flashToast("Couldn't export")
    } finally {
      setBusyKind(null)
    }
  }, [])

  return (
    <InspectorCard
      title="Logs"
      pill={<StatusPill tone="dim" text={`${lines.length} lines`} />}
      defaultExpanded={false}
    >
      <View style={$header}>
        <Text
          text={toast ?? "Today's persistent log · 7-day retention"}
          size="xxs"
          style={{ color: colors.textDim }}
        />
        <View style={$btnRow}>
          <TouchableOpacity
            onPress={onCopy}
            disabled={busyKind != null || lines.length === 0}
            style={[
              $iconBtn,
              { backgroundColor: colors.surfaceElevated },
              busyKind != null || lines.length === 0 ? { opacity: 0.4 } : null,
            ]}
            accessibilityLabel="Copy logs"
          >
            <CopyIcon size={13} color={colors.text} weight="regular" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onExport}
            disabled={busyKind != null || lines.length === 0}
            style={[
              $iconBtn,
              { backgroundColor: colors.surfaceElevated },
              busyKind != null || lines.length === 0 ? { opacity: 0.4 } : null,
            ]}
            accessibilityLabel="Export logs"
          >
            <ExportIcon size={13} color={colors.text} weight="regular" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClear}
            disabled={busyKind != null || lines.length === 0}
            style={[
              $iconBtn,
              { backgroundColor: colors.surfaceElevated },
              busyKind != null || lines.length === 0 ? { opacity: 0.4 } : null,
            ]}
            accessibilityLabel="Clear logs"
          >
            <TrashIcon size={13} color={colors.statusRed} weight="regular" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={$scroller} nestedScrollEnabled>
        {lines.length === 0 ? (
          <Text
            text="No entries yet"
            size="xs"
            style={{ color: colors.textDim, padding: 8 }}
          />
        ) : (
          lines.map((line, idx) => (
            <Text
              key={idx}
              text={line}
              size="xxs"
              style={{
                color: colorForLine(line, colors),
                fontVariant: ["tabular-nums"],
                fontFamily: "Menlo",
                paddingVertical: 2,
                paddingHorizontal: 6,
              }}
            />
          ))
        )}
      </ScrollView>
    </InspectorCard>
  )
}

function colorForLine(line: string, colors: typeof LOCAL_THEME.colors): string {
  if (line.includes(" ERROR ")) return colors.statusRed
  if (line.includes(" WARN ")) return colors.statusAmber
  return colors.text
}

const $header: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingBottom: 8,
  gap: 8,
}
const $btnRow: ViewStyle = { flexDirection: "row", gap: 6 }
const $iconBtn: ViewStyle = {
  width: 26,
  height: 26,
  borderRadius: 8,
  alignItems: "center",
  justifyContent: "center",
}
const $scroller: ViewStyle = { maxHeight: 280 }
