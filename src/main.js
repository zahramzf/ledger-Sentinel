import './style.css';
import { DeviceManagementKitBuilder } from '@ledgerhq/device-management-kit';
import { webHidTransportFactory } from '@ledgerhq/device-transport-kit-web-hid';
import { SignerEthBuilder } from '@ledgerhq/device-signer-kit-ethereum';
import { Signature, verifyMessage } from 'ethers';

const LEDGER_VENDOR_ID = 0x2c97;
const DERIVATION_PATH = "44'/60'/0'/0/0";
const APP_ORIGIN_TOKEN = 'ledger-witness-demo';

const buildClearSigningMessage = async (intent) => {
  const parameters = intent?.parameters || {};
  const action = intent?.action || 'Unknown action';
  const risk = intent?.riskLevel || 'High';
  const expiry = intent?.expiry || 'Not set';
  const nonce = intent?.nonce || 'Not set';
  const timestamp = intent?.timestamp || 'Not set';
  const fullIntentHash = await hashIntent(intent);
  const intentHashHex = bytesToHex(fullIntentHash);

  return [
    'Ledger Witness Authorization v1',
    `Intent hash: ${intentHashHex}`,
    `Action: ${action}`,
    `Resource: ${intent?.resource || 'unspecified resource'}`,
    `Operation type: ${parameters.type || 'unspecified operation'}`,
    `Risk: ${risk}`,
    `Target: ${parameters.target || 'unspecified target'}`,
    `Reason: ${parameters.reason || 'human review required'}`,
    `Scope: ${parameters.scope || 'unspecified scope'}`,
    `Owner: ${parameters.owner || 'unspecified owner'}`,
    `Timestamp: ${timestamp}`,
    `Valid until: ${expiry}`,
    `Nonce: ${nonce}`,
    'Review the exact action above on the Ledger device before approving. This authorization applies only to the exact intent presented here.',
  ].join('\n');
};

const state = {
  riskScore: 0,
  riskLabel: 'Awaiting review',
  ledgerConnected: false,
  realLedgerSigner: false,
  auditEntries: [],
  approvedIntent: null,
  approvedIntentHash: null,
  approvedSignature: null,
  credentialVersion: 14,
  ledgerSdk: null,
  ledgerSessionId: null,
  ledgerSigner: null,
  ledgerAddress: null,
  executionResult: null,
  intentTimestamp: null,
  intentNonce: null,
  clearSigningText: '',
};

const riskScoreEl = document.getElementById('riskScore');
const riskLabelEl = document.getElementById('riskLabel');
const heroTrustValueEl = document.getElementById('heroTrustValue');
const consentStateEl = document.getElementById('consentState');
const auditCountEl = document.getElementById('auditCount');
const ledgerStateEl = document.getElementById('ledgerState');
const ledgerModeEl = document.getElementById('ledgerMode');
const ledgerBadgeEl = document.getElementById('ledgerBadge');
const actionBadgeEl = document.getElementById('actionBadge');
const detailActionEl = document.getElementById('detailAction');
const detailIntentEl = document.getElementById('detailIntent');
const detailRiskEl = document.getElementById('detailRisk');
const signedByEl = document.getElementById('signedBy');
const intentHashEl = document.getElementById('intentHash');
const signatureStatusEl = document.getElementById('signatureStatus');
const verificationStateEl = document.getElementById('verificationState');
const credentialStatusEl = document.getElementById('credentialStatus');
const tamperMessageEl = document.getElementById('tamperMessage');
const statusTextEl = document.getElementById('statusText');
const deviceStateEl = document.getElementById('deviceState');
const auditLogEl = document.getElementById('auditLog');
const aiRecommendationEl = document.getElementById('aiRecommendation');
const incidentInputEl = document.getElementById('incidentInput');
const incidentRecommendationEl = document.getElementById('incidentRecommendation');
const askWitnessBtnEl = document.getElementById('askWitnessBtn');
const approveBtnEl = document.getElementById('approveBtn');
const executeBtnEl = document.getElementById('executeBtn');
const actionInputEl = document.getElementById('actionInput');
const consentInputEl = document.getElementById('consentInput');
const severityInputEl = document.getElementById('severityInput');
const detailReasonEl = document.getElementById('detailReason');
const detailResourceEl = document.getElementById('detailResource');
const detailRequiredEl = document.getElementById('detailRequired');
const detailExpiryEl = document.getElementById('detailExpiry');

const sortObject = (value) => {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortObject(value[key]);
        return acc;
      }, {});
  }

  return value;
};

const canonicalizeIntent = (intent) => JSON.stringify(sortObject(intent));

const bytesToHex = (bytes) => Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
const generateIntentNonce = () => bytesToHex(crypto.getRandomValues(new Uint8Array(16)));

const createIntent = (action, riskLevel, resource = 'credential:production-api-key') => {
  const now = new Date();
  const timestamp = state.intentTimestamp || now.toISOString();
  const nonce = state.intentNonce || (state.intentNonce = generateIntentNonce());
  const expiry = new Date(new Date(timestamp).getTime() + 30 * 60 * 1000).toISOString();

  return {
    action,
    resource,
    parameters: {
      type: 'credential_rotation',
      target: 'production-api-key',
      reason: 'possible compromise',
      scope: 'ops',
      owner: 'automation-agent',
    },
    riskLevel,
    timestamp,
    expiry,
    nonce,
  };
};

const hashIntent = async (intent) => {
  const encoded = new TextEncoder().encode(canonicalizeIntent(intent));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return digest;
};

const generateAIRecommendation = async (action, riskLevel) => {
  const selectedAction = action || 'production credential rotation';
  const selectedRisk = riskLevel || 'High';

  try {
    const response = await fetch('/api/recommend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: selectedAction,
        riskLevel: selectedRisk,
        scenario: 'Production credential appeared in an unauthorized environment. Last rotation was 94 days ago.',
      }),
    });

    if (response.ok) {
      const payload = await response.json();
      const suggestion = payload?.recommendation || payload?.suggestion || payload?.message;

      if (suggestion) {
        return suggestion;
      }
    }
  } catch (error) {
    console.warn('AI recommendation route unavailable; using policy-safe fallback text.', error);
  }

  return `AI recommendation: ${selectedAction} because the risk signal indicates a ${selectedRisk.toLowerCase()} compromise and the policy engine requires explicit human approval before execution.`;
};

const getLedgerSigner = async () => {
  if (state.ledgerSigner && state.ledgerSessionId) {
    return state.ledgerSigner;
  }

  if (!('hid' in navigator)) {
    return null;
  }

  try {
    if (!state.ledgerSdk) {
      state.ledgerSdk = new DeviceManagementKitBuilder()
        .addTransport(webHidTransportFactory)
        .build();
    }

    const requestedDevices = await navigator.hid.requestDevice({
      filters: [{ vendorId: LEDGER_VENDOR_ID }],
    });

    if (!requestedDevices.length) {
      const discoveredDevices = await navigator.hid.getDevices();
      const ledgerDevice = discoveredDevices.find((device) => device.vendorId === LEDGER_VENDOR_ID);
      if (!ledgerDevice) {
        return null;
      }
    }

    const device = await new Promise((resolve, reject) => {
      const subscription = state.ledgerSdk.startDiscovering().subscribe({
        next: (nextDevice) => {
          subscription.unsubscribe();
          resolve(nextDevice);
        },
        error: (error) => {
          subscription.unsubscribe();
          reject(error);
        },
      });
    });

    if (!device) {
      return null;
    }

    const sessionId = await state.ledgerSdk.connect({
      device,
      sessionRefresherOptions: { isRefresherDisabled: true },
    });

    state.ledgerSessionId = sessionId;
    state.ledgerSigner = new SignerEthBuilder({
      dmk: state.ledgerSdk,
      sessionId,
      originToken: APP_ORIGIN_TOKEN,
    }).build();

    const { observable } = state.ledgerSigner.getAddress(DERIVATION_PATH, {
      checkOnDevice: false,
    });

    const ledgerAddress = await new Promise((resolve, reject) => {
      observable.subscribe({
        next: (update) => {
          if (update.status === 'completed') {
            resolve(update.output.address);
          }

          if (update.status === 'error') {
            reject(new Error(update.error?.message || 'Ledger address retrieval failed.'));
          }
        },
        error: reject,
      });
    });

    state.ledgerAddress = ledgerAddress;
    return state.ledgerSigner;
  } catch (error) {
    console.warn('Ledger device connection unavailable:', error);
    return null;
  }
};

const signIntentForApproval = async (intent) => {
  const ledgerSigner = await getLedgerSigner();

  if (!ledgerSigner || !state.ledgerSessionId) {
    return {
      signature: null,
      mode: 'ledger-required',
      ledgerAddress: null,
      clearSigningText: '',
    };
  }

  const clearSigningText = await buildClearSigningMessage(intent);
  state.clearSigningText = clearSigningText;

  const { observable, cancel } = ledgerSigner.signMessage(DERIVATION_PATH, clearSigningText);

  const signatureResult = await new Promise((resolve, reject) => {
    const subscription = observable.subscribe({
      next: (update) => {
        if (update.status === 'completed') {
          subscription.unsubscribe();
          resolve(update.output);
          return;
        }

        if (update.status === 'error') {
          subscription.unsubscribe();
          reject(new Error(update.error?.message || 'Ledger signature rejected.'));
        }
      },
      error: (error) => {
        subscription.unsubscribe();
        reject(error);
      },
    });
  }).catch((error) => {
    cancel();
    throw error;
  });

  return {
    signature: signatureResult,
    mode: 'ledger-device',
    ledgerAddress: state.ledgerAddress,
    clearSigningText,
  };
};

const verifyIntentSignature = async (message, signature, ledgerAddress) => {
  if (!signature || !ledgerAddress) {
    return false;
  }

  const recoveredAddress = verifyMessage(
    message,
    Signature.from({
      r: signature.r,
      s: signature.s,
      v: signature.v,
    }),
  );

  return recoveredAddress.toLowerCase() === ledgerAddress.toLowerCase();
};

const setApprovalEvidence = ({
  hash = 'Not generated',
  signatureStatus = 'Not signed',
  verificationState = 'Pending',
  tamperMessage = 'No tampering detected. The approved action remains exact and verified.',
} = {}) => {
  intentHashEl.textContent = hash;
  signatureStatusEl.textContent = signatureStatus;
  verificationStateEl.textContent = verificationState;
  tamperMessageEl.textContent = tamperMessage;
};

const addAuditEntry = (message) => {
  const entry = {
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    message,
  };

  state.auditEntries.unshift(entry);
  renderAuditLog();
};

const renderAuditLog = () => {
  auditCountEl.textContent = String(state.auditEntries.length);

  if (!state.auditEntries.length) {
    auditLogEl.innerHTML = '<div class="log-entry empty">No signed actions yet.</div>';
    return;
  }

  auditLogEl.innerHTML = state.auditEntries
    .map(
      (entry) => `
        <div class="log-entry">
          <span class="log-time">${entry.time}</span>
          <span class="log-text">${entry.message}</span>
        </div>
      `,
    )
    .join('');
};

const setLedgerStatus = (connected, modeText) => {
  state.ledgerConnected = connected;
  ledgerStateEl.textContent = connected ? 'Connected' : 'Offline';
  ledgerModeEl.textContent = modeText || 'Awaiting Ledger';
  ledgerBadgeEl.innerHTML = `<span class="dot"></span>${connected ? 'Ledger trust active' : 'Initializing trust layer'}`;
  deviceStateEl.textContent = connected ? 'Ready' : 'Awaiting Ledger';
  deviceStateEl.className = connected ? 'device-state ready' : 'device-state demo';
};

const extractRecommendedAction = (recommendationText) => {
  if (!recommendationText) return null;

  const match = recommendationText.match(/(?:recommended action|recommendation)\s*:?\s*([^.;]+)/i);
  if (match?.[1]) {
    return match[1].trim();
  }

  const fallback = recommendationText.split('because')[0].replace(/^AI\s+recommendation\s*:\s*/i, '').trim();
  return fallback || null;
};

const getCurrentIntent = () => {
  const action = actionInputEl.value.trim();
  const riskLevel = state.riskLabel;

  return createIntent(action, riskLevel, 'credential:production-api-key');
};

const updateReadableIntent = () => {
  const action = actionInputEl.value.trim() || 'Rotate compromised production API credential';
  const riskLevel = state.riskLabel || 'Critical';
  const reason = detailReasonEl ? detailReasonEl.textContent : 'Potential credential compromise';

  detailActionEl.textContent = action;
  detailRiskEl.textContent = `${state.riskScore || 0} / 100`;
  detailIntentEl.textContent = 'AI Security Agent';
  detailResourceEl.textContent = 'Production API Key';
  detailRequiredEl.textContent = 'Yes';
  detailExpiryEl.textContent = '30 minutes';
  detailReasonEl.textContent = reason || 'Potential credential compromise';
  if (riskLevel === 'Critical' || riskLevel === 'High') {
    actionBadgeEl.textContent = 'Requires Ledger';
    actionBadgeEl.className = 'badge warning';
  }
};

const evaluateAction = async () => {
  const action = actionInputEl.value.trim();
  const consent = consentInputEl.value;
  const severity = severityInputEl.value;
  executeBtnEl.disabled = true;

  state.approvedIntent = null;
  state.approvedIntentHash = null;
  state.approvedSignature = null;
  state.executionResult = null;
  state.intentTimestamp = new Date().toISOString();
  state.intentNonce = generateIntentNonce();

  let score = 34;

  if (severity === 'high') score += 25;
  if (severity === 'critical') score += 40;
  if (consent === 'pending') score += 18;
  if (consent === 'blocked') score += 35;
  if (/summary|record|access|share|release|revoke|rotate|credential|key/i.test(action)) score += 12;

  const cappedScore = Math.min(score, 99);

  state.riskScore = cappedScore;
  state.riskLabel = cappedScore >= 80 ? 'Critical' : cappedScore >= 60 ? 'High' : cappedScore >= 40 ? 'Medium' : 'Low';

  const trustValue = Math.max(18, 100 - cappedScore);
  riskScoreEl.textContent = `${cappedScore}`;
  riskLabelEl.textContent = state.riskLabel;
  heroTrustValueEl.textContent = String(Math.round(trustValue));
  consentStateEl.textContent = consent === 'verified' ? 'Verified' : consent === 'pending' ? 'Pending' : 'Blocked';

  detailActionEl.textContent = action;
  detailIntentEl.textContent = consent === 'blocked'
    ? 'AI Security Agent'
    : 'AI Security Agent';
  detailResourceEl.textContent = 'Production API Key';
  detailRequiredEl.textContent = 'Yes';
  detailExpiryEl.textContent = '30 minutes';
  detailReasonEl.textContent = state.riskLabel === 'Critical' ? 'Potential credential compromise' : 'Review required before privileged execution';
  detailRiskEl.textContent = `${cappedScore} / 100`;
  if (aiRecommendationEl) {
    aiRecommendationEl.textContent = await generateAIRecommendation(action, state.riskLabel);
  }

  if (consent === 'blocked') {
    statusTextEl.textContent = 'The policy engine blocked the request because consent is missing. No privileged action can proceed.';
    actionBadgeEl.textContent = 'Blocked';
    actionBadgeEl.className = 'badge danger';
    signedByEl.textContent = 'Blocked';
    if (aiRecommendationEl) {
      aiRecommendationEl.textContent = 'AI recommendation: stop until consent is verified and the user explicitly authorizes the request.';
    }
    setApprovalEvidence({
      hash: 'Blocked before approval',
      signatureStatus: 'Not signed',
      verificationState: 'Blocked',
      tamperMessage: 'Policy denied the request before any approval was generated.',
    });
    executeBtnEl.disabled = true;
    return;
  }

  if (cappedScore >= 80) {
    statusTextEl.textContent = 'High-risk action requires Ledger-backed authorization. Autonomous execution is blocked until the exact intent is signed and verified.';
    actionBadgeEl.textContent = 'Requires Ledger';
    actionBadgeEl.className = 'badge warning';
    signedByEl.textContent = 'Awaiting Ledger approval';
    if (aiRecommendationEl) {
      aiRecommendationEl.textContent = await generateAIRecommendation(action, state.riskLabel);
    }
    setApprovalEvidence({
      hash: 'Awaiting approval',
      signatureStatus: 'Not signed',
      verificationState: 'Ledger required',
      tamperMessage: 'No action is authorized yet. A valid Ledger signature is required before execution.',
    });
    executeBtnEl.disabled = true;
    addAuditEntry(`Risk review complete: ${action} scored ${cappedScore}/100 and requires Ledger authorization.`);
    return;
  }

  actionBadgeEl.textContent = 'Pending review';
  actionBadgeEl.className = 'badge warning';
  signedByEl.textContent = 'Awaiting approval';
  statusTextEl.textContent = 'The AI has prepared the approval request. The exact action intent must be signed before execution is allowed.';
  if (aiRecommendationEl) {
    aiRecommendationEl.textContent = await generateAIRecommendation(action, state.riskLabel);
  }
  setApprovalEvidence({
    hash: 'Awaiting approval',
    signatureStatus: 'Not signed',
    verificationState: 'Pending',
    tamperMessage: 'No tampering detected. The approved action remains exact and verified.',
  });
  executeBtnEl.disabled = true;

  addAuditEntry(`Risk review complete: ${action} scored ${cappedScore}/100 and is awaiting exact approval.`);
};

async function attemptLedgerConnection() {
  setLedgerStatus(false, 'Scanning for Ledger hardware');
  statusTextEl.textContent = 'Checking for a Ledger device and preparing a hardware-backed approval flow...';

  try {
    const ledgerSigner = await getLedgerSigner();

    if (ledgerSigner && state.ledgerSessionId) {
      state.realLedgerSigner = true;
      setLedgerStatus(true, 'Ledger device connected');
      statusTextEl.textContent = 'Ledger device connected. This session is now using hardware-backed authorization.';
      signedByEl.textContent = 'Ledger signer ready';
      addAuditEntry(`Ledger device connected and ready for approval. Address: ${state.ledgerAddress}.`);
      return;
    }
  } catch (error) {
    console.warn('Ledger device connection unavailable:', error);
  }

  state.realLedgerSigner = false;
  setLedgerStatus(false, 'Ledger required');
  statusTextEl.textContent = 'No Ledger hardware was detected in this browser session. Approval is blocked until a physical Ledger device is connected.';
  signedByEl.textContent = 'Awaiting Ledger device';
  addAuditEntry('Ledger hardware not detected. No on-device signature could be created.');
}

const getApprovalIntegrityState = async () => {
  if (!state.approvedIntent || !state.approvedSignature || !state.ledgerAddress) {
    return { valid: false, reason: 'No Ledger-backed approval is currently active.' };
  }

  const approvedExpiry = new Date(state.approvedIntent.expiry).getTime();
  if (Date.now() > approvedExpiry) {
    return {
      valid: false,
      reason: 'Approval expired. The signed intent is no longer valid.',
      hash: state.approvedIntentHash,
    };
  }

  const currentIntent = getCurrentIntent();
  const currentHash = await hashIntent(currentIntent);
  const currentIntentHashHex = bytesToHex(currentHash);

  if (currentIntentHashHex !== state.approvedIntentHash) {
    return {
      valid: false,
      reason: 'Intent modified after approval. Signature verification failed.',
      hash: currentIntentHashHex,
    };
  }

  const signedMessage = state.clearSigningText || (await buildClearSigningMessage(currentIntent));
  const isValid = await verifyIntentSignature(signedMessage, state.approvedSignature, state.ledgerAddress);

  if (!isValid) {
    return {
      valid: false,
      reason: 'Ledger signature verification failed for the approved intent.',
      hash: currentIntentHashHex,
    };
  }

  return { valid: true, hash: currentIntentHashHex, reason: 'Ledger signature matches the approved intent.' };
};

const executeApprovedAction = async () => {
  if (!state.approvedIntent || !state.approvedSignature || !state.approvedIntentHash) {
    actionBadgeEl.textContent = 'Awaiting approval';
    actionBadgeEl.className = 'badge warning';
    statusTextEl.textContent = 'No approved intent is available. Approve the action on Ledger before attempting execution.';
    signedByEl.textContent = 'Awaiting Ledger approval';
    return;
  }

  const integrity = await getApprovalIntegrityState();

  if (!integrity.valid) {
    actionBadgeEl.textContent = 'Rejected';
    actionBadgeEl.className = 'badge danger';
    deviceStateEl.textContent = 'Failed';
    deviceStateEl.className = 'device-state demo';
    statusTextEl.textContent = integrity.reason;
    signedByEl.textContent = 'Verification failed';
    setApprovalEvidence({
      hash: state.approvedIntentHash ? `${state.approvedIntentHash.slice(0, 24)}...` : 'Not generated',
      signatureStatus: 'Mismatch',
      verificationState: 'Tampered after approval',
      tamperMessage: integrity.reason,
    });
    addAuditEntry(`Execution aborted: ${integrity.reason} | hash ${integrity.hash?.slice(0, 16) || 'n/a'}...`);
    return;
  }

  const action = actionInputEl.value.trim();
  const runtimeRisk = state.riskScore || 42;
  const nextCredentialVersion = (state.credentialVersion || 14) + 1;
  const executedHash = state.approvedIntentHash;

  state.credentialVersion = nextCredentialVersion;
  state.executionResult = `Executed: ${action} | production credential rotated to v${nextCredentialVersion}`;
  actionBadgeEl.textContent = 'Approved';
  actionBadgeEl.className = 'badge success';
  deviceStateEl.textContent = 'Executed';
  deviceStateEl.className = 'device-state approved';
  signedByEl.textContent = 'Verified signature';
  executeBtnEl.disabled = true;
  statusTextEl.textContent = `Approval verified. Exact action authorized and executed. Production credential rotated to v${nextCredentialVersion}.`;

  if (credentialStatusEl) {
    credentialStatusEl.textContent = `Production API key active · v${nextCredentialVersion}`;
  }

  setApprovalEvidence({
    hash: executedHash ? `${executedHash.slice(0, 24)}...` : 'Executed',
    signatureStatus: 'Verified',
    verificationState: 'Exact match',
    tamperMessage: 'Execution complete. The approving intent has been consumed and can no longer execute again.',
  });

  addAuditEntry(`Execution succeeded: ${action} | risk ${runtimeRisk} | hash ${executedHash?.slice(0, 16) || 'n/a'}... | production credential rotated to v${nextCredentialVersion}.`);

  state.approvedIntent = null;
  state.approvedIntentHash = null;
  state.approvedSignature = null;
};

const approveOnLedger = async () => {
  const consent = consentInputEl.value;
  executeBtnEl.disabled = true;

  if (state.approvedIntent || state.approvedIntentHash || state.approvedSignature) {
    state.approvedIntent = null;
    state.approvedIntentHash = null;
    state.approvedSignature = null;
  }

  if (consent === 'blocked') {
    statusTextEl.textContent = 'The request is blocked by policy. Consent must be verified before execution.';
    return;
  }

  const action = actionInputEl.value.trim();
  const runtimeRisk = state.riskScore || 42;
  const requiresLedgerApproval = runtimeRisk >= 80;

  if (requiresLedgerApproval) {
    statusTextEl.textContent = 'High-risk action requires Ledger-backed authorization before it can execute. The exact intent will be signed and verified before execution is allowed.';
    actionBadgeEl.textContent = 'Requires Ledger';
    actionBadgeEl.className = 'badge warning';
    signedByEl.textContent = 'Awaiting Ledger approval';
  }

  const intent = getCurrentIntent();
  const intentHash = await hashIntent(intent);
  const { signature, mode, ledgerAddress, clearSigningText } = await signIntentForApproval(intent);

  if (!signature || !ledgerAddress) {
    statusTextEl.textContent = 'Ledger device authorization is required for an on-device signature. No physical Ledger is currently attached.';
    signedByEl.textContent = 'Awaiting Ledger device';
    actionBadgeEl.textContent = 'Ledger required';
    actionBadgeEl.className = 'badge warning';
    executeBtnEl.disabled = true;
    return;
  }

  const isValid = await verifyIntentSignature(clearSigningText || buildClearSigningMessage(intent), signature, ledgerAddress);

  if (!isValid) {
    statusTextEl.textContent = 'AUTHORIZATION INVALIDATED: The requested action differs from the Ledger-authorized intent. Execution is blocked.';
    signedByEl.textContent = 'Verification failed';
    actionBadgeEl.textContent = 'Rejected';
    actionBadgeEl.className = 'badge danger';
    executeBtnEl.disabled = true;
    setApprovalEvidence({
      hash: `${state.approvedIntentHash?.slice(0, 24) || 'Not generated'}...`,
      signatureStatus: 'Rejected',
      verificationState: 'Tampered after approval',
      tamperMessage: 'AUTHORIZATION INVALIDATED: The requested action differs from the Ledger-authorized intent. Execution is blocked.',
    });
    return;
  }

  state.approvedIntent = intent;
  state.approvedIntentHash = bytesToHex(intentHash);
  state.approvedSignature = signature;
  state.ledgerAddress = ledgerAddress;
  state.clearSigningText = clearSigningText || (await buildClearSigningMessage(intent));
  state.executionResult = `Approved: ${action}`;
  if (credentialStatusEl) {
    credentialStatusEl.textContent = `Production API key active · v${state.credentialVersion}`;
  }

  signedByEl.textContent = mode === 'ledger-device' ? `Ledger ${ledgerAddress.slice(0, 8)}...` : 'Verified on Ledger signer';
  deviceStateEl.textContent = 'Approved';
  deviceStateEl.className = 'device-state approved';
  actionBadgeEl.textContent = 'Approved';
  actionBadgeEl.className = 'badge success';
  executeBtnEl.disabled = false;
  statusTextEl.textContent = `Ledger-backed approval verified. The intent hash ${state.approvedIntentHash.slice(0, 16)}... is now bound to this exact action. Click Execute Authorized Action to perform the approved operation.`;
  setApprovalEvidence({
    hash: `${state.approvedIntentHash.slice(0, 24)}...`,
    signatureStatus: 'Verified on Ledger',
    verificationState: 'Exact match',
    tamperMessage: 'No tampering detected. The approved action remains exact and verified.',
  });
  addAuditEntry(`Intent approved: ${action} | risk ${runtimeRisk} | hash ${state.approvedIntentHash.slice(0, 16)}... | signature mode: ${mode}. Awaiting explicit execution.`);
};

const resetDemo = () => {
  state.auditEntries = [];
  state.approvedIntent = null;
  state.approvedIntentHash = null;
  state.approvedSignature = null;
  state.executionResult = null;
  state.intentTimestamp = null;
  state.intentNonce = null;
  state.clearSigningText = '';
  renderAuditLog();
  setLedgerStatus(false, 'Awaiting Ledger');
  actionBadgeEl.textContent = 'Awaiting Ledger';
  actionBadgeEl.className = 'badge warning';
  signedByEl.textContent = 'Not yet signed';
  deviceStateEl.textContent = 'Awaiting Ledger';
  deviceStateEl.className = 'device-state demo';
  executeBtnEl.disabled = true;
  statusTextEl.textContent = 'The AI has prepared the approval request. The exact action intent must be signed before execution is allowed.';
  setApprovalEvidence({
    hash: 'Not generated',
    signatureStatus: 'Not signed',
    verificationState: 'Pending',
    tamperMessage: 'No tampering detected. The approved action remains exact and verified.',
  });
  if (aiRecommendationEl) {
    aiRecommendationEl.textContent = 'AI recommendation: review the action and require a fresh Ledger authorization before execution.';
  }
  if (credentialStatusEl) {
    credentialStatusEl.textContent = `Production API key active · v${state.credentialVersion}`;
  }
};

const handleAskWitness = async () => {
  const scenario = incidentInputEl.value.trim() || 'Our production API credentials may have been compromised. Investigate the situation and recommend the safest response.';

  try {
    const response = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'Rotate production API credential',
        riskLevel: severityInputEl.value || 'critical',
        scenario,
      }),
    });

    if (!response.ok) {
      throw new Error('Ask Witness call failed');
    }

    const payload = await response.json();
    const suggestion = payload?.recommendation || 'Recommended action: Rotate production API credential. Explanation: Potential credential exposure creates a risk of unauthorized access.';
    incidentRecommendationEl.textContent = suggestion;

    const recommendedAction = extractRecommendedAction(suggestion);
    if (recommendedAction) {
      actionInputEl.value = recommendedAction;
      detailActionEl.textContent = recommendedAction;
    }

    await evaluateAction();
    addAuditEntry(`AI recommendation received: ${suggestion}`);
  } catch (error) {
    console.warn('Ask Witness failed:', error);
    const fallback = 'Recommended action: Rotate production API credential. Explanation: Potential credential exposure creates a risk of unauthorized access.';
    incidentRecommendationEl.textContent = fallback;
    actionInputEl.value = 'Rotate production API credential';
    detailActionEl.textContent = 'Rotate production API credential';
    addAuditEntry('AI recommendation fallback activated because the witness service could not respond.');
  }
};

document.getElementById('evaluateBtn').addEventListener('click', evaluateAction);
document.getElementById('connectBtn').addEventListener('click', attemptLedgerConnection);
document.getElementById('approveBtn').addEventListener('click', approveOnLedger);
document.getElementById('executeBtn').addEventListener('click', executeApprovedAction);
askWitnessBtnEl.addEventListener('click', handleAskWitness);

document.getElementById('actionInput').addEventListener('input', async () => {
  detailActionEl.textContent = actionInputEl.value || 'Release patient summary to cardiology team';

  if (state.approvedIntent && state.approvedSignature) {
    executeBtnEl.disabled = true;
    const integrity = await getApprovalIntegrityState();
    if (!integrity.valid) {
      actionBadgeEl.textContent = 'Tampered';
      actionBadgeEl.className = 'badge danger';
      signedByEl.textContent = 'Verification failed';
      statusTextEl.textContent = integrity.reason;
      deviceStateEl.textContent = 'Rejected';
      deviceStateEl.className = 'device-state demo';
      setApprovalEvidence({
        hash: state.approvedIntentHash ? `${state.approvedIntentHash.slice(0, 24)}...` : 'Not generated',
        signatureStatus: 'Mismatch',
        verificationState: 'Tampered after approval',
        tamperMessage: integrity.reason,
      });
    } else {
      setApprovalEvidence({
        hash: `${state.approvedIntentHash.slice(0, 24)}...`,
        signatureStatus: 'Verified',
        verificationState: 'Exact match',
        tamperMessage: 'No tampering detected. The approved action remains exact and verified.',
      });
    }
  }
});

document.getElementById('severityInput').addEventListener('change', evaluateAction);
document.getElementById('consentInput').addEventListener('change', evaluateAction);

renderAuditLog();
setLedgerStatus(false, 'Awaiting Ledger');
setApprovalEvidence({
  hash: 'Not generated',
  signatureStatus: 'Not signed',
  verificationState: 'Pending',
  tamperMessage: 'No tampering detected. The approved action remains exact and verified.',
});
actionBadgeEl.textContent = 'Awaiting Ledger';
actionBadgeEl.className = 'badge warning';
signedByEl.textContent = 'Not yet signed';
deviceStateEl.textContent = 'Awaiting Ledger';
deviceStateEl.className = 'device-state demo';
if (credentialStatusEl) {
  credentialStatusEl.textContent = `Production API key active · v${state.credentialVersion}`;
}
if (aiRecommendationEl) {
  aiRecommendationEl.textContent = 'AI recommendation: rotate compromised production API credential because the compromise signal requires a critical-risk authorization flow.';
}
executeBtnEl.disabled = true;
addAuditEntry('System initialized. Waiting for Ledger approval and cryptographic verification.');
