import { FC } from "react"

import { StatCard, type StatChipData } from "@/components/home/StatCard"

export type MetricCell = StatChipData

type Props = {
  cells: MetricCell[]
  footer?: string
}

export const MetricsBar: FC<Props> = ({ cells, footer }) => {
  return <StatCard chips={cells} footer={footer} />
}
