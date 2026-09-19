# Concurrency & deadlocks

Study notes for the demo (replace or extend with real course material).

A deadlock appears as a cycle in the wait-for graph of transactions.

A conflict-serializable schedule is equivalent to some serial schedule, so it is correct.

Strict two-phase locking gives serializable schedules without cascading aborts but does not prevent deadlock.

With several instances per resource, a cycle in the graph is necessary for deadlock but not sufficient.
