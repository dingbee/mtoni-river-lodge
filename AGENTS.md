# Architecture rules

- Keep housekeeping RPC contracts in a local schema extension derived from existing SQL migrations; generated database files remain untouched and no schema is applied implicitly.
- Legacy website destinations absent from the StayNas router use ordinary anchors; do not recreate retired pages solely to satisfy router typing.
