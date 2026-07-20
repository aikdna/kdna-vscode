import * as kdnaCore from '@aikdna/kdna-core';

export interface RuntimeLoadPlan {
  asset?: {
    asset_id?: string | null;
    title?: string | null;
    version?: string | null;
    judgment_version?: string | null;
  };
  state: string;
  required_action: string;
  can_load_now: boolean;
  checks?: Record<string, boolean>;
  issues?: Array<{ code?: string; severity?: string; message?: string }>;
}

export interface RuntimeCapsule {
  type: 'kdna.runtime-capsule';
  contract_version: '0.1.0';
  asset: Record<string, unknown>;
  digests: Record<string, unknown>;
  access: string;
  profile: string;
  context: Record<string, unknown>;
  trace: Record<string, unknown> & {
    projection_report?: RuntimeProjectionReport;
  };
}

export interface RuntimeProjectionReport {
  status: 'complete' | 'partial';
  omitted: Array<{ path: string; count: number }>;
  omitted_total: number;
}

export interface RuntimeAssetResult {
  inspection: Record<string, unknown>;
  plan: RuntimeLoadPlan;
  capsule: RuntimeCapsule | null;
}

type InspectRuntime = (input: Uint8Array) => Record<string, unknown>;
type PlanRuntime = (input: Uint8Array) => RuntimeLoadPlan;

/**
 * Consume packaged bytes only through the current Core contract. The editor
 * never opens ZIP entries or decodes payload bytes itself.
 */
export async function loadRuntimeAsset(bytes: Uint8Array): Promise<RuntimeAssetResult> {
  const inspect = kdnaCore.inspect as unknown as InspectRuntime;
  const planLoad = kdnaCore.planLoad as unknown as PlanRuntime;
  const inspection = inspect(bytes);
  const plan = planLoad(bytes);

  if (plan.can_load_now !== true) {
    return { inspection, plan, capsule: null };
  }

  const loaded = await kdnaCore.loadKDNA(
    bytes,
    { profile: 'compact', as: 'json' } as any,
  ) as unknown;
  if (!isRuntimeCapsule(loaded)) {
    throw new Error(
      'The configured @aikdna/kdna-core did not return kdna.runtime-capsule@0.1.0.',
    );
  }
  return { inspection, plan, capsule: loaded };
}

export function isRuntimeCapsule(value: unknown): value is RuntimeCapsule {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RuntimeCapsule>;
  return candidate.type === 'kdna.runtime-capsule' &&
    candidate.contract_version === '0.1.0' &&
    !!candidate.context && typeof candidate.context === 'object' &&
    !!candidate.digests && typeof candidate.digests === 'object';
}

export function renderRuntimeAssetPreview(result: RuntimeAssetResult): string {
  const title = result.plan.asset?.title ||
    stringValue(result.inspection.title) ||
    'KDNA judgment asset';
  const version = result.plan.asset?.version || stringValue(result.inspection.version);
  const heading = version ? `${title} · ${version}` : title;

  if (!result.capsule) {
    const issues = (result.plan.issues || [])
      .map((issue) => `<li><code>${escapeHtml(issue.code || 'KDNA_LOAD_BLOCKED')}</code> ${escapeHtml(issue.message || '')}</li>`)
      .join('');
    return htmlDocument(`
      <main>
        <h1>${escapeHtml(heading)}</h1>
        <p class="status blocked">Load blocked: ${escapeHtml(result.plan.state)}</p>
        <p>Required action: <code>${escapeHtml(result.plan.required_action)}</code></p>
        ${issues ? `<ul>${issues}</ul>` : ''}
      </main>`);
  }

  const context = result.capsule.context;
  const highestQuestion = stringValue(context.highest_question);
  const projectionReport = renderProjectionReport(
    result.capsule.trace.projection_report,
  );
  const sections = [
    ['Axioms', context.axioms],
    ['Boundaries', context.boundaries],
    ['Patterns', context.patterns],
    ['Failure modes', context.failure_modes],
    ['Self-checks', context.self_checks],
  ].map(([label, value]) => renderSection(String(label), value)).join('');

  return htmlDocument(`
    <main>
      <h1>${escapeHtml(heading)}</h1>
      <p class="status ready">Loaded through ${escapeHtml(result.capsule.type)}@${escapeHtml(result.capsule.contract_version)}</p>
      ${projectionReport}
      ${highestQuestion ? `<section><h2>Highest question</h2><p>${escapeHtml(highestQuestion)}</p></section>` : ''}
      ${sections}
    </main>`);
}

function renderProjectionReport(report: RuntimeProjectionReport | undefined): string {
  if (!report) return '';
  const omitted = Array.isArray(report.omitted)
    ? report.omitted.map((entry) =>
      `<li><code>${escapeHtml(entry.path)}</code> · ${escapeHtml(entry.count)} omitted</li>`,
    ).join('')
    : '';
  return `<section class="projection-report">
    <h2>Projection: ${escapeHtml(report.status)}</h2>
    <p>${escapeHtml(report.omitted_total)} omitted values disclosed by KDNA Core.</p>
    ${omitted ? `<ul>${omitted}</ul>` : ''}
  </section>`;
}

function renderSection(label: string, value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return '';
  const items = value.map((item) => `<li><pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre></li>`).join('');
  return `<section><h2>${escapeHtml(label)}</h2><ul>${items}</ul></section>`;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlDocument(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
:root{--bg:#fff;--bg2:#f6f8fa;--border:#d0d7de;--text:#1f2328;--dim:#59636e;--accent:#0969da;--green:#1a7f37;--red:#cf222e}
body{background:var(--bg);color:var(--text);font:14px/1.5 system-ui,sans-serif;margin:0}
main{max-width:900px;margin:0 auto;padding:28px}
h1{font-size:24px}h2{font-size:16px;margin-top:24px}
.status{border-left:3px solid;padding:8px 12px;background:var(--bg2)}
.ready{border-color:var(--green)}.blocked{border-color:var(--red)}
pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}li{margin:8px 0}
code{font-family:var(--vscode-editor-font-family,monospace)}
</style>
</head>
<body>${body}</body>
</html>`;
}
