import type { Question, QuestionKind } from '../engine/types';

let n = 0;
const q = (nodeId: string, kind: QuestionKind, text: string, options: string[], correctIndex: number): Question => ({
  id: `demo-${nodeId}-${kind}-${++n}`,
  nodeId,
  kind,
  text,
  options,
  correctIndex,
});

/** Curated bank: 2 diagnostic + 2 probe + 1 contrast question per node. Answer keys are stored here. */
export const DEMO_QUESTIONS: Question[] = [
  q('relmodel', 'diagnostic', 'In the relational model, a relation is best described as:', ['An ordered list of records', 'A set of tuples over a fixed set of attributes', 'A pointer graph between tables', 'A file sorted by primary key'], 1),
  q('relmodel', 'diagnostic', 'Which property holds for tuples of a relation?', ['Duplicates are allowed and ordered', 'They are unordered and distinct', 'They must be sorted by first attribute', 'They may have different attribute counts'], 1),
  q('relmodel', 'probe', 'The degree of a relation is:', ['Number of tuples', 'Number of attributes', 'Number of keys', 'Number of foreign keys'], 1),
  q('relmodel', 'probe', 'A domain in the relational model is:', ['A set of permitted atomic values for an attribute', 'A database server', 'A table alias', 'A view definition'], 0),
  q('relmodel', 'contrast', 'A table has 4 columns and 100 rows. Adding 20 rows changes its:', ['Degree from 4 to 24', 'Cardinality from 100 to 120', 'Degree from 100 to 120', 'Nothing'], 1),

  q('keys', 'diagnostic', 'A candidate key is:', ['Any column with unique values today', 'A minimal set of attributes that uniquely identifies tuples', 'The first column of a table', 'A key that references another table'], 1),
  q('keys', 'diagnostic', 'A foreign key constraint guarantees:', ['Values are unique', 'Referenced values exist in the parent relation (or are NULL)', 'The column is indexed', 'The column is never NULL'], 1),
  q('keys', 'probe', 'Which can be a primary key?', ['A candidate key chosen as the main identifier', 'Any foreign key', 'A column allowing NULLs', 'Any two columns'], 0),
  q('keys', 'probe', 'How many primary keys can a table have?', ['One', 'One per column', 'Unlimited', 'Two'], 0),
  q('keys', 'contrast', 'Table Emp(id, email, name) where id and email are both unique. Which statement is correct?', ['Only id is a candidate key', 'Both id and email are candidate keys', 'email is a foreign key', 'Neither can be a key'], 1),

  q('joins', 'diagnostic', 'A LEFT OUTER JOIN returns:', ['Only matching rows', 'All rows from the left table plus matches, NULL-filling unmatched right side', 'All rows from both tables', 'Only unmatched rows'], 1),
  q('joins', 'diagnostic', 'A join with no join condition between tables of m and n rows returns:', ['m + n rows', 'm x n rows', 'max(m, n) rows', 'Zero rows'], 1),
  q('joins', 'probe', 'Which join keeps unmatched rows from both sides?', ['INNER', 'LEFT', 'FULL OUTER', 'CROSS'], 2),
  q('joins', 'probe', 'In INNER JOIN, rows with NULL in the join column:', ['Match other NULLs', 'Are dropped, since NULL = NULL is not true', 'Are kept with defaults', 'Cause an error'], 1),
  q('joins', 'contrast', 'A(1,2,3) LEFT JOIN B(2,3,4) on equal value returns how many rows?', ['2', '3', '4', '6'], 1),

  q('norm', 'diagnostic', 'A relation is in 2NF if it is in 1NF and:', ['Has no partial dependency of a non-key attribute on part of a composite key', 'Has no transitive dependency', 'Has only one key', 'Has no NULLs'], 0),
  q('norm', 'diagnostic', 'The main purpose of normalization is to:', ['Speed up every query', 'Reduce redundancy and update anomalies', 'Encrypt data', 'Increase table count'], 1),
  q('norm', 'probe', 'X -> Y holds when:', ['Equal X values imply equal Y values', 'Equal Y values imply equal X values', 'X and Y are keys', 'X is a subset of Y'], 0),
  q('norm', 'probe', 'A transitive dependency is:', ['A -> B and B -> C giving A -> C with B a non-key', 'A key depending on a key', 'Two tables sharing a key', 'A multi-valued attribute'], 0),
  q('norm', 'contrast', 'R(StudentID, CourseID, StudentName) with key (StudentID, CourseID). StudentName depends only on StudentID. R violates:', ['1NF', '2NF', 'BCNF only', 'Nothing'], 1),

  q('acid', 'diagnostic', 'Atomicity means:', ['Transactions run one at a time', 'A transaction is all-or-nothing', 'Committed data survives crashes', 'Data satisfies constraints'], 1),
  q('acid', 'diagnostic', 'Durability is typically ensured by:', ['Write-ahead logging', 'Two-phase locking', 'Normalization', 'Indexing'], 0),
  q('acid', 'probe', 'A crash happens after COMMIT but before data pages are flushed. Recovery should:', ['Discard the transaction', 'Redo it from the log', 'Ignore it', 'Ask the user'], 1),
  q('acid', 'probe', 'Consistency in ACID refers to:', ['Moving the database between valid states w.r.t. constraints', 'All replicas being identical', 'Serial execution', 'Faster reads'], 0),
  q('acid', 'contrast', 'Transfer 100 from A to B fails after debiting A. Which property demands the debit be undone?', ['Isolation', 'Durability', 'Atomicity', 'Indexing'], 2),

  q('cc', 'diagnostic', 'Two-phase locking guarantees:', ['Deadlock freedom', 'Conflict serializability', 'Faster commits', 'No aborts'], 1),
  q('cc', 'diagnostic', 'A deadlock requires, among others, the condition:', ['Circular wait', 'Read-only transactions', 'Optimistic validation', 'Timestamps'], 0),
  q('cc', 'probe', 'A dirty read occurs when a transaction reads:', ['Committed data', 'Uncommitted data of another transaction', 'Its own writes', 'Indexed data'], 1),
  q('cc', 'probe', 'A shared (S) lock and an exclusive (X) lock on the same item, held by different transactions:', ['Are compatible', 'Conflict', 'Merge', 'Only conflict for reads'], 1),
  q('cc', 'contrast', 'T1 holds X(A) and waits for B. T2 holds X(B) and waits for A. This is:', ['A dirty read', 'A deadlock', 'A phantom', 'Normal blocking that resolves itself'], 1),

  q('index', 'diagnostic', 'A B+ tree index is well suited for:', ['Range queries and equality lookups', 'Only full scans', 'Only text search', 'Nothing but inserts'], 0),
  q('index', 'diagnostic', 'A hash index cannot efficiently support:', ['Equality lookups', 'Range queries', 'Point lookups', 'Unique constraints'], 1),
  q('index', 'probe', 'A downside of adding many indexes is:', ['Slower reads', 'Slower writes and more storage', 'Loss of keys', 'Incorrect results'], 1),
  q('index', 'probe', 'A clustered index determines:', ['The physical ordering of the table rows', 'The number of tables', 'The foreign keys', 'The query plan cost model'], 0),
  q('index', 'contrast', 'WHERE last_name LIKE \'%son\' on an index over last_name. Will a B+ tree help?', ['Yes, fully', 'No, a leading wildcard prevents prefix range use', 'Only for updates', 'Only if clustered'], 1),

  q('qopt', 'diagnostic', 'A cost-based optimizer chooses plans using:', ['Statistics and cost estimates', 'Query text length', 'Table creation date', 'Random choice'], 0),
  q('qopt', 'diagnostic', 'Pushing selections down before a join usually:', ['Increases intermediate results', 'Reduces intermediate result size', 'Changes the query answer', 'Removes the need for indexes'], 1),
  q('qopt', 'probe', 'Join ordering matters because:', ['Different orders can have very different intermediate sizes', 'It changes the result set', 'Joins are not associative in results', 'It only affects syntax'], 0),
  q('qopt', 'probe', 'Stale statistics typically lead to:', ['Bad cardinality estimates and poor plans', 'Syntax errors', 'Data loss', 'Faster plans'], 0),
  q('qopt', 'contrast', 'A selective filter on a big table with a matching index, versus a full scan. The optimizer should usually prefer:', ['Full scan always', 'Index access when the filter is selective', 'Cross join', 'Sorting first'], 1),
];

