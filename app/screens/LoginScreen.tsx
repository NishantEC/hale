import { ComponentType, FC, useMemo, useRef, useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { ActivityIndicator, TextInput, TextStyle, ViewStyle } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"

import { Button } from "@/components/Button"
import { PressableIcon } from "@/components/Icon"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField, type TextFieldAccessoryProps } from "@/components/TextField"
import { useAuth } from "@/context/AuthContext"
import { login as apiLogin, register as apiRegister } from "@/services/api/noopClient"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export const LoginScreen: FC = () => {
  const authPasswordInput = useRef<TextInput>(null)

  const [authPassword, setAuthPassword] = useState("")
  const [isAuthPasswordHidden, setIsAuthPasswordHidden] = useState(true)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [attemptsCount, setAttemptsCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const { authEmail, setAuthEmail, setAuthToken, validationError } = useAuth()

  const {
    themed,
    theme: { colors },
  } = useAppTheme()

  const error = isSubmitted ? validationError : ""

  async function handleAuth() {
    setIsSubmitted(true)
    setAttemptsCount(attemptsCount + 1)
    setAuthError(null)

    if (validationError) return

    setIsLoading(true)
    try {
      let success: boolean
      if (isSignUp) {
        success = await apiRegister(authEmail ?? "", authPassword)
      } else {
        success = await apiLogin(authEmail ?? "", authPassword)
      }

      if (success) {
        const token = await AsyncStorage.getItem("sessionToken")
        if (token) {
          setIsSubmitted(false)
          setAuthPassword("")
          setAuthToken(token)
        } else {
          setAuthError("Authentication succeeded but no token was returned.")
        }
      } else {
        setAuthError(isSignUp ? "Registration failed. Please try again." : "Invalid email or password.")
      }
    } catch (e: any) {
      setAuthError(e.message || "Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const PasswordRightAccessory: ComponentType<TextFieldAccessoryProps> = useMemo(
    () =>
      function PasswordRightAccessory(props: TextFieldAccessoryProps) {
        return (
          <PressableIcon
            icon={isAuthPasswordHidden ? "view" : "hidden"}
            color={colors.palette.neutral800}
            containerStyle={props.style}
            size={20}
            onPress={() => setIsAuthPasswordHidden(!isAuthPasswordHidden)}
          />
        )
      },
    [isAuthPasswordHidden, colors.palette.neutral800],
  )

  return (
    <Screen
      preset="auto"
      contentContainerStyle={themed($screenContentContainer)}
      safeAreaEdges={["top", "bottom"]}
    >
      <Text
        testID="login-heading"
        text={isSignUp ? "Create Account" : "Log In"}
        preset="heading"
        style={themed($logIn)}
      />
      <Text
        text={isSignUp ? "Enter your details to create an account" : "Enter your details to sign in"}
        preset="subheading"
        style={themed($enterDetails)}
      />

      {authError && (
        <Text text={authError} size="sm" weight="light" style={themed($hint)} />
      )}

      {attemptsCount > 2 && !authError && (
        <Text tx="loginScreen:hint" size="sm" weight="light" style={themed($hint)} />
      )}

      <TextField
        value={authEmail}
        onChangeText={setAuthEmail}
        containerStyle={themed($textField)}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        labelTx="loginScreen:emailFieldLabel"
        placeholderTx="loginScreen:emailFieldPlaceholder"
        helper={error}
        status={error ? "error" : undefined}
        onSubmitEditing={() => authPasswordInput.current?.focus()}
        editable={!isLoading}
      />

      <TextField
        ref={authPasswordInput}
        value={authPassword}
        onChangeText={setAuthPassword}
        containerStyle={themed($textField)}
        autoCapitalize="none"
        autoComplete="password"
        autoCorrect={false}
        secureTextEntry={isAuthPasswordHidden}
        labelTx="loginScreen:passwordFieldLabel"
        placeholderTx="loginScreen:passwordFieldPlaceholder"
        onSubmitEditing={handleAuth}
        RightAccessory={PasswordRightAccessory}
        editable={!isLoading}
      />

      <Button
        testID="login-button"
        text={isLoading ? undefined : isSignUp ? "Create Account" : "Sign In"}
        style={themed($tapButton)}
        preset="reversed"
        onPress={handleAuth}
        disabled={isLoading}
      >
        {isLoading ? <ActivityIndicator color={colors.palette.neutral100} /> : undefined}
      </Button>

      <Button
        text={isSignUp ? "Already have an account? Sign In" : "Don't have an account? Create Account"}
        style={themed($toggleButton)}
        preset="default"
        onPress={() => {
          setIsSignUp(!isSignUp)
          setAuthError(null)
          setIsSubmitted(false)
        }}
        disabled={isLoading}
      />
    </Screen>
  )
}

const $screenContentContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.xxl,
  paddingHorizontal: spacing.lg,
})

const $logIn: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.sm,
})

const $enterDetails: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $hint: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.tint,
  marginBottom: spacing.md,
})

const $textField: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $tapButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.xs,
})

const $toggleButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.md,
})
