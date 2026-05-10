import { FC, useRef, useState } from "react"
import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"
// eslint-disable-next-line no-restricted-imports
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { Text } from "@/components/Text"
import { useAuth } from "@/context/AuthContext"
import { login as apiLogin, register as apiRegister } from "@/services/api/noopClient"
import { LOCAL_THEME } from "@/utils/localTheme"

export const LoginScreen: FC = () => {
  const colors = LOCAL_THEME.colors
  const isDark = LOCAL_THEME.isDark
  const passwordInputRef = useRef<TextInput>(null)

  // Persisted auth state lives in MMKV via useAuth(); the form input is kept in
  // local React state so that fast typing / iOS Passwords autofill don't bounce
  // through MMKV's write→read cycle. We sync to MMKV only on successful login.
  const { authEmail: persistedEmail, setAuthEmail, setAuthToken } = useAuth()
  const [email, setEmail] = useState<string>(persistedEmail ?? "")
  const [authPassword, setAuthPassword] = useState("")
  const [isPasswordHidden, setIsPasswordHidden] = useState(true)
  const [isSignUp, setIsSignUp] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const localValidationError = validateEmail(email)
  const emailError = isSubmitted ? localValidationError : ""

  async function handleAuth() {
    setIsSubmitted(true)
    setAuthError(null)
    if (localValidationError) return
    if (!authPassword) {
      setAuthError("Please enter your password.")
      return
    }
    setIsLoading(true)
    try {
      // Persist to MMKV right before the API call so the AuthProvider
      // (and any downstream readers) see the same email we authed with.
      setAuthEmail(email)
      const success = isSignUp
        ? await apiRegister(email, authPassword)
        : await apiLogin(email, authPassword)
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
        setAuthError(
          isSignUp ? "Registration failed. Please try again." : "Invalid email or password.",
        )
      }
    } catch (e: any) {
      setAuthError(e?.message ?? "Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  function validateEmail(value: string): string {
    if (!value || value.length === 0) return "can't be blank"
    if (value.length < 6) return "must be at least 6 characters"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "must be a valid email address"
    return ""
  }

  function switchMode(next: boolean) {
    if (next === isSignUp) return
    setIsSignUp(next)
    setAuthError(null)
    setIsSubmitted(false)
  }

  const cardShadow = Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.5 : 0.15,
      shadowRadius: 24,
    },
    android: { elevation: 6 },
  })

  return (
    <View style={[$root, { backgroundColor: colors.background }]}>
      <SafeAreaView style={$safe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={$flex}
        >
          <ScrollView contentContainerStyle={$scroll} keyboardShouldPersistTaps="handled">
            <View style={$brand}>
              <View style={[$logoChip, { backgroundColor: colors.surfaceCard }]}>
                <View style={[$logoDot, { backgroundColor: colors.tint }]} />
              </View>
              <Text text="NOOP" style={{ ...$brandText, color: colors.text }} />
            </View>

            <View style={{ marginBottom: 32 }}>
              <Text
                text={isSignUp ? "Create account" : "Welcome back"}
                style={{
                  color: colors.text,
                  fontSize: 34,
                  fontWeight: "700",
                  letterSpacing: -0.6,
                  lineHeight: 40,
                  marginBottom: 8,
                }}
              />
              <Text
                text={isSignUp ? "A few details and you're in." : "Sign in to sync your data."}
                style={{ color: colors.textDim, fontSize: 15, lineHeight: 22 }}
              />
            </View>

            <View style={[$segmentRow, { backgroundColor: colors.surfaceCard }]}>
              <Pressable
                onPress={() => switchMode(false)}
                style={[
                  $segmentBtn,
                  !isSignUp && {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text
                  text="Sign in"
                  style={{
                    color: !isSignUp ? colors.text : colors.textDim,
                    fontSize: 13,
                    fontWeight: "700",
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                  }}
                />
              </Pressable>
              <Pressable
                onPress={() => switchMode(true)}
                style={[
                  $segmentBtn,
                  isSignUp && {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text
                  text="Sign up"
                  style={{
                    color: isSignUp ? colors.text : colors.textDim,
                    fontSize: 13,
                    fontWeight: "700",
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                  }}
                />
              </Pressable>
            </View>

            {authError ? (
              <View
                style={[
                  $errorBanner,
                  { backgroundColor: colors.errorBackground, borderColor: colors.error },
                ]}
              >
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text
                  text={authError}
                  style={{ color: colors.error, flex: 1, fontSize: 13, lineHeight: 18 }}
                />
              </View>
            ) : null}

            <View style={{ marginBottom: 16 }}>
              <Text
                text="EMAIL"
                style={{
                  color: colors.textDim,
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                  marginBottom: 8,
                  marginLeft: 8,
                }}
              />
              <View
                style={[
                  $inputWrap,
                  { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                ]}
              >
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@domain.com"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="next"
                  textContentType="emailAddress"
                  importantForAutofill="yes"
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  editable={!isLoading}
                  style={[$input, { color: colors.text }]}
                  selectionColor={colors.tint}
                />
              </View>
              {emailError ? (
                <Text
                  text={`Email ${emailError}`}
                  style={{ color: colors.error, fontSize: 12, marginTop: 6, marginLeft: 8 }}
                />
              ) : null}
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text
                text="PASSWORD"
                style={{
                  color: colors.textDim,
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                  marginBottom: 8,
                  marginLeft: 8,
                }}
              />
              <View
                style={[
                  $inputWrap,
                  { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                ]}
              >
                <TextInput
                  ref={passwordInputRef}
                  value={authPassword}
                  onChangeText={setAuthPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  autoCorrect={false}
                  secureTextEntry={isPasswordHidden}
                  returnKeyType="go"
                  textContentType={isSignUp ? "newPassword" : "password"}
                  importantForAutofill="yes"
                  onSubmitEditing={handleAuth}
                  editable={!isLoading}
                  style={[$input, { color: colors.text }]}
                  selectionColor={colors.tint}
                />
                <TouchableOpacity
                  onPress={() => setIsPasswordHidden((v) => !v)}
                  hitSlop={10}
                  style={$inputIconButton}
                >
                  <Ionicons
                    name={isPasswordHidden ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={colors.textDim}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <Pressable
              testID="login-button"
              onPress={handleAuth}
              disabled={isLoading}
              style={({ pressed }) => [
                $primaryBtn,
                {
                  backgroundColor: colors.tint,
                  ...cardShadow,
                },
                pressed && !isLoading && { opacity: 0.92, transform: [{ scale: 0.99 }] },
                isLoading && { opacity: 0.6 },
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text
                  text={isSignUp ? "Create account" : "Sign in"}
                  style={{ ...$primaryBtnText, color: colors.onPrimary }}
                />
              )}
            </Pressable>

            <View style={$footer}>
              <Text
                text={isSignUp ? "Already have an account?" : "Don't have an account?"}
                style={{ color: colors.textMuted, fontSize: 14 }}
              />
              <TouchableOpacity onPress={() => switchMode(!isSignUp)} hitSlop={6}>
                <Text
                  text={isSignUp ? "Sign in" : "Create one"}
                  style={{ color: colors.tint, fontSize: 14, fontWeight: "700" }}
                />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}

const $root: ViewStyle = { flex: 1 }
const $flex: ViewStyle = { flex: 1 }
const $safe: ViewStyle = { flex: 1 }
const $scroll: ViewStyle = {
  flexGrow: 1,
  paddingHorizontal: 24,
  paddingTop: 32,
  paddingBottom: 48,
}
const $brand: ViewStyle = {
  alignItems: "center",
  flexDirection: "row",
  gap: 10,
  marginBottom: 56,
}
const $logoChip: ViewStyle = {
  alignItems: "center",
  borderRadius: 9999,
  height: 28,
  justifyContent: "center",
  width: 28,
}
const $logoDot: ViewStyle = {
  borderRadius: 4,
  height: 8,
  width: 8,
}
const $brandText: TextStyle = {
  fontSize: 13,
  fontWeight: "700",
  letterSpacing: 4,
}
const $segmentRow: ViewStyle = {
  borderRadius: 9999,
  flexDirection: "row",
  marginBottom: 24,
  padding: 4,
}
const $segmentBtn: ViewStyle = {
  alignItems: "center",
  borderRadius: 9999,
  flex: 1,
  justifyContent: "center",
  paddingVertical: 10,
}
const $errorBanner: ViewStyle = {
  alignItems: "center",
  borderRadius: 12,
  borderWidth: 1,
  flexDirection: "row",
  gap: 8,
  marginBottom: 16,
  paddingHorizontal: 12,
  paddingVertical: 10,
}
const $inputWrap: ViewStyle = {
  alignItems: "center",
  borderRadius: 9999,
  borderWidth: 1,
  flexDirection: "row",
  minHeight: 52,
  overflow: "hidden",
  paddingHorizontal: 18,
}
const $input: TextStyle = {
  flex: 1,
  fontSize: 16,
  paddingVertical: 14,
}
const $inputIconButton: ViewStyle = {
  alignItems: "center",
  height: 36,
  justifyContent: "center",
  width: 36,
}
const $primaryBtn: ViewStyle = {
  alignItems: "center",
  borderRadius: 9999,
  flexDirection: "row",
  justifyContent: "center",
  marginTop: 8,
  minHeight: 56,
  paddingHorizontal: 16,
}
const $primaryBtnText: TextStyle = {
  fontSize: 14,
  fontWeight: "700",
  letterSpacing: 1.4,
  textTransform: "uppercase",
}
const $footer: ViewStyle = {
  alignItems: "center",
  flexDirection: "row",
  gap: 6,
  justifyContent: "center",
  marginTop: 24,
}
