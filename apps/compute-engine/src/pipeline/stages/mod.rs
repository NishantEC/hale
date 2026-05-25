//! Concrete pipeline stages. Each stage wraps an algorithm from
//! `crate::math::*` and the DB write semantics that owns its output
//! table. Week-1 ships the module with no registered stages — Week-2
//! will plug in `sleep_detect`.
