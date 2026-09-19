# Transactions & ACID

Study notes for the demo (replace or extend with real course material).

Atomicity means a transaction happens completely or not at all.

Durability means committed changes survive a crash.

Isolation keeps the partial work of one transaction invisible to concurrent transactions.

If a transaction fails midway, atomicity requires rolling back its partial changes.

Statements inside an explicit transaction commit together, and a rollback undoes them all.
