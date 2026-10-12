const DEFAULT_MODEL = 'gpt-4o-mini';

const getFallbackRecommendation = ({ action, riskLevel }) => {
  const resolvedAction = action || 'Rotate the production API credential';
  const resolvedRisk = riskLevel || 'High';
  return `AI recommendation: ${resolvedAction} because the risk signal indicates a ${resolvedRisk.toLowerCase()} compromise and the policy engine requires explicit human approval before execution.`;
};

module.exports = async function handler(req, res) {
  const method = req.method || 'GET';

  if (method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const body = req.body || {};
  const action = body.action || 'Rotate the production API credential';
  const riskLevel = body.riskLevel || 'High';
  const scenario = body.scenario || 'Production credential appeared in an unauthorized environment. Last rotation was 94 days ago.';
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const fallbackRecommendation = getFallbackRecommendation({ action, riskLevel });

  if (!apiKey) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ recommendation: fallbackRecommendation }));
    return;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'You are a security analyst. Recommend the safest next action in one sentence, and do not exceed one sentence.',
          },
          {
            role: 'user',
            content: `Incident: ${scenario}. Action candidate: ${action}. Risk level: ${riskLevel}. Recommend the safest next action.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const suggestion = payload?.choices?.[0]?.message?.content?.trim();

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ recommendation: suggestion || fallbackRecommendation }));
  } catch (error) {
    console.warn('AI recommendation failed on server; using deterministic fallback.', error);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ recommendation: fallbackRecommendation }));
  }
};
