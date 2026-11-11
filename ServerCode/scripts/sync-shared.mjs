import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * SharedCode/ 是规则引擎唯一真源，同步到服务端与 Cocos 客户端。
 * 只覆盖文件内容、不删除目录 —— Cocos 的 .meta 必须保留，
 * 否则脚本组件 GUID 变化会导致场景里挂的引用丢失。
 */

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(serverRoot, '..');
const srcDir = join(projectRoot, 'SharedCode');
const targets = [
  join(serverRoot, 'src', 'shared'),
  join(projectRoot, 'ClientCode', 'assets', 'scripts', 'shared'),
];

const files = readdirSync(srcDir).filter((f) => f.endsWith('.ts'));
if (files.length === 0) throw new Error('SharedCode/ 下没有 .ts 文件');

for (const target of targets) {
  mkdirSync(target, { recursive: true });
  for (const file of files) {
    writeFileSync(join(target, file), readFileSync(join(srcDir, file)), 'utf8');
  }
  console.log(`[sync] ${target} <- ${files.length} files`);
}
console.log('[sync] 完成。修改规则请只改 SharedCode/，再运行 npm run build 或本脚本。');
