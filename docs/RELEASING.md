# Optional release signing

The package workflow builds unsigned downloads when signing secrets are absent. Supplying signing credentials enables signing for that platform. A configured signing or notarization failure fails the job instead of publishing an unsigned replacement.

| GitHub Actions secret | Purpose |
| --- | --- |
| `MAC_CSC_LINK` | Base64 Developer ID Application certificate with its private key, in P12 format |
| `MAC_CSC_KEY_PASSWORD` | P12 password |
| `APPLE_API_KEY_CONTENT` | App Store Connect API private key, PEM or base64 |
| `APPLE_API_KEY_ID` | API key ID |
| `APPLE_API_ISSUER` | API issuer ID |
| `WIN_CSC_LINK` | Windows code-signing PFX supported by the signing provider |
| `WIN_CSC_KEY_PASSWORD` | PFX password |

macOS packages use hardened runtime and notarization. CI validates the stapled ticket and Gatekeeper assessment. Windows packages verify Authenticode on both the application and installer. Keep all keys in encrypted secrets. Never commit certificate files, passwords or API keys.

The App Store signing configuration is independent of this workflow.
