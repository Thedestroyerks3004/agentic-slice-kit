import type { ConceptNode, Question } from '../engine/types';

/** Curated sub-topics for the demo syllabus. Each has two probe questions, options rotated so A is not always right. */
const SUBS: Record<string, { key: string; label: string; description: string; qs: [string, string[], number][] }[]> = {
  relmodel: [
    { key: 'tuples', label: 'Tuples and relations', description: 'Rows as tuples, relations as sets.', qs: [
      ['Which of these is a tuple in Student(id, name)?', ['One row such as (7, "Asha")', 'The column name', 'The table name', 'A foreign key'], 0],
      ['Two rows identical in every attribute are inserted. In the pure relational model:', ['Both are stored', 'They are one tuple, so the relation holds one', 'An error is always raised', 'The second overwrites the key'], 1]] },
    { key: 'schema', label: 'Schema vs instance', description: 'What is fixed and what changes.', qs: [
      ['A relation schema is:', ['The current rows', 'The name and attributes with domains', 'The set of indexes', 'A stored procedure'], 1],
      ['Which changes most often over time?', ['Schema', 'Instance', 'Domain definition', 'Attribute names'], 1]] },
    { key: 'nulls', label: 'NULL and domains', description: 'Missing values and permitted values.', qs: [
      ['NULL in a column means:', ['Zero', 'Empty string', 'Unknown or inapplicable value', 'An error'], 2],
      ['Comparing a value with NULL using = yields:', ['TRUE', 'FALSE', 'UNKNOWN', 'An error'], 2]] },
  ],
  keys: [
    { key: 'superkeys', label: 'Superkeys and candidate keys', description: 'Uniqueness and minimality.', qs: [
      ['Every candidate key is also a:', ['Superkey', 'Foreign key', 'Index', 'View'], 0],
      ['R(A,B) with A unique. Which is a superkey but NOT a candidate key?', ['A', '(A,B)', 'B', 'None of them'], 1]] },
    { key: 'fk', label: 'Foreign keys and integrity', description: 'Referential integrity rules.', qs: [
      ['Deleting a referenced parent row with ON DELETE CASCADE will:', ['Fail', 'Delete the child rows too', 'Do nothing', 'Only warn'], 1],
      ['A foreign key column may hold NULL when:', ['Never', 'The relationship is optional', 'It is also the primary key', 'The parent table is empty'], 1]] },
    { key: 'pk', label: 'Primary key rules', description: 'What a primary key must satisfy.', qs: [
      ['A primary key column cannot be:', ['An integer', 'NULL', 'Indexed', 'Auto-generated'], 1],
      ['A composite primary key (a, b) means:', ['a and b are each unique', 'The pair (a, b) is unique', 'Only a is unique', 'a or b may be NULL'], 1]] },
  ],
  joins: [
    { key: 'inner', label: 'Inner join', description: 'Matching rows only.', qs: [
      ['INNER JOIN returns:', ['All rows of both tables', 'Only rows with matching join values', 'Only unmatched rows', 'Always the cross product'], 1],
      ['A(1,2,2) INNER JOIN B(2,3) on equal value returns how many rows?', ['1', '2', '3', '5'], 1]] },
    { key: 'outer', label: 'Outer joins', description: 'Keeping unmatched rows.', qs: [
      ['RIGHT JOIN keeps every row of:', ['The left table', 'The right table', 'Both tables', 'Neither'], 1],
      ['After a LEFT JOIN, WHERE b.x = 5 on the right table effectively:', ['Keeps unmatched left rows', 'Turns it into an inner join', 'Raises an error', 'Adds rows'], 1]] },
    { key: 'selfcross', label: 'Self and cross joins', description: 'Joining a table with itself; products.', qs: [
      ['A self join is used to:', ['Join a table with itself using aliases', 'Join without a condition', 'Copy a table', 'Delete duplicates'], 0],
      ['CROSS JOIN of 3 rows and 4 rows gives:', ['7 rows', '12 rows', '4 rows', '3 rows'], 1]] },
  ],
  norm: [
    { key: 'fd', label: 'Functional dependencies', description: 'Determinants and closure.', qs: [
      ['If A -> B and B -> C then:', ['A -> C', 'C -> A', 'B -> A', 'Nothing follows'], 0],
      ['The attribute closure of A is:', ['All attributes determined by A', 'All keys', 'Attributes not in A', 'Only B'], 0]] },
    { key: 'nf', label: 'First to third normal form', description: '1NF, 2NF, 3NF.', qs: [
      ['1NF requires:', ['Atomic single-valued attributes', 'No partial dependency', 'No transitive dependency', 'A single key'], 0],
      ['3NF removes:', ['Transitive dependencies of non-key attributes on the key', 'Repeating groups', 'Foreign keys', 'NULLs'], 0]] },
    { key: 'bcnf', label: 'BCNF and trade-offs', description: 'Stricter form and its cost.', qs: [
      ['BCNF requires every determinant to be:', ['A superkey', 'A foreign key', 'An index', 'Atomic'], 0],
      ['A downside of over-normalizing is:', ['More joins at query time', 'More redundancy', 'More update anomalies', 'One huge table'], 0]] },
  ],
  acid: [
    { key: 'atom', label: 'Atomicity and recovery', description: 'All or nothing.', qs: [
      ['Rollback restores:', ['The state before the transaction started', 'The last backup', 'The schema', 'Nothing'], 0],
      ['Which structure records changes so they can be undone or redone?', ['The log', 'The index', 'The view', 'The trigger'], 0]] },
    { key: 'iso', label: 'Isolation levels', description: 'Anomalies each level allows.', qs: [
      ['READ UNCOMMITTED allows:', ['Dirty reads', 'No anomalies at all', 'Only deadlocks', 'Only NULL reads'], 0],
      ['SERIALIZABLE guarantees results equal to:', ['Some serial execution order', 'Parallel execution', 'Random order', 'Latest write wins'], 0]] },
    { key: 'dur', label: 'Durability and commit', description: 'Surviving crashes.', qs: [
      ['After COMMIT returns, the change:', ['Survives a crash', 'May be lost', 'Is visible only to you', 'Is undone at restart'], 0],
      ['Write-ahead logging means:', ['Log records reach disk before data pages', 'Data pages are written first', 'No log is needed', 'The log is used only on rollback'], 0]] },
  ],
  cc: [
    { key: 'lock', label: 'Locking and 2PL', description: 'Two-phase locking.', qs: [
      ['In 2PL, after releasing its first lock a transaction:', ['May not acquire new locks', 'May acquire any lock', 'Must commit', 'Must restart'], 0],
      ['Strict 2PL holds exclusive locks until:', ['Commit or abort', 'The next read', 'The query ends', 'Never'], 0]] },
    { key: 'dead', label: 'Deadlocks', description: 'Detection and resolution.', qs: [
      ['A common way to resolve a deadlock is to:', ['Abort a victim transaction', 'Add an index', 'Normalize the schema', 'Ignore it'], 0],
      ['A cycle in a single-instance wait-for graph indicates:', ['A deadlock', 'A serializable schedule', 'A commit', 'An idle system'], 0]] },
    { key: 'mvcc', label: 'MVCC and timestamps', description: 'Snapshots and ordering.', qs: [
      ['MVCC lets readers:', ['Read a snapshot without blocking writers', 'Block every writer', 'Skip commits', 'Write freely'], 0],
      ['In timestamp ordering, a write that conflicts with a younger transaction\'s read:', ['Aborts and restarts the writer', 'Is always allowed', 'Causes a deadlock', 'Is queued forever'], 0]] },
  ],
  index: [
    { key: 'btree', label: 'B+ trees', description: 'The default ordered index.', qs: [
      ['B+ tree leaves are:', ['Linked to support range scans', 'Unordered', 'Hashed', 'Kept only in memory'], 0],
      ['A B+ tree\'s height grows:', ['Logarithmically with row count', 'Linearly', 'Quadratically', 'Never'], 0]] },
    { key: 'hash', label: 'Hash indexes', description: 'Equality lookups.', qs: [
      ['A hash index is best for:', ['Equality lookups', 'Range scans', 'Sorting', 'Prefix search'], 0],
      ['Hash collisions are handled by:', ['Buckets or chaining', 'Deleting rows', 'Range splits', 'Re-sorting the table'], 0]] },
    { key: 'cover', label: 'Clustering and covering', description: 'Where the data lives.', qs: [
      ['A covering index lets a query:', ['Be answered from the index alone', 'Skip the WHERE clause', 'Avoid all locks', 'Update faster'], 0],
      ['How many clustered indexes can a table have?', ['One', 'Many', 'Zero', 'Two'], 0]] },
  ],
  qopt: [
    { key: 'cost', label: 'Cost and statistics', description: 'How plans are priced.', qs: [
      ['Cardinality estimation relies on:', ['Table statistics and histograms', 'Column names', 'Row order', 'Comments'], 0],
      ['A far-too-low row estimate can cause:', ['Nested loops over a huge input', 'Always faster plans', 'A syntax error', 'Index loss'], 0]] },
    { key: 'joinalg', label: 'Join algorithms', description: 'Nested loop, hash, sort-merge.', qs: [
      ['A hash join is usually good when:', ['Inputs are large and unsorted with an equality join', 'Tables are tiny only', 'The join is an inequality', 'An index is mandatory'], 0],
      ['Sort-merge join needs:', ['Inputs sorted on the join key', 'A hash table', 'No ordering', 'A cross product'], 0]] },
    { key: 'rewrite', label: 'Rewrites and plans', description: 'Pushdown and EXPLAIN.', qs: [
      ['Pushing projections down reduces:', ['The width of intermediate tuples', 'The number of tables', 'The answer size', 'Locking'], 0],
      ['EXPLAIN shows:', ['The chosen execution plan', 'The table data', 'The schema only', 'The users'], 0]] },
  ],
};

export const DEMO_SUBTOPICS = (parent: ConceptNode): ConceptNode[] =>
  (SUBS[parent.id] ?? []).map((s) => ({ id: `${parent.id}.${s.key}`, label: s.label, unit: parent.unit, description: s.description, parentId: parent.id }));

let n = 0;
export const DEMO_SUB_QUESTIONS: Question[] = Object.entries(SUBS).flatMap(([parent, subs]) =>
  subs.flatMap((s) =>
    s.qs.map(([text, opts, correct]) => {
      const rot = n++ % 4; // rotate so the right answer is not always option A
      const options = opts.map((_, i) => opts[(i - rot + 4) % 4]);
      return { id: `demo-${parent}.${s.key}-${n}`, nodeId: `${parent}.${s.key}`, kind: 'probe' as const, text, options, correctIndex: (correct + rot) % 4, level: 2 as const };
    }),
  ),
);
