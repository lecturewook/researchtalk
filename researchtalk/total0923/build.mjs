// 화면·디자인·동작 파일을 하나의 실행용 HTML로 묶어요. 저장 로직은 storage.js만 고치면 돼요.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = new URL('./', import.meta.url);
const scripts = ['vendor/supabase.js', 'dates.js', 'config.js', 'storage.js', 'summary.js', 'app.js'];
export const sourceFiles = ['source/index.template.html', 'styles.css', ...scripts].map(name => fileURLToPath(new URL(name, root)));
const read = name => readFileSync(new URL(name, root), 'utf8');

export function createAppDocument() {
  let html = read('source/index.template.html');
  const cssTag = '<link rel="stylesheet" href="./styles.css" />';
  if (!html.includes(cssTag) || !html.includes('</body>')) throw new Error('화면 원본 구조를 확인해 주세요.');
  const css = read('styles.css');
  if (/<\/style/i.test(css)) throw new Error('디자인 파일의 닫는 태그를 확인해 주세요.');
  html = html.replace(cssTag, () => '<style id="app-styles">\n' + css + '\n    </style>');
  const bundledScripts = scripts.map(name => {
    const sourceTag = '<script defer src="./' + name + '"></script>';
    if (!html.includes(sourceTag)) throw new Error(name + ' 연결을 확인해 주세요.');
    html = html.replace(sourceTag, '');
    const code = read(name).replace(/<\/script/gi, '<\\/script');
    return '<script data-source="' + name + '">\n' + code + '\n</script>';
  }).join('\n');
  return html.replace('<head>', '<head>\n    <!-- 이 파일은 npm run build로 생성됩니다. 화면 원본은 source/index.template.html입니다. -->')
    .replace('</body>', () => bundledScripts + '\n  </body>');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('index.html', root), createAppDocument());
  console.log('디자인과 동작 코드를 포함한 index.html을 만들었어요.');
}
