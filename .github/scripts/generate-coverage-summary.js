const fs = require('fs');
const path = require('path');

const targetName = process.argv[2] || 'Component';
const filePath = process.argv[3] || 'coverage/coverage-summary.json';
const testResultsArg = process.argv[4];

// Search candidates for test-results.json
const candidateTestPaths = [
  testResultsArg,
  path.join(path.dirname(filePath), 'test-results.json'),
  targetName.toLowerCase().includes('backend') ? 'backend/coverage/test-results.json' : 'frontend/coverage/test-results.json',
  targetName.toLowerCase().includes('backend') ? 'backend/test-results.json' : 'frontend/test-results.json',
].filter(Boolean);

let testStats = null;
for (const testPath of candidateTestPaths) {
  if (fs.existsSync(testPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(testPath, 'utf8'));
      testStats = {
        totalTests: data.numTotalTests ?? 0,
        passedTests: data.numPassedTests ?? 0,
        failedTests: data.numFailedTests ?? 0,
        pendingTests: (data.numPendingTests ?? 0) + (data.numTodoTests ?? 0),
        totalSuites: data.numTotalTestSuites ?? 0,
        passedSuites: data.numPassedTestSuites ?? 0,
        failedSuites: data.numFailedTestSuites ?? 0,
      };
      break;
    } catch {
      // ignore parse error and continue
    }
  }
}

if (!fs.existsSync(filePath)) {
  console.log(`Coverage summary not found at: ${filePath}`);
  if (testStats) {
    const icon = targetName.toLowerCase().includes('backend') ? '📡' : '💻';
    const statusEmoji = testStats.failedTests === 0 ? '✅' : '❌';
    const testLines = [
      `### ${icon} ${targetName} Regression Test Summary`,
      '',
      `> **Test Execution**: ${statusEmoji} **${testStats.totalTests}** tests ran across **${testStats.totalSuites}** suites (${testStats.passedTests} passed${testStats.failedTests > 0 ? `, ${testStats.failedTests} failed` : ''}${testStats.pendingTests > 0 ? `, ${testStats.pendingTests} skipped` : ''})`,
      '',
      '| Metric | Result |',
      '| :--- | :---: |',
      `| **Total Tests Ran** | **${testStats.totalTests}** |`,
      `| **Passed Tests** | ${testStats.passedTests} |`,
      `| **Failed Tests** | ${testStats.failedTests} |`,
      `| **Skipped Tests** | ${testStats.pendingTests} |`,
      `| **Test Suites** | ${testStats.passedSuites} / ${testStats.totalSuites} passed |`,
      `| **Execution Status** | ${testStats.failedTests === 0 ? '✅ Passed' : '❌ Failed'} |`,
      ''
    ];
    const md = testLines.join('\n');
    console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
    }
  }
  process.exit(0);
}

try {
  const summary = JSON.parse(fs.readFileSync(filePath, 'utf8')).total;
  const icon = targetName.toLowerCase().includes('backend') ? '📡' : '💻';

  const lines = [
    `### ${icon} ${targetName} Regression Test & Coverage Report`,
    '',
  ];

  if (testStats) {
    const statusEmoji = testStats.failedTests === 0 ? '✅' : '❌';
    lines.push(
      `> **Test Execution**: ${statusEmoji} **${testStats.totalTests}** tests ran across **${testStats.totalSuites}** suites ` +
      `(${testStats.passedTests} passed` +
      `${testStats.failedTests > 0 ? `, ${testStats.failedTests} failed` : ''}` +
      `${testStats.pendingTests > 0 ? `, ${testStats.pendingTests} skipped` : ''})`,
      ''
    );
  }

  lines.push(
    '| Metric | Total | Covered | Coverage % |',
    '| :--- | :---: | :---: | :---: |',
    `| **Statements** | ${summary.statements.total} | ${summary.statements.covered} | **${summary.statements.pct}%** |`,
    `| **Branches** | ${summary.branches.total} | ${summary.branches.covered} | **${summary.branches.pct}%** |`,
    `| **Functions** | ${summary.functions.total} | ${summary.functions.covered} | **${summary.functions.pct}%** |`,
    `| **Lines** | ${summary.lines.total} | ${summary.lines.covered} | **${summary.lines.pct}%** |`
  );

  if (testStats) {
    lines.push(
      `| **Tests Ran** | **${testStats.totalTests}** | **${testStats.passedTests}** passed | **${testStats.failedTests === 0 ? '100%' : Math.round((testStats.passedTests / (testStats.totalTests || 1)) * 100) + '%'}** |`
    );
  }

  lines.push('');

  const markdown = lines.join('\n');
  console.log(markdown);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
  }
} catch (err) {
  console.error('Failed to parse coverage summary:', err);
}
