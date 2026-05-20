import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { ActivityIndicator, TouchableOpacity, View, ViewStyle } from "react-native"
import { ArrowClockwise } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { LOCAL_THEME } from "@/utils/localTheme"
import { openDatabase } from "@/services/db"
import { countRawSensorRecordsPerHour } from "@/services/db/repositories/rawSensorRecord"
import { fetchDebugHourlyCoverage, type DebugHourlyCoverage } from "@/services/api/noopClient"
import { useOutboundQueueStats } from "@/hooks/useOutboundQueueStats"

import { InspectorCard } from "./InspectorCard"
import { StatusPill } from "./StatusPill"

const HOURS = 12

type Bucket = { hourStartUtc: string; local: number; backend: number }

function formatIstHour(iso: string): string {
  const ist = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000)
  const hh = ist.toISOString().slice(11, 13)
  const dd = ist.toISOString().slice(8, 10)
  return `${dd} ${hh}:00`
}

export const LocalVsBackendCard: FC = () => {
  const { colors } = LOCAL_THEME
  const queueStats = useOutboundQueueStats()
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const db = openDatabase()
      const [local, backend] = await Promise.all([
        countRawSensorRecordsPerHour(db, HOURS),
        fetchDebugHourlyCoverage(HOURS) as Promise<DebugHourlyCoverage>,
      ])
      const backendByHour = new Map(backend.series.map((s) => [s.hourStartUtc, s.rows]))
      const localByHour = new Map(local.map((s) => [s.hourStartUtc, s.rows]))
      const allHours = new Set<string>([...localByHour.keys(), ...backendByHour.keys()])
      const merged: Bucket[] = Array.from(allHours)
        .sort()
        .map((h) => ({
          hourStartUtc: h,
          local: localByHour.get(h) ?? 0,
          backend: backendByHour.get(h) ?? 0,
        }))
      setBuckets(merged)
      setGeneratedAt(backend.generatedAt)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const maxRows = useMemo(
    () => buckets.reduce((m, b) => Math.max(m, b.local, b.backend), 1),
    [buckets],
  )

  const totals = useMemo(() => {
    const l = buckets.reduce((s, b) => s + b.local, 0)
    const r = buckets.reduce((s, b) => s + b.backend, 0)
    return { local: l, backend: r, lag: l - r }
  }, [buckets])

  const pillTone = totals.lag > 50 ? "warn" : "ok"
  const pillText = `Δ ${totals.lag.toLocaleString()}`

  return (
    <InspectorCard
      title="Local vs Backend"
      pill={<StatusPill tone={pillTone} text={pillText} />}
      defaultExpanded
    >
      <View style={$headRow}>
        <Text
          text={`Last ${HOURS}h · phone-local SQLite vs backend rows per hour (IST)`}
          size="xxs"
          style={{ color: colors.textDim, flex: 1 }}
        />
        <TouchableOpacity onPress={() => void load()} disabled={loading} activeOpacity={0.7}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <ArrowClockwise size={16} color={colors.text} weight="regular" />
          )}
        </TouchableOpacity>
      </View>

      {error ? (
        <Text text={error} size="xxs" style={{ color: "#fca5a5", marginTop: 6 }} />
      ) : null}

      <View style={$summaryRow}>
        <Summary label="Local" value={totals.local} color="#86efac" />
        <Summary label="Backend" value={totals.backend} color="#7dd3fc" />
        <Summary
          label="Queue"
          value={queueStats.depth ?? 0}
          color={(queueStats.deadCount ?? 0) > 0 ? "#fca5a5" : colors.text}
        />
      </View>

      <View style={{ marginTop: 6 }}>
        <View style={[$legend, { borderTopColor: colors.divider }]}>
          <Legend dot="#86efac" label="local" />
          <Legend dot="#7dd3fc" label="backend" />
        </View>
        {buckets.map((b) => (
          <BucketRow
            key={b.hourStartUtc}
            label={formatIstHour(b.hourStartUtc)}
            local={b.local}
            backend={b.backend}
            max={maxRows}
          />
        ))}
      </View>

      {generatedAt ? (
        <Text
          text={`fetched ${formatIstHour(generatedAt)} IST`}
          size="xxs"
          style={{ color: colors.textDim, marginTop: 6 }}
        />
      ) : null}
    </InspectorCard>
  )
}

const Summary: FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => {
  const { colors } = LOCAL_THEME
  return (
    <View style={$summaryCell}>
      <Text text={label} size="xxs" style={{ color: colors.textDim }} />
      <Text
        text={value.toLocaleString()}
        size="sm"
        weight="semiBold"
        style={{ color, fontVariant: ["tabular-nums"] }}
      />
    </View>
  )
}

const Legend: FC<{ dot: string; label: string }> = ({ dot, label }) => {
  const { colors } = LOCAL_THEME
  return (
    <View style={$legendItem}>
      <View style={[$legendDot, { backgroundColor: dot }]} />
      <Text text={label} size="xxs" style={{ color: colors.textDim }} />
    </View>
  )
}

const BucketRow: FC<{ label: string; local: number; backend: number; max: number }> = ({
  label,
  local,
  backend,
  max,
}) => {
  const { colors } = LOCAL_THEME
  const localPct = Math.min(100, (local / max) * 100)
  const backendPct = Math.min(100, (backend / max) * 100)
  const lag = local - backend
  const lagColor = lag > 0 ? "#fcd34d" : lag < 0 ? "#fca5a5" : colors.textDim

  return (
    <View style={$bucketRow}>
      <Text
        text={label}
        size="xxs"
        style={{
          color: colors.textDim,
          width: 56,
          fontVariant: ["tabular-nums"],
        }}
      />
      <View style={$barsCol}>
        <View style={$barTrack}>
          <View style={[$barFill, { backgroundColor: "#86efac", width: `${localPct}%` }]} />
        </View>
        <View style={$barTrack}>
          <View style={[$barFill, { backgroundColor: "#7dd3fc", width: `${backendPct}%` }]} />
        </View>
      </View>
      <View style={$countsCol}>
        <Text
          text={local.toLocaleString()}
          size="xxs"
          style={{ color: "#86efac", fontVariant: ["tabular-nums"], textAlign: "right" }}
        />
        <Text
          text={backend.toLocaleString()}
          size="xxs"
          style={{ color: "#7dd3fc", fontVariant: ["tabular-nums"], textAlign: "right" }}
        />
      </View>
      <Text
        text={lag === 0 ? "·" : (lag > 0 ? "+" : "") + lag.toLocaleString()}
        size="xxs"
        weight="semiBold"
        style={{
          color: lagColor,
          width: 48,
          textAlign: "right",
          fontVariant: ["tabular-nums"],
        }}
      />
    </View>
  )
}

const $headRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
}

const $summaryRow: ViewStyle = {
  flexDirection: "row",
  marginTop: 8,
  marginBottom: 4,
  gap: 8,
}

const $summaryCell: ViewStyle = {
  flex: 1,
  alignItems: "flex-start",
}

const $legend: ViewStyle = {
  flexDirection: "row",
  gap: 12,
  paddingVertical: 6,
  borderTopWidth: 1,
}

const $legendItem: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 4,
}

const $legendDot: ViewStyle = {
  width: 8,
  height: 8,
  borderRadius: 4,
}

const $bucketRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingVertical: 3,
}

const $barsCol: ViewStyle = { flex: 1, gap: 2 }

const $barTrack: ViewStyle = {
  height: 6,
  borderRadius: 3,
  backgroundColor: "#1f1f1f",
  overflow: "hidden",
}

const $barFill: ViewStyle = { height: "100%", borderRadius: 3 }

const $countsCol: ViewStyle = { width: 56, gap: 2 }
