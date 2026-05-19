import { FC, useCallback, useEffect, useState } from "react"
import { ScrollView, TouchableOpacity, View, ViewStyle } from "react-native"
import * as Sharing from "expo-sharing"

import { Text } from "@/components/Text"
import {
  getTodayLogPath,
  readRecentLogLines,
} from "@/services/observability/persistentLog"
import { LOCAL_THEME } from "@/utils/localTheme"

import { InspectorCard } from "./InspectorCard"
import { StatusPill } from "./StatusPill"

// Tail of today's log file. Auto-refreshes every 3s while expanded.
// Tap "Export" to hand the file to iOS share sheet — AirDrop to Mac,
// paste into a Slack message, etc.
export const LogsCard: FC = () => {
  const { colors } = LOCAL_THEME
  const [lines, setLines] = useState<string[]>([])
  const [isExporting, setIsExporting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const tail = await readRecentLogLines(100)
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

  const onExport = useCallback(async () => {
    setIsExporting(true)
    try {
      const path = await getTodayLogPath()
      if (!path) return
      const available = await Sharing.isAvailableAsync()
      if (!available) {
        console.warn("[LogsCard] sharing not available on this device")
        return
      }
      await Sharing.shareAsync(path, {
        UTI: "public.plain-text",
        mimeType: "text/plain",
        dialogTitle: "Export noop log",
      })
    } catch (err) {
      console.warn("[LogsCard] export failed", err)
    } finally {
      setIsExporting(false)
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
          text="Today's persistent log (newest first). 7-day rolling retention."
          size="xxs"
          style={{ color: colors.textDim }}
        />
        <TouchableOpacity
          onPress={onExport}
          disabled={isExporting || lines.length === 0}
          style={[
            $exportBtn,
            { backgroundColor: colors.surfaceElevated },
            (isExporting || lines.length === 0) ? { opacity: 0.4 } : null,
          ]}
        >
          <Text
            text={isExporting ? "Exporting…" : "Export"}
            size="xxs"
            weight="semiBold"
            style={{ color: colors.text }}
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={$scroller} nestedScrollEnabled>
        {lines.length === 0 ? (
          <Text text="No entries yet" size="xs" style={{ color: colors.textDim, padding: 8 }} />
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

const $exportBtn: ViewStyle = {
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 8,
}

const $scroller: ViewStyle = {
  maxHeight: 280,
}
