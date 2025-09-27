// Simple OpenAI integration for writing aids
// You need to add your OpenAI API key below

// Call the local proxy endpoint which has the API key server-side
async function callOpenAI(prompt, feature) {
  const resp = await fetch('/api/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, feature }),
  });
  const data = await resp.json();
  return data.result || data.error || 'No response.';
}


