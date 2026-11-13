import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = join(__dirname, '..', 'src', 'v2', 'components', 'V2ClientDrawer.tsx');
let content = readFileSync(file, 'utf8');

const needle = "padding: '8px 8px', color: '#4B5563', fontSize: 11";
const idx = content.indexOf(needle);
if (idx === -1) {
  console.error('NOT FOUND: needle not in file');
  process.exit(1);
}

const tdStart = content.lastIndexOf('<td', idx);
const tdEnd   = content.indexOf('</td>', idx) + 5;
const original = content.slice(tdStart, tdEnd);
console.log('Found and replacing:\n', original);

const em = '\u2014';
const replacement = `<td style={{ padding: '8px 8px' }}>
                                  {(() => {
                                    const s = (ord.status || '').toUpperCase();
                                    const cfg =
                                      s === 'APROVADO'
                                        ? { bg: '#D1FAE5', color: '#065F46', border: '#6EE7B7', label: 'Aprovado' }
                                        : s === 'PENDENTE'
                                        ? { bg: '#FEF3C7', color: '#92400E', border: '#FCD34D', label: 'Pendente' }
                                        : s === 'EM ABERTO' || s === 'ABERTO'
                                        ? { bg: '#E0F2FE', color: '#075985', border: '#BAE6FD', label: ord.status }
                                        : { bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB', label: ord.status || '${em}' };
                                    return (
                                      <span
                                        style={{
                                          display: 'inline-block',
                                          padding: '2px 7px',
                                          borderRadius: 4,
                                          fontSize: 10,
                                          fontWeight: 700,
                                          background: cfg.bg,
                                          color: cfg.color,
                                          border: \`1px solid \${cfg.border}\`,
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {cfg.label}
                                      </span>
                                    );
                                  })()}
                                </td>`;

content = content.slice(0, tdStart) + replacement + content.slice(tdEnd);
writeFileSync(file, content, 'utf8');
console.log('SUCCESS: status badge applied');
