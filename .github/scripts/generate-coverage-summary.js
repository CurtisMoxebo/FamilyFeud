const fs = require('fs');

const targetName = process.argv[2] || 'Component';
const filePath = process.argv[3] || 'coverage/coverage-summary.json';

if (!fs.existsSync(filePath)) {
  console.log(`Coverage summary not found at: ${filePath}`);
  process.exit(0);
}

try {
  const summary = JSON.parse(fs.readFileSync(filePath, 'utf8')).total;
  const icon = targetName.toLowerCase().includes('backend') ? '📡' : '💻';

  const lines = [
    `### ${icon} ${targetName} Test Coverage Report`,
    '',
    '| Metric | Total | Covered | Coverage % |',
    '| :--- | :---: | :---: | :---: |',
    `| **Statements** | ${summary.statements.total} | ${summary.statements.covered} | **${summary.statements.pct}%** |`,
    `| **Branches** | ${summary.branches.total} | ${summary.branches.covered} | **${summary.branches.pct}%** |`,
    `| **Functions** | ${summary.functions.total} | ${summary.functions.covered} | **${summary.functions.pct}%** |`,
    `| **Lines** | ${summary.lines.total} | ${summary.lines.covered} | **${summary.lines.pct}%** |`,
    ''
  ];

  const markdown = lines.join('\n');
  console.log(markdown);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
  }
} catch (err) {
  console.error('Failed to parse coverage summary:', err);
}

