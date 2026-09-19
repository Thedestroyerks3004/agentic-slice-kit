import type { ConceptGraph } from '../engine/types';

/**
 * The fixed DBMS concept graph, hand-written from the five syllabus units. Frozen: nothing here is
 * extracted or generated. Edge order matters for the radial layout (the first edge into a node names
 * its parent in the tree; later edges only add links).
 */
export const DBMS_GRAPH: ConceptGraph = {
  id: 'dbms-fixed-v1',
  title: 'Database Management Systems',
  nodes: [
    { id: 'db_fundamentals', label: 'DB Fundamentals', unit: 'I', description: 'Purpose of a database system, views of data, data models, DB architecture.' },
    { id: 'relational_model', label: 'Relational Model & Keys', unit: 'I', description: 'Relations, tuples, schemas, superkeys, candidate, primary and foreign keys.' },
    { id: 'sql_fundamentals', label: 'SQL Fundamentals', unit: 'I', description: 'DDL, DML, queries, joins, aggregation, subqueries.' },
    { id: 'advanced_sql', label: 'Advanced SQL & Triggers', unit: 'I', description: 'Triggers, stored routines, embedded SQL, cursors.' },
    { id: 'relational_algebra_calculus', label: 'Relational Algebra & Calculus', unit: 'I', description: 'Selection, projection, joins as algebra; tuple and domain calculus.' },
    { id: 'er_model', label: 'ER Model & Diagrams', unit: 'II', description: 'Entities, relationships, cardinality, weak entities, ER to tables.' },
    { id: 'functional_dependencies', label: 'Functional Dependencies', unit: 'II', description: 'Dependencies, closure, Armstrong axioms, lossless and dependency-preserving decomposition.' },
    { id: 'normalization', label: 'Normalization', unit: 'II', description: '1NF to BCNF, multi-valued dependencies, 4NF and 5NF.' },
    { id: 'transactions_acid', label: 'Transactions & ACID', unit: 'III', description: 'Transaction concepts, ACID properties, isolation levels.' },
    { id: 'concurrency_control', label: 'Concurrency Control', unit: 'III', description: 'Serializability, lock-based and timestamp-based protocols.' },
    { id: 'deadlock_recovery', label: 'Deadlock & Recovery', unit: 'III', description: 'Deadlock handling, failure classification, log-based recovery, ARIES.' },
    { id: 'storage_indexing', label: 'Storage & Indexing', unit: 'IV', description: 'Storage media, RAID, file organization, B+ trees, static and dynamic hashing.' },
    { id: 'query_optimization', label: 'Query Optimization', unit: 'IV', description: 'Query processing, catalog statistics, cost estimation, plan choice.' },
    { id: 'distributed_nosql', label: 'Distributed DBs & NoSQL', unit: 'V', description: 'Fragmentation, replication, CAP theorem, NoSQL store types, MongoDB.' },
  ],
  edges: [
    { from: 'db_fundamentals', to: 'relational_model', weight: 0.9 },
    { from: 'relational_model', to: 'sql_fundamentals', weight: 0.9 },
    { from: 'sql_fundamentals', to: 'advanced_sql', weight: 0.8 },
    { from: 'relational_model', to: 'relational_algebra_calculus', weight: 0.8 },
    { from: 'relational_model', to: 'er_model', weight: 0.6 },
    { from: 'er_model', to: 'functional_dependencies', weight: 0.7 },
    { from: 'functional_dependencies', to: 'normalization', weight: 0.9 },
    { from: 'relational_model', to: 'transactions_acid', weight: 0.5 },
    { from: 'transactions_acid', to: 'concurrency_control', weight: 0.9 },
    { from: 'concurrency_control', to: 'deadlock_recovery', weight: 0.8 },
    { from: 'relational_model', to: 'storage_indexing', weight: 0.5 },
    { from: 'storage_indexing', to: 'query_optimization', weight: 0.8 },
    { from: 'relational_algebra_calculus', to: 'query_optimization', weight: 0.7 },
    { from: 'transactions_acid', to: 'distributed_nosql', weight: 0.6 },
    { from: 'storage_indexing', to: 'distributed_nosql', weight: 0.5 },
  ],
};

/** The nodes whose final contrast pair is pre-written so the rehearsed backward loop never depends on a live call. */
export const TRIGGER_NODES = ['concurrency_control', 'query_optimization'] as const;

export const TRIGGER_HINT =
  'Rehearsed backward loop: answer both Concurrency Control diagnostic questions correctly, press "Go deeper", then answer the last question "Yes, any blocked transaction means deadlock". Query Optimization works the same way.';
