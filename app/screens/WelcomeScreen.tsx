import { FC } from "react"
import { Image, ImageStyle } from "react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { YStack } from "@/components/tamagui-primitives"
import { useAuth } from "@/context/AuthContext"
import { isRTL } from "@/i18n"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useHeader } from "@/utils/useHeader"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

const welcomeLogo = require("@assets/images/logo.png")
const welcomeFace = require("@assets/images/welcome-face.png")

interface WelcomeScreenProps extends AppStackScreenProps<"Main"> {}

export const WelcomeScreen: FC<WelcomeScreenProps> = function WelcomeScreen(_props) {
  const { navigation } = _props
  const { logout } = useAuth()

  function goNext() {
    navigation.navigate("Main" as any)
  }

  useHeader(
    {
      rightTx: "common:logOut",
      onRightPress: logout,
    },
    [logout],
  )

  const $bottomContainerInsets = useSafeAreaInsetsStyle(["bottom"])

  return (
    <YStack flex={1}>
      <YStack flex={1} flexBasis="57%" justifyContent="center" paddingHorizontal={24}>
        <Image style={$welcomeLogo} source={welcomeLogo} resizeMode="contain" />
        <Text
          testID="welcome-heading"
          style={{ marginBottom: 16 }}
          tx="welcomeScreen:readyForLaunch"
          preset="heading"
        />
        <Text tx="welcomeScreen:exciting" preset="subheading" />
        <Image style={$welcomeFace} source={welcomeFace} resizeMode="contain" tintColor="#000000" />
      </YStack>

      <YStack
        flexBasis="43%"
        backgroundColor="#FFFFFF"
        borderTopLeftRadius={16}
        borderTopRightRadius={16}
        paddingHorizontal={24}
        justifyContent="space-around"
        style={$bottomContainerInsets}
      >
        <Text tx="welcomeScreen:postscript" size="md" />
        <Button
          testID="next-screen-button"
          preset="reversed"
          tx="welcomeScreen:letsGo"
          onPress={goNext}
        />
      </YStack>
    </YStack>
  )
}

const $welcomeLogo: ImageStyle = {
  height: 88,
  width: "100%",
  marginBottom: 48,
}

const $welcomeFace: ImageStyle = {
  height: 169,
  width: 269,
  position: "absolute",
  bottom: -47,
  right: -80,
  transform: [{ scaleX: isRTL ? -1 : 1 }],
}
