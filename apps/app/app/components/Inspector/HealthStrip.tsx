import { FC } from "react"
import { View, ViewStyle } from "react-native"
import { Bluetooth, DeviceMobile } from "phosphor-react-native"

import { Chip } from "./Chip"
import { CoverageRingChip } from "./CoverageRingChip"
import {
  strapChipState,
  phoneChipState,
  type StrapInput,
  type PhoneInput,
} from "./selectors"

type Props = {
  strap: StrapInput
  phone: PhoneInput
  coveragePercent: number
  onTapPhone?: () => void
}

export const HealthStrip: FC<Props> = ({
  strap,
  phone,
  coveragePercent,
  onTapPhone,
}) => {
  const s = strapChipState(strap)
  const p = phoneChipState(phone)

  return (
    <View style={$row}>
      <Chip icon={Bluetooth} name="Strap" sub={s.sub} dot={s.dot} />
      <Chip icon={DeviceMobile} name="Phone" sub={p.sub} dot={p.dot} onPress={onTapPhone} />
      <CoverageRingChip percent={coveragePercent} />
    </View>
  )
}

const $row: ViewStyle = { flexDirection: "row", gap: 6, marginBottom: 14 }
