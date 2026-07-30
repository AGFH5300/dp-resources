# Exam-Mate production import operation

This temporary operations branch executes the reviewed Exam-Mate import without committing source questions, audit archives, binary assets, credentials, or private permission correspondence.

The job must remain isolated to this exact same-repository branch. It will first export the importer source for independent offline validation. Subsequent commits may add the guarded private staging, dry-run, production import, security checks, and cleanup steps. The branch is not intended to merge into `main`.
