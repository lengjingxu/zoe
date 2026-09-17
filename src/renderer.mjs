export function providerFor(config, providerId) {
  const provider = (config.providers || []).find((p) => p.id === providerId);
  if (!provider) {
    throw new Error(
      'no provider configured for "' + providerId + '". Add one to ~/.zoe/config.json:\n' +
      '  "providers": [{ "id": "' + providerId + '", "base_url": "https://...", "api_key_env": "XAI_API_KEY", "models": ["..."] }]'
    );
  }
  const key = process.env[provider.api_key_env || ''];
  if (!key) throw new Error('environment variable ' + provider.api_key_env + ' is not set, needed for provider "' + providerId + '"');
  return { ...provider, key };
}

// OpenAI-compatible image generation: works against xAI, OpenAI, or any gateway
// that speaks the same shape.
export async function generate(config, model, prompt, options) {
  const opts = options || {};
  const provider = providerFor(config, model.provider_id);
  const res = await fetch(provider.base_url.replace(/\/$/, '') + '/images/generations', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + provider.key, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: model.id,
      prompt,
      n: 1,
      size: opts.size || provider.size || '1536x1024',
      aspect_ratio: opts.aspect_ratio || '3:2',
      response_format: 'b64_json'
    })
  });

  const text = await res.text();
  if (!res.ok) throw new Error(model.id + ' failed: HTTP ' + res.status + ' ' + text.slice(0, 400));

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(model.id + ' returned non-JSON: ' + text.slice(0, 200));
  }

  const item = (body.data || [])[0];
  if (item && item.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item && item.url) {
    const img = await fetch(item.url);
    if (!img.ok) throw new Error('could not download ' + item.url + ': HTTP ' + img.status);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error(model.id + ' returned nothing usable: ' + text.slice(0, 300));
}

