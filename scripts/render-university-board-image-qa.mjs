#!/usr/bin/env node

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const atlasId = valueAfter('--atlas');
const outputDirectory = valueAfter('--output') || '/private/tmp/university-board-image-qa';
const python = process.env.CODEX_WORKSPACE_PYTHON || 'python3';

if (!atlasId) throw new Error('Pass --atlas ATLAS_ID.');
admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'living-atlas-7622a' });
const snapshot = await admin.firestore().collection('boards').where('atlas_id', '==', atlasId).get();
const boards = snapshot.docs
  .map((document) => ({ id: document.id, ...document.data() }))
  .filter((board) => board.target_kind === 'university' && !board.deleted_at)
  .sort((left, right) => String(left.template_id).localeCompare(String(right.template_id)));
const payload = boards.map((board) => ({
  id: board.id,
  template: board.template_id,
  title: board.title,
  cards: (board.cards || []).map((card) => ({
    entity: card.entityName || card.entity_name || card.title,
    imageUrl: card.imageUrl,
    imageSource: card.imageSource,
    imageTitle: card.imageTitle,
  })),
}));

const program = String.raw`
import io, json, os, re, sys, urllib.request
from PIL import Image, ImageDraw, ImageFont, ImageOps

boards = json.load(sys.stdin)
output = sys.argv[1]
os.makedirs(output, exist_ok=True)
font = ImageFont.load_default()
for board in boards:
    cells = []
    for index, card in enumerate(board['cards']):
        request = urllib.request.Request(card['imageUrl'], headers={'User-Agent': 'LivingWiki image QA/1.0'})
        with urllib.request.urlopen(request, timeout=25) as response:
            image = ImageOps.exif_transpose(Image.open(io.BytesIO(response.read()))).convert('RGB')
        image = ImageOps.fit(image, (400, 230), method=Image.Resampling.LANCZOS)
        cell = Image.new('RGB', (420, 310), 'white')
        cell.paste(image, (10, 10))
        draw = ImageDraw.Draw(cell)
        label = f"{index + 1}. {card['entity']}"
        lines = []
        while label:
            cut = min(53, len(label))
            if cut < len(label):
                space = label.rfind(' ', 0, cut)
                if space > 15: cut = space
            lines.append(label[:cut])
            label = label[cut:].lstrip()
        for line_index, line in enumerate(lines[:2]):
            draw.text((12, 246 + line_index * 15), line, fill='black', font=font)
        draw.text((12, 279), card['imageSource'], fill='#555555', font=font)
        cells.append(cell)
    sheet = Image.new('RGB', (1260, 1040), '#e6e8eb')
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 8), f"{board['template']} — {board['title']}", fill='black', font=font)
    for index, cell in enumerate(cells):
        x = (index % 3) * 420
        y = 30 + (index // 3) * 250
        sheet.paste(cell.crop((0, 0, 420, 250)), (x, y))
        draw = ImageDraw.Draw(sheet)
        label = f"{index + 1}. {board['cards'][index]['entity']}"
        draw.rectangle((x + 8, y + 208, x + 412, y + 247), fill='white')
        draw.text((x + 12, y + 212), label[:58], fill='black', font=font)
        draw.text((x + 12, y + 228), board['cards'][index]['imageSource'], fill='#555555', font=font)
    name = re.sub(r'[^a-z0-9-]+', '-', board['template'].lower()).strip('-') + '.jpg'
    path = os.path.join(output, name)
    sheet.save(path, quality=88)
    print(path)
`;

const child = spawn(python, ['-c', program, outputDirectory], { stdio: ['pipe', 'pipe', 'inherit'] });
child.stdin.end(JSON.stringify(payload));
for await (const chunk of child.stdout) process.stdout.write(chunk);
const code = await new Promise((resolve) => child.on('exit', resolve));
await admin.app().delete();
if (code !== 0) process.exit(code || 1);
