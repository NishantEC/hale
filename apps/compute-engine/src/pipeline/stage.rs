//! The PipelineStage trait + StageRegistry. Each stage declares its
//! dependencies + per-day context window and implements `run` against
//! a `DayContext`. The conductor in `worker.rs` walks the registry in
//! dependency order, fingerprint-skips unchanged `(user, day, stage)`,
//! and writes outputs transactionally.

use anyhow::Result;
use sqlx::{PgPool, Postgres, Transaction};

use super::types::{StageInput, StageName, StageOutcome};

/// One unit of pipeline work for one calendar day. Implementors stay
/// pure functions over `DayContext` + write their output table inside
/// the provided transaction. The conductor handles ledger I/O.
pub trait PipelineStage: Send + Sync {
    fn name(&self) -> StageName;

    /// Other stages whose `outputRevision` is folded into this stage's
    /// input fingerprint. An empty slice means "raw inputs only".
    fn dependencies(&self) -> &'static [StageName] {
        &[]
    }

    /// How many days of padding around the target day this stage needs.
    /// Sleep-detect crosses midnight, so its context window pads by 1d
    /// on each side. Most metrics stages will return zero.
    fn padding_days(&self) -> i64 {
        0
    }

    fn run<'a>(
        &'a self,
        tx: &'a mut Transaction<'_, Postgres>,
        input: StageInput<'a>,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<StageOutcome>> + Send + 'a>>;
}

pub struct StageRegistry {
    stages: Vec<Box<dyn PipelineStage>>,
}

impl StageRegistry {
    pub fn new() -> Self {
        Self { stages: Vec::new() }
    }

    pub fn register(mut self, stage: Box<dyn PipelineStage>) -> Self {
        self.stages.push(stage);
        self
    }

    pub fn ordered(&self) -> impl Iterator<Item = &dyn PipelineStage> {
        self.stages.iter().map(|s| s.as_ref())
    }

    pub fn get(&self, name: StageName) -> Option<&dyn PipelineStage> {
        self.stages
            .iter()
            .map(|s| s.as_ref())
            .find(|s| s.name() == name)
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

/// Smoke-test helper: returns a registry seeded with whatever stages
/// the worker should run today. Week-1 returns an empty registry — the
/// worker still uses its legacy path. Week-2 will plug in sleep_detect.
pub fn default_registry() -> StageRegistry {
    StageRegistry::new()
}

/// Returns the dirty-day × stage planning order. For Week 1 this is a
/// stable sort by (day, dependency order). Multi-stage runs in Week 2+
/// will respect dependency edges.
pub fn topological_days(
    plan: Vec<(chrono::NaiveDate, StageName)>,
) -> Vec<(chrono::NaiveDate, StageName)> {
    let mut sorted = plan;
    sorted.sort_by(|a, b| {
        a.0.cmp(&b.0)
            .then_with(|| stage_order(a.1).cmp(&stage_order(b.1)))
    });
    sorted
}

fn stage_order(name: StageName) -> u8 {
    match name {
        StageName::SleepDetect => 0,
        StageName::ActivityDetect => 1,
        StageName::SleepStages => 2,
        StageName::NightFeatures => 3,
        StageName::Baseline => 4,
        StageName::DailyScores => 5,
        StageName::DailyMetrics => 6,
    }
}

/// Spawn cross-day rollups after the per-day fan-out. Week 1 is a no-op
/// — added now so Week 4 (baseline) drops in without a worker.rs edit.
pub async fn maybe_run_rollups(_pool: &PgPool, _registry: &StageRegistry) -> Result<()> {
    Ok(())
}
