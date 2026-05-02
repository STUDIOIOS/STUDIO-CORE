// Render an email by substituting tokens. Mirrors web/app.js#renderEmail.

export function renderEmail(lead, sequences, config, step) {
  const tier = lead.tier;
  const tpl = sequences[tier]?.steps?.find(s => s.step === step);
  if (!tpl) return null;

  const tokens = {
    first_name: lead.first_name || (lead.name || '').split(' ')[0] || 'there',
    company: lead.company || 'your company',
    custom_hook: lead.custom_hook || '',
    signal_phrase: lead.signal_phrase || '',
    tier_proof: config.tier_proof?.[tier] || '',
    gdrive_link: config.gdrive_links?.[tier] || '',
    sender_name: config.sender?.name || '',
    signature: config.sender?.signature || '',
  };

  const sub = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => tokens[k] ?? `{{${k}}}`);
  return {
    subject: sub(tpl.subject),
    body: sub(tpl.body),
    name: tpl.name,
    step,
  };
}
