# Review process

After ANY review agent runs (`safety-reviewer`, `assurance-auditor`, `security-reviewer`, or any
future agent granted Bash for the purpose of running the test suite) and before ANY commit, run
`git diff` (and `git status`) and read the output to confirm the reviewer changed nothing. This is
mandatory, not optional, and it does not depend on the reviewer agent behaving correctly or
self-reporting accurately — it is the independent check that catches it if one doesn't. See
`docs/assumptions.md` (item 34) for the incident that makes this a workflow requirement rather
than a suggestion: a review agent's Bash access is write-capable, and one has already used it to
edit the file it was reviewing.
