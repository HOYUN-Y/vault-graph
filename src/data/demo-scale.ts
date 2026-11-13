// Synthetic demo data, second expansion: keeps the 1,000-document demo (demo.ts + demo-expand.ts) as is and adds 4,000 around it for 5,000 total.
// Unrelated to real materials, people, companies, or books/papers. Built deterministically, with no randomness.
//   - Grows by structure: one new area (Community), 6 topic MOCs, plus sub-indexes, nested sub-indexes, and project guides, with materials as series under them.
//     No index lists more than 90 materials (guide documents stay at 100 lines or fewer). MOCs only pick materials that cross areas.
//   - Each material sits under one primary index (parent) and links in its body to the previous entry in its series, a reference document, and related materials in other areas.
//   - Shared source files (listedBy) are only linked from indexes deeper than the primary one (so breadth-first link classification finds the same primary index).
import type { DocFormat } from '../core/types';
import type { Seed } from './demo-expand';

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
/** Date `back` days before 2026-11-05 */
const ago = (back: number) => iso(Date.UTC(2026, 10, 5) - back * DAY);
const at = <T,>(list: readonly T[], i: number) => list[((i % list.length) + list.length) % list.length];
const ref = (id: string, title: string) => `{{${id}|${title}}}`;
/** The i-th name from combining lists A and B without overlap (cycles through A first, then advances B) */
const combo = (a: readonly string[], b: readonly string[], i: number) => `${a[i % a.length]}${b[Math.floor(i / a.length) % b.length]}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** One series: materials of the same shape under one index */
interface Series {
  /** Primary index id */
  hub: string;
  /** Material id prefix */
  key: string;
  /** Source folder (starts with src-*) */
  dir: string;
  n: number;
  title: (i: number) => string;
  summary: (i: number) => string;
  /** Body lines (a list under the heading) */
  lines: (i: number) => string[];
  /** File name (with extension). Defaults to key-001.md */
  file?: (i: number) => string;
  format?: (i: number) => DocFormat;
  updated: (i: number) => string;
  topics?: (i: number) => (string | false)[];
  listedBy?: (i: number) => (string | false)[];
  /** Label for the previous-entry link (null means no chain) */
  chain?: string | null;
  /** Document every material links to as its reference [id, title] */
  base?: [string, string];
  /** Link to another series or an existing document [label, id, title] */
  cross?: (i: number) => [string, string, string] | null;
}

const hub = (id: string, kind: Seed['kind'], title: string, path: string, parent: string, updated: string, summary: string, body: string): Seed =>
  ({ id, kind, title, path, parent, updated, summary, body });

/** New guide documents: 1 area · 6 MOCs · sub-indexes · project guides */
export const scaleHubs: Seed[] = [
  hub('area-community', 'area', 'Community', 'community.md', 'router', '2026-11-04',
    'An area index for things done with others outside the company, such as open source, meetups, talks, and mentoring.',
    'This is the index for the community area. Meetups and contributions go in sub-indexes by activity; recurring activities get project guides. (All meetups, repositories, and people are fictional)'),

  hub('moc-data', 'moc', 'Data', 'moc-data.md', 'router', '2026-11-03', 'A topic map gathering metric definitions, datasets, and pipeline logs regardless of area.', 'Materials for producing numbers, moving them, and making them trustworthy.'),
  hub('moc-decision', 'moc', 'Decisions', 'moc-decisions.md', 'router', '2026-11-02', 'A topic map gathering the reasoning behind design decisions, experiment conclusions, and personal choices.', 'What was chosen and why, plus the evidence needed when revisiting it.'),
  hub('moc-a11y', 'moc', 'Accessibility', 'moc-accessibility.md', 'router', '2026-11-01', 'A topic map gathering screen accessibility checks, usability experiments, and plain-language materials.', 'Decisions and checks made so anyone can read and write.'),
  hub('moc-habit', 'moc', 'Habits', 'moc-habits.md', 'router', '2026-10-31', 'A topic map gathering habit logs kept up steadily at work and in life.', 'Records of starting small and keeping it going.'),
  hub('moc-oss', 'moc', 'Open source', 'moc-open-source.md', 'router', '2026-11-04', 'A topic map gathering open source contributions, public talks, and open data materials.', 'Records of contributing to shared code and materials. (All repositories are fictional)'),
  hub('moc-travel', 'moc', 'Travel', 'moc-travel.md', 'router', '2026-10-28', 'A topic map gathering trip plans, business travel, and meetups abroad.', 'Prep before leaving and look-backs after returning, side by side.'),

  // ── Work ──
  hub('work-archive', 'subindex', 'Work · Past projects archive', 'work--archive.md', 'area-work', '2026-10-30', 'An archive index of finished projects (all fictional), split by project.', 'Active projects live in the projects index; finished ones go here. When reopening one, read the retrospective first.'),
  hub('arc-wave', 'subindex', 'Work · Archive · Wave checkout redesign', 'work--archive--wave.md', 'work-archive', '2026-06-28', 'Meetings, decisions, and tests for Wave (fictional), a checkout screen redesign.', 'A project that cut checkout from five steps to three.'),
  hub('arc-lighthouse', 'subindex', 'Work · Archive · Lighthouse wiki migration', 'work--archive--lighthouse.md', 'work-archive', '2026-05-30', 'Records of Lighthouse (fictional), a project that moved the internal wiki to a new tool.', 'Records of the migration order and cleaning up broken links.'),
  hub('arc-hourglass', 'subindex', 'Work · Archive · Hourglass time-tracking app', 'work--archive--hourglass.md', 'work-archive', '2026-04-25', 'Screens, policies, and tests for Hourglass (fictional), a time-tracking app.', 'A project that stopped people from having to clock in twice.'),
  hub('arc-galaxy', 'subindex', 'Work · Archive · Galaxy recommendation experiments', 'work--archive--galaxy.md', 'work-archive', '2026-07-20', 'Experiment and analysis logs for Galaxy (fictional), a project experimenting with the recommendations section.', 'A set of experiments that tried different recommendation rows and watched the response.'),
  hub('arc-compass', 'subindex', 'Work · Archive · Compass onboarding improvements', 'work--archive--compass.md', 'work-archive', '2026-08-29', 'Records of Compass (fictional), a project improving first-run guidance.', 'Records of changing the first screen to show just one task.'),
  hub('arc-pinwheel', 'subindex', 'Work · Archive · Pinwheel notification cleanup', 'work--archive--pinwheel.md', 'work-archive', '2026-09-26', 'Records of Pinwheel (fictional), a project that consolidated notification types.', 'How thirty notification types were grouped into nine.'),
  hub('client-hanbit', 'subindex', 'Work · Clients · Kestrel Freight', 'work--clients--kestrel.md', 'work-clients', '2026-11-02', 'Meetings, requirements, and weekly reports for the fictional client Kestrel Freight.', 'A client we are building a delivery status screen with (fictional company).'),
  hub('client-sodam', 'subindex', 'Work · Clients · Willowbank Press', 'work--clients--willowbank.md', 'work-clients', '2026-10-29', 'Meetings, requirements, and weekly reports for the fictional client Willowbank Press.', 'A client we are building ebook previews with (fictional company).'),
  hub('client-pureun', 'subindex', 'Work · Clients · Clearbrook Clinic', 'work--clients--clearbrook.md', 'work-clients', '2026-10-27', 'Meetings, requirements, and weekly reports for the fictional client Clearbrook Clinic.', 'A client we are revising appointment reminder copy with (fictional company, no medical information).'),
  hub('client-daon', 'subindex', 'Work · Clients · Maplestone Academy', 'work--clients--maplestone.md', 'work-clients', '2026-10-31', 'Meetings, requirements, and weekly reports for the fictional client Maplestone Academy.', 'A client we are building class material search with (fictional company).'),
  hub('client-mir', 'subindex', 'Work · Clients · Driftwood Travel', 'work--clients--driftwood.md', 'work-clients', '2026-10-24', 'Meetings, requirements, and weekly reports for the fictional client Driftwood Travel.', 'A client we are building itinerary sharing with (fictional company).'),
  hub('ops-runbooks', 'subindex', 'Work · Operations · Runbooks', 'work--operations--runbooks.md', 'work-ops', '2026-11-01', 'Runbooks covering the steps for recurring operations tasks and how to roll them back.', 'One runbook per task, with the rollback steps at the bottom.'),
  hub('ops-oncall', 'subindex', 'Work · Operations · On-call log', 'work--operations--oncall.md', 'work-ops', '2026-11-03', 'Daily logs left by the person on call that week.', 'On-call logs briefly note only the alerts received and the work handled that day.'),
  hub('ops-incidents-old', 'subindex', 'Work · Operations · Incident reports · Last year', 'work--operations--incidents--2025.md', 'work-ops-incidents', '2026-01-10', 'An archive index of last year\'s incident reports in month order.', 'This year\'s reports live in the incident reports index; last year\'s go here.'),
  hub('content-blog', 'subindex', 'Work · Content · Blog', 'work--content--blog.md', 'work-content', '2026-11-02', 'Company blog drafts and revision history (fictional).', 'Drafts are revised twice against the style guide.'),
  hub('content-talks', 'subindex', 'Work · Content · Talk materials', 'work--content--talks.md', 'work-content', '2026-10-30', 'Outlines and speaker notes for internal and external talks.', 'Each talk gets a one-line summary, an outline, and the questions received.'),
  hub('newsletter-old', 'subindex', 'Work · Content · Newsletter · Last year', 'work--content--newsletter--2025.md', 'work-newsletter', '2026-01-05', 'Newsletter issues published last year.', 'Last year\'s issues go here; this year\'s go in the newsletter index.'),
  hub('work-eng', 'subindex', 'Work · Engineering log', 'work--engineering.md', 'area-work', '2026-11-04', 'An index of records kept during development, such as design decisions, code reviews, and API specs.', 'Engineering records not tied to one project, split by type.'),
  hub('eng-adr', 'subindex', 'Work · Engineering · Architecture decision records', 'work--engineering--adr.md', 'work-eng', '2026-11-04', 'An index of architecture decision records (ADRs) in number order.', 'One document per decision. Changed decisions are not deleted; they get the next number.'),
  hub('eng-review', 'subindex', 'Work · Engineering · Code review notes', 'work--engineering--review.md', 'work-eng', '2026-11-03', 'Notes by topic on lessons from code reviews.', 'One lesson per review.'),
  hub('eng-api', 'subindex', 'Work · Engineering · API specs', 'work--engineering--api.md', 'work-eng', '2026-10-31', 'Request, response, and error specs for internal service APIs (fictional).', 'Each spec has one example request and an error table.'),
  hub('eng-perf', 'subindex', 'Work · Engineering · Performance measurements', 'work--engineering--performance.md', 'work-eng', '2026-11-02', 'Before-and-after measurements of screen and API performance (no figures included).', 'Write down what to measure before measuring. Use the same device and the same data.'),
  hub('guide-beacon', 'guide', 'Beacon data pipeline guide', 'project-beacon.md', 'work-projects', '2026-11-04', 'Reading order for the design, work, and check documents of Beacon (fictional), an event collection pipeline.', 'Read in this order: collection definitions → step-by-step work logs → quality checks.'),
  hub('guide-mosaic', 'guide', 'Mosaic design system guide', 'project-mosaic.md', 'work-projects', '2026-11-03', 'Reading order for the component documents of Mosaic (fictional), the internal design system.', 'Read in this order: foundations (color · type · spacing) → components → changelog.'),
  hub('guide-relay', 'guide', 'Relay team notification bot guide', 'project-relay.md', 'work-projects', '2026-10-30', 'Guide to the command, test, and operations documents of Relay (fictional), a team chat notification bot.', 'Read in this order: command list → conversation tests → operations log.'),

  // ── Personal ──
  hub('daily-spring', 'subindex', 'Personal · Journal · April–June daily logs', 'personal--journal--daily--spring.md', 'personal-daily', '2026-06-30', 'An archive index of daily logs from April to June, in date order.', 'Three months of daily logs. Weekly summaries are in the retrospectives index.'),
  hub('read-essays', 'subindex', 'Personal · Reading · Essays and humanities', 'personal--learning--reading--essays.md', 'personal-reading', '2026-10-30', 'Reading notes on fictional essay and humanities books.', 'Recorded as one sentence, one thought, one question.'),
  hub('read-science', 'subindex', 'Personal · Reading · Popular science', 'personal--learning--reading--science.md', 'personal-reading', '2026-10-26', 'Reading notes on fictional popular science books.', 'Keeps what I learned for the first time apart from what to look up.'),
  hub('read-work', 'subindex', 'Personal · Reading · Ways of working', 'personal--learning--reading--work.md', 'personal-reading', '2026-10-22', 'Reading notes on fictional books about ways of working and collaboration.', 'Always write down one thing to try right away.'),
  hub('course-design', 'subindex', 'Personal · Courses · Design', 'personal--learning--courses--design.md', 'personal-courses', '2026-10-20', 'Lecture notes for a design online course (fictional).', 'Each lecture records what I drew along with and scenes to revisit.'),
  hub('course-data', 'subindex', 'Personal · Courses · Data analysis', 'personal--learning--courses--data.md', 'personal-courses', '2026-10-25', 'Lecture notes for a data analysis online course (fictional).', 'Each lecture records practice problems and where I got stuck.'),
  hub('jp-words', 'subindex', 'Personal · Japanese · Vocabulary lists', 'personal--learning--japanese--words.md', 'guide-japanese', '2026-10-29', 'Topic-based vocabulary lists for Japanese study (based on a fictional textbook).', 'Each topic has twenty words and three example sentences.'),
  hub('kitchen-recipes', 'subindex', 'Personal · Cooking · Recipe cards', 'personal--life--kitchen--recipes.md', 'personal-kitchen', '2026-10-28', 'Recipe cards for dishes made at home.', 'Written in three boxes: ingredients · steps · what to change next time.'),
  hub('life-home', 'subindex', 'Personal · Life · Home organizing and repairs', 'personal--life--home.md', 'personal-life', '2026-10-27', 'Logs of home organizing, small repairs, and household tools.', 'Note the repair date and tools used so they are easy to find next time.'),
  hub('travel-trips', 'subindex', 'Personal · Travel · Itinerary logs', 'personal--life--travel--trips.md', 'personal-travel', '2026-10-18', 'Day-by-day logs of fictional trips.', 'One document per day for each trip.'),
  hub('health-sleep', 'subindex', 'Personal · Health · Sleep logs', 'personal--life--health--sleep.md', 'personal-health', '2026-11-02', 'Weekly sleep logs of bedtime, wake-ups, and condition.', 'One document per week. Write down the habit changed rather than numbers.'),
  hub('health-meals', 'subindex', 'Personal · Health · Meal logs', 'personal--life--health--meals.md', 'personal-health', '2026-11-01', 'Weekly meal and grocery plans.', 'Linked to recipe cards to build the grocery list.'),
  hub('garden-log', 'subindex', 'Personal · Garden · Observation logs', 'personal--life--garden--log.md', 'guide-garden', '2026-10-30', 'Weekly observation logs for the balcony pots.', 'Once a week, note leaves, soil, and how often I watered.'),
  hub('guide-swim', 'guide', 'Learning to swim guide', 'project-swim.md', 'personal-health', '2026-10-30', 'Guide to the session logs for learning to swim (fictional lessons).', 'Read the session logs in order. Breathing comes first.'),
  hub('personal-hobby', 'subindex', 'Personal · Hobbies', 'personal--hobby.md', 'area-personal', '2026-11-03', 'An index of hobby logs such as photography, music, film, and board games.', 'Each hobby has a sub-index; logs that overlap with meetups link to the community area.'),
  hub('hobby-photo', 'subindex', 'Personal · Hobbies · Photo walks', 'personal--hobby--photo.md', 'personal-hobby', '2026-11-02', 'Neighborhood photo walk logs and picked photos (descriptions only).', 'Each walk gets one picked photo and a note. Photo files have descriptions only.'),
  hub('hobby-music', 'subindex', 'Personal · Hobbies · Guitar practice', 'personal--hobby--music.md', 'personal-hobby', '2026-10-31', 'Guitar practice songs (fictional) and practice logs.', '15 minutes a day, noting the bars I got stuck on in each song.'),
  hub('hobby-film', 'subindex', 'Personal · Hobbies · Film notes', 'personal--hobby--film.md', 'personal-hobby', '2026-10-29', 'Notes on fictional films.', 'One scene and one question it left me with.'),
  hub('hobby-board', 'subindex', 'Personal · Hobbies · Board games', 'personal--hobby--boardgame.md', 'personal-hobby', '2026-10-26', 'Rule notes for board games (fictional) and game night logs.', 'Record the order I explained things to first-time players.'),

  // ── Research ──
  hub('papers-nlp', 'subindex', 'Research · Papers · Natural language processing', 'research--papers--nlp.md', 'research-papers', '2026-11-04', 'Notes on fictional papers in natural language processing.', 'Organized in four boxes: question · method · results · doubts.'),
  hub('papers-vision', 'subindex', 'Research · Papers · Computer vision', 'research--papers--vision.md', 'research-papers', '2026-10-30', 'Notes on fictional papers in computer vision.', 'Uses the same four-box frame.'),
  hub('papers-hci', 'subindex', 'Research · Papers · Human-computer interaction', 'research--papers--hci.md', 'research-papers', '2026-11-02', 'Notes on fictional papers in human-computer interaction.', 'Always note the experiment design and the number of participants.'),
  hub('papers-recsys', 'subindex', 'Research · Papers · Recommender systems', 'research--papers--recsys.md', 'research-papers', '2026-10-27', 'Notes on fictional papers in recommender systems.', 'Note evaluation metrics and data scale together.'),
  hub('papers-stats', 'subindex', 'Research · Papers · Statistical methods', 'research--papers--stats.md', 'research-papers', '2026-10-24', 'Notes on fictional papers in statistical methods.', 'Note the assumptions and when they break.'),
  hub('exp-ab', 'subindex', 'Research · Experiments · A/B tests', 'research--experiments--ab.md', 'research-experiments', '2026-11-03', 'Logs of A/B tests that split two versions (fictional participants).', 'Each test records hypothesis, duration, and conclusion.'),
  hub('exp-usability', 'subindex', 'Research · Experiments · Usability studies', 'research--experiments--usability.md', 'research-experiments', '2026-10-29', 'Logs of usability studies observing task performance (fictional participants).', 'For each task, write where people got stuck before the success rate.'),
  hub('exp-pilot', 'subindex', 'Research · Experiments · Pilot studies', 'research--experiments--pilot.md', 'research-experiments', '2026-10-21', 'Logs of small pilot runs before the main study.', 'Always record procedures changed during the pilot.'),
  hub('datasets-more', 'subindex', 'Research · Dataset cards · Additional collections', 'research--datasets--more.md', 'research-datasets', '2026-10-26', 'Cards for additional fictional datasets.', 'Write the three boxes in the same order: source · scope · caveats.'),
  hub('research-notes', 'subindex', 'Research · Idea notes', 'research--notes.md', 'area-research', '2026-11-04', 'Notes on candidate research questions and passing thoughts.', 'One note per question. If it leads to an experiment, link it to the experiment log.'),
  hub('research-seminars', 'subindex', 'Research · Seminar notes', 'research--seminars.md', 'area-research', '2026-11-01', 'Session notes from lab seminars (fictional).', 'Each session records the talk summary and questions.'),
  hub('research-reviews', 'subindex', 'Research · Proposal review comments', 'research--reviews.md', 'area-research', '2026-10-28', 'Review comments received on a research proposal, with responses (fictional).', 'For each comment, note the response and what was changed.'),
  hub('guide-thesis', 'guide', 'Thesis prep guide', 'project-thesis.md', 'area-research', '2026-11-04', 'Reading order for thesis (fictional topic) prep notes by chapter and week.', 'Read in this order: weekly logs → chapter drafts → advisor feedback.'),
  hub('guide-benchmark', 'guide', 'Document search benchmark guide', 'project-benchmark.md', 'area-research', '2026-11-02', 'Guide to the query, judgment, and evaluation logs for building a document search benchmark (fictional).', 'Read in this order: query sets → judgment criteria → evaluation runs.'),
  hub('guide-replication', 'guide', 'Replication study guide', 'project-replication.md', 'area-research', '2026-10-29', 'Guide to the logs of a replication study that reproduced a fictional paper\'s results.', 'Read in this order: original paper notes → replication steps → difference analysis.'),

  // ── Community ──
  hub('com-oss', 'subindex', 'Community · Open source contributions', 'community--opensource.md', 'area-community', '2026-11-04', 'Issues and pull requests filed on fictional open source repositories.', 'One document per contribution. Reviews received are recorded as is.'),
  hub('com-meetups', 'subindex', 'Community · Meetup notes', 'community--meetups.md', 'area-community', '2026-11-01', 'Notes on talks heard at fictional tech meetups.', 'Each talk gets a one-line summary and something to try.'),
  hub('com-talks', 'subindex', 'Community · External talk prep', 'community--talks.md', 'area-community', '2026-10-30', 'Prep logs for talks at external events (fictional).', 'Recorded in order: outline · rehearsal · questions received.'),
  hub('com-mentoring', 'subindex', 'Community · Mentoring log', 'community--mentoring.md', 'area-community', '2026-11-02', 'Conversation topics and next commitments with fictional mentees.', 'Only topics and commitments, no names.'),
  hub('com-study', 'subindex', 'Community · Study group organizing', 'community--study-group.md', 'area-community', '2026-10-27', 'Organizing notes and session notes for a study group (fictional).', 'Each session notes materials, how it ran, and the next range.'),
  hub('com-volunteer', 'subindex', 'Community · Volunteering log', 'community--volunteer.md', 'area-community', '2026-10-25', 'Volunteering logs at the neighborhood library and a coding class (fictional).', 'What I did and what to prepare next time.'),
  hub('com-translate', 'subindex', 'Community · Documentation translation', 'community--translation.md', 'area-community', '2026-10-29', 'Contributions translating fictional open source docs into Spanish.', 'One record per document. Terms follow the glossary.'),
  hub('guide-hackathon', 'guide', 'Hackathon guide', 'project-hackathon.md', 'area-community', '2026-10-31', 'Guide to the prep, progress, and retrospective documents for a weekend hackathon (fictional).', 'Read in this order: prep list → hourly log → retrospective.'),
  hub('guide-podcast', 'guide', 'Podcast production guide', 'project-podcast.md', 'area-community', '2026-11-03', 'Guide to the episode scripts and editing notes for a podcast (fictional) made with a colleague.', 'Read in this order: episode plan → script → editing notes.'),
  hub('guide-bookclub', 'guide', 'Neighborhood book club guide', 'project-bookclub.md', 'area-community', '2026-10-26', 'Guide to the session notes of a monthly neighborhood book club (fictional).', 'Session notes link to the reading notes for the book discussed.')
];

// ── Name lists (all fictional) ──
const MEET = ['kickoff', 'scope review', 'screen review', 'schedule adjustment', 'risk check', 'test plan', 'midpoint check', 'launch prep', 'right after launch', 'retrospective'];
const DECIDE = ['storage approach', 'number of steps', 'error copy', 'permission scope', 'cache duration', 'notification grouping', 'defaults', 'success metric', 'rollback method', 'visibility scope'];

const archive = (key: string, hubId: string, name: string, n: number, start: number, folder: string): Series => ({
  hub: hubId, key, dir: `src-work/archive/${folder}`, n,
  title: i => (i % 3 === 0 ? `${name} meeting notes · ${at(MEET, i / 3 | 0)}${i >= 30 ? ' (round 2)' : ''}` : i % 3 === 1 ? `${name} decision record · ${combo(DECIDE, ['', ' (revisited)'], (i / 3) | 0)}` : `${name} test log ${pad(((i / 3) | 0) + 1)}`),
  summary: i => (i % 3 === 0 ? `Meeting summary and action items for the ${name} project (fictional).` : i % 3 === 1 ? `Options chosen and not chosen in ${name}, and why.` : `Log of testing ${name} screens on fictional devices.`),
  lines: i => (i % 3 === 0 ? ['Attendees: planning · design · engineering', `Agenda: ${at(MEET, i / 3 | 0)}`, 'Action items: owners and due dates set'] : i % 3 === 1 ? ['Chosen: the simpler option', 'Not chosen: the option with more settings', 'Revisit when: the user base grows'] : ['Devices: two fictional phones', `Result: ${i % 4 === 0 ? 'passed' : 'two minor issues'}`, 'Next: retest after the fixes']),
  updated: i => iso(start + i * 2 * DAY), chain: 'Previous entry',
  topics: i => [i % 9 === 4 && 'moc-decision', i % 21 === 8 && 'moc-retro', i % 27 === 2 && 'moc-a11y'],
  base: ['projects-checklist', 'Project kickoff checklist']
});

const CLIENT_TOPICS = ['delivery status', 'permission settings', 'notification copy', 'search', 'export', 'home screen', 'error messages', 'reports', 'mobile screens', 'scheduling'];
const client = (key: string, hubId: string, name: string, n: number, start: number, folder: string, extra: string): Series => ({
  hub: hubId, key, dir: `src-work/clients/${folder}`, n,
  title: i => (i % 4 === 3 ? `${name} weekly report ${iso(start + i * 3 * DAY)}` : i % 4 === 0 ? `${name} meeting · ${combo(CLIENT_TOPICS, ['', ' follow-up'], (i / 4) | 0)}` : i % 4 === 1 ? `${name} requirements · ${combo(CLIENT_TOPICS, ['', ' change'], (i / 4) | 0)}` : `${name} proposal memo · ${combo([extra, ...CLIENT_TOPICS], ['', ' option 2'], (i / 4) | 0)}`),
  summary: i => `${['Meeting', 'Requirements', 'Proposal', 'Weekly progress'][i % 4]} notes with ${name} (fictional company).`,
  lines: i => [`Topic: ${at(CLIENT_TOPICS, i)}`, `Agreed: ${i % 2 ? 'mockups by next week' : 'scope unchanged'}`, 'No client names or contact details recorded'],
  updated: i => iso(start + i * 3 * DAY), chain: 'Last entry',
  topics: i => [i % 17 === 5 && 'moc-planning', i % 23 === 11 && 'moc-decision', i % 29 === 7 && 'moc-travel'],
  base: ['projects-checklist', 'Project kickoff checklist']
});

const RUNBOOK = ['Roll back a deploy', 'Clear the cache', 'Renew certificates', 'Verify backups', 'Change log retention', 'Revoke access', 'Set up a new team member account', 'Announce overnight work', 'Restart metrics collection', 'Clean up disk space', 'Change alert rules', 'Turn on the maintenance page', 'Drain the queue', 'Rebuild the search index', 'Compare configs', 'Switch to read-only', 'Recovery drill', 'Add capacity', 'Prune old branches', 'Rotate secrets (values not recorded)'];
const PAPER_Q = ['Short text classification', 'Long document summarization', 'Query expansion', 'Dialogue intent detection', 'Typo correction', 'Document clustering', 'Translation quality evaluation', 'Keyword extraction', 'Sentence similarity', 'Table reading', 'Question generation', 'Evidence retrieval', 'Sentiment classification', 'Terminology cleanup'];
const VISION_Q = ['Handwriting recognition', 'Finding receipt fields', 'Finding symbols in drawings', 'Blur detection', 'Finding UI elements in screenshots', 'Table region detection', 'Icon classification', 'Image captioning', 'Color contrast judgment', 'Document deskewing', 'Counting people without faces', 'Reading storefront signs'];
const HCI_Q = ['Notification frequency and fatigue', 'Empty-state copy', 'Keyboard navigation', 'Reading on zoomed screens', 'Search result previews', 'Undo buttons', 'Tone of error messages', 'First-run guidance', 'Progress indicators', 'Color-only distinctions', 'Discovering shortcuts', 'Scanning long lists', 'One-handed mobile use'];
const REC_Q = ['Recommendations for first-time visitors', 'Diversity vs. accuracy', 'Resurfacing old items', 'Explaining recommendations', 'Popularity bias', 'Seasonal shifts', 'Recommending short entries', 'Team-level recommendations', 'Turning recommendations off', 'Choosing evaluation metrics', 'Data sparsity'];
const STAT_Q = ['Comparing small samples', 'Multiple comparison correction', 'Reading effect sizes', 'Handling missing values', 'Ordinal responses', 'Repeated measures', 'Preregistration', 'Bootstrap intervals', 'Baseline differences', 'Stopping at interim analysis', 'Outlier detection'];
const VENUES = ['Fictional Conference A', 'Fictional Conference B', 'Fictional Journal C', 'Fictional Workshop D'];
const paper = (key: string, hubId: string, field: string, qs: readonly string[], n: number, start: number, folder: string, topic: string): Series => ({
  hub: hubId, key, dir: `src-research/papers/${folder}`, n,
  title: i => `Paper notes · ${combo(qs, ['', ' (follow-up)', ' (comparison)', ' (revisited)', ' (at scale)', ' (survey)'], i)}`,
  summary: i => `Four-box notes on a fictional ${field} paper (${at(VENUES, i)}).`,
  lines: i => [`Question: ${at(qs, i)} — can it be done better?`, `Method: ${i % 3 === 0 ? 'small model comparison' : i % 3 === 1 ? 'human evaluation' : 'reanalysis of public data'}`, `Results: ${i % 4 === 1 ? 'better under some conditions' : 'similar to baseline'}`, 'Doubts: sample size · evaluation criteria'],
  updated: i => iso(start + i * 4 * DAY), chain: 'Read with',
  topics: i => [i % 6 === 1 && topic, i % 25 === 9 && 'moc-data', i % 31 === 4 && 'moc-ai'],
  cross: i => (i % 5 === 2 ? ['Discussed at', `rg-session-${i % 16}`, `Paper reading group session ${(i % 16) + 1}`] : null)
});

/** Series definitions (the last series of the 4,000 materials takes the remainder) */
function plan(): Series[] {
  const S: Series[] = [];
  // ── Work · archive ──
  S.push(archive('wave', 'arc-wave', 'Wave', 60, Date.UTC(2026, 1, 2), 'wave'));
  S.push(archive('lighthouse', 'arc-lighthouse', 'Lighthouse', 60, Date.UTC(2026, 0, 5), 'lighthouse'));
  S.push(archive('hourglass', 'arc-hourglass', 'Hourglass', 55, Date.UTC(2025, 11, 1), 'hourglass'));
  S.push(archive('galaxy', 'arc-galaxy', 'Galaxy', 60, Date.UTC(2026, 2, 2), 'galaxy'));
  S.push(archive('compass', 'arc-compass', 'Compass', 55, Date.UTC(2026, 4, 4), 'compass'));
  S.push(archive('pinwheel', 'arc-pinwheel', 'Pinwheel', 50, Date.UTC(2026, 5, 1), 'pinwheel'));
  // ── Work · clients ──
  S.push(client('kestrel', 'client-hanbit', 'Kestrel Freight', 56, Date.UTC(2026, 4, 1), 'kestrel', 'delivery map'));
  S.push(client('willowbank', 'client-sodam', 'Willowbank Press', 52, Date.UTC(2026, 4, 8), 'willowbank', 'ebook preview'));
  S.push(client('clearbrook', 'client-pureun', 'Clearbrook Clinic', 48, Date.UTC(2026, 5, 3), 'clearbrook', 'appointment reminders'));
  S.push(client('maplestone', 'client-daon', 'Maplestone Academy', 52, Date.UTC(2026, 4, 15), 'maplestone', 'class material search'));
  S.push(client('driftwood', 'client-mir', 'Driftwood Travel', 50, Date.UTC(2026, 5, 10), 'driftwood', 'itinerary sharing'));
  // ── Work · operations ──
  S.push({ hub: 'ops-runbooks', key: 'runbook', dir: 'src-work/operations/runbooks', n: 60,
    title: i => `Runbook · ${combo(RUNBOOK, ['', ' (overnight)', ' (weekend)'], i)}`,
    summary: i => `Steps, checks, and rollback for "${at(RUNBOOK, i)}".`,
    lines: i => ['1. Announce it', `2. ${at(RUNBOOK, i)}`, '3. Confirm the metrics have recovered', 'Rollback: revert to the previous step\'s settings'],
    updated: i => ago(200 - i * 3), chain: null, base: ['ops-incident', 'Incident report template'],
    topics: i => [i % 12 === 3 && 'moc-dev', i % 19 === 6 && 'moc-habit'] });
  S.push({ hub: 'ops-oncall', key: 'oncall', dir: 'src-work/operations/oncall', n: 70,
    title: i => `On-call log ${iso(Date.UTC(2026, 7, 1) + i * DAY)}`, file: i => `${iso(Date.UTC(2026, 7, 1) + i * DAY)}.md`,
    summary: () => 'An on-call log briefly noting the alerts received and work handled that day (fictional).',
    lines: i => [`Alerts: ${i % 5 === 0 ? 'two' : i % 5 === 3 ? 'none' : 'one'}`, `Handled: ${at(RUNBOOK, i * 7)}`, 'Handoff: none'],
    updated: i => iso(Date.UTC(2026, 7, 1) + i * DAY), chain: 'Previous day\'s log',
    cross: i => (i % 4 === 1 ? ['Runbook used', `runbook-${(i * 7) % 60}`, `Runbook · ${combo(RUNBOOK, ['', ' (overnight)', ' (weekend)'], (i * 7) % 60)}`] : null),
    topics: i => [i % 33 === 10 && 'moc-habit'] });
  S.push({ hub: 'ops-incidents-old', key: 'incident-old', dir: 'src-work/operations/incidents/2025', n: 55,
    title: i => `Incident report 2025-${pad((i % 12) + 1)} · ${at(['sign-in delay', 'payment failure', 'duplicate notifications', 'search errors', 'broken images', 'report delay', 'permission errors', 'sync stalled', 'deploy failure', 'out of capacity', 'time zone error'], i)}`,
    summary: () => 'Last year\'s incident report, written with the incident report template (fictional).',
    lines: i => ['Impact: some users', `Cause: ${i % 3 === 0 ? 'configuration mistake' : i % 3 === 1 ? 'external service latency' : 'capacity forecast miss'}`, 'Prevention: added one line to the checklist'],
    updated: i => iso(Date.UTC(2025, i % 12, 3 + ((i / 12) | 0) * 5)), chain: null, base: ['ops-incident', 'Incident report template'],
    cross: i => (i % 3 === 0 ? ['Related runbook', `runbook-${i % 60}`, `Runbook · ${combo(RUNBOOK, ['', ' (overnight)', ' (weekend)'], i % 60)}`] : null),
    topics: i => [i % 11 === 5 && 'moc-retro', i % 13 === 2 && 'moc-dev'] });
  // ── Work · content ──
  const BLOG = ['Three things that made search faster', 'Our design system\'s first year', 'Retros for small teams', 'Working in documents', 'Making accessibility checks a habit', 'Tidying up the data pipeline', 'How we cut notifications', 'First-screen experiments', 'Tools for remote collaboration', 'Code review culture', 'Onboarding new hires', 'Publishing incident retros'];
  S.push({ hub: 'content-blog', key: 'blog', dir: 'src-work/content/blog', n: 60,
    title: i => `Blog draft · ${combo(BLOG, ['', ' (revised)', ' (short version)', ' (one-page summary)', ' (newsletter version)'], i)}`,
    summary: i => `${['First draft', 'Revised version', 'Short version', 'One-page summary', 'Newsletter version'][(i / BLOG.length) | 0]} of "${at(BLOG, i)}".`,
    lines: i => ['Reader: someone new to the topic', `Key line: ${at(BLOG, i)}`, 'To fix: sentence length'],
    updated: i => ago(180 - i * 3), chain: null, base: ['content-style', 'Writing style guide'],
    cross: i => (i >= 12 ? ['Earlier version', `blog-${i - 12}`, `Blog draft · ${combo(BLOG, ['', ' (revised)', ' (short version)', ' (one-page summary)', ' (newsletter version)'], i - 12)}`] : null),
    topics: i => [i % 5 === 2 && 'moc-writing', i % 12 === 4 && 'moc-a11y', i % 15 === 9 && 'moc-oss'] });
  const TALK = ['Improving internal search', 'Adopting design tokens', 'A culture of small experiments', 'Readable error messages', 'Data quality checks', 'Documents that cut meetings', 'Mobile accessibility', 'Lessons from recommendation experiments', 'How to write runbooks'];
  S.push({ hub: 'content-talks', key: 'talk', dir: 'src-work/content/talks', n: 45,
    title: i => `Talk materials · ${combo(TALK, [' (outline)', ' (speaker notes)', ' (questions received)', ' (slide notes)', ' (repeat talk)'], i)}`,
    summary: i => `${['Outline', 'Speaker notes', 'Questions received', 'Slide notes', 'Notes from the second delivery'][(i / TALK.length) | 0]} for the "${at(TALK, i)}" talk.`,
    lines: () => ['Length: 20 minutes', 'Core: one message per slide', 'Next: work the questions into the slides'],
    format: i => (i % 9 === 8 ? 'pdf' : 'md'), file: i => `talk-${pad(i + 1, 3)}.${i % 9 === 8 ? 'pdf' : 'md'}`,
    updated: i => ago(150 - i * 3), chain: 'Previous material',
    topics: i => [i % 4 === 1 && 'moc-writing', i % 9 === 4 && 'moc-oss'] });
  S.push({ hub: 'newsletter-old', key: 'newsletter-old', dir: 'src-work/content/newsletter/2025', n: 52,
    title: i => `Newsletter 2025 issue ${i + 1}`, file: i => `2025-${pad(i + 1)}.md`,
    summary: i => `Internal newsletter sent in ${MONTHS[(i / 4.4) | 0]} last year (fictional).`,
    lines: i => [`Lead story: ${at(BLOG, i)}`, `In brief: ${at(TALK, i)}`, 'Next issue preview'],
    updated: i => iso(Date.UTC(2025, 0, 6) + i * 7 * DAY), chain: 'Previous issue', base: ['content-style', 'Writing style guide'],
    topics: i => [i % 13 === 6 && 'moc-writing'] });
  // ── Work · engineering ──
  const ADR = ['Merge into one repository', 'Config file format', 'Search index refresh interval', 'Image size limit', 'Error code scheme', 'Storing time zones', 'Permission model', 'Cache location', 'Log format', 'Test data generation', 'Release cadence', 'Feature flags', 'API versioning rules', 'Archive instead of delete', 'Notification queue', 'Accessibility conformance level', 'Translation key rules', 'Dark mode colors', 'File upload limit', 'Session expiry'];
  S.push({ hub: 'eng-adr', key: 'adr', dir: 'src-work/engineering/adr', n: 70,
    title: i => `ADR ${pad(i + 1, 3)} · ${combo(ADR, ['', ' (amended)', ' (amended again)', ' (deprecated)'], i)}`, file: i => `adr-${pad(i + 1, 3)}.md`,
    summary: i => `Architecture decision record: ${at(ADR, i)} (${['initial decision', 'amended', 'amended again', 'deprecated'][(i / ADR.length) | 0]}).`,
    lines: i => ['Context: the same problem came up three times', `Decision: ${at(ADR, i)} — the simplest option`, 'Consequences: conditions for revisiting are noted'],
    updated: i => ago(400 - i * 5), chain: null, base: ['projects-checklist', 'Project kickoff checklist'],
    cross: i => (i >= 20 ? ['Superseded decision', `adr-${i - 20}`, `ADR ${pad(i - 19, 3)} · ${combo(ADR, ['', ' (amended)', ' (amended again)', ' (deprecated)'], i - 20)}`] : null),
    topics: i => [i % 4 === 0 && 'moc-decision', i % 6 === 3 && 'moc-dev', i % 20 === 15 && 'moc-a11y'] });
  const REVIEW = ['Naming', 'Small functions', 'Error handling', 'Test names', 'Names over comments', 'Edge cases', 'Logging', 'Easy-to-revert changes', 'Fewer dependencies', 'Reading order', 'When to deduplicate', 'Measure performance first', 'Guard with types'];
  S.push({ hub: 'eng-review', key: 'review', dir: 'src-work/engineering/reviews', n: 65,
    title: i => `Review note · ${combo(REVIEW, ['', ' 2', ' 3', ' 4', ' 5'], i)}`,
    summary: i => `What I learned about "${at(REVIEW, i)}" in code review.`,
    lines: i => [`Lesson: ${at(REVIEW, i)}`, 'Example: one line before and after', 'Watch for in the next review'],
    updated: i => ago(240 - i * 3), chain: 'Previous note',
    cross: i => (i % 5 === 2 ? ['Related decision', `adr-${i % 70}`, `ADR ${pad((i % 70) + 1, 3)} · ${combo(ADR, ['', ' (amended)', ' (amended again)', ' (deprecated)'], i % 70)}`] : null),
    topics: i => [i % 7 === 3 && 'moc-dev', i % 16 === 8 && 'moc-habit'] });
  const API = ['Get user', 'List events', 'Send notification', 'Search', 'Upload file', 'Check permissions', 'Generate report', 'Export', 'List teams', 'Update settings', 'Sign-in history', 'Add tags'];
  S.push({ hub: 'eng-api', key: 'api', dir: 'src-work/engineering/api', n: 60,
    title: i => `API spec · ${combo(API, [' v1', ' v2', ' error table', ' examples', ' changelog'], i)}`,
    summary: i => `${['v1 spec', 'v2 spec', 'Error table', 'Example requests', 'Changelog'][(i / API.length) | 0]} for the "${at(API, i)}" API (fictional).`,
    lines: i => [`Request: ${at(API, i)}`, 'Response: three cases — success · empty · error', 'Note: no personal data fields'],
    updated: i => ago(220 - i * 3), chain: null,
    cross: i => (i >= 12 ? ['Same API', `api-${i % 12}`, `API spec · ${at(API, i)} v1`] : null),
    topics: i => [i % 8 === 5 && 'moc-dev', i % 14 === 3 && 'moc-data'] });
  const PERF = ['First screen render', 'Search response', 'List scrolling', 'Image loading', 'Report generation', 'Sign-in', 'File upload', 'Saving settings', 'Notification list', 'Opening the dashboard', 'Export', 'App startup'];
  S.push({ hub: 'eng-perf', key: 'perf', dir: 'src-work/engineering/performance', n: 60,
    title: i => `Performance · ${combo(PERF, [' baseline', ' improvement 1', ' improvement 2', ' mobile', ' regression check'], i)}`,
    summary: i => `Measurements of "${at(PERF, i)}" on the same device with the same data.`,
    lines: () => ['Measure: the time users wait', 'Conditions: same device · same data', 'Conclusion: note why it changed, not just the numbers'],
    updated: i => ago(210 - i * 3), chain: null,
    cross: i => (i >= 12 ? ['Baseline', `perf-${i % 12}`, ''] : i % 4 === 1 ? ['Related decision', `adr-${i * 3}`, ''] : null),
    topics: i => [i % 6 === 2 && 'moc-dev', i % 10 === 5 && 'moc-data'] });
  // ── Work · project guides ──
  const BEACON = ['Collection definitions', 'Event naming rules', 'Deduplication', 'Late-arriving events', 'Daily aggregation', 'Quality checks', 'Reprocessing', 'Retention period', 'Schema changes', 'Dashboard hookup', 'Cost review', 'Failure drill', 'Sampling'];
  S.push({ hub: 'guide-beacon', key: 'beacon', dir: 'src-work/projects/beacon', n: 65,
    title: i => `Beacon · ${combo(BEACON, [' (design)', ' (work log)', ' (check)', ' (retro)', ' (improvements)'], i)}`,
    summary: i => `Beacon (fictional), the event pipeline: ${at(BEACON, i)}, ${[' design', ' work log', ' check', ' retro', ' improvements'][(i / BEACON.length) | 0].trim()}.`,
    lines: i => [`Step: ${at(BEACON, i)}`, 'Verify: with one day of samples', `Metrics: aligned with ${ref('lumen-metrics', 'Lumen core metric definitions')}`],
    updated: i => ago(160 - i * 2), chain: 'Previous step',
    topics: i => [i % 3 === 1 && 'moc-data', i % 10 === 6 && 'moc-decision'] });
  const MOSAIC = ['Color', 'Typography', 'Spacing', 'Buttons', 'Input fields', 'Tables', 'Dialogs', 'Banners', 'Tabs', 'Icons', 'Empty states', 'Loading', 'Error states', 'Lists'];
  S.push({ hub: 'guide-mosaic', key: 'mosaic', dir: 'src-work/projects/mosaic', n: 70,
    title: i => `Mosaic · ${combo(MOSAIC, [' (principles)', ' (component)', ' (accessibility check)', ' (changelog)', ' (usage examples)'], i)}`,
    summary: i => `The ${at(MOSAIC, i)} document for Mosaic (fictional), the design system.`,
    lines: i => [`Subject: ${at(MOSAIC, i)}`, 'Rule: one look for one purpose', `Check: ${ref('nova-a11y', 'Nova accessibility checklist')}`],
    updated: i => ago(140 - i * 2), chain: null,
    cross: i => (i >= 14 ? ['Same element', `mosaic-${i % 14}`, `Mosaic · ${at(MOSAIC, i)} (principles)`] : null),
    topics: i => [i % 5 === 1 && 'moc-design', i % 7 === 2 && 'moc-a11y'] });
  const RELAY = ['/today', '/meeting', '/vacation', '/deploy', '/oncall', '/summary', '/mute', '/help', '/search', '/poll', '/log', '/todo'];
  S.push({ hub: 'guide-relay', key: 'relay', dir: 'src-work/projects/relay', n: 60,
    title: i => `Relay ${combo(RELAY, [' command docs', ' conversation test', ' error log', ' improvement notes', ' operations log'], i)}`,
    summary: i => `Records for the ${at(RELAY, i)} command of Relay (fictional), the notification bot.`,
    lines: i => [`Command: ${at(RELAY, i)}`, 'Response: within three lines', 'Human check: only when needed'],
    updated: i => ago(120 - i * 2), chain: 'Previous entry',
    cross: i => (i % 6 === 0 ? ['On-call person who got the alert', `oncall-${i % 70}`, ''] : null),
    topics: i => [i % 9 === 3 && 'moc-ai', i % 11 === 7 && 'moc-dev'] });

  // ── Personal ──
  const SPRING = Date.UTC(2026, 3, 1);
  S.push({ hub: 'daily-spring', key: 'daily-spring', dir: 'src-personal/journal/daily', n: 86,
    title: i => { const d = new Date(SPRING + i * DAY); return `Daily log ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; },
    file: i => `${iso(SPRING + i * DAY)}.md`,
    summary: () => 'A short log of mood, what I did, and what to do tomorrow (fictional).',
    lines: i => [`Mood: ${at(['bright', 'a bit tired', 'focused', 'busy', 'calm', 'scattered', 'excited'], i)}`, `Did: ${at(['a walk', 'reading', 'cooking', 'guitar practice', 'swimming', 'sorting photos', 'study group'], i * 3)}`],
    updated: i => iso(SPRING + i * DAY), chain: 'Previous day',
    topics: i => [i % 29 === 12 && 'moc-habit'] });
  const ESSAY = ['A Slow Walk', 'The Small Room', 'Old Postcards', 'A Neighbor\'s Time', 'The Empty Desk', 'Sentences of the Sea', 'Winter Diary', 'The Reader', 'A Map of Memory', 'Quiet Work', 'The Second Season', 'The Weight of Words'];
  S.push({ hub: 'read-essays', key: 'essay', dir: 'src-personal/learning/reading/essays', n: 60,
    title: i => `Reading notes · ${combo(ESSAY, ['', ' (reread)', ' (book club notes)', ' (quotes)', ' (quick take)'], i)}`,
    summary: i => `Notes from reading the fictional essay collection "${at(ESSAY, i)}".`,
    lines: () => ['One sentence to remember', 'One scene it brought to mind', 'One question left over'],
    updated: i => ago(300 - i * 4), chain: 'Read with',
    topics: i => [i % 8 === 3 && 'moc-writing', i % 15 === 7 && 'moc-habit'] });
  const SCI = ['Notes on Sleep', 'Tiny Creatures', 'Life of a Star', 'A Sense for Numbers', 'Records of Climate', 'Brains and Habits', 'The Nature of Light', 'Maps Under the Sea', 'Measuring Time', 'Evidence for Evolution', 'States of Matter', 'The Math of Chance'];
  S.push({ hub: 'read-science', key: 'science', dir: 'src-personal/learning/reading/science', n: 60,
    title: i => `Reading notes · ${combo(SCI, ['', ' (summary)', ' (question list)', ' (figure notes)', ' (reread)'], i)}`,
    summary: i => `Notes on the fictional popular science book "${at(SCI, i)}".`,
    lines: () => ['Something I learned for the first time', 'Something to look up', 'An everyday example'],
    updated: i => ago(280 - i * 4), chain: 'Read with',
    cross: i => (i % 12 === 5 ? ['Related log', `sleep-${i % 60}`, `Sleep log week of ${iso(Date.UTC(2025, 11, 1) + (i % 60) * 7 * DAY)}`] : null),
    topics: i => [i % 9 === 2 && 'moc-health', i % 14 === 6 && 'moc-data'] });
  const WORKB = ['Working Deeply', 'Shared Documents', 'Good Questions', 'Breaking It Down', 'Giving and Getting Feedback', 'Meeting-Free Afternoons', 'Recording Decisions', 'Loose Ties', 'Priorities at Work', 'The Skill of Resting', 'Learning Organizations'];
  S.push({ hub: 'read-work', key: 'workbook', dir: 'src-personal/learning/reading/work', n: 55,
    title: i => `Reading notes · ${combo(WORKB, ['', ' (practice log)', ' (team edition)', ' (counterpoints)', ' (summary card)'], i)}`,
    summary: i => `Notes on "${at(WORKB, i)}", a fictional book about ways of working.`,
    lines: () => ['One thing to try right away', 'One thing to share with the team', 'One point that does not fit'],
    updated: i => ago(260 - i * 4), chain: 'Read with',
    topics: i => [i % 6 === 1 && 'moc-planning', i % 7 === 4 && 'moc-decision', i % 13 === 9 && 'moc-habit'] });
  const DESIGN_C = ['Grids', 'Typography', 'Color contrast', 'Drawing icons', 'Visual hierarchy', 'Mobile screens', 'Prototyping', 'User interviews', 'White space', 'Data tables', 'Motion', 'Design critique'];
  S.push({ hub: 'course-design', key: 'course-design', dir: 'src-personal/learning/courses/design', n: 55,
    title: i => `Design course notes · ${combo(DESIGN_C, [' lecture 1', ' lecture 2', ' exercise', ' assignment', ' review'], i)}`,
    summary: i => `Notes on "${at(DESIGN_C, i)}" from a fictional design course.`,
    lines: i => [`Topic: ${at(DESIGN_C, i)}`, 'Followed along: one screen', 'Scene to revisit: mid-lecture'],
    updated: i => ago(230 - i * 3), chain: 'Previous lecture',
    topics: i => [i % 4 === 2 && 'moc-design', i % 9 === 5 && 'moc-a11y'] });
  const DATA_C = ['Working with tables', 'Choosing charts', 'The trap of averages', 'Looking at distributions', 'Correlation and causation', 'Time series', 'Missing values', 'Aggregation queries', 'Dashboard design', 'Writing reports', 'Analyzing experiments', 'Clustering'];
  S.push({ hub: 'course-data', key: 'course-data', dir: 'src-personal/learning/courses/data', n: 60,
    title: i => `Data course notes · ${combo(DATA_C, [' lecture 1', ' lecture 2', ' practice problems', ' assignment', ' review'], i)}`,
    summary: i => `Notes on "${at(DATA_C, i)}" from a fictional data analysis course.`,
    lines: i => [`Topic: ${at(DATA_C, i)}`, 'Practice: one fictional table', `Reference: ${ref('learn-viz-book', 'Reading notes · Introduction to data visualization')}`],
    updated: i => ago(210 - i * 3), chain: 'Previous lecture',
    topics: i => [i % 3 === 1 && 'moc-data', i % 10 === 4 && 'moc-method'] });
  const WORDS = ['Weather', 'Food', 'Transportation', 'Shops', 'Time', 'Family', 'School', 'Work', 'Hobbies', 'Travel', 'Hospital', 'Bank', 'Home', 'Feelings', 'Seasons'];
  S.push({ hub: 'jp-words', key: 'jp-words', dir: 'src-personal/learning/japanese/words', n: 60,
    title: i => `Japanese vocabulary · ${combo(WORDS, [' basics', ' example sentences', ' review', ' quiz'], i)}`,
    summary: i => `Twenty words and example sentences on "${at(WORDS, i)}" (fictional textbook).`,
    lines: i => [`Topic: ${at(WORDS, i)}`, 'Words memorized: twenty', 'Missed words: write them again'],
    updated: i => ago(190 - i * 3), chain: 'Previous list',
    cross: i => (i % 15 === 9 ? ['Used on', `trip-${i % 60}`, `Travel log · ${combo(TRIP, [' day 1', ' day 2', ' day 3', ' look back'], i % 60)}`] : null),
    topics: i => [i % 20 === 11 && 'moc-travel', i % 17 === 3 && 'moc-habit'] });
  const DISH = ['Lentil soup', 'Fried rice', 'Braised tofu', 'Chicken breast salad', 'Tomato and egg stir-fry', 'Mushroom risotto', 'Glass noodles', 'Seaweed soup', 'Curry', 'Potato pancakes', 'Salmon rice bowl', 'Sesame oil noodles', 'Oatmeal porridge', 'Spinach salad', 'Spicy rice cakes', 'Shrimp fried rice', 'Bean sprout soup', 'Grilled eggplant'];
  S.push({ hub: 'kitchen-recipes', key: 'recipe', dir: 'src-personal/life/kitchen/recipes', n: 72,
    title: i => `Recipe card · ${combo(DISH, ['', ' (quick version)', ' (lunchbox version)', ' (for guests)'], i)}`,
    summary: i => `${at(DISH, i)}: ingredients, steps, and what to change next time.`,
    lines: i => [`Ingredients: ${4 + (i % 4)} things already at home`, 'Steps: five or fewer', 'Change: season a little lighter'],
    updated: i => ago(250 - i * 3), chain: null,
    format: i => (i % 18 === 17 ? 'image' : 'md'), file: i => `recipe-${pad(i + 1, 3)}.${i % 18 === 17 ? 'jpg' : 'md'}`,
    cross: i => (i >= 18 && i % 18 !== 17 ? ['Base version', `recipe-${i % 18}`, `Recipe card · ${at(DISH, i)}`] : null),
    topics: i => [i % 8 === 2 && 'moc-health', i % 24 === 13 && 'moc-habit'] });
  const HOME = ['Bookshelf cleanup', 'Faucet replacement', 'Window frame caulking', 'Seasonal closet swap', 'Light fixture replacement', 'Window screen repair', 'Fridge cleanout', 'Paperwork filing', 'Toolbox cleanup', 'Entryway cleanup', 'Bathroom grout', 'Repotting plants'];
  S.push({ hub: 'life-home', key: 'home', dir: 'src-personal/life/home', n: 55,
    title: i => `Home log · ${combo(HOME, ['', ' (redone)', ' (tool list)', ' (seasonal check)', ' (notes)'], i)}`,
    summary: i => `${at(HOME, i)}: what I did and the tools used.`,
    lines: () => ['Time taken: under an hour', 'Tools: basic hand tools', 'Next: again in the same season'],
    updated: i => ago(270 - i * 4), chain: null,
    topics: i => [i % 11 === 4 && 'moc-habit'] });
  const TRIP = ['Cornish coast', 'Coffee street crawl', 'Island east side', 'Old town alleys', 'Market town', 'Hillside streets', 'Fictional city Halden', 'Fictional island Corran', 'Morning by the lake', 'Harbor at night', 'Riverside village', 'Bamboo grove', 'Island trails', 'Lakeside town', 'Fictional mountain village'];
  S.push({ hub: 'travel-trips', key: 'trip', dir: 'src-personal/life/travel/trips', n: 60,
    title: i => `Travel log · ${combo(TRIP, [' day 1', ' day 2', ' day 3', ' look back'], i)}`,
    summary: i => `${['Day 1', 'Day 2', 'Day 3', 'Look-back'][(i / TRIP.length) | 0]} log for the ${at(TRIP, i)} trip (fictional itinerary).`,
    lines: () => ['Getting around: public transit', 'One thing I liked', 'One thing to change next time'],
    updated: i => ago(330 - i * 5), chain: null,
    cross: i => (i >= 15 ? ['Same trip', `trip-${i - 15}`, `Travel log · ${combo(TRIP, [' day 1', ' day 2', ' day 3', ' look back'], i - 15)}`] : null),
    topics: i => [i % 4 === 3 && 'moc-travel', i % 15 === 6 && 'moc-habit'] });
  S.push({ hub: 'health-sleep', key: 'sleep', dir: 'src-personal/life/health/sleep', n: 60,
    title: i => `Sleep log week of ${iso(Date.UTC(2025, 11, 1) + i * 7 * DAY)}`, file: i => `week-${iso(Date.UTC(2025, 11, 1) + i * 7 * DAY)}.md`,
    summary: () => 'A week of bedtime, wake-ups, condition, and the habit changed (fictional).',
    lines: i => [`Bedtime: ${at(['before midnight', 'around midnight', '1 a.m.'], i)}`, `Wake-ups: ${i % 3}`, `Habit changed: ${at(['screens off', 'evening walk', 'less caffeine', 'same wake-up time'], i)}`],
    updated: i => iso(Date.UTC(2025, 11, 7) + i * 7 * DAY), chain: 'Last week',
    topics: i => [i % 5 === 2 && 'moc-health', i % 7 === 4 && 'moc-habit'] });
  S.push({ hub: 'health-meals', key: 'meals', dir: 'src-personal/life/health/meals', n: 58,
    title: i => `Meal log week of ${iso(Date.UTC(2025, 11, 1) + i * 7 * DAY)}`, file: i => `week-${iso(Date.UTC(2025, 11, 1) + i * 7 * DAY)}.md`,
    summary: () => 'A week of meals and the grocery list (fictional).',
    lines: i => ['Breakfast: keep it simple', 'Dinner: one recipe card', `Groceries: ${at(DISH, i)} ingredients`],
    updated: i => iso(Date.UTC(2025, 11, 7) + i * 7 * DAY), chain: 'Last week',
    cross: i => (i % 18 === 17 ? null : ['Dish made', `recipe-${i % 18}`, `Recipe card · ${at(DISH, i)}`]),
    topics: i => [i % 6 === 1 && 'moc-health'] });
  S.push({ hub: 'guide-swim', key: 'swim', dir: 'src-personal/life/health/swim', n: 52,
    title: i => `Swim lesson ${pad(i + 1)}`,
    summary: i => `A lesson focused on ${at(['breathing', 'kicking', 'arm strokes', '25 m freestyle', 'backstroke', 'turns', 'breaststroke kick', 'floating longer'], i)} (fictional lessons).`,
    lines: i => [`Learned today: ${at(['breathing', 'kicking', 'arm strokes', '25 m freestyle', 'backstroke', 'turns', 'breaststroke kick', 'floating longer'], i)}`, `Went well: ${i % 2 ? 'breathing rhythm' : 'floating'}`, 'Next lesson: the same move ten times'],
    updated: i => ago(200 - i * 3), chain: 'Previous lesson', base: ['life-workout', 'Workout routine'],
    topics: i => [i % 6 === 4 && 'moc-health', i % 9 === 1 && 'moc-habit'] });
  const PLANT = ['cherry tomatoes', 'lettuce', 'basil', 'scallions', 'chili peppers', 'rosemary', 'strawberries'];
  S.push({ hub: 'garden-log', key: 'garden-week', dir: 'src-personal/life/garden/log', n: 63,
    title: i => `Garden observation · ${combo(PLANT, [' week 1', ' week 2', ' week 3', ' week 4', ' week 5', ' week 6', ' week 7', ' week 8', ' week 9'], i)}`,
    summary: i => `Week ${((i / PLANT.length) | 0) + 1} observation log for the ${at(PLANT, i)} pot.`,
    lines: i => [`Leaves: ${i % 3 === 0 ? 'two new leaves' : 'no change'}`, `Water: ${2 + (i % 2)} times a week`, `Next: ${i % 4 === 0 ? 'add a stake' : 'leave as is'}`],
    updated: i => ago(160 - i * 2), chain: null,
    cross: i => (i >= PLANT.length ? ['Last week', `garden-week-${i - PLANT.length}`, ''] : null),
    topics: i => [i % 8 === 5 && 'moc-habit'] });
  const WALK = ['Alley shadows', 'After the rain', 'Morning market', 'Park bench', 'Riverside sunset', 'Old signs', 'Windows', 'Winter trees', 'Stairs', 'Where the cats walk', 'Bus stop', 'Empty playground'];
  S.push({ hub: 'hobby-photo', key: 'photo', dir: 'src-personal/hobby/photo', n: 60,
    title: i => (i % 3 === 2 ? `Picked photo · ${combo(WALK, ['', ' 2'], (i / 3) | 0)}.jpg` : `Photo walk · ${combo(WALK, [' (notes)', ' (walked again)', ' (at dusk)', ' (early morning)'], i - ((i / 3) | 0))}`),
    summary: i => (i % 3 === 2 ? `A photo picked from the "${at(WALK, (i / 3) | 0)}" walk. This demo shows no photo, only this description.` : `A log of walking the neighborhood on the theme "${at(WALK, i - ((i / 3) | 0))}".`),
    lines: () => ['Time: an hour in the afternoon', 'Light: side light', 'Picked: one photo'],
    format: i => (i % 3 === 2 ? 'image' : 'md'), file: i => (i % 3 === 2 ? `pick-${pad(i + 1, 3)}.jpg` : `walk-${pad(i + 1, 3)}.md`),
    updated: i => ago(310 - i * 5), chain: null,
    topics: i => [i % 9 === 4 && 'moc-habit', i % 12 === 7 && 'moc-travel'] });
  const SONG = ['Spring Rain', 'The Bus Stop', 'Three in the Afternoon', 'Blue Door', 'First Snow', 'Back Alley', 'Little Boat', 'Lantern', 'Sound of the Wind', 'Long Summer', 'Daybreak'];
  S.push({ hub: 'hobby-music', key: 'guitar', dir: 'src-personal/hobby/guitar', n: 55,
    title: i => `Guitar practice · ${combo(SONG, [' — chords', ' — rhythm', ' — intro', ' — start to finish', ' — recording notes'], i)}`,
    summary: i => `Practice log for "${at(SONG, i)}" (fictional song): bars I got stuck on and hand positions I fixed.`,
    lines: () => ['Practice time: 15 minutes', 'Stuck on: the chord-change bars', 'Next: again at a slower tempo'],
    updated: i => ago(230 - i * 4), chain: 'Previous practice',
    topics: i => [i % 6 === 2 && 'moc-habit'] });
  const FILM = ['The Long Afternoon', 'Two Windows', 'End of Summer', 'The Quiet Train', 'Shining Alley', 'Letters Never Sent', 'Island Winter', 'The Shop With No Name', 'The Far Sea', 'The Third Guest', 'The Old Theater', 'Daybreak Bus Stop', 'Small Hero'];
  S.push({ hub: 'hobby-film', key: 'film', dir: 'src-personal/hobby/film', n: 65,
    title: i => `Film notes · ${combo(FILM, ['', ' (rewatch)', ' (scene notes)', ' (club discussion)', ' (quick take)'], i)}`,
    summary: i => `One scene and one question from the fictional film "${at(FILM, i)}".`,
    lines: () => ['Scene: just one', 'Question: what that scene left behind', 'Watch with: the film club'],
    updated: i => ago(290 - i * 4), chain: null,
    cross: i => (i >= 13 ? ['First viewing', `film-${i % 13}`, `Film notes · ${at(FILM, i)}`] : null),
    topics: i => [i % 13 === 5 && 'moc-writing'] });
  const GAME = ['Star Charts', 'Harbor Town', 'The Gardener', 'Expedition', 'Marketplace', 'Lighthouse Keeper', 'Night Train', 'The Library', 'Forest Path'];
  S.push({ hub: 'hobby-board', key: 'board', dir: 'src-personal/hobby/boardgame', n: 45,
    title: i => `Board games · ${combo(GAME, [' — rules notes', ' — teaching order', ' — game night log', ' — strategy notes', ' — replay day'], i)}`,
    summary: i => `Rules for ${at(GAME, i)} (fictional game) and the order I explained it to first-time players.`,
    lines: () => ['Players: three or four', 'Teach: how to win first', 'Time: 40 minutes'],
    updated: i => ago(250 - i * 5), chain: null,
    cross: i => (i % 9 === 4 ? ['Game night group', `study-${i % 55}`, `Study group session ${pad((i % 55) + 1)}`] : null),
    topics: i => [i % 15 === 7 && 'moc-habit'] });

  // ── Research ──
  S.push(paper('nlp', 'papers-nlp', 'natural language processing', PAPER_Q, 70, Date.UTC(2025, 9, 1), 'nlp', 'moc-ai'));
  S.push(paper('vision', 'papers-vision', 'computer vision', VISION_Q, 60, Date.UTC(2025, 10, 1), 'vision', 'moc-ai'));
  S.push(paper('hci', 'papers-hci', 'human-computer interaction', HCI_Q, 65, Date.UTC(2025, 9, 15), 'hci', 'moc-a11y'));
  S.push(paper('recsys', 'papers-recsys', 'recommender systems', REC_Q, 55, Date.UTC(2025, 11, 1), 'recsys', 'moc-data'));
  S.push(paper('stats', 'papers-stats', 'statistical methods', STAT_Q, 55, Date.UTC(2025, 10, 15), 'stats', 'moc-method'));
  const AB = ['Button labels', 'Home screen copy', 'Recommendation row order', 'Notification timing', 'Search box position', 'Pricing table order', 'Empty-state illustration', 'Number of signup steps', 'Email subject lines', 'List density', 'Help placement', 'Color emphasis'];
  S.push({ hub: 'exp-ab', key: 'ab', dir: 'src-research/experiments/ab', n: 65,
    title: i => `A/B test · ${combo(AB, ['', ' round 2', ' round 3', ' mobile', ' retest', ' long-term'], i)}`,
    summary: i => `A test that showed two versions of "${at(AB, i)}" to fictional participants.`,
    lines: i => [`Hypothesis: changing "${at(AB, i)}" changes behavior`, `Duration: ${7 + (i % 3) * 7} days`, `Conclusion: ${i % 3 === 0 ? 'no difference' : i % 3 === 1 ? 'small difference' : 'test again'}`],
    updated: i => ago(260 - i * 3), chain: null,
    cross: i => (i % 4 === 2 ? ['Analysis method', `stats-${i % 55}`, `Paper notes · ${combo(STAT_Q, ['', ' (follow-up)', ' (comparison)', ' (revisited)', ' (at scale)', ' (survey)'], i % 55)}`] : i >= 12 ? ['Earlier test', `ab-${i - 12}`, `A/B test · ${combo(AB, ['', ' round 2', ' round 3', ' mobile', ' retest', ' long-term'], i - 12)}`] : null),
    topics: i => [i % 4 === 1 && 'moc-method', i % 9 === 5 && 'moc-data', i % 11 === 3 && 'moc-decision'] });
  const UX_T = ['Moving an event', 'Finding a file', 'Reverting a setting', 'Turning off notifications', 'Creating a share link', 'Sorting a table', 'Search filters', 'Finding help', 'Switching accounts', 'Uploading a photo', 'Editing a post'];
  S.push({ hub: 'exp-usability', key: 'usab', dir: 'src-research/experiments/usability', n: 55,
    title: i => `Usability study · ${combo(UX_T, ['', ' (mobile)', ' (zoomed screen)', ' (keyboard)', ' (rerun)'], i)}`,
    summary: i => `Log of five fictional participants doing the "${at(UX_T, i)}" task.`,
    lines: i => [`Task: ${at(UX_T, i)}`, 'Stuck points: two', 'To change: names and placement'],
    updated: i => ago(240 - i * 3), chain: null,
    cross: i => (i % 5 === 3 ? ['Related paper', `hci-${i % 65}`, `Paper notes · ${combo(HCI_Q, ['', ' (follow-up)', ' (comparison)', ' (revisited)', ' (at scale)', ' (survey)'], i % 65)}`] : null),
    topics: i => [i % 3 === 0 && 'moc-a11y', i % 7 === 2 && 'moc-design', i % 13 === 8 && 'moc-method'] });
  S.push({ hub: 'exp-pilot', key: 'pilot', dir: 'src-research/experiments/pilot', n: 50,
    title: i => `Pilot study ${pad(i + 1)} · ${at(['timing the procedure', 'instruction comprehension', 'survey length', 'task difficulty', 'recording consent process', 'compensation method', 'screen size', 'recruitment copy'], i)}`,
    summary: () => 'Log of testing the procedure with two or three fictional participants before the main study.',
    lines: () => ['Participants: two or three', 'Procedure changed: one', 'Applied to main study: yes'],
    updated: i => ago(220 - i * 3), chain: 'Previous pilot',
    topics: i => [i % 5 === 1 && 'moc-method'] });
  const DS2 = ['document length sample', 'query sample', 'session length sample', 'button click sample', 'error message sample', 'screen size sample', 'response time sample', 'tag sample', 'file type sample', 'notification open sample'];
  S.push({ hub: 'datasets-more', key: 'ds2', dir: 'src-research/datasets/more', n: 60,
    title: i => `Dataset card · ${combo(DS2, [' 3', ' 4', ' 5', ' 6', ' 7', ' 8'], i)}`,
    summary: i => `Collection ${((i / DS2.length) | 0) + 3} card for the fictional dataset "${at(DS2, i)}".`,
    lines: () => ['Source: fictional records for the demo', 'Scope: one month', 'Caveats: no personally identifiable information'],
    updated: i => ago(320 - i * 4), chain: null,
    cross: i => (i >= 10 ? ['Previous collection', `ds2-${i - 10}`, `Dataset card · ${combo(DS2, [' 3', ' 4', ' 5', ' 6', ' 7', ' 8'], i - 10)}`] : null),
    topics: i => [i % 4 === 2 && 'moc-data'] });
  const IDEA = ['Search without queries', 'Showing reading traces', 'Slow recommendations', 'Showing document age', 'Auto-grouping meeting notes', 'Finding by asking', 'Auto-suggesting indexes', 'Duplicate material alerts', 'Reading order suggestions', 'Seeing link strength', 'Waking forgotten materials', 'Summaries of summaries'];
  S.push({ hub: 'research-notes', key: 'idea', dir: 'src-research/notes', n: 70,
    title: i => `Idea note · ${combo(IDEA, ['', ' (counterpoint)', ' (experiment design)', ' (related work)', ' (on hold)', ' (picked back up)'], i)}`,
    summary: i => `Note on the candidate research question "${at(IDEA, i)}".`,
    lines: () => ['The question in one line', 'Why it matters', 'The smallest experiment'],
    updated: i => ago(200 - i * 2), chain: null,
    cross: i => (i % 6 === 2 ? ['Follow-up test', `ab-${i % 65}`, `A/B test · ${combo(AB, ['', ' round 2', ' round 3', ' mobile', ' retest', ' long-term'], i % 65)}`] : i >= 12 ? ['First note', `idea-${i % 12}`, `Idea note · ${at(IDEA, i)}`] : null),
    topics: i => [i % 7 === 3 && 'moc-ai', i % 9 === 6 && 'moc-decision', i % 10 === 1 && 'moc-method'] });
  S.push({ hub: 'research-seminars', key: 'seminar', dir: 'src-research/seminars', n: 60,
    title: i => `Lab seminar ${pad(i + 1)} · ${at(['paper talk', 'progress report', 'methods discussion', 'data sharing', 'guest talk (fictional)', 'experiment design review'], i)}`,
    summary: () => 'Talk summary and questions from a lab seminar (fictional).',
    lines: i => [`Format: ${at(['paper talk', 'progress report', 'methods discussion', 'data sharing', 'guest talk', 'experiment design review'], i)}`, 'Questions: three', 'Next presenter: by rotation'],
    updated: i => ago(400 - i * 7), chain: 'Previous session',
    cross: i => (i % 3 === 0 ? ['Paper presented', `${at(['nlp', 'vision', 'hci', 'recsys', 'stats'], i / 3)}-${(i * 2) % 55}`, `Paper notes · ${combo(at([PAPER_Q, VISION_Q, HCI_Q, REC_Q, STAT_Q], i / 3), ['', ' (follow-up)', ' (comparison)', ' (revisited)', ' (at scale)', ' (survey)'], (i * 2) % 55)}`] : null),
    topics: i => [i % 12 === 5 && 'moc-method'] });
  S.push({ hub: 'research-reviews', key: 'rev', dir: 'src-research/reviews', n: 45,
    title: i => `Review comment ${pad(i + 1)} · ${at(['sample size', 'control group', 'measurement instruments', 'ethics procedures', 'analysis plan', 'generalizability', 'prior work', 'timeline', 'data management'], i)}`,
    summary: () => 'A review comment on the research proposal and my response (fictional).',
    lines: () => ['Gist of the comment in one line', 'Response: changes marked', 'Remaining concern: one'],
    updated: i => ago(180 - i * 3), chain: null, base: ['research-pdf-0', 'Research data management rules.pdf'],
    topics: i => [i % 5 === 2 && 'moc-method', i % 8 === 6 && 'moc-decision'] });
  S.push({ hub: 'guide-thesis', key: 'thesis', dir: 'src-research/thesis', n: 70,
    title: i => (i % 5 === 4 ? `Thesis ${at(['introduction', 'related work', 'methods', 'results', 'discussion', 'conclusion', 'appendix'], (i / 5) | 0)} chapter draft v${((i / 35) | 0) + 1}` : `Thesis weekly log, week ${pad(i - ((i / 5) | 0) + 1)}`),
    summary: i => (i % 5 === 4 ? 'A thesis (fictional topic) chapter draft and how advisor feedback was applied.' : 'What I did this week, where I got stuck, and next week\'s plan.'),
    lines: i => (i % 5 === 4 ? ['Length: shorter than the last version', 'Advisor feedback: figures first', 'Changed: paragraph order'] : ['Did: literature review · analysis', 'Stuck on: one thing', 'Next week: chapter draft']),
    updated: i => ago(360 - i * 5), chain: 'Previous entry',
    cross: i => (i % 7 === 3 ? ['Experiment referenced', `pilot-${i % 50}`, ''] : null),
    topics: i => [i % 6 === 2 && 'moc-method', i % 14 === 9 && 'moc-writing', i % 10 === 7 && 'moc-habit'] });
  const QSET = ['Short queries', 'Long queries', 'Typo queries', 'Synonym queries', 'Date queries', 'Non-person name queries', 'Mixed-language queries', 'Question-form queries', 'List-finding queries', 'Recent-document queries', 'Ambiguous queries', 'Negation queries', 'File type queries'];
  S.push({ hub: 'guide-benchmark', key: 'bench', dir: 'src-research/benchmark', n: 65,
    title: i => `Benchmark · ${combo(QSET, [' (query set)', ' (judgment criteria)', ' (judgments)', ' (evaluation run)', ' (error analysis)'], i)}`,
    summary: i => `${['Query set', 'Judgment criteria', 'Judgments', 'Evaluation run', 'Error analysis'][(i / QSET.length) | 0]} for "${at(QSET, i)}" in the document search benchmark (fictional).`,
    lines: () => ['Queries: 50 (fictional)', 'Judging: two people independently', 'Disagreements: a third person decides'],
    updated: i => ago(170 - i * 2), chain: null,
    cross: i => (i >= 13 ? ['Same query set', `bench-${i % 13}`, `Benchmark · ${at(QSET, i)} (query set)`] : null),
    topics: i => [i % 4 === 3 && 'moc-data', i % 9 === 1 && 'moc-method', i % 16 === 6 && 'moc-oss'] });
  S.push({ hub: 'guide-replication', key: 'repl', dir: 'src-research/replication', n: 55,
    title: i => `Replication · ${at(['Original paper notes', 'Matching the environment', 'Re-downloading data', 'Reproducing preprocessing', 'Reproducing the baseline', 'Reproducing main results', 'Difference analysis', 'Asking the authors', 'Report draft', 'Public write-up', 'Looking back'], i)} ${((i / 11) | 0) + 1}`,
    summary: i => `Log of the "${at(['Original paper notes', 'Matching the environment', 'Re-downloading data', 'Reproducing preprocessing', 'Reproducing the baseline', 'Reproducing main results', 'Difference analysis', 'Asking the authors', 'Report draft', 'Public write-up', 'Looking back'], i)}" step of replicating a fictional paper.`,
    lines: () => ['Difference from original results: small', 'Likely cause: preprocessing', 'Shared publicly: code description only'],
    updated: i => ago(150 - i * 2), chain: 'Previous step',
    topics: i => [i % 5 === 1 && 'moc-method', i % 8 === 3 && 'moc-oss'] });

  // ── Community ──
  const REPO = ['fictional repo moonlight-editor', 'fictional repo tiny-map', 'fictional repo table-converter', 'fictional repo spell-checker', 'fictional repo event-calendar', 'fictional repo contrast-tool', 'fictional repo docs-site-template', 'fictional repo log-viewer', 'fictional repo survey-tool', 'fictional repo a11y-checker', 'fictional repo image-shrinker', 'fictional repo shortcut-list', 'fictional repo i18n-key-lint'];
  S.push({ hub: 'com-oss', key: 'oss', dir: 'src-personal/community/opensource', n: 65,
    title: i => `Open source contribution · ${combo(REPO, [' issue', ' docs fix', ' added tests', ' feature proposal', ' review received'], i)}`,
    summary: i => `${['Issue', 'Docs fix', 'Added tests', 'Feature proposal', 'Pull request review'][(i / REPO.length) | 0]} filed on ${at(REPO, i)}.`,
    lines: () => ['What: one change', 'Review feedback: rename things', 'Result: merged'],
    updated: i => ago(220 - i * 3), chain: null,
    cross: i => (i % 7 === 2 ? ['Lesson learned', `review-${i % 65}`, `Review note · ${combo(REVIEW, ['', ' 2', ' 3', ' 4', ' 5'], i % 65)}`] : i >= 13 ? ['Same repository', `oss-${i % 13}`, `Open source contribution · ${at(REPO, i)} issue`] : null),
    topics: i => [i % 3 === 1 && 'moc-oss', i % 13 === 9 && 'moc-a11y', i % 15 === 4 && 'moc-dev'] });
  const MEETUP = ['Frontend Evenings', 'Data Chat', 'Accessibility Circle', 'Design Systems Night', 'Research Share', 'Small Team Ops', 'Search Engineering', 'Writing Club', 'Open Source Night', 'Remote Work Abroad', 'AI Tools Meetup'];
  S.push({ hub: 'com-meetups', key: 'meetup', dir: 'src-personal/community/meetups', n: 60,
    title: i => `Meetup notes · ${combo(MEETUP, [' #1', ' #2', ' #3', ' #4', ' #5', ' #6'], i)}`,
    summary: i => `Talk summaries and things to try from ${at(MEETUP, i)} (fictional meetup).`,
    lines: () => ['Talks: two', 'One-line summary: start small', 'To try: one thing'],
    updated: i => ago(300 - i * 5), chain: null,
    cross: i => (i % 8 === 5 ? ['Blog post written afterward', `blog-${i % 60}`, `Blog draft · ${combo(BLOG, ['', ' (revised)', ' (short version)', ' (one-page summary)', ' (newsletter version)'], i % 60)}`] : i >= 11 ? ['Previous session', `meetup-${i - 11}`, `Meetup notes · ${combo(MEETUP, [' #1', ' #2', ' #3', ' #4', ' #5', ' #6'], i - 11)}`] : null),
    topics: i => [i % 6 === 3 && 'moc-oss', i % 10 === 9 && 'moc-travel', i % 11 === 2 && 'moc-a11y'] });
  S.push({ hub: 'com-talks', key: 'extalk', dir: 'src-personal/community/talks', n: 50,
    title: i => `External talk prep · ${combo(TALK, [' (outline)', ' (rehearsal 1)', ' (rehearsal 2)', ' (questions received)', ' (look back)', ' (public slides)'], i)}`,
    summary: i => `Prep log for the "${at(TALK, i)}" talk at an external event (fictional).`,
    lines: () => ['Audience: people new to the topic', 'Rehearsal: timed', 'Questions received: three'],
    updated: i => ago(260 - i * 4), chain: null,
    cross: i => (i % 9 === 0 ? ['Internal version', `talk-${i % 45}`, `Talk materials · ${combo(TALK, [' (outline)', ' (speaker notes)', ' (questions received)', ' (slide notes)', ' (repeat talk)'], i % 45)}`] : null),
    listedBy: i => [i % 9 === 0 && 'content-talks'],
    topics: i => [i % 5 === 2 && 'moc-oss', i % 8 === 6 && 'moc-writing', i % 17 === 11 && 'moc-travel'] });
  const MENTOR = ['Preparing for a first job change', 'Choosing portfolio pieces', 'Receiving code reviews', 'Interview practice', 'Study plans', 'Settling into a first team', 'Presentation practice', 'Writing habits', 'Asking questions', 'Scheduling', 'Resting', 'Getting into open source'];
  S.push({ hub: 'com-mentoring', key: 'mentor', dir: 'src-personal/community/mentoring', n: 60,
    title: i => `Mentoring · ${combo(MENTOR, [' (session 1)', ' (session 2)', ' (session 3)', ' (session 4)', ' (wrap-up)'], i)}`,
    summary: i => `Log of talking about "${at(MENTOR, i)}" with a fictional mentee (no names).`,
    lines: () => ['Topic in one line', 'Commitments made together', 'Next meeting: in two weeks'],
    updated: i => ago(240 - i * 3), chain: null,
    cross: i => (i >= 12 ? ['Previous meeting', `mentor-${i - 12}`, `Mentoring · ${combo(MENTOR, [' (session 1)', ' (session 2)', ' (session 3)', ' (session 4)', ' (wrap-up)'], i - 12)}`] : null),
    topics: i => [i % 6 === 1 && 'moc-habit', i % 9 === 4 && 'moc-decision'] });
  S.push({ hub: 'com-study', key: 'study', dir: 'src-personal/community/study-group', n: 55,
    title: i => `Study group session ${pad(i + 1)}`,
    summary: i => `Session notes for a ${at(['algorithms', 'design critique', 'data analysis', 'writing', 'paper reading'], i)} study group (fictional).`,
    lines: i => [`Range: ${at(['one chapter', 'two problems', 'one screen', 'one piece'], i)}`, 'Format: 30-minute talk · 30-minute discussion', 'Next range: the next chapter'],
    updated: i => ago(380 - i * 7), chain: 'Previous session',
    cross: i => (i % 10 === 4 ? ['Paper read together', `nlp-${i % 70}`, `Paper notes · ${combo(PAPER_Q, ['', ' (follow-up)', ' (comparison)', ' (revisited)', ' (at scale)', ' (survey)'], i % 70)}`] : null),
    topics: i => [i % 7 === 5 && 'moc-habit'] });
  S.push({ hub: 'guide-hackathon', key: 'hack', dir: 'src-personal/community/hackathon', n: 55,
    title: i => `${at(['Spring', 'Summer', 'Fall'], (i / 19) | 0)} hackathon · ${at(['Prep list', 'Picking a theme', 'Team roles', 'First hour', 'Hour six', 'Midnight', 'Early-morning cleanup', 'Demo prep', 'Presentation', 'Judges\' questions', 'Retrospective', 'Code release', 'Photo notes', 'Next time', 'Tool list', 'Schedule', 'Meal notes', 'Feedback received', 'Wrap-up'], i)}`,
    summary: () => 'Weekend hackathon (fictional) participation log.',
    lines: () => ['Team: three', 'Built: one small tool', 'Learned: cut the scope'],
    updated: i => ago(330 - i * 4), chain: 'Previous entry',
    topics: i => [i % 6 === 3 && 'moc-oss', i % 9 === 7 && 'moc-retro'] });
  S.push({ hub: 'guide-podcast', key: 'pod', dir: 'src-personal/community/podcast', n: 60,
    title: i => `Podcast episode ${pad(((i / 3) | 0) + 1)} · ${['plan', 'script', 'editing notes'][i % 3]}`,
    summary: i => `${['Plan', 'Script', 'Editing notes'][i % 3]} for episode ${((i / 3) | 0) + 1} of a podcast (fictional) made with a colleague.`,
    lines: i => [`Topic: ${at([...BLOG, ...TALK], (i / 3) | 0)}`, 'Length: 25 minutes', 'Editing: trim filler words'],
    updated: i => ago(280 - i * 3), chain: 'Previous entry', base: ['content-style', 'Writing style guide'],
    topics: i => [i % 12 === 7 && 'moc-writing'] });
  S.push({ hub: 'guide-bookclub', key: 'bookclub', dir: 'src-personal/community/bookclub', n: 40,
    title: i => `Neighborhood book club session ${pad(i + 1)}`,
    summary: i => `Discussion of the fictional book "${at([...ESSAY, ...SCI, ...WORKB], i)}" (fictional club).`,
    lines: () => ['Attendance: six', 'Scenes discussed: two', 'Next book: by vote'],
    updated: i => ago(400 - i * 9), chain: 'Previous meeting',
    cross: i => ['Notes on the book', `${at(['essay', 'science', 'workbook'], i)}-${i % 55}`, ''],
    topics: i => [i % 6 === 2 && 'moc-writing', i % 11 === 5 && 'moc-habit'] });
  const DOCS = ['Getting started', 'Installation', 'FAQ', 'Contributing guide', 'Code of conduct', 'Configuration options', 'Command list', 'Troubleshooting', 'Changelog', 'Accessibility notes', 'Glossary'];
  S.push({ hub: 'com-translate', key: 'translate', dir: 'src-personal/community/translation', n: 55,
    title: i => `Docs translation · ${at(REPO, (i / DOCS.length) | 0).replace('fictional repo ', '')} — ${at(DOCS, i)}`,
    summary: i => `Translating the "${at(DOCS, i)}" page of ${at(REPO, (i / DOCS.length) | 0)} into Spanish.`,
    lines: () => ['Length: one screen', 'Tricky terms: two', 'Review: one round of fixes'],
    updated: i => ago(230 - i * 3), chain: null, base: ['content-style', 'Writing style guide'],
    cross: i => (i % DOCS.length === 0 ? ['Contribution to the same repo', `oss-${((i / DOCS.length) | 0) % 13}`, ''] : null),
    topics: i => [i % 4 === 1 && 'moc-oss', i % 18 === 0 && 'moc-writing', i % 11 === 9 && 'moc-a11y'] });
  // The last series takes the remainder: volunteering log (n is set in scaleMaterials)
  S.push({ hub: 'com-volunteer', key: 'volunteer', dir: 'src-personal/community/volunteer', n: 0,
    title: i => `Volunteering log ${pad(i + 1)} · ${at(['shelving at the neighborhood library', 'kids\' coding class', 'phone class for seniors', 'used book swap', 'park cleanup', 'braille material entry', 'plain-language editing'], i)}`,
    summary: () => 'Volunteering log at the neighborhood library and a coding class (fictional).',
    lines: () => ['Did: two hours', 'Met: no names recorded', 'Prepare next time: one thing'],
    updated: i => ago(360 - i * 6), chain: 'Previous entry',
    topics: i => [i % 7 === 6 && 'moc-a11y', i % 9 === 4 && 'moc-habit'] });
  return S;
}

/** Cap on related materials per topic MOC (including existing materials). Keeps MOC documents at 100 lines or fewer */
export const MOC_ITEM_CAP = 88;

/**
 * Expands series into materials. budget = number of materials to create (the last series takes the remainder).
 * mocUsed = related material count each MOC already has from existing materials. When candidates exceed the remaining room, thin them evenly across the series.
 */
export function scaleMaterials(budget: number, mocUsed: ReadonlyMap<string, number> = new Map()): Seed[] {
  const series = plan();
  const fixed = series.reduce((t, s) => t + s.n, 0);
  const left = budget - fixed;
  if (left < 30 || left > 80) throw new Error(`Demo size needs adjusting: volunteering log has ${left} entries`);
  series[series.length - 1].n = left;
  const titles = new Map<string, string>();
  for (const s of series) for (let i = 0; i < s.n; i++) titles.set(`${s.key}-${i}`, s.title(i));
  const out: Seed[] = [];
  for (const s of series) {
    for (let i = 0; i < s.n; i++) {
      const id = `${s.key}-${i}`;
      const format = s.format?.(i) ?? 'md';
      const links: string[] = [];
      if (s.base) links.push(`Basis: ${ref(s.base[0], s.base[1])}`);
      const cross = s.cross?.(i);
      if (cross) {
        const label = titles.get(cross[1]) ?? cross[2];
        if (!label) throw new Error(`Demo reference has no name: ${id} → ${cross[1]}`);
        links.push(`${cross[0]}: ${ref(cross[1], label)}`);
      }
      if (s.chain !== null && i > 0) links.push(`${s.chain ?? 'Previous entry'}: ${ref(`${s.key}-${i - 1}`, s.title(i - 1))}`);
      const topics = (s.topics?.(i) ?? []).filter((t): t is string => !!t);
      const listedBy = (s.listedBy?.(i) ?? []).filter((t): t is string => !!t);
      out.push({
        id, kind: 'material', title: s.title(i), path: `${s.dir}/${s.file?.(i) ?? `${s.key}-${pad(i + 1, 3)}.md`}`, parent: s.hub,
        updated: s.updated(i), summary: s.summary(i), format: format === 'md' ? undefined : format,
        topics: topics.length ? topics : undefined, listedBy: listedBy.length ? listedBy : undefined,
        body: format === 'md' ? `# ${s.title(i)}\n\n${s.lines(i).map(l => (/^\d+\./.test(l) ? l : `- ${l}`)).join('\n')}${links.length ? `\n\n${links.join('\n')}` : ''}` : undefined
      });
    }
  }
  // MOC thinning: pick evenly spaced candidates, in order, to fill the remaining room
  const cands = new Map<string, Seed[]>();
  for (const m of out) for (const t of m.topics ?? []) cands.set(t, [...(cands.get(t) ?? []), m]);
  for (const [moc, list] of cands) {
    const room = Math.max(0, MOC_ITEM_CAP - (mocUsed.get(moc) ?? 0));
    if (list.length <= room) continue;
    list.forEach((m, r) => {
      if (Math.floor(((r + 1) * room) / list.length) > Math.floor((r * room) / list.length)) return;
      const left = m.topics!.filter(t => t !== moc);
      m.topics = left.length ? left : undefined;
    });
  }
  return out;
}
