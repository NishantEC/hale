import { ComponentType, FC, useMemo, useRef, useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { ActivityIndicator, ScrollView, TextInput } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"

import { Button } from "@/components/Button"
import { PressableIcon } from "@/components/Icon"
import { Text } from "@/components/Text"
import { TextField, type TextFieldAccessoryProps } from "@/components/TextField"
import { YStack } from "@/components/tamagui-primitives"
import { useAuth } from "@/context/AuthContext"
import { login as apiLogin, register as apiRegister } from "@/services/api/noopClient"

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
            color="#191015"
            containerStyle={props.style}
            size={20}
            onPress={() => setIsAuthPasswordHidden(!isAuthPasswordHidden)}
          />
        )
      },
    [isAuthPasswordHidden],
  )

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 48, paddingHorizontal: 24 }}>
      <YStack gap={0}>
        <Text
          testID="login-heading"
          text={isSignUp ? "Create Account" : "Log In"}
          preset="heading"
          style={{ marginBottom: 12 }}
        />
        <Text
          text={isSignUp ? "Enter your details to create an account" : "Enter your details to sign in"}
          preset="subheading"
          style={{ marginBottom: 24 }}
        />

        {authError && (
          <Text text={authError} size="sm" weight="light" style={{ color: "#C76542", marginBottom: 16 }} />
        )}

        {attemptsCount > 2 && !authError && (
          <Text tx="loginScreen:hint" size="sm" weight="light" style={{ color: "#C76542", marginBottom: 16 }} />
        )}

        <TextField
          value={authEmail}
          onChangeText={setAuthEmail}
          containerStyle={{ marginBottom: 24 }}
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
          containerStyle={{ marginBottom: 24 }}
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
          style={{ marginTop: 8 }}
          preset="reversed"
          onPress={handleAuth}
          disabled={isLoading}
        >
          {isLoading ? <ActivityIndicator color="#FFFFFF" /> : undefined}
        </Button>

        <Button
          text={isSignUp ? "Already have an account? Sign In" : "Don't have an account? Create Account"}
          style={{ marginTop: 16 }}
          preset="default"
          onPress={() => {
            setIsSignUp(!isSignUp)
            setAuthError(null)
            setIsSubmitted(false)
          }}
          disabled={isLoading}
        />
      </YStack>
    </ScrollView>
  )
}
