// Synthetic demo data: a fictional vault for showcase demos and development. It is unrelated to real materials, real operating figures, or real people.
// Area and MOC names are design examples, not the user's actual categories. All paths are fictional and nothing is read from disk.
//
// Builds a fictional file list that follows the secondbrain-index-sync structure.
//   - Top-level guide documents: CLAUDE.md · work.md · work--<topic>.md · moc-<topic>.md · project-<name>.md
//   - Source files: src-work/… · src-personal/… (fictional external folders registered in the router's 'External source folders' table)
//   - Links: [name](path relative to the linking document). The graph reads only these links, and classification (primary membership) also comes from links.
// The definitions (seeds) below are for authoring convenience. Output files have no id or parent; only the links in index bodies remain.
//   - parent: the index used for primary classification (a link appears under 'Items' in that index body → primary membership)
//   - listedBy: also listed in an index elsewhere (→ index link)
//   - topics: listed in topic MOCs (→ topic link)
//   - {{id|name}} in a material body: an authoring reference. On output it becomes a relative link [name](…/file.md) to that material (topic link)
import { relativeHref } from '../core/markdown';
import type { Dataset, NodeKind } from '../core/types';
import type { VaultFile } from '../core/vault';
import { expandHubs, expandMaterials, type Seed } from './demo-expand';
import { scaleHubs, scaleMaterials } from './demo-scale';


const seeds: Seed[] = [
  // ── Router ──
  { id: 'router', kind: 'router', title: 'CLAUDE.md', path: 'CLAUDE.md', parent: null, updated: '2026-11-02',
    summary: 'Guide to the whole vault. The entry point to area indexes and topic MOCs.',
    body: 'This router explains the order for finding materials in this vault. (Fictional demo vault)\n\n1. If you know what a material is about, look in the area index.\n2. If the topic spans several areas, look in the topic MOC.\n3. When you create a new material, link it from both the area index and the related MOC.' },

  // ── Area indexes ──
  { id: 'area-work', kind: 'area', title: 'Work', path: 'work.md', parent: 'router', updated: '2026-11-01',
    summary: 'Work area index. Split into projects, operations, and content.',
    body: 'This is the index for the work area. Pick a sub-index first; frequently used documents are listed directly below.' },
  { id: 'area-personal', kind: 'area', title: 'Personal', path: 'personal.md', parent: 'router', updated: '2026-10-30',
    summary: 'Personal area index. Split into learning, journal, and life.',
    body: 'This is the index for the personal area. It keeps what I studied, what I reflected on, and life plans apart.' },

  // ── Topic MOCs ──
  { id: 'moc-planning', kind: 'moc', title: 'Planning', path: 'moc-planning.md', parent: 'router', updated: '2026-10-28',
    summary: 'A topic map gathering planning materials regardless of area.', body: 'Materials for setting goals, splitting scope, and recording decisions.' },
  { id: 'moc-dev', kind: 'moc', title: 'Development', path: 'moc-development.md', parent: 'router', updated: '2026-10-27',
    summary: 'A topic map gathering development and data materials.', body: 'Materials about code, data, and quality standards.' },
  { id: 'moc-ai', kind: 'moc', title: 'AI in practice', path: 'moc-ai.md', parent: 'router', updated: '2026-11-03',
    summary: 'A topic map gathering ways to use AI tools for work and learning.', body: 'See the prompts used at work and the notes made while studying in one place.' },
  { id: 'moc-writing', kind: 'moc', title: 'Writing', path: 'moc-writing.md', parent: 'router', updated: '2026-10-25',
    summary: 'A topic map gathering materials for writing and editing.', body: 'Materials that end up as writing, such as style rules, drafts, and retrospectives.' },

  // ── Work · sub-indexes ──
  { id: 'work-projects', kind: 'subindex', title: 'Work · Projects', path: 'work--projects.md', parent: 'area-work', updated: '2026-10-31',
    summary: 'Guide documents for active projects and a shared checklist.', body: 'For each project, check the reading order in its guide document (README).' },
  { id: 'work-ops', kind: 'subindex', title: 'Work · Operations', path: 'work--operations.md', parent: 'area-work', updated: '2026-11-02',
    summary: 'Templates and standards used to run the team.', body: 'Templates for recurring operations work such as meetings, retrospectives, and incident response.' },
  { id: 'work-content', kind: 'subindex', title: 'Work · Content', path: 'work--content.md', parent: 'area-work', updated: '2026-10-29',
    summary: 'Materials for published posts, videos, and newsletters.', body: 'Collects the publishing calendar, drafts, and style standards.' },

  // ── Personal · sub-indexes ──
  { id: 'personal-learning', kind: 'subindex', title: 'Personal · Learning', path: 'personal--learning.md', parent: 'area-personal', updated: '2026-11-03',
    summary: 'Notes from studying and study group guides.', body: 'Organizes what I studied by topic. Work materials I use for learning are linked here as well.' },
  { id: 'personal-journal', kind: 'subindex', title: 'Personal · Journal', path: 'personal--journal.md', parent: 'area-personal', updated: '2026-11-01',
    summary: 'A place for retrospectives and thoughts.', body: 'Weekly retrospectives, monthly reviews, and ideas as they come.' },
  { id: 'personal-life', kind: 'subindex', title: 'Personal · Life', path: 'personal--life.md', parent: 'area-personal', updated: '2026-10-26',
    summary: 'Life logs and plans.', body: 'Materials for daily life such as exercise, budget, travel, and cooking.' },

  // ── Project guides ──
  { id: 'guide-nova', kind: 'guide', title: 'Nova website redesign guide', path: 'project-nova.md', parent: 'work-projects', updated: '2026-10-30',
    summary: 'Reading order for the Nova website redesign project (fictional).', body: 'Read in this order: brief → information architecture → meeting notes. Accessibility criteria are settled before development.' },
  { id: 'guide-lumen', kind: 'guide', title: 'Lumen metrics dashboard guide', path: 'project-lumen.md', parent: 'work-projects', updated: '2026-10-24',
    summary: 'Guide to an internal dashboard project (fictional) that shows team metrics on one screen.', body: 'Read the documents in this order: metric definitions → collection → retrospective.' },
  { id: 'guide-study-ml', kind: 'guide', title: 'Machine learning study group guide', path: 'project-ml-study.md', parent: 'personal-learning', updated: '2026-10-19',
    summary: 'Guide to the weekly notes of a study group (fictional) that meets every other Saturday.', body: 'Read the weekly notes in order; the reference list keeps growing.' },

  // ── Materials: Nova ──
  { id: 'nova-brief', kind: 'material', title: 'Nova redesign brief', path: 'src-work/projects/nova/brief.md', parent: 'guide-nova', updated: '2026-10-08',
    topics: ['moc-planning'], summary: 'Redesign goals and scope so first-time visitors understand what the service does within 30 seconds.',
    body: '# Nova website redesign brief\n\nGoal: first-time visitors understand what the service does within 30 seconds.\n\n## Scope\n- Change three screens first: home, pricing, and customer stories.\n- Keep the existing contact form flow.\n\n## Success criteria\n- Compare contact conversion and time on page against the 4 weeks before the redesign.\n\nInformation architecture continues in {{nova-ia|Nova information architecture draft}}.' },
  { id: 'nova-ia', kind: 'material', title: 'Nova information architecture draft', path: 'src-work/projects/nova/ia.md', parent: 'guide-nova', updated: '2026-10-15',
    topics: ['moc-planning'], summary: 'An information architecture that cuts the top menu from five items to three.',
    body: '# Nova information architecture draft\n\nCut the top menu from five items to three: Product · Customer stories · Pricing.\n\n- Product: reorder feature pages to follow the workflow\n- Customer stories: filter by industry\n- Pricing: merge into a single comparison table\n\nRationale and scope follow {{nova-brief|Nova redesign brief}}.' },
  { id: 'nova-kickoff', kind: 'material', title: 'Nova kickoff meeting notes', path: 'src-work/projects/nova/meetings/2026-10-12.md', parent: 'guide-nova', updated: '2026-10-12',
    summary: 'Notes from the first meeting: schedule and scope decisions and next steps.',
    body: '# Nova kickoff meeting notes · 2026-10-12\n\nAttendees: planning 2, design 1, engineering 2 (fictional people)\n\n- Schedule: share mockups in the first week of November, launch in mid-December\n- Decision: the contact form is out of scope this time\n- To do: settle accessibility criteria first → {{nova-a11y|Nova accessibility checklist}}\n\nBackground: {{nova-brief|Nova redesign brief}}' },
  { id: 'nova-a11y', kind: 'material', title: 'Nova accessibility checklist', path: 'src-work/projects/nova/a11y-checklist.md', parent: 'guide-nova', updated: '2026-10-20',
    topics: ['moc-dev'], summary: 'Checks for keyboard use, contrast, reduced motion, and alt text.',
    body: '# Nova accessibility checklist\n\n- [ ] Every menu can be opened and closed with the keyboard alone\n- [ ] Body text contrast of 4.5:1 or higher\n- [ ] Autoplay stops when reduced motion is enabled\n- [ ] Image alt text fits the context' },
  { id: 'nova-moodboard', kind: 'material', title: 'Nova moodboard.png', path: 'src-work/projects/nova/nova-moodboard.png', parent: 'guide-nova', updated: '2026-10-10',
    format: 'image', summary: 'An image board of colors and photo tone. The demo has no image file, only this description.' },

  // ── Materials: Lumen ──
  { id: 'lumen-metrics', kind: 'material', title: 'Lumen core metric definitions', path: 'src-work/projects/lumen/metrics.md', parent: 'guide-lumen', updated: '2026-09-30',
    topics: ['moc-planning', 'moc-dev'], summary: 'Definitions and aggregation periods for weekly active users, feature adoption, and response time.',
    body: '# Lumen core metric definitions\n\n| Metric | Definition | Period |\n| --- | --- | --- |\n| Weekly active users | Accounts that logged in at least once in 7 days | Weekly |\n| Feature adoption | Share of active users who used a key feature at least once | Weekly |\n| Response time | Median time until the first screen renders | Daily |\n\nAll figures and metrics are examples, not real operating values.' },
  { id: 'lumen-pipeline', kind: 'material', title: 'Lumen data collection pipeline', path: 'src-work/projects/lumen/pipeline.md', parent: 'guide-lumen', updated: '2026-10-06',
    topics: ['moc-dev'], summary: 'How usage logs are collected once a day and aggregated into metrics.',
    body: '# Lumen data collection pipeline\n\n1. Collect usage logs once a day.\n2. Remove personally identifiable information at collection time.\n3. Aggregate with the formulas in {{lumen-metrics|Lumen core metric definitions}}.\n\nOn failure, recompute that day on the next run.' },
  { id: 'lumen-retro', kind: 'material', title: 'Lumen retrospective 1', path: 'src-work/projects/lumen/retro-1.md', parent: 'guide-lumen', updated: '2026-10-22',
    summary: 'First development retrospective: metrics were agreed quickly, but a collection delay was noticed late.',
    body: '# Lumen retrospective 1\n\nWent well: agreeing on metric names first kept screen discussions short.\nCould improve: we noticed the collection delay late → added an alert step to {{lumen-pipeline|Lumen data collection pipeline}}.\nNext: borrow the {{ops-weekly-review|Weekly review}} template for the retro format.' },
  { id: 'lumen-query', kind: 'material', title: 'Metric query notes', path: 'src-work/projects/lumen/query-notes.md', parent: 'guide-lumen', updated: '2026-10-09',
    topics: ['moc-dev'], summary: 'Short notes on deduplication, time zones, and slow queries.',
    body: '# Metric query notes\n\n- Deduplicate weekly active users by account.\n- Store every timestamp in UTC.\n- For slow queries, narrow the date range first.' },

  // ── Materials: Work · shared project materials ──
  { id: 'projects-checklist', kind: 'material', title: 'Project kickoff checklist', path: 'src-work/projects/_checklist.md', parent: 'work-projects', updated: '2026-09-21',
    topics: ['moc-planning'], summary: 'A kickoff checklist covering goals, decision-makers, the guide document, and MOC links.',
    body: '# Project kickoff checklist\n\n- Wrote the goal and success criteria in one sentence\n- Named the decision-maker and update cadence\n- Wrote the reading order in the guide document (README)\n- Linked new materials from the related topic MOCs' },

  // ── Materials: Work · Operations ──
  { id: 'ops-weekly-review', kind: 'material', title: 'Weekly review', path: 'src-work/operations/weekly-review.md', parent: 'work-ops', updated: '2026-10-31',
    summary: 'A team retrospective template for finished work, blockers, and next week\'s priorities.',
    body: '# Weekly review (work)\n\n1. What we finished this week\n2. What is blocked and why\n3. Three things to do first next week\n\nSummarize meeting notes first with {{ops-meeting-prompt|Meeting notes summary prompt}}.' },
  { id: 'ops-meeting-prompt', kind: 'material', title: 'Meeting notes summary prompt', path: 'src-work/operations/prompts/meeting-notes-summary-prompt.md', parent: 'work-ops', updated: '2026-11-03',
    topics: ['moc-ai'], listedBy: ['personal-learning'],
    summary: 'A prompt that turns meeting notes into decisions, action items, and open questions. Used for both work and learning.',
    body: '# Meeting notes summary prompt\n\nRead the meeting notes below and organize them in this format.\n\n- Decisions made\n- Action items with an owner and a due date\n- Questions to check before the next meeting\n\nRule: do not guess at anything that is not in the notes; mark it "needs confirmation".\n\nI use the same frame for personal study notes → {{learn-prompt-patterns|Prompt writing patterns}}' },
  { id: 'ops-onboarding', kind: 'material', title: 'New hire onboarding guide', path: 'src-work/operations/onboarding.md', parent: 'work-ops', updated: '2026-10-14',
    topics: ['moc-writing'], summary: 'Documents to read in the first week and how to ask questions.',
    body: '# New hire onboarding guide\n\nDocuments to read in the first week\n1. {{work-faq|Work FAQ}}\n2. {{content-style|Writing style guide}}\n3. {{ops-incident|Incident report template}}\n\nPost questions in the team channel and the owner answers within a day (example).' },
  { id: 'ops-vendors', kind: 'material', title: 'External vendor list', path: 'src-work/operations/vendors.md', parent: 'work-ops', updated: '2026-09-18',
    summary: 'Printing, translation, and video vendors (all fictional companies).',
    body: '# External vendor list\n\nAll names are fictional companies for the demo.\n\n- Breezeway Print — event print materials\n- Riverbend Translation — translations of English materials\n- Daybreak Video — promo video shoots' },
  { id: 'ops-incident', kind: 'material', title: 'Incident report template', path: 'src-work/operations/incident-template.md', parent: 'work-ops', updated: '2026-10-02',
    topics: ['moc-dev'], summary: 'A template for time occurred, detected, and recovered, the cause, and prevention steps.',
    body: '# Incident report template\n\n- Time occurred / time detected / time recovered\n- Scope of impact\n- Cause (separate what is confirmed from what is assumed)\n- Prevention steps and owner' },
  { id: 'ops-brand-guide', kind: 'material', title: 'Brand guide.pdf', path: 'src-work/operations/brand-guide.pdf', parent: 'work-ops', updated: '2026-08-29',
    format: 'pdf', listedBy: ['work-content'],
    summary: 'A PDF with rules for logo, color, and typeface use. This demo does not support viewing PDF contents.' },

  // ── Materials: Work · Content ──
  { id: 'content-calendar', kind: 'material', title: 'Content publishing calendar', path: 'src-work/content/calendar.md', parent: 'work-content', updated: '2026-10-29',
    topics: ['moc-planning'], summary: 'Format and topic for each week of November.',
    body: '# Content publishing calendar · November\n\n| Week | Format | Topic |\n| --- | --- | --- |\n| Week 1 | Newsletter | Nova redesign preview |\n| Week 2 | Blog | What we learned from the accessibility check |\n| Week 3 | Video | Metrics dashboard tour |\n| Week 4 | Newsletter | November wrap-up |\n\nDraft: {{content-newsletter|November newsletter draft}}' },
  { id: 'content-newsletter', kind: 'material', title: 'November newsletter draft', path: 'src-work/content/newsletter-2026-11.md', parent: 'work-content', updated: '2026-11-02',
    topics: ['moc-writing'], summary: 'Subject line options and outline for the November newsletter about the Nova redesign.',
    body: '# November newsletter draft\n\nSubject line options\n- We are building a home page you can read faster\n- The Nova redesign: what we took out\n\nThe body follows the sentence rules in {{content-style|Writing style guide}}.' },
  { id: 'content-style', kind: 'material', title: 'Writing style guide', path: 'src-work/content/style-guide.md', parent: 'work-content', updated: '2026-09-25',
    topics: ['moc-writing'], listedBy: ['personal-journal'], summary: 'Sentence standards such as one idea per sentence, numbers with sources, and fewer embellishments.',
    body: '# Writing style guide\n\n- Put only one idea in each sentence.\n- Give every number a baseline and a source.\n- Cut embellishments like "revolutionary" and "game-changing".\n- Say what the reader should do in the last paragraph.' },
  { id: 'content-ai-images', kind: 'material', title: 'AI image generation notes', path: 'src-work/content/ai-images.md', parent: 'work-content', updated: '2026-10-17',
    topics: ['moc-ai'], summary: 'Standards and attribution for using generated images.',
    body: '# AI image generation notes\n\n- Do not use images that resemble real people or trademarks.\n- Credit the source on generated images.\n- Copy prompts that worked well into {{learn-prompt-patterns|Prompt writing patterns}}.' },
  { id: 'content-interview', kind: 'material', title: 'Customer interview summary', path: 'src-work/content/customer-interviews.md', parent: 'work-content', updated: '2026-10-05',
    topics: ['moc-planning'], summary: 'Common pain points and expectations from 5 fictional interviews.',
    body: '# Customer interview summary (5 fictional interviews)\n\n- Common pain point: not knowing what to click on the first screen\n- Expectation: compare pricing at a glance\n- Next: reflect in {{nova-ia|Nova information architecture draft}}' },

  // ── Materials: directly under the work area ──
  { id: 'work-faq', kind: 'material', title: 'Work FAQ', path: 'src-work/faq.md', parent: 'area-work', updated: '2026-10-11',
    summary: 'Questions and answers about where to put new materials and how to link them.',
    body: '# Work FAQ\n\nQ. Where do new materials go?\nA. Leave the original in its own folder (an external source folder, src-…) and add only a link with a one-line description to the relevant index.\n\nQ. How do I use the same material in several topics?\nA. Do not copy the material; link to it from the topic MOCs.\n\nQ. How do I write links?\nA. Use the `[display name](relative path)` format, relative to the document that contains the link. Examples written inside code, like the one below, are not real links.\n\n```\n- [Example document](src-work/example.md) — one-line description\n```\n\nTo write literal brackets in the body, put a backslash in front, \\[like this](example.md).' },

  // ── Materials: Personal · Learning ──
  { id: 'learn-prompt-patterns', kind: 'material', title: 'Prompt writing patterns', path: 'src-personal/learning/prompt-patterns.md', parent: 'personal-learning', updated: '2026-10-21',
    topics: ['moc-ai'], summary: 'A habit of writing the goal and output format first in prompts.',
    body: '# Prompt writing patterns\n\n1. Write the goal and output format before the role.\n2. One good example and one to avoid.\n3. Let it say when it does not know.\n\nA work example: {{ops-meeting-prompt|Meeting notes summary prompt}}' },
  { id: 'learn-viz-book', kind: 'material', title: 'Reading notes · Introduction to data visualization', path: 'src-personal/learning/reading/data-viz.md', parent: 'personal-learning', updated: '2026-09-27',
    topics: ['moc-dev'], summary: 'Notes on a visualization book (fictional) covering color, axes, and baselines.',
    body: '# Reading notes · Introduction to data visualization (fictional book)\n\n- Use color to separate categories; use lightness to show order.\n- If you truncate an axis, say so.\n- Charts on the same screen share the same baseline.' },
  { id: 'learn-typescript', kind: 'material', title: 'TypeScript study notes', path: 'src-personal/learning/typescript.md', parent: 'personal-learning', updated: '2026-10-13',
    topics: ['moc-dev'], summary: 'Notes on narrowing unknown, discriminated unions, and satisfies.',
    body: '# TypeScript study notes\n\n- Narrow values received as unknown before using them.\n- Splitting state with discriminated unions lets the compiler flag missed branches.\n- satisfies checks the shape without widening the type.' },
  { id: 'learn-english', kind: 'material', title: 'Workplace jargon glossary', path: 'src-personal/learning/jargon.md', parent: 'personal-learning', updated: '2026-10-04',
    summary: 'Jargon often heard in meetings and what it means.',
    body: '# Workplace jargon glossary\n\n- circle back — talk about it again later\n- low-hanging fruit — an easy win\n- take it offline — discuss it separately, outside the meeting' },

  // ── Materials: machine learning study group ──
  { id: 'ml-week1', kind: 'material', title: 'Week 1 · Linear regression notes', path: 'src-personal/learning/ml-study/week-1.md', parent: 'guide-study-ml', updated: '2026-09-20',
    topics: ['moc-ai'], summary: 'Notes on loss functions, gradient descent, and the learning rate.',
    body: '# Week 1 · Linear regression notes\n\n- Loss function: mean squared error\n- Gradient descent diverges if the learning rate is too large\n- Next week: classification → {{ml-week2|Week 2 · Classification and evaluation metrics}}' },
  { id: 'ml-week2', kind: 'material', title: 'Week 2 · Classification and evaluation metrics', path: 'src-personal/learning/ml-study/week-2.md', parent: 'guide-study-ml', updated: '2026-10-04',
    topics: ['moc-ai'], summary: 'Precision, recall, and evaluation on imbalanced data.',
    body: '# Week 2 · Classification and evaluation metrics\n\n- Precision: share of predicted positives that are actually positive\n- Recall: share of actual positives that were found\n- On imbalanced data, do not look at accuracy alone' },
  { id: 'ml-resources', kind: 'material', title: 'Study group reference list', path: 'src-personal/learning/ml-study/resources.md', parent: 'guide-study-ml', updated: '2026-10-18',
    summary: 'Status of lecture notes, practice problems, and the glossary.',
    body: '# Study group reference list\n\n- Lecture notes (the demo has no external links)\n- Practice problem sets\n- Glossary → in progress, starting from {{ml-week1|Week 1 · Linear regression notes}}' },

  // ── Materials: Personal · Journal ──
  { id: 'journal-weekly-review', kind: 'material', title: 'Weekly review', path: 'src-personal/journal/weekly-review.md', parent: 'personal-journal', updated: '2026-11-02',
    summary: 'A personal retrospective template for a one-line mood, a win, and something put off.',
    body: '# Weekly review (personal)\n\n- One line on this week\'s mood\n- One thing that went well, one thing I put off\n- A small promise to keep next week\n\nSame name as the work retrospective, but a different material.' },
  { id: 'journal-october', kind: 'material', title: 'October review', path: 'src-personal/journal/2026-10.md', parent: 'personal-journal', updated: '2026-11-01',
    topics: ['moc-writing'], summary: 'A monthly look back at study, exercise, and the retrospective habit.',
    body: '# October review\n\n- Went to the study group twice without missing → {{ml-week2|Week 2 · Classification and evaluation metrics}}\n- Exercise dropped to twice a week → {{life-workout|Workout routine}}\n- Next month, write the {{journal-weekly-review|Weekly review}} on Sunday evenings' },
  { id: 'journal-ideas', kind: 'material', title: 'Idea notebook', path: 'src-personal/journal/ideas.md', parent: 'personal-journal', updated: '2026-10-23',
    topics: ['moc-planning'], summary: 'A list of small ideas to try someday.',
    body: '# Idea notebook\n\n- Automatically link meeting notes to topic MOCs\n- Turn book notes into one-page cards\n- Add a reader questions section to the newsletter → {{content-calendar|Content publishing calendar}}' },
  { id: 'journal-whiteboard', kind: 'material', title: 'Whiteboard sketch.png', path: 'src-personal/journal/whiteboard.png', parent: 'personal-journal', updated: '2026-10-23',
    format: 'image', summary: 'A whiteboard photo taken while sorting out ideas. The demo has no image file, only this description.' },
  { id: 'personal-goals', kind: 'material', title: 'Goals for this year', path: 'src-personal/goals.md', parent: 'area-personal', updated: '2026-09-01',
    topics: ['moc-planning'], summary: 'Three goals: finish the study group, read, and exercise.',
    body: '# Goals for this year\n\n1. Stay with the machine learning study group to the end → {{guide-study-ml|Machine learning study group guide}}\n2. Read two books a month\n3. Exercise three times a week → {{life-workout|Workout routine}}' },

  // ── Materials: Personal · Life ──
  { id: 'life-workout', kind: 'material', title: 'Workout routine', path: 'src-personal/life/workout.md', parent: 'personal-life', updated: '2026-10-16',
    summary: 'Strength and walking plan by day of the week.',
    body: '# Workout routine\n\n- Mon · Thu: strength training, 40 minutes\n- Tue · Sat: walking, 1 hour\n- If my knee hurts, only walk that week' },
  { id: 'life-budget', kind: 'material', title: 'Living expenses budget', path: 'src-personal/life/budget.md', parent: 'personal-life', updated: '2026-10-01',
    summary: 'Fixed vs. variable costs and an emergency fund rule (example).',
    body: '# Living expenses budget (example)\n\n- Fixed costs: housing · phone · insurance\n- Variable costs: food · transport · leisure\n- Each month, move half of what is left into the emergency fund' },
  { id: 'life-trip', kind: 'material', title: 'Island trip plan', path: 'src-personal/life/island-trip.md', parent: 'personal-life', updated: '2026-10-27',
    topics: ['moc-planning'], summary: 'A 3-day itinerary on the east coast with rainy-day backups.',
    body: '# Island trip plan\n\n- Schedule: 3 days, 2 nights, mostly the east coast\n- Rainy-day backup: two indoor exhibitions\n- Recheck the packing list the day before leaving' },
  { id: 'life-recipes', kind: 'material', title: 'Go-to recipes', path: 'src-personal/life/recipes.md', parent: 'personal-life', updated: '2026-09-14',
    summary: 'Tips for lentil soup, tomato and egg stir-fry, and fried rice.',
    body: '# Go-to recipes\n\n- Lentil soup: onion and garlic → lentils → stock, simmer 25 minutes\n- Tomato and egg stir-fry: half-cook the eggs first and set them aside\n- Fried rice: use day-old rice and fry it well in oil' }
];

// ── Recurring record series (deterministic): meeting notes, daily logs, and reading notes pile up most in a real vault.
// All names and content are fictional; links to the previous entry make the branches long.
const pad = (n: number) => String(n).padStart(2, '0');
function series(): Seed[] {
  const out: Seed[] = [];
  const add = (s: Seed) => out.push(s);
  const chain = (prefix: string, i: number, prevTitle: (i: number) => string) => (i > 0 ? `\n\nPrevious entry: {{${prefix}-${i - 1}|${prevTitle(i - 1)}}}` : '');

  const meeting = (i: number) => `Team weekly meeting W${36 + i}`;
  const agendas = ['schedule check', 'blockers', 'next week\'s priorities', 'pre-release check', 'retro items', 'triaging external requests'];
  for (let i = 0; i < 12; i++) add({ id: `ops-meeting-${i}`, kind: 'material', title: meeting(i), path: `src-work/operations/meetings/2026-W${36 + i}.md`, parent: 'work-ops',
    updated: `2026-${pad(9 + Math.floor(i / 5))}-${pad(1 + ((i * 7) % 27))}`, summary: `Weekly meeting notes focused on ${agendas[i % agendas.length]} (fictional).`,
    body: `# ${meeting(i)}\n\n- Agenda: ${agendas[i % agendas.length]} · ${agendas[(i + 2) % agendas.length]}\n- Decision: set owners and due dates during the meeting\n- Summary: ${i % 4 === 0 ? 'summarized with {{ops-meeting-prompt|Meeting notes summary prompt}}' : 'summarized by hand'}${chain('ops-meeting', i, meeting)}` });

  const review = (i: number) => `Nova design review round ${i + 1}`;
  const reviewTopics = ['home first screen', 'pricing comparison table', 'customer story filter', 'mobile menu', 'accessibility contrast', 'copy polish', 'image tone', 'final check'];
  for (let i = 0; i < 8; i++) add({ id: `nova-review-${i}`, kind: 'material', title: review(i), path: `src-work/projects/nova/reviews/review-${i + 1}.md`, parent: 'guide-nova',
    updated: `2026-10-${pad(14 + i * 2)}`, summary: `Design review notes covering the ${reviewTopics[i]} (fictional).`, topics: i === 4 ? ['moc-dev'] : undefined,
    body: `# ${review(i)}\n\nTopic: ${reviewTopics[i]}\n\n- Keep: the three-item menu structure\n- Change: spacing around the ${reviewTopics[(i + 1) % 8]}\n- Reference: {{nova-ia|Nova information architecture draft}}${chain('nova-review', i, review)}` });

  const check = (i: number) => `Metrics check ${pad(i + 1)}`;
  for (let i = 0; i < 10; i++) add({ id: `lumen-check-${i}`, kind: 'material', title: check(i), path: `src-work/projects/lumen/checks/check-${pad(i + 1)}.md`, parent: 'guide-lumen',
    updated: `2026-10-${pad(1 + i * 3)}`, summary: 'A routine check for collection delays and missing data (no figures included).', topics: i % 5 === 2 ? ['moc-dev'] : undefined,
    body: `# ${check(i)}\n\n- Collection delay: ${i % 3 === 0 ? 'yes → recomputed on the next run' : 'none'}\n- Missing accounts: checked\n${i % 2 === 0 ? '- Definitions: {{lumen-metrics|Lumen core metric definitions}}\n' : ''}${chain('lumen-check', i, check)}` });

  const blogTopics = ['What we learned from the accessibility check', 'How to cut a menu down', 'Naming metrics', 'Writing shorter meeting notes', 'First-screen copy', 'Writing interview questions', 'Reading data tables', 'How our team runs retros', 'Using generated images', 'November wrap-up'];
  blogTopics.forEach((t, i) => add({ id: `content-blog-${i}`, kind: 'material', title: `Blog draft · ${t}`, path: `src-work/content/blog/draft-${pad(i + 1)}.md`, parent: 'work-content',
    updated: `2026-10-${pad(3 + i * 2)}`, summary: `A blog draft on "${t}" (fictional).`, topics: i % 3 === 0 ? ['moc-writing'] : undefined,
    body: `# ${t}\n\nWrite it in three paragraphs: intro · example · wrap-up.\n\nSentence standard: {{content-style|Writing style guide}}${i % 4 === 1 ? '\nSchedule: {{content-calendar|Content publishing calendar}}' : ''}` }));

  const books = ['Learning Slowly', 'Small Habits, Long Days (fictional)', 'The Craft of Questions', 'A Grammar of Design', 'Data and Story', 'Writing That Lasts', 'What Notes Are For', 'Working Side by Side', 'Reading the Numbers', 'Good Calls', 'Make It Plain', 'A Map for Learning'];
  books.forEach((b, i) => add({ id: `learn-book-${i}`, kind: 'material', title: `Reading notes · ${b}`, path: `src-personal/learning/reading/book-${pad(i + 1)}.md`, parent: 'personal-learning',
    updated: `2026-${pad(8 + Math.floor(i / 4))}-${pad(2 + i * 2)}`, summary: `Notes from reading the fictional book "${b}".`, topics: i % 4 === 0 ? ['moc-writing'] : i % 4 === 2 ? ['moc-planning'] : undefined,
    body: `# Reading notes · ${b}\n\n- One sentence to remember\n- One thing to use in my work right away\n- One question to look into${i > 0 ? `\n\nRead with: {{learn-book-${i - 1}|Reading notes · ${books[i - 1]}}}` : ''}` }));

  const weeks = ['Decision trees', 'Ensembles', 'Clustering', 'Dimensionality reduction', 'Neural network basics', 'Evaluation revisited'];
  weeks.forEach((w, i) => add({ id: `ml-week-extra-${i}`, kind: 'material', title: `Week ${i + 3} · ${w}`, path: `src-personal/learning/ml-study/week-${i + 3}.md`, parent: 'guide-study-ml',
    updated: `2026-${pad(10 + Math.floor(i / 3))}-${pad(4 + (i % 3) * 9)}`, summary: `Study group notes: ${w} (fictional).`, topics: ['moc-ai'],
    body: `# Week ${i + 3} · ${w}\n\n- Key concepts\n- Practice problems\n\nLast week: ${i === 0 ? '{{ml-week2|Week 2 · Classification and evaluation metrics}}' : `{{ml-week-extra-${i - 1}|Week ${i + 2} · ${weeks[i - 1]}}}`}` }));

  const day = (i: number) => `Daily log October ${i + 6}`;
  const moods = ['bright', 'a bit tired', 'focused', 'busy', 'calm', 'scattered'];
  for (let i = 0; i < 24; i++) add({ id: `journal-day-${i}`, kind: 'material', title: day(i), path: `src-personal/journal/daily/2026-10-${pad(i + 6)}.md`, parent: 'personal-journal',
    updated: `2026-10-${pad(i + 6)}`, summary: `A short log of mood, what I did, and what to do tomorrow (fictional).`, topics: i % 8 === 3 ? ['moc-writing'] : undefined,
    body: `# ${day(i)}\n\nMood: ${moods[i % moods.length]}\nDid: ${i % 3 === 0 ? 'study notes' : i % 3 === 1 ? 'exercise' : 'reading'}${i % 7 === 0 ? '\nWeekly summary: {{journal-weekly-review|Weekly review}}' : ''}${chain('journal-day', i, day)}` });

  const workout = (i: number) => `Workout log ${pad(i + 1)}`;
  for (let i = 0; i < 10; i++) add({ id: `life-workout-log-${i}`, kind: 'material', title: workout(i), path: `src-personal/life/workout/log-${pad(i + 1)}.md`, parent: 'personal-life',
    updated: `2026-10-${pad(2 + i * 3)}`, summary: 'That day\'s workout and how I felt (fictional).',
    body: `# ${workout(i)}\n\n- ${i % 2 === 0 ? 'strength training, 40 minutes' : 'walking, 1 hour'}\n- Condition: ${moods[(i + 2) % moods.length]}\n\nPlan: {{life-workout|Workout routine}}` });

  const ideas = ['Search result previews', 'Automated weekly summary', 'Meeting agenda template', 'Materials cleanup week', 'Team glossary', 'Reading bundles'];
  ideas.forEach((t, i) => add({ id: `projects-idea-${i}`, kind: 'material', title: `Idea backlog · ${t}`, path: `src-work/projects/backlog/idea-${pad(i + 1)}.md`, parent: 'work-projects',
    updated: `2026-10-${pad(5 + i * 4)}`, summary: `Background and first step for the "${t}" idea (fictional).`, topics: i % 2 === 0 ? ['moc-planning'] : undefined,
    body: `# Idea · ${t}\n\n- Background: cut down repetitive work\n- First step: try it small\n\nBefore starting: {{projects-checklist|Project kickoff checklist}}` }));
  return out;
}

const KIND_HEADING: Record<NodeKind, string> = { router: '', area: 'Sub-indexes · frequently used documents', subindex: 'Items', guide: 'Materials', moc: 'Related materials', material: '' };
const REF = /\{\{([^|}]+)\|([^}]+)\}\}/g;
// Source folders (fictional): registered in the router's 'External source folders' table. Unrelated to real paths or accounts
const SOURCE_ROOTS = [
  { root: 'src-work', origin: 'Fictional work drive', area: 'Work' },
  { root: 'src-personal', origin: 'Fictional personal drive', area: 'Personal' },
  { root: 'src-research', origin: 'Fictional research drive', area: 'Research' }
];

/** Builds guide document bodies from the definitions: preamble + (primary children | MOC related materials) + materials also linked from elsewhere. All links are relative */
function compose(list: Seed[]): VaultFile[] {
  const byId = new Map(list.map(s => [s.id, s]));
  const byParent = new Map<string, Seed[]>();
  for (const s of list) if (s.parent) byParent.set(s.parent, [...(byParent.get(s.parent) ?? []), s]);
  return list.map(s => {
    const item = (t: Seed) => `- [${t.title}](${relativeHref(s.path, t.path)}) — ${t.summary}`;
    let body = (s.body ?? '').replace(REF, (_, id: string, label: string) => {
      const t = byId.get(id);
      if (!t) throw new Error(`Demo reference error: ${s.id} → ${id}`);
      return `[${label}](${relativeHref(s.path, t.path)})`;
    });
    if (s.kind !== 'material') {
      const sections: string[] = [`# ${s.title}`, body];
      if (s.kind === 'router') {
        const kids = byParent.get(s.id) ?? [];
        sections.push('## Area indexes', kids.filter(k => k.kind === 'area').map(item).join('\n'));
        sections.push('## Topic MOCs', kids.filter(k => k.kind === 'moc').map(item).join('\n'));
        sections.push('## Project guides', list.filter(k => k.kind === 'guide').map(item).join('\n'));
        sections.push('## External source folders (fictional)', ['| Link | Original location | Area |', '| --- | --- | --- |',
          ...SOURCE_ROOTS.map(r => `| [${r.root}](${r.root}) | ${r.origin} | ${r.area} |`)].join('\n'));
      } else if (s.kind === 'moc') {
        sections.push(`## ${KIND_HEADING.moc}`, list.filter(m => m.topics?.includes(s.id)).map(item).join('\n'));
      } else {
        const kids = byParent.get(s.id) ?? [];
        if (kids.length) sections.push(`## ${KIND_HEADING[s.kind]}`, kids.map(item).join('\n'));
        const listed = list.filter(m => m.listedBy?.includes(s.id));
        if (listed.length) sections.push('## Also linked from elsewhere', listed.map(item).join('\n'));
      }
      body = sections.filter(Boolean).join('\n\n');
    }
    if ((s.format ?? 'md') !== 'md') body = '';
    return { path: s.path, title: s.title, summary: s.summary, body, updated: s.updated };
  });
}

/** Size through the first expansion. These 1,000 (hand-written representative documents + recurring records + demo-expand.ts) keep their paths, titles, and material bodies unchanged */
export const DEMO_CORE_COUNT = 1000;
/** Showcase demo size (document count). The second expansion (demo-scale.ts) adds areas, indexes, and series around the 1,000 to hit this exactly */
export const DEMO_DOC_COUNT = 5000;
const baseSeeds = [...seeds, ...series()];
const coreSeeds = [...baseSeeds, ...expandHubs, ...expandMaterials(DEMO_CORE_COUNT - baseSeeds.length - expandHubs.length)];
const mocUsed = new Map<string, number>();
for (const s of coreSeeds) for (const t of s.topics ?? []) mocUsed.set(t, (mocUsed.get(t) ?? 0) + 1);
const allSeeds = [...coreSeeds, ...scaleHubs, ...scaleMaterials(DEMO_DOC_COUNT - coreSeeds.length - scaleHubs.length, mocUsed)];
{
  const ids = new Set<string>();
  for (const s of allSeeds) { if (ids.has(s.id)) throw new Error(`Duplicate demo id: ${s.id}`); ids.add(s.id); }
}
/** For tests: a demo built from only the 1,000 through the first expansion (checks that the second expansion did not change existing materials or index lines) */
export const demoCoreFiles = () => compose(coreSeeds);

export const demoDataset: Dataset = {
  label: 'Demo vault (synthetic data)',
  synthetic: true,
  files: compose(allSeeds)
};

/** For tests: primary classification from the authoring definitions (path → parent path). Checks that the adapter finds the same classification from links alone */
export const DEMO_PRIMARY: ReadonlyMap<string, string | null> = new Map(allSeeds.map(s => [s.path, s.parent ? allSeeds.find(p => p.id === s.parent)!.path : null]));
