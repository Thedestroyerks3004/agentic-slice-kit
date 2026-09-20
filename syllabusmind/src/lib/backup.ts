/**
 * Pre-written insurance. Live generation is the product; this exists only so a failed model call never
 * blocks the student. It also holds the rehearsed contrast pairs for the demo's backward-loop trigger,
 * which are used even when generation works, so that moment never depends on a network call.
 */
import type { Question } from '../engine/types';
import { DBMS_GRAPH, TRIGGER_NODES } from './dbmsGraph';
import { DEMO_QUESTIONS } from './demoData';
import { DEMO_SUB_QUESTIONS } from './demoSub';

let rot = 0;
/** Build a question with its options rotated so the right answer is not always A. */
function mk(nodeId: string, id: string, kind: Question['kind'], level: 1 | 2 | 3, text: string, options: string[], correct: number, extra: Partial<Question> = {}): Question {
  const r = rot++ % 4;
  const shift = <T,>(a: T[]) => a.map((_, i) => a[(i - r + 4) % 4]);
  return {
    id, nodeId, kind, level, text, ...extra,
    options: shift(options),
    correctIndex: (correct + r) % 4,
    misconceptions: extra.misconceptions ? shift(extra.misconceptions) : undefined,
    beliefs: extra.beliefs ? shift(extra.beliefs) : undefined,
    source: extra.source ?? 'backup',
  };
}

/* ------------------------------------------------------------------ rehearsed contrast pairs */

/**
 * For each trigger topic: a control (the misconception happens to give the right answer, so passing it proves
 * nothing) and a discriminating question (holding the misconception gives the wrong answer). Whether the
 * discriminating question is answered correctly is a plain comparison against the stored key.
 */
export const REHEARSED: Record<string, { control: Question; discriminating: Question }> = {
  concurrency_control: {
    control: mk('concurrency_control', 'rehearsed-cc-control', 'contrast', 2,
      'T1 holds an exclusive lock on A and waits for B. T2 holds an exclusive lock on B and waits for A. This is:',
      ['A deadlock', 'A dirty read', 'A phantom read', 'Normal blocking that resolves itself'], 0,
      { role: 'control', pairId: 'cc-pair', source: 'rehearsed', explanation: 'When each transaction holds a lock the other needs, neither can ever proceed. That circular wait is the classic deadlock.' }),
    discriminating: mk('concurrency_control', 'rehearsed-cc-disc', 'contrast', 3,
      'T2 is blocked waiting for a lock on A held by T1. T1 is running normally and will commit soon. Is this a deadlock?',
      ['No, T2 simply waits until T1 releases the lock', 'Yes, any blocked transaction means deadlock', 'Yes, but only if T2 has higher priority', 'No, because T2 should have been aborted immediately'], 0,
      {
        role: 'discriminating', pairId: 'cc-pair', source: 'rehearsed',
        explanation: 'Waiting for a lock is ordinary blocking. It only becomes a deadlock when the waits form a cycle. T1 is still running and will release its lock, so T2 will simply proceed.',
        misconceptions: [null, 'm_wait_is_deadlock', 'm_priority_causes_deadlock', 'm_abort_on_wait'],
        beliefs: [null, 'Believes any blocked transaction is a deadlock', 'Believes priority decides whether a wait is a deadlock', 'Believes a blocked transaction should be aborted at once'],
      }),
  },
  query_optimization: {
    control: mk('query_optimization', 'rehearsed-qo-control', 'contrast', 2,
      'A filter matches 0.1% of a large table and a suitable index exists. The optimizer should usually prefer:',
      ['The index scan', 'A full sequential scan', 'A cross join first', 'Sorting the whole table'], 0,
      { role: 'control', pairId: 'qo-pair', source: 'rehearsed', explanation: 'When a filter matches very few rows, following an index straight to them reads far fewer pages than scanning the whole table.' }),
    discriminating: mk('query_optimization', 'rehearsed-qo-disc', 'contrast', 3,
      'A filter matches about 90% of a large table and an index exists. Does an index scan beat a sequential scan?',
      ['Usually no: reading most pages through the index costs more than one sequential pass', 'Yes, an index scan is always faster when an index exists', 'Yes, because indexes remove the need to read pages', 'No, because the optimizer ignores indexes on large tables'], 0,
      {
        role: 'discriminating', pairId: 'qo-pair', source: 'rehearsed',
        explanation: 'An index scan jumps to the disk once per matching row. When most rows match, that random access costs more than one sequential pass over the table.',
        misconceptions: [null, 'm_index_always_faster', 'm_index_avoids_io', 'm_optimizer_ignores_indexes'],
        beliefs: [null, 'Believes an index scan is always faster', 'Believes an index removes the need to read pages', 'Believes the optimizer ignores indexes on big tables'],
      }),
  },
};

/* ------------------------------------------------------------------ authored sets for topics with no earlier bank */

type Row = [1 | 2 | 3 | 'c', string, string[], number];
const AUTHORED: Record<string, Row[]> = {
  db_fundamentals: [
    [1, 'Which problem does a DBMS solve compared with keeping data in plain files?', ['It reduces redundancy and inconsistency while allowing controlled concurrent access', 'It makes data smaller on disk', 'It removes the need for backups', 'It guarantees every query is faster'], 0],
    [1, 'The three levels of data abstraction are:', ['Physical, logical and view', 'Input, process and output', 'Table, row and column', 'Client, server and network'], 0],
    [2, 'Changing how a table is stored on disk without changing application queries demonstrates:', ['Physical data independence', 'Logical data independence', 'Referential integrity', 'Normalization'], 0],
    [2, 'Which of these is a data model?', ['Entity-relationship model', 'TCP/IP model', 'Waterfall model', 'OSI model'], 0],
    [3, 'A new column is added to a table and existing application queries keep working unchanged. Which property is this?', ['Logical data independence', 'Physical data independence', 'Transaction isolation', 'Referential integrity'], 0],
    ['c', 'Which statement about schema and instance is correct?', ['The schema is the design and changes rarely; the instance is the data at a moment and changes often', 'The schema changes every time a row is inserted', 'The instance describes column types', 'They are the same thing'], 0],
  ],
  advanced_sql: [
    [1, 'A trigger is:', ['A routine that fires automatically on an event such as INSERT or UPDATE', 'A query run manually each night', 'A type of index', 'A backup command'], 0],
    [1, 'Embedded SQL means:', ['SQL statements written inside a host programming language', 'SQL stored inside an index', 'A SQL dialect for hardware', 'SQL that cannot use variables'], 0],
    [2, 'Which is a typical use of a trigger?', ['Writing an audit row automatically when a salary changes', 'Sorting a result set', 'Defining a primary key', 'Creating a user account'], 0],
    [2, 'In a BEFORE INSERT trigger you can:', ['Modify or reject the new row before it is stored', 'Only read data after it is stored', 'Drop the table', 'Skip constraint checks permanently'], 0],
    [3, 'A trigger on table A updates table B and a trigger on B updates A. The main risk is:', ['Infinite trigger recursion', 'Faster queries', 'Loss of primary keys', 'Automatic normalization'], 0],
    ['c', 'How does a cursor in embedded SQL differ from a plain SELECT run in a console?', ['It lets the host program fetch result rows one at a time', 'It stores rows permanently', 'It removes the WHERE clause', 'It only works for updates'], 0],
  ],
  relational_algebra_calculus: [
    [1, 'In relational algebra, selection (sigma) chooses:', ['Rows that satisfy a condition', 'Columns', 'Whole tables', 'Keys'], 0],
    [1, 'Projection (pi) returns:', ['Only the listed columns, removing duplicates', 'Only the listed rows', 'The cross product', 'The union of two tables'], 0],
    [2, 'R has 10 rows and S has 4 rows. With no join condition, R x S has how many rows?', ['40', '14', '10', '4'], 0],
    [2, 'Which operations require union-compatible relations?', ['Union, intersection and difference', 'Selection and projection', 'Cross product', 'Rename'], 0],
    [3, 'Tuple relational calculus differs from relational algebra mainly because it:', ['Is declarative: it says what to retrieve, not the steps', 'Cannot express joins', 'Handles only one table', 'Uses indexes explicitly'], 0],
    ['c', 'Selecting on age after projecting only name fails, but selecting first and then projecting works. Why?', ['After projecting only name, age no longer exists to select on', 'Selection can never follow projection', 'Projection removes rows', 'age is a key'], 0],
  ],
  er_model: [
    [1, 'In an ER diagram a rectangle represents:', ['An entity set', 'A relationship', 'An attribute', 'A key'], 0],
    [1, 'A weak entity set:', ['Has no primary key of its own and depends on an owner entity', 'Has no attributes', 'Has no relationships', 'Is always optional'], 0],
    [2, 'A student can enrol in many courses and a course has many students. The cardinality is:', ['Many-to-many', 'One-to-one', 'One-to-many', 'Many-to-one'], 0],
    [2, 'Converting a many-to-many relationship into tables normally needs:', ['A separate table holding the keys of both entities', 'Merging the entities into one table', 'Nothing extra', 'A trigger'], 0],
    [3, 'The relationship between Student and Course has its own attribute, grade. Where does grade go in the relational schema?', ['In the relationship table keyed by student and course', 'In the Student table', 'In the Course table', 'It is dropped'], 0],
    ['c', 'Total participation of Employee in WorksIn means:', ['Every employee must be related to at least one department', 'Every department has employees', 'Employees are optional in WorksIn', 'The relationship has no attributes'], 0],
  ],
  functional_dependencies: [
    [1, 'X -> Y means:', ['Equal X values always come with equal Y values', 'Equal Y values imply equal X values', 'X and Y are both keys', 'Y is a subset of X'], 0],
    [1, "Armstrong's axioms are:", ['Reflexivity, augmentation and transitivity', 'Selection, projection and join', 'Atomicity and isolation', 'Insert and delete'], 0],
    [2, 'Given A -> B and B -> C, which also holds?', ['A -> C', 'C -> A', 'B -> A', 'C -> B'], 0],
    [2, 'The closure of {A} under A -> B and B -> C is:', ['{A, B, C}', '{A}', '{A, B}', '{B, C}'], 0],
    [3, 'A decomposition of R into R1 and R2 is lossless when the common attributes:', ['Form a key of R1 or of R2', 'Are empty', 'Are non-key in both', 'Contain NULLs'], 0],
    ['c', 'R(A,B,C) has only A -> B. Is A a candidate key of R?', ['No, because A does not determine C', 'Yes, because A determines B', 'Yes, every determinant is a key', 'Only if B is unique'], 0],
  ],
  deadlock_recovery: [
    [1, 'Which of these is NOT a necessary condition for deadlock?', ['Preemption of held resources', 'Mutual exclusion', 'Hold and wait', 'Circular wait'], 0],
    [1, 'ARIES recovery uses the phases:', ['Analysis, redo and undo', 'Parse, plan and execute', 'Read, write and commit', 'Lock, unlock and release'], 0],
    [2, 'A wait-for graph with a cycle over single-instance resources means:', ['A deadlock exists', 'There is no deadlock', 'The schedule is serial', 'A transaction has committed'], 0],
    [2, 'Write-ahead logging requires that:', ['Log records reach stable storage before the changed data pages', 'Data pages are written before the log', 'The log is optional', 'Only commits are logged'], 0],
    [3, 'After a crash, a transaction had committed but its data pages were not flushed. Recovery must:', ['Redo its changes from the log', 'Undo it', 'Ignore it', 'Restart it from scratch'], 0],
    ['c', 'Deadlock prevention differs from deadlock detection because prevention:', ['Breaks a necessary condition so deadlock cannot occur, while detection lets it occur and then resolves it', 'Waits for a deadlock and aborts a victim', 'Only works after a crash', 'Uses checkpoints'], 0],
  ],
  distributed_nosql: [
    [1, 'The CAP theorem says a distributed store cannot guarantee all three of:', ['Consistency, availability and partition tolerance', 'Cost, atomicity and performance', 'Concurrency, atomicity and persistence', 'Caching, aggregation and pruning'], 0],
    [1, 'MongoDB stores data as:', ['JSON-like (BSON) documents', 'Fixed-width rows only', 'Key pairs in a single file', 'Graphs of edges only'], 0],
    [2, 'During a network partition a system keeps answering reads and writes, possibly with stale data. It favours:', ['Availability over consistency', 'Consistency over availability', 'Neither', 'Durability only'], 0],
    [2, 'Horizontal fragmentation splits a table by:', ['Rows', 'Columns', 'Keys only', 'Indexes'], 0],
    [3, 'A shopping cart must accept updates during outages and can merge conflicts later. A good fit is:', ['An AP-style key-value or document store', 'A single-node relational database with strict locking', 'A CP-only system that rejects writes during a partition', 'A read-only replica'], 0],
    ['c', 'Replication in a distributed database mainly improves:', ['Availability and read performance, at the cost of keeping copies consistent', 'Nothing but storage', 'Query syntax', 'Normalization'], 0],
  ],
};

/* ------------------------------------------------------------------ earlier hand-written bank, mapped onto the 14 topics */

const LEGACY: Record<string, string[]> = {
  relational_model: ['relmodel', 'keys'],
  sql_fundamentals: ['joins'],
  normalization: ['norm'],
  transactions_acid: ['acid'],
  concurrency_control: ['cc'],
  storage_indexing: ['index'],
  query_optimization: ['qopt'],
};

function legacyPool(nodeId: string): Question[] {
  const out: Question[] = [];
  for (const prefix of LEGACY[nodeId] ?? []) {
    const own = [...DEMO_QUESTIONS, ...DEMO_SUB_QUESTIONS].filter((q) => q.nodeId === prefix || q.nodeId.startsWith(prefix + '.'));
    let d = 0;
    let s = 0;
    for (const q of own) {
      const isSub = q.nodeId.includes('.');
      const level: 1 | 2 | 3 = q.kind === 'contrast' ? 3 : q.kind === 'diagnostic' ? (d++ === 0 ? 1 : 2) : isSub ? (s++ % 2 === 0 ? 2 : 3) : 2;
      out.push({ ...q, id: `backup-${q.id}`, nodeId, level, role: q.kind === 'contrast' ? 'discriminating' : undefined, source: 'backup' });
    }
  }
  return out;
}

function pool(nodeId: string): Question[] {
  const rows = AUTHORED[nodeId];
  if (rows) {
    return rows.map(([lv, text, opts, c], i) =>
      lv === 'c'
        ? mk(nodeId, `backup-${nodeId}-${i}`, 'contrast', 3, text, opts, c, { role: 'discriminating' })
        : mk(nodeId, `backup-${nodeId}-${i}`, lv === 1 ? 'diagnostic' : 'probe', lv, text, opts, c),
    );
  }
  return legacyPool(nodeId);
}

const POOLS: Record<string, Question[]> = Object.fromEntries(DBMS_GRAPH.nodes.map((n) => [n.id, pool(n.id)]));

/** Two questions for the root diagnostic: one recall, one application. */
export function backupDiagnostic(nodeId: string): Question[] {
  const p = (POOLS[nodeId] ?? []).filter((q) => q.kind !== 'contrast');
  const l1 = p.find((q) => q.level === 1) ?? p[0];
  const l2 = p.find((q) => q !== l1 && q.level === 2) ?? p.find((q) => q !== l1);
  return [l1, l2].filter((q): q is Question => !!q).map((q, i) => ({ ...q, kind: 'diagnostic', level: (i === 0 ? 1 : 2) as 1 | 2 }));
}

/** Up to six questions of mixed level, then the contrast question(s) last. */
export function backupDeep(nodeId: string): Question[] {
  const p = POOLS[nodeId] ?? [];
  const body = p.filter((q) => q.kind !== 'contrast');
  const picked = [1, 2, 3].flatMap((lv) => body.filter((q) => q.level === lv).slice(0, 2)).slice(0, 6);
  const trig = (TRIGGER_NODES as readonly string[]).includes(nodeId) ? REHEARSED[nodeId] : undefined;
  const tail = trig ? [trig.control, trig.discriminating] : p.filter((q) => q.kind === 'contrast').slice(0, 1);
  return [...picked, ...tail];
}
