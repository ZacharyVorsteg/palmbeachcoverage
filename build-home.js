const fs = require('node:fs');
const path = require('node:path');

// One reviewed source for the visible homepage FAQ and its structured data.
const faqs = [
  { question: 'Is Palm Beach Coverage offering insurance services now?', answer: 'No. Palm Beach Coverage is an educational publication and prelaunch project. It does not currently quote, sell, bind, or service insurance. The waitlist is for project updates.' },
  { question: 'Does homeowners insurance include flood damage?', answer: 'Most homeowners policies exclude flood damage. Ask a licensed professional to explain separate flood coverage and the terms that apply to your property.', source: 'https://www.floodsmart.gov/get-insured/buy-a-policy', sourceLabel: 'FEMA flood insurance guide' },
  { question: 'Does an older roof automatically make a home uninsurable?', answer: 'Do not assume that roof age alone determines eligibility. Ask your insurer about applicable legal protections, its written requirements, and acceptable inspection documentation.', source: 'https://www.flsenate.gov/laws/statutes/2025/627.7011', sourceLabel: 'Florida Statutes section 627.7011' },
  { question: 'Is a home and auto bundle guaranteed to save money?', answer: 'No specific savings are promised here. Insurers have different discount rules. Compare the complete terms and combined cost of the actual quotes you receive.', source: 'https://www.myfloridacfo.com/division/ica/shoppingforinsurance/tips', sourceLabel: 'Florida consumer insurance shopping guide' },
  { question: 'Where can I check my hurricane deductible?', answer: 'Check your declarations page and ask your insurer how the deductible applies to your policy. Florida DFS explains hurricane triggers and calendar-year rules, including differences for surplus-lines policies.', source: 'https://www.myfloridacfo.com/division/consumers/consumerprotections/floridashurricanedeductible', sourceLabel: 'Florida DFS hurricane deductible guide' },
  { question: 'Does joining the waitlist create insurance coverage?', answer: 'No. The waitlist records interest in project updates. It is not an insurance application, an offer of coverage, or confirmation that a policy is in force.' },
];

const escapeHtml = text => text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function buildHome(root = __dirname) {
  const filename = path.join(root, 'index.html');
  let html = fs.readFileSync(filename, 'utf8');
  const schema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(({question, answer}) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })) };
  const visible = '<div class="faq-list">\n' + faqs.map(({question, answer, source, sourceLabel}) => `<div class="faq-item"><button class="faq-q" aria-expanded="false" onclick="toggleFaq(this)">${escapeHtml(question)}</button><div class="faq-a"><div class="faq-a-inner"><p>${escapeHtml(answer)}</p>${source ? `<p class="faq-source"><a href="${escapeHtml(source)}">${escapeHtml(sourceLabel)}</a></p>` : ''}</div></div></div>`).join('\n') + '\n</div>';
  for (const [name, content] of [['SCHEMA', `<script type="application/ld+json">${JSON.stringify(schema, null, 2).replace(/</g, '\\u003c')}</script>`], ['VISIBLE', visible]]) {
    const pattern = new RegExp(`<!-- HOME_FAQ_${name}_START -->[\\s\\S]*?<!-- HOME_FAQ_${name}_END -->`, 'g');
    if ([...html.matchAll(pattern)].length !== 1) throw new Error(`Expected one homepage FAQ ${name} marker pair`);
    html = html.replace(pattern, () => `<!-- HOME_FAQ_${name}_START -->\n${content}\n<!-- HOME_FAQ_${name}_END -->`);
  }
  fs.writeFileSync(filename, html);
}

if (require.main === module) buildHome();
module.exports = { buildHome, faqs };
