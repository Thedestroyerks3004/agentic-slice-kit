# Normalization

Study notes for the demo (replace or extend with real course material).

2NF removes partial dependencies of non-key attributes on part of a composite key.

A deletion anomaly means removing one fact also removes another, unrelated fact.

BCNF is stricter than 3NF: every determinant must be a candidate key.

A transitive dependency of a non-key attribute breaks 3NF, leaving the relation in 2NF.

Extra decomposition beyond need adds joins, so normalization trades write safety against read cost.
