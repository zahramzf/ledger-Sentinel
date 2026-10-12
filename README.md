# Ledger Sentinel

Ledger Sentinel is a browser-based trust layer for AI-driven actions. An AI can recommend a privileged action, but the action cannot execute until a human approves the exact intent on a physical Ledger device and the signature is verified against the recovered address.

## What is implemented in the MVP

This prototype implements the Ledger-aligned authorization flow described in the official Ledger AI / DMK guidance:

- Device Management Kit discovery and session setup
- WebHID Ledger connection in the browser
- Ethereum signer construction with `SignerEthBuilder` and the required origin token
- Human-readable authorization payloads before approval
- Ledger `signMessage` approval flow
- real AI recommendation call through a backend endpoint when configured
- deterministic fallback recommendation text when no model key is present
- deterministic intent hashing with SHA-256
- exact-intent binding before execution
- fail-closed behavior when no Ledger is connected
- signature verification using `ethers.verifyMessage()`
- approval expiry enforcement
- tamper detection after approval
- a privileged demo state transition: a production credential version increments only after signature verification

## Ledger guidance reflected in this implementation

This project follows the same operational pattern emphasized by Ledger's docs:

- Agent Stack / Ledger CLI: AI and automation can propose actions, but secrets and privileged flows remain separated from execution logic.
- DMK Skills: the app integrates the signer and keeps a human-in-the-loop approval gate.
- Signer (DMK): the hardware signer is the final authorization authority, not the model.
- Human-readable authorization: the user is shown a readable summary of the exact approval request before signing.
- Wallet Provider: the browser-first flow is suitable for a first-party wallet or app experience.
- Security Key / OpenPGP: strong hardware-gated access patterns are preserved as a broader security model, even though this demo focuses on a signer-based approval gate.

## What is not implemented in this prototype

The following are intentionally not part of the live MVP:

- full Wallet CLI integration
- Key Ring secret storage backend
- full Clear Signing transaction pipeline
- Security Key / FIDO2 workflows
- OpenPGP decryption orchestration
- full immutable blockchain audit storage

These can be future extensions, but they are not the core of the current build.

## Security model

1. The AI proposes an action and the policy engine scores the risk.
2. The action is converted into a canonical intent object and a human-readable authorization payload bound to the full intent hash.
3. A single nonce is generated for that action lifecycle and retained during approval verification.
4. The intent is serialized, canonicalized, and hashed with SHA-256.
5. A Ledger device is discovered over WebHID and an Ethereum signer is created with the required origin token.
6. The exact action summary is displayed for human review and signed on the Ledger device.
7. The recovered address from the signature is compared with the Ledger-derived address.
8. The hash, nonce, signer address, and expiry are checked before execution.
9. If anything changes after approval, execution is blocked.

## Run locally

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:8000
```

## Run with Docker

This is the easiest way for a single person to run the project on one machine.

### 1) Build the image

```bash
docker build -t ledger-sentinel .
```

### 2) Start the app

```bash
docker run --rm -p 8000:8000 \
  -e OPENAI_API_KEY=your_openai_api_key_here \
  -e OPENAI_MODEL=gpt-4o-mini \
  --name ledger-sentinel \
  ledger-sentinel
```

If you do not want to use OpenAI, you can omit the `OPENAI_API_KEY` environment variable. The app will fall back to a deterministic recommendation instead.

Then open:

```text
http://localhost:8000
```

### 3) Optional: use a local env file

You can also create a `.env` file next to the project and pass it in with Docker:

```bash
cp .env.example .env
```

Then run:

```bash
docker run --rm -p 8000:8000 --env-file .env --name ledger-sentinel ledger-sentinel
```

## Hardware requirements

This prototype requires:

- Chrome or Edge
- a Ledger device connected over USB
- the Ethereum app open on the device
- permission for the browser to access the Ledger via WebHID

If no Ledger is attached, the app blocks execution and remains fail-closed.

## Demo behavior

The app models a privileged operation as an in-memory credential version transition. The credential version only changes after a valid Ledger-backed approval is verified.

This is enough to demonstrate the core Ledger trust boundary without pretending the app is operating a full enterprise credential backend.

## Credibility note

This project is strongest when described as:

- AI proposes a risky action
- policy evaluates the risk
- exact intent is bound to a hash and nonce
- Ledger authorizes the exact action on-device
- signature and signer address are verified
- execution only proceeds if the approved intent still matches and is not expired

That is the actual implementation in the current codebase.

## Future extensions

Potential next steps include:

- true backend credential rotation endpoints
- external service authorization flows
- stronger audit chaining or append-only evidence storage
- additional Ledger-backed workflows beyond message signing

## AI recommendation architecture

When an OpenAI API key is configured on the server side, Witness uses a backend endpoint to ask the model for a recommendation. Without one, it falls back to deterministic recommendation text. In either case, the policy engine and the Ledger authorization remain deterministic and hardware-backed.

This matters because the browser should never hold a production `OPENAI_API_KEY`. The correct deployment pattern is:

```text
Browser
  ↓
/api/recommend
  ↓
serverless function or backend
  ↓
OpenAI
```

The browser only calls the local API route; the key lives in server-side environment variables such as `OPENAI_API_KEY`.

## Architecture

```text
AI recommendation
      ↓
Policy engine
      ↓
Structured action intent
      ↓
Nonce + SHA-256 hash + expiry
      ↓
Ledger signer
      ↓
Human approval on device
      ↓
Signature verification and address recovery
      ↓
Execution gate
      ↓
Privileged state transition
```

This project aligns directly with Ledger's value proposition and the official docs:

- trust at the point of execution
- secure middleware for AI agents
- hardware-backed approval when the device path is proven live
- human-readable authorization and accountability
- secret handling and signing separated by design

It is not just "AI + wallet". It is "AI with a trust boundary" and a Ledger-controlled authorization gate.

The final proof point is a successful physical Ledger run: no device, no execution; device connected, signature verified, and intent unchanged, then the privileged action may proceed.
