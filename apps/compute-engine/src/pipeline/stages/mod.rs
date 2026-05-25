//! Concrete pipeline stages. Each stage wraps an algorithm from
//! `crate::math::*` and the DB write semantics that owns its output
//! table. Week-1 shipped the empty module; Week-2 lands sleep_detect.

pub mod activity_detect;
pub mod sleep_detect;
