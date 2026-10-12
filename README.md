# Edgebook — AI mistake tagging: installer (built against ox-test_1.zip)

Use this ONLY if you have edited more files since `ox-test_1.zip`. Otherwise use `ox-test-with-ai-tagging.zip` (the complete merged project).

    unzip edgebook-ai-tagging-v3-installer.zip -d /tmp/tagging
    /tmp/tagging/apply-tagging.sh /path/to/ox-test
    cd /path/to/ox-test && npx tsc --noEmit && npm test

- Merges into YOUR current files (6 small patches) and adds 12 new files. Nothing else is touched.
- tests/run-all.ts: one line is appended; your other lines stay.
- Dry run first. If a patch clashes with something you changed, NOTHING is modified and it names the file.
- Safe to run twice.
