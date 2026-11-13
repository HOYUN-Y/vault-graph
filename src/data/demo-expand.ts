// Synthetic demo data expansion: grows the fictional showcase vault to 1,000 documents. Unrelated to real materials, people, companies, or books/papers.
// The hand-written representative documents in demo.ts (Nova · Lumen · Meeting notes summary prompt · study group, etc.) stay as they are, and around them
// this adds, deterministically (no randomness), the recurring records, project materials, and life logs that pile up in a real vault.
//   - New guide documents: research area · 4 topic MOCs · sub-indexes (split by topic so none exceeds 100 lines) · project guides
//   - Each material sits under one primary index (parent) and, where needed, is linked from other indexes (listedBy), topic MOCs (topics), and body links
//   - listedBy never points to an index shallower than the primary one (so breadth-first link classification finds the same primary index as the definition)
import type { DocFormat, NodeKind } from '../core/types';

export interface Seed {
  id: string;
  kind: NodeKind;
  title: string;
  /** Path in the fictional vault (guide documents at the top level, source files under src-*) */
  path: string;
  /** For authoring: id of the index used for primary classification */
  parent: string | null;
  summary: string;
  /** Preamble for indexes and MOCs; the full body for materials */
  body?: string;
  format?: DocFormat;
  updated: string;
  topics?: string[];
  listedBy?: string[];
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const BASE = Date.UTC(2026, 10, 5);
/** Date `back` days before 2026-11-05 (YYYY-MM-DD) */
const ago = (back: number) => new Date(BASE - back * 86400000).toISOString().slice(0, 10);
const at = <T,>(list: readonly T[], i: number) => list[((i % list.length) + list.length) % list.length];
const when = (cond: boolean, ...ids: string[]) => (cond ? ids : []);
const opt = (list: string[]) => (list.length ? list : undefined);
const ref = (id: string, title: string) => `{{${id}|${title}}}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** New guide documents (area · sub-indexes · project guides · topic MOCs) */
export const expandHubs: Seed[] = [
  { id: 'area-research', kind: 'area', title: 'Research', path: 'research.md', parent: 'router', updated: '2026-11-04',
    summary: 'Research area index. Split into paper notes, experiment logs, and dataset cards.',
    body: 'This is the index for the research area. Papers read, experiments run, and data used are kept apart, and methods are gathered in topic MOCs. (All papers and data are fictional)' },

  { id: 'moc-design', kind: 'moc', title: 'Design', path: 'moc-design.md', parent: 'router', updated: '2026-11-02',
    summary: 'A topic map gathering screen, mockup, and usability test materials regardless of area.', body: 'See screen specs, mockups, and decisions from usability tests in one place.' },
  { id: 'moc-method', kind: 'moc', title: 'Research methods', path: 'moc-research-methods.md', parent: 'router', updated: '2026-11-04',
    summary: 'A topic map gathering experiment design, survey, and evaluation methods.', body: 'Ways to form hypotheses, measure, and question the results.' },
  { id: 'moc-retro', kind: 'moc', title: 'Retrospectives', path: 'moc-retrospectives.md', parent: 'router', updated: '2026-11-03',
    summary: 'A topic map gathering work and personal retrospectives and postmortems.', body: 'Records of what went well, what could improve, and one thing to change next time.' },
  { id: 'moc-health', kind: 'moc', title: 'Health', path: 'moc-health.md', parent: 'router', updated: '2026-11-01',
    summary: 'A topic map gathering exercise, sleep, and diet logs.', body: 'Habits for taking care of the body and their logs.' },

  // ── Work ──
  { id: 'guide-orbit', kind: 'guide', title: 'Orbit mobile app launch guide', path: 'project-orbit.md', parent: 'work-projects', updated: '2026-11-03',
    summary: 'Reading order for the launch prep documents of Orbit (fictional), a mobile scheduling app.', body: 'Read in this order: screen specs → QA logs → release notes. Mockup images have descriptions only.' },
  { id: 'guide-atlas', kind: 'guide', title: 'Atlas internal search improvement guide', path: 'project-atlas.md', parent: 'work-projects', updated: '2026-10-29',
    summary: 'Guide to query analysis and relevance experiments for Atlas (fictional), the internal document search.', body: 'Read in this order: query analysis → relevance experiments → synonym dictionary.' },
  { id: 'guide-harbor', kind: 'guide', title: 'Harbor customer support automation guide', path: 'project-harbor.md', parent: 'work-projects', updated: '2026-10-31',
    summary: 'Guide to answer drafts, categories, and tests for Harbor (fictional), an automated customer reply system.', body: 'Read in this order: inquiry categories → answer drafts → conversation scenario tests. A person reviews at the end.' },
  { id: 'work-ops-meetings', kind: 'subindex', title: 'Work · Operations · Meeting notes archive', path: 'work--operations--meetings.md', parent: 'work-ops', updated: '2026-11-02',
    summary: 'An archive index of past weekly meeting notes in week order.', body: 'Recent meeting notes live in the operations index; older ones go here.' },
  { id: 'work-ops-incidents', kind: 'subindex', title: 'Work · Operations · Incident reports', path: 'work--operations--incidents.md', parent: 'work-ops', updated: '2026-10-30',
    summary: 'Incident reports written with the incident report template.', body: 'Each incident records its cause and prevention steps. The template is in the operations index.' },
  { id: 'work-clients', kind: 'subindex', title: 'Work · Clients', path: 'work--clients.md', parent: 'area-work', updated: '2026-10-28',
    summary: 'Meetings, requirements, and proposals by client (all fictional companies).', body: 'Each client is organized in the same order, from first meeting to retrospective.' },
  { id: 'work-newsletter', kind: 'subindex', title: 'Work · Content · Newsletter', path: 'work--content--newsletter.md', parent: 'work-content', updated: '2026-11-01',
    summary: 'An index of past newsletter issues in publishing order.', body: 'This month\'s draft lives in the content index; published issues go here.' },
  { id: 'work-video', kind: 'subindex', title: 'Work · Content · Video · Social', path: 'work--content--video.md', parent: 'work-content', updated: '2026-10-26',
    summary: 'Video scripts and short social posts.', body: 'Scripts are written one sentence per screen.' },

  // ── Personal ──
  { id: 'personal-reading', kind: 'subindex', title: 'Personal · Learning · Reading', path: 'personal--learning--reading.md', parent: 'personal-learning', updated: '2026-11-02',
    summary: 'An index of reading notes on fictional books.', body: 'One note per book. Notes used in other areas are linked here as well.' },
  { id: 'personal-courses', kind: 'subindex', title: 'Personal · Learning · Online courses', path: 'personal--learning--courses.md', parent: 'personal-learning', updated: '2026-10-27',
    summary: 'Notes on online courses (fictional), organized by course.', body: 'Each lecture gets a one-line summary and what I practiced.' },
  { id: 'guide-japanese', kind: 'guide', title: 'Japanese study guide', path: 'project-japanese.md', parent: 'personal-learning', updated: '2026-10-30',
    summary: 'Guide to the lesson notes for 20 minutes of Japanese a day (fictional textbook).', body: 'Read the lesson notes in order and review the vocabulary lists on weekends.' },
  { id: 'personal-daily', kind: 'subindex', title: 'Personal · Journal · Daily log archive', path: 'personal--journal--daily.md', parent: 'personal-journal', updated: '2026-10-05',
    summary: 'An archive index of daily logs from before October, in date order.', body: 'Recent daily logs live in the journal index; older ones go here.' },
  { id: 'personal-reviews', kind: 'subindex', title: 'Personal · Journal · Retrospectives', path: 'personal--journal--reviews.md', parent: 'personal-journal', updated: '2026-11-02',
    summary: 'An index of weekly and monthly retrospectives.', body: 'Logs written with the weekly review template sit together with monthly reviews.' },
  { id: 'personal-health', kind: 'subindex', title: 'Personal · Life · Health', path: 'personal--life--health.md', parent: 'personal-life', updated: '2026-11-01',
    summary: 'Workout logs, sleep notes, and running prep.', body: 'Logs of following the workout routine, plus sleep notes.' },
  { id: 'guide-running', kind: 'guide', title: 'Half marathon training guide', path: 'project-half-marathon.md', parent: 'personal-health', updated: '2026-10-31',
    summary: 'Guide to the training logs for 12 weeks of half marathon prep (fictional race).', body: 'Read the weekly training logs in order. If a knee hurts, rest that week.' },
  { id: 'personal-finance', kind: 'subindex', title: 'Personal · Life · Household budget', path: 'personal--life--finance.md', parent: 'personal-life', updated: '2026-11-01',
    summary: 'Monthly checks against the living expenses budget (example).', body: 'Checked once a month against the budget. Amounts are not recorded.' },
  { id: 'personal-kitchen', kind: 'subindex', title: 'Personal · Life · Cooking', path: 'personal--life--kitchen.md', parent: 'personal-life', updated: '2026-10-25',
    summary: 'Dishes I tried and grocery tips.', body: 'Go-to recipes live in the life index; new dishes go here.' },
  { id: 'personal-travel', kind: 'subindex', title: 'Personal · Life · Travel', path: 'personal--life--travel.md', parent: 'personal-life', updated: '2026-10-20',
    summary: 'Plans and logs of past trips (fictional itineraries).', body: 'Each trip gets a plan, daily logs, photo notes, and a look back.' },
  { id: 'guide-garden', kind: 'guide', title: 'Balcony garden guide', path: 'project-balcony-garden.md', parent: 'personal-life', updated: '2026-10-22',
    summary: 'Guide to the observation logs for a balcony container garden.', body: 'Read the observation logs in date order. The watering rule is in the first log.' },

  // ── Research ──
  { id: 'research-papers', kind: 'subindex', title: 'Research · Paper notes', path: 'research--papers.md', parent: 'area-research', updated: '2026-11-04',
    summary: 'Notes on fictional papers. Every field uses the same frame.', body: 'Organized in four boxes: question · method · results · doubts.' },
  { id: 'guide-reading-group', kind: 'guide', title: 'Paper reading group guide', path: 'project-reading-group.md', parent: 'research-papers', updated: '2026-11-03',
    summary: 'Guide to the session notes of a paper reading group (fictional) that meets every other Wednesday.', body: 'Session notes link to the notes on the papers presented.' },
  { id: 'research-experiments', kind: 'subindex', title: 'Research · Experiment logs', path: 'research--experiments.md', parent: 'area-research', updated: '2026-11-02',
    summary: 'Hypothesis, method, and results of small experiments.', body: 'Each experiment states its hypothesis first; if the results differ from it, they are recorded as is.' },
  { id: 'guide-survey', kind: 'guide', title: 'Work tools survey guide', path: 'project-survey.md', parent: 'research-experiments', updated: '2026-10-30',
    summary: 'Guide to the design and analysis of a survey on work tool use by team (fictional responses).', body: 'Read in this order: design → items → team analysis → synthesis. All responses are fictional.' },
  { id: 'research-datasets', kind: 'subindex', title: 'Research · Dataset cards', path: 'research--datasets.md', parent: 'area-research', updated: '2026-10-28',
    summary: 'Source, scope, and caveats for the fictional datasets used in experiments.', body: 'Every dataset uses the same card template. No personally identifiable information.' }
];

/** Recurring record series. budget = number of materials to create. The final daily log archive series fills whatever is left */
export function expandMaterials(budget: number): Seed[] {
  const out: Seed[] = [];
  const add = (s: Omit<Seed, 'kind'>) => out.push({ kind: 'material', ...s });
  const prev = (prefix: string, i: number, title: (i: number) => string, label = 'Previous entry') => (i > 0 ? `\n\n${label}: ${ref(`${prefix}-${i - 1}`, title(i - 1))}` : '');

  // ── Nova: sprints · usability tests ──
  const sprint = (i: number) => `Nova sprint ${i + 1} notes`;
  const sprintGoals = ['home first-screen mockup', 'pricing table build', 'customer story filter', 'mobile menu', 'contrast fixes', 'copy swap', 'image optimization', 'search hookup', 'accessibility recheck', 'pre-launch check', 'analytics tags', 'error screens', 'speed improvements', 'localization prep', 'post-launch fixes', 'applying retro feedback'];
  for (let i = 0; i < 16; i++) add({ id: `nova-sprint-${i}`, title: sprint(i), path: `src-work/projects/nova/sprints/sprint-${pad(i + 1)}.md`, parent: 'guide-nova',
    updated: ago(120 - i * 7), summary: `Two-week sprint log aimed at ${sprintGoals[i]} (fictional).`, topics: opt(when(i % 5 === 4, 'moc-retro')),
    body: `# ${sprint(i)}\n\n- Goal: ${sprintGoals[i]}\n- Done: wrapped up ${at(sprintGoals, i - 1)}\n- Carried over: part of ${at(sprintGoals, i + 2)}\n- Reference: ${ref('nova-ia', 'Nova information architecture draft')}${prev('nova-sprint', i, sprint)}` });
  const ux = (i: number) => `Nova usability test session ${i + 1}`;
  const uxTasks = ['finding pricing', 'choosing a customer story', 'leaving an inquiry', 'finding the menu again', 'viewing the comparison table on mobile', 'finding a feature via search', 'explaining it in 30 seconds on a first visit', 'keyboard-only navigation', 'reading zoomed in', 'first impression right after launch'];
  for (let i = 0; i < 10; i++) add({ id: `nova-ux-${i}`, title: ux(i), path: `src-work/projects/nova/usability/session-${pad(i + 1)}.md`, parent: 'guide-nova',
    updated: ago(70 - i * 5), summary: `Observation log of five fictional participants on the "${uxTasks[i]}" task.`, topics: ['moc-design', ...when(i % 3 === 0, 'moc-method')],
    body: `# ${ux(i)}\n\nTask: ${uxTasks[i]}\n\n- Got stuck: confused it with ${at(uxTasks, i + 3)}\n- To change: name buttons after actions\n- Check against: ${ref('nova-a11y', 'Nova accessibility checklist')}${prev('nova-ux', i, ux, 'Previous session')}` });

  // ── Lumen: widget specs · weekly reports ──
  const widgets = ['active user trend', 'feature adoption table', 'response time distribution', 'new signup flow', 'drop-off points', 'usage by team', 'error rate', 'delay alerts', 'week-over-week comparison', 'date range picker', 'progress against goals', 'export', 'permission indicator', 'empty state guidance'];
  widgets.forEach((w, i) => add({ id: `lumen-widget-${i}`, title: `Lumen widget spec · ${w}`, path: `src-work/projects/lumen/widgets/widget-${pad(i + 1)}.md`, parent: 'guide-lumen',
    updated: ago(90 - i * 4), summary: `Values and empty state for the dashboard's "${w}" widget (fictional).`, topics: opt([...when(i % 3 === 0, 'moc-dev'), ...when(i % 4 === 1, 'moc-design')]),
    body: `# Lumen widget spec · ${w}\n\n- Value definition: follows ${ref('lumen-metrics', 'Lumen core metric definitions')}\n- Empty state: "No data collected yet"\n- Axes and color: per ${ref('learn-viz-book', 'Reading notes · Introduction to data visualization')}` }));
  const report = (i: number) => `Lumen weekly report W${30 + i}`;
  for (let i = 0; i < 12; i++) add({ id: `lumen-report-${i}`, title: report(i), path: `src-work/projects/lumen/reports/2026-W${30 + i}.md`, parent: 'guide-lumen',
    updated: ago(100 - i * 7), summary: 'A short report on collection status, changed widgets, and next week\'s tasks (no figures included).',
    body: `# ${report(i)}\n\n- Collection: ${i % 4 === 2 ? 'one-day delay → recomputed' : 'normal'}\n- Changed widget: ${ref(`lumen-widget-${i}`, `Lumen widget spec · ${widgets[i]}`)}\n- Check: ${ref(`lumen-check-${i % 10}`, `Metrics check ${pad((i % 10) + 1)}`)}${prev('lumen-report', i, report, 'Previous report')}` });

  // ── Orbit: screen specs · QA · release notes · mockups ──
  const screens = ['Sign-in', 'Home schedule', 'Search', 'Notifications', 'Settings', 'Profile', 'Recurring events', 'Onboarding 1', 'Onboarding 2', 'Empty screen', 'Error screen', 'Offline screen', 'Share sheet', 'Home widget', 'Dark theme', 'Accessibility settings'];
  screens.forEach((s, i) => add({ id: `orbit-screen-${i}`, title: `Orbit screen spec · ${s}`, path: `src-work/projects/orbit/screens/screen-${pad(i + 1)}.md`, parent: 'guide-orbit',
    updated: ago(80 - i * 3), summary: `Purpose, elements, and states of the "${s}" screen (fictional app).`, topics: opt(when(i % 2 === 0, 'moc-design')),
    body: `# Orbit screen spec · ${s}\n\n- Purpose: usable one-handed within 3 seconds\n- States: default · loading · empty · error\n- Next screen: ${ref(`orbit-screen-${(i + 1) % screens.length}`, `Orbit screen spec · ${at(screens, i + 1)}`)}\n- Accessibility criteria: ${ref('nova-a11y', 'Nova accessibility checklist')}` }));
  const qa = (i: number) => `Orbit QA log ${pad(i + 1)}`;
  for (let i = 0; i < 14; i++) add({ id: `orbit-qa-${i}`, title: qa(i), path: `src-work/projects/orbit/qa/qa-${pad(i + 1)}.md`, parent: 'guide-orbit',
    updated: ago(60 - i * 3), summary: `Test log focused on the ${at(screens, i * 3)} screen (fictional devices).`, topics: opt(when(i % 3 === 1, 'moc-dev')),
    body: `# ${qa(i)}\n\n- Target: ${ref(`orbit-screen-${(i * 3) % screens.length}`, `Orbit screen spec · ${at(screens, i * 3)}`)}\n- Result: ${i % 4 === 0 ? 'one reproducible issue → fix in the next release' : 'passed'}\n- Log template: ${ref('ops-incident', 'Incident report template')}${prev('orbit-qa', i, qa)}` });
  const release = (i: number) => `Orbit release notes 0.${i + 1}`;
  for (let i = 0; i < 14; i++) add({ id: `orbit-release-${i}`, title: release(i), path: `src-work/projects/orbit/releases/v0-${i + 1}.md`, parent: 'guide-orbit',
    updated: ago(56 - i * 3), summary: `Release notes covering ${at(screens, i + 2)} improvements and fixed issues (fictional).`, listedBy: opt(when(i % 4 === 3, 'work-newsletter')),
    body: `# ${release(i)}\n\n- New: improved ${at(screens, i + 2)} screen\n- Fixed: issues found in ${ref(`orbit-qa-${i}`, qa(i))}\n- Sentence standard: ${ref('content-style', 'Writing style guide')}${prev('orbit-release', i, release, 'Previous release')}` });
  ['Home', 'Search', 'Notifications', 'Settings'].forEach((s, i) => add({ id: `orbit-mock-${i}`, title: `Orbit mockup · ${s}.png`, path: `src-work/projects/orbit/mockups/orbit-mockup-${s.toLowerCase()}.png`, parent: 'guide-orbit',
    updated: ago(85 - i * 2), format: 'image', topics: ['moc-design'], summary: `${s} screen mockup image. The demo has no image file, only this description.` }));

  // ── Atlas: query analysis · relevance experiments · synonyms ──
  const queries = ['vacation request', 'security training', 'expense reports', 'meeting room booking', 'equipment request', 'company policies', 'travel request', 'employee benefits', 'remote work', 'training signup', 'account lockout', 'printer setup', 'parking registration', 'document templates', 'org chart', 'new hire paperwork'];
  queries.forEach((q, i) => add({ id: `atlas-query-${i}`, title: `Query analysis · ${q}`, path: `src-work/projects/atlas/queries/q-${pad(i + 1)}.md`, parent: 'guide-atlas',
    updated: ago(75 - i * 3), summary: `What people searching for "${q}" actually wanted and why they missed it (fictional logs).`, topics: opt([...when(i % 4 === 0, 'moc-dev'), ...when(i % 4 === 2, 'moc-method')]),
    body: `# Query analysis · ${q}\n\n- Wanted: the ${q} how-to page\n- Why missed: ${i % 3 === 0 ? 'the title used a different name' : i % 3 === 1 ? 'older documents ranked higher' : 'singular vs. plural wording'}\n- Similar queries: ${at(queries, i + 5)}` }));
  const methods = ['title weighting', 'recency boost', 'synonym expansion', 'typo correction', 'department filter', 'click feedback', 'document length normalization', 'phrase matching', 'tag weighting', 'deduplication', 'summary index', 'hybrid ranking'];
  methods.forEach((m, i) => add({ id: `atlas-exp-${i}`, title: `Relevance experiment ${pad(i + 1)} · ${m}`, path: `src-work/projects/atlas/experiments/exp-${pad(i + 1)}.md`, parent: 'guide-atlas',
    updated: ago(50 - i * 3), summary: `A small experiment on whether ${m} changes the top results (fictional).`, topics: opt([...when(i % 2 === 0, 'moc-method'), ...when(i % 3 === 1, 'moc-dev')]),
    body: `# Relevance experiment ${pad(i + 1)} · ${m}\n\n- Hypothesis: adding ${m} brings the wanted document to the top\n- Target query: ${ref(`atlas-query-${i}`, `Query analysis · ${queries[i]}`)}\n- Result: ${i % 3 === 2 ? 'no difference → reverted' : 'some improvement → bundled with the next experiment'}${i > 0 ? `\n\nPrevious experiment: ${ref(`atlas-exp-${i - 1}`, `Relevance experiment ${pad(i)} · ${methods[i - 1]}`)}` : ''}` }));
  const synonyms = ['vacation · PTO · leave', 'expenses · costs · reimbursement', 'meeting room · conference room', 'equipment · hardware', 'training · course · workshop', 'remote · work from home', 'account · username', 'form · template · layout', 'business trip · travel', 'benefits · perks'];
  synonyms.forEach((s, i) => add({ id: `atlas-syn-${i}`, title: `Synonym dictionary · ${s}`, path: `src-work/projects/atlas/synonyms/syn-${pad(i + 1)}.md`, parent: 'guide-atlas',
    updated: ago(40 - i * 2), summary: `Rules and exceptions for treating "${s}" as one meaning.`,
    body: `# Synonym dictionary · ${s}\n\n- Group: ${s}\n- Exception: do not group the names of specific programs\n- Supporting experiment: ${ref('atlas-exp-2', 'Relevance experiment 03 · synonym expansion')}` }));

  // ── Harbor: inquiry categories · answer drafts · conversation tests ──
  const cats = ['Account', 'Billing', 'Shipping', 'Refunds', 'Plans', 'App usage', 'Notifications', 'Data', 'Privacy', 'Bug reports', 'Team accounts', 'Other'];
  cats.forEach((c, i) => add({ id: `harbor-cat-${i}`, title: `Inquiry category · ${c}`, path: `src-work/projects/harbor/categories/cat-${pad(i + 1)}.md`, parent: 'guide-harbor',
    updated: ago(66 - i * 2), summary: `Phrases that identify "${c}" inquiries and when to hand off to a person.`,
    body: `# Inquiry category · ${c}\n\n- Identifying phrases: questions, complaints, and requests about "${c}"\n- Hand off to a person: angry language · money issues · personal data\n- Next category: ${ref(`harbor-cat-${(i + 1) % cats.length}`, `Inquiry category · ${at(cats, i + 1)}`)}` }));
  const asks = ['password reset', 'refund window', 'tracking a shipment', 'getting a receipt', 'changing plans', 'deleting an account', 'payment failure', 'applying a coupon', 'changing an address', 'how to cancel', 'support hours', 'attachment size limit', 'turning off notifications', 'shared use', 'exporting data', 'sign-in error', 'installing the app', 'language settings', 'viewing personal data', 'how to report a bug', 'group purchase', 'training materials'];
  asks.forEach((a, i) => add({ id: `harbor-answer-${i}`, title: `Answer draft · ${a}`, path: `src-work/projects/harbor/answers/answer-${pad(i + 1)}.md`, parent: 'guide-harbor',
    updated: ago(45 - i), summary: `Automatic reply draft for "${a}" inquiries (fictional service).`, topics: opt([...when(i % 5 === 0, 'moc-ai'), ...when(i % 5 === 3, 'moc-writing')]),
    body: `# Answer draft · ${a}\n\n1. Confirm in one sentence what they need help with\n2. Give the fix in three steps or fewer\n3. If it is not resolved, explain how to reach an agent\n\nCategory: ${ref(`harbor-cat-${i % cats.length}`, `Inquiry category · ${at(cats, i)}`)}\nSentence standard: ${ref('content-style', 'Writing style guide')}${i % 5 === 0 ? `\nPrompt: ${ref('learn-prompt-patterns', 'Prompt writing patterns')}` : ''}` }));
  const bot = (i: number) => `Conversation scenario test ${pad(i + 1)}`;
  for (let i = 0; i < 10; i++) add({ id: `harbor-test-${i}`, title: bot(i), path: `src-work/projects/harbor/tests/test-${pad(i + 1)}.md`, parent: 'guide-harbor',
    updated: ago(30 - i * 2), summary: `Log of testing a "${at(asks, i * 2)}" inquiry in a fictional conversation.`, topics: ['moc-ai', ...when(i % 4 === 2, 'moc-method')],
    body: `# ${bot(i)}\n\n- Scenario: ${at(asks, i * 2)}\n- Answer used: ${ref(`harbor-answer-${(i * 2) % asks.length}`, `Answer draft · ${at(asks, i * 2)}`)}\n- Result: ${i % 3 === 0 ? 'handoff to a person came too late → criteria updated' : 'passed'}${prev('harbor-test', i, bot, 'Previous test')}` });

  // ── Operations: meeting notes archive · incident reports · operating rules ──
  const meet = (i: number) => (i < 52 ? `Team weekly meeting 2025-W${pad(i + 1)}` : `Team weekly meeting 2026-W${pad(i - 51)}`);
  const agendas = ['schedule check', 'blockers', 'next week\'s priorities', 'pre-release check', 'retro items', 'triaging external requests', 'hiring progress', 'budget check', 'customer request roundup'];
  for (let i = 0; i < 40; i++) add({ id: `ops-archive-${i}`, title: meet(i), path: `src-work/operations/meetings/${i < 52 ? `2025-W${pad(i + 1)}` : `2026-W${pad(i - 51)}`}.md`, parent: 'work-ops-meetings',
    updated: ago(670 - i * 7), summary: `Past weekly meeting notes focused on ${at(agendas, i)} (fictional).`,
    body: `# ${meet(i)}\n\n- Agenda: ${at(agendas, i)} · ${at(agendas, i + 3)}\n- Decision: set owners and due dates during the meeting${i % 6 === 0 ? `\n- Summary: summarized with ${ref('ops-meeting-prompt', 'Meeting notes summary prompt')}` : ''}${prev('ops-archive', i, meet, 'Previous meeting')}` });
  const causes = ['certificate expiry', 'missing config', 'full disk', 'wrong deploy order', 'external service latency', 'cache reset failure', 'permission change', 'time zone calculation', 'request spike', 'backup failure', 'missed alert', 'dependency change'];
  const inc = (i: number) => `Incident report 2026-${pad(i + 1, 3)}`;
  for (let i = 0; i < 24; i++) add({ id: `ops-inc-${i}`, title: `${inc(i)} · ${at(causes, i)}`, path: `src-work/operations/incidents/inc-2026-${pad(i + 1, 3)}.md`, parent: 'work-ops-incidents',
    updated: ago(300 - i * 12), summary: `Impact, cause, and prevention for a fictional incident caused by ${at(causes, i)}.`, topics: opt([...when(i % 3 === 0, 'moc-dev'), ...when(i % 4 === 1, 'moc-retro')]),
    body: `# ${inc(i)} · ${at(causes, i)}\n\n- Impact: some screens ${i % 2 ? 'slowed down' : 'would not load'} (fictional)\n- Cause: ${at(causes, i)}\n- Prevention: added one line to the checklist\n- Template: ${ref('ops-incident', 'Incident report template')}${i % 5 === 2 ? `\n- Related QA: ${ref(`orbit-qa-${i % 14}`, qa(i % 14))}` : ''}` });
  const rules = ['shared folder naming', 'external sharing approval', 'vacation handoff', 'password management principles', 'meeting time principles', 'document retention period', 'deploy windows', 'customer response standards', 'expense approval steps', 'tool adoption process'];
  rules.forEach((r, i) => add({ id: `ops-rule-${i}`, title: `Operating rule · ${r}`, path: `src-work/operations/rules/rule-${pad(i + 1)}.md`, parent: 'work-ops',
    updated: ago(200 - i * 9), summary: `Team agreement on "${r}" (example).`, topics: opt([...when(i % 4 === 0, 'moc-planning'), ...when(i === 2 || i === 4, 'moc-health')]),
    body: `# Operating rule · ${r}\n\n- Principle: short and easy to keep\n- Exceptions: talk to the owner\n- For new people: covered in ${ref('ops-onboarding', 'New hire onboarding guide')}` }));

  // ── Clients (fictional companies) ──
  const clients = [['larkmoor', 'Larkmoor Logistics'], ['fernquill', 'Fernquill Publishing'], ['ashgrove', 'Ashgrove Learning'], ['oakhollow', 'Oakhollow Furniture'], ['saltmeadow', 'Saltmeadow Foods']];
  const steps = [['kickoff', 'First meeting notes'], ['needs', 'Requirements'], ['proposal', 'Proposal draft'], ['scope', 'Contract scope notes'], ['midterm', 'Midpoint report'], ['retro', 'Retrospective']];
  clients.forEach(([slug, name], c) => steps.forEach(([step, label], s) => add({ id: `client-${c}-${s}`, title: `${name} · ${label}`, path: `src-work/clients/${slug}/${step}.md`, parent: 'work-clients',
    updated: ago(260 - c * 40 - s * 6), summary: `${label} for work with ${name} (fictional company).`, topics: opt([...when(s === 2 && c % 2 === 0, 'moc-planning'), ...when(s === 5, 'moc-retro')]),
    body: `# ${name} · ${label}\n\nAll companies and people are fictional for the demo.\n\n- Key point: confirm the ${at(['schedule', 'scope', 'budget basis', 'owner', 'reporting cadence', 'next collaboration'], s)}\n${s > 0 ? `- Previous step: ${ref(`client-${c}-${s - 1}`, `${name} · ${steps[s - 1][1]}`)}` : `- Kickoff check: ${ref('projects-checklist', 'Project kickoff checklist')}`}` })));

  // ── Content: newsletter · video · social ──
  const issue = (i: number) => { const m = i + 3; const y = m > 12 ? 2026 : 2025; return { y, m: m > 12 ? m - 12 : m }; };
  const issueTitle = (i: number) => { const { y, m } = issue(i); return `Newsletter ${MONTHS[m - 1]} ${y}`; };
  const themes = ['New year planning', 'Spring update', 'Customer stories', 'On accessibility', 'Wrap-up before summer break', 'How to read data', 'Meet the team', 'Fall update', 'Tool cleanup', 'Year in review'];
  for (let i = 0; i < 20; i++) { const { y, m } = issue(i); add({ id: `content-issue-${i}`, title: issueTitle(i), path: `src-work/content/newsletter/${y}-${pad(m)}.md`, parent: 'work-newsletter',
    updated: `${y}-${pad(m)}-${pad(3 + (i % 5))}`, summary: `Newsletter sent on the theme "${at(themes, i)}" (fictional).`, topics: opt(when(i % 4 === 1, 'moc-writing')),
    body: `# ${issueTitle(i)}\n\nTheme: ${at(themes, i)}\n\n- Opening paragraph: the month in one line\n- Three news items\n- Sentence standard: ${ref('content-style', 'Writing style guide')}${prev('content-issue', i, issueTitle, 'Previous issue')}` }); }
  const videos = ['Metrics dashboard tour', 'Meeting notes in 3 minutes', 'Searching well', 'Mobile app first screen', 'Follow-along accessibility check', 'Reading data tables', 'Our retro format', 'Automating support replies', 'How the newsletter gets made', 'Naming documents', 'Writing release notes', 'Looking back on the year'];
  videos.forEach((v, i) => add({ id: `content-video-${i}`, title: `Video script · ${v}`, path: `src-work/content/video/ep-${pad(i + 1)}.md`, parent: 'work-video',
    updated: ago(150 - i * 9), summary: `Scene-by-scene script for the "${v}" video (fictional).`, topics: opt([...when(i % 3 === 0, 'moc-writing'), ...when(i % 4 === 3, 'moc-design')]),
    body: `# Video script · ${v}\n\n1. Opening scene: the problem in one sentence\n2. Demo scene: switch screens three times\n3. Closing scene: one thing to try\n\nSchedule: ${ref('content-calendar', 'Content publishing calendar')}` }));
  const posts = ['Quick tip · adding links', 'Quick tip · fewer meetings', 'Quick tip · choosing search terms', 'Quick tip · document names', 'Event announcement', 'Hiring announcement', 'Release news', 'Customer story', 'Team life', 'Book recommendation', 'Year-end greeting', 'New year greeting'];
  posts.forEach((p, i) => add({ id: `content-post-${i}`, title: `Social post · ${p}`, path: `src-work/content/social/post-${pad(i + 1)}.md`, parent: 'work-video',
    updated: ago(120 - i * 8), summary: `Copy and image description for the "${p}" post (fictional).`,
    body: `# Social post · ${p}\n\n- Copy: two sentences or fewer\n- Image: include alt text\n${i % 3 === 0 ? `- Source video: ${ref(`content-video-${i % videos.length}`, `Video script · ${at(videos, i)}`)}` : '- Hashtags: three or fewer'}` }));

  // ── Personal · Learning: reading · courses · study group · Japanese ──
  const A = ['Quiet', 'Old', 'Small', 'Slow', 'Steady', 'Light', 'Deep', 'Gentle'];
  const N = ['Habits', 'Questions', 'Maps', 'Cities', 'Forests', 'Letters', 'Hours', 'Records'];
  const book = (i: number) => `${A[i % 8]} ${N[(i % 8 + Math.floor(i / 8)) % 8]}`;
  for (let i = 0; i < 40; i++) add({ id: `reading-${i}`, title: `Reading notes · ${book(i)}`, path: `src-personal/learning/reading/library/book-${pad(i + 1, 3)}.md`, parent: 'personal-reading',
    updated: ago(400 - i * 9), summary: `Notes from reading the fictional book "${book(i)}".`, topics: opt([...when(i % 6 === 0, 'moc-writing'), ...when(i % 6 === 3, 'moc-planning'), ...when(i % 9 === 4, 'moc-health')]),
    body: `# Reading notes · ${book(i)}\n\n- One sentence to remember\n- To try right away: ${at(['writing 10 minutes each morning', 'making a question list', 'thinking on walks', 'one-line summaries', 'cutting the to-do list'], i)}\n- One question to look into${i % 5 === 0 ? `\n\nSimilar note: ${ref(`learn-book-${(i / 5) % 12}`, `Reading notes · ${at(['Learning Slowly', 'Small Habits, Long Days (fictional)', 'The Craft of Questions', 'A Grammar of Design', 'Data and Story', 'Writing That Lasts', 'What Notes Are For', 'Working Side by Side', 'Reading the Numbers', 'Good Calls', 'Make It Plain', 'A Map for Learning'], i / 5)}`)}` : ''}` });
  const courses = [['data', 'Intro to data analysis'], ['ux', 'UX research basics'], ['python', 'Python automation'], ['stats', 'Statistics revisited']];
  const lessons = ['Orientation', 'Core concepts', 'Getting to know the tools', 'First exercise', 'Reading case studies', 'Common mistakes', 'Small assignment', 'Wrap-up and next steps'];
  courses.forEach(([slug, name], c) => lessons.forEach((l, k) => add({ id: `course-${c}-${k}`, title: `${name} lecture ${k + 1} · ${l}`, path: `src-personal/learning/courses/${slug}/lecture-${pad(k + 1)}.md`, parent: 'personal-courses',
    updated: ago(220 - c * 30 - k * 3), summary: `Notes on lecture ${k + 1} of the online course "${name}" (fictional).`, topics: opt([...when(c === 1 && k % 2 === 0, 'moc-design', 'moc-method'), ...when(c === 3 && k % 3 === 1, 'moc-method'), ...when(c === 2 && k === 6, 'moc-dev')]),
    body: `# ${name} lecture ${k + 1} · ${l}\n\n- One-line summary\n- What I followed along with\n- What confused me${k > 0 ? `\n\nPrevious lecture: ${ref(`course-${c}-${k - 1}`, `${name} lecture ${k} · ${lessons[k - 1]}`)}` : ''}${c === 2 && k === 0 ? `\nSee also: ${ref('learn-typescript', 'TypeScript study notes')}` : ''}` })));
  const mlTopics = ['Convolutional neural networks', 'Recurrent neural networks', 'Embeddings', 'Attention mechanisms', 'Transfer learning', 'Handling overfitting', 'Hyperparameters', 'Model interpretation', 'Recommendation basics', 'Time series forecasting', 'A taste of reinforcement learning', 'Wrapping up the study group'];
  mlTopics.forEach((t, i) => add({ id: `ml-week-late-${i}`, title: `Week ${i + 9} · ${t}`, path: `src-personal/learning/ml-study/week-${i + 9}.md`, parent: 'guide-study-ml',
    updated: ago(Math.max(0, 30 - i * 2)), summary: `Study group notes: ${t} (fictional).`, topics: ['moc-ai', ...when(i % 4 === 3, 'moc-method')],
    body: `# Week ${i + 9} · ${t}\n\n- Key concepts\n- Practice problems\n\nLast week: ${i === 0 ? ref('ml-week-extra-5', 'Week 8 · Evaluation revisited') : ref(`ml-week-late-${i - 1}`, `Week ${i + 8} · ${mlTopics[i - 1]}`)}` }));
  const jp = ['Greetings', 'Numbers', 'Time', 'Family', 'Ordering food', 'Asking directions', 'Shopping', 'Weather', 'Hobbies', 'Daily routine', 'Transportation', 'At the hospital', 'On the phone', 'Making plans', 'Travel', 'Expressing feelings', 'Asking favors', 'Apologizing', 'Office life', 'Seasonal events', 'Polite speech basics', 'Writing letters', 'Listening to the news', 'Review'];
  jp.forEach((t, i) => add({ id: `jp-lesson-${i}`, title: `Japanese lesson ${i + 1} · ${t}`, path: `src-personal/learning/japanese/lesson-${pad(i + 1)}.md`, parent: 'guide-japanese',
    updated: ago(180 - i * 6), summary: `Phrases and example sentences on "${t}" (fictional textbook).`, topics: opt(when(t === 'Travel', 'moc-planning')),
    body: `# Japanese lesson ${i + 1} · ${t}\n\n- Five phrases\n- Read three example sentences aloud\n${i > 0 ? `\nPrevious lesson: ${ref(`jp-lesson-${i - 1}`, `Japanese lesson ${i} · ${jp[i - 1]}`)}` : ''}${t === 'Travel' ? `\nTrip prep: ${ref('life-trip', 'Island trip plan')}` : ''}` }));
  for (let i = 0; i < 6; i++) add({ id: `jp-vocab-${i}`, title: `Japanese vocabulary list ${i + 1}`, path: `src-personal/learning/japanese/vocab-${pad(i + 1)}.md`, parent: 'guide-japanese',
    updated: ago(170 - i * 24), summary: `Weekend review list of the words from lessons ${i * 4 + 1}–${i * 4 + 4}.`,
    body: `# Japanese vocabulary list ${i + 1}\n\n${[0, 1, 2, 3].map(k => `- ${ref(`jp-lesson-${i * 4 + k}`, `Japanese lesson ${i * 4 + k + 1} · ${jp[i * 4 + k]}`)}`).join('\n')}` });

  // ── Personal · Journal: retrospectives ──
  const wk = (i: number) => `Weekly review 2026-W${pad(10 + i)}`;
  const highs = ['finished as planned', 'worked out three times', 'read a book', 'went to bed early', 'presented at study group', 'tidied up', 'dinner with family', 'tried a new recipe'];
  for (let i = 0; i < 26; i++) add({ id: `review-week-${i}`, title: wk(i), path: `src-personal/journal/reviews/2026-W${pad(10 + i)}.md`, parent: 'personal-reviews',
    updated: ago(240 - i * 7), summary: `A personal retrospective on wins, things put off, and a promise for next week (fictional).`, topics: opt(when(i % 3 === 0, 'moc-retro')),
    body: `# ${wk(i)}\n\n- Went well: ${at(highs, i)}\n- Put off: ${at(highs, i + 3)}\n- One promise for next week\n\nTemplate: ${ref('journal-weekly-review', 'Weekly review')}${prev('review-week', i, wk, 'Last week')}` });
  const month = (i: number) => { const m = i + 10; return m > 12 ? `${MONTHS[m - 13]} 2026 review` : `${MONTHS[m - 1]} 2025 review`; };
  for (let i = 0; i < 12; i++) { const m = i + 10; const y = m > 12 ? 2026 : 2025; const mm = m > 12 ? m - 12 : m;
    add({ id: `review-month-${i}`, title: month(i), path: `src-personal/journal/reviews/${y}-${pad(mm)}.md`, parent: 'personal-reviews',
      updated: `${mm === 12 ? y + 1 : y}-${pad(mm === 12 ? 1 : mm + 1)}-01`, summary: 'A look back at a month of habits, study, and life.', topics: ['moc-retro', ...when(i % 3 === 1, 'moc-writing')],
      body: `# ${month(i)}\n\n- One habit kept, one habit missed\n- The scene that stayed with me most\n- What to change next month${i > 0 ? `\n\nLast month: ${ref(`review-month-${i - 1}`, month(i - 1))}` : ''}${i === 11 ? `\nNext: ${ref('journal-october', 'October review')}` : ''}` }); }

  // ── Personal · Life: health · running · budget · cooking · travel · garden ──
  const wo = (i: number) => `Workout log 2026-${pad(i + 1, 3)}`;
  for (let i = 0; i < 30; i++) add({ id: `health-workout-${i}`, title: wo(i), path: `src-personal/life/health/workout/2026-${pad(i + 1, 3)}.md`, parent: 'personal-health',
    updated: ago(250 - i * 6), summary: 'That day\'s workout, duration, and condition (fictional).', topics: opt(when(i % 5 === 0, 'moc-health')),
    body: `# ${wo(i)}\n\n- ${at(['strength training, 40 minutes', 'walking, 1 hour', 'swimming, 30 minutes', 'cycling, 45 minutes', 'stretching, 20 minutes'], i)}\n- Condition: ${at(['good', 'okay', 'tired', 'light'], i)}\n\nPlan: ${ref('life-workout', 'Workout routine')}` });
  const sleep = (i: number) => `Sleep notes week ${i + 1}`;
  for (let i = 0; i < 10; i++) add({ id: `health-sleep-${i}`, title: sleep(i), path: `src-personal/life/health/sleep/week-${pad(i + 1)}.md`, parent: 'personal-health',
    updated: ago(140 - i * 7), summary: 'Weekly notes on bedtime, wake-ups, and daytime condition (fictional).', topics: ['moc-health'],
    body: `# ${sleep(i)}\n\n- Bedtime: ${at(['before 11', 'around midnight', '11:30'], i)}\n- Screens off: 30 minutes before bed\n- Daytime condition: ${at(['good', 'okay', 'sleepy in the afternoon'], i)}${prev('health-sleep', i, sleep, 'Last week')}` });
  const run = (i: number) => `Half marathon training week ${Math.floor(i / 3) + 1} run ${(i % 3) + 1}`;
  for (let i = 0; i < 18; i++) add({ id: `running-${i}`, title: run(i), path: `src-personal/life/running/week-${pad(Math.floor(i / 3) + 1)}-${(i % 3) + 1}.md`, parent: 'guide-running',
    updated: ago(90 - i * 4), summary: `Training log: ${at(['long slow run', 'intervals', 'hills'], i)} (fictional).`, topics: opt(when(i % 3 === 0, 'moc-health')),
    body: `# ${run(i)}\n\n- Workout: ${at(['long slow run', '1 minute fast · 2 minutes easy, repeated', 'hill climbs'], i)}\n- How I felt: ${at(['light', 'tight calves', 'okay'], i)}${prev('running', i, run, 'Previous run')}${i % 6 === 5 ? `\n\nRest-day exercise: ${ref('life-workout', 'Workout routine')}` : ''}` });
  const fin = (i: number) => { const m = i + 11; const y = m > 12 ? (m > 24 ? 2026 : 2025) : 2024; const mm = ((m - 1) % 12) + 1; return { y, mm }; };
  const finTitle = (i: number) => { const { y, mm } = fin(i); return `${MONTHS[mm - 1]} ${y} budget check`; };
  for (let i = 0; i < 24; i++) { const { y, mm } = fin(i); add({ id: `finance-${i}`, title: finTitle(i), path: `src-personal/life/finance/${y}-${pad(mm)}.md`, parent: 'personal-finance',
    updated: `${y}-${pad(mm)}-28`, summary: 'A month of spending checked against the budget (no amounts, example).', topics: opt(when(i % 6 === 5, 'moc-planning')),
    body: `# ${finTitle(i)}\n\n- Fixed costs: within budget\n- Variable costs: ${at(['food slightly over', 'within budget', 'leisure over', 'transport down'], i)}\n- Emergency fund: moved per the rule\n\nBasis: ${ref('life-budget', 'Living expenses budget')}${prev('finance', i, finTitle, 'Last month')}` }); }
  const dishes = ['minestrone', 'chicken breast salad', 'braised tofu', 'stir-fried glass noodles', 'vegetable curry', 'veggie wraps', 'potato pancakes', 'leek and potato soup', 'pan-fried mushrooms', 'omelet', 'pasta', 'fish cakes', 'frittata', 'cold sesame noodles', 'garlic spinach', 'chicken stew', 'chicken noodle soup', 'salmon rice bowl', 'pumpkin soup', 'sandwiches', 'dumpling soup', 'stir-fried udon', 'grain bowl', 'miso soup'];
  dishes.forEach((d, i) => add({ id: `kitchen-${i}`, title: `Cooking log · ${d}`, path: `src-personal/life/kitchen/dish-${pad(i + 1)}.md`, parent: 'personal-kitchen',
    updated: ago(200 - i * 8), summary: `Tips from making ${d} for the first time.`, topics: opt(when(i % 4 === 1, 'moc-health')),
    body: `# Cooking log · ${d}\n\n- Prep the ingredients ahead\n- Season once, at the end\n- Next time: ${at(['lower the heat', 'make half', 'add more vegetables'], i)}${i % 6 === 0 ? `\n\nGo-to recipes: ${ref('life-recipes', 'Go-to recipes')}` : ''}` }));
  const trips = [['lisbon', 'Lisbon'], ['kyoto', 'Kyoto'], ['edinburgh', 'Edinburgh'], ['vancouver', 'Vancouver']];
  const tripDocs = [['plan', 'Plan'], ['day-1', 'Day 1'], ['day-2', 'Day 2'], ['photos', 'Photo notes'], ['review', 'Look back']];
  trips.forEach(([slug, name], t) => tripDocs.forEach(([doc, label], d) => add({ id: `trip-${t}-${d}`, title: `${name} trip · ${label}`, path: `src-personal/life/travel/${slug}/${doc}.md`, parent: 'personal-travel',
    updated: ago(330 - t * 70 - d), summary: `${label} for the ${name} trip (fictional itinerary).`, topics: opt([...when(d === 0, 'moc-planning'), ...when(d === 4 && t % 2 === 0, 'moc-retro')]),
    body: `# ${name} trip · ${label}\n\n- ${d === 0 ? 'Schedule: 2 days, 1 night' : d === 4 ? 'If I went again: one more day' : 'Where I walked · what I ate · where I rested'}\n${d > 0 ? `- Previous entry: ${ref(`trip-${t}-${d - 1}`, `${name} trip · ${tripDocs[d - 1][1]}`)}` : `- See also: ${ref('life-trip', 'Island trip plan')}`}` })));
  const plants = ['cherry tomatoes', 'lettuce', 'basil', 'chili peppers', 'scallions', 'mint'];
  const garden = (i: number) => `Garden observation ${pad(i + 1)} · ${at(plants, i)}`;
  for (let i = 0; i < 18; i++) add({ id: `garden-${i}`, title: garden(i), path: `src-personal/life/garden/note-${pad(i + 1)}.md`, parent: 'guide-garden',
    updated: ago(190 - i * 9), summary: `Water, sunlight, and growth log for the ${at(plants, i)} pot.`,
    body: `# ${garden(i)}\n\n- Water: ${i % 2 ? 'every other day' : 'when the soil is dry'}\n- Sunlight: half the morning\n- Change: ${at(['new leaves', 'flowering', 'first fruit', 'yellowing leaves'], i)}${prev('garden', i, garden, 'Previous observation')}` });

  // ── Research: papers · reading group · experiments · survey · datasets ──
  const fields = ['Search ranking', 'Recommender systems', 'Document summarization', 'Question answering', 'Knowledge graphs', 'User behavior', 'Visualization evaluation', 'Conversational agents'];
  const designs = ['comparative study', 'case analysis', 'large-scale experiment', 'survey study', 'replication study', 'model proposal'];
  const paper = (i: number) => `${fields[i % 8]} ${designs[Math.floor(i / 8)]}`;
  for (let i = 0; i < 48; i++) add({ id: `paper-${i}`, title: `Paper notes · ${paper(i)}`, path: `src-research/papers/paper-${pad(i + 1, 3)}.md`, parent: 'research-papers',
    updated: ago(300 - i * 6), summary: `Question, method, results, and doubts for the fictional paper "${paper(i)}".`,
    topics: opt([...when(i % 4 === 0, 'moc-method'), ...when(/Question|Conversational|summarization/.test(fields[i % 8]) && i % 3 !== 2, 'moc-ai'), ...when(fields[i % 8] === 'Visualization evaluation' && i % 2 === 0, 'moc-design')]),
    listedBy: opt(when(i % 12 === 7, 'personal-reading')),
    body: `# Paper notes · ${paper(i)} (fictional)\n\n- Question: what changes the outcome? (${fields[i % 8]})\n- Method: ${designs[Math.floor(i / 8)]}\n- Results: depends on conditions\n- Doubts: the sample is small${i >= 8 ? `\n\nSame field: ${ref(`paper-${i - 8}`, `Paper notes · ${paper(i - 8)}`)}` : ''}${fields[i % 8] === 'Search ranking' && i >= 16 ? `\nApplied at work: ${ref(`atlas-exp-${(i / 8) % 12}`, `Relevance experiment ${pad(((i / 8) % 12) + 1)} · ${methods[(i / 8) % 12]}`)}` : ''}` });
  const session = (i: number) => `Paper reading group session ${i + 1}`;
  for (let i = 0; i < 16; i++) add({ id: `rg-session-${i}`, title: session(i), path: `src-research/reading-group/session-${pad(i + 1)}.md`, parent: 'guide-reading-group',
    updated: ago(220 - i * 14), summary: `Session notes: two ${fields[i % 8]} papers read together (fictional).`, topics: opt(when(i % 5 === 4, 'moc-retro')),
    body: `# ${session(i)}\n\n- Presented: ${ref(`paper-${(i * 3) % 48}`, `Paper notes · ${paper((i * 3) % 48)}`)}\n- Discussed: ${ref(`paper-${(i * 3 + 8) % 48}`, `Paper notes · ${paper((i * 3 + 8) % 48)}`)}\n- One question for the next session${prev('rg-session', i, session, 'Previous session')}` });
  const hyps = ['shorter titles read better', 'showing the summary first increases reading time', 'lightness instead of color shows order', 'bundled notifications get turned off less', 'examples make prompts shorter', 'query suggestions reduce re-searching', 'empty-state copy reduces drop-off', 'step indicators increase completion', 'font size changes reading speed', 'showing the sort order raises trust', 'slow screens need a progress indicator', 'two-step confirmation reduces mistakes'];
  const exp = (i: number) => `Experiment log ${pad(i + 1)} · ${at(hyps, i)}`;
  for (let i = 0; i < 24; i++) add({ id: `experiment-${i}`, title: exp(i), path: `src-research/experiments/exp-${pad(i + 1, 3)}.md`, parent: 'research-experiments',
    updated: ago(260 - i * 9), summary: `Log of testing the hypothesis "${at(hyps, i)}" with fictional participants.`, topics: opt([...when(i % 2 === 0, 'moc-method'), ...when(i % 6 === 1, 'moc-design'), ...when(i % 8 === 4, 'moc-ai'), ...when(i % 12 === 3, 'moc-health')]),
    body: `# ${exp(i)}\n\n- Hypothesis: ${at(hyps, i)}\n- Method: alternate between two versions\n- Results: ${i % 3 === 0 ? 'differs from the hypothesis — recorded as is' : 'close to the hypothesis — rerun with a larger sample'}\n- Data: ${ref(`dataset-${i % 16}`, `Dataset card · ${at(['document title sample', 'search log summary', 'screen dwell sample', 'survey response sample', 'notification response sample', 'inquiry text sample', 'reading speed sample', 'click order sample'], i % 16)}${i % 16 >= 8 ? ' 2' : ''}`)}${i >= 12 ? `\n\nEarlier experiment: ${ref(`experiment-${i - 12}`, exp(i - 12))}` : ''}` });
  const surveyFixed = [['design', 'Survey design'], ['items-1', 'Item draft 1'], ['items-2', 'Item draft 2'], ['pilot', 'Pilot notes'], ['summary', 'Overall analysis']];
  const teams = ['Planning', 'Design', 'Engineering', 'Operations', 'Sales', 'Customer support', 'Content', 'People', 'Finance', 'Research', 'Data'];
  surveyFixed.forEach(([slug, label], i) => add({ id: `survey-fixed-${i}`, title: `Work tools survey · ${label}`, path: `src-research/survey/${slug}.md`, parent: 'guide-survey',
    updated: ago(160 - i * 20), summary: `${label} for the work tools survey (fictional responses).`, topics: opt(when(i !== 3, 'moc-method')),
    body: `# Work tools survey · ${label}\n\n- Purpose: learn which tools each team uses and why\n- All responses are fictional${i > 0 ? `\n\nPrevious step: ${ref(`survey-fixed-${i - 1}`, `Work tools survey · ${surveyFixed[i - 1][1]}`)}` : ''}${i === 4 ? `\n${teams.map((t, k) => `- ${ref(`survey-team-${k}`, `Work tools survey · ${t} team analysis`)}`).join('\n')}` : ''}` }));
  teams.forEach((t, k) => add({ id: `survey-team-${k}`, title: `Work tools survey · ${t} team analysis`, path: `src-research/survey/teams/team-${pad(k + 1)}.md`, parent: 'guide-survey',
    updated: ago(100 - k * 3), summary: `Tool habits seen in the ${t} team's responses (fictional).`, topics: opt(when(k % 4 === 2, 'moc-retro')),
    body: `# Work tools survey · ${t} team analysis\n\n- Three most-used tools\n- Pain point: ${at(['search is slow', 'too many notifications', 'documents are scattered', 'permission requests are a hassle'], k)}\n- Item basis: ${ref('survey-fixed-2', 'Work tools survey · Item draft 2')}` }));
  const datasets = ['document title sample', 'search log summary', 'screen dwell sample', 'survey response sample', 'notification response sample', 'inquiry text sample', 'reading speed sample', 'click order sample'];
  for (let i = 0; i < 16; i++) { const name = `${datasets[i % 8]}${i >= 8 ? ' 2' : ''}`;
    add({ id: `dataset-${i}`, title: `Dataset card · ${name}`, path: `src-research/datasets/card-${pad(i + 1)}.md`, parent: 'research-datasets',
      updated: ago(280 - i * 11), summary: `Source, scope, and caveats for the fictional dataset "${name}".`, topics: opt(when(i % 3 === 0, 'moc-method')),
      body: `# Dataset card · ${name}\n\n- Source: fictional records made for the demo\n- Scope: ${i >= 8 ? 'second collection' : 'first collection'}\n- Caveats: no personally identifiable information · small sample${i >= 8 ? `\n\nFirst collection: ${ref(`dataset-${i - 8}`, `Dataset card · ${datasets[i - 8]}`)}` : ''}` }); }
  [['research-data-management-rules.pdf', 'Research data management rules.pdf'], ['survey-consent-form.pdf', 'Survey consent form.pdf']].forEach(([file, t], i) => add({ id: `research-pdf-${i}`, title: t, path: `src-research/datasets/${file}`, parent: 'research-datasets',
    updated: ago(200 - i * 30), format: 'pdf', summary: `${t.replace('.pdf', '')} PDF. This demo does not support viewing PDF contents.` }));

  // ── Remainder: daily log archive (one per day from 2026-07-01) ──
  const left = budget - out.length;
  if (left < 30 || left > 95) throw new Error(`Demo size needs adjusting: daily log archive has ${left} entries`);
  const start = Date.UTC(2026, 6, 1);
  const dateOf = (i: number) => new Date(start + i * 86400000);
  const dayTitle = (i: number) => { const d = dateOf(i); return `Daily log ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
  const moods = ['bright', 'a bit tired', 'focused', 'busy', 'calm', 'scattered'];
  for (let i = 0; i < left; i++) { const iso = dateOf(i).toISOString().slice(0, 10);
    add({ id: `daily-archive-${i}`, title: dayTitle(i), path: `src-personal/journal/daily/${iso}.md`, parent: 'personal-daily',
      updated: iso, summary: 'A short log of mood, what I did, and what to do tomorrow (fictional).', topics: opt(when(i % 15 === 7, 'moc-writing')),
      body: `# ${dayTitle(i)}\n\nMood: ${at(moods, i)}\nDid: ${at(['study notes', 'exercise', 'reading', 'watering the garden', 'one Japanese lesson'], i)}${i % 7 === 6 ? `\nWeekly summary: ${ref(`review-week-${Math.min(25, 16 + Math.floor(i / 7))}`, wk(Math.min(25, 16 + Math.floor(i / 7))))}` : ''}${prev('daily-archive', i, dayTitle)}` }); }
  return out;
}
