export interface ProjectViewDiagnostics {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Editor diagnostics for the retained expanded authoring view. This is not
 * Runtime validation and does not interpret packaged `.kdna` bytes.
 */
export function diagnoseProjectViewData(
  dataMap: Record<string, any>,
): ProjectViewDiagnostics {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const filename of ['KDNA_Core.json', 'KDNA_Patterns.json']) {
    if (!dataMap[filename]) errors.push(`Missing required file in project view: ${filename}`);
  }

  const core = dataMap['KDNA_Core.json'];
  if (core && !Array.isArray(core.axioms)) {
    errors.push('KDNA_Core.json.axioms: expected an array');
  }
  for (const [index, axiom] of (Array.isArray(core?.axioms) ? core.axioms : []).entries()) {
    for (const field of ['one_sentence', 'full_statement', 'why']) {
      if (typeof axiom?.[field] !== 'string' || axiom[field].trim() === '') {
        errors.push(`KDNA_Core.json.axioms[${index}].${field}: missing required authoring field`);
      }
    }
  }

  const patterns = dataMap['KDNA_Patterns.json'];
  for (const [index, check] of (
    Array.isArray(patterns?.self_check) ? patterns.self_check : []
  ).entries()) {
    if (typeof check === 'string' && !check.trim().endsWith('?')) {
      warnings.push(
        `KDNA_Patterns.json.self_check[${index}]: authoring self-check should be a yes/no question`,
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
