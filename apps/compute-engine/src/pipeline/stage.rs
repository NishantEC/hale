//! Stage trait + registry. Two flavours of stage live in one registry:
//!
//!   - `WindowStage` runs once per pipeline run against a `WindowContext`.
//!     Used by inherently multi-day algorithms (sleep_detect crosses
//!     midnight; regularity looks across 7 nights).
//!   - `DayStage` runs once per dirty day against a `DayContext`. Used
//!     by single-day algorithms (activity_detect, sleep_stages once they
//!     are decomposed, daily_metrics).
//!
//! The conductor in `worker.rs` walks the registry in dependency order,
//! fingerprint-skips unchanged `(user, day, stage)`, and writes outputs
//! transactionally — passing the same `&mut Transaction` to both the
//! stage and the ledger so a stage's data writes + status writes commit
//! atomically.

use anyhow::Result;
use chrono::NaiveDate;
use sqlx::{Postgres, Transaction};
use std::future::Future;
use std::pin::Pin;

use super::context::{DayContext, WindowContext};
use super::types::{StageName, StageOutcome};

pub trait WindowStage: Send + Sync {
    fn name(&self) -> StageName;

    fn dependencies(&self) -> &'static [StageName] {
        &[]
    }

    fn run<'a>(
        &'a self,
        tx: &'a mut Transaction<'_, Postgres>,
        ctx: &'a WindowContext<'a>,
    ) -> Pin<Box<dyn Future<Output = Result<StageOutcome>> + Send + 'a>>;
}

pub trait DayStage: Send + Sync {
    fn name(&self) -> StageName;

    fn dependencies(&self) -> &'static [StageName] {
        &[]
    }

    fn padding_days(&self) -> i64 {
        0
    }

    fn run<'a>(
        &'a self,
        tx: &'a mut Transaction<'_, Postgres>,
        ctx: &'a DayContext,
        day: NaiveDate,
    ) -> Pin<Box<dyn Future<Output = Result<StageOutcome>> + Send + 'a>>;
}

pub enum Stage {
    Window(Box<dyn WindowStage>),
    Day(Box<dyn DayStage>),
}

impl Stage {
    pub fn name(&self) -> StageName {
        match self {
            Stage::Window(s) => s.name(),
            Stage::Day(s) => s.name(),
        }
    }

    pub fn dependencies(&self) -> &'static [StageName] {
        match self {
            Stage::Window(s) => s.dependencies(),
            Stage::Day(s) => s.dependencies(),
        }
    }
}

pub struct StageRegistry {
    stages: Vec<Stage>,
}

impl StageRegistry {
    pub fn new() -> Self {
        Self { stages: Vec::new() }
    }

    pub fn register_window<S: WindowStage + 'static>(mut self, stage: S) -> Self {
        self.stages.push(Stage::Window(Box::new(stage)));
        self
    }

    pub fn register_day<S: DayStage + 'static>(mut self, stage: S) -> Self {
        self.stages.push(Stage::Day(Box::new(stage)));
        self
    }

    pub fn ordered(&self) -> impl Iterator<Item = &Stage> {
        self.stages.iter()
    }

    pub fn is_empty(&self) -> bool {
        self.stages.is_empty()
    }
}

impl Default for StageRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Returns the registry seeded with whatever stages the worker should run
/// today. Week-2 registers sleep_detect; subsequent weeks add the rest.
pub fn default_registry() -> StageRegistry {
    StageRegistry::new()
        .register_window(super::stages::sleep_detect::SleepDetectStage)
        .register_window(super::stages::activity_detect::ActivityDetectStage)
        .register_window(super::stages::sleep_stages::SleepStagesStage)
}
