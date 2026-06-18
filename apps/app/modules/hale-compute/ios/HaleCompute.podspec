Pod::Spec.new do |s|
  s.name           = 'HaleCompute'
  s.version        = '1.0.0'
  s.summary        = 'On-device derived-metrics compute (Hale Rust core via UniFFI)'
  s.description    = 'Expo module wrapping the Hale compute-engine Rust core, cross-compiled for iOS and bridged with UniFFI.'
  s.author         = 'Hale'
  s.homepage       = 'https://github.com/your-org/hale'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/hale/hale.git', :tag => "#{s.version}" }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # The Rust core ships as a static-library xcframework (device + sim slices).
  # CocoaPods' `vendored_frameworks` adds only a bare `-lhale_compute_engine`
  # to the app link with no search path for a *static* xcframework (→ "library
  # not found"), so instead we link the correct slice explicitly by full path
  # (SDK-conditioned) on the consuming app target. `-force_load` keeps the
  # UniFFI scaffolding symbols, which would otherwise be dead-stripped.
  s.preserve_paths = 'HaleComputeFFI.xcframework', 'hale_compute_engineFFI.h'
  s.user_target_xcconfig = {
    # Pick the matching xcframework slice per SDK via a helper var, then add a
    # single force_load to the *base* OTHER_LDFLAGS WITH $(inherited) — an
    # SDK-qualified OTHER_LDFLAGS[...] would replace (not extend) the app's
    # existing flags and drop every other pod's linkage.
    "HALE_COMPUTE_SLICE[sdk=iphoneos*]" => "ios-arm64",
    "HALE_COMPUTE_SLICE[sdk=iphonesimulator*]" => "ios-arm64-simulator",
    "OTHER_LDFLAGS" =>
      '$(inherited) -force_load "${PODS_ROOT}/../../modules/hale-compute/ios/HaleComputeFFI.xcframework/${HALE_COMPUTE_SLICE}/libhale_compute_engine.a"',
  }

  # UniFFI-generated Swift + the Expo module wrapper, plus the UniFFI C header.
  # Exposing the C header as a PUBLIC header folds the low-level FFI symbols
  # (RustBuffer/RustCallStatus + the extern fns) into THIS pod's clang module,
  # so the generated Swift sees them directly and downstream importers (Expo's
  # ExpoModulesProvider) don't have to resolve a separate FFI module. The
  # actual symbols link from the vendored static libs.
  s.source_files = '*.swift', 'hale_compute_engineFFI.h'
  s.public_header_files = 'hale_compute_engineFFI.h'
end
