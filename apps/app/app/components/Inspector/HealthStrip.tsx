import { FC } from "react"
import { View, ViewStyle } from "react-native"
import { Bluetooth, Cloud, DeviceMobile } from "phosphor-react-native"

import { Chip } from "./Chip"
import { CoverageRingChip } from "./CoverageRingChip"
import {
  strapChipState,
  phoneChipState,
  backendChipState,
  type StrapInput,
  type PhoneInput,
  type BackendInput,
} from "./selectors"

type Props = {
  strap: StrapInput
  phone: PhoneInput
  backend: BackendInput
  coveragePercent: number
  onTapPhone?: () => void
}

export const HealthStrip: FC<Props> = ({
  strap,
  phone,
  backend,
  coveragePercent,
  onTapPhone,
}) => {
  const s = strapChipState(strap)
  const p = phoneChipState(phone)
  const b = backendChipState(backend)

  return (
    <View style={$row}>
      <Chip icon={Bluetooth} name="Strap" sub={s.sub} dot={s.dot} />
      <Chip icon={DeviceMobile} name="Phone" sub={p.sub} dot={p.dot} onPress={onTapPhone} />
      <Chip icon={Cloud} name="Backend" sub={b.sub} dot={b.dot} />
      <CoverageRingChip percent={coveragePercent} />
    </View>
  )
}

const $row: ViewStyle = { flexDirection: "row", gap: 6, marginBottom: 14 }
