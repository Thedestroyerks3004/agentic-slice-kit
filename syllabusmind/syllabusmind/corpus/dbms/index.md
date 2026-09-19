# Indexing

Study notes for the demo (replace or extend with real course material).

An index speeds up lookups on the indexed column but slows inserts and updates.

A B+ tree index supports range queries while a hash index supports only equality.

A composite index is used from its leftmost column, so a filter on only the second column cannot use it well.

An index helps most when the column is selective, meaning the filter matches few rows.
