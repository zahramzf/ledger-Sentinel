# Ledger Witness — 2 Minute Demo Script

## Goal

Show how an AI can propose a risky action, the policy engine blocks autonomous execution, and a human approves the exact intent through Ledger before privileged execution proceeds.

---

## Scene 1 — Opening hook (0:00–0:20)

Narration:
"AI systems are powerful, but the real risk is not intelligence — it is unchecked execution. Ledger Witness creates a trust boundary between AI recommendation and privileged action."

On screen:

- App title: Ledger Witness MVP
- Hero section with headline: "AI proposes. Ledger approves."
- Subtitle explaining that this prototype separates AI reasoning from privileged execution.

Visual cue:

- Slow zoom in on the hero dashboard
- Keep the UI clean and dark with a confident, polished presentation

---

## Scene 2 — Ask Witness (0:20–0:50)

Narration:
"A user describes a suspected incident: our production API credentials may have been compromised. Witness investigates and recommends the safest response."

On screen:

- Ask Witness panel
- Incident text:
  "Our production API credentials may have been compromised. Investigate the situation and recommend the safest response."
- Click "Ask Witness"
- The recommendation appears:
  "Recommended action: Rotate production API credential. Explanation: Potential credential exposure creates a risk of unauthorized access."

Visual cue:

- Highlight the recommendation card and action field

---

## Scene 3 — Risk evaluation and policy block (0:50–1:20)

Narration:
"The action is classified as critical. The policy engine raises the risk score and blocks autonomous execution. This is the core trust boundary: AI can recommend, but it cannot execute without human authorization."

On screen:

- Risk score jumps high / critical
- Consent remains verified
- Action remains in the approval flow
- The action card shows the exact risk and approval requirement

Visual cue:

- Highlight the risk score and authorization badge
- Show the message: "High-risk action requires Ledger-backed authorization before it can execute."

---

## Scene 4 — Authorization request review (1:20–1:45)

Narration:
"Before the action can proceed, the system presents the exact intent being authorized. The user sees what is being asked, why it is required, what resource is affected, and when the approval expires."

On screen:

- Expand the authorization detail card
- Show fields:
  - Requested action
  - Requested by: AI Security Agent
  - Resource: Production API Key
  - Risk: Critical
  - Reason: Potential credential compromise
  - Expires: 30 minutes
  - Intent hash: generated
  - Signature status: Not signed yet

Visual cue:

- Animate the approval card into focus
- Keep it readable and structured

---

## Scene 5 — Ledger approval and execution (1:45–2:00)

Narration:
"With a compatible Ledger device connected, the exact signed intent is reviewed and approved on hardware, verified cryptographically, and then the only allowed privileged action is executed."

On screen:

- Click "Approve on Ledger"
- Device confirmation status changes to approved
- Signature status changes to verified on Ledger
- Execution button becomes enabled
- Click "Execute Authorized Action"
- Final confirmation appears: action executed, credential rotated, approval consumed

Closing line:
"AI proposes. Policy constrains. Humans approve. Ledger signs. Witness verifies."

---

## Recording tips

- Use a 1080p browser capture in OBS or Loom
- Keep the screen at 100% zoom for legibility
- Use smooth mouse movements and short pauses between actions
- Keep narration concise and confident
- Record a few seconds of pause before each click to make the flow readable

## Suggested record timing

- 0:00–0:15: open on dashboard
- 0:15–0:45: Ask Witness input and recommendation
- 0:45–1:15: risk scoring and policy block
- 1:15–1:45: readable authorization request
- 1:45–2:00: Ledger approval and execution

## Optional text overlay

Add a simple title overlay during the demo:
"Ledger Witness — Human approval for AI-driven credential actions"
