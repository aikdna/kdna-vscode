const retiredCreateCommand = ['kdna', 'create'].join('.');
const forbiddenBadgeField = ['quality', 'badge'].join('_');

export function auditCurrentSurface({
  packageManifest,
  commandSource,
  previewSource,
  readme,
  vscodeIgnore,
  templateFiles,
  templateContents,
  manifestSchema,
}) {
  const findings = [];
  const activationEvents = packageManifest.activationEvents ?? [];
  const commands = packageManifest.contributes?.commands ?? [];
  const welcome = packageManifest.contributes?.viewsWelcome ?? [];

  if (activationEvents.includes(`onCommand:${retiredCreateCommand}`)) {
    findings.push('retired parallel create command remains an activation event');
  }
  if (commands.some((entry) => entry.command === retiredCreateCommand)) {
    findings.push('retired parallel create command remains contributed');
  }
  if (welcome.some((entry) => String(entry.contents).includes(`command:${retiredCreateCommand}`))) {
    findings.push('welcome view still routes to the retired parallel create command');
  }
  if (
    commandSource.includes(`function ${['cmd', 'Create'].join('')}`) ||
    commandSource.includes(forbiddenBadgeField) ||
    /access\s*:\s*['"]open['"]/u.test(commandSource)
  ) {
    findings.push('command source can still construct the obsolete manifest');
  }
  const allowedTombstone =
    templateFiles.length === 1 &&
    templateFiles[0] === 'kdna.json' &&
    templateContents['kdna.json']?._status === 'RETIRED_NOT_A_TEMPLATE' &&
    templateContents['kdna.json']?._packaged === false &&
    !Object.prototype.hasOwnProperty.call(templateContents['kdna.json'], forbiddenBadgeField) &&
    templateContents['kdna.json']?.access !== 'open';
  if (!allowedTombstone) {
    findings.push(`template area is not one explicit non-packaged tombstone: ${templateFiles.join(', ')}`);
  }
  if (!vscodeIgnore.split(/\r?\n/u).includes('templates/')) {
    findings.push('VSIX packaging does not explicitly exclude local templates');
  }
  if (manifestSchema?.properties?.[forbiddenBadgeField] !== false) {
    findings.push('current Core manifest schema no longer forbids the obsolete badge field');
  }
  const packTitle = commands.find((entry) => entry.command === 'kdna.pack')?.title ?? '';
  const validateTitle = commands.find((entry) => entry.command === 'kdna.validate')?.title ?? '';
  const previewTitle = commands.find((entry) => entry.command === 'kdna.preview')?.title ?? '';
  if (!packTitle.includes('Not Creation Complete')) {
    findings.push('pack command is not labeled as a non-Creation technical operation');
  }
  if (!validateTitle.includes('Technical') || !previewTitle.includes('Technical')) {
    findings.push('validate or preview is not labeled as a technical operation');
  }
  if (!previewSource.includes('Technical preview only')) {
    findings.push('preview UI lacks the non-Creation boundary');
  }
  if (
    !readme.includes('does not invoke it or generate a replacement manifest') ||
    !readme.includes('they do not run the Studio creation gates')
  ) {
    findings.push('README does not state the fail-closed Creation boundary');
  }
  return findings;
}
