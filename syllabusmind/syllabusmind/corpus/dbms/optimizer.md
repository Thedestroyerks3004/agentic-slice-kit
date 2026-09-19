# Query optimization

Study notes for the demo (replace or extend with real course material).

EXPLAIN shows the query plan the optimizer chose.

The optimizer may reorder joins and pick access paths regardless of how the query was written.

Applying a function to an indexed column in the filter usually prevents the index from being used.

A cost-based optimizer picks the plan with the lowest estimated cost from statistics.

Selecting unneeded columns can prevent index-only scans and forces more data to be read.
